import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  type DomainService,
  listOperations,
  useApplication,
  useCrypto,
  useDynamicService,
  useRouter
} from "@webda/core";
import { OAuthTest, query } from "./test/oauthtest.js";
import { readPending, writePending } from "./pending.js";
import { OAuthGrant } from "./models.model.js";

@suite
class AuthorizeTest extends OAuthTest {
  @test
  async metadata() {
    const res = await this.get(await this.browser(), "/.well-known/oauth-authorization-server");
    assert.strictEqual(res.body.issuer, "http://test.webda.io");
    assert.strictEqual(res.body.authorization_endpoint, "http://test.webda.io/oauth/authorize");
    assert.strictEqual(res.body.token_endpoint, "http://test.webda.io/oauth/token");
    assert.strictEqual(res.body.revocation_endpoint, "http://test.webda.io/oauth/revoke");
    assert.strictEqual(res.body.device_authorization_endpoint, "http://test.webda.io/oauth/device_authorization");
    assert.deepStrictEqual(res.body.response_types_supported, ["code"]);
    assert.deepStrictEqual(res.body.code_challenge_methods_supported, ["S256"]);
    assert.deepStrictEqual(res.body.token_endpoint_auth_methods_supported, ["none"]);
    assert.strictEqual(res.body.client_id_metadata_document_supported, true);
    assert.strictEqual(res.body.webda_result_uri, "http://test.webda.io/oauth/done");
    assert.strictEqual(res.body.webda_operations_uri, undefined); // no OperationsTransport configured
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
    assert.strictEqual(res.headers.Vary, "Host");
    assert.ok(res.body.scopes_supported.includes("*"));
    assert.ok(res.body.scopes_supported.includes("offline_access"));
  }

  @test
  async unknownClientOrRedirectNeverRedirects() {
    const b = await this.browser();
    const { challenge } = this.pkce();
    for (const q of [
      { client_id: "nope", redirect_uri: "http://127.0.0.1:1234/callback" },
      { client_id: "app", redirect_uri: "http://evil.com/callback" },
      { client_id: "app", redirect_uri: undefined },
      { client_id: undefined, redirect_uri: "http://127.0.0.1:1234/callback" }
    ]) {
      const res = await this.get(b, "/oauth/authorize", {
        ...q,
        response_type: "token",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "s"
      });
      assert.strictEqual(res.status, 400);
      assert.strictEqual(res.headers.Location, undefined);
      assert.strictEqual(res.body, "Unknown client or redirect URI");
      assert.strictEqual(b.jar["webda_oauth_pending"], undefined);
    }
  }

  @test
  async validationErrorsRedirect() {
    const b = await this.browser();
    const base = {
      client_id: "app",
      redirect_uri: "http://127.0.0.1:1234/callback",
      response_type: "code",
      state: "s"
    };
    const missingPkce = await this.get(b, "/oauth/authorize", base);
    assert.deepStrictEqual(query(missingPkce.headers.Location), {
      error: "invalid_request",
      error_description: "PKCE S256 required",
      state: "s"
    });
    assert.ok(missingPkce.headers.Location.startsWith("http://127.0.0.1:1234/callback?"));
    const plain = await this.get(b, "/oauth/authorize", {
      ...base,
      code_challenge: "x".repeat(43),
      code_challenge_method: "plain"
    });
    assert.strictEqual(query(plain.headers.Location).error, "invalid_request");
    const { challenge } = this.pkce();
    const outside = await this.get(b, "/oauth/authorize", {
      ...base,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "User.*"
    });
    assert.strictEqual(query(outside.headers.Location).error, "invalid_scope");
    const invalid = await this.get(b, "/oauth/authorize", {
      ...base,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "Task.? bad"
    });
    assert.strictEqual(query(invalid.headers.Location).error, "invalid_scope");
    const offlineOnly = await this.get(b, "/oauth/authorize", {
      ...base,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "offline_access"
    });
    assert.strictEqual(query(offlineOnly.headers.Location).error, "invalid_scope");
    const token = await this.get(b, "/oauth/authorize", {
      ...base,
      response_type: "token",
      code_challenge: challenge,
      code_challenge_method: "S256"
    });
    assert.strictEqual(query(token.headers.Location).error, "unsupported_response_type");
    // Oversized state: rejected, not echoed
    const longState = await this.get(b, "/oauth/authorize", { ...base, state: "s".repeat(257) });
    assert.deepStrictEqual(query(longState.headers.Location), {
      error: "invalid_request",
      error_description: "state is too long"
    });
    const longScope = await this.get(b, "/oauth/authorize", {
      ...base,
      code_challenge: challenge,
      code_challenge_method: "S256",
      scope: "Task.Get ".repeat(120)
    });
    assert.strictEqual(query(longScope.headers.Location).error, "invalid_scope");
    // No state: none echoed
    const noState = await this.get(b, "/oauth/authorize", { ...base, state: undefined });
    assert.strictEqual(query(noState.headers.Location).state, undefined);
    assert.strictEqual(b.jar["webda_oauth_pending"], undefined);
  }

