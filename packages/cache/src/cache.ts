import { createMethodDecorator, MethodDecorator, getMetadata } from "@webda/decorators";
import { createHash } from "node:crypto";

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

function getSource(provider: () => any, options: CacheOptions): CacheMap {
  const cache = provider();
  // @ts-ignore
  cache.caches ??= new (options.cacheMap ?? CacheMap)(options);
  return cache.caches;
}

interface CacheOptions {
  keyGenerator?: (property: string, args: any[]) => string;
  ttl?: number; // milliseconds
  cacheMap?: new (options: CacheOptions) => CacheMap;
  cacheStorage?: new (options?: CacheOptions) => CacheStorage;
}

export function createCacheAnnotation(source: () => any, options: CacheOptions = {}) {
  options.keyGenerator ??= (property: string, args: any[]) =>
    property + "$" + createHash("sha256").update(JSON.stringify(args)).digest("base64");

  const annotation: MethodDecorator & {
    garbageCollect: () => void;
    clear: (target: object, propertyKey: string, ...args: any[]) => void;
    clearAll: (target: object, propertyKey: string) => void;
  } = createMethodDecorator(
    (value: any, context: ClassMethodDecoratorContext, keyGenerator?: (property: string, args: any[]) => string) => {
      if (keyGenerator) {
        context.metadata["webda.cache.keyGenerator"] ??= {};
        context.metadata["webda.cache.keyGenerator"][value.name] = keyGenerator;
      }
      // eslint-disable-next-line func-names -- required to keep 'this' context
      return function (...args: any[]) {
        const cache = getSource(source, options);
        keyGenerator ??= options.keyGenerator;
        const key = keyGenerator(value.name, args);
        if (cache.hasCachedMethod(this, key)) {
          return cache.getCachedMethod(this, key);
        }
        const res = value.apply(this, args);
        cache.setCachedMethod(this, key, args, res);
        return res;
      };
    }
  );

  annotation.clear = function clearCache(target: any, propertyKey: string, ...args: any[]) {
    const cache = getSource(source, options);
    const keyGenerator =
      getMetadata(target.constructor ? target.constructor : target)?.["webda.cache.keyGenerator"]?.[propertyKey] ||
      options.keyGenerator;
    const key = keyGenerator(propertyKey, args);
    if (cache.has(target)) {
      cache.get(target).deleteCachedMethod(key);
    }
  };
  annotation.clearAll = function clearAllCache(target: any, propertyKey: string) {
    const cache = getSource(source, options);
    if (cache.has(target)) {
      cache.get(target).deleteCachedMethod(propertyKey + "$");
    }
  };
  annotation.garbageCollect = function garbageCollect() {
    const cache = getSource(source, options);
    cache.garbageCollect();
  };
  return annotation;
}

process["webdaCaches"] ??= {};
const ProcessCache = createCacheAnnotation(() => process["webdaCaches"]);

export { ProcessCache };
