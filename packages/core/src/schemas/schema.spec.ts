import { suite, test } from "@webda/test";
import { hasSchema, registerSchema, validateSchema, ValidationError } from "./hooks.js";
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

  @test
  ignoreRequired() {
    registerSchema("unitRequired", {
      type: "object",
      properties: {
        name: { type: "string" },
        value: { type: "number" }
      },
      required: ["name", "value"]
    });
    // Without ignoreRequired, missing required fields should throw
    assert.throws(() => validateSchema("unitRequired", { name: "test" }));
    // With ignoreRequired, missing required fields should pass
    assert.ok(validateSchema("unitRequired", { name: "test" }, true));
    // Calling ignoreRequired again should reuse the cached schema
    assert.ok(validateSchema("unitRequired", {}, true));
  }

  @test
  schemaNotFound() {
    assert.throws(() => validateSchema("nonexistent", {}), /Schema not found/);
  }

  @test
  hasSchemaFalseForUnknown() {
    assert.strictEqual(hasSchema("nonexistent-schema-xyz"), false);
  }

  @test
  validationErrorProperties() {
    const err = new ValidationError([{ message: "test error" }, { message: "another error" }]);
    assert.ok(err instanceof Error);
    assert.strictEqual(err.ajv, true);
    assert.strictEqual(err.validation, true);
    assert.strictEqual(err.errors.length, 2);
    assert.ok(err.message.includes("test error"));
    assert.ok(err.message.includes("another error"));
  }

  @test
  validationErrorFromValidateSchema() {
    registerSchema("unitErr", {
      type: "object",
      properties: {
        num: { type: "number" }
      }
    });
    try {
      validateSchema("unitErr", { num: "not-a-number" });
      assert.fail("Should have thrown");
    } catch (err) {
      assert.ok(err instanceof ValidationError);
      assert.ok(err.errors.length > 0);
    }
  }
}
