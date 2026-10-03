import { suite, test } from "@webda/test";
import * as assert from "assert";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { useService } from "@webda/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FIXTURE_SERVICES, McpFixtureTest, registerFixture } from "../test/fixture.js";
import { McpService } from "./mcpservice.service.js";

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
  moduleDeclaresTheMcpCommand() {
    const moduleJson = join(dirname(fileURLToPath(import.meta.url)), "..", "webda.module.json");
    const mod = JSON.parse(readFileSync(moduleJson, "utf-8"));
    const command = mod.moddas["Webda/McpService"]?.commands?.mcp;
    assert.ok(command, "Webda/McpService is missing its mcp command — run `pnpm run build` first");
    assert.ok(command.args?.user !== undefined, "mcp command must accept --user");
  }
}
