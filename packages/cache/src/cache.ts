import { createMethodDecorator, MethodDecorator, getMetadata } from "@webda/decorators";
import { createHash } from "node:crypto";
import * as util from "node:util";

/**
 * Storage for a single instance
 */
class CacheStorage extends Map<string, { value: any; timestamp: number }> {
  constructor(private options?: CacheOptions) {
    super();
  }

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
  setCachedMethod(key: string, args: any[], value: any) {
    // Might want to not use Date.now() on every set, but use a every N seconds tick instead
    this.set(key, { value, timestamp: Date.now() });
  }
  getCachedMethod(key: string) {
    const cached = this.get(key);
    return cached?.value;
  }

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

class CacheMap<T extends object = object> extends Map<T, CacheStorage> {
  constructor(private options?: CacheOptions) {
    super();
  }

  getCachedMethod(target: T, key: string) {
    return this.get(target).getCachedMethod(key);
  }

  hasCachedMethod(target: T, key: string) {
    if (this.has(target)) {
      const cache = this.get(target);
      return cache.hasCachedMethod(key);
    }
    return false;
  }

  setCachedMethod(target: T, key: string, args: any[], value: any) {
    if (!this.has(target)) {
      this.set(target, new (this.options.cacheStorage ?? CacheStorage)(this.options));
    }
    const cache = this.get(target);
    cache.setCachedMethod(key, args, value);
  }

  garbageCollect() {
    for (const [target, cache] of this.entries()) {
      cache.garbageCollect();
    }
  }
}

function getSource(provider: (target: Object) => any, options: CacheOptions, target: Object): CacheMap {
  const cache = provider(target);
  if (cache === null) {
    return null;
  }
  // @ts-ignore
  cache.caches ??= new (options.cacheMap ?? CacheMap)(options);
  return cache.caches;
}

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
  classKeyGenerator?: (instance: object) => any;
  /**
   * Define how long the cache should be kept
   */
  ttl?: number; // milliseconds
  cacheMap?: new (options: CacheOptions) => CacheMap;
  cacheStorage?: new (options?: CacheOptions) => CacheStorage;
}

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

var cacheLogger: (...args: any[]) => void = (...args: any[]) => {
};
export function registerCacheLogger(logger: (...args: any[]) => void) {
   cacheLogger = logger;
}

export function createCacheAnnotation(source: (target: Object | null) => Object | null, options: CacheOptions = {}) {
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

  annotation.clear = function clearCache(target: Object, propertyKey: string, ...args: any[]) {
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
  annotation.clearAll = function clearAllCache(target: Object, propertyKey?: string) {
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
  annotation.garbageCollect = function garbageCollect() {
    const cache = getSource(source, options, null);
    if (cache) {
      cache.garbageCollect();
    }
  };
  return annotation;
}

const symbol = Symbol.for("webda.caches");

const ProcessCache = createCacheAnnotation(() => {
  process[symbol] ??= {};
  return process[symbol];
});
const ObjectCache = createCacheAnnotation(target => {
  if (target === null) return null;
  target[symbol] ??= {};
  return target[symbol];
});

export { ProcessCache, ObjectCache };
