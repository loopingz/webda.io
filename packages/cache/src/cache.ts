import { createMethodDecorator, MethodDecorator, getMetadata } from "@webda/decorators";
import { createHash } from "node:crypto";

/**
 * Storage for cached method results for a single instance.
 *
 * Maintains an internal timestamp per entry to support TTL-based
 * invalidation during reads and garbage collection.
 *
 * Keys are method-level cache keys produced by `methodKeyGenerator`.
 */
class CacheStorage extends Map<string, { value: any; timestamp: number }> {
  constructor(private options?: CacheOptions) {
    super();
  }

  /**
   * Check whether a cached value exists and is still valid.
   * Applies TTL: if an entry is expired, it is evicted and treated as missing.
   */
  hasCachedMethod(key: string) {
    // Implement TTL check if needed
    if (this.options?.ttl) {
      const cached = this.get(key);
      if (cached && Date.now() - cached.timestamp > this.options.ttl) {
        this.delete(key);
        return false;
      }
    }
    return this.has(key);
  }
  /**
   * Store a cached value for the given method key.
   *
   * Note: `args` is accepted for potential future strategies but not used here.
   */
  setCachedMethod(key: string, args: any[], value: any) {
    // Might want to not use Date.now() on every set, but use a every N seconds tick instead
    this.set(key, { value, timestamp: Date.now() });
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
      for (const k of this.keys()) {
        if (k.startsWith(key)) {
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
      for (const [key, { timestamp }] of this.entries()) {
        if (now - timestamp > this.options.ttl) {
          this.delete(key);
        }
      }
    }
  }
}

/**
 * Cache map storing `CacheStorage` per instance key.
 *
 * The instance key is produced by `classKeyGenerator`.
 */
class CacheMap<T extends object = object> extends Map<T, CacheStorage> {
  constructor(private options?: CacheOptions) {
    super();
  }

  /**
   * Get a cached value for a given instance and method key.
   */
  getCachedMethod(target: T, key: string) {
    return this.get(target).getCachedMethod(key);
  }

  /**
   * Check if a cached value exists for the given instance and method key.
   */
  hasCachedMethod(target: T, key: string) {
    if (this.has(target)) {
      const cache = this.get(target);
      return cache.hasCachedMethod(key);
    }
    return false;
  }

  /**
   * Store a cached value for the given instance + method key.
   */
  setCachedMethod(target: T, key: string, args: any[], value: any) {
    if (!this.has(target)) {
      this.set(target, new (this.options.cacheStorage ?? CacheStorage)(this.options));
    }
    const cache = this.get(target);
    cache.setCachedMethod(key, args, value);
  }

  /**
   * Trigger garbage collection on all instance stores.
   */
  garbageCollect() {
    for (const [target, cache] of this.entries()) {
      cache.garbageCollect();
    }
  }
}

/**
 * Resolve and return the `CacheMap` from a cache provider.
 *
 * The provider is expected to return a host object on which `caches`
 * will be lazily initialized to a `CacheMap`. If the provider returns
 * `null`, caching is disabled and `null` is returned.
 */
function getSource(provider: (target: object) => any, options: CacheOptions, target: object): CacheMap {
  const cache = provider(target);
  if (cache === null) {
    return null;
  }
  // @ts-ignore
  cache.caches ??= new (options.cacheMap ?? CacheMap)(options);
  return cache.caches;
}

/**
 * Options controlling cache key generation and storage behavior.
 */
interface CacheOptions {
  /**
   * Define how to cache the method call
   * If undefined is returned then no caching is done
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
   * Define how long the cache should be kept
   */
  ttl?: number; // milliseconds
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
 * Compute a deterministic hash for a list of arguments.
 *
 * Returns a base64-encoded SHA-256 digest, or `undefined` if any
 * argument cannot be serialized deterministically.
 */
export function argumentsHash(args: any[]): string {
  const hash = createHash("sha256");
  for (const arg of args) {
    if (arg === null) {
      hash.update("null");
    } else if (arg === undefined) {
      hash.update("undefined");
    } else if (arg.toString) {
      hash.update(arg.toString());
    } else if (arg.toJSON){
      hash.update(JSON.stringify(arg));
    } else {
      // We cannot find a representation for the object so we won't be able to cache it
      return undefined;
    }
  }
  return hash.digest("base64");
}

let cacheLogger: (...args: any[]) => void = (...args: any[]) => {
};
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
    const hash = argumentsHash(args);
    return hash ? property + "$" + hash : undefined;
  }
    
