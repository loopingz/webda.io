import type { WebdaClient } from "./client.js";
import type { ModelClient } from "./model-client.js";
import type { CallOptions, PrimaryKeyInput, QueryResult } from "./types.js";

/**
 * Quote a value as a WebdaQL string literal, escaped as `@webda/ql`'s `escape` does (`\\` and doubled `'`)
 * @param value - the value
 * @returns the literal, quotes included
 */
export function quoteValue(value: string | number | boolean): string {
  return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
}

/**
 * A reference to another model's object, resolved through the client (and its cache)
 */
export class Link<T extends SdkModel = SdkModel> {
  /**
   * @param client - the client
   * @param model - target model id
   * @param uid - uid of the target
   * @param extra - fields embedded with the reference (`LINKS_ARRAY`, `LINKS_MAP`)
   */
  constructor(
    protected readonly client: WebdaClient<any>,
    readonly model: string,
    readonly uid: string,
    readonly extra?: Record<string, unknown>
  ) {
    if (extra) Object.assign(this, extra);
  }

  /**
   * @param options - call options
   * @returns the target, from the cache when fresh
   */
  get(options?: CallOptions): Promise<T> {
    return this.client.model<T>(this.model).get(this.uid, options);
  }

  /**
   * @returns the uid
   */
  toString(): string {
    return this.uid;
  }

  /**
   * @returns the uid, or the reference with its embedded fields
   */
  toJSON(): unknown {
    return this.extra ? { ...this.extra, uuid: this.uid } : this.uid;
  }
}

/**
 * @param client - the client
 * @param model - target model id
 * @param data - the target's attributes, its primary key included
 * @returns the target's uid
 */
export function targetUid(client: WebdaClient<any>, model: string, data: Record<string, unknown>): string {
  const descriptor = client.models[model];
  const primaryKey = descriptor?.primaryKey ?? ["uuid"];
  return primaryKey.map(key => String(data[key])).join(descriptor?.primaryKeySeparator ?? "_");
}

/**
 * A `Link` from a relation value: a uid, or the target object of a projection (`select: ["owner.name"]`), whose
 * attributes are readable on the link and refresh the cached target
 * @param client - the client
 * @param model - target model id
 * @param value - uid or target attributes
 * @returns the link
 */
export function projectedLink(client: WebdaClient<any>, model: string, value: unknown): Link {
  if (value === null || typeof value !== "object") return new Link(client, model, String(value));
  const data = value as Record<string, unknown>;
  const uid = targetUid(client, model, data);
  const link = new Link(client, model, uid);
  for (const [key, attribute] of Object.entries(data)) {
    if (!(key in link)) (link as any)[key] = attribute;
  }
  // Refresh the cached target, only when the projection changes it: hydrating must not loop through `change`
  const cached = client.cache.getEntity(model, uid)?.data;
  if (
    cached &&
    Object.entries(data).some(([key, attribute]) => JSON.stringify(cached[key]) !== JSON.stringify(attribute))
  ) {
    client.cache.mergeEntity(model, uid, data);
  }
  return link;
}

/**
 * References stored as an array of uids (`ModelLinksSimpleArray`)
 */
export class Links<T extends SdkModel = SdkModel> extends Array<Link<T>> {
  /**
   * Array methods (`map`, `slice`...) give plain arrays
   * @returns Array
   */
  static get [Symbol.species]() {
    return Array;
  }

  /**
   * @param client - the client
   * @param model - target model id
   * @param uids - the uids
   */
  constructor(client: WebdaClient<any>, model: string, uids: string[] = []) {
    super();
    for (const uid of uids) this.push(new Link<T>(client, model, uid));
  }

  /**
   * @param options - call options
   * @returns every target
   */
  getAll(options?: CallOptions): Promise<T[]> {
    return Promise.all(this.map(link => link.get(options)));
  }

  /**
   * @returns the uids
   */
  toJSON(): unknown[] {
    return this.map(link => link.toJSON());
  }
}

/**
 * References stored as an array of `{ uuid, ...fields }` (`ModelLinksArray`)
 */
export class LinksArray<T extends SdkModel = SdkModel, Extra extends object = object> extends Array<Link<T> & Extra> {
  /**
   * Array methods (`map`, `slice`...) give plain arrays
   * @returns Array
   */
  static get [Symbol.species]() {
    return Array;
  }

  /**
   * @param client - the client
   * @param model - target model id
   * @param items - the stored references
   */
  constructor(client: WebdaClient<any>, model: string, items: Array<{ uuid: string } & Extra> = []) {
    super();
    for (const { uuid, ...extra } of items) {
      this.push(new Link<T>(client, model, uuid, extra as Record<string, unknown>) as Link<T> & Extra);
    }
  }

