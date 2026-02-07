# @webda/cache

A flexible method-level caching library with decorator support, TTL expiration, and multiple storage strategies.

## Features

- **Method-level caching** using TypeScript decorators
- **Multiple storage strategies**: Process-level, Object-level, or custom
- **TTL support** with automatic expiration
- **LRU eviction** when cache size limits are reached
- **Async method support** with Promise caching
- **Cache statistics** tracking (hits, misses, evictions)
- **Automatic garbage collection** with configurable intervals
- **Customizable key generation** for fine-grained control

## Installation

```bash
npm install @webda/cache
```

## Quick Start

### Basic Usage with Object Cache

```typescript
import { ObjectCache } from "@webda/cache";

class UserService {
  @ObjectCache()
  async fetchUser(id: string) {
    // This will only be called once per unique id per instance
    return await db.users.findById(id);
  }
}

const service = new UserService();
await service.fetchUser("123"); // Fetches from DB
await service.fetchUser("123"); // Returns cached value
```

### Process-level Cache

```typescript
import { ProcessCache } from "@webda/cache";

class ConfigService {
  @ProcessCache()
  static getConfig(env: string) {
    // Cached across all instances in the same process
    return loadConfig(env);
  }
}
```

### TTL-based Cache

```typescript
import { createCacheAnnotation } from "@webda/cache";

const ttlCache: { caches?: Map<any, any> } = {};
const TTLCache = createCacheAnnotation(() => ttlCache, {
  ttl: 60000 // Cache for 60 seconds
});

class ApiService {
  @TTLCache()
  async fetchData(endpoint: string) {
    return await fetch(endpoint).then(r => r.json());
  }
}
```

## Advanced Usage

### LRU Cache with Size Limit

```typescript
const lruCache = {};
const LRUCache = createCacheAnnotation(() => lruCache, {
  maxSize: 100, // Keep only 100 most recent entries
  ttl: 300000   // 5 minutes
});

class DataService {
  @LRUCache()
  processData(input: any) {
    return expensiveComputation(input);
  }
}
```

### Custom Key Generation

```typescript
// Only use the first argument for cache key
function firstArgKey(property: string, args: any[]) {
  return `${property}$${args[0]}`;
}

const CustomCache = createCacheAnnotation(() => ({}), {
  methodKeyGenerator: firstArgKey
});

class SearchService {
  @CustomCache()
  search(query: string, options: object) {
    // Cached only by query, ignoring options
    return performSearch(query, options);
  }
}
```

### Automatic Garbage Collection

```typescript
const autoGCCache = {};
const AutoGCCache = createCacheAnnotation(() => autoGCCache, {
  ttl: 60000,
  gcInterval: 30000 // Run GC every 30 seconds
});
```

### Cache Statistics

```typescript
const statsCache = {};
const StatsCache = createCacheAnnotation(() => statsCache, {
  enableStats: true
});

class MetricsService {
  @StatsCache()
  calculate(data: any) {
    return expensiveCalculation(data);
  }
}

// Get statistics
const stats = StatsCache.getStats();
console.log(`Hits: ${stats.hits}, Misses: ${stats.misses}`);
console.log(`Hit Rate: ${(stats.hits / (stats.hits + stats.misses) * 100).toFixed(2)}%`);

// Reset statistics
StatsCache.resetStats();
```

### Manual Cache Control

```typescript
const cache = {};
const MyCache = createCacheAnnotation(() => cache);

class Service {
  @MyCache()
  getData(id: string) {
    return fetchData(id);
  }
}

const service = new Service();

// Clear specific cache entry
MyCache.clear(service, "getData", "123");

// Clear all entries for a method
MyCache.clearAll(service, "getData");

// Clear all entries for an instance
MyCache.clearAll(service);

// Manual garbage collection
MyCache.garbageCollect();
```

### AsyncLocalStorage Context Cache

```typescript
import { createCacheAnnotation } from "@webda/cache";
import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage();
const ContextCache = createCacheAnnotation(() => storage.getStore());

function runWithContext(callback) {
  return storage.run({}, callback);
}

class RequestService {
  @ContextCache()
  processRequest(data: any) {
    // Cached per async context (e.g., per HTTP request)
    return process(data);
  }
}
```

## API Reference

### Pre-built Decorators

- **`ProcessCache`**: Cache at the process level (shared across all instances)
- **`ObjectCache`**: Cache at the instance level (per object)

### `createCacheAnnotation(source, options)`

Creates a custom cache decorator.

**Parameters:**
- `source`: Function that returns the cache host object
- `options`: Cache configuration options

**Options:**
- `ttl?: number` - Time to live in milliseconds
- `maxSize?: number` - Maximum cache entries (LRU eviction)
- `gcInterval?: number` - Auto garbage collection interval in ms
- `enableStats?: boolean` - Enable statistics tracking
- `methodKeyGenerator?: (property, args) => string` - Custom key generation
- `classKeyGenerator?: (instance) => any` - Custom instance key generation
- `cacheMap?: CacheMapConstructor` - Custom CacheMap implementation
- `cacheStorage?: CacheStorageConstructor` - Custom CacheStorage implementation

**Methods:**
- `clear(target, propertyKey, ...args)` - Clear specific cache entry
- `clearAll(target, propertyKey?)` - Clear all or method-specific entries
- `garbageCollect()` - Run garbage collection
- `getStats()` - Get cache statistics
- `resetStats()` - Reset statistics to zero

### Cache Statistics

```typescript
interface CacheStats {
  hits: number;       // Cache hits
  misses: number;     // Cache misses
  evictions: number;  // Entries evicted (TTL or LRU)
  sets: number;       // Entries added to cache
}
```

## Best Practices

1. **Use TTL for time-sensitive data** to prevent stale data
2. **Set maxSize for unbounded inputs** to prevent memory leaks
3. **Enable stats in development** to monitor cache effectiveness
4. **Use Object-level cache** for instance-specific data
5. **Use Process-level cache** for shared static data
6. **Implement custom key generators** for complex argument patterns
7. **Enable auto GC** for long-running processes with TTL

## Performance Considerations

- Key generation uses SHA-256 hashing for complex arguments
- LRU eviction is O(1) using Map insertion order
- TTL checks happen on access (lazy evaluation)
- Automatic GC runs in background with `unref()` timer

## License

See repository license.
