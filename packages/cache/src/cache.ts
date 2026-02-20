/* c8 ignore next */
import { createMethodDecorator, getMetadata } from "@webda/decorators";
import type { MethodDecorator } from "@webda/decorators";
import { createHash } from "node:crypto";

/**
 * Cache statistics for tracking performance metrics.
 */
export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  sets: number;
}

/**
 * Options controlling cache key generation and storage behavior.
 */
export interface CacheOptions {
  /**
   * Define how to cache the method call.
   * If undefined is returned then no caching is done.
   *
   * @param property
   * @param args
   * @returns
   */
  methodKeyGenerator?: (property: string, args: any[]) => string | undefined;
  /**
   * Generator for the instance-level cache key (e.g., per `this`).
   */
  classKeyGenerator?: (instance: object) => any;
  /**
   * Define how long the cache should be kept (in milliseconds).
   */
  ttl?: number;
  /**
   * Maximum number of entries per instance cache.
   * When exceeded, least recently used entries are evicted.
   */
  maxSize?: number;
  /**
   * Automatic garbage collection interval (in milliseconds).
   * When set, expired entries are automatically cleaned up.
   */
  gcInterval?: number;
  /**
   * Enable cache statistics tracking (hits, misses, evictions).
   */
  enableStats?: boolean;
  /**
   * Predicate to decide whether a result should be cached.
   * Return `false` to skip caching for a specific result value.
   *
   * Called with the resolved value for async methods.
   *
   * @example
   * // Only cache non-null results
   * shouldCache: (result) => result !== null
   *
   * @example
   * // Only cache successful HTTP responses
   * shouldCache: (result) => result?.status === 200
   */
  shouldCache?: (result: any) => boolean;
  /**
   * Algorithm to use for default argument key generation.
   *
   * - `'sha256'` (default): Hashes the serialized arguments with SHA-256.
   *   Collision-resistant and produces fixed-length keys, but involves
   *   a crypto operation on every cache miss.
   * - `'simple'`: Uses a typed, length-prefixed string encoding without
   *   hashing. Faster for hot paths but produces longer keys proportional
   *   to argument size.
   *
   * Has no effect when a custom `methodKeyGenerator` is provided.
   */
  hashStrategy?: "sha256" | "simple";
  /**
   * Custom `CacheMap` implementation constructor.
   */
  cacheMap?: new (options: CacheOptions) => CacheMap;
  /**
   * Custom `CacheStorage` implementation constructor.
   */
  cacheStorage?: new (options?: CacheOptions) => CacheStorage;
}

/**
 * Storage for cached method results for a single instance.
 *
 * Maintains an internal timestamp per entry to support TTL-based
 * invalidation during reads and garbage collection.
 *
 * Keys are method-level cache keys produced by `methodKeyGenerator`.
 * Supports LRU eviction when maxSize is configured.
 */
export class CacheStorage extends Map<string, { value: any; timestamp: number }> {
  stats: CacheStats = { hits: 0, misses: 0, evictions: 0, sets: 0 };

  constructor(private options?: CacheOptions) {
    super();
  }

  /**
   * Check whether a cached value exists and is still valid.
   * Applies TTL: if an entry is expired, it is evicted and treated as missing.
   */
  hasCachedMethod(key: string) {
    const exists = this.has(key);

    // Implement TTL check if needed
    if (this.options?.ttl && exists) {
      const cached = this.get(key);
      if (cached && Date.now() - cached.timestamp > this.options.ttl) {
        this.delete(key);
        if (this.options.enableStats) {
          this.stats.evictions++;
        }
        return false;
      }
    }

    return exists;
  }

  /**
   * Store a cached value for the given method key.
   * Implements LRU eviction when maxSize is reached.
   *
   * Note: `args` is accepted for potential future strategies but not used here.
   */
  setCachedMethod(key: string, _args: any[], value: any) {
    // LRU: if key exists, delete it so we can re-add it at the end (most recent)
    if (this.has(key)) {
      this.delete(key);
    }

    // Check if we need to evict the oldest entry (LRU)
    if (this.options?.maxSize && this.size >= this.options.maxSize) {
      // Map iteration order is insertion order, so first key is oldest
      const oldestKey = this.keys().next().value;
      if (oldestKey !== undefined) {
        this.delete(oldestKey);
        if (this.options.enableStats) {
          this.stats.evictions++;
        }
      }
    }

    this.set(key, { value, timestamp: Date.now() });
    if (this.options?.enableStats) {
      this.stats.sets++;
    }
  }

