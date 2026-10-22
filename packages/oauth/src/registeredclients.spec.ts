import { suite, test } from "@webda/test";
import * as assert from "assert";
import { RefreshToken, useService } from "@webda/core";
import { OAuthTest, registerTestOperations, unregisterTestOperations } from "./test/oauthtest.js";
import { OAuthGrant, OAuthRegisteredClient } from "./models.model.js";
import { ClientRegistry } from "./clients.js";

const DAY = 86400_000;
const CLIENT_ID = "dcr_test";
const REDIRECT = "http://127.0.0.1:1234/callback";

@suite
class RegisteredClientsTest extends OAuthTest {
  /** @override */
  async beforeEach() {
    await super.beforeEach();
    registerTestOperations();
    for await (const c of OAuthRegisteredClient.iterate("uuid != ''", [])) await c.ref().delete();
    for await (const t of RefreshToken.iterate("hash != ''", [])) await t.ref().delete();
    for await (const g of OAuthGrant.iterate("uuid != ''", [])) await g.ref().delete();
  }

  /** @override */
  async afterEach() {
    unregisterTestOperations();
    await super.afterEach();
  }

  /**
   * @param overrides - fields to override
   * @returns the stored registered client
   */
  async register(overrides: Record<string, unknown> = {}): Promise<OAuthRegisteredClient> {
    const now = Date.now();
    return OAuthRegisteredClient.create({
      uuid: CLIENT_ID,
      name: "Registered",
      clientUri: "https://client.example.com",
      logoUri: "https://client.example.com/logo.png",
      redirect_uris: ["http://127.0.0.1/callback"],
      scope: "Task.*",
      createdAt: now,
      expiresAt: now + DAY,
      ip: "127.0.0.1",
      ...overrides
    } as any);
  }

  /**
   * Run the code flow for the registered client
   * @returns the token response
   */
  async dcrTokens(): Promise<any> {
    const browser = await this.browser();
    await this.login(browser, "u1");
    await this.authorize(browser, {
      client_id: CLIENT_ID,
      scope: "Task.* offline_access",
      redirect_uri: REDIRECT,
      prompt: "consent"
    });
    const req = await this.op(browser, "OAuth.Consent.Get");
    const { redirect } = await this.op(browser, "OAuth.Consent.Decide", {
      allow: true,
      operations: req.operations.flatMap((g: any) => g.ids.map((i: any) => i.id)),
      csrf: req.csrf,
      remember: true
    });
    const res = await this.tokenRequest({
      grant_type: "authorization_code",
      code: new URL(redirect, "http://x").searchParams.get("code")!,
      code_verifier: browser.verifier,
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    return res.body;
  }

  @test
  async lookupRegisteredClient() {
    await this.register();
    const registry = new ClientRegistry(useService<any>("OAuthServer").getParameters());
    assert.deepStrictEqual(await registry.get(CLIENT_ID), {
      id: CLIENT_ID,
      name: "Registered",
      redirect_uris: ["http://127.0.0.1/callback"],
      logo: "https://client.example.com/logo.png",
      client_uri: "https://client.example.com",
      defaultScope: "Task.*",
      deviceFlow: false,
      registered: true
    });
    assert.strictEqual(await registry.get("dcr_missing"), undefined);
  }

  @test
  async expiredRegisteredClientUnknown() {
    await this.register({ expiresAt: Date.now() - 1 });
    const registry = new ClientRegistry(useService<any>("OAuthServer").getParameters());
    assert.strictEqual(await registry.get(CLIENT_ID), undefined);
  }

  @test
  async firstTokenExtendsExpiry() {
    await this.register();
    const before = Date.now();
    await this.dcrTokens();
    const stored = await OAuthRegisteredClient.ref(CLIENT_ID).get();
    assert.ok(stored.lastUsedAt! >= before);
    const idle = 7776000_000;
    assert.ok(stored.expiresAt >= before + idle && stored.expiresAt <= Date.now() + idle);
  }

  @test
  async refreshExtendsExpiry() {
    await this.register();
    const tokens = await this.dcrTokens();
    const idle = 7776000_000;
    await OAuthRegisteredClient.ref(CLIENT_ID).patch({ expiresAt: Date.now() + DAY } as any);
    const before = Date.now();
    const res = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID
    });
    assert.strictEqual(res.status, 200, JSON.stringify(res.body));
    const stored = await OAuthRegisteredClient.ref(CLIENT_ID).get();
    assert.ok(stored.expiresAt >= before + idle && stored.expiresAt <= Date.now() + idle);
  }

  @test
  async sweepRevokesExpiredClient() {
    await this.register();
    const tokens = await this.dcrTokens();
    assert.ok(await OAuthGrant.ref(`u1:${CLIENT_ID}`).exists());
    await OAuthRegisteredClient.ref(CLIENT_ID).patch({ expiresAt: Date.now() - 1 } as any);
    await useService<any>("OAuthServer").sweep();
    assert.strictEqual(await OAuthRegisteredClient.ref(CLIENT_ID).exists(), false);
    assert.strictEqual(await OAuthGrant.ref(`u1:${CLIENT_ID}`).exists(), false);
    assert.strictEqual(await useService("TokenService").verifyAccess(tokens.access_token), undefined);
    const res = await this.tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: CLIENT_ID
    });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, "invalid_client");
  }
}
