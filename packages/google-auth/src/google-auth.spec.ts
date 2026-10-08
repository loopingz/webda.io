import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { createHash } from "node:crypto";
import { HttpContext, Ident, useService, type WebContext } from "@webda/core";
import { AuthTest } from "@webda/auth/lib/test/authtest.js";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { OAuth2Client } from "google-auth-library";
import { vi } from "vitest";
import { GoogleAuthentication, GoogleParameters } from "./google-auth.service.js";

const WEB = "web-client.apps.googleusercontent.com";
const IOS = "ios-client.apps.googleusercontent.com";
const OK = "https://app.example.com/ok";
const KO = "https://app.example.com/ko";
const COOKIE = "webda_oauth_google";

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
  /** Nonce the mocked Google puts in the ID tokens of the code exchange */
  nonce: string;
  /** Pending login cookie of the browser */
  jar: Record<string, string> = {};
  /** GoogleAuth.Tokens events */
  events: any[] = [];

  async beforeEach() {
    await super.beforeEach();
    vi.restoreAllMocks();
    this.google = useService("google" as any);
    const params = this.google.getParameters();
    delete params.hostedDomain;
    delete params.allowedEmailDomains;
    delete params.auth_options;
    params.audiences = [IOS];
    const auth: any = useService("Authentication" as any);
    auth.getParameters().linking = "verified";
    this.jar = {};
    this.nonce = undefined;
    this.events = [];
    this.google.removeAllListeners("GoogleAuth.Tokens");
    this.google.on("GoogleAuth.Tokens", (evt: any) => {
      this.events.push(evt);
    });
    // Network calls are mocked: tokens are described by their value
    this.getToken = vi.spyOn(OAuth2Client.prototype, "getToken").mockImplementation((async (opts: any) => {
      if (opts.code === "bad") throw new Error(`invalid_grant: ${opts.code}`);
      if (opts.code === "noid") return { tokens: { access_token: "at" } } as any;
      return { tokens: { access_token: `at-${opts.code}`, id_token: `idt-${opts.code}`, refresh_token: "rt" } } as any;
    }) as any);
    this.verifyIdToken = vi.spyOn(OAuth2Client.prototype, "verifyIdToken").mockImplementation((async (opts: any) => {
      const [, sub, variant] = /^idt-([^.]+)(?:\.(\w+))?$/.exec(opts.idToken) ?? [];
      // Like the library: the message contains the token
      if (!sub) throw new Error(`Wrong number of segments in token: ${opts.idToken}`);
      const extra: any = this.nonce ? { nonce: this.nonce } : {};
      if (variant === "unverified") return ticket(payload(sub, { ...extra, email_verified: false }));
      if (variant === "stringverified") return ticket(payload(sub, { ...extra, email_verified: "true" }));
      if (variant === "corp") return ticket(payload(sub, { ...extra, email: `${sub}@corp.com`, hd: "corp.com" }));
      if (variant === "nosub") return ticket(payload(undefined));
      if (variant === "othernonce") return ticket(payload(sub, { nonce: "other" }));
      if (variant === "nononce") return ticket(payload(sub));
      return ticket(payload(sub, extra));
    }) as any);
    this.generateAuthUrl = vi.spyOn(OAuth2Client.prototype, "generateAuthUrl");
  }

  async afterEach() {
    vi.restoreAllMocks();
  }

  /**
   * Call a GET route like a browser (session + pending login cookie)
   * @param ctx - context holding the session
   * @param method - route
   * @param params - query parameters
   * @returns the redirect
   */
  async route(ctx: WebContext, method: "login" | "callback", params: any = {}): Promise<string> {
    const cookie = Object.entries(this.jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const path = method === "login" ? "/auth/google" : "/auth/google/callback";
    const call = await this.newWebContext<WebContext>(
      new HttpContext("test.webda.io", "GET", path, "http", 80, cookie ? { cookie } : {})
    );
    call.setSession(ctx.getSession());
    call.setParameters(params);
    await this.inContext(call, () => (this.google as any)[method](call));
    ctx.setSession(call.getSession());
    const set = (call.getResponseCookies() as any)?.[COOKIE];
    if (set?.value && set.options.maxAge > 0) this.jar[COOKIE] = set.value;
    else if (set) delete this.jar[COOKIE];
    return call.getResponseHeaders().Location as string;
  }

  /**
   * Start a login; the mocked Google will put its nonce in the ID token
   * @param ctx - context
   * @param redirect - redirect parameter
   * @returns the authorization url
   */
  async start(ctx: WebContext, redirect?: string): Promise<URL> {
    const url = new URL(await this.route(ctx, "login", redirect ? { redirect } : {}));
    this.nonce = url.searchParams.get("nonce");
    return url;
  }

  /**
   * Capture the logs of fn
   * @param fn - code
   * @returns every log line, as text
   */
  async logsOf(fn: () => Promise<unknown>): Promise<string> {
    const logger = new MemoryLogger(useWorkerOutput(), "TRACE");
    try {
      await fn();
    } finally {
      logger.close();
    }
    return JSON.stringify(logger.getLogs());
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
    const url = await this.start(ctx, "https://app.example.com/after");
    assert.strictEqual(`${url.origin}${url.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
    assert.strictEqual(url.searchParams.get("client_id"), WEB);
    assert.strictEqual(url.searchParams.get("response_type"), "code");
    assert.strictEqual(url.searchParams.get("scope"), "openid email profile");
    assert.strictEqual(url.searchParams.get("access_type"), "online");
    assert.ok(url.searchParams.get("redirect_uri").endsWith("/auth/google/callback"));
    assert.ok(url.searchParams.get("state").length >= 32);
    assert.strictEqual(url.searchParams.get("code_challenge_method"), "S256");
    assert.match(url.searchParams.get("code_challenge"), /^[A-Za-z0-9_-]{43}$/);
    assert.ok(url.searchParams.get("nonce").length >= 16);
    assert.strictEqual(url.searchParams.get("hd"), null);
    // auth_options cannot override the protected fields
    this.google.getParameters().auth_options = {
      prompt: "select_account",
      state: "forced",
      redirect_uri: "https://x",
      nonce: "forced",
      code_challenge: "forced"
    };
    this.google.getParameters().hostedDomain = "corp.com";
    const next = await this.start(await this.ctx());
    assert.strictEqual(next.searchParams.get("prompt"), "select_account");
    for (const key of ["state", "redirect_uri", "nonce", "code_challenge"]) {
      assert.notStrictEqual(next.searchParams.get(key), key === "redirect_uri" ? "https://x" : "forced", key);
    }
    assert.strictEqual(next.searchParams.get("hd"), "corp.com");
  }

  @test
  async callbackLogsInThroughAuthentication() {
    const ctx = await this.ctx();
    const url = await this.start(ctx, "https://app.example.com/after");
    const location = await this.route(ctx, "callback", {
      code: "u1",
      state: url.searchParams.get("state"),
      scope: "email profile openid"
    });
    assert.strictEqual(location, "https://app.example.com/after");
    assert.ok(ctx.getSession().isLogged());
    assert.strictEqual(ctx.getSession().provider, "google");
    // The code is exchanged with the redirect_uri and the PKCE verifier of the login
    assert.strictEqual(this.getToken.mock.calls.length, 1);
    const exchange = this.getToken.mock.calls[0][0];
    assert.strictEqual(exchange.code, "u1");
    assert.strictEqual(exchange.redirect_uri, url.searchParams.get("redirect_uri"));
    assert.strictEqual(
      createHash("sha256").update(exchange.codeVerifier).digest("base64url"),
      url.searchParams.get("code_challenge")
    );
    // The ID token is verified for the web client id
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[0][0], { idToken: "idt-u1", audience: WEB });
    const ident: any = await Ident.ref(Ident.key("u1", "google")).get();
    assert.strictEqual(ident.getUser().toString(), ctx.getSession().userId);
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.email, "u1@gmail.com");
    // The Google credentials are stored encrypted and published through GoogleAuth.Tokens
    const credentials = { access_token: "at-u1", id_token: "idt-u1", refresh_token: "rt" };
    assert.deepStrictEqual(await ident.tokens.get(), credentials);
    assert.strictEqual(this.events.length, 1);
    assert.deepStrictEqual(this.events[0].tokens, credentials);
    assert.strictEqual(this.events[0].context.getSession().userId, ctx.getSession().userId);
    const emailIdent = await Ident.ref(Ident.key("u1@gmail.com", "email")).get();
    assert.strictEqual(emailIdent.getUser().toString(), ctx.getSession().userId);
    const user: any = await (useService("Authentication" as any) as any)
      .getUserModel()
      .ref(ctx.getSession().userId)
      .get();
    assert.strictEqual(user.displayName, "User u1");
  }

  @test
  async callbackChecksTheNonce() {
    for (const code of ["u20.othernonce", "u21.nononce"]) {
      const ctx = await this.ctx();
      const url = await this.start(ctx);
      assert.strictEqual(
        await this.route(ctx, "callback", { code, state: url.searchParams.get("state") }),
        `${KO}?reason=TOKEN_INVALID`,
        code
      );
      assert.ok(!ctx.getSession().isLogged());
    }
    assert.strictEqual(this.events.length, 0);
  }

  @test
  async callbackFailures() {
    const ctx = await this.ctx();
    const start = async () => (await this.start(ctx)).searchParams.get("state");
    const logs = await this.logsOf(async () => {
      assert.strictEqual(
        await this.route(ctx, "callback", { code: "bad", state: await start() }),
        `${KO}?reason=TOKEN_INVALID`
      );
    });
    assert.ok(!logs.includes("invalid_grant"), logs);
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "noid", state: await start() }),
      `${KO}?reason=TOKEN_INVALID`
    );
    await start();
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "u2", state: "forged" }),
      `${KO}?reason=STATE_MISMATCH`
    );
    assert.ok(!ctx.getSession().isLogged());
    assert.strictEqual(this.events.length, 0);
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
    assert.deepStrictEqual(
      this.events.map(e => e.tokens),
      [{ id_token: "idt-u3" }]
    );
    this.google.getParameters().audiences = [];
    await this.op("Auth.Google.Token", { token: "idt-u3" });
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[1][0], { idToken: "idt-u3", audience: WEB });
  }

  @test
  async tokenOperationAcceptsTheV3TokensBody() {
    const credentials = {
      id_token: "idt-u13",
      access_token: "at-13",
      refresh_token: "rt-13",
      expiry_date: 1700000000000,
      token_type: "Bearer",
      scope: null
    };
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Google.Token", { tokens: credentials }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.deepStrictEqual(this.verifyIdToken.mock.calls[0][0], { idToken: "idt-u13", audience: [WEB, IOS] });
    const ident: any = await Ident.ref(Ident.key("u13", "google")).get();
    assert.deepStrictEqual(await ident.tokens.get(), credentials);
    assert.deepStrictEqual(
      this.events.map(e => e.tokens),
      [credentials]
    );
    // The same checks as a bare token
    this.google.getParameters().hostedDomain = "corp.com";
    await assert.rejects(() => this.op("Auth.Google.Token", { tokens: { id_token: "idt-u14" } }), {
      code: "EMAIL_DOMAIN_NOT_ALLOWED"
    });
    for (const tokens of [{ access_token: "only-access" }, { id_token: "garbage" }, { id_token: 12 }]) {
      await assert.rejects(
        () => this.op("Auth.Google.Token", { tokens }),
        { code: "TOKEN_INVALID" },
        JSON.stringify(tokens)
      );
    }
    // Two different ID tokens are ambiguous
    await assert.rejects(() => this.op("Auth.Google.Token", { token: "idt-u8.corp", tokens: { id_token: "idt-u9" } }), {
      code: "BAD_REQUEST"
    });
  }

  @test
  async verificationReusesOneClient() {
    const ctx = await this.ctx();
    await this.op("Auth.Google.Token", { token: "idt-u15" });
    await this.op("Auth.Google.Token", { tokens: { id_token: "idt-u16" } });
    const url = await this.start(ctx);
    await this.route(ctx, "callback", { code: "u17", state: url.searchParams.get("state") });
    assert.strictEqual(this.verifyIdToken.mock.contexts.length, 3);
    const verifier = (this.google as any).verifier;
    assert.ok(verifier instanceof OAuth2Client);
    for (const client of this.verifyIdToken.mock.contexts) {
      assert.strictEqual(client, verifier);
    }
  }

  @test
  async invalidTokens() {
    for (const token of ["garbage-secret-token-text", "idt-u4.nosub"]) {
      const ctx = await this.ctx();
      const logs = await this.logsOf(() =>
        assert.rejects(() => this.op("Auth.Google.Token", { token }, ctx), { code: "TOKEN_INVALID" }, token)
      );
      assert.ok(!logs.includes(token), logs);
      assert.ok(!logs.includes("Wrong number of segments"), logs);
      assert.ok(!ctx.getSession().isLogged());
    }
    assert.strictEqual(this.events.length, 0);
  }

  @test
  async unverifiedEmail() {
    const ctx = await this.ctx();
    await this.op("Auth.Google.Token", { token: "idt-u5.unverified" }, ctx);
    const ident: any = await Ident.ref(Ident.key("u5", "google")).get();
    assert.ok(!ident.isVerified());
    assert.ok(!(await Ident.ref(Ident.key("u5@gmail.com", "email")).exists()));
    await this.op("Auth.Google.Token", { token: "idt-u6.stringverified" });
    assert.ok(!(await Ident.ref(Ident.key("u6@gmail.com", "email")).exists()));
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
    const ctx = await this.ctx();
    const url = await this.start(ctx);
    assert.strictEqual(
      await this.route(ctx, "callback", { code: "u9", state: url.searchParams.get("state") }),
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
    const url = await this.start(ctx);
    assert.strictEqual(await this.route(ctx, "callback", { code: "u12", state: url.searchParams.get("state") }), OK);
  }
}
