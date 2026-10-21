import type { WebdaClient } from "./client.js";
import { Emitter } from "./emitter.js";
import { SdkError } from "./errors.js";
import type { SdkModel } from "./model.js";
import type {
  CallOptions,
  ChangeEvent,
  ModelDescriptor,
  PrimaryKeyInput,
  QueryOptions,
  QueryResult,
  QueryTotal
} from "./types.js";

/** A raw object, as the server sends it */
export type RawObject = Record<string, unknown>;

/**
 * Where a `ModelClient` reads and writes its objects: the server through the transports and the cache
 * (`RemoteBackend`), or a local replica (`OfflineBackend` of `@webda/sdk/client/offline`)
 */
export interface ModelBackend {
  get(uid: string, options: CallOptions): Promise<RawObject>;
  query(query: string, options: QueryOptions): Promise<QueryResult<RawObject>>;
  create(data: RawObject, options: CallOptions): Promise<RawObject>;
  update(uid: string, data: RawObject, options: CallOptions): Promise<RawObject>;
  patch(uid: string, data: RawObject, options: CallOptions): Promise<RawObject>;
  delete(uid: string, options: CallOptions): Promise<void>;
}

/** Constructor of a generated model class */
export type SdkModelClass<T extends SdkModel> = new (client: ModelClient<T>, data: any) => T;

/**
 * @param query - a WebdaQL query
 * @param token - the continuation token of the previous page
 * @returns the query of the next page
 */
