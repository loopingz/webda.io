import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Session, UnknownSession } from "./session.js";
import { WebdaApplicationTest } from "../test/application.js";
import { registerCertificateResolver, registerUserResolver, useService } from "../core/hooks.js";
import { useModel } from "../application/hooks.js";
import { useCrypto } from "../services/cryptoservice.service.js";
import { OwnerModel } from "../models/ownermodel.model.js";
import { type BearerTokenResolver, registerBearerResolver, useBearerResolvers } from "./manager.model.js";

@suite
class SessionTest {
  @test
  basic() {
    const session = new UnknownSession().getProxy();
    session.plop = "test";
    assert.ok(session.isDirty());
    assert.ok(!session.isLogged());
    session.login("user1", "ident1");
    assert.ok(session.isLogged());
    assert.strictEqual(session.mfa, "none");
    assert.deepStrictEqual(session.amr, []);
    session.logout();
    assert.ok(!session.isLogged());
  }

  @test
  pendingMfa() {
    const session = new Session();
    session.login("user1", "a@b.c:email", { provider: "email", amr: ["pwd"], mfa: "pending" });
    assert.ok(!session.isLogged());
    assert.ok(session.isPending());
    assert.strictEqual(session.provider, "email");
    session.refreshFamily = "fam";
    session.logout();
    assert.strictEqual(session.provider, undefined);
    assert.strictEqual(session.amr, undefined);
    assert.strictEqual(session.mfa, undefined);
    assert.strictEqual(session.refreshFamily, undefined);
  }

  @test
  scopedVerificationsDoNotSurviveLoginOrLogout() {
    const session = new Session().getProxy();
    const verified = { "User.PaymentMfa.Verify": { method: "totp", verifiedAt: 123, owner: "Webda/User/u1" } };
    session.login("u1", "ident", { mfaVerifications: verified });
    assert.deepStrictEqual(session.mfaVerifications, verified);
    session.login("u2", "other");
    assert.deepStrictEqual(session.mfaVerifications, {});
    session.mfaVerifications = verified;
    session.logout();
    assert.strictEqual(session.mfaVerifications, undefined);
  }

  @test
  application() {
    const session = new Session();
    session.login("u1", "ident", {
      mfaVerifications: { "User.Mfa.Verify": { method: "totp", verifiedAt: 123, owner: "Webda/User/u1" } }
    });
    session.loginApplication({ principal: "orders", issuer: "https://orders.example.com", subject: "app:orders" });
    assert.strictEqual(session.mfaVerifications, undefined);
    assert.ok(session.isApplication());
    assert.ok(session.stateless);
    assert.ok(!session.isLogged());
    assert.strictEqual(session.userId, undefined);
    assert.strictEqual(session.provider, "https://orders.example.com");
    assert.deepStrictEqual(session.amr, ["oidc"]);
    session.logout();
    assert.ok(!session.isApplication());
    assert.strictEqual(session.application, undefined);
    // A user login replaces the application
    session.loginApplication({ principal: "orders", issuer: "x", subject: "y" }, { amr: ["k8s"] });
    assert.deepStrictEqual(session.amr, ["k8s"]);
    session.login("u1", "ident");
    assert.ok(!session.isApplication());
    assert.strictEqual(session.application, undefined);
  }

  @test
  statelessNotSerialized() {
    const session = new Session();
    session.stateless = true;
    assert.ok(!Object.keys(session).includes("stateless"));
  }
}

