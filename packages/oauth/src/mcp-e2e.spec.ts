import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createHash, randomBytes } from "node:crypto";
import { registerOperation, useContext, useInstanceStorage, useRouter, useService, WebdaError } from "@webda/core";
import { HttpServer } from "@webda/core/lib/services/httpserver.service.js";
import { McpOAuthAuthenticator, McpService } from "@webda/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { OAuthTest } from "./test/oauthtest.js";

/** A cookie jar: name → value and path */
type Jar = Record<string, { value: string; path: string }>;

/** Operations exposed as MCP tools: one in the requested scope, one outside, one the user may never call */
const MCP_OPERATIONS: Record<string, { permission?: string }> = {
  "Task.Whoami": {},
  "Note.Whoami": {},
  "Admin.Whoami": { permission: "roles CONTAINS 'admin'" }
};

const MCP_HEADERS = { "content-type": "application/json", accept: "application/json, text/event-stream" };
const INITIALIZE = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "raw", version: "1" } }
};

/** Tokens of a client */
interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
}

/**
 * An MCP client of each kind, through a real HTTP server and the router only: discovery, dynamic registration,
 * browser sign-in and consent, tokens bound to the MCP resource, tool calls restricted to the granted scope, refresh
 * and revocation
 */
@suite
class McpOAuthEndToEndTest extends OAuthTest {
  /** Base URL of the HTTP server */
  base: string;

