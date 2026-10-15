import { suite, test } from "@webda/test";
import * as assert from "assert";
import { HttpContext, Session, useService } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { FIXTURE_SERVICES, McpFixtureTest, registerFixture } from "../test/fixture.js";
import { McpService } from "./mcpservice.service.js";
import { McpOAuthAuthenticator } from "./oauth.service.js";

const INIT = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } }
};
const HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };

class McpOAuthBase extends McpFixtureTest {
  port: number;

  /**
   * @returns configuration with HttpServer, the MCP service and the OAuth authenticator
   */
  getTestConfiguration(): any {
    return {
      parameters: { ignoreBeans: true },
      services: {
        ...FIXTURE_SERVICES,
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/RevokedAccess"] },
        HttpServer: { type: "Webda/HttpServer", port: 0 },
        McpAuth: { type: "Webda/McpOAuthAuthenticator" },
        Mcp: { type: "Webda/McpService", authenticator: "McpAuth" }
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
    app.addModda("Webda/McpOAuthAuthenticator", McpOAuthAuthenticator);
  }

  /**
   * @returns the base URL of the test server
   */
  async base(): Promise<string> {
    registerFixture();
    if (!this.port) {
      const http = useService("HttpServer" as any) as any;
      await http.start("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) {
        await new Promise(r => setTimeout(r, 20));
      }
      this.port = http.server.address().port;
    }
    return `http://127.0.0.1:${this.port}`;
  }

  /**
   * @param scope - operation globs
   * @returns a bearer access token
   */
  async bearer(scope: string[]): Promise<string> {
    const session = new Session();
    session.login("alice", "alice:email", { provider: "email", amr: ["pwd"] });
    const tokens = await (useService("TokenService") as any).issue(session, undefined, {
      clientId: "https://mcp.example.com/c.json",
      scope
    });
    return tokens.accessToken;
  }

  /**
   * @param token - bearer token
   * @returns a connected SDK client
   */
  async client(token: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${await this.base()}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    });
    const client = new Client({ name: "spec", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }
}

@suite
class McpOAuthTest extends McpOAuthBase {
  @test
  async challengeWithoutToken() {
    const base = await this.base();
    const res = await fetch(`${base}/mcp`, { method: "POST", headers: HEADERS, body: JSON.stringify(INIT) });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(
      res.headers.get("www-authenticate"),
      `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`
    );
  }

  @test
  async challengeWithInvalidToken() {
    const base = await this.base();
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { ...HEADERS, authorization: "Bearer garbage" },
      body: JSON.stringify(INIT)
    });
    assert.strictEqual(res.status, 401);
    assert.ok(res.headers.get("www-authenticate")?.startsWith("Bearer resource_metadata="));
  }

  @test
  async protectedResourceMetadata() {
    const base = await this.base();
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"]
    });
  }

  @test
  async scopedTokenFiltersTools() {
    const client = await this.client(await this.bearer(["Fixture.Echo"]));
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.deepStrictEqual(names, ["Fixture.Echo"]);
    const ok = await client.callTool({ name: "Fixture.Echo", arguments: { text: "hi" } });
    assert.deepStrictEqual(ok.structuredContent, { text: "hi" });
    // a tool outside the scope is refused as unknown
    await assert.rejects(() => client.callTool({ name: "Fixture.Version", arguments: {} }), /Unknown tool/);
    await client.close();
  }

  @test
  async metadataIsNotCached() {
    const res = await fetch(`${await this.base()}/.well-known/oauth-protected-resource`);
    assert.strictEqual(res.headers.get("cache-control"), "no-store");
    assert.strictEqual(res.headers.get("vary"), "Host");
  }

  @test
  async followsPrefix() {
    const auth = useService("McpAuth") as McpOAuthAuthenticator;
    const headers: Record<string, string> = {};
    let body = "";
    const http = new HttpContext("example.com", "GET", "/prod/.well-known/oauth-protected-resource", "https", 443, {
      host: "example.com"
    });
    http.setPrefix("/prod");
    const ctx: any = {
      getHttpContext: () => http,
      setHeader: (k: string, v: string) => (headers[k] = v),
      write: (b: string) => (body += b),
      getSession: () => new Session()
    };
    await auth.metadata(ctx);
    assert.deepStrictEqual(JSON.parse(body), {
      resource: "https://example.com/prod/mcp",
      authorization_servers: ["https://example.com/prod"],
      bearer_methods_supported: ["header"]
    });
    await assert.rejects(() => auth.authenticate(ctx));
    assert.strictEqual(
      headers["WWW-Authenticate"],
      'Bearer resource_metadata="https://example.com/prod/.well-known/oauth-protected-resource"'
    );
  }

  @test
  async authInfoReflectsToken() {
    const token = await this.bearer(["Fixture.*"]);
    const service = useService("Mcp") as any;
    let captured: any;
    const original = service.createServer.bind(service);
    service.createServer = (getSession: any) =>
      original((extra: any) => {
        captured = extra.authInfo;
        return getSession(extra);
      });
    try {
      const client = await this.client(token);
      await client.listTools();
      await client.close();
    } finally {
      service.createServer = original;
    }
    assert.strictEqual(captured.token, token);
    assert.strictEqual(captured.clientId, "https://mcp.example.com/c.json");
    assert.deepStrictEqual(captured.scopes, ["Fixture.*"]);
  }
}

@suite
class McpOAuthCustomUrlTest extends McpOAuthBase {
  /**
   * @returns configuration with a non-default MCP url
   */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    config.services.Mcp.url = "/api/mcp";
    return config;
  }

  @test
  async resourceFollowsMcpUrl() {
    const base = await this.base();
    const meta = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
    assert.strictEqual(meta.resource, `${base}/api/mcp`);
    const res = await fetch(`${base}/api/mcp`, { method: "POST", headers: HEADERS, body: JSON.stringify(INIT) });
    assert.strictEqual(res.status, 401);
  }
}
