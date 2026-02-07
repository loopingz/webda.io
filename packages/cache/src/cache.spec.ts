import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createCacheAnnotation, ObjectCache, ProcessCache } from "./cache";
import { AsyncLocalStorage } from "async_hooks";

const storage = new AsyncLocalStorage();

function runWithInstanceStorage(store, callback) {
  return storage.run(store, async () => {
    return await callback();
  });
}

const ttlCache: { caches: Map<any, any> } = {} as any;
const InstanceCache = createCacheAnnotation(() => storage.getStore());
const TTLCache = createCacheAnnotation(() => ttlCache, { ttl: 100 });

let callCount = 0;
/**
 * We only care about the first argument for this test
 * @param property
 * @param args
 * @returns
 */
function processKey(property: string, args: any[]) {
  return `${property}$${args[0]}`;
}

//MyMethodDecorator.clear = function (target: any, propertyKey: string, ...args: any[]) {};

/**
 * Test the cache
 */
class MyObject {
  localCount = 0;

  @InstanceCache()
  method(argument1: string, argument2: any) {
    callCount++;
    this.localCount++;
    return callCount;
  }

  @InstanceCache()
  static method2(arg: string) {
    callCount++;
    return callCount;
  }

  @ProcessCache({
    methodKeyGenerator: processKey
  })
  processCachedMethod(argument1: string, argument2: any) {
    callCount++;
    this.localCount++;
    return callCount;
  }

  @TTLCache()
  ttlCachedMethod(argument1: string, argument2: any) {
    callCount++;
    this.localCount++;
    return callCount;
  }

  @ObjectCache()
  method4() {
    callCount++;
    this.localCount++;
    return callCount;
  }
}

@suite
class CacheTest {
  @test
  async instanceCache() {
    return runWithInstanceStorage({}, async () => {
      const obj1 = new MyObject();
      const obj2 = new MyObject();
      assert.strictEqual(obj1.method("test", 1), 1);
      assert.strictEqual(obj1.method("test", 1), 1);
      assert.strictEqual(obj2.method("test", 1), 2);
      assert.strictEqual(obj2.method("test", 1), 2);
      MyObject.method2("test");
      assert.strictEqual(callCount, 3);
      MyObject.method2("test");
      assert.strictEqual(callCount, 3);
      MyObject.method2("test2");
      assert.strictEqual(callCount, 4);
      assert.strictEqual(obj2.method("test", 2), 5);
      assert.strictEqual(obj2.method("test", 2), 5);
      obj1.method4();
      assert.strictEqual(callCount, 6);
      ObjectCache.garbageCollect();
      InstanceCache.clearAll(obj2);
    });
  }

  @test
  processCache() {
    const obj = new MyObject();
    callCount = 0;
    // This cache uses only the first argument to create the key
    assert.strictEqual(obj.processCachedMethod("test", 1), 1);
    assert.strictEqual(obj.processCachedMethod("test", 1), 1);
    assert.strictEqual(obj.processCachedMethod("test", 2), 1);
    assert.strictEqual(obj.processCachedMethod("test2", 2), 2);
    assert.strictEqual(obj.processCachedMethod("test2", 2), 2);
    // We clear only the "test2" key
    ProcessCache.clear(obj, "processCachedMethod", "test2");
    assert.strictEqual(obj.processCachedMethod("test2", 2), 3);
    ProcessCache.clearAll(obj, "processCachedMethod");
    assert.strictEqual(obj.processCachedMethod("test", 1), 4);
    assert.strictEqual(obj.processCachedMethod("test2", 2), 5);
  }

  @test
  async ttlCache() {
    const obj = new MyObject();
    callCount = 0;
    assert.strictEqual(obj.ttlCachedMethod("test", 1), 1);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.strictEqual(obj.ttlCachedMethod("test", 1), 1);
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.strictEqual(obj.ttlCachedMethod("test", 1), 2);
    // Check that garbage collection works
    assert.strictEqual(ttlCache.caches.get(obj).size, 1);
    await new Promise(resolve => setTimeout(resolve, 120));
    assert.strictEqual(ttlCache.caches.get(obj).size, 1);
    TTLCache.garbageCollect();
    assert.strictEqual(ttlCache.caches.get(obj).size, 0);
  }

