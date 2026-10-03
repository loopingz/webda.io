import { suite, test } from "@webda/test";
import * as assert from "assert";
import { registerOperation, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ToolListChangedNotificationSchema } from "@modelcontextprotocol/sdk/types.js";
import { FIXTURE_SERVICES, fixtureGate, McpFixtureTest, registerFixture } from "../test/fixture.js";
import { McpService } from "./mcpservice.service.js";

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } }
};
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

@suite
class McpHttpTest extends McpFixtureTest {
  port: number;

  /**
   * @returns configuration with HttpServer and the MCP service
   */
  getTestConfiguration(): any {
    return {
      services: {
        ...FIXTURE_SERVICES,
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        TestAuth: { type: "Webda/HeaderAuthenticator" },
        Mcp: { type: "Webda/McpService", authenticator: "TestAuth", maxOutputBytes: 1024 }
      }
    };
  }

  /**
   * @param app - test application
   */
  async tweakApp(app: any): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/McpService", McpService);
    app.addModda("Webda/HttpServer", HttpServer);
  }

  /**
   * Start the HTTP server once and register fixture operations
   * @returns base URL of the MCP endpoint
   */
  async url(): Promise<string> {
    registerFixture();
    if (!this.port) {
      const http = useService("HttpServer" as any) as any;
      await http.serve("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) {
        await new Promise(r => setTimeout(r, 20));
      }
      this.port = http.server.address().port;
    }
    return `http://127.0.0.1:${this.port}/mcp`;
  }

  /**
   * @param user - value of x-test-user, if any
   * @returns a connected SDK client and its transport
   */
  async client(user?: string): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
    const transport = new StreamableHTTPClientTransport(new URL(await this.url()), {
      requestInit: { headers: user ? { "x-test-user": user } : {} }
    });
    const client = new Client({ name: "spec", version: "1.0.0" });
    await client.connect(transport);
    return { client, transport };
  }

  @test
  async listsAndCallsTools() {
    const { client } = await this.client();
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes("Fixture.Echo"));
    const result = await client.callTool({ name: "Fixture.Echo", arguments: { text: "over http" } });
    assert.deepStrictEqual(result.structuredContent, { text: "over http" });
    await client.close();
  }

  @test
  async filtersToolsPerCaller() {
    const anonymous = await this.client();
    assert.ok(!(await anonymous.client.listTools()).tools.some(t => t.name === "Fixture.Secret"));
    const alice = await this.client("alice");
    assert.ok((await alice.client.listTools()).tools.some(t => t.name === "Fixture.Secret"));
    const secret = await alice.client.callTool({ name: "Fixture.Secret", arguments: {} });
    assert.deepStrictEqual(JSON.parse((secret.content[0] as any).text), { secret: 42 });
  }

  @test
  async streamsProgressIncrementallyOverSse() {
    const { client } = await this.client();
    const steps: number[] = [];
    // Fixture.Gate yields step 1, then blocks until the gate opens. The gate is
    // opened from the progress callback, so this deadlocks (and times out)
    // unless the first SSE event reaches the client before the response ends.
    const result = await client.callTool({ name: "Fixture.Gate", arguments: {} }, undefined, {
      onprogress: p => {
        steps.push(JSON.parse(p.message).step);
        fixtureGate.open();
      },
      timeout: 5000
    });
    assert.deepStrictEqual(steps, [1, 2]);
    assert.deepStrictEqual(JSON.parse((result.content[0] as any).text).items, [{ step: 1 }, { step: 2 }]);
  }

  @test
  async readsResources() {
    const { client } = await this.client();
    const read = await client.readResource({ uri: "webda://Thing/alpha" });
    assert.deepStrictEqual(JSON.parse((read.contents[0] as any).text), { slug: "alpha", label: "First" });
  }

  @test
  async rejectsSessionOfAnotherUser() {
    const { transport } = await this.client("alice");
    const res = await fetch(await this.url(), {
      method: "POST",
      headers: { ...HEADERS, "mcp-session-id": transport.sessionId, "x-test-user": "bob" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    });
    assert.strictEqual(res.status, 403);
  }

  @test
  async unknownSessionIs404AndMissingSessionIs400() {
    const url = await this.url();
    const unknown = await fetch(url, {
      method: "POST",
      headers: { ...HEADERS, "mcp-session-id": "00000000-0000-0000-0000-000000000000" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    });
    assert.strictEqual(unknown.status, 404);
    const missing = await fetch(url, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    });
    assert.strictEqual(missing.status, 400);
  }

  @test
  async malformedJsonIsParseError() {
    const res = await fetch(await this.url(), { method: "POST", headers: HEADERS, body: "{not json" });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.error.code, -32700);
  }

  @test
  async rejectsForeignOrigin() {
    const res = await fetch(await this.url(), {
      method: "POST",
      headers: { ...HEADERS, origin: "http://evil.example" },
      body: JSON.stringify(INIT)
    });
    assert.strictEqual(res.status, 403);
  }

  @test
  async deleteEndsTheSession() {
    const { transport } = await this.client();
    const id = transport.sessionId;
    await transport.terminateSession();
    const res = await fetch(await this.url(), {
      method: "POST",
      headers: { ...HEADERS, "mcp-session-id": id },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" })
    });
    assert.strictEqual(res.status, 404);
  }

  @test
  async notifiesToolListChanged() {
    const { client } = await this.client();
    let notified = false;
    client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      notified = true;
    });
    // give the client time to open its GET notification stream
    await new Promise(r => setTimeout(r, 200));
    registerOperation("Fixture.Late", { service: "Fixture", method: "version", input: "void", output: "void" });
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes("Fixture.Late"));
    for (let i = 0; i < 50 && !notified; i++) {
      await new Promise(r => setTimeout(r, 20));
    }
    assert.strictEqual(notified, true);
  }

  @test
  async clientAbortStopsStream() {
    const { client } = await this.client();
    const controller = new AbortController();
    const call = client.callTool({ name: "Fixture.Gate", arguments: {} }, undefined, {
      onprogress: () => controller.abort(),
      signal: controller.signal
    });
    await assert.rejects(call);
    fixtureGate.open();
    // the server must still answer new requests on the same session
    assert.ok((await client.listTools()).tools.length > 0);
  }
}
