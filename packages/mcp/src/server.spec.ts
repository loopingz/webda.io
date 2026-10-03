import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Session, useApplication, useInstanceStorage } from "@webda/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpFixtureTest, registerFixture } from "../test/fixture.js";
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
}