  @test
  async privateSchemeRedirectKeepsExistingQuery() {
    const b = await this.browser();
    const res = await this.get(b, "/oauth/authorize", {
      client_id: "app",
      redirect_uri: "loopcenter://auth/callback",
      response_type: "code",
      state: "s"
    });
    assert.ok(res.headers.Location.startsWith("loopcenter://auth/callback?"), res.headers.Location);
    assert.strictEqual(res.headers["Cache-Control"], "no-store");
  }

  @test
  async anonymousGoesToLogin() {
    const b = await this.browser();
    const res = await this.authorize(b, { scope: "Task.*", hostname: "laptop" });
    assert.strictEqual(
      res.headers.Location,
      "/login?redirect=" + encodeURIComponent("http://test.webda.io/oauth/consent")
    );
    assert.ok(b.jar["webda_oauth_pending"]);
    const cookie = res.cookies["webda_oauth_pending"];
    assert.strictEqual(cookie.options.httpOnly, true);
    assert.strictEqual(cookie.options.sameSite, "lax");
    assert.strictEqual(cookie.options.path, "/oauth");
    assert.strictEqual(cookie.options.maxAge, 600);
    // Encrypted: nothing readable
    for (const secret of ["127.0.0.1", "laptop", "Task"]) {
      assert.ok(!cookie.value.includes(secret));
    }
    const pending = await useCrypto().decrypt(cookie.value);
    assert.strictEqual(pending.flow, "code");
    assert.strictEqual(pending.clientId, "app");
    assert.strictEqual(pending.redirectUri, "http://127.0.0.1:1234/callback");
    assert.strictEqual(pending.state, "s");
    assert.strictEqual(pending.scope, "Task.*");
    assert.strictEqual(pending.hostname, "laptop");
    assert.ok(pending.csrf.length >= 24);
    assert.ok(pending.expires > Date.now() + 590_000 && pending.expires <= Date.now() + 600_000);
  }

  @test
  async maximalRequestFitsOneCookie() {
    const b = await this.browser();
    // Distinct globs up to the scope cap, state and hostname at their caps
    const globs: string[] = [];
    for (let i = 0; globs.join(" ").length + 12 <= 1024; i++) globs.push(`Task.G${String(i).padStart(4, "0")}*`);
    const scope = globs.join(" ");
    assert.ok(scope.length > 1000 && scope.length <= 1024, `${scope.length}`);
    const res = await this.authorize(b, { scope, state: "s".repeat(256), hostname: "h".repeat(64) });
    assert.ok(res.headers.Location.startsWith("/login?redirect="), res.headers.Location);
    assert.deepStrictEqual(Object.keys(res.cookies), ["webda_oauth_pending"]);
    const ctx = await this.ctx();
    ctx.getHttpContext().getCookies = () => ({ ...b.jar });
    const pending = await readPending(ctx, "webda_oauth_pending");
    assert.strictEqual(pending?.scope, scope);
    assert.strictEqual(pending?.state, "s".repeat(256));
  }

