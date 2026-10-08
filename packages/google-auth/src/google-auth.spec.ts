import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { Ident, useService, type WebContext } from "@webda/core";
import { AuthTest } from "@webda/auth/lib/test/authtest.js";
import { OAuth2Client } from "google-auth-library";
import { vi } from "vitest";
import { GoogleAuthentication, GoogleParameters } from "./google-auth.service.js";

const WEB = "web-client.apps.googleusercontent.com";
const IOS = "ios-client.apps.googleusercontent.com";
const OK = "https://app.example.com/ok";
const KO = "https://app.example.com/ko";

/**
 * @param payload - ID token payload
 * @returns a LoginTicket-like object
 */
const ticket = (payload: any) => ({ getPayload: () => payload }) as any;

const payload = (sub: string, extra: any = {}) => ({
  iss: "https://accounts.google.com",
  aud: WEB,
  sub,
  email: `${sub}@gmail.com`,
  email_verified: true,
  name: `User ${sub}`,
  picture: `https://lh3.googleusercontent.com/${sub}`,
  locale: "en",
  ...extra
});

@suite
class GoogleAuthTest extends AuthTest {
  google: GoogleAuthentication;
  getToken: any;
  verifyIdToken: any;
  generateAuthUrl: any;

  async beforeEach() {
    await super.beforeEach();
    vi.restoreAllMocks();
    this.google = useService("google" as any);
    const params = this.google.getParameters();
    delete params.hostedDomain;
    delete params.allowedEmailDomains;
    params.audiences = [IOS];
    const auth: any = useService("Authentication" as any);
    auth.getParameters().linking = "verified";
    // Network calls are mocked: tokens are described by their value
    this.getToken = vi.spyOn(OAuth2Client.prototype, "getToken").mockImplementation((async (opts: any) => {
      if (opts.code === "bad") throw new Error("invalid_grant");
      if (opts.code === "noid") return { tokens: { access_token: "at" } } as any;
      return { tokens: { access_token: `at-${opts.code}`, id_token: `idt-${opts.code}`, refresh_token: "rt" } } as any;
    }) as any);
    this.verifyIdToken = vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockImplementation((async (opts: any) => {
      const [, sub, variant] = /^idt-([^.]+)(?:\.(\w+))?$/.exec(opts.idToken) ?? [];
      if (!sub) throw new Error("Wrong number of segments in token");
      if (variant === "unverified") return ticket(payload(sub, { email_verified: false }));
      if (variant === "stringverified") return ticket(payload(sub, { email_verified: "true" }));
      if (variant === "corp") return ticket(payload(sub, { email: `${sub}@corp.com`, hd: "corp.com" }));
      if (variant === "nosub") return ticket(payload(undefined));
      return ticket(payload(sub));
    }) as any);
    this.generateAuthUrl = vi.spyOn(OAuth2Client.prototype, "generateAuthUrl");
  }

  async afterEach() {
    vi.restoreAllMocks();
  }

  /**
   * Call a GET route with the session of ctx
   * @param ctx - context holding the session
   * @param method - route
   * @param params - query parameters
   * @returns the redirect
   */
  async route(ctx: WebContext, method: "login" | "callback", params: any = {}): Promise<string> {
    const call = await this.newContext<WebContext>();
    call.setSession(ctx.getSession());
    call.setParameters(params);
    await this.inContext(call, () => (this.google as any)[method](call));
    ctx.setSession(call.getSession());
    return call.getResponseHeaders().Location as string;
  }

  @test
  defaults() {
    const params = new GoogleParameters().load({ client_id: "a", client_secret: "b" });
    assert.deepStrictEqual(params.scope, ["openid", "email", "profile"]);
    assert.strictEqual(params.access_type, "online");
    assert.deepStrictEqual(params.audiences, []);
    assert.strictEqual(this.google.providerName, "google");
    assert.deepStrictEqual(this.google.getPublicInfo(), { name: "google", type: "oauth", startUrl: "/auth/google" });
  }