  /**
   * Retrieve the cached value for the given method key (without TTL re-check).
   */
  getCachedMethod(key: string) {
    const cached = this.get(key);
    return cached?.value;
  }

  /**
   * Delete cache entries.
   * If the key ends with `$`, all entries starting with the prefix are removed.
   */
  deleteCachedMethod(key: string) {
    if (key.endsWith("$")) {
      const prefix = key.slice(0, -1); // Remove trailing $ to get the actual prefix
      for (const k of this.keys()) {
        if (k.startsWith(prefix)) {
          this.delete(k);
        }
      }
    } else {
      this.delete(key);
    }
  }

  /**
   * Remove all expired entries based on TTL.
   */
  garbageCollect() {
    if (this.options?.ttl) {
      const now = Date.now();
      let evicted = 0;
      for (const [key, { timestamp }] of this.entries()) {
        if (now - timestamp > this.options.ttl) {
          this.delete(key);
          evicted++;
        }
      }
      if (this.options.enableStats && evicted > 0) {
        this.stats.evictions += evicted;
      }
    }
  }

  /**
   * Get current cache statistics.
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics to zero.
   */
  resetStats() {
    this.stats = { hits: 0, misses: 0, evictions: 0, sets: 0 };
  }
}

/**
 * Cache map storing `CacheStorage` per instance key.
 *
 * The instance key is produced by `classKeyGenerator`.
 */
export class CacheMap<T extends object = object> extends Map<T, CacheStorage> {
  private gcTimer?: NodeJS.Timeout;

  constructor(private options?: CacheOptions) {
    super();
    // Start automatic garbage collection if interval is configured
    if (this.options?.gcInterval && this.options.gcInterval > 0) {
      this.startAutoGC();
    }
  }

  /**
   * Get a cached value for a given instance and method key.
   */
  getCachedMethod(target: T, key: string) {
    if (!this.has(target)) {
      return undefined;
    }
    return this.get(target)!.getCachedMethod(key);
  }

  /**
   * Check if a cached value exists for the given instance and method key.
   * Tracks cache hits when enableStats is true (misses tracked in setCachedMethod).
   */
  hasCachedMethod(target: T, key: string) {
    if (this.has(target)) {
      const cache = this.get(target)!;
      const exists = cache.hasCachedMethod(key);
      if (this.options?.enableStats && exists) {
        cache.stats.hits++;
      }
      return exists;
    }
    return false;
  }

  /**
   * Store a cached value for the given instance + method key.
   * Tracks misses when enableStats is true (only if key didn't exist).
   */
  setCachedMethod(target: T, key: string, _args: any[], value: any) {
    if (!this.has(target)) {
      this.set(target, new (this.options?.cacheStorage ?? CacheStorage)(this.options));
    }
    const cache = this.get(target)!;
    const isNewEntry = !cache.has(key);
    cache.setCachedMethod(key, _args, value);
    // Track miss only for new entries (not updates)
    if (this.options?.enableStats && isNewEntry) {
      cache.stats.misses++;
    }
  }

  /**
   * Trigger garbage collection on all instance stores.
   */
  garbageCollect() {
    for (const [, cache] of this.entries()) {
      cache.garbageCollect();
    }
  }

  /**
   * Start automatic garbage collection timer.
   */
  private startAutoGC() {
    if (this.gcTimer) {
      return; // Already running
    }
    this.gcTimer = setInterval(() => {
      this.garbageCollect();
    }, this.options!.gcInterval!);
    // Allow Node.js to exit even if timer is active
    if (this.gcTimer.unref) {
      this.gcTimer.unref();
    }
  }