  @test
  async oversizedRequestIsRejected() {
    const server: any = this.getService("OAuthServer" as any);
    const long = `https://app.example.com/${"p".repeat(2000)}`;
    server.getParameters().clients.long = { name: "Long", redirect_uris: [long] };
    try {
      const b = await this.browser();
      const globs: string[] = [];
      for (let i = 0; globs.join(" ").length + 12 <= 1024; i++) globs.push(`Task.G${String(i).padStart(4, "0")}*`);
      const res = await this.authorize(b, {
        client_id: "long",
        redirect_uri: long,
        scope: globs.join(" "),
        state: "s".repeat(256),
        hostname: "h".repeat(64)
      });
      assert.ok(res.headers.Location.startsWith(`${long}?`));
      assert.deepStrictEqual(query(res.headers.Location), {
        error: "invalid_request",
        error_description: "Authorization request is too large",
        state: "s".repeat(256)
      });
      assert.strictEqual(Object.keys(res.cookies).length, 0);
      assert.strictEqual(b.jar["webda_oauth_pending"], undefined);
      // Same when logged in, on the way to consent
      await this.login(b, "u1");
      const logged = await this.authorize(b, {
        client_id: "long",
        redirect_uri: long,
        scope: globs.join(" "),
        state: "s".repeat(256),
        hostname: "h".repeat(64)
      });
      assert.strictEqual(query(logged.headers.Location).error, "invalid_request");
      assert.strictEqual(Object.keys(logged.cookies).length, 0);
    } finally {
      delete server.getParameters().clients.long;
    }
  }

  @test
  async extraParametersAreIgnored() {
    const b = await this.browser();
    const res = await this.authorize(b, { scope: "Task.*", resource: "https://mcp.example.com" });
    assert.ok(res.headers.Location.startsWith("/login?redirect="), res.headers.Location);
    assert.ok(b.jar["webda_oauth_pending"]);
  }

  @test
  async hostnameIsSanitized() {
    const b = await this.browser();
    const pendingOf = async (hostname: string) => {
      await this.authorize(b, { scope: "Task.*", hostname });
      return (await useCrypto().decrypt(b.jar["webda_oauth_pending"])).hostname;
    };
    assert.strictEqual(await pendingOf("lap\u0000top\n\u202Eexe.\u200Bcom "), "laptopexe.com");
    assert.strictEqual(await pendingOf("\u0007\t "), undefined);
    assert.strictEqual(await pendingOf("é".repeat(100)), "é".repeat(64));
  }

  @test
  async defaultScopeAndLoginUrlWithQuery() {
    const server: any = this.getService("OAuthServer" as any);
    server.getParameters().loginUrl = "/login?app=1";
    server.getParameters().clients.app.defaultScope = "Task.Get";
    try {
      const b = await this.browser();
      const res = await this.authorize(b);
      assert.strictEqual(
        res.headers.Location,
        "/login?app=1&redirect=" + encodeURIComponent("http://test.webda.io/oauth/consent")
      );
      assert.strictEqual((await useCrypto().decrypt(b.jar["webda_oauth_pending"])).scope, "Task.Get");
      // Neither a scope nor a default scope
      delete server.getParameters().clients.app.defaultScope;
      const none = await this.authorize(b);
      assert.strictEqual(query(none.headers.Location).error, "invalid_scope");
    } finally {
      server.getParameters().loginUrl = "/login";
      delete server.getParameters().clients.app.defaultScope;
    }
  }

  @test
  async promptNoneWithoutLogin() {
    const b = await this.browser();
    const res = await this.authorize(b, { scope: "Task.*", prompt: "none" });
    assert.strictEqual(query(res.headers.Location).error, "login_required");
    assert.strictEqual(query(res.headers.Location).state, "s");
    assert.strictEqual(b.jar["webda_oauth_pending"], undefined);
  }

  @test
  async loggedInGoesToConsent() {
    const b = await this.browser();
    await this.login(b, "u1");
    const res = await this.authorize(b, { scope: "Task.*" });
    assert.strictEqual(res.headers.Location, "http://test.webda.io/oauth/consent");
    assert.ok(b.jar["webda_oauth_pending"]);
  }

