import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useService } from "@webda/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FIXTURE_SERVICES, McpFixtureTest, registerFixture } from "../test/fixture.js";
import { McpService, reserveStdout } from "./mcpservice.service.js";
import { PassThrough } from "node:stream";

@suite
class McpStdioTest extends McpFixtureTest {
  /**
   * @returns configuration with a stdio-only MCP service
   */
  getTestConfiguration(): any {
    return { services: { ...FIXTURE_SERVICES, Mcp: { type: "Webda/McpService", url: false } } };
  }

  /**
   * @param app - test application
   */
  async tweakApp(app: any): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/McpService", McpService);
  }

  /**
   * @param user - user to run as
   * @returns a client connected to serveStdio over an in-memory pair
   */
  async connect(user?: string): Promise<Client> {
    registerFixture();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await (useService("Mcp" as any) as unknown as McpService).serveStdio(serverTransport, user);
    const client = new Client({ name: "spec", version: "1.0.0" });
    await client.connect(clientTransport);
    return client;
  }

  @test
  async servesToolsWithUserPermissions() {
    const anonymous = (await (await this.connect()).listTools()).tools.map(t => t.name);
    assert.ok(anonymous.includes("Fixture.Echo"));
    assert.ok(!anonymous.includes("Fixture.Secret"));
    const alice = await this.connect("alice");
    const secret = await alice.callTool({ name: "Fixture.Secret", arguments: {} });
    assert.deepStrictEqual(JSON.parse((secret.content[0] as any).text), { secret: 42 });
  }

  @test
  async handlesMessagesDeliveredOutsideTheInstanceStorage() {
    registerFixture();
    const sent: any[] = [];
    const transport: any = {
      start: async () => {},
      close: async () => {},
      send: async (message: any) => {
        sent.push(message);
      }
    };
    await (useService("Mcp" as any) as unknown as McpService).serveStdio(transport);
    // A real stdin stream emits from a context without the instance storage
    await process["webdaInstanceStorage"].exit(async () => {
      await transport.onmessage({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "spec", version: "1" } }
      });
      await transport.onmessage({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    });
    await new Promise(resolve => setTimeout(resolve, 50));
    const list = sent.find(m => m.id === 2);
    assert.ok(list?.result?.tools, `expected a tools list, got ${JSON.stringify(list)}`);
  }

  @test
  moduleDeclaresTheMcpCommand() {
    const moduleJson = join(dirname(fileURLToPath(import.meta.url)), "..", "webda.module.json");
    const mod = JSON.parse(readFileSync(moduleJson, "utf-8"));
    const command = mod.moddas["Webda/McpService"]?.commands?.mcp;
    assert.ok(command, "Webda/McpService is missing its mcp command — run `pnpm run build` first");
    assert.ok(command.args?.user !== undefined, "mcp command must accept --user");
  }

  @test
  async reserveStdoutSendsEverythingElseToStderr() {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const read = (stream: PassThrough) => stream.read()?.toString() ?? "";
    const { protocol, restore } = reserveStdout(stdout, stderr);
    try {
      stdout.write("a log line\n");
      await new Promise<void>((resolve, reject) => protocol.write('{"jsonrpc":"2.0"}\n', err => (err ? reject(err) : resolve())));
      assert.strictEqual(read(stdout), '{"jsonrpc":"2.0"}\n');
      assert.strictEqual(read(stderr), "a log line\n");
    } finally {
      restore();
    }
    stdout.write("after\n");
    assert.strictEqual(read(stdout), "after\n");
  }
}
