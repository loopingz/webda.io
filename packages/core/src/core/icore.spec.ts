import { describe, it, expect } from "vitest";
import type { OperationDefinition, WebdaSessionRegistry } from "./icore.js";
import type { WebdaQLString } from "@webda/ql";

describe("OperationDefinition.permission typing", () => {
  it("is assignable to WebdaQLString<WebdaSessionRegistry['session']>", () => {
    // If the field is mistyped, this assignment chain fails to compile.
    const sample = "x = 'y'" as WebdaQLString<WebdaSessionRegistry["session"]>;
    const def: OperationDefinition = {
      id: "test",
      input: "void",
      output: "void",
      method: "noop",
      permission: sample
    };
    expect(typeof def.permission).toBe("string");
  });

  it("WebdaSessionRegistry['session'] defaults to unknown without augmentation", () => {
    // The whole point of `unknown` is that anything is assignable INTO it,
    // and nothing is assignable OUT of it without a narrowing. Verify with
    // the latter direction:
    const value: WebdaSessionRegistry["session"] = { anything: 1 };
    // @ts-expect-error — `unknown` cannot flow into `string` without a check
    const asString: string = value;
    expect(typeof value).toBe("object");
    expect(asString).toEqual({ anything: 1 }); // erased at runtime — value IS the object
  });
});
