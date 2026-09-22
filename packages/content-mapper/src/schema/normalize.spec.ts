import assert from "node:assert";
import { describe, it } from "vitest";
import { normalizeDefinitions } from "./action.ts";

/**
 * Moved here from `@webda/compiler` when schema generation did.
 *
 * `normalizeDefinitions` hoists every nested `definitions` block to the root
 * and prunes `$ref`s that point at nothing. Both cases came from real AJV
 * crashes, not tidiness: a bound generic keeps its `definitions` on a
 * sub-schema where a root-relative `$ref` cannot see it, and an unbound one
 * produces a definition whose key does not match the `$ref` naming it.
 */
describe("normalizeDefinitions", () => {
  it("flat schema unchanged", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"]
    };
    const out = normalizeDefinitions(JSON.parse(JSON.stringify(schema)));
    assert.deepStrictEqual(out, schema);
  });

  it("non object inputs", () => {
    assert.strictEqual(normalizeDefinitions(null), null);
    assert.strictEqual(normalizeDefinitions(undefined), undefined);
    assert.strictEqual(normalizeDefinitions("string"), "string");
    assert.strictEqual(normalizeDefinitions(42), 42);
  });

  it("hoists nested definitions", () => {
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
    const out = normalizeDefinitions(input);
    assert.deepStrictEqual(out.definitions, { Inner: { type: "string" } });
    assert.strictEqual(out.properties.body.definitions, undefined, "nested definitions removed");
    assert.strictEqual(out.properties.body.properties.field.$ref, "#/definitions/Inner");
  });

  it("definitions first writer wins", () => {
    const input = {
      type: "object",
      properties: {
        a: { definitions: { Shared: { type: "string", title: "first" } } },
        b: { definitions: { Shared: { type: "number", title: "second" } } }
      }
    };
    const out = normalizeDefinitions(input);
    assert.strictEqual(out.definitions.Shared.title, "first");
    assert.strictEqual(out.definitions.Shared.type, "string");
  });

  it("hoists from array items", () => {
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
    const out = normalizeDefinitions(input);
    assert.deepStrictEqual(out.definitions, { ItemDef: { type: "boolean" } });
    assert.strictEqual(out.properties.list.items.definitions, undefined);
  });

  it("refs to hoisted definitions are preserved", () => {
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
    const out = normalizeDefinitions(input);
    assert.ok(out.definitions["BinaryFileInfo<{}>"], "definition was hoisted");
    assert.strictEqual(
      out.properties.body.properties.map.$ref,
      "#/definitions/BinaryFileInfo%3C%7B%7D%3E",
      "ref kept verbatim because the decoded name resolves in the hoisted map"
    );
  });

  it("broken refs are pruned", () => {
    const input = {
      type: "object",
      properties: {
        meta: {
          $ref: "#/definitions/__never_resolved__",
          description: "should remain after the ref is dropped"
        }
      }
    };
    const out = normalizeDefinitions(input);
    assert.strictEqual(out.properties.meta.$ref, undefined, "broken ref removed");
    assert.strictEqual(out.properties.meta.description, "should remain after the ref is dropped");
  });

  it("external refs left alone", () => {
    const input = {
      type: "object",
      properties: {
        external: { $ref: "https://example.com/schema.json" },
        components: { $ref: "#/components/schemas/SomeShape" }
      }
    };
    const out = normalizeDefinitions(input);
    assert.strictEqual(out.properties.external.$ref, "https://example.com/schema.json");
    assert.strictEqual(out.properties.components.$ref, "#/components/schemas/SomeShape");
  });

  it("prunes broken refs in array branches", () => {
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
    const out = normalizeDefinitions(input);
    assert.strictEqual(out.properties.choice.oneOf[0].$ref, "#/definitions/Real");
    assert.strictEqual(out.properties.choice.oneOf[1].$ref, undefined, "broken ref inside array pruned");
  });

  it("merges root and nested definitions", () => {
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
    const out = normalizeDefinitions(input);
    // New comes from the nested block.
    assert.deepStrictEqual(out.definitions.New, { type: "number" });
    // Existing was seen first at the root, so the root entry wins.
    assert.strictEqual(out.definitions.Existing.title, "from-root");
  });
});
