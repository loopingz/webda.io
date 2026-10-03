import { suite, test } from "@webda/test";
import * as assert from "assert";
import { registerOperation, Session, useApplication, useInstanceStorage } from "@webda/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { BrokenModel, GadgetModel, WideModel, McpFixtureTest, registerFixture } from "../test/fixture.js";
import { createMcpServer } from "./server.js";
import { ToolRegistry } from "./tools.js";
import { ResourceRegistry } from "./resources.js";

@suite
class McpServerTest extends McpFixtureTest {
  /**
   * Connect an SDK client to a server built over all registered operations
   * @param user - logged-in user id, or undefined for anonymous
   * @returns connected client
   */
  async connect(user?: string): Promise<Client> {
    registerFixture();
    const ops = useInstanceStorage().operations;
    const tools = new ToolRegistry(name => useApplication().getSchema(name));
    tools.build(ops);
    const resources = new ResourceRegistry(["*"]);
    resources.build(ops);
    const session = new Session();
    if (user) session.login(user, user);
    const server = createMcpServer({ info: { name: "test", version: "1.0.0" }, tools, resources, maxOutputBytes: 1024, getSession: () => session });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    const client = new Client({ name: "spec", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
  }

  @test
  async listsToolsFilteredByPermission() {
    const anonymous = (await (await this.connect()).listTools()).tools.map(t => t.name);
    assert.ok(anonymous.includes("Fixture.Echo"));
    assert.ok(!anonymous.includes("Fixture.Secret"));
    assert.ok(!anonymous.includes("Fixture.Hidden"));
    assert.ok(!anonymous.includes("Fixture.NoMcp"));
    const alice = (await (await this.connect("alice")).listTools()).tools.map(t => t.name);
    assert.ok(alice.includes("Fixture.Secret"));
  }

  @test
  async callsTools() {
    const client = await this.connect();
    const result = await client.callTool({ name: "Fixture.Echo", arguments: { text: "hi" } });
    assert.deepStrictEqual(result.structuredContent, { text: "hi" });
    const version = await client.callTool({ name: "Fixture.Version", arguments: {} });
    assert.deepStrictEqual(version.content, [{ type: "text", text: '{"value":"1.2.3"}' }]);
  }

  @test
  async toolsDeclareNoOutputSchemaSoLooseResultsPassClientValidation() {
    const client = await this.connect();
    const { tools } = await client.listTools();
    assert.ok(tools.every(t => t.outputSchema === undefined));
    // Its declared output requires `text`: an outputSchema would make the SDK client reject it
    const result = await client.callTool({ name: "Fixture.Loose", arguments: {} });
    assert.notStrictEqual(result.isError, true);
    assert.deepStrictEqual(result.structuredContent, { other: 1 });
    const noop = await client.callTool({ name: "Fixture.Noop", arguments: {} });
    assert.deepStrictEqual(noop.content, [{ type: "text", text: "" }]);
    assert.strictEqual(noop.structuredContent, undefined);
  }

  @test
  async resourceReadTruncatesOnACharacterBoundary() {
    registerFixture();
    registerOperation("Wide.Get", {
      service: "Fixture",
      method: "wide",
      input: "Thing.primaryKey",
      output: "void",
      context: { model: WideModel, pkFields: ["slug"] }
    });
    let read;
    try {
      const client = await this.connect();
      read = await client.readResource({ uri: "webda://Wide/w" });
    } finally {
      // operations are process-wide: keep the other resource tests unaffected
      delete useInstanceStorage().operations["Wide.Get"];
    }
    const text = (read.contents[0] as any).text as string;
    assert.ok(!text.includes("\uFFFD"));
    assert.match(text, /\n\[output truncated: \d+ bytes exceeds maxOutputBytes 1024\]$/);
    const kept = text.slice(0, text.indexOf("\n[output truncated"));
    assert.ok(Buffer.byteLength(kept) <= 1024);
    assert.ok(Buffer.byteLength(kept) >= 1022);
  }

  @test
  async reportsClientErrorsAsToolErrors() {
    const client = await this.connect();
    const bad = await client.callTool({ name: "Fixture.Fail", arguments: { kind: "client" } });
    assert.strictEqual(bad.isError, true);
    assert.deepStrictEqual(bad.content, [{ type: "text", text: "BAD_REQUEST: Kind is not supported" }]);
    const internal = await client.callTool({ name: "Fixture.Fail", arguments: { kind: "server" } });
    assert.deepStrictEqual(internal.content, [{ type: "text", text: "Internal error" }]);
    const invalid = await client.callTool({ name: "Fixture.Echo", arguments: {} });
    assert.strictEqual(invalid.isError, true);
  }

  @test
  async unknownOrForbiddenToolIsInvalidParams() {
    const client = await this.connect();
    await assert.rejects(client.callTool({ name: "Fixture.Nope", arguments: {} }), /Unknown tool/);
    await assert.rejects(client.callTool({ name: "Fixture.Secret", arguments: {} }), /Unknown tool/);
  }

  @test
  async sendsProgressForStreamingOperations() {
    const client = await this.connect();
    const progress: any[] = [];
    const result = await client.callTool({ name: "Fixture.Count", arguments: { n: 3 } }, undefined, {
      onprogress: p => progress.push(p)
    });
    assert.deepStrictEqual(progress.map(p => p.progress), [1, 2, 3]);
    assert.deepStrictEqual(progress.map(p => p.total), [3, 3, 3]);
    assert.deepStrictEqual(JSON.parse(progress[0].message), { index: 1, total: 3 });
    assert.deepStrictEqual(JSON.parse((result.content[0] as any).text).items.length, 3);
  }

  @test
  async readsAndListsResources() {
    const client = await this.connect();
    const templates = await client.listResourceTemplates();
    assert.deepStrictEqual(templates.resourceTemplates.map(t => t.uriTemplate), ["webda://Thing/{slug}"]);
    const read = await client.readResource({ uri: "webda://Thing/a%2Fb%20c" });
    assert.deepStrictEqual(JSON.parse((read.contents[0] as any).text), { slug: "a/b c", label: "Encoded" });
    await assert.rejects(client.readResource({ uri: "webda://Thing/missing" }), /Resource not found/);
    await assert.rejects(client.readResource({ uri: "webda://Nope/x" }), /Resource not found/);
    const uris: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.listResources(cursor ? { cursor } : {});
      uris.push(...page.resources.map(r => r.uri));
      cursor = page.nextCursor;
    } while (cursor);
    assert.deepStrictEqual(uris, ["webda://Thing/alpha", "webda://Thing/a%2Fb%20c", "webda://Thing/beta"]);
  }

  @test
  async paginatesTools() {
    for (let i = 0; i < 105; i++) {
      registerOperation(`Bulk.Op${i}`, { service: "Fixture", method: "version", input: "void", output: "void" });
    }
    const client = await this.connect();
    const first = await client.listTools();
    assert.strictEqual(first.tools.length, 100);
    assert.ok(first.nextCursor);
    const names = first.tools.map(t => t.name);
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await client.listTools({ cursor });
      names.push(...page.tools.map(t => t.name));
      cursor = page.nextCursor;
    }
    assert.strictEqual(new Set(names).size, names.length);
    for (let i = 0; i < 105; i++) {
      assert.ok(names.includes(`Bulk.Op${i}`));
    }
  }