  /**
   * Stop automatic garbage collection timer.
   */
  stopAutoGC() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = undefined;
    }
  }

  /**
   * Get aggregated statistics across all instance caches.
   */
  getStats(): CacheStats {
    const aggregated: CacheStats = { hits: 0, misses: 0, evictions: 0, sets: 0 };
    for (const cache of this.values()) {
      const stats = cache.getStats();
      aggregated.hits += stats.hits;
      aggregated.misses += stats.misses;
      aggregated.evictions += stats.evictions;
      aggregated.sets += stats.sets;
    }
    return aggregated;
  }

  /**
   * Reset statistics for all instance caches.
   */
  resetStats() {
    for (const cache of this.values()) {
      cache.resetStats();
    }
  }
}

/**
 * Host object for cache storage.
 */
interface CacheHost {
  caches?: CacheMap;
}

/**
 * Resolve and return the `CacheMap` from a cache provider.
 *
 * The provider is expected to return a host object on which `caches`
 * will be lazily initialized to a `CacheMap`. If the provider returns
 * `null`, caching is disabled and `null` is returned.
 */
function getSource(
  provider: (target: object | null) => CacheHost | null,
  options: CacheOptions,
  target: object | null
): CacheMap | null {
  const cache = provider(target);
  if (cache === null) {
    return null;
  }
  cache.caches ??= new (options.cacheMap ?? CacheMap)(options);
  return cache.caches;
}

/**
 * Compute a deterministic hash for a list of arguments.
 *
 * Returns a base64-encoded SHA-256 digest, or `undefined` if any
 * argument cannot be serialized deterministically.
 */
export function argumentsHash(args: any[]): string | undefined {
  const hash = createHash("sha256");
  for (const arg of args) {
    if (arg === null) {
      hash.update("null");
    } else if (arg === undefined) {
      hash.update("undefined");
    } else if (typeof arg === "string" || typeof arg === "number" || typeof arg === "boolean") {
      // Primitives can be directly stringified
      hash.update(String(arg));
    } else if (typeof arg.toJSON === "function") {
      // Try toJSON first for objects with custom serialization
      try {
        hash.update(JSON.stringify(arg.toJSON()));
      } catch {
        return undefined;
      }
    } else if (Array.isArray(arg) || (typeof arg === "object" && arg.constructor === Object)) {
      // Plain objects and arrays - use JSON.stringify
      try {
        hash.update(JSON.stringify(arg));
      } catch {
        return undefined;
      }
    } else if (typeof arg.toString === "function" && arg.toString !== Object.prototype.toString) {
      // Custom toString implementation (not the default [object Object])
      hash.update(arg.toString());
    } else {
      // We cannot find a deterministic representation for the object
      return undefined;
    }
  }
  return hash.digest("base64");
}

/**
 * Compute a simple typed key for a list of arguments without hashing.
 *
 * Uses length-prefixed, type-tagged encoding to produce a unique string
 * representation for each distinct argument list, or `undefined` if any
 * argument cannot be serialized deterministically.
 *
 * Format per argument: `<TYPE><LENGTH>:<VALUE>` where TYPE is a single
 * uppercase letter identifying the argument type. No separator is needed
 * between arguments because the length prefix makes the encoding unambiguous.
 *
 * This is faster than {@link argumentsHash} because it skips the SHA-256
 * step. Keys may be longer in proportion to argument size. Prefer this
 * strategy for hot sync paths with small, simple arguments.
 */