  @test
  async promptNoneLoggedInWithoutGrant() {
    const b = await this.browser();
    await this.login(b, "u1");
    const res = await this.authorize(b, { scope: "Task.*", prompt: "none" });
    assert.strictEqual(query(res.headers.Location).error, "consent_required");
  }

  @test
  async bearerSessionCannotAuthorize() {
    const b = await this.browser();
    await this.login(b, "u1");
    b.ctx.getSession().scopes = ["Task.*"];
    const res = await this.authorize(b, { scope: "Task.*" });
    assert.ok(res.headers.Location.startsWith("/login?redirect="));
  }

  @test
  async configuredPages() {
    const server: any = this.getService("OAuthServer" as any);
    const params = server.getParameters();
    params.consentUrl = "https://app.example.com/consent";
    params.resultUrl = "/app/done";
    try {
      const b = await this.browser();
      await this.login(b, "u1");
      const res = await this.authorize(b, { scope: "Task.*" });
      assert.strictEqual(res.headers.Location, "https://app.example.com/consent");
      const meta = await this.get(b, "/.well-known/oauth-authorization-server");
      assert.strictEqual(meta.body.webda_result_uri, "http://test.webda.io/app/done");
    } finally {
      delete params.consentUrl;
      delete params.resultUrl;
    }
  }

  @test
  async rememberedConsent() {
    const server: any = this.getService("OAuthServer" as any);
    assert.strictEqual(await server.rememberedScope("u1", "app"), undefined);
    const now = Date.now();
    await OAuthGrant.create({
      uuid: "u1:app",
      userId: "u1",
      clientId: "app",
      scope: "Task.* offline_access",
      createdAt: now - 1000,
      lastUsedAt: now - 1000,
      expiresAt: now + 60_000
    } as any);
    assert.deepStrictEqual(await server.rememberedScope("u1", "app"), ["Task.*", "offline_access"]);
    // Reading is not a use
    assert.strictEqual((await OAuthGrant.ref("u1:app").get()).lastUsedAt, now - 1000);
    // A grant that does not cover the request is not used either
    const b = await this.browser();
    await this.login(b, "u1");
    const partial = await this.authorize(b, { scope: "Task.* Other.Get", prompt: "none" });
    assert.strictEqual(query(partial.headers.Location).error, "invalid_scope");
    await OAuthGrant.ref("u1:app").patch({ scope: "Task.Get" });
    const uncovered = await this.authorize(b, { scope: "Task.*", prompt: "none" });
    assert.strictEqual(query(uncovered.headers.Location).error, "consent_required");
    assert.strictEqual((await OAuthGrant.ref("u1:app").get()).lastUsedAt, now - 1000);
    await server.touchGrant("u1", "app");
    assert.ok((await OAuthGrant.ref("u1:app").get()).lastUsedAt >= now);
    await OAuthGrant.ref("u1:app").patch({ scope: "Task.* offline_access" });
    server.getParameters().rememberConsent = false;
    try {
      assert.strictEqual(await server.rememberedScope("u1", "app"), undefined);
    } finally {
      server.getParameters().rememberConsent = true;
    }
    await OAuthGrant.ref("u1:app").patch({ expiresAt: now - 1 });
    assert.strictEqual(await server.rememberedScope("u1", "app"), undefined);
    await OAuthGrant.ref("u1:app").delete();
  }

