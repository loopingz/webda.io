import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  HttpContext,
  registerProtectedResource,
  runWithContext,
  unregisterProtectedResource,
  useRouter,
  useService
} from "@webda/core";
import type { WebContext } from "@webda/core";
import { OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthGrant, OAuthRegisteredClient } from "./models.model.js";

const LOOPBACK = "http://127.0.0.1:5555/callback";

@suite
class RegistrationTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    registerProtectedResource({ path: "/mcp" });
    for await (const c of OAuthRegisteredClient.iterate("uuid != ''", [])) await c.ref().delete();
    for await (const c of OAuthCode.iterate("hash != ''", [])) await c.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
  }

  /** @override */
  async afterEach() {
    unregisterProtectedResource("/mcp");
    delete (useService<any>("OAuthServer").getParameters() as any).registrationRedirectPatterns;
    unregisterTestOperations();
    await super.afterEach();
  }

  /**
   * @param body - JSON registration body
   * @returns the response
   */
  async register(body: unknown, ip: string = "127.0.0.1") {
    const http = new HttpContext("test.webda.io", "POST", "/oauth/register", "http", 80, {
      "content-type": "application/json"
    });
    http.setBody(JSON.stringify(body));
    http.setClientIp(ip);
    const call = await this.newWebContext<WebContext>(http);
    await runWithContext(call, () => useRouter().execute(call));
    return {
      status: call.statusCode,
      body: JSON.parse(call.getResponseBody()!.toString()),
      headers: call.getResponseHeaders() as any
    };
  }

  async count(): Promise<number> {
    let n = 0;
    for await (const _ of OAuthRegisteredClient.iterate("uuid != ''", [])) n++;
    return n;
  }

  /**
   * Authorize a registered client (consent forced) and exchange the code
   * @param clientId - client
   * @param redirect - redirect URI
   * @returns the token response
   */
  async flow(clientId: string, redirect: string) {
    const browser = await this.browser();
    await this.login(browser, "u1");
    const res = await this.authorize(browser, {
      client_id: clientId,
      redirect_uri: redirect,
      scope: "Task.*",
      prompt: "consent"
    });
    assert.strictEqual(res.headers.Location, "http://test.webda.io/oauth/consent", res.headers.Location);
    const req = await this.op(browser, "OAuth.Consent.Get");
    const { redirect: back } = await this.op(browser, "OAuth.Consent.Decide", {
      allow: true,
      operations: req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      csrf: req.csrf
    });
    return this.tokenRequest({
      grant_type: "authorization_code",
      code: query(back).code,
      code_verifier: browser.verifier,
      client_id: clientId,
      redirect_uri: redirect
    });
  }

  @test
  async registerLoopbackClient() {
    const res = await this.register({ client_name: "Loop", redirect_uris: [LOOPBACK], scope: "Task.* bogus" });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    assert.ok(res.body.client_id.startsWith("dcr_"));
    assert.strictEqual(res.body.token_endpoint_auth_method, "none");
    assert.deepStrictEqual(res.body.grant_types, ["authorization_code", "refresh_token"]);
    assert.deepStrictEqual(res.body.response_types, ["code"]);
    assert.strictEqual(res.body.scope, "Task.*");
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    const stored = await OAuthRegisteredClient.ref(res.body.client_id).get();
    assert.strictEqual(stored.ip, "127.0.0.1");
    assert.ok(stored.expiresAt > Date.now());
    const browser = await this.browser();
    await this.login(browser, "u1");
    const auth = await this.authorize(browser, { client_id: res.body.client_id, redirect_uri: LOOPBACK });
    assert.strictEqual(auth.status, 302);
    assert.ok(!query(auth.headers.Location).error, auth.headers.Location);
  }

  @test
  async registerCustomScheme() {
    const uri = "cursor://anysphere.cursor-retrieval/oauth/callback";
    const res = await this.register({ client_name: "Cursor", redirect_uris: [uri] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const browser = await this.browser();
    await this.login(browser, "u1");
    const auth = await this.authorize(browser, { client_id: res.body.client_id, redirect_uri: uri, scope: "Task.*" });
    assert.ok(!query(auth.headers.Location).error, auth.headers.Location);
  }

  @test
  async registerHttpsCallback() {
    const uri = "https://claude.ai/api/mcp/auth_callback";
    const res = await this.register({ client_name: "Claude", redirect_uris: [uri] });
    assert.strictEqual(res.status, 201, JSON.stringify(res.body));
    const browser = await this.browser();
    await this.login(browser, "u1");
    const auth = await this.authorize(browser, { client_id: res.body.client_id, redirect_uri: uri, scope: "Task.*" });
    assert.ok(!query(auth.headers.Location).error, auth.headers.Location);
  }

  @test
  async registeredClientDefaultsToOnlyResource() {
    const res = await this.register({ client_name: "Loop", redirect_uris: [LOOPBACK] });
    const tokens = await this.flow(res.body.client_id, LOOPBACK);
    assert.strictEqual(tokens.status, 200, JSON.stringify(tokens.body));
    const ctx = await this.newWebContext<WebContext>(new HttpContext("test.webda.io", "GET", "/", "http", 80, {}));
    const audience = `${useService<any>("OAuthServer").issuer(ctx)}/mcp`;
    const service = useService("TokenService");
    assert.ok(await service.verifyAccess(tokens.body.access_token, { audience }));
    assert.strictEqual(await service.verifyAccess(tokens.body.access_token), undefined);
  }

  @test
  async registrationOffByDefaultWithoutResources() {
    unregisterProtectedResource("/mcp");
    const res = await this.register({ redirect_uris: [LOOPBACK] });
    assert.strictEqual(res.status, 404);
    const browser = await this.browser();
    const meta = await this.get(browser, "/.well-known/oauth-authorization-server");
    assert.strictEqual(meta.body.registration_endpoint, undefined);
    assert.strictEqual(await this.count(), 0);
  }

  @test
  async metadataAdvertisesRegistration() {
    const browser = await this.browser();
    const meta = await this.get(browser, "/.well-known/oauth-authorization-server");
    assert.strictEqual(meta.body.registration_endpoint, "http://test.webda.io/oauth/register");
  }

  @test
  async registrationRejectsBadMetadata() {
    const ok = [LOOPBACK];
    const cases: [any, string][] = [
      [["x"], "invalid_client_metadata"],
      [{ redirect_uris: ok, token_endpoint_auth_method: "client_secret_basic" }, "invalid_client_metadata"],
      [{ redirect_uris: ok, grant_types: ["implicit"] }, "invalid_client_metadata"],
      [{ redirect_uris: ok, grant_types: ["client_credentials"] }, "invalid_client_metadata"],
      [{ redirect_uris: ok, response_types: ["token"] }, "invalid_client_metadata"],
      [{ redirect_uris: ok, client_uri: "http://client.example.com" }, "invalid_client_metadata"],
      [{ redirect_uris: ok, logo_uri: "javascript:alert(1)" }, "invalid_client_metadata"],
      [{ redirect_uris: ok, client_name: "x".repeat(101) }, "invalid_client_metadata"],
      [{ redirect_uris: [] }, "invalid_redirect_uri"],
      [{}, "invalid_redirect_uri"],
      [{ redirect_uris: ["http://evil.example/cb"] }, "invalid_redirect_uri"],
      [{ redirect_uris: ["javascript:alert(1)"] }, "invalid_redirect_uri"],
      [{ redirect_uris: ["https://a.example/cb#frag"] }, "invalid_redirect_uri"],
      [{ redirect_uris: Array.from({ length: 21 }, (_, i) => `https://a.example/${i}`) }, "invalid_redirect_uri"]
    ];
    for (const [body, error] of cases) {
      const res = await this.register(body);
      assert.strictEqual(res.status, 400, JSON.stringify(body));
      assert.strictEqual(res.body.error, error, JSON.stringify(body));
    }
    // Not JSON
    const form = await this.form("/oauth/register", { redirect_uris: LOOPBACK });
    assert.strictEqual(form.status, 400);
    assert.strictEqual(await this.count(), 0);
    // Unknown fields are ignored
    assert.strictEqual((await this.register({ redirect_uris: ok, unknown: 1 })).status, 201);
  }

  @test
  async registrationPatterns() {
    (useService<any>("OAuthServer").getParameters() as any).registrationRedirectPatterns = ["http://127.0.0.1/*"];
    const bad = await this.register({ redirect_uris: ["https://evil.example/cb"] });
    assert.strictEqual(bad.status, 400);
    assert.strictEqual(bad.body.error, "invalid_redirect_uri");
    assert.strictEqual(await this.count(), 0);
    assert.strictEqual((await this.register({ redirect_uris: ["http://127.0.0.1/cb"] })).status, 201);
  }

  @test
  async registrationRateLimited() {
    for (let i = 0; i < 20; i++) {
      assert.strictEqual((await this.register({ redirect_uris: [LOOPBACK] })).status, 201, `${i}`);
    }
    const res = await this.register({ redirect_uris: [LOOPBACK] });
    assert.strictEqual(res.status, 429);
    assert.strictEqual(res.body.error, "slow_down");
    assert.strictEqual(await this.count(), 20);
  }
}
