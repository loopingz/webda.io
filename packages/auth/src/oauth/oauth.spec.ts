import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, useRouter, useService, type WebContext } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "../test/authtest.js";
import { FakeOAuthProvider } from "../test/fakeoauth.service.js";
import { addStubProviders, stubProvidersConfig } from "../test/stubprovider.js";
import type { Authentication } from "../authentication.service.js";
import { OAuthProvider, OAuthProviderParameters } from "./oauth.service.js";

const OK = "https://app.example.com/ok";
const KO = "https://app.example.com/ko";

/**
 * @param location - a redirect
 * @returns its query parameters
 */
const query = (location: string) => Object.fromEntries(new URL(location).searchParams.entries());

@suite
class OAuthProviderTest extends AuthTest {
  auth: Authentication;
  fake: FakeOAuthProvider;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        ...stubProvidersConfig("email"),
        fakeAuth: {
          type: "WebdaTest/FakeOAuth",
          client_id: "cid",
          client_secret: "secret",
          scope: ["openid", "email"],
          authorized_uris: ["https://app.example.com/after", "https://other.example.com/"],
          redirects: { success: OK, failure: KO }
        }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("WebdaTest/FakeOAuth", FakeOAuthProvider as any);
    addStubProviders(app, "email");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.auth.getParameters().linking = "verified";
    this.auth.getParameters().registration = true;
    delete (this.auth as any).mfaMethods;
    this.fake = useService("fakeAuth" as any);
    this.fake.calls = [];
    const params = this.fake.getParameters();
    delete params.allowedEmailDomains;
    delete params.trustEmailVerification;
    delete params.redirect_uri;
    params.redirects = { success: OK, failure: KO };
    params.authorized_uris = ["https://app.example.com/after", "https://other.example.com/"];
  }

  /**
   * Call a GET route of the provider with the session of ctx
   * @param ctx - context holding the session (updated afterwards)
   * @param method - route method
   * @param params - query parameters
   * @returns the Location of the redirect
   */
  async route(ctx: WebContext, method: "login" | "callback", params: any = {}): Promise<string> {
    const call = await this.newContext<WebContext>();
    call.setSession(ctx.getSession());
    call.setParameters(params);
    await this.inContext(call, () => (this.fake as any)[method](call));
    ctx.setSession(call.getSession());
    assert.strictEqual(call.statusCode, 302, `${method} must redirect`);
    return call.getResponseHeaders().Location as string;
  }

  /**
   * Start a login
   * @param ctx - context
   * @param redirect - optional redirect parameter
   * @returns the state sent to the provider
   */
  async start(ctx: WebContext, redirect?: string): Promise<string> {
    const location = await this.route(ctx, "login", redirect ? { redirect } : {});
    assert.ok(location.startsWith("https://idp.example/authorize?"), location);
    return query(location).state;
  }

  @test
  async loginRedirectsWithState() {
    const ctx = await this.ctx();
    const location = await this.route(ctx, "login", { redirect: "https://app.example.com/after/page?x=1" });
    const q = query(location);
    assert.ok(q.state && q.state.length >= 32, "random state");
    assert.ok(q.redirect_uri.endsWith("/auth/fake/callback"), q.redirect_uri);
    assert.strictEqual(q.scope, "openid email");
    assert.strictEqual(q.client_id, "cid");
    // A second login gets another state
    const other = await this.start(await this.ctx());
    assert.notStrictEqual(other, q.state);
    // The session is not logged in by starting a login
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async loginRefusesRedirectOutsideAllowList() {
    for (const redirect of [
      "https://evil.example.com/after",
      "https://app.example.com/afterwards",
      "https://app.example.com/other",
      "https://app.example.com.evil.com/after",
      "https://app.example.com@evil.com/after",
      "http://app.example.com/after",
      "https://app.example.com:8443/after",
      "https://app.example.com/after/../admin",
      "https://app.example.com/after/%2e%2e/admin",
      "//evil.com/after",
      "/after",
      "javascript:alert(1)",
      "not a url"
    ]) {
      const ctx = await this.ctx();
      const location = await this.route(ctx, "login", { redirect });
      assert.strictEqual(location, `${KO}?reason=REDIRECT_NOT_ALLOWED`, redirect);
      // Nothing is pending: a callback cannot succeed
      const back = await this.route(ctx, "callback", { code: "1,a@x.com,1", state: "anything" });
      assert.strictEqual(back, `${KO}?reason=STATE_MISMATCH`);
    }
    assert.strictEqual(this.fake.calls.length, 0);
  }

  @test
  async loginWithoutAllowList() {
    this.fake.getParameters().authorized_uris = [];
    const ctx = await this.ctx();
    assert.strictEqual(
      await this.route(ctx, "login", { redirect: "https://app.example.com/after" }),
      `${KO}?reason=REDIRECT_NOT_ALLOWED`
    );
    // Without redirect parameter the flow starts
    assert.ok(await this.start(ctx));
  }

  @test
  async callbackStateMismatch() {
    const ctx = await this.ctx();
    // No pending login
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "1,a@x.com,1", state: "x" }),
      `${KO}?reason=STATE_MISMATCH`
    );
    // Wrong state
    await this.start(ctx);
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "1,a@x.com,1", state: "wrong" }),
      `${KO}?reason=STATE_MISMATCH`
    );
    // Missing state
    const state = await this.start(ctx);
    assert.strictEqual(await this.route(ctx, "callback", { code: "1,a@x.com,1" }), `${KO}?reason=STATE_MISMATCH`);
    // The state was consumed by the failed attempt
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "1,a@x.com,1", state }),
      `${KO}?reason=STATE_MISMATCH`
    );
    // State of another session
    const other = await this.ctx();
    const otherState = await this.start(other);
    const mine = await this.ctx();
    await this.start(mine);
    assert.strictEqual(
      await this.route(mine, "callback", { code: "1,a@x.com,1", state: otherState }),
      `${KO}?reason=STATE_MISMATCH`
    );
    assert.strictEqual(this.fake.calls.length, 0, "the code is never exchanged");
    for (const c of [ctx, mine]) {
      assert.ok(!c.getSession().isLogged());
      assert.ok(!c.getSession().userId);
    }
  }

  @test
  async callbackExpiredState() {
    const ctx = await this.ctx();
    const now = Date.now();
    const state = await this.start(ctx);
    const realNow = Date.now;
    try {
      Date.now = () => now + 10 * 60 * 1000 + 1000;
      assert.strictEqual(
        await this.route(ctx, "callback", { code: "1,a@x.com,1", state }),
        `${KO}?reason=STATE_MISMATCH`
      );
    } finally {
      Date.now = realNow;
    }
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async callbackLogsInAndRedirects() {
    const ctx = await this.ctx();
    const state = await this.start(ctx, "https://app.example.com/after/page?x=1");
    const location = await this.route(ctx, "callback", { code: "sub1,Sub1@X.com,1", state, scope: "openid" });
    assert.strictEqual(location, "https://app.example.com/after/page?x=1");
    assert.ok(ctx.getSession().isLogged());
    assert.strictEqual(ctx.getSession().provider, "fake");
    assert.deepStrictEqual(ctx.getSession().amr, ["oauth"]);
    const ident = await Ident.ref(Ident.key("sub1", "fake")).get();
    assert.strictEqual(ident.getUser().toString(), ctx.getSession().userId);
    assert.strictEqual(ident.getUUID(), "sub1:fake");
    // The callback received the redirect_uri sent to the provider
    assert.strictEqual(this.fake.calls.length, 1);
    assert.ok(this.fake.calls[0].redirectUri.endsWith("/auth/fake/callback"));
    // Replaying the same callback fails: the state is single-use
    const replay = await this.ctx();
    replay.setSession(ctx.getSession());
    assert.strictEqual(
      await this.route(replay, "callback", { code: "sub1,Sub1@X.com,1", state }),
      `${KO}?reason=STATE_MISMATCH`
    );
  }

  @test
  async callbackDefaultsToSuccessAndConfiguredRedirectUri() {
    this.fake.getParameters().redirect_uri = "https://api.example.com/auth/fake/callback";
    const ctx = await this.ctx();
    const location = await this.route(ctx, "login");
    assert.strictEqual(query(location).redirect_uri, "https://api.example.com/auth/fake/callback");
    assert.strictEqual(await this.route(ctx, "callback", { code: "sub2,,0", state: query(location).state }), OK);
    assert.strictEqual(this.fake.calls[0].redirectUri, "https://api.example.com/auth/fake/callback");
    assert.ok(ctx.getSession().isLogged());
  }

  @test
  async callbackRefusedByAuthentication() {
    // Email domain policy of the provider
    this.fake.getParameters().allowedEmailDomains = ["corp.com"];
    let ctx = await this.ctx();
    let state = await this.start(ctx);
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "sub3,a@other.com,1", state }),
      `${KO}?reason=EMAIL_DOMAIN_NOT_ALLOWED`
    );
    assert.ok(!ctx.getSession().isLogged());
    assert.ok(!(await Ident.ref(Ident.key("sub3", "fake")).exists()));
    delete this.fake.getParameters().allowedEmailDomains;

    // An account owns the verified email and the provider does not assert verification
    const owner = await this.auth.getUserModel().create({ email: "owner@x.com" } as any);
    const emailIdent = new Ident({
      ...Ident.key("owner@x.com", "email"),
      email: "owner@x.com",
      verifiedAt: new Date()
    } as any);
    emailIdent.setUser(owner.getUUID());
    await Ident.getRepository().create(emailIdent);
    ctx = await this.ctx();
    state = await this.start(ctx, "https://app.example.com/after");
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "sub4,owner@x.com,0", state }),
      `${KO}?reason=ACCOUNT_EXISTS`
    );
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async callbackProviderFailures() {
    const ctx = await this.ctx();
    // The provider answered with an error instead of a code
    let state = await this.start(ctx);
    assert.strictEqual(
      await this.route(ctx, "callback", { error: "access_denied", state }),
      `${KO}?reason=PROVIDER_ERROR`
    );
    // The exchange refuses the code
    state = await this.start(ctx);
    assert.strictEqual(await this.route(ctx, "callback", { code: "bad", state }), `${KO}?reason=TOKEN_INVALID`);
    // Unexpected failure: generic reason, no internal message
    state = await this.start(ctx);
    const location = await this.route(ctx, "callback", { code: "boom", state });
    assert.strictEqual(location, `${KO}?reason=OAUTH_ERROR`);
    // No subject
    state = await this.start(ctx);
    assert.strictEqual(await this.route(ctx, "callback", { code: ",a@x.com,1", state }), `${KO}?reason=TOKEN_INVALID`);
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async callbackCannotImpersonateAnotherProvider() {
    const ctx = await this.ctx();
    const state = await this.start(ctx);
    // The subclass claims the "email" provider: the base class forces its own name
    assert.strictEqual(await this.route(ctx, "callback", { code: "uid9,victim@x.com,0,email", state }), OK);
    assert.ok(await Ident.ref(Ident.key("uid9", "fake")).exists());
    assert.ok(!(await Ident.ref(Ident.key("uid9", "email")).exists()));
    assert.strictEqual(ctx.getSession().provider, "fake");
  }

  @test
  async callbackMfaRequired() {
    (this.auth as any).mfaMethods = () => ["totp"];
    const ctx = await this.ctx();
    let state = await this.start(ctx, "https://app.example.com/after?x=1");
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "sub5,,0", state }),
      "https://app.example.com/after?x=1&mfa=required"
    );
    assert.ok(ctx.getSession().isPending());
    assert.ok(!ctx.getSession().isLogged());
    // Default success target
    const other = await this.ctx();
    state = await this.start(other);
    assert.strictEqual(await this.route(other, "callback", { code: "sub6,,0", state }), `${OK}?mfa=required`);
  }

  @test
  async tokenOperation() {
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Fake.Token", { token: "sub7,t@x.com,1" }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.ok(res.accessToken);
    assert.ok(res.refreshToken);
    assert.ok(ctx.getSession().isLogged());
    assert.ok(await Ident.ref(Ident.key("sub7", "fake")).exists());
    assert.deepStrictEqual(this.fake.calls, [{ method: "token", value: "sub7,t@x.com,1" }]);
    (this.auth as any).mfaMethods = () => ["totp"];
    assert.deepStrictEqual(await this.op("Auth.Fake.Token", { token: "sub7,t@x.com,1" }), {
      status: "mfa_required",
      methods: ["totp"]
    });
  }

  @test
  async tokenOperationFailures() {
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "bad" }), { code: "TOKEN_INVALID" });
    // Unexpected verification failure and missing subject fail closed
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "boom" }), { code: "TOKEN_INVALID" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: ",a@x.com,1" }), { code: "TOKEN_INVALID" });
    // Missing or malformed token is refused by the input schema
    await assert.rejects(() => this.op("Auth.Fake.Token", {}), { code: "BAD_REQUEST" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: 12 }), { code: "BAD_REQUEST" });
    this.fake.getParameters().allowedEmailDomains = ["corp.com"];
    const ctx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "sub8,a@other.com,1" }, ctx), {
      code: "EMAIL_DOMAIN_NOT_ALLOWED"
    });
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async publicInfoAndRoutes() {
    assert.deepStrictEqual(this.fake.getPublicInfo(), { name: "fake", type: "oauth", startUrl: "/auth/fake" });
    const providers: any[] = await this.op("Auth.Providers");
    assert.deepStrictEqual(
      providers.find(p => p.name === "fake"),
      { name: "fake", type: "oauth", startUrl: "/auth/fake" }
    );
    const ctx = await this.ctx();
    const router = useRouter();
    assert.ok(router.getRouteFromUrl(ctx, "GET", "/auth/fake"));
    assert.ok(router.getRouteFromUrl(ctx, "GET", "/auth/fake?redirect=https%3A%2F%2Fapp.example.com%2Fafter"));
    assert.ok(router.getRouteFromUrl(ctx, "GET", "/auth/fake/callback?code=a&state=b&scope=email&authuser=0"));
    assert.ok(router.getRouteFromUrl(ctx, "GET", "/auth/fake/callback?error=access_denied"));
  }

  @test
  async initValidatesParameters() {
    const make = (params: any) => {
      const service = new FakeOAuthProvider("check", new OAuthProviderParameters().load(params) as any);
      return service.init();
    };
    const base = { client_id: "cid", client_secret: "secret", redirects: { failure: KO } };
    await assert.rejects(() => make({ ...base, client_id: undefined }), /client_id/);
    await assert.rejects(() => make({ ...base, client_secret: "" }), /client_secret/);
    await assert.rejects(() => make({ ...base, redirects: {} }), /redirects\.failure/);
    await assert.rejects(() => make({ ...base, authorized_uris: ["/relative"] }), /authorized_uris/);
    await make(base);
    assert.ok(OAuthProvider);
  }
}