export function argumentsSimpleKey(args: any[]): string | undefined {
  const parts: string[] = [];
  for (const arg of args) {
    if (arg === null) {
      // N — no content needed, null is unambiguous
      parts.push("N");
    } else if (arg === undefined) {
      // X — no content needed, undefined is unambiguous
      parts.push("X");
    } else if (typeof arg === "string") {
      parts.push("S" + arg.length + ":" + arg);
    } else if (typeof arg === "number") {
      const s = String(arg);
      parts.push("D" + s.length + ":" + s);
    } else if (typeof arg === "boolean") {
      const s = String(arg);
      parts.push("B" + s.length + ":" + s);
    } else if (typeof arg.toJSON === "function") {
      try {
        const j = JSON.stringify(arg.toJSON());
        parts.push("J" + j.length + ":" + j);
      } catch {
        return undefined;
      }
    } else if (Array.isArray(arg) || (typeof arg === "object" && arg.constructor === Object)) {
      try {
        const j = JSON.stringify(arg);
        parts.push("O" + j.length + ":" + j);
      } catch {
        return undefined;
      }
    } else if (typeof arg.toString === "function" && arg.toString !== Object.prototype.toString) {
      const s = arg.toString();
      parts.push("T" + s.length + ":" + s);
    } else {
      return undefined;
    }
  }
  return parts.join("");
}

let cacheLogger: (...args: any[]) => void = (...args: any[]) => {};
/**
 * Register a logger used by the cache system to report non-cacheable calls.
 */
export function registerCacheLogger(logger: (...args: any[]) => void) {
  cacheLogger = logger;
}

/**
 * Create a cache annotation (method decorator) bound to a given source provider.
 *
 * The returned decorator caches method results based on keys generated by
 * `methodKeyGenerator` and `classKeyGenerator`. It also exposes utility methods:
 * - `clear(target, propertyKey, ...args)`: Clear specific cache entry
 * - `clearAll(target, propertyKey?)`: Clear all or method-prefixed entries
 * - `garbageCollect()`: Run TTL-based cleanup
 */
