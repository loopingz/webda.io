import { suite, test } from "@webda/test";
import { hasSchema, registerSchema, validateSchema } from "./hooks.js";
import * as assert from "assert";

@suite
class Schema {
  @test
  basic() {
    registerSchema("unit", {
      type: "object",
      properties: {
        toto: {
          type: "string"
        },
        age: {
          type: "number"
        }
      },
      required: ["toto"]
    });
    assert.ok(hasSchema("unit"));
    assert.ok(
      validateSchema("unit", {
        toto: "toto",
        age: 12
      })
    );
    assert.ok(
      validateSchema("unit", {
        toto: "toto"
      })
    );
    assert.throws(() =>
      validateSchema("unit", {
        age: 12
      })
    );
  }
}