  @test
  async streamingWithoutProgressToken() {
    const client = await this.connect();
    const result = await client.callTool({ name: "Fixture.Count", arguments: { n: 3 } });
    assert.notStrictEqual(result.isError, true);
    assert.strictEqual(JSON.parse((result.content[0] as any).text).items.length, 3);
  }

  @test
  async skipsModelsWhoseQueryIsForbidden() {
    registerFixture();
    const op = (id: string, method: string, extra: any = {}) =>
      registerOperation(id, { service: "Fixture", method, input: "searchRequest", output: "void", ...extra });
    op("Gadget.Get", "getThing", { input: "Thing.primaryKey", context: { model: GadgetModel, pkFields: ["slug"] } });
    op("Gadgets.Query", "queryThings", { permission: "userId = 'alice'", context: { model: GadgetModel } });
    const list = async (user?: string) => {
      const client = await this.connect(user);
      const uris: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listResources(cursor ? { cursor } : {});
        uris.push(...page.resources.map(r => r.uri));
        cursor = page.nextCursor;
      } while (cursor);
      return uris;
    };
    assert.ok(!(await list()).some(u => u.startsWith("webda://Gadget/")));
    assert.ok((await list("alice")).some(u => u.startsWith("webda://Gadget/")));
  }

  @test
  async masksFailingQuery() {
    registerFixture();
    registerOperation("Broken.Get", {
      service: "Fixture",
      method: "getThing",
      input: "Thing.primaryKey",
      output: "void",
      context: { model: BrokenModel, pkFields: ["slug"] }
    });
    registerOperation("Brokens.Query", {
      service: "Fixture",
      method: "brokenQuery",
      input: "searchRequest",
      output: "void",
      context: { model: BrokenModel }
    });
    const client = await this.connect();
    let cursor: string | undefined;
    let error: Error | undefined;
    try {
      do {
        const page = await client.listResources(cursor ? { cursor } : {});
        cursor = page.nextCursor;
      } while (cursor);
    } catch (err) {
      error = err as Error;
    }
    assert.ok(error);
    assert.match(error.message, /Internal error/);
    assert.ok(!/db password/.test(error.message));
  }
}