  /** @override */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    config.services.HttpServer = { type: "Webda/HttpServer", port: 0 };
    config.services.McpAuth = { type: "Webda/McpOAuthAuthenticator" };
    config.services.Mcp = { type: "Webda/McpService", authenticator: "McpAuth" };
    // The general operations API: an MCP-bound token must not reach it
    config.services.Operations = { type: "Webda/OperationsTransport" };
    return config;
  }

  /** @override */
  async tweakApp(app: any): Promise<void> {
    await super.tweakApp(app);
    app.addModda("Webda/HttpServer", HttpServer);
    app.addModda("Webda/McpOAuthAuthenticator", McpOAuthAuthenticator);
    app.addModda("Webda/McpService", McpService);
  }

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    const server: any = useService("OAuthServer");
    // The tools: who is calling, through the delegated token
    server.whoami = async () => {
      const session = useContext().getSession();
      if (!session?.isLogged()) throw new WebdaError.Unauthorized("Login required");
      return { userId: session.userId };
    };
    for (const [id, definition] of Object.entries(MCP_OPERATIONS)) {
      registerOperation(id, { service: "OAuthServer", method: "whoami", ...definition } as any);
    }
    // The login page of the application: logs the browser in and goes back
    server.addRoute("/login{?redirect}", ["GET"], async ctx => {
      ctx.getSession().login("u1", "u1@email", { provider: "email", amr: ["pwd"] });
      ctx.redirect(ctx.parameter("redirect"));
    });
    useRouter().remapRoutes();
    const http: any = useService("HttpServer" as any);
    if (!http.server?.listening) {
      await http.start("127.0.0.1", 0);
      for (let i = 0; i < 100 && !http.server?.listening; i++) await new Promise(r => setTimeout(r, 20));
    }
    this.base = `http://127.0.0.1:${http.server.address().port}`;
  }

  /** @override */
  async afterEach() {
    for (const id of Object.keys(MCP_OPERATIONS)) delete useInstanceStorage().operations[id];
    (useService("Mcp" as any) as McpService).getParameters().listOutOfScopeTools = false;
    await super.afterEach();
  }

  /**
   * Send a request like a browser: the cookies of the path go with it, the ones set by the response fill the jar
   * @param jar - cookie jar
   * @param url - absolute URL or path
   * @param init - fetch options
   * @returns the response
   */
  async browse(jar: Jar, url: string, init: RequestInit = {}): Promise<Response> {
    const target = new URL(url, this.base);
    const cookie = Object.entries(jar)
      .filter(([, c]) => target.pathname.startsWith(c.path))
      .map(([name, c]) => `${name}=${c.value}`)
      .join("; ");
    const res = await fetch(target, {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers as any), ...(cookie ? { cookie } : {}) }
    });
    for (const header of res.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(";").map(p => p.trim());
      const [name, ...value] = pair.split("=");
      const path = attributes.find(a => /^path=/i.test(a))?.slice(5) ?? "/";
      const expired = attributes.some(a => /^max-age=(0|-)/i.test(a) || /^expires=thu, 01 jan 1970/i.test(a));
      if (expired || value.join("=") === "") delete jar[name];
      else jar[name] = { value: value.join("="), path };
    }
    return res;
  }

  /**
   * POST a form like a native client
   * @param url - absolute URL
   * @param fields - form fields, undefined ones are left out
   * @returns the response
   */
  postForm(url: string, fields: Record<string, string | undefined>): Promise<Response> {
    return fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(
        Object.entries(fields).filter((e): e is [string, string] => e[1] !== undefined)
      ).toString()
    });
  }

  /**
   * What an MCP client does before signing in: read the protected resource metadata, then the metadata of its
   * authorization server
   * @returns the MCP resource URI and the authorization server metadata
   */
  async discover(): Promise<{ resource: string; as: any }> {
    const unauthorized = await fetch(`${this.base}/mcp`, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify(INITIALIZE)
    });
    assert.strictEqual(unauthorized.status, 401);
    const challenge = unauthorized.headers.get("www-authenticate")!;
    const metadataUrl = /resource_metadata="([^"]+)"/.exec(challenge)?.[1];
    assert.strictEqual(metadataUrl, `${this.base}/.well-known/oauth-protected-resource`);
    const prm = await (await fetch(metadataUrl!)).json();
    assert.strictEqual(prm.resource, `${this.base}/mcp`);
    const [issuer] = prm.authorization_servers;
    const as = await (await fetch(`${issuer}/.well-known/oauth-authorization-server`)).json();
    assert.strictEqual(as.registration_endpoint, `${this.base}/oauth/register`);
    assert.deepStrictEqual(as.code_challenge_methods_supported, ["S256"]);
    assert.deepStrictEqual(as.token_endpoint_auth_methods_supported, ["none"]);
    return { resource: prm.resource, as };
  }

  /**
   * Register a public client (RFC 7591)
   * @param as - authorization server metadata
   * @param redirectUri - redirect URI of the client
   * @returns the client id
   */
  async register(as: any, redirectUri: string): Promise<string> {
    const res = await fetch(as.registration_endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Agent",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none"
      })
    });
    assert.strictEqual(res.status, 201);
    const client = await res.json();
    assert.match(client.client_id, /^dcr_/);
    assert.strictEqual(client.client_secret, undefined);
    assert.deepStrictEqual(client.redirect_uris, [redirectUri]);
    return client.client_id;
  }

  /**
   * Authorization code flow in the browser, then the code exchange
   * @param options - client, requested scope, whether `resource` is sent, the operations to allow (all offered
   * ones by default) and an already logged-in browser
   * @returns the tokens and the consent request the user saw
   */
  async authorize(
    as: any,
    options: {
      clientId: string;
      redirectUri: string;
      scope: string;
      resource?: string;
      allow?: string[];
      remember?: boolean;
      jar?: Jar;
    }
  ): Promise<{ tokens: Tokens; request: any; jar: Jar }> {
    const jar = options.jar ?? {};
    const verifier = randomBytes(32).toString("base64url");
    const params: Record<string, string> = {
      response_type: "code",
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      state: "st",
      scope: options.scope
    };
    if (options.resource) params.resource = options.resource;
    let res = await this.browse(jar, `${as.authorization_endpoint}?${new URLSearchParams(params)}`);
    assert.strictEqual(res.status, 302);
    // Not logged in yet: the login page, then back to the consent page
    if (new URL(res.headers.get("location")!, this.base).pathname === "/login") {
      res = await this.browse(jar, res.headers.get("location")!);
      assert.strictEqual(res.status, 302);
    }
    const consentPage = await this.browse(jar, res.headers.get("location")!);
    assert.strictEqual(consentPage.status, 200);
    const request = await (await this.browse(jar, "/oauth/consent/request")).json();
    const offered: string[] = request.operations.flatMap((g: any) => g.ids.map((i: any) => i.id));
    const decide = await this.browse(jar, "/oauth/consent/decide", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        allow: true,
        operations: options.allow ?? offered,
        csrf: request.csrf,
        remember: options.remember
      })
    });
    assert.strictEqual(decide.status, 200);
    const redirect: string = (await decide.json()).redirect;
    assert.ok(redirect.startsWith(`${options.redirectUri}?`), redirect);
    const callback = new URL(redirect);
    assert.strictEqual(callback.searchParams.get("state"), "st");
    const token = await this.postForm(as.token_endpoint, {
      grant_type: "authorization_code",
      code: callback.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: options.clientId,
      redirect_uri: options.redirectUri,
      resource: options.resource
    });
    const tokens = await token.json();
    assert.strictEqual(token.status, 200, JSON.stringify(tokens));
    return { tokens, request, jar };
  }

  /**
   * @param token - access token
   * @returns its audience
   */
  audience(token: string): string | string[] {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()).aud;
  }

  /**
   * @param token - access token
   * @returns an MCP SDK client connected with the token
   */
  async mcpClient(token: string): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(new URL(`${this.base}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${token}` } }
    });
    const client = new Client({ name: "e2e", version: "1.0.0" });
    await client.connect(transport);
    return client;
  }

  /**
   * Call a tool with raw HTTP in a new MCP session: the SDK client hides the HTTP status and challenge
   * @param token - access token
   * @param name - tool name
   * @returns the response to the tools/call request
   */
  async rawToolCall(token: string, name: string): Promise<Response> {
    const headers = { ...MCP_HEADERS, authorization: `Bearer ${token}` };
    const init = await fetch(`${this.base}/mcp`, { method: "POST", headers, body: JSON.stringify(INITIALIZE) });
    assert.strictEqual(init.status, 200);
    await init.text();
    const session = {
      ...headers,
      "mcp-session-id": init.headers.get("mcp-session-id")!,
      "mcp-protocol-version": "2025-11-25"
    };
    await (
      await fetch(`${this.base}/mcp`, {
        method: "POST",
        headers: session,
        body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })
      })
    ).text();
    return fetch(`${this.base}/mcp`, {
      method: "POST",
      headers: session,
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } })
    });
  }

  /**
   * Assert the step-up challenge of an out-of-scope tool call
   * @param res - response of the call
   * @param scope - scope the challenge must ask for
   */
  async assertInsufficientScope(res: Response, scope: string): Promise<void> {
    assert.strictEqual(res.status, 403);
    assert.strictEqual(
      res.headers.get("www-authenticate"),
      `Bearer error="insufficient_scope", scope="${scope}", resource_metadata="${this.base}/.well-known/oauth-protected-resource"`
    );
    assert.deepStrictEqual((await res.json()).error, {
      code: -32001,
      message: "insufficient_scope",
      data: { error: "insufficient_scope", scope }
    });
  }

  /**
   * The whole life of a client of one kind
   * @param redirectUri - redirect URI the client registers
   * @param sendResource - send `resource` (RFC 8707) to /authorize, /token and refresh; without it the token is
   * bound to the only MCP resource
   * @returns the consent request the user saw
   */
  async clientLifecycle(redirectUri: string, sendResource: boolean): Promise<any> {
    const { resource, as } = await this.discover();
    const clientId = await this.register(as, redirectUri);
    const { tokens, request } = await this.authorize(as, {
      clientId,
      redirectUri,
      scope: "Task.* offline_access",
      resource: sendResource ? resource : undefined
    });
    assert.strictEqual(request.client.id, clientId);
    assert.strictEqual(request.client.verified, false);
    assert.strictEqual(tokens.scope, "Task.* offline_access");
    assert.ok(tokens.refresh_token);
    assert.strictEqual(this.audience(tokens.access_token), resource);
    // Bound to the MCP resource: the general operations API refuses the token, even for an operation in scope
    const operations = await fetch(`${this.base}/operations/Task.Whoami`, {
      method: "POST",
      headers: { authorization: `Bearer ${tokens.access_token}`, "content-type": "application/json" },
      body: "{}"
    });
    assert.strictEqual(operations.status, 401, await operations.text());
    // In scope: listed and callable; out of scope: hidden; never callable by the user: hidden
    const client = await this.mcpClient(tokens.access_token);
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.deepStrictEqual(names, ["Task.Whoami"]);
    const result = await client.callTool({ name: "Task.Whoami", arguments: {} });
    assert.strictEqual(result.isError, undefined, JSON.stringify(result));
    assert.deepStrictEqual(result.structuredContent, { userId: "u1" });
    await assert.rejects(() => client.callTool({ name: "Admin.Whoami", arguments: {} }), /Unknown tool/);
    await client.close();
    // Out of scope: the step-up challenge
    await this.assertInsufficientScope(
      await this.rawToolCall(tokens.access_token, "Note.Whoami"),
      "Task.* offline_access Note.Whoami"
    );
    // Refresh: still bound to the resource
    const refresh = await this.postForm(as.token_endpoint, {
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: clientId,
      resource: sendResource ? resource : undefined
    });
    const refreshed: Tokens = await refresh.json();
    assert.strictEqual(refresh.status, 200, JSON.stringify(refreshed));
    assert.strictEqual(this.audience(refreshed.access_token), resource);
    const again = await this.mcpClient(refreshed.access_token);
    assert.deepStrictEqual((await again.callTool({ name: "Task.Whoami", arguments: {} })).structuredContent, {
      userId: "u1"
    });
    await again.close();
    // Revoke the family: the MCP endpoint refuses its access tokens
    const revoke = await this.postForm(as.revocation_endpoint, {
      token: refreshed.refresh_token,
      client_id: clientId
    });
    assert.strictEqual(revoke.status, 200);
    for (const token of [refreshed.access_token, tokens.access_token]) {
      const res = await fetch(`${this.base}/mcp`, {
        method: "POST",
        headers: { ...MCP_HEADERS, authorization: `Bearer ${token}` },
        body: JSON.stringify(INITIALIZE)
      });
      assert.strictEqual(res.status, 401);
      assert.strictEqual(
        res.headers.get("www-authenticate"),
        `Bearer error="invalid_token", resource_metadata="${this.base}/.well-known/oauth-protected-resource"`
      );
    }
    return request;
  }

  @test
  async loopbackClient() {
    // Claude Code, Codex CLI, Gemini CLI, Goose: a local callback server on a random port
    const port = 20000 + Math.floor(Math.random() * 40000);
    const request = await this.clientLifecycle(`http://127.0.0.1:${port}/callback`, true);
    assert.strictEqual(request.client.host, "local application");
  }

  @test
  async customSchemeClient() {
    // Cursor, VS Code: an editor URL scheme
    const request = await this.clientLifecycle("cursor://anysphere.cursor-mcp/oauth/callback", false);
    assert.strictEqual(request.client.host, "local application");
  }

  @test
  async hostedCallbackClient() {
    // claude.ai and ChatGPT connectors: a hosted https callback
    const request = await this.clientLifecycle("https://claude.ai/api/mcp/auth_callback", true);
    assert.strictEqual(request.client.host, "claude.ai");
  }

  @test
  async stepUpWithListOutOfScopeTools() {
    (useService("Mcp" as any) as McpService).getParameters().listOutOfScopeTools = true;
    const redirectUri = "http://127.0.0.1:43123/callback";
    const { resource, as } = await this.discover();
    const clientId = await this.register(as, redirectUri);
    const first = await this.authorize(as, {
      clientId,
      redirectUri,
      scope: "Task.* offline_access",
      remember: true
    });
    // Listed though out of scope, so the agent can discover it; the permission-denied tool and the operations the
    // authorization server never delegates stay hidden
    const client = await this.mcpClient(first.tokens.access_token);
    const names = (await client.listTools()).tools.map(t => t.name);
    assert.ok(names.includes("Task.Whoami") && names.includes("Note.Whoami"), names.join(" "));
    assert.ok(!names.includes("Admin.Whoami"), names.join(" "));
    assert.ok(!names.some(name => name.startsWith("OAuth.")), names.join(" "));
    await client.close();
    const challenge = await this.rawToolCall(first.tokens.access_token, "Note.Whoami");
    const scope = /scope="([^"]+)"/.exec(challenge.headers.get("www-authenticate") ?? "")?.[1];
    await this.assertInsufficientScope(challenge, "Task.* offline_access Note.Whoami");
    // Re-authorize with the challenge scope, in the same browser: the remembered operations are already allowed,
    // only the new one is decided
    const second = await this.authorize(as, {
      clientId,
      redirectUri,
      scope: scope!,
      allow: ["Note.Whoami"],
      jar: first.jar
    });
    const offered = second.request.operations.flatMap((g: any) => g.ids);
    assert.strictEqual(offered.find((i: any) => i.id === "Task.Whoami")?.alreadyAllowed, true);
    assert.strictEqual(offered.find((i: any) => i.id === "Note.Whoami")?.alreadyAllowed, undefined);
    assert.strictEqual(this.audience(second.tokens.access_token), resource);
    // The new token calls the new tool and the earlier one
    const widened = await this.mcpClient(second.tokens.access_token);
    for (const name of ["Note.Whoami", "Task.Whoami"]) {
      const result = await widened.callTool({ name, arguments: {} });
      assert.deepStrictEqual(result.structuredContent, { userId: "u1" }, name);
    }
    await widened.close();
  }
}
