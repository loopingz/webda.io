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

const InstanceCache = createCacheAnnotation(() => storage.getStore());

let callCount = 0;
function processKey() {
  return "test";
}

/**
 * Test the cache
 */
class MyObject {
  @InstanceCache
  method(argument1: string, argument2: any) {
    callCount++;
    return callCount;
  }

  @InstanceCache
  static method2(arg: string) {
    callCount++;
    return callCount;
  }

  @ProcessCache(processKey)
  processCachedMethod(argument1: string, argument2: any) {
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
    assert.strictEqual(obj.processCachedMethod("test", 1), 1);
    assert.strictEqual(obj.processCachedMethod("test", 1), 1);
    assert.strictEqual(obj.processCachedMethod("test", 2), 2);
    assert.strictEqual(obj.processCachedMethod("test", 2), 2);
  }
}