export function withContinuation(query: string, token: string | undefined): string {
  // No leading whitespace in the pattern: it would backtrack quadratically on long blank runs
  const base = query.replace(/\bOFFSET\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/i, "").trim();
  return token === undefined ? base : `${base} OFFSET "${token.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * Backend over the transports and the `EntityCache`
 */
export class RemoteBackend implements ModelBackend {
  protected inflight = new Map<string, Promise<any>>();

  /**
   * @param client - the client
   * @param descriptor - the model
   */
  constructor(
    protected readonly client: WebdaClient<any>,
    protected readonly descriptor: ModelDescriptor
  ) {}

  /**
   * @param name - operation of the model
   * @returns its id
   * @throws SdkError when the model does not have it
   */
  protected operation(name: "get" | "query" | "create" | "update" | "patch" | "delete"): string {
    const id = this.descriptor.operations[name];
    if (!id) throw new SdkError(0, `Model ${this.descriptor.id} has no ${name} operation`);
    return id;
  }

  /**
   * Share the promise of identical concurrent requests
   * @param key - request key
   * @param run - the request
   * @returns its promise
   */
  protected dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const promise = run().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * @param uid - entity uid
   * @returns the primary key attributes of the uid
   */
  protected pk(uid: string): RawObject {
    return pkFromUid(this.descriptor, uid);
  }

  /**
   * @param data - a raw object
   * @returns its uid
   */
  protected uidOf(data: RawObject): string {
    return uidOf(this.descriptor, data);
  }

  /**
   * Cache an object the server sent: a projection (`select`) only refreshes an entity already cached
   * @param uid - its uid
   * @param data - the object
   * @param projected - only some attributes were fetched
   */
  protected store(uid: string, data: RawObject, projected: boolean): void {
    const { cache } = this.client;
    if (!projected) cache.setEntity(this.descriptor.id, uid, data);
    else if (cache.getEntity(this.descriptor.id, uid)) cache.mergeEntity(this.descriptor.id, uid, data);
  }

  /**
   * @param uid - the uid
   * @param options - call options
   * @returns the raw object, from the cache when fresh
   */
  async get(uid: string, options: CallOptions): Promise<RawObject> {
    const op = this.operation("get");
    const { cache } = this.client;
    const mode = options.cache ?? "default";
    const entry = cache.getEntity(this.descriptor.id, uid);
    const projection = options.select?.length ? options.select.join(",") : undefined;
    const fetch = () =>
      this.dedupe(`get|${uid}|${projection ?? ""}`, async () => {
        const data = (await this.client.call(op, this.pk(uid), options)) as RawObject;
        if (mode !== "no-store") this.store(uid, data, projection !== undefined);
        return data;
      });
    if (entry && mode !== "no-store" && mode !== "reload") {
      if (mode === "force-cache" || cache.isFresh(entry)) return entry.data;
      if (cache.staleWhileRevalidate) {
        fetch().catch(() => {
          // The stale entry was served, the refresh failure is not the caller's
        });
        return entry.data;
      }
    }
    return fetch();
  }

  /**
   * @param query - WebdaQL query
   * @param options - call options; `count` also asks for the total of the query
   * @returns the page, from the cache when fresh and every result is cached
   */
  async query(query: string, options: QueryOptions): Promise<QueryResult<RawObject>> {
    const op = this.operation("query");
    const { cache } = this.client;
    const model = this.descriptor.id;
    const mode = options.cache ?? "default";
    const projection = options.select?.length ? options.select.join(",") : undefined;
    // A next page reuses the total cached with the first page of the same query: the server does not count again
    const first = withContinuation(query, undefined);
    const known =
      options.count && mode !== "no-store" && first !== query.trim() ? cache.getQuery(model, first)?.total : undefined;
    const count = options.count === true && known === undefined;
    /**
     * @param page - the page
     * @param total - the total of the query
     * @returns the page, with its total when there is one
     */
    const withTotal = (page: QueryResult<RawObject>, total: QueryTotal | undefined): QueryResult<RawObject> =>
      options.count && total ? { ...page, total } : page;
    const fetch = () =>
      this.dedupe(`query|${query}|${projection ?? ""}|${count ? "count" : ""}`, async () => {
        const page = ((await this.client.call(op, count ? { query, count } : { query }, options)) ??
          {}) as QueryResult<RawObject>;
        const results = page.results ?? [];
        // The server sends a null total when the model does not allow one
        const total = page.total ?? known;
        if (mode !== "no-store") {
          const uids = results.map(data => {
            const uid = this.uidOf(data);
            this.store(uid, data, projection !== undefined);
            return uid;
          });
          // A projected page holds partial objects: it is not a cached query
          if (projection === undefined) cache.setQuery(model, query, uids, page.continuationToken, total ?? undefined);
        }
        return withTotal({ results, continuationToken: page.continuationToken }, total ?? undefined);
      });
    if (mode !== "no-store" && mode !== "reload") {
      const entry = cache.getQuery(model, query);
      // A cached page without its total does not answer a query asking for it
      if (entry && (!options.count || entry.total !== undefined || known !== undefined)) {
        const total = entry.total ?? known;
        if (mode === "force-cache" || cache.isFresh(entry)) {
          const entities = entry.uids.map(uid => cache.getEntity(model, uid)?.data);
          if (entities.every(data => data !== undefined)) {
            return withTotal({ results: entities as RawObject[], continuationToken: entry.continuationToken }, total);
          }
        } else if (cache.staleWhileRevalidate) {
          const entities = entry.uids.map(uid => cache.getEntity(model, uid)?.data);
          if (entities.every(data => data !== undefined)) {
            fetch().catch(() => {
              // The stale page was served
            });
            return withTotal({ results: entities as RawObject[], continuationToken: entry.continuationToken }, total);
          }
        }
      }
    }
    return fetch();
  }

  /**
   * @param data - the object
   * @param options - call options
   * @returns the created object
   */
  async create(data: RawObject, options: CallOptions): Promise<RawObject> {
    const result = ((await this.client.call(this.operation("create"), data, options)) ?? data) as RawObject;
    this.client.cache.setEntity(this.descriptor.id, this.uidOf(result), result);
    return result;
  }

  /**
   * @param uid - the uid
   * @param data - every attribute
   * @param options - call options
   * @returns the updated object
   */
  async update(uid: string, data: RawObject, options: CallOptions): Promise<RawObject> {
    const input = { ...data, ...this.pk(uid) };
    const result = ((await this.client.call(this.operation("update"), input, options)) ?? input) as RawObject;
    this.client.cache.setEntity(this.descriptor.id, uid, result);
    return result;
  }

  /**
   * @param uid - the uid
   * @param data - some attributes
   * @param options - call options
   * @returns the updated object
   */
  async patch(uid: string, data: RawObject, options: CallOptions): Promise<RawObject> {
    const input = { ...data, ...this.pk(uid) };
    const result = (await this.client.call(this.operation("patch"), input, options)) as RawObject | undefined;
    return this.client.cache.mergeEntity(
      this.descriptor.id,
      uid,
      result && typeof result === "object" && Object.keys(result).length ? result : input
    );
  }

  /**
   * @param uid - the uid
   * @param options - call options
   */
  async delete(uid: string, options: CallOptions): Promise<void> {
    await this.client.call(this.operation("delete"), this.pk(uid), options);
    this.client.cache.deleteEntity(this.descriptor.id, uid);
  }
}

/**
 * @param descriptor - the model
 * @param uid - serialized primary key
 * @returns the primary key attributes
 */
export function pkFromUid(descriptor: ModelDescriptor, uid: string): RawObject {
  const { primaryKey, primaryKeySeparator = "_" } = descriptor;
  if (primaryKey.length === 1) return { [primaryKey[0]]: uid };
  const parts = uid.split(primaryKeySeparator);
  return Object.fromEntries(primaryKey.map((key, index) => [key, parts[index]]));
}

/**
 * @param descriptor - the model
 * @param data - a raw object or primary key attributes
 * @returns the serialized primary key
 */
export function uidOf(descriptor: ModelDescriptor, data: RawObject): string {
  return descriptor.primaryKey.map(key => String(data[key])).join(descriptor.primaryKeySeparator ?? "_");
}

/** A reference to an object by its primary key */
export interface ModelRef<T extends SdkModel> {
  readonly uid: string;
  get(options?: CallOptions): Promise<T>;
  patch(data: Partial<RawObject>, options?: CallOptions): Promise<T>;
  delete(options?: CallOptions): Promise<void>;
}

/**
 * The client of one model: CRUD, queries and actions, hydrating the raw objects into the generated class
 *
 * `keys` and `queryFn` are the stable integration point for TanStack Query-style libraries.
 */
export class ModelClient<T extends SdkModel = SdkModel> extends Emitter<{ change: ChangeEvent }> {
  readonly backend: ModelBackend;

  /** Stable query keys: `["WebdaDemo/Task", "get", uid]` and `["WebdaDemo/Task", "query", q]` */
  readonly keys = {
    get: (pk: PrimaryKeyInput): [string, "get", string] => [this.descriptor.id, "get", this.uid(pk)],
    query: (query: string = ""): [string, "query", string] => [this.descriptor.id, "query", query]
  };

  /** Query functions for the keys above */
  readonly queryFn = {
    get: (pk: PrimaryKeyInput, options?: CallOptions) => (): Promise<T> => this.get(pk, options),
    query:
      (query: string = "", options?: CallOptions) =>
      (): Promise<QueryResult<T>> =>
        this.query(query, options)
  };

  /**
   * @param client - the client
   * @param descriptor - the model
   * @param modelClass - the generated class
   * @param backend - where the objects live @default the client's offline backend for a synced model, else
   * RemoteBackend
   */
  constructor(
    readonly client: WebdaClient<any>,
    readonly descriptor: ModelDescriptor,
    readonly modelClass: SdkModelClass<T>,
    backend?: ModelBackend
  ) {
    super();
    this.backend = backend ?? client.backendFor?.(descriptor) ?? new RemoteBackend(client, descriptor);
    client.cache.on("change", event => {
      if (event.model === descriptor.id) this.emit("change", event);
    });
  }

  /**
   * @returns the model id
   */
  get id(): string {
    return this.descriptor.id;
  }

  /**
   * @param pk - a primary key
   * @returns its serialized form
   */
  uid(pk: PrimaryKeyInput): string {
    return typeof pk === "object" ? uidOf(this.descriptor, pk) : String(pk);
  }

  /**
   * @param pk - a primary key
   * @returns the primary key attributes
   */
  pkInput(pk: PrimaryKeyInput): RawObject {
    return typeof pk === "object" ? { ...pk } : pkFromUid(this.descriptor, pk);
  }

  /**
   * Wrap a raw object in the generated class
   * @param data - the raw object
   * @returns the instance
   */
  hydrate(data: RawObject): T {
    return new this.modelClass(this, data);
  }

  /**
   * The parents of a nested object, from the call options, the data or the cache
   * @param options - call options
   * @param uid - the object's uid
   * @param data - the object's data when known
   * @returns the options with `parents` when they could be found
   */
  protected withParents(options: CallOptions, uid?: string, data?: RawObject): CallOptions {
    if (options.parents || !this.descriptor.parent) return options;
    const parents = this.client.resolveParents(this.descriptor.id, uid, data);
    return parents ? { ...options, parents } : options;
  }

  /**
   * @param pk - the primary key
   * @param options - call options
   * @returns the object
   */
  async get(pk: PrimaryKeyInput, options: CallOptions = {}): Promise<T> {
    const uid = this.uid(pk);
    return this.hydrate(await this.backend.get(uid, this.withParents(options, uid)));
  }

  /**
   * @param pk - the primary key
   * @returns a reference, to read or write the object later
   */
  ref(pk: PrimaryKeyInput): ModelRef<T> {
    return {
      uid: this.uid(pk),
      get: options => this.get(pk, options),
      patch: (data, options) => this.patch(pk, data, options),
      delete: options => this.delete(pk, options)
    };
  }

  /**
   * @param query - WebdaQL query
   * @param options - call options; `count` also returns the total of the query (ask on the first page: the next pages
   *   keep the cached total)
   * @returns the page
   */
  async query(query: string = "", options: QueryOptions = {}): Promise<QueryResult<T>> {
    const page = await this.backend.query(query, options);
    return {
      results: page.results.map(data => this.hydrate(data)),
      continuationToken: page.continuationToken,
      ...(page.total ? { total: page.total } : {})
    };
  }

  /**
   * @param query - WebdaQL query
   * @param options - call options
   * @returns every object, page after page
   */
  async *iterate(query: string = "", options: CallOptions = {}): AsyncGenerator<T> {
    let token: string | undefined;
    do {
      const page = await this.query(withContinuation(query, token), options);
      for (const item of page.results) yield item;
      token = page.continuationToken;
    } while (token);
  }

  /**
   * @param data - the object
   * @param options - call options
   * @returns the created object
   */
  async create(data: RawObject, options: CallOptions = {}): Promise<T> {
    return this.hydrate(await this.backend.create(data, this.withParents(options, undefined, data)));
  }

  /**
   * @param pk - the primary key
   * @param data - every attribute (`PUT`)
   * @param options - call options
   * @returns the updated object
   */
  async update(pk: PrimaryKeyInput, data: RawObject, options: CallOptions = {}): Promise<T> {
    const uid = this.uid(pk);
    return this.hydrate(await this.backend.update(uid, data, this.withParents(options, uid, data)));
  }

  /**
   * @param pk - the primary key
   * @param data - some attributes (`PATCH`)
   * @param options - call options
   * @returns the updated object
   */
  async patch(pk: PrimaryKeyInput, data: RawObject, options: CallOptions = {}): Promise<T> {
    const uid = this.uid(pk);
    return this.hydrate(await this.backend.patch(uid, data, this.withParents(options, uid, data)));
  }

  /**
   * @param pk - the primary key
   * @param options - call options
   */
  async delete(pk: PrimaryKeyInput, options: CallOptions = {}): Promise<void> {
    const uid = this.uid(pk);
    await this.backend.delete(uid, this.withParents(options, uid));
  }

  /**
   * Call a custom action of the model
   * @param name - the action
   * @param pk - the primary key, undefined for a global action
   * @param input - the action input
   * @param options - call options
   * @returns the action output; the cached object is refreshed when the output is the object
   */
  async action<O = unknown>(
    name: string,
    pk: PrimaryKeyInput | undefined,
    input: object = {},
    options: CallOptions = {}
  ): Promise<O> {
    const id = this.descriptor.operations.actions[name];
    if (!id) throw new SdkError(0, `Model ${this.descriptor.id} has no action ${name}`);
    return this.callOnObject<O>(id, pk, input, options);
  }

  /**
   * Call an action of a behavior attribute (`api.User.behavior("profilePicture", "getUrl", uid)`)
   * @param attribute - the behavior attribute
   * @param name - the action
   * @param pk - the primary key
   * @param input - the action input
   * @param options - call options
   * @returns the action output
   */
  async behavior<O = unknown>(
    attribute: string,
    name: string,
    pk: PrimaryKeyInput,
    input: object = {},
    options: CallOptions = {}
  ): Promise<O> {
    const id = this.descriptor.operations.behaviors[`${attribute}.${name}`];
    if (!id) throw new SdkError(0, `Model ${this.descriptor.id} has no behavior action ${attribute}.${name}`);
    return this.callOnObject<O>(id, pk, input, options);
  }

  /**
   * @param id - operation id
   * @param pk - the primary key, undefined for a global operation
   * @param input - the input
   * @param options - call options
   * @returns the output
   */
  protected async callOnObject<O>(
    id: string,
    pk: PrimaryKeyInput | undefined,
    input: object,
    options: CallOptions
  ): Promise<O> {
    const uid = pk === undefined ? undefined : this.uid(pk);
    const payload = uid === undefined ? input : { ...input, ...this.pkInput(pk!) };
    const result = await this.client.call(id, payload, this.withParents(options, uid));
    if (result && typeof result === "object" && !Array.isArray(result)) {
      const data = result as RawObject;
      if (this.descriptor.primaryKey.every(key => data[key] !== undefined)) {
        this.client.cache.setEntity(this.descriptor.id, uidOf(this.descriptor, data), data);
      }
    }
    return result as O;
  }
}
