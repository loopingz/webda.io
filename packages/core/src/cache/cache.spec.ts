import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { InstanceCache } from "./cache";

let callCount = 0;

class MyObject {
  @InstanceCache()
  method(argument1: string, argument2: any) {
    callCount++;
    return callCount;
  }
}

@suite
class CacheTest {
  @test
  async instanceCache() {
    let obj1 = new MyObject();
    assert.strictEqual(obj1.method("test", 1), 1);
    assert.strictEqual(obj1.method("test", 1), 1);
  }
}