  @test
  async authorizationUrl() {
    const ctx = await this.ctx();
    const location = await this.route(ctx, "login", { redirect: "https://app.example.com/after" });
    const url = new URL(location);
    assert.strictEqual(`${url.origin}${url.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.strictEqual(url.searchParams.get("client_id"), WEB);
    assert.strictEqual(url.searchParams.get("response_type"), "code");
    assert.strictEqual(url.searchParams.get("scope"), "openid email profile");
    assert.strictEqual(url.searchParams.get("access_type"), "online");
    assert.ok(url.searchParams.get("redirect_uri").endsWith("/auth/google/callback"));
    assert.ok(url.searchParams.get("state").length >= 32);
    assert.strictEqual(url.searchParams.get("hd"), null);
    // auth_options cannot override the protected fields
    this.google.getParameters().auth_options = { prompt: "select_account", state: "forced", redirect_uri: "https://x" };
    this.google.getParameters().hostedDomain = "corp.com";
    const next = new URL(await this.route(await this.ctx(), "login"));
    assert.strictEqual(next.searchParams.get("prompt"), "select_account");
    assert.notStrictEqual(next.searchParams.get("state"), "forced");
    assert.notStrictEqual(next.searchParams.get("redirect_uri"), "https://x");
    assert.strictEqual(next.searchParams.get("hd"), "corp.com");
    delete this.google.getParameters().auth_options;
  }

  @test
  async callbackLogsInThroughAuthentication() {
    const ctx = await this.ctx();
    const state = new URL(
      await this.route(ctx, "login", { redirect: "https://app.example.com/after" })
    ).searchParams.get("state");
    const location = await this.route(ctx, "callback", { code: "u1", state, scope: "email profile openid" });
    assert.strictEqual(location, "https://app.example.com/after");
    assert.ok(ctx.getSession().isLogged());
    assert.strictEqual(ctx.getSession().provider, "google");
    // The code is exchanged with the redirect_uri of the login, the ID token verified for the web client id
    assert.strictEqual(this.getToken.mock.calls.length, 1);
    assert.strictEqual(this.getToken.mock.calls[0][0].code, "u1");
    assert.ok(this.getToken.mock.calls[0][0].redirect_uri.endsWith("/auth/google/callback"));
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[0][0], { idToken: "idt-u1", audience: WEB });
    const ident: any = await Ident.ref(Ident.key("u1", "google")).get();
    assert.strictEqual(ident.getUser().toString(), ctx.getSession().userId);
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.email, "u1@gmail.com");
    // Verified Google email: the email ident is claimed
    const emailIdent = await Ident.ref(Ident.key("u1@gmail.com", "email")).get();
    assert.strictEqual(emailIdent.getUser().toString(), ctx.getSession().userId);
    const user: any = await (useService("Authentication" as any) as any)
      .getUserModel()
      .ref(ctx.getSession().userId)
      .get();
    assert.strictEqual(user.displayName, "User u1");
  }

  @test
  async callbackFailures() {
    const ctx = await this.ctx();
    const start = async () => new URL(await this.route(ctx, "login")).searchParams.get("state");
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "bad", state: await start() }),
      `${KO}?reason=TOKEN_INVALID`
    );
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "noid", state: await start() }),
      `${KO}?reason=TOKEN_INVALID`
    );
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "u2", state: "forged" }),
      `${KO}?reason=STATE_MISMATCH`
    );
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async tokenOperation() {
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Google.Token", { token: "idt-u3" }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.ok(res.accessToken);
    assert.ok(ctx.getSession().isLogged());
    // The web and the additional (mobile) client ids are accepted audiences
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[0][0], { idToken: "idt-u3", audience: [WEB, IOS] });
    assert.strictEqual(this.getToken.mock.calls.length, 0);
    this.google.getParameters().audiences = [];
    await this.op("Auth.Google.Token", { token: "idt-u3" });
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[1][0], { idToken: "idt-u3", audience: WEB });
  }

  @test
  async invalidTokens() {
    for (const token of ["garbage", "idt-u4.nosub"]) {
      const ctx = await this.ctx();
      await assert.rejects(() => this.op("Auth.Google.Token", { token }, ctx), { code: "TOKEN_INVALID" }, token);
      assert.ok(!ctx.getSession().isLogged());
    }
  }

  @test
  async unverifiedEmail() {
    const ctx = await this.ctx();
    await this.op("Auth.Google.Token", { token: "idt-u5.unverified" }, ctx);
    const ident: any = await Ident.ref(Ident.key("u5", "google")).get();
    assert.ok(!ident.isVerified());
    // An unverified email never claims the email ident
    assert.ok(!(await Ident.ref(Ident.key("u5@gmail.com", "email")).exists()));
    // Only the boolean true is a verification
    await this.op("Auth.Google.Token", { token: "idt-u6.stringverified" });
    assert.ok(!(await Ident.ref(Ident.key("u6@gmail.com", "email")).exists()));
    // An account owning the verified email is not linked to an unverified Google identity
    await this.op("Auth.Google.Token", { token: "idt-owner" });
    assert.ok(await Ident.ref(Ident.key("owner@gmail.com", "email")).exists());
    this.verifyIdToken.mockImplementationOnce(async () =>
      ticket(payload("other", { email: "owner@gmail.com", email_verified: false }))
    );
    await assert.rejects(() => this.op("Auth.Google.Token", { token: "idt-other" }), { code: "ACCOUNT_EXISTS" });
    assert.ok(!(await Ident.ref(Ident.key("other", "google")).exists()));
  }

  @test
  async hostedDomain() {
    this.google.getParameters().hostedDomain = "Corp.com";
    await assert.rejects(() => this.op("Auth.Google.Token", { token: "idt-u7" }), {
      code: "EMAIL_DOMAIN_NOT_ALLOWED"
    });
    assert.ok(!(await Ident.ref(Ident.key("u7", "google")).exists()));
    const res: any = await this.op("Auth.Google.Token", { token: "idt-u8.corp" });
    assert.strictEqual(res.status, "ok");
    const ident: any = await Ident.ref(Ident.key("u8", "google")).get();
    assert.strictEqual(ident.email, "u8@corp.com");
    // Through the callback too
    const ctx = await this.ctx();
    const state = new URL(await this.route(ctx, "login")).searchParams.get("state");
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "u9", state }),
      `${KO}?reason=EMAIL_DOMAIN_NOT_ALLOWED`
    );
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async emailPolicyParameters() {
    this.google.getParameters().allowedEmailDomains = ["corp.com"];
    await assert.rejects(() => this.op("Auth.Google.Token", { token: "idt-u10" }), {
      code: "EMAIL_DOMAIN_NOT_ALLOWED"
    });
    assert.strictEqual((await this.op("Auth.Google.Token", { token: "idt-u11.corp" })).status, "ok");
  }

  @test
  async successDefault() {
    const ctx = await this.ctx();
    const state = new URL(await this.route(ctx, "login")).searchParams.get("state");
    assert.strictEqual(await this.route(ctx, "callback", { code: "u12", state }), OK);
  }
}
