import { suite, test } from "@webda/test";
import { hasSchema, registerSchema, validateSchema, validateModelSchema, ValidationError } from "./hooks.js";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { useApplication } from "../application/hooks.js";
import { Application } from "../application/application.js";
import { useModel } from "../application/hooks.js";

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

@suite
class LazySchemaRegistration extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      services: {}
    };
  }

  async tweakApp(app: TestApplication): Promise<void> {
    // No custom services needed
  }

  @test
  async validateSchemaLazyFromApp() {
    // Register a schema in the application registry (not in ajv) and verify
    // that validateSchema lazily discovers it
    const app = useApplication<Application>();
    app.getSchemas()["lazy.test.schema"] = {
      type: "object",
      properties: {
        name: { type: "string" }
      },
      required: ["name"]
    };
    // Schema is not yet in ajv, but validateSchema should find it via the app
    assert.ok(validateSchema("lazy.test.schema", { name: "valid" }));
    // Should throw for invalid data
    assert.throws(() => validateSchema("lazy.test.schema", { name: 123 }));
  }

  @test
  async validateSchemaLazyIgnoreRequired() {
    // Lazy registration with ignoreRequired variant
    const app = useApplication<Application>();
    app.getSchemas()["lazy.required.schema"] = {
      type: "object",
      properties: {
        field1: { type: "string" },
        field2: { type: "number" }
      },
      required: ["field1", "field2"]
    };
    // With ignoreRequired=true, should lazy-register both base and "?" variant
    assert.ok(validateSchema("lazy.required.schema", { field1: "only" }, true));
    // The base schema should now also be registered
    assert.throws(() => validateSchema("lazy.required.schema", { field1: "only" }));
  }

  @test
  async validateModelSchemaWithString() {
    // Test validateModelSchema with a string model name
    // Register a schema via the app so validateModelSchema can find it
    const app = useApplication<Application>();
    app.getSchemas()["TestModelForSchema"] = {
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "number" }
      },
      required: ["name"]
    };
    // validateModelSchema should find the schema and validate
    assert.ok(validateModelSchema("TestModelForSchema", { name: "test", age: 10 }));
    // Should throw for invalid data
    assert.throws(() => validateModelSchema("TestModelForSchema", { age: "not-a-number" }));
  }

  @test
  async validateModelSchemaNoSchema() {
    // Test validateModelSchema when no schema is found
    const result = validateModelSchema("NonExistentModel12345", { anything: true });
    assert.strictEqual(result, null, "Should return null when no schema found");
  }

  @test
  async validateModelSchemaIgnoreRequired() {
    const app = useApplication<Application>();
    app.getSchemas()["TestModelRequired"] = {
      type: "object",
      properties: {
        field1: { type: "string" },
        field2: { type: "number" }
      },
      required: ["field1", "field2"]
    };
    // Without ignoreRequired, missing required fields should fail
    assert.throws(() => validateModelSchema("TestModelRequired", { field1: "only" }));
    // With ignoreRequired, should pass
    assert.ok(validateModelSchema("TestModelRequired", { field1: "only" }, true));
  }

  @test
  async hasSchemaWithStringKey() {
    // Register a schema and check hasSchema
    registerSchema("$WEBDA_TestHasSchema", {
      type: "object",
      properties: { x: { type: "string" } }
    });
    assert.ok(hasSchema("$WEBDA_TestHasSchema"), "Should find registered schema");
    assert.ok(!hasSchema("$WEBDA_NonExistent"), "Should not find non-registered schema");
  }

  @test
  async hasSchemaWithEmptyString() {
    // hasSchema with empty string should return false
    assert.strictEqual(hasSchema(""), false, "Empty string should return false");
  }
}
