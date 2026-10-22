import { Emitter } from "./emitter.js";
import type { ChangeEvent, QueryTotal } from "./types.js";

/**
 * Where the cache keeps its entries: synchronous key/value strings, as `localStorage`
 */
export interface CacheStorageAdapter {
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  delete(key: string): void;
  keys(): string[];
  clear(): void;
}

/**
 * Default storage: a Map
 */
export class MemoryCacheStorage implements CacheStorageAdapter {
  protected entries = new Map<string, string>();

  /**
   * @param key - the key
   * @returns the value
   */
  get(key: string): string | undefined {
    return this.entries.get(key);
  }

  /**
   * @param key - the key
   * @param value - the value
   */
  set(key: string, value: string): void {
    this.entries.set(key, value);
  }

  /**
   * @param key - the key
   */
  delete(key: string): void {
    this.entries.delete(key);
  }

  /**
   * @returns every key
   */
  keys(): string[] {
    return [...this.entries.keys()];
  }

  /**
   * Remove everything
   */
  clear(): void {
    this.entries.clear();
  }
}

/** The subset of the Web Storage API the adapter needs */
export interface WebStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
}

/**
 * Storage over `localStorage` or `sessionStorage`, so the cache survives reloads
 */
export class WebStorageCacheStorage implements CacheStorageAdapter {
  /**
   * @param storage - `localStorage` or `sessionStorage`
   * @param prefix - key prefix, to share the storage with the application
   */
  constructor(
    protected storage: WebStorageLike,
    protected prefix: string = "webda:"
  ) {}

  /**
   * @param key - the key
   * @returns the value
   */
  get(key: string): string | undefined {
    return this.storage.getItem(this.prefix + key) ?? undefined;
  }

  /**
   * @param key - the key
   * @param value - the value
   */
  set(key: string, value: string): void {
    try {
      this.storage.setItem(this.prefix + key, value);
    } catch {
      // Quota exceeded: the cache is a cache
    }
  }

  /**
   * @param key - the key
   */
  delete(key: string): void {
    this.storage.removeItem(this.prefix + key);
  }

  /**
   * @returns every key of the cache
   */
  keys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix)) keys.push(key.substring(this.prefix.length));
    }
    return keys;
  }

  /**
   * Remove every key of the cache
   */
  clear(): void {
    for (const key of this.keys()) this.delete(key);
  }
}

/** Cache policy of a client */
export interface CacheOptions {
  /** Milliseconds an entry stays fresh; `0` always revalidates (concurrent identical requests are still deduplicated) */
  ttl?: number;
  /** Serve a stale entry and refresh it in the background */
  staleWhileRevalidate?: boolean;
  /** Most entities kept; the oldest are evicted beyond it */
  maxEntries?: number;
  storage?: CacheStorageAdapter;
}

/** A cached entity */
export interface EntityEntry {
  data: Record<string, unknown>;
  /** Time of the last write */
  at: number;
}

/** A cached query: the uids of its results, re-hydrated from the entities */
export interface QueryEntry {
  uids: string[];
  continuationToken?: string;
  /** Total of the query, when it was asked */
  total?: QueryTotal;
  at: number;
}

/**
 * Normalized cache: one entry per `model + uid`, query results stored as lists of uids
 */
export class EntityCache extends Emitter<{ change: ChangeEvent }> {
  readonly ttl: number;
  readonly staleWhileRevalidate: boolean;
  readonly maxEntries: number;
  protected storage: CacheStorageAdapter;

  /**
   * @param options - cache policy
   */
  constructor(options: CacheOptions = {}) {
    super();
    this.ttl = options.ttl ?? 0;
    this.staleWhileRevalidate = options.staleWhileRevalidate ?? false;
    this.maxEntries = options.maxEntries ?? Infinity;
    this.storage = options.storage ?? new MemoryCacheStorage();
  }

  /**
   * @param model - model id
   * @param uid - entity uid
   * @returns the storage key
   */
  protected entityKey(model: string, uid: string): string {
    return `e|${model}|${uid}`;
  }

  /**
   * @param model - model id
   * @param key - query key
   * @returns the storage key
   */
  protected queryKey(model: string, key: string): string {
    return `q|${model}|${key}`;
  }

  /**
   * @param key - storage key
   * @returns the parsed entry
   */
  protected read<T>(key: string): T | undefined {
    const raw = this.storage.get(key);
    if (raw === undefined) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      this.storage.delete(key);
      return undefined;
    }
  }

  /**
   * @param entry - a cached entry
   * @returns true when the entry is within the ttl
   */
  isFresh(entry: { at: number } | undefined): boolean {
    return entry !== undefined && Date.now() - entry.at < this.ttl;
  }

  /**
   * @param model - model id
   * @param uid - entity uid
   * @returns the cached entity
   */
  getEntity(model: string, uid: string): EntityEntry | undefined {
    return this.read<EntityEntry>(this.entityKey(model, uid));
  }

  /**
   * Store an entity, replacing the previous one
   * @param model - model id
   * @param uid - entity uid
   * @param data - the entity
   */
  setEntity(model: string, uid: string, data: Record<string, unknown>): void {
    this.storage.set(this.entityKey(model, uid), JSON.stringify({ data, at: Date.now() }));
    this.evict();
    this.emit("change", { model, uid, type: "set" });
  }

  /**
   * Merge attributes into an entity, creating it when missing
   * @param model - model id
   * @param uid - entity uid
   * @param partial - the attributes
   * @returns the merged entity
   */
  mergeEntity(model: string, uid: string, partial: Record<string, unknown>): Record<string, unknown> {
    const data = { ...(this.getEntity(model, uid)?.data ?? {}), ...partial };
    this.setEntity(model, uid, data);
    return data;
  }

  /**
   * @param model - model id
   * @param uid - entity uid
   */
  deleteEntity(model: string, uid: string): void {
    this.storage.delete(this.entityKey(model, uid));
    this.emit("change", { model, uid, type: "delete" });
  }

  /**
   * @param model - model id
   * @param key - query key
   * @returns the cached query
   */
  getQuery(model: string, key: string): QueryEntry | undefined {
    return this.read<QueryEntry>(this.queryKey(model, key));
  }

  /**
   * @param model - model id
   * @param key - query key
   * @param uids - uids of the results
   * @param continuationToken - continuation token of the page
   * @param total - total of the query, when it was asked
   */
  setQuery(model: string, key: string, uids: string[], continuationToken?: string, total?: QueryTotal): void {
    this.storage.set(this.queryKey(model, key), JSON.stringify({ uids, continuationToken, total, at: Date.now() }));
  }

  /**
   * Forget the queries of a model (and of its ancestors when given): the next query hits the server
   * @param models - model ids
   */
  invalidate(...models: string[]): void {
    for (const model of models) {
      const prefix = this.queryKey(model, "");
      for (const key of this.storage.keys()) {
        if (key.startsWith(prefix)) this.storage.delete(key);
      }
      this.emit("change", { model, type: "invalidate" });
    }
  }

  /**
   * Forget everything
   */
  clear(): void {
    this.storage.clear();
  }

  /**
   * Drop the oldest entities beyond `maxEntries`
   */
  protected evict(): void {
    if (this.maxEntries === Infinity) return;
    const entities = this.storage
      .keys()
      .filter(key => key.startsWith("e|"))
      .map(key => ({ key, at: this.read<EntityEntry>(key)?.at ?? 0 }));
    if (entities.length <= this.maxEntries) return;
    entities.sort((a, b) => a.at - b.at);
    for (const { key } of entities.slice(0, entities.length - this.maxEntries)) this.storage.delete(key);
  }
}
