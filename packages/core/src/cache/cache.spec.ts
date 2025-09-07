import { suite, test } from "@webda/test";
import * as assert from "assert";
import { InstanceCache, ProcessCache, SessionCache, ContextCache } from "./cache";
import { runWithInstanceStorage } from "../core/instancestorage";
import { runWithContext } from "../contexts/execution";

let callCount = 0;
function processKey(method: string, args: any[]) {
  return args[0];
}

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
  @ContextCache()
  contextCachedMethod(argument1: string, argument2: any) {
    callCount++;
    return callCount;
  }
  @SessionCache()
  sessionCachedMethod(argument1: string, argument2: any) {
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
    assert.strictEqual(obj.processCachedMethod("test", 2), 1);
    assert.strictEqual(obj.processCachedMethod("test2", 2), 2);
  }

  @test
  async contextCache() {
    const fakeContext: any = {};
    const fakeContext2: any = {};
    const obj = new MyObject();
    callCount = 0;
    await runWithContext(fakeContext, async () => {
      assert.strictEqual(obj.contextCachedMethod("test", 1), 1);
      assert.strictEqual(obj.contextCachedMethod("test", 1), 1);
      assert.strictEqual(obj.contextCachedMethod("test", 2), 2);
      assert.strictEqual(obj.contextCachedMethod("test", 2), 2);
      await runWithContext(fakeContext2, async () => {
        assert.strictEqual(obj.contextCachedMethod("test", 2), 3);
        assert.strictEqual(obj.contextCachedMethod("test", 2), 3);
      });
    });
  }

  @test
  async sessionCache() {
    const session1 = {};
    const session2 = {};
    const fakeContext: any = {
      getSession: () => session1
    };
    const obj = new MyObject();
    callCount = 0;
    await runWithContext(fakeContext, async () => {
      assert.strictEqual(obj.sessionCachedMethod("test", 1), 1);
      assert.strictEqual(obj.sessionCachedMethod("test", 1), 1);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 2);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 2);
      fakeContext.getSession = () => session2;
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 3);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 3);
      fakeContext.getSession = () => session1;
      SessionCache.clear(obj, "sessionCachedMethod", "test", 2);
      assert.strictEqual(obj.sessionCachedMethod("test", 1), 1);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 4);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 4);
      SessionCache.clearAll(obj, "sessionCachedMethod");
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 5);
      assert.strictEqual(obj.sessionCachedMethod("test", 1), 6);
      assert.strictEqual(obj.sessionCachedMethod("test", 1), 6);
      assert.strictEqual(obj.sessionCachedMethod("test", 2), 5);
    });
  }
}