@suite
class BearerSessionTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/RevokedAccess", "Webda/User"] }
      }
    };
  }

  async contextWith(headers: Record<string, string>) {
    const ctx = await this.newContext();
    Object.assign(ctx.getHttpContext().headers, headers);
    return ctx;
  }

  async token() {
    const s = new Session();
    s.login("u1", "a@b.c:email", { provider: "email", amr: ["pwd"] });
    return (await useService("TokenService").issue(s)).accessToken;
  }

  @test
  async bearerWins() {
    const ctx = await this.contextWith({ authorization: `Bearer ${await this.token()}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.strictEqual(loaded.userId, "u1");
    assert.ok(loaded.stateless);
    assert.ok(loaded.isLogged());
    assert.deepStrictEqual(loaded.amr, ["pwd"]);
  }

  @test
  async scopedVerificationRoundTripsThroughCookiesAndBearer() {
    const session = new Session();
    session.login("u1", "a@b.c:email");
    session.mfaVerifications = {
      "User.Mfa.Verify": { owner: "Webda/User/u1", method: "totp", verifiedAt: 123 },
      "User.PaymentMfa.Verify": { owner: "Webda/User/u1", method: "totp", verifiedAt: 456 }
    };
    const manager = useService("SessionManager");
    const ctx = await this.newContext();
    await manager.save(ctx, session);
    const cookieSession = await manager.load(await this.withCookies(ctx));
    assert.deepStrictEqual(cookieSession.mfaVerifications, session.mfaVerifications);
    const token = (await useService("TokenService").issue(session)).accessToken;
    const bearer = await manager.load(await this.contextWith({ authorization: `Bearer ${token}` }));
    assert.deepStrictEqual(bearer.mfaVerifications, session.mfaVerifications);
  }

  @test
  async lowercaseScheme() {
    const ctx = await this.contextWith({ authorization: `bearer ${await this.token()}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(loaded.isLogged());
  }

  @test
  async invalidBearerIsAnonymous() {
    const ctx = await this.contextWith({ authorization: "Bearer nope" });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.isLogged());
  }

  @test
  async invalidBearerDoesNotFallBackToCookie() {
    const manager = useService("SessionManager");
    const first = await this.newContext();
    const s = new Session();
    s.login("u1", "x:email");
    await manager.save(first, s);
    const ctx = await this.contextWith({ authorization: "Bearer nope" });
    const sent: any = first.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    // Sanity: the same cookie alone does authenticate
    delete ctx.getHttpContext().headers["authorization"];
    assert.ok((await manager.load(ctx)).isLogged());
    ctx.getHttpContext().headers["authorization"] = "Bearer nope";
    const loaded = await manager.load(ctx);
    assert.ok(!loaded.isLogged());
  }

  @test
  async nonBearerSchemeIgnored() {
    const ctx = await this.contextWith({ authorization: "Basic abc" });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.stateless);
    assert.ok(!loaded.isLogged());
  }

  @test
  async statelessNotSaved() {
    const manager = useService("SessionManager");
    const saveAndCount = async (stateless: boolean) => {
      const ctx = await this.contextWith({});
      const s = new Session();
      s.stateless = stateless;
      s.login("u1", "x:email");
      await manager.save(ctx, s);
      // SecureCookie.save is async and not awaited by save()
      await new Promise(resolve => setTimeout(resolve, 20));
      return Object.keys(ctx.getResponseCookies() ?? {}).length;
    };
    assert.ok((await saveAndCount(false)) > 0, "control: regular session must set a cookie");
    assert.strictEqual(await saveAndCount(true), 0);
  }

  @test
  async bareBearerIsAnonymous() {
    const manager = useService("SessionManager");
    const first = await this.newContext();
    const s = new Session();
    s.login("u1", "x:email");
    await manager.save(first, s);
    await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = await this.contextWith({ authorization: "Bearer" });
    const sent: any = first.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    const loaded = await manager.load(ctx);
    assert.ok(!loaded.isLogged());
    assert.ok(loaded.stateless);
  }

  /**
   * Copy the cookies set on a context into a new one
   * @param from - context the session was saved on
   * @returns a context presenting those cookies
   */
  async withCookies(from: any) {
    await new Promise(resolve => setTimeout(resolve, 20));
    const ctx = await this.contextWith({});
    const sent: any = from.getResponseCookies();
    ctx.getHttpContext().cookies = {};
    for (const name of Object.keys(sent)) {
      ctx.getHttpContext().cookies[name] = sent[name].value;
    }
    return ctx;
  }

  @test
  async passwordChangeEndsOlderSessions() {
    // As registered by the Authentication service
    registerUserResolver({ resolve: async id => (useModel("User") as any).ref(id).get() });
    try {
      await this.checkPasswordChangeEndsOlderSessions();
    } finally {
      registerUserResolver(undefined);
    }
  }

  async checkPasswordChangeEndsOlderSessions() {
    const manager = useService("SessionManager");
    const user: any = await useModel("User").create({ email: "pw1@x.com" } as any);
    const uid = user.getUUID();
    user.password.setHash("$2b$10$hash", 1000);
    await user.save();
    const first = await this.newContext();
    const s = new Session();
    s.login(uid, "pw1@x.com:email");
    s.authAt = 2000;
    await manager.save(first, s);
    const token = (await useService("TokenService").issue(s)).accessToken;
    // Authenticated after the last change: kept
    assert.ok((await manager.load(await this.withCookies(first))).isLogged());
    assert.ok((await manager.load(await this.contextWith({ authorization: `Bearer ${token}` }))).isLogged());
    // Password changed after the authentication: anonymous
    user.password.setHash("$2b$10$other", 3000);
    await user.save();
    assert.ok(!(await manager.load(await this.withCookies(first))).isLogged());
    assert.ok(!(await manager.load(await this.contextWith({ authorization: `Bearer ${token}` }))).isLogged());
    // A session without authAt is not checked
    const legacy = await this.newContext();
    const l = new Session();
    l.login(uid, "pw1@x.com:email");
    await manager.save(legacy, l);
    assert.ok((await manager.load(await this.withCookies(legacy))).isLogged());
  }

  @test
  async pendingMfaToken() {
    const token = await useCrypto().jwtSign({ sub: "u1", ident: "x:email", amr: ["pwd"], fam: "f", mfa: "pending" }, {
      audience: "webda-access",
      expiresIn: 60
    } as any);
    const ctx = await this.contextWith({ authorization: `Bearer ${token}` });
    const loaded = await useService("SessionManager").load(ctx);
    assert.ok(!loaded.isLogged());
    assert.ok(loaded.isPending());
  }

  /**
   * Context presenting a client certificate
   * @param verified - whether the certificate was verified
   * @param headers - request headers
   * @returns the context
   */
  async withCertificate(verified: boolean, headers: Record<string, string> = {}) {
    const ctx = await this.contextWith(headers);
    ctx.getHttpContext().setClientCertificate({ subject: { CN: "alice" }, verified, source: "tls" } as any);
    return ctx;
  }

  @test
  async certificatePrecedence() {
    const manager = useService("SessionManager");
    const seen: any[] = [];
    registerCertificateResolver({
      resolveCertificate: async (cert, context) => {
        seen.push({ cert, context });
        return cert.subject.CN === "alice" ? { userId: "alice", identId: "fp:certificate", roles: ["ops"] } : undefined;
      }
    });
    try {
      // Certificate session: stateless, provider certificate, amr mtls
      const ctx = await this.withCertificate(true);
      const loaded = await manager.load(ctx);
      assert.strictEqual(loaded.userId, "alice");
      assert.strictEqual(loaded.identUsed, "fp:certificate");
      assert.ok(loaded.stateless);
      assert.ok(loaded.isLogged());
      assert.strictEqual(loaded.provider, "certificate");
      assert.deepStrictEqual(loaded.amr, ["mtls"]);
      assert.deepStrictEqual(loaded.roles, ["ops"]);
      assert.strictEqual(seen[0].context, ctx);

      // Bearer wins over the certificate
      const bearer = await manager.load(
        await this.withCertificate(true, { authorization: `Bearer ${await this.token()}` })
      );
      assert.strictEqual(bearer.userId, "u1");
      assert.strictEqual(seen.length, 1);

      // Certificate wins over the cookie
      const first = await this.newContext();
      const s = new Session();
      s.login("u1", "x:email");
      await manager.save(first, s);
      const withCookie = await this.withCookies(first);
      assert.strictEqual((await manager.load(withCookie)).userId, "u1");
      withCookie.getHttpContext().setClientCertificate({ subject: { CN: "alice" }, verified: true } as any);
      assert.strictEqual((await manager.load(withCookie)).userId, "alice");
      // An unknown certificate falls back to the cookie
      withCookie.getHttpContext().setClientCertificate({ subject: { CN: "bob" }, verified: true } as any);
      assert.strictEqual((await manager.load(withCookie)).userId, "u1");
      // An unverified certificate is never resolved
      const count = seen.length;
      withCookie.getHttpContext().setClientCertificate({ subject: { CN: "alice" }, verified: false } as any);
      assert.strictEqual((await manager.load(withCookie)).userId, "u1");
      assert.strictEqual(seen.length, count);
    } finally {
      registerCertificateResolver(undefined);
    }
  }

  @test
  async certificateAsRequestFactor() {
    const manager = useService("SessionManager");
    registerCertificateResolver({
      mode: "factor",
      resolveCertificate: async cert =>
        cert.subject.CN === "alice"
          ? { userId: "u1", identId: "fp:certificate" }
          : { userId: "other", identId: "other:certificate" }
    });
    try {
      const alone = await manager.load(await this.withCertificate(true));
      assert.ok(!alone.isLogged());
      assert.deepStrictEqual(alone.amr, undefined);
      assert.strictEqual(await manager.loadFromCertificate(await this.withCertificate(true)), undefined);

      const first = await this.newContext();
      const original = new Session();
      original.login("u1", "x:email", { provider: "email", amr: ["pwd"], mfa: "verified" });
      await manager.save(first, original);
      const ctx = await this.withCookies(first);
      ctx.getHttpContext().setClientCertificate({ subject: { CN: "alice" }, verified: true } as any);
      const loaded = await manager.load(ctx);
      assert.strictEqual(loaded.userId, "u1");
      assert.strictEqual(loaded.provider, "email");
      assert.strictEqual(loaded.mfa, "verified");
      assert.deepStrictEqual(loaded.amr, ["pwd", "mtls"]);
      assert.deepStrictEqual(loaded.getPersistentAmr(), ["pwd"]);

      await manager.save(ctx, loaded);
      const next = await this.withCookies(ctx);
      assert.deepStrictEqual((await manager.load(next)).amr, ["pwd"]);
      next.getHttpContext().setClientCertificate({ subject: { CN: "bob" }, verified: true } as any);
      assert.deepStrictEqual((await manager.load(next)).amr, ["pwd"]);

      const bearer = await manager.load(
        await this.withCertificate(true, { authorization: `Bearer ${await this.token()}` })
      );
      assert.deepStrictEqual(bearer.amr, ["pwd", "mtls"]);
      const unverified = await manager.load(
        await this.withCertificate(false, { authorization: `Bearer ${await this.token()}` })
      );
      assert.deepStrictEqual(unverified.amr, ["pwd"]);
      const invalid = await manager.load(await this.withCertificate(true, { authorization: "Bearer invalid" }));
      assert.ok(!invalid.isLogged());
      assert.ok(!invalid.amr?.includes("mtls"));
      const pending = new Session();
      pending.login("u1", "x:email", { provider: "email", amr: ["pwd"], mfa: "pending" });
      await manager.addCertificateFactor(await this.withCertificate(true), pending);
      assert.deepStrictEqual(pending.amr, ["pwd", "mtls"]);
      assert.ok(!pending.isLogged());
    } finally {
      registerCertificateResolver(undefined);
    }
  }

  @test
  async certificateWithoutResolverOrFailing() {
    const manager = useService("SessionManager");
    // No resolver: a certificate authenticates nobody
    const loaded = await manager.load(await this.withCertificate(true));
    assert.ok(!loaded.isLogged());
    assert.ok(!loaded.stateless);
    registerCertificateResolver({
      resolveCertificate: async () => {
        throw new Error("store down");
      }
    });
    try {
      assert.ok(!(await manager.load(await this.withCertificate(true))).isLogged());
    } finally {
      registerCertificateResolver(undefined);
    }
  }
}

