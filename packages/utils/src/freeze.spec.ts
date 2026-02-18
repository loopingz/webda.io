"use strict";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { deepFreeze } from "./freeze";

@suite
export class DeepFreezeTest {
  @test
  async "should freeze simple object"() {
    const obj = { a: 1, b: 2 };
    const frozen = deepFreeze(obj);

    assert.strictEqual(Object.isFrozen(frozen), true);
    assert.throws(() => {
      (frozen as any).a = 3;
    });
  }

  @test
  async "should deep freeze nested objects"() {
    const obj = {
      a: 1,
      nested: {
        b: 2,
        deeper: {
          c: 3
        }
      }
    };

    const frozen = deepFreeze(obj);

    assert.strictEqual(Object.isFrozen(frozen), true);
    assert.strictEqual(Object.isFrozen(frozen.nested), true);
    assert.strictEqual(Object.isFrozen(frozen.nested.deeper), true);
  }

  @test
  async "should freeze arrays"() {
    const arr = [1, 2, { a: 3 }];
    const frozen = deepFreeze(arr);

    assert.strictEqual(Object.isFrozen(frozen), true);
    assert.strictEqual(Object.isFrozen(frozen[2]), true);
  }

  @test
  async "should handle null and undefined properties"() {
    const obj = {
      nullProp: null,
      undefinedProp: undefined,
      value: 1
    };

    const frozen = deepFreeze(obj);

    assert.strictEqual(Object.isFrozen(frozen), true);
    assert.strictEqual(frozen.nullProp, null);
    assert.strictEqual(frozen.undefinedProp, undefined);
  }

  @test
  async "should freeze objects with symbols"() {
    const sym = Symbol("test");
    const obj = {
      [sym]: { value: 42 },
      regular: 1
    };

    const frozen = deepFreeze(obj);

    assert.strictEqual(Object.isFrozen(frozen), true);
    assert.strictEqual(Object.isFrozen(frozen[sym]), true);
  }
}
