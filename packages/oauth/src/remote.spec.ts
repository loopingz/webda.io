import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createPublicKey, verify } from "node:crypto";
import { RefreshToken, registerProtectedResource, unregisterProtectedResource, useService } from "@webda/core";
import { type Browser, OAuthTest, query, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthCode, OAuthGrant } from "./models.model.js";

/** Issuer of the specs */
const ISSUER = "https://auth.example.com";
/** Protected resource served by another application */
const REMOTE = "https://api.example.com";
/** Redirect URI of the specs */
const REDIRECT_URI = "http://127.0.0.1:1234/callback";

/**
 * @param part - base64url JSON part of a JWT
 * @returns the parsed part
 */
const decode = (part: string): any => JSON.parse(Buffer.from(part, "base64url").toString());

@suite
class RemoteResourceTest extends OAuthTest {
  /** @override */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    config.services.CryptoService = {
      type: "Webda/CryptoService",
      autoCreate: true,
      url: "/jwks",
      jwt: { algorithm: "RS256" }
    };
    Object.assign(config.services.OAuthServer, { issuer: ISSUER, resources: [REMOTE] });
    return config;
  }

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    // The operations of a remote resource are not operations of this application
    for await (const t of RefreshToken.iterate("hash != ''", [])) await t.ref().delete();
    for await (const c of OAuthCode.iterate("hash != ''", [])) await c.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
  }

  /** @override */
  async afterEach() {
    unregisterProtectedResource("/mcp");
    unregisterTestOperations();
    await super.afterEach();
  }

  /**
   * Authorize (consent forced), allow every offered operation and return the code
   * @param browser - browser
   * @param extra - authorization parameters
   * @returns the code
   */
  async code(browser: Browser, extra: Record<string, string | undefined>): Promise<string> {
    await this.login(browser, "u1");
    const res = await this.authorize(browser, { redirect_uri: REDIRECT_URI, prompt: "consent", ...extra });
    assert.ok(!query(res.headers.Location).error, res.headers.Location);
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
   * @returns the token endpoint response
   */
  async tokens(extra: Record<string, string | undefined>) {
    const browser = await this.browser();
    const code = await this.code(browser, extra);
    return this.tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: browser.verifier,
      client_id: "app",
      redirect_uri: REDIRECT_URI
    });
  }

  /**
   * Verify a token like the remote application: from the published JWKS only
   * @param token - access token
   * @returns the verified payload
   */
  async verifyRemotely(token: string): Promise<any> {
    const jwks = await this.get(await this.browser(), "/jwks");
    assert.strictEqual(jwks.status, 200);
    const [header, payload, signature] = token.split(".");
    const { kid, alg, typ } = decode(header);
    assert.strictEqual(alg, "RS256");
    assert.strictEqual(typ, "at+jwt");
    const jwk = jwks.body.keys.find((k: any) => k.kid === kid);
    assert.ok(jwk, "signing key published");
    assert.ok(
      verify(
        "RSA-SHA256",
        Buffer.from(`${header}.${payload}`),
        createPublicKey({ key: jwk, format: "jwk" }),
        Buffer.from(signature, "base64url")
      ),
      "signature"
    );
    const claims = decode(payload);
    assert.strictEqual(claims.iss, ISSUER);
    assert.strictEqual(claims.aud, REMOTE);
    assert.ok(claims.exp > Date.now() / 1000);
    return claims;
  }

  @test
  async remoteResourceTokenVerifiesFromJwks() {
    const res = await this.tokens({ scope: "Task.* offline_access", resource: REMOTE });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const claims = await this.verifyRemotely(res.body.access_token);
    assert.strictEqual(claims.sub, "u1");
    assert.strictEqual(claims.client_id, "app");
    assert.ok(claims.scope.includes("Task."), claims.scope);
    // Refreshed tokens keep the issuer and the audience
    const refreshed = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: res.body.refresh_token,
      client_id: "app"
    });
    assert.strictEqual(refreshed.status, 200, JSON.stringify(refreshed.body));
    assert.strictEqual((await this.verifyRemotely(refreshed.body.access_token)).sub, "u1");
  }

  @test
  async remoteConsentListsTheRequestedScope() {
    const browser = await this.browser();
    await this.login(browser, "u1");
    const scope = "Task.Get Task.Update offline_access";
    await this.authorize(browser, { redirect_uri: REDIRECT_URI, scope, resource: REMOTE });
    const req = await this.op(browser, "OAuth.Consent.Get");
    // Not expanded against the operations of this application: the remote application enforces its permissions
    assert.deepStrictEqual(
      req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      ["Task.Get", "Task.Update"]
    );
    assert.strictEqual(req.offlineAccess, true);
    assert.strictEqual(req.rememberable, false);
    // Only requested entries are granted: an unrequested glob is ignored
    const { redirect } = await this.op(browser, "OAuth.Consent.Decide", {
      allow: true,
      operations: ["Task.Get", "*", "Admin.Purge"],
      csrf: req.csrf,
      remember: true
    });
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code: query(redirect).code,
      code_verifier: browser.verifier,
      client_id: "app",
      redirect_uri: REDIRECT_URI
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    assert.strictEqual(res.body.scope, "Task.Get offline_access");
    assert.strictEqual((await this.verifyRemotely(res.body.access_token)).scope, "Task.Get offline_access");
    // Never remembered: a grant is per client, not per resource
    assert.strictEqual((await OAuthGrant.query("uuid != ''")).results.length, 0);
  }

  @test
  async remoteConsentIsNeverSkipped() {
    registerTestOperations();
    // A remembered consent of the client for this application
    await this.fullTokens({ scope: "Task.*", remember: true });
    assert.strictEqual((await OAuthGrant.query("uuid != ''")).results.length, 1);
    const browser = await this.browser();
    await this.login(browser, "u1");
    const res = await this.authorize(browser, { redirect_uri: REDIRECT_URI, scope: "Task.*", resource: REMOTE });
    assert.strictEqual(res.headers.Location, `${ISSUER}/oauth/consent`);
    const none = await this.authorize(browser, {
      redirect_uri: REDIRECT_URI,
      scope: "Task.*",
      resource: REMOTE,
      prompt: "none"
    });
    assert.strictEqual(query(none.headers.Location).error, "consent_required");
    // The remembered grant is not carried into the remote token
    const req = await this.op(browser, "OAuth.Consent.Get");
    assert.deepStrictEqual(
      req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      ["Task.*"]
    );
    await assert.rejects(
      () => this.op(browser, "OAuth.Consent.Decide", { allow: true, operations: [], csrf: req.csrf }),
      /Select at least one operation/
    );
  }

  @test
  async localTokensCarryTheIssuer() {
    registerTestOperations();
    const res = await this.tokens({ scope: "Task.*" });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const [header, payload] = res.body.access_token.split(".").slice(0, 2).map(decode);
    assert.strictEqual(header.typ, "at+jwt");
    assert.strictEqual(payload.iss, ISSUER);
    // Still an access token of this application
    assert.ok(await useService("TokenService").verifyAccess(res.body.access_token));
  }

  @test
  async remoteResourceIsNeverTheDefault() {
    // A dynamically registered client gets the only local resource, not the remote one
    registerProtectedResource({ path: "/mcp" });
    const server = useService<any>("OAuthServer");
    assert.strictEqual(
      server.resolveResource({}, { id: "dcr_x", name: "x", redirect_uris: [] }, undefined),
      `${ISSUER}/mcp`
    );
    assert.strictEqual(server.resolveResource({}, { id: "dcr_x", name: "x", redirect_uris: [] }, REMOTE), REMOTE);
    // Unknown resources are still refused
    const b = await this.browser();
    const res = await this.authorize(b, { scope: "Task.*", resource: "https://evil.example.com" });
    assert.strictEqual(query(res.headers.Location).error, "invalid_target");
  }

  @test
  async metadataPublishesJwks() {
    const res = await this.get(await this.browser(), "/.well-known/oauth-authorization-server");
    assert.strictEqual(res.body.issuer, ISSUER);
    assert.strictEqual(res.body.jwks_uri, `${ISSUER}/jwks`);
  }

  @test
  async configurationIsChecked() {
    const server = useService<any>("OAuthServer");
    const params = server.getParameters();
    const crypto = useService<any>("CryptoService").getParameters();
    const saved = { issuer: params.issuer, resources: params.resources, jwt: crypto.jwt, url: crypto.url };
    try {
      for (const resources of [
        null,
        "https://api.example.com",
        [42],
        ["not a url"],
        ["ftp://api.example.com"],
        ["https://api.example.com/#x"],
        [""]
      ]) {
        params.resources = resources;
        assert.throws(() => server.checkRemoteResources(), /OAuthServer resources/, JSON.stringify(resources));
      }
      params.resources = [REMOTE];
      params.issuer = undefined;
      assert.throws(() => server.checkRemoteResources(), /issuer/);
      params.issuer = ISSUER;
      crypto.jwt = { ...saved.jwt, algorithm: "HS256" };
      assert.throws(() => server.checkRemoteResources(), /asymmetric/);
      for (const jwt of [undefined, {}]) {
        crypto.jwt = jwt;
        assert.throws(() => server.checkRemoteResources(), /asymmetric/);
      }
      crypto.jwt = saved.jwt;
      crypto.url = undefined;
      assert.throws(() => server.checkRemoteResources(), /JWKS/);
      crypto.url = saved.url;
      server.checkRemoteResources();
      // Nothing to check without remote resources
      params.resources = [];
      params.issuer = undefined;
      crypto.jwt = { ...saved.jwt, algorithm: "HS256" };
      server.checkRemoteResources();
    } finally {
      Object.assign(params, { issuer: saved.issuer, resources: saved.resources });
      Object.assign(crypto, { jwt: saved.jwt, url: saved.url });
    }
  }
}
