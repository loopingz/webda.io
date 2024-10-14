class CacheStorage extends Map<string, any> {
  getKey(property: string, args: any[]) {
    return property + "$" + JSON.stringify(args);
  }

  hasCachedMethod(property: string, args: any[]) {
    return this.has(this.getKey(property, args));
  }
  setCachedMethod(property: string, args: any[], value: any) {
    this.set(this.getKey(property, args), value);
  }
  getCachedMethod(property: string, args: any[]) {
    return this.get(this.getKey(property, args));
  }

  deleteCachedMethod(property: string, args?: any[]) {
    if (args === undefined) {
      for (const key of this.keys()) {
        if (key.startsWith(property + "$")) {
          this.delete(key);
        }
      }
    } else {
      this.delete(this.getKey(property, args));
    }
  }
}

class CacheMap<T extends object = object> extends WeakMap<T, CacheStorage> {
  getCachedMethod(target: T, propertyKey: string, args: any[]) {
    if (this.has(target)) {
      const cache = this.get(target);
      return cache.getCachedMethod(propertyKey, args);
    }
    return undefined;
  }

  hasCachedMethod(target: T, propertyKey: string, args: any[]) {
    if (this.has(target)) {
      const cache = this.get(target);
      return cache.hasCachedMethod(propertyKey, args);
    }
    return false;
  }

  setCachedMethod(target: T, propertyKey: string, args: any[], value: any) {
    if (!this.has(target)) {
      this.set(target, new CacheStorage());
    }
    const cache = this.get(target);
    cache.setCachedMethod(propertyKey, args, value);
  }
}

function getSource(provider: () => any): CacheMap {
  const cache = provider();
  cache.caches ??= new CacheMap();
  return cache.caches;
}

function defaultKeyGenerator(...args) {
  return "default";
}

function annotatedMethod(
  source: () => any,
  keyProvider: (...args: any[]) => string,
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
) {
  const originalMethod = descriptor.value;
  descriptor.value = function cachedMethod(...args: any[]) {
    // Generate a key based on the arguments
    //const key = keyProvider(this, target, propertyKey, descriptor, ...args);
    const cache = getSource(source);
    if (cache.hasCachedMethod(this, propertyKey, args)) {
      return cache.getCachedMethod(this, propertyKey, args);
    }
    const result = originalMethod.apply(this, args);
    cache.setCachedMethod(this, propertyKey, args, result);
    return result;
  };
  return descriptor;
}

export function createCacheAnnotation(source: () => any) {
  const annotation = function annotationDecorator(...args: [(() => string)?] | [any, string, PropertyDescriptor]): any {
    if (args.length === 3) {
      return annotatedMethod(source, defaultKeyGenerator, ...args);
    }
    return function arged(target, propertyKey, descriptor) {
      return annotatedMethod(source, args[0] ?? defaultKeyGenerator, target, propertyKey, descriptor);
    };
  };
  annotation.clear = function clearCache(target: any, propertyKey: string, ...args: any[]) {
    const cache = getSource(source);
    if (cache.has(target)) {
      cache.get(target).deleteCachedMethod(propertyKey, args);
    }
  };
  annotation.clearAll = function clearAllCache(target: any, propertyKey: string) {
    const cache = getSource(source);
    if (cache.has(target)) {
      cache.get(target).deleteCachedMethod(propertyKey);
    }
  };
  return annotation;
}

process["webdaCaches"] ??= {};
const ProcessCache = createCacheAnnotation(() => process["webdaCaches"]);

export { ProcessCache };
