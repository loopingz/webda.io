import type {
  ConflictInfo,
  ConflictStrategy,
  ChangeEvent as OfflineChangeEvent,
  OfflineClient,
  OfflineClientOptions,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotRequest,
  SnapshotResponse,
  StorageAdapter,
  SyncRef,
  SyncScope,
  SyncStatus,
  Transport as SyncTransport,
  WatchEvent,
  WatchRequest
} from "@webda/offline/client";
import type { OfflineExtension, WebdaClient } from "../client.js";
import { Emitter } from "../emitter.js";
import { SdkError } from "../errors.js";
import { pkFromUid, RemoteBackend, type ModelBackend, type RawObject } from "../model-client.js";
import type { CallOptions, ModelDescriptor, QueryOptions, QueryResult, ServerManifest } from "../types.js";

/** Resolutions of a conflict, as `OfflineClient.resolve()` takes them (`@webda/versioning`) */
export type ConflictResolutions = Parameters<OfflineClient["resolve"]>[1];

/** The `Sync.*` operations of the application */
export type SyncOperations = NonNullable<ServerManifest["offline"]>["operations"];

/**
 * `@webda/offline/client`'s `Transport` over the SDK transports: `Sync.Pull` / `Sync.Push` / `Sync.Snapshot` /
 * `Sync.Watch` are called like any operation, so the sync protocol shares the client's headers and authentication and
 * works over every transport that exposes them (REST, GraphQL, gRPC), not only the REST routes
 */
export class SyncTransportAdapter implements SyncTransport {
  /** Live hints, when the application exposes `Sync.Watch` */
  watch?: (req: WatchRequest, signal: AbortSignal) => AsyncIterable<WatchEvent>;

  /**
   * @param client - the SDK client
   * @param operations - ids of the `Sync.*` operations
   */
  constructor(
    protected readonly client: WebdaClient<any>,
    protected readonly operations: SyncOperations
  ) {
    const watch = operations.watch;
    if (watch) {
      this.watch = (req, signal) => this.client.stream(watch, req, { signal }) as AsyncIterable<WatchEvent>;
    }
  }

  /**
   * @param req - the pull request
   * @returns the page of changes
   */
  pull(req: PullRequest): Promise<PullResponse> {
    return this.client.call(this.operations.pull, req) as Promise<PullResponse>;
  }

  /**
   * @param req - the mutations
   * @returns their results
   */
  push(req: PushRequest): Promise<PushResponse> {
    return this.client.call(this.operations.push, req) as Promise<PushResponse>;
  }

  /**
   * @param req - the scope and continuation
   * @returns the page of objects
   */
  snapshot(req: SnapshotRequest): Promise<SnapshotResponse> {
    return this.client.call(this.operations.snapshot, req) as Promise<SnapshotResponse>;
  }
}

/** Options of `offline()` */
export interface OfflineOptions {
  /** Where the replica lives: `IndexedDBStorage`, `MemoryStorage`, `EncryptedStorage`... of `@webda/offline/client` */
  storage: StorageAdapter;
  /** What to sync @default one unfiltered scope per model of `models` */
  scopes?: SyncScope[];
  /** Models served offline-first @default every model the `SyncService` syncs */
  models?: string[];
  /** How conflicts are settled @default "manual": they wait in `api.offline.conflicts()` */
  onConflict?: ConflictStrategy;
  /** Polling interval of the sync loop, in ms (0 disables polling) @default 30000 */
  syncInterval?: number;
  /** Retry backoff of the sync loop */
  retry?: { base: number; max: number };
  /** Mutations per `Sync.Push` request */
  pushBatchSize?: number;
  /** Per-model merge configuration (`@webda/versioning`) */
  versioning?: OfflineClientOptions["versioning"];
  /** Start the sync loop (and `Sync.Watch`) when the client is created @default true */
  start?: boolean;
}

/**
 * @param query - a WebdaQL query
 * @returns its filter and its trailing `ORDER BY` / `LIMIT` / `OFFSET` clauses
 */
