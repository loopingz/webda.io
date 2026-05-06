import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaTest } from "../test/core.js";
import type { OperationDefinition, WebdaSessionRegistry } from "./icore.js";
import type { WebdaQLString } from "@webda/ql";

@suite
class OperationDefinitionPermissionTypingTest extends WebdaTest {
  @test
  isAssignableToWebdaQLStringSession() {
    // If the field is mistyped, this assignment chain fails to compile.
    const sample = "x = 'y'" as WebdaQLString<WebdaSessionRegistry["session"]>;
    const def: OperationDefinition = {
      id: "test",
      input: "void",
      output: "void",
      method: "noop",
      permission: sample
    };
    assert.strictEqual(typeof def.permission, "string");
  }

  @test
  sessionDefaultsToUnknown() {
    // The whole point of `unknown` is that anything is assignable INTO it,
    // and nothing is assignable OUT of it without a narrowing. Verify with
    // the latter direction:
    const value: WebdaSessionRegistry["session"] = { anything: 1 };
    // @ts-expect-error — `unknown` cannot flow into `string` without a check
    const asString: string = value;
    assert.strictEqual(typeof value, "object");
    assert.deepStrictEqual(asString, { anything: 1 }); // erased at runtime — value IS the object
  }
}
