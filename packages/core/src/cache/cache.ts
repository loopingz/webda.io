/**
 * Cache the result of the method for the current context
 */
export function ContextCache() {}
ContextCache.clear = (key?: string) => {};

/**
 * Cache the result for the full user session
 */
export function SessionCache() {}
/**
 * Clear the cache
 * @param key
 */
SessionCache.clear = (key?: string) => {};

/**
 * Cache the result for the instance
 * @returns
 */
export function InstanceCache() {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    // console.log(target, propertyKey, descriptor);
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const cacheKey = `${propertyKey}_${args.join("_")}`;
      this.cache[cacheKey] ??= originalMethod.apply(this, args);
      return this.cache[cacheKey];
    };
  };
}

/**
 * Cache the result for the full application for one service
 */
export function StartupCache() {}
