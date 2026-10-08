import { suite, test } from "@webda/test";
import * as assert from "assert";
import { createHash } from "node:crypto";
import { HttpContext, Ident, useRouter, useService, type WebContext } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { MemoryLogger, useWorkerOutput } from "@webda/workout";
import { AuthTest } from "../test/authtest.js";
import { FakeOAuthProvider } from "../test/fakeoauth.service.js";
import { addStubProviders, stubProvidersConfig } from "../test/stubprovider.js";
import type { Authentication } from "../authentication.service.js";
import { OAuthProvider, OAuthProviderParameters, safeErrorReason } from "./oauth.service.js";

const OK = "https://app.example.com/ok";
const KO = "https://app.example.com/ko";
const COOKIE = "webda_oauth_fake";

/**
 * @param location - a redirect
 * @returns its query parameters
 */
const query = (location: string) => Object.fromEntries(new URL(location).searchParams.entries());

/** A browser: a session (cookie session) and the other cookies it holds */
interface Browser {
  /** Context holding the session */
  ctx: WebContext;
  /** Cookies sent with each request */
  jar: Record<string, string>;
  /** Path attribute of each cookie: a cookie is only sent below its path */
  paths?: Record<string, string>;
}

/** Result of a GET route */
interface RouteResult {
  /** Location header */
  location: string;
  /** Response headers */
  headers: any;
  /** Pending login cookie set by the response, if any */
  cookie?: { name: string; value: string; options: any };
}

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
   * @returns a new browser with an empty session
   */
  async browser(): Promise<Browser> {
    return { ctx: await this.ctx(), jar: {} };
  }

  /**
   * Call a GET route of the provider like a browser: its session and cookies go with the request, the cookies of
   * the response update the jar
   * @param browser - browser
   * @param method - route
   * @param params - query parameters
   * @param https - https request
   * @param prefix - path prefix of the deployment (API Gateway stage, path-stripping proxy)
   * @returns the redirect
   */
  async route(
    browser: Browser,
    method: "login" | "callback",
    params: any = {},
    https: boolean = false,
    prefix: string = ""
  ): Promise<RouteResult> {
    const path = `${prefix}${method === "login" ? "/auth/fake" : "/auth/fake/callback"}`;
    browser.paths ??= {};
    const cookie = Object.entries(browser.jar)
      .filter(([k]) => path.startsWith(browser.paths[k] ?? "/"))
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
    const http = new HttpContext(
      "test.webda.io",
      "GET",
      path,
      https ? "https" : "http",
      https ? 443 : 80,
      cookie ? { cookie } : {}
    );
    if (prefix) http.setPrefix(prefix);
    const call = await this.newWebContext<WebContext>(http);
    call.setSession(browser.ctx.getSession());
    call.setParameters(params);
    await this.inContext(call, () => (this.fake as any)[method](call));
    browser.ctx.setSession(call.getSession());
    assert.strictEqual(call.statusCode, 302, `${method} must redirect`);
    const set = (call.getResponseCookies() as any)?.[COOKIE];
    if (set) {
      if (set.value && set.options.maxAge > 0) {
        browser.jar[COOKIE] = set.value;
        browser.paths[COOKIE] = set.options.path;
      } else if (set.options.path === browser.paths[COOKIE]) {
        // A clearing cookie only replaces the cookie of the same path
        delete browser.jar[COOKIE];
      }
    }
    const headers = call.getResponseHeaders();
    return { location: headers.Location as string, headers, cookie: set };
  }

  /**
   * Start a login
   * @param browser - browser
   * @param redirect - optional redirect parameter
   * @returns the authorization url parameters
   */
  async start(browser: Browser, redirect?: string): Promise<Record<string, string>> {
    const { location } = await this.route(browser, "login", redirect ? { redirect } : {});
    assert.ok(location.startsWith("https://idp.example/authorize?"), location);
    return query(location);
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
      logger.close?.();
    }
    return JSON.stringify(logger.getLogs());
  }

  @test
  async loginSetsAPendingLoginCookie() {
    const browser = await this.browser();
    const res = await this.route(browser, "login", { redirect: "https://app.example.com/after/page?x=1" }, true);
    const q = query(res.location);
    assert.ok(q.state && q.state.length >= 32, "random state");
    assert.ok(q.redirect_uri.endsWith("/auth/fake/callback"), q.redirect_uri);
    assert.strictEqual(q.scope, "openid email");
    assert.strictEqual(q.client_id, "cid");
    // PKCE and nonce
    assert.strictEqual(q.code_challenge_method, "S256");
    assert.match(q.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.ok(q.nonce && q.nonce.length >= 16);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    // Dedicated short-lived cookie, encrypted
    assert.strictEqual(res.cookie.name, COOKIE);
    assert.strictEqual(res.cookie.options.httpOnly, true);
    assert.strictEqual(res.cookie.options.secure, true);
    assert.strictEqual(res.cookie.options.sameSite, "lax");
    // Scoped to the callback path
    assert.strictEqual(res.cookie.options.path, "/auth/fake/callback");
    assert.strictEqual(res.cookie.options.maxAge, 600);
    for (const secret of [q.state, q.nonce, "app.example.com"]) {
      assert.ok(!res.cookie.value.includes(secret), "the cookie is encrypted");
    }
    // Nothing goes in the session
    assert.ok(!JSON.stringify(browser.ctx.getSession()).includes(q.state));
    assert.ok(!browser.ctx.getSession().isLogged());
    // Plain http: not Secure, unless the callback url is https
    assert.strictEqual((await this.route(await this.browser(), "login")).cookie.options.secure, false);
    this.fake.getParameters().redirect_uri = "https://test.webda.io/auth/fake/callback";
    assert.strictEqual((await this.route(await this.browser(), "login")).cookie.options.secure, true);
    // Another login gets other secrets
    const other = await this.start(await this.browser());
    assert.notStrictEqual(other.state, q.state);
    assert.notStrictEqual(other.nonce, q.nonce);
    assert.notStrictEqual(other.code_challenge, q.code_challenge);
  }

  @test
  async stateCookieIgnoresTheSessionCookieSameSite() {
    const sessions: any = useService("SessionManager" as any);
    const cookie = sessions.getParameters().cookie;
    const previous = cookie.sameSite;
    cookie.sameSite = "strict";
    try {
      const browser = await this.browser();
      const res = await this.route(browser, "login");
      assert.strictEqual(res.cookie.options.sameSite, "lax");
    } finally {
      cookie.sameSite = previous;
    }
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
      "https://app.example.com/after/%2F%2Fevil.com",
      "https://app.example.com/after/%2fx",
      "https://app.example.com/after/%5Cevil",
      "https://app.example.com/after/%5cx",
      "//evil.com/after",
      "/after",
      "javascript:alert(1)",
      "not a url"
    ]) {
      const browser = await this.browser();
      const res = await this.route(browser, "login", { redirect });
      assert.strictEqual(res.location, `${KO}?reason=REDIRECT_NOT_ALLOWED`, redirect);
      assert.strictEqual(res.headers["Cache-Control"], "no-store");
      assert.strictEqual(res.cookie, undefined, "no pending login");
      const back = await this.route(browser, "callback", { code: "1,a@x.com,1", state: "anything" });
      assert.strictEqual(back.location, `${KO}?reason=STATE_MISMATCH`);
    }
    // Overlong redirect: the pending cookie must stay a single cookie
    const long = `https://app.example.com/after/${"a".repeat(1024)}`;
    const refused = await this.route(await this.browser(), "login", { redirect: long });
    assert.strictEqual(refused.location, `${KO}?reason=REDIRECT_NOT_ALLOWED`);
    assert.strictEqual(refused.cookie, undefined);
    const longest = `https://app.example.com/after/${"a".repeat(1024 - 30)}`;
    assert.strictEqual(longest.length, 1024);
    const accepted = await this.route(await this.browser(), "login", { redirect: longest });
    // Value plus attributes under the 4096 split threshold of SecureCookie: never split into a second cookie
    assert.ok(accepted.cookie.value.length < 3500, `${accepted.cookie.value.length}`);
    // An encoded slash in the query is not a path
    assert.ok(await this.start(await this.browser(), "https://app.example.com/after?next=%2Fhome"));
    assert.strictEqual(this.fake.calls.length, 0);
  }

  @test
  async loginWithoutAllowList() {
    this.fake.getParameters().authorized_uris = [];
    const browser = await this.browser();
    assert.strictEqual(
      (await this.route(browser, "login", { redirect: "https://app.example.com/after" })).location,
      `${KO}?reason=REDIRECT_NOT_ALLOWED`
    );
    assert.ok(await this.start(browser));
  }

  @test
  async callbackStateMismatch() {
    const code = "1,a@x.com,1";
    // No pending login
    const browser = await this.browser();
    let res = await this.route(browser, "callback", { code, state: "x" });
    assert.strictEqual(res.location, `${KO}?reason=STATE_MISMATCH`);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    // Wrong state: the pending login is cleared
    await this.start(browser);
    res = await this.route(browser, "callback", { code, state: "wrong" });
    assert.strictEqual(res.location, `${KO}?reason=STATE_MISMATCH`);
    assert.strictEqual(res.cookie.options.maxAge, 0, "the pending login cookie is cleared");
    assert.strictEqual(browser.jar[COOKIE], undefined);
    // Missing state
    const { state } = await this.start(browser);
    assert.strictEqual((await this.route(browser, "callback", { code })).location, `${KO}?reason=STATE_MISMATCH`);
    // Consumed by the failed attempt
    assert.strictEqual(
      (await this.route(browser, "callback", { code, state })).location,
      `${KO}?reason=STATE_MISMATCH`
    );
    // Tampered cookie
    const t = await this.start(browser);
    const [h, p, s] = browser.jar[COOKIE].split(".");
    browser.jar[COOKIE] = `${h}.${p.substring(0, p.length - 4)}AAAA.${s}`;
    assert.strictEqual(
      (await this.route(browser, "callback", { code, state: t.state })).location,
      `${KO}?reason=STATE_MISMATCH`
    );
    // State of another browser
    const other = await this.browser();
    const otherState = (await this.start(other)).state;
    const mine = await this.browser();
    await this.start(mine);
    assert.strictEqual(
      (await this.route(mine, "callback", { code, state: otherState })).location,
      `${KO}?reason=STATE_MISMATCH`
    );
    assert.strictEqual(this.fake.calls.length, 0, "the code is never exchanged");
    for (const b of [browser, mine]) {
      assert.ok(!b.ctx.getSession().isLogged());
      assert.ok(!b.ctx.getSession().userId);
    }
  }

  @test
  async callbackExpiredState() {
    const browser = await this.browser();
    const now = Date.now();
    const { state } = await this.start(browser);
    const realNow = Date.now;
    try {
      Date.now = () => now + 10 * 60 * 1000 + 1000;
      assert.strictEqual(
        (await this.route(browser, "callback", { code: "1,a@x.com,1", state })).location,
        `${KO}?reason=STATE_MISMATCH`
      );
    } finally {
      Date.now = realNow;
    }
    assert.ok(!browser.ctx.getSession().isLogged());
  }

  @test
  async callbackLogsInWithPkceAndNonce() {
    const browser = await this.browser();
    const q = await this.start(browser, "https://app.example.com/after/page?x=1");
    const res = await this.route(browser, "callback", { code: "sub1,Sub1@X.com,1", state: q.state, scope: "openid" });
    assert.strictEqual(res.location, "https://app.example.com/after/page?x=1");
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    assert.strictEqual(res.cookie.options.maxAge, 0, "the pending login cookie is cleared");
    const session = browser.ctx.getSession();
    assert.ok(session.isLogged());
    assert.strictEqual(session.provider, "fake");
    assert.deepStrictEqual(session.amr, ["oauth"]);
    const ident = await Ident.ref(Ident.key("sub1", "fake")).get();
    assert.strictEqual(ident.getUser().toString(), session.userId);
    // The exchange gets the redirect_uri, the PKCE verifier and the nonce of the login
    assert.strictEqual(this.fake.calls.length, 1);
    const request = this.fake.calls[0].request;
    assert.strictEqual(request.code, "sub1,Sub1@X.com,1");
    assert.strictEqual(request.redirectUri, q.redirect_uri);
    assert.strictEqual(request.nonce, q.nonce);
    assert.strictEqual(createHash("sha256").update(request.codeVerifier).digest("base64url"), q.code_challenge);
  }

  @test
  async prefixedDeployment() {
    // API Gateway stage / path-stripping proxy: the public paths carry a prefix the routes do not see
    for (const redirectUri of [undefined, "https://api.example.com/prod/auth/fake/callback"]) {
      if (redirectUri) this.fake.getParameters().redirect_uri = redirectUri;
      const browser = await this.browser();
      const res = await this.route(browser, "login", { redirect: "https://app.example.com/after" }, true, "/prod");
      const q = query(res.location);
      assert.strictEqual(new URL(q.redirect_uri).pathname, "/prod/auth/fake/callback");
      assert.strictEqual(res.cookie.options.path, "/prod/auth/fake/callback");
      const back = await this.route(browser, "callback", { code: "sub30,,0", state: q.state }, true, "/prod");
      assert.strictEqual(back.location, "https://app.example.com/after", redirectUri);
      assert.strictEqual(back.cookie.options.path, "/prod/auth/fake/callback", "cleared on the same path");
      assert.strictEqual(browser.jar[COOKIE], undefined);
      assert.ok(browser.ctx.getSession().isLogged());
    }
  }

  @test
  async callbackWorksWithoutTheSessionCookie() {
    // A SameSite=Strict session cookie is not sent on the cross-site callback: only the pending login cookie is
    const browser = await this.browser();
    const q = await this.start(browser, "https://app.example.com/after");
    const strict: Browser = { ctx: await this.ctx(), jar: browser.jar };
    const res = await this.route(strict, "callback", { code: "sub10,,0", state: q.state });
    assert.strictEqual(res.location, "https://app.example.com/after");
    assert.ok(strict.ctx.getSession().isLogged());
  }

  @test
  async callbackDefaultsToSuccessAndConfiguredRedirectUri() {
    this.fake.getParameters().redirect_uri = "https://api.example.com/auth/fake/callback";
    const browser = await this.browser();
    const q = await this.start(browser);
    assert.strictEqual(q.redirect_uri, "https://api.example.com/auth/fake/callback");
    assert.strictEqual((await this.route(browser, "callback", { code: "sub2,,0", state: q.state })).location, OK);
    assert.strictEqual(this.fake.calls[0].request.redirectUri, "https://api.example.com/auth/fake/callback");
    assert.ok(browser.ctx.getSession().isLogged());
  }

  @test
  async callbackRefusedByAuthentication() {
    this.fake.getParameters().allowedEmailDomains = ["corp.com"];
    let browser = await this.browser();
    let q = await this.start(browser);
    assert.strictEqual(
      (await this.route(browser, "callback", { code: "sub3,a@other.com,1", state: q.state })).location,
      `${KO}?reason=EMAIL_DOMAIN_NOT_ALLOWED`
    );
    assert.ok(!browser.ctx.getSession().isLogged());
    assert.ok(!(await Ident.ref(Ident.key("sub3", "fake")).exists()));
    delete this.fake.getParameters().allowedEmailDomains;

    const owner = await this.auth.getUserModel().create({ email: "owner@x.com" } as any);
    const emailIdent = new Ident({
      ...Ident.key("owner@x.com", "email"),
      email: "owner@x.com",
      verifiedAt: new Date()
    } as any);
    emailIdent.setUser(owner.getUUID());
    await Ident.getRepository().create(emailIdent);
    browser = await this.browser();
    q = await this.start(browser, "https://app.example.com/after");
    assert.strictEqual(
      (await this.route(browser, "callback", { code: "sub4,owner@x.com,0", state: q.state })).location,
      `${KO}?reason=ACCOUNT_EXISTS`
    );
    assert.ok(!browser.ctx.getSession().isLogged());
  }

  @test
  async callbackProviderFailures() {
    const browser = await this.browser();
    let q = await this.start(browser);
    assert.strictEqual(
      (await this.route(browser, "callback", { error: "access_denied", state: q.state })).location,
      `${KO}?reason=PROVIDER_ERROR`
    );
    q = await this.start(browser);
    assert.strictEqual(
      (await this.route(browser, "callback", { code: "bad", state: q.state })).location,
      `${KO}?reason=TOKEN_INVALID`
    );
    // Unexpected failure: generic reason, nothing of the error message in the url nor in the logs
    q = await this.start(browser);
    let location: string;
    const logs = await this.logsOf(async () => {
      location = (await this.route(browser, "callback", { code: "boom-secret-code-value", state: q.state })).location;
    });
    assert.strictEqual(location, `${KO}?reason=OAUTH_ERROR`);
    assert.ok(!logs.includes("boom-secret-code-value"), logs);
    assert.ok(!logs.includes("secret internal failure"), logs);
    q = await this.start(browser);
    assert.strictEqual(
      (await this.route(browser, "callback", { code: ",a@x.com,1", state: q.state })).location,
      `${KO}?reason=TOKEN_INVALID`
    );
    assert.ok(!browser.ctx.getSession().isLogged());
  }

  @test
  async callbackCannotImpersonateAnotherProvider() {
    const browser = await this.browser();
    const q = await this.start(browser);
    assert.strictEqual(
      (await this.route(browser, "callback", { code: "uid9,victim@x.com,0,email", state: q.state })).location,
      OK
    );
    assert.ok(await Ident.ref(Ident.key("uid9", "fake")).exists());
    assert.ok(!(await Ident.ref(Ident.key("uid9", "email")).exists()));
    assert.strictEqual(browser.ctx.getSession().provider, "fake");
  }

  @test
  async callbackMfaRequired() {
    (this.auth as any).mfaMethods = () => ["totp"];
    const browser = await this.browser();
    let q = await this.start(browser, "https://app.example.com/after?x=1");
    assert.strictEqual(
      (await this.route(browser, "callback", { code: "sub5,,0", state: q.state })).location,
      "https://app.example.com/after?x=1&mfa=required"
    );
    assert.ok(browser.ctx.getSession().isPending());
    const other = await this.browser();
    q = await this.start(other);
    assert.strictEqual(
      (await this.route(other, "callback", { code: "sub6,,0", state: q.state })).location,
      `${OK}?mfa=required`
    );
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
    assert.deepStrictEqual(
      this.fake.calls.map(c => c.request),
      [{ token: "sub7,t@x.com,1", tokens: undefined }]
    );
    (this.auth as any).mfaMethods = () => ["totp"];
    assert.deepStrictEqual(await this.op("Auth.Fake.Token", { token: "sub7,t@x.com,1" }), {
      status: "mfa_required",
      methods: ["totp"]
    });
  }

  @test
  async tokenOperationAcceptsTheTokensBody() {
    const tokens = { id_token: "sub11,,0", access_token: "at-11", refresh_token: "rt-11", expiry_date: 5 };
    // Only the known Credentials keys, as bounded strings or numbers, are kept (nulls, objects, extras dropped)
    const res: any = await this.op("Auth.Fake.Token", {
      tokens: {
        ...tokens,
        scope: null,
        token_type: { nested: true },
        extra: "dropped",
        __proto_like: "x",
        refresh_token_2: "y"
      }
    });
    assert.strictEqual(res.status, "ok");
    assert.deepStrictEqual(this.fake.calls[0].request, { token: undefined, tokens });
    // The received credentials are stored (encrypted) on the ident
    const ident = await Ident.ref(Ident.key("sub11", "fake")).get();
    assert.deepStrictEqual(await ident.tokens.get(), tokens);
    // Oversized values are dropped
    await this.op("Auth.Fake.Token", { tokens: { id_token: "sub11,,0", access_token: "x".repeat(10000) } });
    assert.deepStrictEqual(this.fake.calls[1].request.tokens, { id_token: "sub11,,0" });
  }

  @test
  async tokenOperationFailures() {
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "bad" }), { code: "TOKEN_INVALID" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: ",a@x.com,1" }), { code: "TOKEN_INVALID" });
    // Unexpected verification failure: fails closed, and the token never reaches the logs
    const logs = await this.logsOf(() =>
      assert.rejects(() => this.op("Auth.Fake.Token", { token: "boom-secret-token-value" }), { code: "TOKEN_INVALID" })
    );
    assert.ok(!logs.includes("boom-secret-token-value"), logs);
    assert.ok(!logs.includes("secret internal failure"), logs);
    // Missing or malformed body
    await assert.rejects(() => this.op("Auth.Fake.Token", {}), { code: "BAD_REQUEST" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: 12 }), { code: "BAD_REQUEST" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { tokens: "x" }), { code: "BAD_REQUEST" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "" }), { code: "BAD_REQUEST" });
    this.fake.getParameters().allowedEmailDomains = ["corp.com"];
    const ctx = await this.ctx();
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "sub8,a@other.com,1" }, ctx), {
      code: "EMAIL_DOMAIN_NOT_ALLOWED"
    });
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async tokenOperationRequiresJson() {
    for (const headers of [
      { "content-type": "text/plain" },
      { "content-type": "application/x-www-form-urlencoded" },
      { "content-type": "multipart/form-data; boundary=x" },
      { "content-type": "application/jsonp" },
      {}
    ]) {
      const ctx = await this.ctx();
      await assert.rejects(
        () => this.op("Auth.Fake.Token", { token: "sub12,,0" }, ctx, headers as any),
        { code: "UNSUPPORTED_MEDIA_TYPE" },
        JSON.stringify(headers)
      );
      assert.ok(!ctx.getSession().isLogged());
    }
    assert.strictEqual(this.fake.calls.length, 0);
    const res: any = await this.op("Auth.Fake.Token", { token: "sub12,,0" }, undefined, {
      "content-type": "Application/JSON; charset=utf-8"
    });
    assert.strictEqual(res.status, "ok");
  }

  @test
  async tokenOperationNeverLinksImplicitly() {
    // Logged in as A
    const ctx = await this.ctx();
    const a: any = await this.op("Auth.Fake.Token", { token: "a1,,0" }, ctx);
    const userA = a.user.uuid;
    assert.strictEqual(ctx.getCurrentUserId(), userA);
    // B's identity owned by another user: refused, the session stays A's
    const b: any = await this.op("Auth.Fake.Token", { token: "b1,,0" });
    await assert.rejects(() => this.op("Auth.Fake.Token", { token: "b1,,0" }, ctx), {
      code: "IDENT_LINKED_ELSEWHERE"
    });
    assert.strictEqual(ctx.getCurrentUserId(), userA);
    // A new identity while logged in as A: a fresh session for a new user, never linked to A
    const c: any = await this.op("Auth.Fake.Token", { token: "c1,,0" }, ctx);
    assert.notStrictEqual(c.user.uuid, userA);
    assert.notStrictEqual(c.user.uuid, b.user.uuid);
    assert.strictEqual(ctx.getCurrentUserId(), c.user.uuid);
    assert.strictEqual((await Ident.ref(Ident.key("c1", "fake")).get()).getUser().toString(), c.user.uuid);
    // The owner of the identity logs in again in its own session
    const ctxA = await this.ctx();
    await this.op("Auth.Fake.Token", { token: "a1,,0" }, ctxA);
    const again: any = await this.op("Auth.Fake.Token", { token: "a1,,0" }, ctxA);
    assert.strictEqual(again.user.uuid, userA);
    // An unowned ident is not adopted by the cookie user either
    const orphan = new Ident({ ...Ident.key("d1", "fake") } as any);
    await Ident.getRepository().create(orphan);
    const d: any = await this.op("Auth.Fake.Token", { token: "d1,,0" }, ctxA);
    assert.notStrictEqual(d.user.uuid, userA);
    assert.strictEqual(ctxA.getCurrentUserId(), d.user.uuid);
    assert.strictEqual((await Ident.ref(Ident.key("d1", "fake")).get()).getUser().toString(), d.user.uuid);
    const idents = (await Ident.query("_user = ?", [userA])).results.map(i => i.getUUID());
    assert.deepStrictEqual(idents, ["a1:fake"]);
  }

  @test
  safeErrorReasonNeverLeaksMessages() {
    const err: any = new Error("Wrong number of segments in token: eyJsecret");
    assert.strictEqual(safeErrorReason(err), "Error");
    err.code = "ERR_X";
    assert.strictEqual(safeErrorReason(err), "Error(ERR_X)");
    err.name = "Bad: eyJsecret";
    assert.strictEqual(safeErrorReason(err), "Error(ERR_X)");
    err.code = "eyJsecret.with spaces";
    assert.strictEqual(safeErrorReason(err), "Error");
    assert.strictEqual(safeErrorReason(undefined), "Error");
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