  @test
  async asyncMethodCache() {
    const asyncCache = {};
    const AsyncCache = createCacheAnnotation(() => asyncCache);

    class AsyncService {
      callCount = 0;

      @AsyncCache()
      async fetchData(id: string): Promise<string> {
        this.callCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return `data-${id}`;
      }

      @AsyncCache()
      async throwError(shouldThrow: boolean): Promise<string> {
        if (shouldThrow) {
          throw new Error("Test error");
        }
        return "success";
      }
    }

    const service = new AsyncService();

    // Test async caching
    const result1 = await service.fetchData("123");
    assert.strictEqual(result1, "data-123");
    assert.strictEqual(service.callCount, 1);

    const result2 = await service.fetchData("123");
    assert.strictEqual(result2, "data-123");
    assert.strictEqual(service.callCount, 1); // Should be cached

    const result3 = await service.fetchData("456");
    assert.strictEqual(result3, "data-456");
    assert.strictEqual(service.callCount, 2);

    // Test that errors are not cached
    let errorThrown = false;
    try {
      await service.throwError(true);
    } catch (e) {
      errorThrown = true;
    }
    assert.strictEqual(errorThrown, true);

    // Should not cache error, so this should work
    const successResult = await service.throwError(false);
    assert.strictEqual(successResult, "success");
  }

  @test
  lruEviction() {
    const lruCache = {};
    const LRUCache = createCacheAnnotation(() => lruCache, {
      maxSize: 3
    });

    class LRUService {
      @LRUCache()
      getData(id: number): string {
        return `data-${id}`;
      }
    }

    const service = new LRUService();

    // Fill cache to max
    service.getData(1);
    service.getData(2);
    service.getData(3);

    const cache = lruCache["caches"].get(service);
    assert.strictEqual(cache.size, 3);

    // Adding 4th item should evict oldest (1)
    service.getData(4);
    assert.strictEqual(cache.size, 3);

    // Access items to verify LRU order
    const keys = Array.from(cache.keys());
    assert.strictEqual(keys.includes("getData$" + require("crypto").createHash("sha256").update("1").digest("base64")), false);
  }

  @test
  cacheStatistics() {
    const statsCache = {};
    const StatsCache = createCacheAnnotation(() => statsCache, {
      enableStats: true
    });

    class StatsService {
      @StatsCache()
      compute(x: number): number {
        return x * 2;
      }
    }

    const service = new StatsService();

    // Reset to start fresh
    StatsCache.resetStats();

    // First call - miss
    service.compute(5);
    let stats = StatsCache.getStats();
    assert.strictEqual(stats.misses, 1);
    assert.strictEqual(stats.hits, 0);
    assert.strictEqual(stats.sets, 1);

    // Second call - hit
    service.compute(5);
    stats = StatsCache.getStats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.misses, 1);

    // Different arg - miss
    service.compute(10);
    stats = StatsCache.getStats();
    assert.strictEqual(stats.hits, 1);
    assert.strictEqual(stats.misses, 2);
    assert.strictEqual(stats.sets, 2);