  @test
  async pendingCookie() {
    const ctx = await this.ctx();
    const pending = {
      flow: "code" as const,
      clientId: "app",
      redirectUri: "http://127.0.0.1/callback",
      codeChallenge: "x".repeat(43),
      scope: "Task.*",
      csrf: "c".repeat(32),
      expires: Date.now() + 60_000
    };
    await writePending(ctx, "p", "/oauth", pending);
    const set = (ctx.getResponseCookies() as any).p;
    const read = async (value: string) => {
      const c = await this.ctx();
      c.getHttpContext().getCookies = () => ({ p: value });
      return readPending(c, "p");
    };
    assert.deepStrictEqual(await read(set.value), pending);
    // Reading does not clear
    const c2 = await this.ctx();
    c2.getHttpContext().getCookies = () => ({ p: set.value });
    await readPending(c2, "p");
    assert.strictEqual(c2.getResponseCookies(), undefined);
    // Invalid values
    assert.strictEqual(await read("garbage"), undefined);
    assert.strictEqual(await read(""), undefined);
    assert.strictEqual(await read(await useCrypto().encrypt({ ...pending, expires: Date.now() - 1 })), undefined);
    assert.strictEqual(await read(await useCrypto().encrypt({ ...pending, flow: "other" })), undefined);
    assert.strictEqual(await read(await useCrypto().encrypt({ ...pending, csrf: 1 })), undefined);
    assert.strictEqual(await read(await useCrypto().encrypt({ ...pending, codeChallenge: undefined })), undefined);
    assert.strictEqual(await read(await useCrypto().encrypt({ ...pending, flow: "device" })), undefined);
    assert.ok(await read(await useCrypto().encrypt({ ...pending, flow: "device", userCode: "BCDFGHJK" })));
    assert.strictEqual(await read(await useCrypto().encrypt("string")), undefined);
    // Clear
    const clear = await this.ctx();
    await writePending(clear, "p", "/oauth", undefined);
    const cleared = (clear.getResponseCookies() as any).p;
    assert.strictEqual(cleared.value, "");
    assert.strictEqual(cleared.options.maxAge, 0);
    assert.strictEqual(cleared.options.path, "/oauth");
  }

  @test
  async stubbedRoutes() {
    const b = await this.browser();
    for (const [method, path] of [
      ["POST", "/oauth/revoke"],
      ["POST", "/oauth/device_authorization"],
      ["GET", "/oauth/consent"],
      ["GET", "/oauth/device"],
      ["GET", "/oauth/done"]
    ] as const) {
      const res = await this.request(b, method, path).catch(err => ({ status: err.getResponseCode?.() }));
      assert.strictEqual(res.status, 404, path);
    }
  }
}

@suite
class ExposedApplicationTest extends OAuthTest {
  /** @override */
  getTestConfiguration(): any {
    const config = super.getTestConfiguration();
    config.services.DomainService = { type: "Webda/DomainService" };
    config.services.REST = { type: "Webda/RESTOperationsTransport" };
    config.services.Operations = { type: "Webda/OperationsTransport" };
    return config;
  }

  /**
   * The test application forces the WebdaDemo namespace, under which no framework model is final (exposable): use
   * the Webda namespace so the framework models compete for exposure like in an application
   * @override
   */
  getApplication() {
    const app = super.getApplication();
    app.getNamespace = () => "Webda";
    return app;
  }

  @test
  async oauthModelsAreNotExposed() {
    const routes = Object.keys(useRouter().getRoutes());
    const ops = Object.keys(listOperations());
    // The domain is exposed: other models of the same store do get operations and routes
    assert.ok(
      ops.some(id => id.startsWith("User.")),
      ops.join(",")
    );
    assert.ok(
      routes.some(r => r.toLowerCase().startsWith("/users")),
      routes.join(",")
    );
    for (const path of ["/oauthcodes", "/oauthgrants", "/oauthdevicecodes"]) {
      assert.ok(!routes.some(r => r.toLowerCase().startsWith(path)), `${path} must not be routed`);
    }
    for (const prefix of ["OAuthGrant", "OAuthCode", "OAuthDeviceCode"]) {
      assert.ok(!ops.some(id => id.startsWith(prefix)), `no ${prefix}* operation`);
      // Only the internal model guard keeps them out: they are final models of the application namespace
      const id = `Webda/${prefix}`;
      assert.strictEqual(useApplication().isFinalModel(id), true, id);
      const domain = useDynamicService<DomainService>("DomainService");
      assert.strictEqual(domain.isExposable(useApplication().getModels()[id], id), false, id);
    }
  }

  @test
  async metadataAdvertisesOperations() {
    const res = await this.get(await this.browser(), "/.well-known/oauth-authorization-server");
    assert.strictEqual(res.body.webda_operations_uri, "http://test.webda.io/operations");
    assert.ok(res.body.scopes_supported.includes("User.*"), res.body.scopes_supported.join(","));
    assert.ok(!res.body.scopes_supported.some((s: string) => s.startsWith("OAuth")));
  }
}