  /**
   * @param options - call options
   * @returns every target
   */
  getAll(options?: CallOptions): Promise<T[]> {
    return Promise.all(this.map(link => link.get(options)));
  }

  /**
   * @returns the stored references
   */
  toJSON(): unknown[] {
    return this.map(link => link.toJSON());
  }
}

/**
 * References stored as a map of `{ uuid, ...fields }` (`ModelLinksMap`)
 */
export class LinksMap<T extends SdkModel = SdkModel, Extra extends object = object> {
  protected readonly entries: Record<string, Link<T> & Extra> = {};

  /**
   * @param client - the client
   * @param model - target model id
   * @param items - the stored references
   */
  constructor(client: WebdaClient<any>, model: string, items: Record<string, { uuid: string } & Extra> = {}) {
    for (const [key, { uuid, ...extra }] of Object.entries(items)) {
      this.entries[key] = new Link<T>(client, model, uuid, extra as Record<string, unknown>) as Link<T> & Extra;
    }
  }

  /**
   * @param key - the key
   * @returns the reference
   */
  get(key: string): (Link<T> & Extra) | undefined {
    return this.entries[key];
  }

  /**
   * @returns the keys
   */
  keys(): string[] {
    return Object.keys(this.entries);
  }

  /**
   * @returns the references
   */
  values(): Array<Link<T> & Extra> {
    return Object.values(this.entries);
  }

  /**
   * @param options - call options
   * @returns every target, by key
   */
  async getAll(options?: CallOptions): Promise<Record<string, T>> {
    const result: Record<string, T> = {};
    await Promise.all(this.keys().map(async key => (result[key] = await this.entries[key].get(options))));
    return result;
  }

  /**
   * @returns the stored references
   */
  toJSON(): Record<string, unknown> {
    return Object.fromEntries(Object.entries(this.entries).map(([key, link]) => [key, link.toJSON()]));
  }
}

/**
 * The objects of another model pointing at this one (`ModelRelated`), queried on demand
 */
export class Related<T extends SdkModel = SdkModel> {
  /**
   * @param client - the client
   * @param model - target model id
   * @param targetAttribute - attribute of the target holding this object's uid
   * @param uid - uid of this object
   * @param owner - model id of the object holding the relation, to resolve the parents of a nested target
   */
  constructor(
    protected readonly client: WebdaClient<any>,
    readonly model: string,
    readonly targetAttribute: string,
    readonly uid: string,
    readonly owner?: string
  ) {}

  /**
   * When the target is nested under this object (the relation is its parent attribute), the REST route of the query
   * needs the parent ids: this object's, under its own parents
   * @param options - call options
   * @returns the options with `parents`
   */
  protected options(options: CallOptions = {}): CallOptions {
    const target = this.client.models[this.model];
    if (options.parents || target?.parent?.attribute !== this.targetAttribute) return options;
    const above = this.owner ? this.client.resolveParents(this.owner, this.uid) : [];
    return above ? { ...options, parents: [...above, this.uid] } : options;
  }

  /**
   * @param filter - WebdaQL filter, with optional `ORDER BY` / `LIMIT` / `OFFSET`
   * @returns the full query
   */
  toQuery(filter: string = ""): string {
    const match = /^(.*?)(\s*(?:ORDER\s+BY|LIMIT|OFFSET)\b.*)?$/is.exec(filter.trim());
    const condition = match?.[1]?.trim() ?? "";
    const tail = match?.[2] ?? "";
    const base = `${this.targetAttribute} = ${quoteValue(this.uid)}`;
    return `${condition ? `${base} AND (${condition})` : base}${tail ? ` ${tail.trim()}` : ""}`;
  }

  /**
   * @param filter - WebdaQL filter
   * @param options - call options
   * @returns the page
   */
  query(filter?: string, options?: CallOptions): Promise<QueryResult<T>> {
    return this.client.model<T>(this.model).query(this.toQuery(filter), this.options(options));
  }

  /**
   * @param filter - WebdaQL filter
   * @param options - call options
   * @returns every object, page after page
   */
  iterate(filter?: string, options?: CallOptions): AsyncGenerator<T> {
    return this.client.model<T>(this.model).iterate(this.toQuery(filter), this.options(options));
  }

  /**
   * Not part of the object's data
   * @returns undefined
   */
  toJSON(): undefined {
    return undefined;
  }
}

/** The client of a model instance is kept out of its attributes */
const CLIENT = Symbol("webda:client");

/**
 * Base class of the generated model classes: the frontend counterpart of `Model`
 *
 * The generated class declares the attributes from the schema, relation attributes become `Link` / `Links` /
 * `LinksArray` / `LinksMap` / `Related`, `date-time` attributes are revived as `Date`.
 */