export function splitQuery(query: string): {
  filter: string;
  orderBy: Array<{ field: string; direction: "ASC" | "DESC" }>;
  limit?: number;
  offset?: string;
} {
  let rest = query.trim();
  let offset: string | undefined;
  let limit: number | undefined;
  let orderBy: Array<{ field: string; direction: "ASC" | "DESC" }> = [];
  const offsetMatch = /\bOFFSET\s+("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*$/i.exec(rest);
  if (offsetMatch) {
    offset = offsetMatch[1].slice(1, -1).replace(/\\(.)/g, "$1");
    rest = rest.slice(0, offsetMatch.index);
  }
  const limitMatch = /\bLIMIT\s+(\d+)\s*$/i.exec(rest);
  if (limitMatch) {
    limit = Number(limitMatch[1]);
    rest = rest.slice(0, limitMatch.index);
  }
  const orderMatch = /\bORDER\s+BY\s+([\w.]+(?:\s+(?:ASC|DESC))?(?:\s*,\s*[\w.]+(?:\s+(?:ASC|DESC))?)*)\s*$/i.exec(
    rest
  );
  if (orderMatch) {
    orderBy = orderMatch[1].split(",").map(part => {
      const [field, direction] = part.trim().split(/\s+/);
      return { field, direction: direction?.toUpperCase() === "DESC" ? "DESC" : "ASC" };
    });
    rest = rest.slice(0, orderMatch.index);
  }
  return { filter: rest.trim(), orderBy, limit, offset };
}

/**
 * @param object - an object
 * @param path - a dotted attribute path
 * @returns the value
 */
function valueAt(object: any, path: string): any {
  return path.split(".").reduce((value, key) => (value === null || value === undefined ? value : value[key]), object);
}

/**
 * A model served from the local replica of `@webda/offline/client`: reads and writes are local and succeed while the
 * server is unreachable, the `OfflineClient` sync loop pushes the writes and pulls the server's changes
 *
 * An object outside the synced scopes is read through the transports.
 */
export class OfflineBackend implements ModelBackend {
  protected readonly remote: RemoteBackend;

  /**
   * @param support - the offline extension
   * @param descriptor - the model
   */
  constructor(
    protected readonly support: OfflineSupport,
    protected readonly descriptor: ModelDescriptor
  ) {
    this.remote = new RemoteBackend(support.client!, descriptor);
  }

  /**
   * @param uid - an uid
   * @returns the key `@webda/offline` uses (the primary key attributes)
   */
  protected key(uid: string): RawObject {
    return pkFromUid(this.descriptor, uid);
  }

  /**
   * Run a replica write, mapping its refusals to SdkError
   * @param run - the write
   * @returns its result
   */
  protected async local<T>(run: (replica: OfflineClient) => Promise<T>): Promise<T> {
    const replica = await this.support.ready();
    try {
      return await run(replica);
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      const status = /not found/i.test(message) ? 404 : /exists|conflict/i.test(message) ? 409 : 400;
      throw new SdkError(status, message, { transport: "offline", cause: err });
    }
  }

  /**
   * @param uid - the uid
   * @param options - call options
   * @returns the local object; one the replica does not hold is read through the transports
   * @throws SdkError 404 when it was deleted locally
   */
  async get(uid: string, options: CallOptions): Promise<RawObject> {
    const replica = await this.support.ready();
    const id = `${this.descriptor.id}|${replica.keyOf(this.descriptor.id, this.key(uid))}`;
    const record = await replica.storage.getRecord(id);
    if (record) {
      if (record.current === null) {
        throw new SdkError(404, `${this.descriptor.id} ${uid} is deleted`, { transport: "offline" });
      }
      return structuredClone(record.current);
    }
    return this.remote.get(uid, options);
  }

  /**
   * Query the replica: the filter is evaluated locally, `ORDER BY`, `LIMIT` and `OFFSET` are applied on the result
   * @param query - WebdaQL query
   * @param options - `count` adds the total of the filter, counted on the replica
   * @returns the page
   */
  async query(query: string, options: QueryOptions = {}): Promise<QueryResult<RawObject>> {
    const { filter, orderBy, limit, offset } = splitQuery(query);
    const replica = await this.support.ready();
    let results: RawObject[] = await replica.collection<RawObject>(this.descriptor.id).query(filter);
    if (orderBy.length) {
      results = [...results].sort((a, b) => {
        for (const { field, direction } of orderBy) {
          // null and undefined are the same missing value, sorted first
          const left = valueAt(a, field) ?? null;
          const right = valueAt(b, field) ?? null;
          if (left === right) continue;
          const order = left === null ? -1 : right === null ? 1 : left < right ? -1 : 1;
          return direction === "DESC" ? -order : order;
        }
        return 0;
      });
    }
    const start = offset !== undefined ? Number(offset) || 0 : 0;
    const end = limit !== undefined ? start + limit : results.length;
    const page = results.slice(start, end).map(object => structuredClone(object));
    return {
      results: page,
      ...(end < results.length ? { continuationToken: String(end) } : {}),
      ...(options.count ? { total: { value: results.length, relation: "eq" as const } } : {})
    };
  }

  /**
   * @param data - the object
   * @returns the local object
   */
  create(data: RawObject): Promise<RawObject> {
    return this.local(replica => replica.collection<RawObject>(this.descriptor.id).create(data));
  }

  /**
   * @param uid - the uid
   * @param data - every attribute (merged: the replica patches)
   * @returns the local object
   */
  update(uid: string, data: RawObject): Promise<RawObject> {
    return this.patch(uid, data);
  }

  /**
   * @param uid - the uid
   * @param data - some attributes
   * @returns the local object
   */
  patch(uid: string, data: RawObject): Promise<RawObject> {
    const key = this.key(uid);
    return this.local(replica => replica.collection<RawObject>(this.descriptor.id).patch(key, { ...data, ...key }));
  }

  /**
   * @param uid - the uid
   */
  async delete(uid: string): Promise<void> {
    await this.local(replica => replica.collection<RawObject>(this.descriptor.id).delete(this.key(uid)));
  }
}

/**
 * The `offline` option of `createClient()`: the models the application's `SyncService` syncs are served offline-first
 * from a local replica (`@webda/offline/client`, an optional peer dependency imported when the client is created),
 * the other models keep going through the transports
 *
 * It is also `api.offline`: the sync loop, its status and the conflicts of `OfflineClient`.
 */
export class OfflineSupport
  extends Emitter<{ change: OfflineChangeEvent; status: SyncStatus; conflict: ConflictInfo; error: unknown }>
  implements OfflineExtension
{
  /** The client it is attached to */
  client?: WebdaClient<any>;
  /** Models served offline-first */
  models: string[] = [];
  /** How the replica reaches the `Sync.*` operations */
  transport?: SyncTransportAdapter;
  protected replicaPromise?: Promise<OfflineClient>;
  protected replicaClient?: OfflineClient;

  /**
   * @param options - storage, scopes and sync options
   */
  constructor(readonly options: OfflineOptions) {
    super();
  }

  /**
   * @param client - the client
   * @throws SdkError when the application has no `SyncService` or the extension is already attached
   */
  attach(client: WebdaClient<any>): void {
    if (this.client) throw new SdkError(0, "offline() is already attached to a client", { transport: "offline" });
    const sync = client.server.offline;
    if (!sync) {
      throw new SdkError(0, "The application has no SyncService: offline() needs manifest.offline", {
        transport: "offline"
      });
    }
    this.client = client;
    this.models = (this.options.models ?? sync.models).filter(model => client.models[model] !== undefined);
    this.transport = new SyncTransportAdapter(client, sync.operations);
    this.replicaPromise = import("@webda/offline/client").then(({ OfflineClient }) => {
      const replica = new OfflineClient({
        storage: this.options.storage,
        transport: this.transport!,
        scopes: this.options.scopes ?? this.models.map(model => ({ model })),
        onConflict: this.options.onConflict,
        syncInterval: this.options.syncInterval,
        retry: this.options.retry,
        pushBatchSize: this.options.pushBatchSize,
        versioning: this.options.versioning,
        primaryKeys: Object.fromEntries(this.models.map(model => [model, client.models[model].primaryKey]))
      });
      replica.on("change", event => this.onChange(event));
      replica.on("status", status => this.emit("status", status));
      replica.on("conflict", info => this.emit("conflict", info));
      replica.on("error", err => this.emit("error", err));
      this.replicaClient = replica;
      if (this.options.start !== false) void replica.start();
      return replica;
    });
    this.replicaPromise.catch(err => this.emit("error", err));
  }

  /**
   * @param descriptor - a model
   * @returns the offline backend of a synced model, undefined for the others
   */
  backend(descriptor: ModelDescriptor): ModelBackend | undefined {
    return this.models.includes(descriptor.id) ? new OfflineBackend(this, descriptor) : undefined;
  }

  /**
   * @returns the replica, once `@webda/offline/client` is loaded
   * @throws SdkError when the extension is not attached to a client
   */
  ready(): Promise<OfflineClient> {
    if (!this.replicaPromise) {
      return Promise.reject(
        new SdkError(0, "offline() is not attached: give it to createClient()", { transport: "offline" })
      );
    }
    return this.replicaPromise;
  }

  /**
   * @returns the `OfflineClient`, undefined until loaded
   */
  get replica(): OfflineClient | undefined {
    return this.replicaClient;
  }

  /**
   * @returns the sync loop status
   */
  get status(): SyncStatus {
    return this.replicaClient?.status ?? "idle";
  }

  /**
   * @param model - model id
   * @param key - key of the object in the replica
   * @returns its uid in the SDK
   */
  protected uidOf(model: string, key: string): string {
    const descriptor = this.client!.models[model];
    if (!descriptor || descriptor.primaryKey.length <= 1) return key;
    return (JSON.parse(key) as string[]).join(descriptor.primaryKeySeparator ?? "_");
  }

  /**
   * A local write or a pulled change: the cache follows the replica, so `change` fires on the model clients
   * @param event - the replica change
   */
  protected onChange(event: OfflineChangeEvent): void {
    const client = this.client!;
    const { model, key } = event.ref;
    if (this.models.includes(model)) {
      const uid = this.uidOf(model, key);
      if (event.object === null) client.cache.deleteEntity(model, uid);
      else client.cache.setEntity(model, uid, event.object);
      // Lists of the ancestors (read through the transports) may hold the object
      const { ancestors } = client.models[model];
      if (ancestors.length) client.cache.invalidate(...ancestors);
    }
    this.emit("change", event);
  }

  /**
   * Push the local writes and pull the server's changes now
   * @returns when done; rejects with the transport error when the server is unreachable
   */
  async sync(): Promise<void> {
    await (await this.ready()).sync();
  }

  /**
   * Start the sync loop (polling, `online` events, `Sync.Watch`)
   */
  async start(): Promise<void> {
    await (await this.ready()).start();
  }

  /**
   * Stop the sync loop
   */
  stop(): void {
    this.replicaClient?.stop();
  }

  /**
   * @returns the open conflicts
   */
  async conflicts(): Promise<ConflictInfo[]> {
    return (await this.ready()).conflicts();
  }

  /**
   * Settle a conflict
   * @param ref - the object
   * @param resolutions - the resolution of each conflicting path
   */
  async resolve(ref: SyncRef, resolutions: ConflictResolutions): Promise<void> {
    await (await this.ready()).resolve(ref, resolutions);
  }

  /**
   * Drop the local changes of an object
   * @param ref - the object
   */
  async discard(ref: SyncRef): Promise<void> {
    await (await this.ready()).discard(ref);
  }
}

/**
 * Serve the models synced by the application's `SyncService` offline-first
 *
 * ```ts
 * const api = createClient({ baseUrl, offline: offline({ storage: new IndexedDBStorage("myapp") }) });
 * await api.Task.patch(uuid, { status: "done" }); // written locally, pushed by the sync loop
 * await api.offline.conflicts();
 * ```
 * @param options - storage, scopes and sync options
 * @returns the extension, also reachable as `api.offline`
 */
export function offline(options: OfflineOptions): OfflineSupport {
  return new OfflineSupport(options);
}