  options.classKeyGenerator ??= (instance: object) => instance;
  const globalOptions = options;

  const annotation: MethodDecorator & {
    garbageCollect: () => void;
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey?: string) => void;
  } = createMethodDecorator(
    (
      value: any,
      context: ClassMethodDecoratorContext,
      options?: {
        methodKeyGenerator?: CacheOptions["methodKeyGenerator"];
        classKeyGenerator?: CacheOptions["classKeyGenerator"];
      }
    ) => {
      options = { ...globalOptions, ...options };
      if (options.methodKeyGenerator) {
        context.metadata["webda.cache.methodKeyGenerator"] ??= {};
        context.metadata["webda.cache.methodKeyGenerator"][value.name] = options.methodKeyGenerator;
      }
      if (options.classKeyGenerator) {
        context.metadata["webda.cache.classKeyGenerator"] ??= {};
        context.metadata["webda.cache.classKeyGenerator"][value.name] = options.classKeyGenerator;
      }
      options.methodKeyGenerator ??= globalOptions.methodKeyGenerator;
      options.classKeyGenerator ??= globalOptions.classKeyGenerator;

      // eslint-disable-next-line func-names -- required to keep 'this' context
      return function (...args: any[]) {
        const cache = getSource(source, options, this);
        const key = options.methodKeyGenerator(value.name, args);
        const instanceKey = options.classKeyGenerator(this);
        if (key && instanceKey && cache.hasCachedMethod(instanceKey, key)) {
          return cache.getCachedMethod(instanceKey, key);
        }
        const res = value.apply(this, args);
        if (key && instanceKey) {
          cache.setCachedMethod(instanceKey, key, args, res);
        } else {
          // Cannot log
          cacheLogger("WARN", "Cache cannot be stored, no key generated", this, value.name, args);
        }
        return res;
      };
    }
  );

  /**
   * Clear a specific cached entry for a target method and arguments.
   */
  annotation.clear = function clearCache(target: object, propertyKey: string, ...args: any[]) {
    const cache = getSource(source, options, target);
    const keyGenerator =
      getMetadata(target.constructor ?? target)?.["webda.cache.methodKeyGenerator"]?.[propertyKey] ||
      options.methodKeyGenerator;
    const instanceKey = (
      getMetadata(target.constructor ?? target)?.["webda.cache.classKeyGenerator"]?.[propertyKey] ||
      options.classKeyGenerator
    )(target);
    const key = keyGenerator(propertyKey, args);
    if (cache.has(instanceKey)) {
      cache.get(instanceKey).deleteCachedMethod(key);
    }
  };
  /**
   * Clear all cached entries for a target, or only those for a specific method.
   *
   * If `propertyKey` is provided, all entries with that method prefix are removed.
   */
  annotation.clearAll = function clearAllCache(target: object, propertyKey?: string) {
    const instanceKey = (
      getMetadata(target.constructor ?? target)?.["webda.cache.classKeyGenerator"]?.[propertyKey] ||
      options.classKeyGenerator
    )(target);
    const cache = getSource(source, options, target);
    if (cache.has(instanceKey)) {
      if (propertyKey === undefined) {
        cache.delete(instanceKey);
      } else {
        cache.get(instanceKey).deleteCachedMethod(propertyKey + "$");
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
  return annotation;
}

const symbol = Symbol.for("webda.caches");

/**
 * Cache decorator using a process-level storage.
 *
 * Suitable for cross-instance caching within the same Node.js process.
 */
const ProcessCache = createCacheAnnotation(() => {
  process[symbol] ??= {};
  return process[symbol];
});
/**
 * Cache decorator using an object-level storage (per instance).
 *
 * Suitable for encapsulated caches tied to specific objects.
 */
const ObjectCache = createCacheAnnotation(target => {
  if (target === null) return null;
  target[symbol] ??= {};
  return target[symbol];
});

export { ProcessCache, ObjectCache };
