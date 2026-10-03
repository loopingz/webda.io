import { suite, test } from "@webda/test";
import * as assert from "assert";
import { operationToTool, operationsFingerprint, ToolRegistry } from "./tools.js";

const schemas: Record<string, any> = {
  "Fixture.Echo": { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  "Fixture.Echo.output": { type: "object", properties: { text: { type: "string" } } },
  "WebdaSample/Post": { type: "object", properties: { slug: { type: "string" }, title: { type: "string" } }, required: ["slug", "title"] },
  "Fixture.Number": { type: "number" }
};
const resolve = (name: string) => schemas[name];

@suite
class ToolMappingTest {
  @test
  mapsNameDescriptionAndSchemas() {
    const entry = operationToTool(
      "Fixture.Echo",
      { id: "Fixture.Echo", input: "Fixture.Echo", output: "Fixture.Echo.output", method: "echo", summary: "Echo text", description: "Returns its input" },
      resolve
    );
    assert.strictEqual(entry.tool.name, "Fixture.Echo");
    assert.strictEqual(entry.tool.description, "Echo text\n\nReturns its input");
    assert.deepStrictEqual(entry.tool.inputSchema, schemas["Fixture.Echo"]);
    // No outputSchema: serialized results (models) rarely match their schema exactly
    assert.strictEqual(entry.tool.outputSchema, undefined);
    assert.strictEqual(entry.wrapped, false);
  }

  @test
  voidInputIsEmptyObject() {
    const entry = operationToTool("Fixture.Version", { id: "Fixture.Version", input: "void", output: "void", method: "version" }, resolve);
    assert.deepStrictEqual(entry.tool.inputSchema, { type: "object", properties: {} });
    assert.strictEqual(entry.tool.outputSchema, undefined);
    assert.strictEqual(entry.tool.description, "Call operation Fixture.Version");
  }

  @test
  optionalInputDropsRequired() {
    const entry = operationToTool("Post.Create", { id: "Post.Create", input: "WebdaSample/Post?", output: "WebdaSample/Post", method: "modelCreate" }, resolve);
    assert.strictEqual(entry.tool.inputSchema.required, undefined);
    assert.deepStrictEqual(Object.keys(entry.tool.inputSchema.properties), ["slug", "title"]);
    // the shared schema object must not be mutated
    assert.deepStrictEqual(schemas["WebdaSample/Post"].required, ["slug", "title"]);
  }

  @test
  wrapsNonObjectInput() {
    const entry = operationToTool("Fixture.Square", { id: "Fixture.Square", input: "Fixture.Number", output: "Fixture.Number", method: "square" }, resolve);
    assert.strictEqual(entry.wrapped, true);
    assert.deepStrictEqual(entry.tool.inputSchema, { type: "object", properties: { value: { type: "number" } }, required: ["value"] });
    assert.strictEqual(entry.tool.outputSchema, undefined);
  }

  @test
  optionalNonObjectInputDropsRequired() {
    const entry = operationToTool("Fixture.Square", { id: "Fixture.Square", input: "Fixture.Number?", output: "void", method: "square" }, resolve);
    assert.strictEqual(entry.wrapped, true);
    assert.deepStrictEqual(entry.tool.inputSchema, { type: "object", properties: { value: { type: "number" } } });
  }

  @test
  derivesHints() {
    const get = operationToTool("Post.Get", { id: "Post.Get", input: "void", output: "void", method: "m" }, resolve);
    assert.strictEqual(get.tool.annotations.readOnlyHint, true);
    assert.strictEqual(get.tool.annotations.destructiveHint, false);
    const del = operationToTool("Post.Delete", { id: "Post.Delete", input: "void", output: "void", method: "m", rest: { method: "delete", path: "" } }, resolve);
    assert.strictEqual(del.tool.annotations.destructiveHint, true);
    assert.strictEqual(del.tool.annotations.readOnlyHint, false);
    const overridden = operationToTool(
      "Post.Publish",
      { id: "Post.Publish", input: "void", output: "void", method: "m", mcp: { title: "Publish a post", readOnly: false, destructive: true } },
      resolve
    );
    assert.strictEqual(overridden.tool.title, "Publish a post");
    assert.strictEqual(overridden.tool.annotations.destructiveHint, true);
  }

  @test
  marksDeprecated() {
    const entry = operationToTool("Old.Op", { id: "Old.Op", input: "void", output: "void", method: "m", summary: "Old", deprecated: true }, resolve);
    assert.strictEqual(entry.tool.description, "Old (deprecated)");
  }

  @test
  skipsHiddenAndMcpFalse() {
    assert.strictEqual(operationToTool("A.B", { id: "A.B", input: "void", output: "void", method: "m", hidden: true }, resolve), undefined);
    assert.strictEqual(operationToTool("A.C", { id: "A.C", input: "void", output: "void", method: "m", mcp: false }, resolve), undefined);
  }
}

@suite
class ToolRegistryTest {
  @test
  buildsAndLooksUp() {
    const registry = new ToolRegistry(resolve);
    registry.build({
      "Fixture.Echo": { id: "Fixture.Echo", input: "Fixture.Echo", output: "void", method: "echo" },
      "Fixture.Hidden": { id: "Fixture.Hidden", input: "void", output: "void", method: "m", hidden: true }
    });
    assert.deepStrictEqual(registry.list().map(e => e.tool.name), ["Fixture.Echo"]);
    assert.strictEqual(registry.get("Fixture.Echo").operationId, "Fixture.Echo");
    assert.strictEqual(registry.get("Fixture.Hidden"), undefined);
  }

  @test
  fingerprintIsOrderIndependent() {
    const a = operationsFingerprint({ "B.X": {} as any, "A.Y": {} as any });
    const b = operationsFingerprint({ "A.Y": {} as any, "B.X": {} as any });
    assert.strictEqual(a, b);
    assert.notStrictEqual(a, operationsFingerprint({ "A.Y": {} as any }));
  }
}
