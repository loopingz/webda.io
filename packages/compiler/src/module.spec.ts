import { suite, test } from "@webda/test";
import * as assert from "assert";
import { normalizeSchemaDefinitions } from "./module.js";

@suite
class NormalizeSchemaDefinitionsTest {
  /**
   * Schemas without nested definitions or refs round-trip unchanged.
   */
  @test
  testFlatSchemaUnchanged() {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    };
    const out = normalizeSchemaDefinitions(JSON.parse(JSON.stringify(schema)));
    assert.deepStrictEqual(out, schema);
  }

  /**
   * Falsy / non-object inputs fall through to the no-op early return.
   */
  @test
  testNonObjectInputs() {
    assert.strictEqual(normalizeSchemaDefinitions(null), null);
    assert.strictEqual(normalizeSchemaDefinitions(undefined), undefined);
    assert.strictEqual(normalizeSchemaDefinitions("string"), "string");
    assert.strictEqual(normalizeSchemaDefinitions(42), 42);
  }

  /**
   * Definitions nested inside a `properties.body` shape get hoisted to
   * the schema root, and the original nested block is removed.
   */
  @test
  testHoistsNestedDefinitions() {
    const input = {
      type: "object",
      properties: {
        body: {
          type: "object",
          definitions: {
            Inner: { type: "string" }
          },
          properties: {
            field: { $ref: "#/definitions/Inner" }
          }
        }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.deepStrictEqual(out.definitions, { Inner: { type: "string" } });
    assert.strictEqual(out.properties.body.definitions, undefined, "nested definitions removed");
    assert.strictEqual(out.properties.body.properties.field.$ref, "#/definitions/Inner");
  }

  /**
   * When the same definition name appears in multiple nested blocks,
   * first-writer wins. Sibling nesting paths describe the same source
   * type, so duplicate keys carry the same body.
   */
  @test
  testDefinitionsFirstWriterWins() {
    const input = {
      type: "object",
      properties: {
        a: { definitions: { Shared: { type: "string", title: "first" } } },
        b: { definitions: { Shared: { type: "number", title: "second" } } }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.strictEqual(out.definitions.Shared.title, "first");
    assert.strictEqual(out.definitions.Shared.type, "string");
  }

  /**
   * Nested `definitions` inside arrays get hoisted just like nested
   * objects.
   */
  @test
  testHoistsFromArrayItems() {
    const input = {
      type: "object",
      properties: {
        list: {
          type: "array",
          items: {
            definitions: { ItemDef: { type: "boolean" } },
            type: "object"
          }
        }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.deepStrictEqual(out.definitions, { ItemDef: { type: "boolean" } });
    assert.strictEqual(out.properties.list.items.definitions, undefined);
  }

  /**
   * `$ref`s pointing at definitions that exist after hoisting are
   * preserved. The decoded form (matching the literal definition key)
   * also resolves — cf. typescript-json-schema's
   * `BinaryFileInfo<{}>` → `BinaryFileInfo%3C%7B%7D%3E` round trip.
   */
  @test
  testRefsToHoistedDefinitionsArePreserved() {
    const input = {
      type: "object",
      properties: {
        body: {
          definitions: {
            "BinaryFileInfo<{}>": { type: "object", additionalProperties: false }
          },
          properties: {
            map: { $ref: "#/definitions/BinaryFileInfo%3C%7B%7D%3E" }
          }
        }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.ok(out.definitions["BinaryFileInfo<{}>"], "definition was hoisted");
    assert.strictEqual(
      out.properties.body.properties.map.$ref,
      "#/definitions/BinaryFileInfo%3C%7B%7D%3E",
      "ref kept verbatim because the decoded name resolves in the hoisted map"
    );
  }

  /**
   * `$ref`s that point at definitions we couldn't resolve (the
   * unbound-generic case where the def name and the ref name diverge —
   * `&1$metadata` vs `&1(NaN)$metadata`) are dropped from the property
   * so AJV doesn't crash trying to compile them. Other constraints on
   * the property are left intact.
   */
  @test
  testBrokenRefsArePruned() {
    const input = {
      type: "object",
      properties: {
        meta: {
          $ref: "#/definitions/__never_resolved__",
          description: "should remain after the ref is dropped"
        }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.strictEqual(out.properties.meta.$ref, undefined, "broken ref removed");
    assert.strictEqual(out.properties.meta.description, "should remain after the ref is dropped");
  }

  /**
   * External refs (anything that doesn't start with `#/definitions/`)
   * are out of scope for this normalizer — they're left in place so
   * external resolvers can handle them downstream.
   */
  @test
  testExternalRefsLeftAlone() {
    const input = {
      type: "object",
      properties: {
        external: { $ref: "https://example.com/schema.json" },
        components: { $ref: "#/components/schemas/SomeShape" }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.strictEqual(out.properties.external.$ref, "https://example.com/schema.json");
    assert.strictEqual(out.properties.components.$ref, "#/components/schemas/SomeShape");
  }

  /**
   * `pruneRefs` should also descend into arrays inside the schema —
   * a broken `$ref` nested in `oneOf: [...]` or `anyOf: [...]` would
   * stay alive without the `Array.isArray(node)` branch.
   */
  @test
  testPrunesBrokenRefsInArrayBranches() {
    const input = {
      type: "object",
      properties: {
        choice: {
          oneOf: [{ $ref: "#/definitions/Real" }, { $ref: "#/definitions/Bogus" }]
        }
      },
      definitions: {
        Real: { type: "string" }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    assert.strictEqual(out.properties.choice.oneOf[0].$ref, "#/definitions/Real");
    assert.strictEqual(out.properties.choice.oneOf[1].$ref, undefined, "broken ref inside array pruned");
  }

  /**
   * Root-level `definitions` are also collected during the walk (the
   * `collect` function is called on the schema itself, so the root
   * block goes into the same first-writer-wins pool). Result: the
   * root entry wins on collision because it's seen first.
   */
  @test
  testMergesRootAndNestedDefinitions() {
    const input = {
      type: "object",
      definitions: {
        Existing: { type: "boolean", title: "from-root" }
      },
      properties: {
        body: {
          definitions: {
            New: { type: "number" },
            Existing: { type: "string", title: "from-nested" }
          }
        }
      }
    };
    const out = normalizeSchemaDefinitions(input);
    // New comes from the nested block.
    assert.deepStrictEqual(out.definitions.New, { type: "number" });
    // Existing was seen first at the root, so the root entry wins.
    assert.strictEqual(out.definitions.Existing.title, "from-root");
  }
}
