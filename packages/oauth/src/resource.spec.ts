import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import {
  HttpContext,
  RefreshToken,
  registerProtectedResource,
  runWithContext,
  unregisterProtectedResource,
  useRouter,
  useService,
  type WebContext
} from "@webda/core";
import { type Browser, OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthGrant } from "./models.model.js";
import { type OAuthClient, validateClient } from "./parameters.js";

/** Metadata document client used by the specs */
const METADATA_CLIENT = "https://client.example.com/oauth.json";
/** Redirect URI of the specs */
const REDIRECT_URI = "http://127.0.0.1:1234/callback";

@suite
class ResourceIndicatorTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    registerProtectedResource({ path: "/mcp" });
    for await (const t of RefreshToken.iterate("hash != ''", [])) await t.ref().delete();
    for await (const c of OAuthCode.iterate("hash != ''", [])) await c.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
  }

  /** @override */
  async afterEach() {
    unregisterProtectedResource("/mcp");
    unregisterProtectedResource("/other");
    unregisterTestOperations();
    vi.restoreAllMocks();
    await super.afterEach();
  }

  /**
   * @param path - resource path
   * @returns the absolute URI of the resource, derived from the issuer of the test requests
   */
  async resourceUri(path: string = "/mcp"): Promise<string> {
    const ctx = await this.newWebContext<WebContext>(new HttpContext("test.webda.io", "GET", "/", "http", 80, {}));
    return `${useService<any>("OAuthServer").issuer(ctx)}${path}`;
  }

  /**
   * Serve a metadata document client without fetching it
   */
  stubMetadataClient(): void {
    const server = useService<any>("OAuthServer");
    const original = server.clients.get.bind(server.clients);
    vi.spyOn(server.clients, "get").mockImplementation(async (id: any) =>
      id === METADATA_CLIENT
        ? ({
            id: METADATA_CLIENT,
            name: "Metadata client",
            redirect_uris: ["http://127.0.0.1/callback"],
            metadataDocument: true
          } as OAuthClient)
        : original(id)
    );
  }

  /**
   * Authorize (consent forced), allow every offered operation and return the code
   * @param browser - logged-in browser
   * @param extra - authorization parameters
   * @returns the code
   */
  async code(browser: Browser, extra: Record<string, string | undefined>): Promise<string> {
    await this.login(browser, "u1");
    const res = await this.authorize(browser, { redirect_uri: REDIRECT_URI, prompt: "consent", ...extra });
    assert.strictEqual(res.headers.Location, "http://test.webda.io/oauth/consent", res.headers.Location);
    const req = await this.op(browser, "OAuth.Consent.Get");
    const { redirect } = await this.op(browser, "OAuth.Consent.Decide", {
      allow: true,
      operations: req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      csrf: req.csrf
    });
    return query(redirect).code;
  }

  /**
   * Full code flow
   * @param extra - authorization parameters
   * @param token - extra token request parameters
   * @returns the token endpoint response
   */
  async tokens(extra: Record<string, string | undefined>, token: Record<string, string | undefined> = {}) {
    const browser = await this.browser();
    const code = await this.code(browser, extra);
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: browser.verifier,
      client_id: extra.client_id ?? "app",
      redirect_uri: REDIRECT_URI,
      ...token
    });
  }

  @test
  async authorizeBindsResource() {
    const resource = await this.resourceUri();
    const res = await this.tokens({ scope: "Task.*", resource }, { resource });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const tokens = useService("TokenService");
    const claims = await tokens.verifyAccess(res.body.access_token, { audience: resource });
    assert.strictEqual(claims?.aud, resource);
    assert.strictEqual(await tokens.verifyAccess(res.body.access_token), undefined);
    assert.strictEqual(
      await tokens.verifyAccess(res.body.access_token, { audience: await this.resourceUri("/other") }),
      undefined
    );
  }

  @test
  async missingResourceDefaultsForMetadataClient() {
    this.stubMetadataClient();
    const resource = await this.resourceUri();
    const res = await this.tokens({ scope: "Task.*", client_id: METADATA_CLIENT });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.ok(await useService("TokenService").verifyAccess(res.body.access_token, { audience: resource }));
  }

  @test
  async metadataClientWithSeveralResourcesMustChoose() {
    this.stubMetadataClient();
    registerProtectedResource({ path: "/other" });
    const b = await this.browser();
    await this.login(b, "u1");
    const res = await this.authorize(b, { scope: "Task.*", client_id: METADATA_CLIENT, redirect_uri: REDIRECT_URI });
    assert.strictEqual(res.status, 302);
    assert.strictEqual(query(res.headers.Location).error, "invalid_target");
    // An explicit resource is accepted
    const other = await this.resourceUri("/other");
    const ok = await this.tokens({ scope: "Task.*", client_id: METADATA_CLIENT, resource: other });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body));
    assert.ok(await useService("TokenService").verifyAccess(ok.body.access_token, { audience: other }));
  }

  @test
  async staticClientWithoutResourceKeepsAppAudience() {
    const res = await this.tokens({ scope: "Task.*" });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const tokens = useService("TokenService");
    assert.strictEqual((await tokens.verifyAccess(res.body.access_token))?.aud, "webda-access");
    assert.strictEqual(
      await tokens.verifyAccess(res.body.access_token, { audience: await this.resourceUri() }),
      undefined
    );
  }

  @test
  async staticClientDefaultResource() {
    const clients = useService<any>("OAuthServer").getParameters().clients;
    const resource = await this.resourceUri();
    clients.app.defaultResource = resource;
    try {
      const res = await this.tokens({ scope: "Task.*" });
      assert.strictEqual(res.status, 200, JSON.stringify(res.body));
      assert.ok(await useService("TokenService").verifyAccess(res.body.access_token, { audience: resource }));
      // A default resource that is not registered is refused
      clients.app.defaultResource = "https://elsewhere.example.com/mcp";
      const b = await this.browser();
      await this.login(b, "u1");
      const refused = await this.authorize(b, { scope: "Task.*" });
      assert.strictEqual(query(refused.headers.Location).error, "invalid_target");
    } finally {
      delete clients.app.defaultResource;
    }
  }

  @test
  async unknownResourceRedirectsInvalidTarget() {
    for (const resource of ["https://other.example.com/mcp", "webda-access", ""]) {
      const b = await this.browser();
      const res = await this.authorize(b, { scope: "Task.*", resource });
      assert.strictEqual(res.status, 302);
      const location = res.headers.Location as string;
      assert.ok(location.startsWith("http://127.0.0.1:1234/callback?"), location);
      assert.strictEqual(query(location).error, "invalid_target", resource);
      assert.strictEqual(query(location).state, "s");
      assert.strictEqual(b.jar["webda_oauth_pending"], undefined);
    }
  }

  /**
   * Authorization request with repeated `resource` parameters (the helper keeps a single value per name)
   * @param browser - logged-in browser
   * @param resources - resource parameters
   * @returns the response
   */
  async authorizeWithResources(browser: Browser, resources: string[]) {
    const { verifier, challenge } = this.pkce();
    browser.verifier = verifier;
    const search = new URLSearchParams([
      ["response_type", "code"],
      ["client_id", "app"],
      ["redirect_uri", REDIRECT_URI],
      ["code_challenge", challenge],
      ["code_challenge_method", "S256"],
      ["state", "s"],
      ["scope", "Task.* offline_access"],
      ["prompt", "consent"],
      ...resources.map((r): [string, string] => ["resource", r])
    ]);
    return this.get(browser, `/oauth/authorize?${search}`);
  }

  @test
  async repeatedResourceIsInvalidTarget() {
    const resource = await this.resourceUri();
    // Authorization endpoint: a repeated resource is not treated as absent, each one is checked
    const b = await this.browser();
    await this.login(b, "u1");
    const res = await this.authorizeWithResources(b, [resource, "https://other.example.com/mcp"]);
    assert.strictEqual(res.status, 302);
    assert.strictEqual(query(res.headers.Location).error, "invalid_target", res.headers.Location);
    // Token endpoint, form body: an access token has a single audience
    const browser = await this.browser();
    const code = await this.code(browser, { scope: "Task.*", resource });
    const http = new HttpContext("test.webda.io", "POST", "/oauth/token", "http", 80, {
      "content-type": "application/x-www-form-urlencoded"
    });
    http.setBody(
      new URLSearchParams([
        ["grant_type", "authorization_code"],
        ["code", code],
        ["code_verifier", browser.verifier!],
        ["client_id", "app"],
        ["redirect_uri", REDIRECT_URI],
        ["resource", resource],
        ["resource", resource]
      ]).toString()
    );
    http.setClientIp("127.0.0.1");
    const call = await this.newWebContext<WebContext>(http);
    await runWithContext(call, () => useRouter().execute(call));
    assert.strictEqual(call.statusCode, 400);
    assert.strictEqual(JSON.parse(call.getResponseBody()!.toString()).error, "invalid_target");
    // Token endpoint, JSON body with an array
    const json = await this.browser();
    const jsonCode = await this.code(json, { scope: "Task.*", resource });
    const jhttp = new HttpContext("test.webda.io", "POST", "/oauth/token", "http", 80, {
      "content-type": "application/json"
    });
    jhttp.setBody(
      JSON.stringify({
        grant_type: "authorization_code",
        code: jsonCode,
        code_verifier: json.verifier,
        client_id: "app",
        redirect_uri: REDIRECT_URI,
        resource: [resource, resource]
      })
    );
    jhttp.setClientIp("127.0.0.1");
    const jcall = await this.newWebContext<WebContext>(jhttp);
    await runWithContext(jcall, () => useRouter().execute(jcall));
    assert.strictEqual(jcall.statusCode, 400);
    assert.strictEqual(JSON.parse(jcall.getResponseBody()!.toString()).error, "invalid_target");
  }

  @test
  async tokenResourceMismatch() {
    const resource = await this.resourceUri();
    const res = await this.tokens({ scope: "Task.*", resource }, { resource: "https://other.example.com/mcp" });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, "invalid_target");
    // A code bound to no resource cannot be exchanged for a resource either
    const unbound = await this.tokens({ scope: "Task.*" }, { resource });
    assert.strictEqual(unbound.status, 400);
    assert.strictEqual(unbound.body.error, "invalid_target");
  }

  @test
  async refreshKeepsAudience() {
    const resource = await this.resourceUri();
    const res = await this.tokens({ scope: "Task.* offline_access", resource });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const refreshed = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: res.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refreshed.status, 200, JSON.stringify(refreshed.body));
    const tokens = useService("TokenService");
    assert.ok(await tokens.verifyAccess(refreshed.body.access_token, { audience: resource }));
    assert.strictEqual(await tokens.verifyAccess(refreshed.body.access_token), undefined);
    const mismatch = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshed.body.refresh_token,
      client_id: "app",
      resource: "https://other.example.com/mcp"
    });
    assert.strictEqual(mismatch.status, 400);
    assert.strictEqual(mismatch.body.error, "invalid_target");
    const same = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: refreshed.body.refresh_token,
      client_id: "app",
      resource
    });
    assert.strictEqual(same.status, 200, JSON.stringify(same.body));
  }

  @test
  async revokeBoundAccessToken() {
    const resource = await this.resourceUri();
    const res = await this.tokens({ scope: "Task.* offline_access", resource });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const revoked = await this.form("/oauth/revoke", { token: res.body.access_token, client_id: "app" });
    assert.strictEqual(revoked.status, 200);
    assert.strictEqual(
      await useService("TokenService").verifyAccess(res.body.access_token, { audience: resource }),
      undefined
    );
    const refresh = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: res.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refresh.body.error, "invalid_grant");
  }

  /**
   * @param token - access token
   * @returns its audience and family
   */
  async claims(token: string): Promise<{ aud: string; fam: string }> {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return { aud: payload.aud, fam: payload.fam };
  }

  @test
  async clientResourcesShareTheFamily() {
    const clients = useService<any>("OAuthServer").getParameters().clients;
    const mcp = await this.resourceUri();
    clients.app.resources = [mcp];
    try {
      // Signed in without a resource: the application audience, the MCP resource also allowed
      const browser = await this.browser();
      await this.login(browser, "u1");
      const res = await this.authorize(browser, {
        redirect_uri: REDIRECT_URI,
        prompt: "consent",
        scope: "Task.* offline_access"
      });
      assert.strictEqual(res.headers.Location, "http://test.webda.io/oauth/consent", res.headers.Location);
      const req = await this.op(browser, "OAuth.Consent.Get");
      assert.deepStrictEqual(req.resources, [mcp]);
      const { redirect } = await this.op(browser, "OAuth.Consent.Decide", {
        allow: true,
        operations: req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
        csrf: req.csrf
      });
      const first = await this.tokenRequest({
        grant_type: "authorization_code",
        code: query(redirect).code,
        code_verifier: browser.verifier,
        client_id: "app",
        redirect_uri: REDIRECT_URI
      });
      assert.strictEqual(first.status, 200, JSON.stringify(first.body));
      const app = await this.claims(first.body.access_token);
      assert.strictEqual(app.aud, "webda-access");
      const refresh = (extra: Record<string, string | undefined>, token: string) =>
        this.tokenRequest({ grant_type: "refresh_token", refresh_token: token, client_id: "app", ...extra });
      // Without resource: the application audience again
      const plain = await refresh({}, first.body.refresh_token);
      assert.strictEqual(plain.status, 200, JSON.stringify(plain.body));
      assert.strictEqual((await this.claims(plain.body.access_token)).aud, "webda-access");
      // With the MCP resource: an MCP token of the same family
      const bound = await refresh({ resource: mcp }, plain.body.refresh_token);
      assert.strictEqual(bound.status, 200, JSON.stringify(bound.body));
      assert.deepStrictEqual(await this.claims(bound.body.access_token), { aud: mcp, fam: app.fam });
      assert.strictEqual(bound.body.scope, first.body.scope);
      const tokens = useService("TokenService");
      assert.ok(await tokens.verifyAccess(bound.body.access_token, { audience: mcp }));
      assert.strictEqual(await tokens.verifyAccess(bound.body.access_token), undefined);
      // Another resource: invalid_target, the refresh token is not burnt
      registerProtectedResource({ path: "/other" });
      const other = await refresh({ resource: await this.resourceUri("/other") }, bound.body.refresh_token);
      assert.strictEqual(other.status, 400);
      assert.strictEqual(other.body.error, "invalid_target");
      const again = await refresh({}, bound.body.refresh_token);
      assert.strictEqual(again.status, 200, JSON.stringify(again.body));
      assert.strictEqual((await this.claims(again.body.access_token)).aud, "webda-access");
      // One family: revoking it kills the tokens of both audiences
      const revoked = await this.form("/oauth/revoke", { token: again.body.refresh_token, client_id: "app" });
      assert.strictEqual(revoked.status, 200);
      assert.strictEqual(await tokens.verifyAccess(again.body.access_token), undefined);
      assert.strictEqual(await tokens.verifyAccess(bound.body.access_token, { audience: mcp }), undefined);
      // The code exchange may name an allowed resource too: the family still defaults to the application audience
      const exchanged = await this.tokens({ scope: "Task.* offline_access" }, { resource: mcp });
      assert.strictEqual(exchanged.status, 200, JSON.stringify(exchanged.body));
      assert.strictEqual((await this.claims(exchanged.body.access_token)).aud, mcp);
      const back = await refresh({}, exchanged.body.refresh_token);
      assert.strictEqual((await this.claims(back.body.access_token)).aud, "webda-access");
    } finally {
      delete clients.app.resources;
    }
  }

  @test
  async authorizeAcceptsSeveralResources() {
    registerProtectedResource({ path: "/other" });
    const mcp = await this.resourceUri();
    const other = await this.resourceUri("/other");
    const b = await this.browser();
    await this.login(b, "u1");
    // The first resource is the one the family is bound to, the others may be minted from it; a repeat is one
    const res = await this.authorizeWithResources(b, [mcp, other, mcp]);
    assert.strictEqual(res.headers.Location, "http://test.webda.io/oauth/consent", res.headers.Location);
    const req = await this.op(b, "OAuth.Consent.Get");
    assert.deepStrictEqual(req.resources, [mcp, other]);
    const { redirect } = await this.op(b, "OAuth.Consent.Decide", {
      allow: true,
      operations: req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      csrf: req.csrf
    });
    const code = query(redirect).code;
    const stored = await OAuthCode.query("clientId = 'app'");
    assert.strictEqual(stored.results[0].resource, mcp);
    assert.deepStrictEqual(stored.results[0].resources, [other]);
    const exchange = (resource?: string) =>
      this.tokenRequest({
        grant_type: "authorization_code",
        code,
        code_verifier: b.verifier,
        client_id: "app",
        redirect_uri: REDIRECT_URI,
        resource
      });
    const tokens = await exchange(other);
    assert.strictEqual(tokens.status, 200, JSON.stringify(tokens.body));
    assert.strictEqual((await this.claims(tokens.body.access_token)).aud, other);
    const refresh = async (resource?: string) =>
      this.tokenRequest({
        grant_type: "refresh_token",
        refresh_token: tokens.body.refresh_token,
        client_id: "app",
        resource
      });
    assert.strictEqual((await this.claims((await refresh()).body.access_token)).aud, mcp);
    assert.strictEqual((await this.claims((await refresh(mcp)).body.access_token)).aud, mcp);
    const bound = await refresh(other);
    assert.strictEqual(bound.status, 200, JSON.stringify(bound.body));
    assert.strictEqual((await this.claims(bound.body.access_token)).aud, other);
    // The application audience is not part of the set
    const app = await this.tokens({ scope: "Task.*", resource: mcp }, {});
    assert.strictEqual((await this.claims(app.body.access_token)).aud, mcp);
  }

  @test
  async unknownClientResourceIsInvalidTarget() {
    const clients = useService<any>("OAuthServer").getParameters().clients;
    clients.app.resources = ["https://elsewhere.example.com/mcp"];
    try {
      const b = await this.browser();
      await this.login(b, "u1");
      const refused = await this.authorize(b, { scope: "Task.*" });
      assert.strictEqual(query(refused.headers.Location).error, "invalid_target");
      assert.strictEqual(query(refused.headers.Location).error_description, "Unknown resource");
    } finally {
      delete clients.app.resources;
    }
  }

  @test
  clientResourcesAreValidated() {
    const base = { name: "C", redirect_uris: ["http://127.0.0.1/callback"] };
    validateClient("c", { ...base, resources: ["https://example.com/mcp", "http://localhost:18080/mcp"] });
    validateClient("c", { ...base, resources: [] });
    for (const bad of ["https://example.com/mcp", [""], ["ftp://example.com/mcp"], [12], {}]) {
      assert.throws(() => validateClient("c", { ...base, resources: bad }), /resources must be/);
    }
  }

  @test
  defaultResourceIsValidated() {
    const base = { name: "C", redirect_uris: ["http://127.0.0.1/callback"] };
    validateClient("c", { ...base, defaultResource: "https://example.com/mcp" });
    validateClient("c", { ...base, defaultResource: "http://localhost:18080/mcp" });
    for (const bad of ["webda-access", "", "ftp://example.com/mcp", 12]) {
      assert.throws(() => validateClient("c", { ...base, defaultResource: bad }), /defaultResource/);
    }
  }
}
