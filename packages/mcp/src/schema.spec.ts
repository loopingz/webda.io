import { suite, test } from "@webda/test";
import * as assert from "assert";
import { inlineSchema } from "./schema.js";

@suite
class InlineSchemaTest {
  @test
  inlinesLocalDefinitions() {
    const schema = {
      type: "object",
      properties: { map: { $ref: "#/definitions/BinaryMap%3CT%3E" } },
      definitions: { "BinaryMap<T>": { type: "object", properties: { hash: { type: "string" } } } }
    };
    const out = inlineSchema(schema, () => undefined);
    assert.deepStrictEqual(out, {
      type: "object",
      properties: { map: { type: "object", properties: { hash: { type: "string" } } } }
    });
  }

  @test
  inlinesExternalSchemasThroughResolver() {
    const schema = { type: "object", properties: { results: { type: "array", items: { $ref: "#/definitions/WebdaSample/Post" } } } };
    const out = inlineSchema(schema, name =>
      name === "WebdaSample/Post" ? { type: "object", properties: { slug: { type: "string" } } } : undefined
    );
    assert.deepStrictEqual(out.properties.results.items, { type: "object", properties: { slug: { type: "string" } } });
  }

  @test
  breaksCycles() {
    const schema = {
      $ref: "#/definitions/Node",
      definitions: { Node: { type: "object", properties: { next: { $ref: "#/definitions/Node" } } } }
    };
    const out = inlineSchema(schema, () => undefined);
    assert.strictEqual(out.type, "object");
    assert.deepStrictEqual(out.properties.next, {});
  }

  @test
  unresolvedRefBecomesEmptySchema() {
    const out = inlineSchema({ type: "object", properties: { x: { $ref: "#/definitions/Missing" } } }, () => undefined);
    assert.deepStrictEqual(out.properties.x, {});
  }

  @test
  stripsSchemaMetaKeys() {
    const out = inlineSchema({ $schema: "http://json-schema.org/draft-07/schema#", $id: "x", type: "object" }, () => undefined);
    assert.deepStrictEqual(out, { type: "object" });
  }
}