export function createCacheAnnotation(source: (target: object | null) => object | null, options: CacheOptions = {}) {
  options.methodKeyGenerator ??= (property: string, args: any[]) => {
    if (options.hashStrategy === "simple") {
      const key = argumentsSimpleKey(args);
      return key !== undefined ? property + "$" + key : undefined;
    }
    const hash = argumentsHash(args);
    return hash ? property + "$" + hash : undefined;
  };

  options.classKeyGenerator ??= (instance: object) => instance;
  const globalOptions = options;

  const annotation = createMethodDecorator(
    (
      value: any,
      context: ClassMethodDecoratorContext,
      decoratorOptions?: {
        methodKeyGenerator?: CacheOptions["methodKeyGenerator"];
        classKeyGenerator?: CacheOptions["classKeyGenerator"];
      }
    ) => {
      const options: CacheOptions = { ...globalOptions, ...decoratorOptions };
      if (options.methodKeyGenerator && context.metadata) {
        (context.metadata as any)["webda.cache.methodKeyGenerator"] ??= {};
        (context.metadata as any)["webda.cache.methodKeyGenerator"][value.name] = options.methodKeyGenerator;
      }
      if (options.classKeyGenerator && context.metadata) {
        (context.metadata as any)["webda.cache.classKeyGenerator"] ??= {};
        (context.metadata as any)["webda.cache.classKeyGenerator"][value.name] = options.classKeyGenerator;
      }
      options.methodKeyGenerator ??= globalOptions.methodKeyGenerator;
      options.classKeyGenerator ??= globalOptions.classKeyGenerator;

      // eslint-disable-next-line func-names -- required to keep 'this' context
      return function (this: any, ...args: any[]) {
        const cache = getSource(source, options, this);
        const key = options.methodKeyGenerator!(value.name, args);
        const instanceKey = options.classKeyGenerator!(this);

        if (key && instanceKey && cache && cache.hasCachedMethod(instanceKey, key)) {
          return cache.getCachedMethod(instanceKey, key);
        }

        const res = value.apply(this, args);

        // Handle both sync and async methods
        if (res instanceof Promise) {
          // For async methods, cache the Promise itself to handle concurrent calls
          // but replace it with the resolved value once it resolves
          if (key && instanceKey && cache) {
            cache.setCachedMethod(instanceKey, key, args, res);
          }

          return res
            .then((resolvedValue: any) => {
              if (key && instanceKey && cache) {
                if (!options.shouldCache || options.shouldCache(resolvedValue)) {
                  // Replace Promise with resolved value
                  cache.setCachedMethod(instanceKey, key, args, resolvedValue);
                } else {
                  // shouldCache returned false: remove the pending Promise entry
                  if (cache.has(instanceKey)) {
                    cache.get(instanceKey)!.deleteCachedMethod(key);
                  }
                }
              }
              return resolvedValue;
            })
            .catch((error: any) => {
              // Remove from cache on error so it can be retried
              if (key && instanceKey && cache && cache.has(instanceKey)) {
                cache.get(instanceKey)!.deleteCachedMethod(key);
              }
              throw error;
            });
        }

        // Sync method
        if (key && instanceKey && cache) {
          if (!options.shouldCache || options.shouldCache(res)) {
            cache.setCachedMethod(instanceKey, key, args, res);
          }
          // shouldCache returning false is intentional — no warning needed
        } else {
          cacheLogger("WARN", "Cache cannot be stored, no key generated", this, value.name, args);
        }
        return res;
      };
    }
  ) as MethodDecorator & {
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey?: string) => void;
    garbageCollect: () => void;
    getStats: () => CacheStats;
    resetStats: () => void;
  };

  /**
   * Clear a specific cached entry for a target method and arguments.
   */
  annotation.clear = function clearCache(target: object, propertyKey: string, ...args: any[]) {
    const cache = getSource(source, options, target);
    if (!cache) return;

    const metadata = getMetadata((target.constructor ?? target) as any) as any;
    const keyGenerator = metadata?.["webda.cache.methodKeyGenerator"]?.[propertyKey] || options.methodKeyGenerator!;
    const classKeyGen = metadata?.["webda.cache.classKeyGenerator"]?.[propertyKey] || options.classKeyGenerator!;
    const instanceKey = classKeyGen(target);
    const key = keyGenerator(propertyKey, args);
    if (cache.has(instanceKey)) {
      cache.get(instanceKey)!.deleteCachedMethod(key);
    }
  };

  /**
   * Clear all cached entries for a target, or only those for a specific method.
   *
   * If `propertyKey` is provided, all entries with that method prefix are removed.
   */
  annotation.clearAll = function clearAllCache(target: object, propertyKey?: string) {
    const cache = getSource(source, options, target);
    if (!cache) return;

    const metadata = getMetadata((target.constructor ?? target) as any) as any;
    const classKeyGen = propertyKey
      ? metadata?.["webda.cache.classKeyGenerator"]?.[propertyKey] || options.classKeyGenerator!
      : options.classKeyGenerator!;
    const instanceKey = classKeyGen(target);

    if (cache.has(instanceKey)) {
      if (propertyKey === undefined) {
        cache.delete(instanceKey);
      } else {
        cache.get(instanceKey)!.deleteCachedMethod(propertyKey + "$");
      }
    }
  };

  /**
   * Run garbage collection on the underlying `CacheMap`.
   */
  annotation.garbageCollect = function garbageCollect() {
    const cache = getSource(source, options, null);
    if (cache) {
      cache.garbageCollect();
    }
  };

  /**
   * Get aggregated cache statistics.
   */
  annotation.getStats = function getStats(): CacheStats {
    const cache = getSource(source, options, null);
    if (cache) {
      return cache.getStats();
    }
    return { hits: 0, misses: 0, evictions: 0, sets: 0 };
  };

  /**
   * Reset cache statistics.
   */
  annotation.resetStats = function resetStats() {
    const cache = getSource(source, options, null);
    if (cache) {
      cache.resetStats();
    }
  };

  return annotation;
}

const symbol = Symbol.for("webda.caches");

/**
 * Cache decorator using a process-level storage.
 *
 * Suitable for cross-instance caching within the same Node.js process.
 */
const ProcessCache = createCacheAnnotation(() => {
  const p = process as any;
  p[symbol] ??= {};
  return p[symbol];
});

/**
 * Cache decorator using an object-level storage (per instance).
 *
 * Suitable for encapsulated caches tied to specific objects.
 */
const ObjectCache = createCacheAnnotation((target: object | null) => {
  if (target === null) return null;
  const t = target as any;
  t[symbol] ??= {};
  return t[symbol];
});

export { ProcessCache, ObjectCache };