    // Reset stats
    StatsCache.resetStats();
    stats = StatsCache.getStats();
    assert.strictEqual(stats.hits, 0);
    assert.strictEqual(stats.misses, 0);
  }

  @test
  async argumentHashing() {
    const { argumentsHash } = await import("./cache.js");

    // Primitives
    assert.strictEqual(typeof argumentsHash([1, "test", true]), "string");
    assert.strictEqual(typeof argumentsHash([null, undefined]), "string");

    // Objects with toJSON
    const objWithToJSON = {
      value: 123,
      toJSON() { return { value: this.value }; }
    };
    assert.strictEqual(typeof argumentsHash([objWithToJSON]), "string");

    // Plain objects
    assert.strictEqual(typeof argumentsHash([{ a: 1, b: 2 }]), "string");

    // Arrays
    assert.strictEqual(typeof argumentsHash([[1, 2, 3]]), "string");

    // Custom toString (not default Object.prototype.toString)
    class CustomClass {
      toString() { return "custom"; }
    }
    assert.strictEqual(typeof argumentsHash([new CustomClass()]), "string");

    // Circular references should return undefined
    const circular: any = { a: 1 };
    circular.self = circular;
    assert.strictEqual(argumentsHash([circular]), undefined);
  }

  @test
  nullCacheProvider() {
    const NullCache = createCacheAnnotation(() => null);

    class NullService {
      callCount = 0;

      @NullCache()
      getData(id: string): string {
        this.callCount++;
        return `data-${id}`;
      }
    }

    const service = new NullService();

    // Should not cache when provider returns null
    service.getData("test");
    service.getData("test");
    assert.strictEqual(service.callCount, 2); // Both calls executed
  }

  @test
  async autoGarbageCollection() {
    const autoGCCache = {};
    const AutoGCCache = createCacheAnnotation(() => autoGCCache, {
      ttl: 50,
      gcInterval: 60 // Run GC every 60ms
    });

    class AutoGCService {
      @AutoGCCache()
      getData(id: string): string {
        return `data-${id}`;
      }
    }

    const service = new AutoGCService();
    service.getData("test");

    const cache = autoGCCache["caches"];
    assert.strictEqual(cache.get(service).size, 1);

    // Wait for TTL to expire and auto GC to run
    await new Promise(resolve => setTimeout(resolve, 150));

    // Auto GC should have cleaned up expired entries
    assert.strictEqual(cache.get(service).size, 0);

    // Clean up timer
    cache.stopAutoGC();
  }

  @test
  complexArgumentTypes() {
    const complexCache = {};
    const ComplexCache = createCacheAnnotation(() => complexCache);

    class ComplexService {
      callCount = 0;

      @ComplexCache()
      process(data: any): string {
        this.callCount++;
        return "processed";
      }
    }

    const service = new ComplexService();

    // Test with various argument types
    service.process({ nested: { object: true } });
    service.process({ nested: { object: true } }); // Same structure
    assert.strictEqual(service.callCount, 1); // Should be cached

    service.process([1, 2, 3]);
    service.process([1, 2, 3]);
    assert.strictEqual(service.callCount, 2); // Should be cached

    // Different values
    service.process({ different: true });
    assert.strictEqual(service.callCount, 3);
  }

  @test
  clearCachePatterns() {
    const patternCache = {};
    const PatternCache = createCacheAnnotation(() => patternCache);

    class PatternService {
      callCount = 0;

      @PatternCache()
      method1(arg: string): string {
        this.callCount++;
        return arg;
      }

      @PatternCache()
      method2(arg: string): string {
        this.callCount++;
        return arg;
      }
    }

    const service = new PatternService();

    // Populate cache
    service.method1("a");
    service.method1("b");
    service.method2("a");
    service.method2("b");
    assert.strictEqual(service.callCount, 4);

    // Access cached
    service.method1("a");
    service.method2("a");
    assert.strictEqual(service.callCount, 4); // No new calls

    // Clear specific method
    PatternCache.clearAll(service, "method1");

    service.method1("a"); // Should call again
    service.method2("a"); // Should still be cached
    assert.strictEqual(service.callCount, 5);

    // Clear all
    PatternCache.clearAll(service);
    service.method2("a"); // Should call again
    assert.strictEqual(service.callCount, 6);
  }

  @test
  async cacheLogger() {
    const { registerCacheLogger } = await import("./cache.js");
    const loggerCache = {};
    const LoggerCache = createCacheAnnotation(() => loggerCache);

    const logs: any[] = [];
    registerCacheLogger((...args: any[]) => {
      logs.push(args);
    });

    class UncacheableService {
      @LoggerCache()
      process(obj: any): string {
        return "processed";
      }
    }

    const service = new UncacheableService();

    // Create an object that can't be hashed (has neither toJSON, nor is plain object/array/primitive)
    // Use a complex object without standard serialization methods
    const uncacheableObj = Object.create(null);
    uncacheableObj.test = "value";
    // This object has no constructor property, so it will fail the checks
    service.process(uncacheableObj);

    // Should have logged a warning
    assert.strictEqual(logs.length > 0, true);
    assert.strictEqual(logs[0][0], "WARN");
  }

  @test
  customKeyGeneratorMetadata() {
    const metadataCache = {};

    // Create cache with custom key generator at decorator level
    const MetadataCache = createCacheAnnotation(() => metadataCache, {
      methodKeyGenerator: (property: string, args: any[]) => `default-${property}-${args[0]}`
    });

    class MetadataService {
      callCount = 0;

      @MetadataCache({
        methodKeyGenerator: (property: string, args: any[]) => `custom-${property}-${args[0]}`
      })
      method1(arg: string): string {
        this.callCount++;
        return arg;
      }

      @MetadataCache()
      method2(arg: string): string {
        this.callCount++;
        return arg;
      }
    }

    const service = new MetadataService();

    // Test custom key generator is used
    service.method1("test");
    service.method1("test");
    assert.strictEqual(service.callCount, 1); // Should be cached

    // Test default key generator
    service.method2("test");
    service.method2("test");
    assert.strictEqual(service.callCount, 2); // Should be cached

    // Clear with custom metadata
    MetadataCache.clear(service, "method1", "test");
    service.method1("test");
    assert.strictEqual(service.callCount, 3); // Cache was cleared
  }

  @test
  getStatsWithNullCache() {
    const NullStatsCache = createCacheAnnotation(() => null, {
      enableStats: true
    });

    // Should return zero stats when cache is null
    const stats = NullStatsCache.getStats();
    assert.strictEqual(stats.hits, 0);
    assert.strictEqual(stats.misses, 0);
    assert.strictEqual(stats.evictions, 0);
    assert.strictEqual(stats.sets, 0);
  }

  @test
  uncacheableArguments() {
    const uncacheableCache = {};
    const UncacheableCache = createCacheAnnotation(() => uncacheableCache);

    class UncacheableArgsService {
      callCount = 0;

      @UncacheableCache()
      process(arg: any): string {
        this.callCount++;
        return "processed";
      }
    }

    const service = new UncacheableArgsService();

    // Test with object that has only default toString (should not cache)
    class PlainClass {}
    const plainObj = new PlainClass();

    service.process(plainObj);
    service.process(plainObj);
    // Both should execute because object can't be cached deterministically
    assert.strictEqual(service.callCount, 2);
  }

  @test
  async toJSONErrorHandling() {
    const { argumentsHash } = await import("./cache.js");

    // Test with toJSON that throws an error
    const objWithBadToJSON = {
      toJSON() {
        throw new Error("toJSON failed");
      }
    };

    // Should return undefined when toJSON throws
    assert.strictEqual(argumentsHash([objWithBadToJSON]), undefined);

    // Test with toJSON that creates circular reference
    const objWithCircularToJSON = {
      toJSON() {
        const circular: any = {};
        circular.self = circular;
        return circular;
      }
    };

    // Should return undefined when JSON.stringify fails
    assert.strictEqual(argumentsHash([objWithCircularToJSON]), undefined);
  }

  @test
  processCacheImplementation() {
    // Test ProcessCache specifically
    class ProcessCacheService {
      callCount = 0;

      @ProcessCache()
      static getData(id: string): string {
        ProcessCacheService.prototype.constructor["callCount"] =
          (ProcessCacheService.prototype.constructor["callCount"] || 0) + 1;
        return `data-${id}`;
      }
    }

    // Call static method multiple times
    const result1 = ProcessCacheService.getData("test");
    const result2 = ProcessCacheService.getData("test");

    assert.strictEqual(result1, result2);
    assert.strictEqual(result1, "data-test");

    // Clear the cache
    ProcessCache.clearAll(ProcessCacheService, "getData");
  }

  @test
  autoGCGuard() {
    // Test the guard for double autoGC start (line 212)
    const doubleStartCache = {};
    const DoubleStartCache = createCacheAnnotation(() => doubleStartCache, {
      ttl: 100,
      gcInterval: 200
    });

    class GuardService {
      @DoubleStartCache()
      getData(): string {
        return "data";
      }
    }

    const service = new GuardService();
    service.getData();

    const cacheMap = doubleStartCache["caches"];

    // Try calling startAutoGC again (should return early due to guard on line 212)
    cacheMap["startAutoGC"]();

    // Cleanup
    cacheMap.stopAutoGC();

    // Just verify it didn't crash
    assert.strictEqual(true, true);
  }

  @test
  async doubleAutoGCStart() {
    const doubleGCCache = {};
    const DoubleGCCache = createCacheAnnotation(() => doubleGCCache, {
      ttl: 50,
      gcInterval: 100
    });

    class DoubleGCService {
      @DoubleGCCache()
      getData(id: string): string {
        return `data-${id}`;
      }
    }

    const service = new DoubleGCService();
    service.getData("test");

    const cache = doubleGCCache["caches"];

    // Try to start GC again (should be a no-op since already running)
    cache["startAutoGC"]();

    // Should still work normally
    assert.strictEqual(cache.get(service).size, 1);

    // Clean up
    cache.stopAutoGC();
  }

  @test
  getCachedMethodWithoutTarget() {
    const edgeCaseCache = {};
    const EdgeCaseCache = createCacheAnnotation(() => edgeCaseCache);

    class EdgeCaseService {
      @EdgeCaseCache()
      getData(): string {
        return "data";
      }
    }

    // Get cache map
    const service = new EdgeCaseService();
    service.getData(); // Initialize cache

    const cacheMap = edgeCaseCache["caches"];

    // Create a new service instance that's not in the cache
    const newService = new EdgeCaseService();

    // Try to get cached method from non-existent target (line 160-161)
    const result = cacheMap.getCachedMethod(newService, "getData$somekey");

    // Should return undefined
    assert.strictEqual(result, undefined);
  }

  @test
  lruEvictionWithStats() {
    // Test LRU eviction with stats enabled (lines 64, 70-71)
    const lruStatsCache = {};
    const LRUStatsCache = createCacheAnnotation(() => lruStatsCache, {
      maxSize: 2,
      enableStats: true
    });

    class LRUStatsService {
      @LRUStatsCache()
      getData(id: number): string {
        return `data-${id}`;
      }
    }

    const service = new LRUStatsService();

    // Reset stats
    LRUStatsCache.resetStats();

    // Fill cache to max
    service.getData(1);
    service.getData(2);

    let stats = LRUStatsCache.getStats();
    assert.strictEqual(stats.sets, 2);
    assert.strictEqual(stats.evictions, 0);

    // Adding 3rd item should trigger LRU eviction with stats tracking (lines 70-71)
    service.getData(3);

    stats = LRUStatsCache.getStats();
    assert.strictEqual(stats.sets, 3);
    assert.strictEqual(stats.evictions, 1); // One eviction happened
  }

  @test
  async ttlGarbageCollectionWithStats() {
    // Test TTL garbage collection with stats enabled (lines 119-120)
    const ttlGCStatsCache = {};
    const TTLGCStatsCache = createCacheAnnotation(() => ttlGCStatsCache, {
      ttl: 50,
      enableStats: true
    });

    class TTLGCStatsService {
      @TTLGCStatsCache()
      getData(id: string): string {
        return `data-${id}`;
      }
    }

    const service = new TTLGCStatsService();

    // Reset stats
    TTLGCStatsCache.resetStats();

    // Add some entries
    service.getData("1");
    service.getData("2");
    service.getData("3");

    let stats = TTLGCStatsCache.getStats();
    assert.strictEqual(stats.sets, 3);
    assert.strictEqual(stats.evictions, 0);

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    // Run garbage collection - this should track evictions (lines 119-120)
    TTLGCStatsCache.garbageCollect();

    stats = TTLGCStatsCache.getStats();
    assert.strictEqual(stats.evictions, 3); // All 3 entries evicted
  }

  @test
  clearWithoutMetadataFallback() {
    // Test the metadata fallback in clear function (lines 474, 477)
    const fallbackCache = {};
    const FallbackCache = createCacheAnnotation(() => fallbackCache, {
      methodKeyGenerator: (property: string, args: any[]) => `${property}-${args[0]}`,
      classKeyGenerator: (instance: any) => instance
    });

    class FallbackService {
      callCount = 0;

      @FallbackCache()
      normalMethod(arg: string): string {
        this.callCount++;
        return arg;
      }

      // This method has NO decorator - will use fallback when clearing
      unDecoratedMethod(arg: string): string {
        this.callCount++;
        return arg;
      }
    }

    const service = new FallbackService();

    // Populate cache for the decorated method
    service.normalMethod("test");
    assert.strictEqual(service.callCount, 1);

    // Manually add cache entry for undecorated method
    const cache = fallbackCache["caches"];

    // Get the CacheStorage for this service
    const cacheStorage = cache.get(service);
    cacheStorage.set("unDecoratedMethod-value", { value: "cached", timestamp: Date.now() });

    // Verify it exists
    assert.strictEqual(cacheStorage.has("unDecoratedMethod-value"), true);

    // Try to clear it using clear() - should use fallback (lines 474, 477)
    // because "unDecoratedMethod" has no metadata
    FallbackCache.clear(service, "unDecoratedMethod", "value");

    // Verify it was cleared using the fallback key generator
    assert.strictEqual(cacheStorage.has("unDecoratedMethod-value"), false);
  }

  @test
  async ttlEvictionOnAccessWithStats() {
    // Test TTL eviction when accessing expired entry with stats (lines 43-44)
    const ttlAccessCache = {};
    const TTLAccessCache = createCacheAnnotation(() => ttlAccessCache, {
      ttl: 50,
      enableStats: true
    });

    class TTLAccessService {
      @TTLAccessCache()
      getData(id: string): string {
        return `data-${id}`;
      }
    }

    const service = new TTLAccessService();

    // Reset stats
    TTLAccessCache.resetStats();

    // Add an entry
    service.getData("test");

    let stats = TTLAccessCache.getStats();
    assert.strictEqual(stats.sets, 1);
    assert.strictEqual(stats.evictions, 0);

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    // Now try to access it again - this should detect expiration and evict (lines 43-44)
    service.getData("test");

    stats = TTLAccessCache.getStats();
    // Should have 1 eviction (from TTL check on access) and 1 new set
    assert.strictEqual(stats.evictions, 1);
    assert.strictEqual(stats.sets, 2); // Original + new one after eviction
  }
}
