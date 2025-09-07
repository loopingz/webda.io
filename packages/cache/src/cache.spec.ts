import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createCacheAnnotation, ProcessCache } from "./cache";
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
  @InstanceCache()
  method(argument1: string, argument2: any) {
    callCount++;
    return callCount;
  }

  @InstanceCache()
  static method2(arg: string) {
    callCount++;
    return callCount;
  }

  @ProcessCache(processKey)
  processCachedMethod(argument1: string, argument2: any) {
    callCount++;
    return callCount;
  }

  @TTLCache()
  ttlCachedMethod(argument1: string, argument2: any) {
    callCount++;
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
}
