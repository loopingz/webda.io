import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  HttpContext,
  listOperationAuthorizers,
  listProtectedResources,
  registerOperationAuthorizer,
  Session,
  unregisterOperationAuthorizer,
  useService
} from "@webda/core";
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
   * @param resource - token audience, defaults to the bound MCP resource
   * @param user - token user
   * @returns a bearer access token
   */
  async bearer(scope: string[], resource?: string | null, user: string = "alice"): Promise<string> {
    if (resource === undefined) {
      resource = `${await this.base()}/mcp`;
    }
    const session = new Session();
    session.login(user, `${user}:email`, { provider: "email", amr: ["pwd"] });
    const tokens = await (useService("TokenService") as any).issue(session, undefined, {
      clientId: "https://mcp.example.com/c.json",
      scope,
      resource: resource ?? undefined
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

  /**
   * Open an MCP session with raw HTTP and send one JSON-RPC request in it
   * @param token - bearer token
   * @param message - JSON-RPC request (or batch) sent once the session is initialized
   * @param extra - extra headers of the request
   * @returns the raw response to the request
   */
  async rawCall(token: string, message: unknown, extra: Record<string, string> = {}): Promise<Response> {
    const base = await this.base();
    const headers = { ...HEADERS, authorization: `Bearer ${token}` };
    const init = await fetch(`${base}/mcp`, { method: "POST", headers, body: JSON.stringify(INIT) });
    assert.strictEqual(init.status, 200);
    await init.text();
    const session = {
      ...headers,
      "mcp-session-id": init.headers.get("mcp-session-id")!,
      "mcp-protocol-version": "2025-11-25"
    };
    const initialized = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: session,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
    });
    await initialized.text();
    return fetch(`${base}/mcp`, { method: "POST", headers: { ...session, ...extra }, body: JSON.stringify(message) });
  }

  /**
   * @param name - tool name
   * @param id - JSON-RPC id
   * @returns a tools/call request
   */
  callRequest(name: string, id: number = 2) {
    return { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: {} } };
  }

  /**
   * Assert a 403 insufficient_scope challenge
   * @param res - raw response
   * @param scope - expected challenge scope
   */
  async assertChallenge(res: Response, scope: string): Promise<void> {
    const base = await this.base();
    assert.strictEqual(res.status, 403);
    assert.strictEqual(
      res.headers.get("www-authenticate"),
      `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${base}/.well-known/oauth-protected-resource"`
    );
    assert.deepStrictEqual(await res.json(), {
      jsonrpc: "2.0",
      id: 2,
      error: { code: -32001, message: "insufficient_scope", data: { error: "insufficient_scope", scope } }
    });
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
    assert.ok(res.headers.get("www-authenticate")?.startsWith('Bearer error="invalid_token", resource_metadata='));
  }

  /**
   * @param token - bearer token
   * @param extra - extra headers
   * @returns the raw initialize response
   */
  async rawInit(token: string, extra: Record<string, string> = {}): Promise<Response> {
    return fetch(`${await this.base()}/mcp`, {
      method: "POST",
      headers: { ...HEADERS, authorization: `Bearer ${token}`, ...extra },
      body: JSON.stringify(INIT)
    });
  }

  @test
  async boundTokenAccepted() {
    const res = await this.rawInit(await this.bearer(["Fixture.*"]));
    assert.strictEqual(res.status, 200);
  }

  @test
  async appAudienceTokenRefused() {
    const res = await this.rawInit(await this.bearer(["Fixture.*"], null));
    assert.strictEqual(res.status, 401);
    assert.ok(res.headers.get("www-authenticate")?.startsWith('Bearer error="invalid_token", resource_metadata='));
  }

  @test
  async otherResourceRefused() {
    const res = await this.rawInit(await this.bearer(["Fixture.*"], "https://other.example/mcp"));
    assert.strictEqual(res.status, 401);
    assert.ok(res.headers.get("www-authenticate")?.includes('error="invalid_token"'));
  }

  @test
  async registersResource() {
    assert.ok(listProtectedResources().some(r => r.path === "/mcp" && r.uri === undefined));
  }

  @test
  async publicUrlBehindProxy() {
    const auth = useService("McpAuth") as McpOAuthAuthenticator;
    auth.getParameters().publicUrl = "https://mcp.example";
    const make = () => {
      const headers: Record<string, string> = {};
      let body = "";
      let session: any;
      const http = new HttpContext("internal", "POST", "/mcp", "http", 8080, {
        host: "internal:8080",
        "content-type": "application/json"
      });
      const ctx: any = {
        getHttpContext: () => http,
        setHeader: (k: string, v: string) => (headers[k] = v),
        write: (b: string) => (body += b),
        setSession: (s: any) => (session = s),
        getSession: () => new Session()
      };
      return { http, ctx, headers, body: () => body, session: () => session };
    };
    try {
      const ok = make();
      ok.http.headers.authorization = `Bearer ${await this.bearer(["Fixture.*"], "https://mcp.example/mcp")}`;
      assert.ok((await auth.authenticate(ok.ctx)).isLogged());
      assert.ok(ok.session().isLogged());
      const bad = make();
      bad.http.headers.authorization = `Bearer ${await this.bearer(["Fixture.*"], "https://internal:8080/mcp")}`;
      await assert.rejects(() => auth.authenticate(bad.ctx));
      assert.strictEqual(
        bad.headers["WWW-Authenticate"],
        'Bearer error="invalid_token", resource_metadata="https://mcp.example/.well-known/oauth-protected-resource"'
      );
      const meta = make();
      await auth.metadata(meta.ctx);
      assert.strictEqual(JSON.parse(meta.body()).resource, "https://mcp.example/mcp");
    } finally {
      delete auth.getParameters().publicUrl;
    }
  }

  @test
  async protectedResourceMetadata() {
    const base = await this.base();
    const res = await fetch(`${base}/.well-known/oauth-protected-resource`);
    assert.strictEqual(res.status, 200);
    const { scopes_supported: scopes, ...metadata } = await res.json();
    assert.deepStrictEqual(metadata, {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ["header"]
    });
    // Like the authorization server: `*`, the operation groups and offline_access, never the OAuth operations
    assert.strictEqual(scopes[0], "*");
    assert.strictEqual(scopes[scopes.length - 1], "offline_access");
    assert.ok(scopes.includes("Fixture.*"), scopes.join(" "));
    assert.ok(!scopes.includes("OAuth.*"), scopes.join(" "));
    // Configured scopes replace the default
    const auth = useService("McpAuth") as McpOAuthAuthenticator;
    auth.getParameters().scopesSupported = ["Fixture.Echo", "offline_access"];
    try {
      const configured = await (await fetch(`${base}/.well-known/oauth-protected-resource`)).json();
      assert.deepStrictEqual(configured.scopes_supported, ["Fixture.Echo", "offline_access"]);
    } finally {
      delete auth.getParameters().scopesSupported;
    }
  }

  @test
  async scopedTokenFiltersTools() {
    const client = await this.client(await this.bearer(["Fixture.Echo"]));
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.deepStrictEqual(names, ["Fixture.Echo"]);
    const ok = await client.callTool({ name: "Fixture.Echo", arguments: { text: "hi" } });
    assert.deepStrictEqual(ok.structuredContent, { text: "hi" });
    // a tool outside the scope is challenged for a wider scope
    await assert.rejects(() => client.callTool({ name: "Fixture.Version", arguments: {} }));
    await client.close();
    await this.assertChallenge(
      await this.rawCall(await this.bearer(["Fixture.Echo"]), this.callRequest("Fixture.Version")),
      "Fixture.Echo Fixture.Version"
    );
  }

  @test
  async outOfScopeHiddenByDefault() {
    const client = await this.client(await this.bearer(["Fixture.Echo"]));
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes("Fixture.Echo"));
    assert.ok(!names.includes("Fixture.Version"), names.join(" "));
    await client.close();
  }

  @test
  async outOfScopeCallChallenged() {
    const token = await this.bearer(["Fixture.Echo", "Fixture.Count"]);
    await this.assertChallenge(
      await this.rawCall(token, this.callRequest("Fixture.Version")),
      "Fixture.Echo Fixture.Count Fixture.Version"
    );
    // in a batch, the JSON-RPC error is carried in the body (HTTP 200)
    const batch = await this.rawCall(token, [this.callRequest("Fixture.Version")]);
    assert.strictEqual(batch.status, 200);
    const text = await batch.text();
    assert.ok(text.includes('"code":-32001'), text);
    assert.ok(text.includes('"scope":"Fixture.Echo Fixture.Count Fixture.Version"'), text);
  }

  @test
  async otherRefusalBehindScopeStillUnknown() {
    // registered after the token scope authorizer: the scope refusal comes first and hides this one
    const authorizer = async (_ctx, operationId) => operationId !== "Fixture.Version";
    registerOperationAuthorizer(authorizer as any);
    const mcp = useService("Mcp") as McpService;
    mcp.getParameters().listOutOfScopeTools = true;
    try {
      const token = await this.bearer(["Fixture.Echo"]);
      const client = await this.client(token);
      const names = (await client.listTools()).tools.map(t => t.name);
      assert.ok(names.includes("Fixture.Noop"), names.join(" "));
      assert.ok(!names.includes("Fixture.Version"), names.join(" "));
      await assert.rejects(() => client.callTool({ name: "Fixture.Version", arguments: {} }), /Unknown tool/);
      await client.close();
      const res = await this.rawCall(token, this.callRequest("Fixture.Version"));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("www-authenticate"), null);
    } finally {
      mcp.getParameters().listOutOfScopeTools = false;
      unregisterOperationAuthorizer(authorizer as any);
    }
  }

  @test
  async transportChecksBeforeChallenge() {
    const token = await this.bearer(["Fixture.Echo"]);
    const origin = await this.rawCall(token, this.callRequest("Fixture.Version"), { origin: "https://evil.example" });
    assert.strictEqual(origin.status, 403);
    assert.strictEqual(origin.headers.get("www-authenticate"), null);
    assert.match(await origin.text(), /Invalid Origin header/);
    const version = await this.rawCall(token, this.callRequest("Fixture.Version"), {
      "mcp-protocol-version": "1999-01-01"
    });
    assert.strictEqual(version.status, 400);
    assert.strictEqual(version.headers.get("www-authenticate"), null);
    assert.match(await version.text(), /Unsupported protocol version/);
  }

  @test
  async permissionDeniedStillUnknown() {
    // Fixture.Secret is reserved to alice: refused to bob whatever the token scope
    for (const scope of [["Fixture.*"], ["Fixture.Echo"]]) {
      const token = await this.bearer(scope, undefined, "bob");
      const client = await this.client(token);
      assert.ok(!(await client.listTools()).tools.some(t => t.name === "Fixture.Secret"));
      await assert.rejects(() => client.callTool({ name: "Fixture.Secret", arguments: {} }), /Unknown tool/);
      await client.close();
      const res = await this.rawCall(token, this.callRequest("Fixture.Secret"));
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.headers.get("www-authenticate"), null);
    }
  }

  @test
  async listOutOfScopeToolsOption() {
    const mcp = useService("Mcp") as McpService;
    assert.strictEqual(mcp.getParameters().listOutOfScopeTools, false);
    mcp.getParameters().listOutOfScopeTools = true;
    try {
      const client = await this.client(await this.bearer(["Fixture.Echo"], undefined, "bob"));
      const names = (await client.listTools()).tools.map(t => t.name);
      assert.ok(names.includes("Fixture.Echo"));
      assert.ok(names.includes("Fixture.Version"), names.join(" "));
      assert.ok(!names.includes("Fixture.Secret"), names.join(" "));
      await client.close();
    } finally {
      mcp.getParameters().listOutOfScopeTools = false;
    }
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
    const { scopes_supported: _scopes, ...metadata } = JSON.parse(body);
    assert.deepStrictEqual(metadata, {
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

@suite
class McpBearerSessionTest extends McpOAuthBase {
  /**
   * @returns configuration where the MCP service uses the default (Webda session) authenticator
   */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    delete config.services.Mcp.authenticator;
    return config;
  }

  @test
  async batchCannotWidenTheScope() {
    // an application token: the Webda session (a change-tracking proxy) carries its scopes
    const token = await this.bearer(["Fixture.Echo"], null);
    // ahead of the scope authorizer, delay every probe but the first one: the later probes of the batch then
    // run after the first one finished, and would see a scope it widened
    const registered = listOperationAuthorizers();
    let probes = 0;
    const delay = async (_ctx, _id, _op, { probe }) => {
      if (probe && probes++ > 0) await new Promise(r => setTimeout(r, 30));
      return true;
    };
    registered.forEach(a => unregisterOperationAuthorizer(a));
    [delay, ...registered].forEach(a => registerOperationAuthorizer(a as any));
    try {
      const call = (id: number) => this.callRequest("Fixture.Version", id);
      const refused = (text: string, id: number) => {
        const messages = text
          .split("\n")
          .filter(l => l.startsWith("data: "))
          .map(l => JSON.parse(l.slice(6)));
        assert.strictEqual(messages.find(m => m.id === id)?.error?.code, -32001, text);
      };
      probes = 0;
      const twice = await (await this.rawCall(token, [call(2), call(3)])).text();
      refused(twice, 2);
      refused(twice, 3);
      assert.ok(!twice.includes("1.2.3"), twice);
      probes = 0;
      const listed = await (
        await this.rawCall(token, [{ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, call(3)])
      ).text();
      refused(listed, 3);
      assert.ok(!listed.includes("1.2.3"), listed);
    } finally {
      unregisterOperationAuthorizer(delay as any);
    }
  }
}