@suite
class BearerResolverTest extends WebdaApplicationTest {
  unregister: (() => void)[] = [];

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/RefreshToken", "Webda/RevokedAccess", "Webda/User"] }
      }
    };
  }

  async afterEach() {
    this.unregister.forEach(fn => fn());
    this.unregister = [];
    await super.afterEach();
  }

  /**
   * Register a resolver accepting the "app-token" token
   * @param calls - receives the tokens seen
   * @returns the resolver
   */
  register(calls: string[] = []): BearerTokenResolver {
    const resolver: BearerTokenResolver = {
      resolveBearer: async token => {
        calls.push(token);
        if (token !== "app-token") return undefined;
        const s = new Session();
        s.loginApplication({ principal: "orders", issuer: "https://orders.example.com", subject: "app:orders" });
        return s;
      }
    };
    this.unregister.push(registerBearerResolver(resolver));
    return resolver;
  }

  async load(token: string) {
    const ctx = await this.newContext();
    ctx.getHttpContext().headers["authorization"] = `Bearer ${token}`;
    return useService("SessionManager").load(ctx);
  }

  @test
  async resolverAuthenticatesApplication() {
    this.register();
    const loaded = await this.load("app-token");
    assert.ok(loaded.isApplication());
    assert.ok(loaded.stateless);
    assert.strictEqual(loaded.application.principal, "orders");
    const ctx = await this.newContext();
    ctx.getHttpContext().headers["authorization"] = "Bearer app-token";
    ctx.setSession(loaded);
    assert.strictEqual(ctx.getCurrentUserId(), undefined);
    assert.strictEqual(await ctx.getCurrentUser(), undefined);
    // Owned objects refuse an application, even one whose principal equals the owner id
    const owned = { public: false, getOwner: () => "orders" };
    for (const action of ["create", "get", "update", "delete"]) {
      assert.strictEqual(
        await OwnerModel.prototype.canAct.call(owned, ctx, action),
        "You need to be logged in to access this object"
      );
    }
  }

  @test
  async accessTokenWinsOverResolvers() {
    const calls: string[] = [];
    this.register(calls);
    const s = new Session();
    s.login("u1", "a@b.c:email");
    const token = (await useService("TokenService").issue(s)).accessToken;
    const loaded = await this.load(token);
    assert.strictEqual(loaded.userId, "u1");
    assert.deepStrictEqual(calls, []);
  }

  @test
  async unknownTokenStaysAnonymous() {
    const calls: string[] = [];
    this.register(calls);
    const loaded = await this.load("nope");
    assert.ok(!loaded.isLogged());
    assert.ok(!loaded.isApplication());
    assert.deepStrictEqual(calls, ["nope"]);
  }

  @test
  async failingResolverIsSkipped() {
    this.unregister.push(
      registerBearerResolver({
        resolveBearer: async () => {
          throw new Error("boom");
        }
      })
    );
    this.register();
    assert.ok((await this.load("app-token")).isApplication());
  }

  @test
  async registerOnceAndUnregister() {
    const before = useBearerResolvers().length;
    const resolver = this.register();
    registerBearerResolver(resolver);
    assert.strictEqual(useBearerResolvers().length, before + 1);
    this.unregister.pop()();
    assert.strictEqual(useBearerResolvers().length, before);
    assert.ok(!(await this.load("app-token")).isApplication());
  }
}