export class SdkModel<Data extends object = Record<string, unknown>> {
  declare [CLIENT]: ModelClient<any>;

  /**
   * @param client - the model client
   * @param data - the raw object
   */
  constructor(client: ModelClient<any>, data: Partial<Data> = {}) {
    Object.defineProperty(this, CLIENT, { value: client, enumerable: false, writable: true });
    this.hydrate(data as Record<string, unknown>);
  }

  /**
   * @returns the model client
   */
  getClient(): ModelClient<any> {
    return this[CLIENT];
  }

  /**
   * Load raw attributes, wrapping relations and reviving dates
   * @param data - the raw object
   * @returns this
   */
  hydrate(data: Record<string, unknown>): this {
    const client = this[CLIENT];
    const descriptor = client.descriptor;
    const webda = client.client;
    const links = new Map(descriptor.links.map(link => [link.attribute, link]));
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (descriptor.parent?.attribute === key) {
        (this as any)[key] = value === null ? null : projectedLink(webda, descriptor.parent.model, value);
        continue;
      }
      const link = links.get(key);
      if (link && value !== null) {
        switch (link.type) {
          case "LINK":
            (this as any)[key] = projectedLink(webda, link.model, value);
            continue;
          case "LINKS_SIMPLE_ARRAY":
            (this as any)[key] = new Links(
              webda,
              link.model,
              (value as unknown[]).map(item =>
                item !== null && typeof item === "object"
                  ? targetUid(webda, link.model, item as Record<string, unknown>)
                  : String(item)
              )
            );
            continue;
          case "LINKS_ARRAY":
            (this as any)[key] = new LinksArray(webda, link.model, value as any[]);
            continue;
          case "LINKS_MAP":
            (this as any)[key] = new LinksMap(webda, link.model, value as any);
            continue;
        }
      }
      if (descriptor.dates.includes(key) && value !== null && !(value instanceof Date)) {
        (this as any)[key] = new Date(value as string | number);
        continue;
      }
      (this as any)[key] = value;
    }
    const uid = this.getUUID();
    for (const query of descriptor.queries) {
      Object.defineProperty(this, query.attribute, {
        value: new Related(webda, query.model, query.targetAttribute, uid, descriptor.id),
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    return this;
  }

  /**
   * @returns the primary key, the uid of a single-attribute key
   */
  getPrimaryKey(): PrimaryKeyInput {
    const { primaryKey } = this[CLIENT].descriptor;
    if (primaryKey.length === 1) return String((this as any)[primaryKey[0]]);
    return Object.fromEntries(primaryKey.map(key => [key, (this as any)[key]]));
  }

  /**
   * @returns the serialized primary key
   */
  getUUID(): string {
    return this[CLIENT].uid(this.getPrimaryKey());
  }

  /**
   * @returns the parents' uids for a nested model, root first (only the direct parent is known from the object)
   */
  getParents(): string[] | undefined {
    const { parent } = this[CLIENT].descriptor;
    if (!parent) return undefined;
    const value = (this as any)[parent.attribute];
    return value ? [String(value)] : undefined;
  }

  /**
   * @returns the raw attributes, as the server stores them
   */
  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(this)) {
      if (value instanceof Related || typeof value === "function") continue;
      result[key] = value;
    }
    return result;
  }

  /**
   * @param options - call options
   * @returns the options with the parents of this object
   */
  protected options(options: CallOptions = {}): CallOptions {
    return { parents: this.getParents(), ...options };
  }

  /**
   * Send every attribute (`PUT`)
   * @param options - call options
   * @returns this, with the server's answer
   */
  async save(options?: CallOptions): Promise<this> {
    const updated = await this[CLIENT].update(this.getPrimaryKey(), this.toJSON(), this.options(options));
    return this.hydrate(updated.toJSON());
  }

  /**
   * Send some attributes (`PATCH`)
   * @param partial - the attributes
   * @param options - call options
   * @returns this, with the server's answer
   */
  async patch(partial: Partial<Data>, options?: CallOptions): Promise<this> {
    const updated = await this[CLIENT].patch(this.getPrimaryKey(), partial, this.options(options));
    return this.hydrate(updated.toJSON());
  }

  /**
   * Reload from the server
   * @param options - call options
   * @returns this, with the server's answer
   */
  async refresh(options?: CallOptions): Promise<this> {
    const fresh = await this[CLIENT].get(this.getPrimaryKey(), { cache: "reload", ...this.options(options) });
    return this.hydrate(fresh.toJSON());
  }

  /**
   * Delete on the server
   * @param options - call options
   */
  async delete(options?: CallOptions): Promise<void> {
    await this[CLIENT].delete(this.getPrimaryKey(), this.options(options));
  }
}
