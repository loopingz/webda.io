import { suite, test } from "@webda/test";
import * as assert from "assert";
import { X509Certificate } from "node:crypto";
import { afterAll } from "vitest";
import { type ClientCertificate, Ident, toClientCertificate, useCertificateResolver, useService } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { createTestCertificates } from "@webda/core/lib/test/certificates.js";
import { AuthTest } from "../test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "../test/stubprovider.js";
import type { Authentication } from "../authentication.service.js";
import type { CertificateProvider } from "./certificate.service.js";

const certs = createTestCertificates();
afterAll(() => certs.cleanup());

/**
 * @param pem - PEM certificate
 * @param verified - whether the chain was verified
 * @returns the client certificate
 */
const cert = (pem: string, verified = true): ClientCertificate =>
  toClientCertificate(new X509Certificate(pem), verified, "proxy");

@suite
class CertificateProviderTest extends AuthTest {
  auth: Authentication;
  provider: CertificateProvider;
  alice: ClientCertificate;
  bob: ClientCertificate;

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        CertificateProvider: { type: "Webda/CertificateProvider" },
        ...stubProvidersConfig("google")
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    addStubProviders(app, "google");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.auth.getParameters().registration = true;
    this.provider = useService("CertificateProvider" as any);
    const params = this.provider.getParameters();
    params.identityField = "fingerprint256";
    params.mode = "login";
    params.autoRegister = false;
    params.cacheTtl = 60000;
    delete params.allowedIssuers;
    delete params.allowedSubjects;
    delete params.roles;
    (this.provider as any).cache.clear();
    this.alice = cert(certs.client.pem);
    this.bob = cert(certs.bob.pem);
  }

  /**
   * @param clientCert - certificate presented with the request
   * @returns a context presenting it
   */
  async withCert(clientCert?: ClientCertificate) {
    const ctx = await this.ctx();
    ctx.getHttpContext().setClientCertificate(clientCert);
    return ctx;
  }

  /**
   * Log a new user in through the google stub provider
   * @param uid - google uid
   * @returns the logged context
   */
  async logged(uid: string, clientCert?: ClientCertificate) {
    const ctx = await this.withCert(clientCert);
    await this.inContext(ctx, () =>
      this.auth.complete({ provider: "google", providerUid: uid, emailVerified: false, amr: ["oauth"] })
    );
    return ctx;
  }

  @test
  publicInfo() {
    assert.deepStrictEqual(this.provider.getPublicInfo(), { name: "certificate", type: "certificate" });
    assert.ok(this.auth.getProviders().some(p => p.type === "certificate"));
    assert.strictEqual(useCertificateResolver(), this.provider);
  }

  @test
  identityFields() {
    const params = this.provider.getParameters();
    const fingerprint = this.alice.fingerprint256.replace(/:/g, "").toLowerCase();
    const identity = this.provider.getIdentity(this.alice)!;
    assert.strictEqual(identity.providerUid, fingerprint);
    assert.strictEqual(identity.provider, "certificate");
    assert.strictEqual(identity.email, "alice@example.com");
    assert.strictEqual(identity.emailVerified, false);
    assert.deepStrictEqual(identity.amr, ["mtls"]);
    assert.strictEqual(identity.profile.subject.CN, "alice");
    params.identityField = "subject.CN";
    assert.strictEqual(this.provider.getIdentity(this.alice)?.providerUid, "alice");
    params.identityField = "san.email";
    assert.strictEqual(this.provider.getIdentity(this.alice)?.providerUid, "alice@example.com");
    assert.strictEqual(this.provider.getIdentity(this.bob), undefined);
    params.identityField = "san.uri";
    // Ident uids cannot contain ":"
    assert.strictEqual(this.provider.getIdentity(this.alice)?.providerUid, "spiffe%3A//example.com/alice");
    assert.ok(Ident.key(this.provider.getIdentity(this.alice)!.providerUid, "certificate"));
    assert.strictEqual(this.provider.getIdentity(this.bob), undefined);
  }

  @test
  acceptance() {
    const params = this.provider.getParameters();
    assert.ok(this.provider.isAccepted(this.alice));
    params.allowedIssuers = ["Webda Test CA"];
    assert.ok(this.provider.isAccepted(this.alice));
    params.allowedIssuers = ["O=Webda, CN=Webda Test CA"];
    assert.ok(this.provider.isAccepted(this.alice));
    assert.ok(!this.provider.isAccepted(cert(certs.untrusted.pem)));
    params.allowedIssuers = ["Other"];
    assert.ok(!this.provider.isAccepted(this.alice));
    delete params.allowedIssuers;
    params.allowedSubjects = ["^O=Webda, .*CN=alice$"];
    assert.ok(this.provider.isAccepted(this.alice));
    assert.ok(!this.provider.isAccepted(this.bob));
    delete params.allowedSubjects;
    assert.ok(!this.provider.isAccepted({ ...this.alice, validTo: new Date(Date.now() - 1000) }));
    assert.ok(!this.provider.isAccepted({ ...this.alice, validFrom: new Date(Date.now() + 60000) }));
  }

  @test
  roles() {
    this.provider.getParameters().roles = {
      "OU=ops": ["operator"],
      "CN=alice": ["alice", "operator"],
      "OU=none": ["nobody"],
      invalid: ["ignored"]
    };
    assert.deepStrictEqual(this.provider.getRoles(this.alice), ["operator", "alice"]);
    assert.strictEqual(this.provider.getRoles(this.bob), undefined);
  }

  @test
  async unknownCertificateWithoutAutoRegister() {
    const ctx = await this.withCert(this.alice);
    assert.strictEqual(await this.provider.resolveCertificate(this.alice, ctx), undefined);
    assert.strictEqual(await this.provider.resolveCertificate(cert(certs.client.pem, false), ctx), undefined);
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, 0);
  }

  @test
  async autoRegister() {
    const params = this.provider.getParameters();
    params.autoRegister = true;
    params.roles = { "OU=dev": ["developer"] };
    const registered: any[] = [];
    this.auth.on("Authentication.Register" as any, (evt: any) => {
      registered.push(evt);
    });
    const ctx = await this.withCert(this.alice);
    const before = ctx.getSession();
    const first = await this.provider.resolveCertificate(this.alice, ctx);
    assert.ok(first?.userId);
    assert.deepStrictEqual(first.roles, ["developer"]);
    // The request session is left untouched
    assert.strictEqual(ctx.getSession(), before);
    assert.ok(!before.isLogged());
    assert.strictEqual(registered.length, 1);
    const ident = await this.auth.getIdentModel().ref(first.identId).get();
    assert.strictEqual(ident.provider, "certificate");
    assert.strictEqual(ident.getUser().toString(), first.userId);
    // Known now: no new registration, even without the cache
    (this.provider as any).cache.clear();
    const second = await this.provider.resolveCertificate(this.alice, await this.withCert(this.alice));
    assert.strictEqual(second?.userId, first.userId);
    assert.strictEqual(registered.length, 1);
    // Registration disabled: refused
    this.auth.getParameters().registration = false;
    assert.strictEqual(await this.provider.resolveCertificate(this.bob, await this.withCert(this.bob)), undefined);
  }

  @test
  async sessionFromCertificate() {
    this.provider.getParameters().autoRegister = true;
    const ctx = await this.withCert(this.alice);
    const session = await useService("SessionManager").load(ctx);
    assert.ok(session.isLogged());
    assert.ok(session.stateless);
    assert.strictEqual(session.provider, "certificate");
    assert.deepStrictEqual(session.amr, ["mtls"]);
    // Unverified: anonymous
    const anonymous = await useService("SessionManager").load(await this.withCert(cert(certs.client.pem, false)));
    assert.ok(!anonymous.isLogged());
  }

  @test
  async certificateAsExtraFactor() {
    const params = this.provider.getParameters();
    params.mode = "factor";
    params.autoRegister = true;
    const manager = useService("SessionManager");

    const usersBefore = (await this.auth.getUserModel().query("")).results.length;
    const alone = await manager.load(await this.withCert(this.bob));
    assert.ok(!alone.isLogged());
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, usersBefore);

    const ctx = await this.logged("factor-user", this.bob);
    const session = ctx.getSession();
    const userId = session.userId;
    const result = await this.inContext(ctx, () => this.provider.link());
    assert.deepStrictEqual(result, { status: "linked" });
    assert.strictEqual(ctx.getSession(), session);
    assert.strictEqual(session.userId, userId);
    assert.strictEqual(session.provider, "google");
    assert.deepStrictEqual(session.amr, ["oauth"]);
    assert.strictEqual((await this.provider.resolveCertificate(this.bob, ctx))?.userId, userId);

    await manager.addCertificateFactor(ctx, session);
    assert.deepStrictEqual(session.amr, ["oauth", "mtls"]);
    assert.deepStrictEqual(session.getPersistentAmr(), ["oauth"]);
    const tokenService = useService("TokenService");
    const issued = await this.inContext(ctx, () => tokenService.issue(session));
    assert.deepStrictEqual((await tokenService.verifyAccess(issued.accessToken))?.amr, ["oauth"]);
    const other = await this.logged("other-user", this.bob);
    await manager.addCertificateFactor(other, other.getSession());
    assert.deepStrictEqual(other.getSession().amr, ["oauth"]);
    await assert.rejects(() => this.inContext(other, () => this.provider.link()), { code: "IDENT_LINKED_ELSEWHERE" });
  }

  @test
  async cache() {
    this.provider.getParameters().autoRegister = true;
    const ctx = await this.withCert(this.alice);
    const { userId, identId } = (await this.provider.resolveCertificate(this.alice, ctx))!;
    // Remembered: a deleted ident still resolves until cacheTtl
    await this.auth.getIdentModel().ref(identId).delete();
    this.provider.getParameters().autoRegister = false;
    assert.strictEqual((await this.provider.resolveCertificate(this.alice, ctx))?.userId, userId);
    // Unlinked through Authentication: forgotten at once
    const providerUid = this.provider.getIdentity(this.alice)!.providerUid;
    await this.auth.emit("Authentication.Unlinked" as any, { ident: { provider: "certificate", providerUid } } as any);
    assert.strictEqual(await this.provider.resolveCertificate(this.alice, ctx), undefined);
    // cacheTtl 0 disables the cache
    this.provider.getParameters().cacheTtl = 0;
    this.provider.getParameters().autoRegister = true;
    await this.provider.resolveCertificate(this.bob, await this.withCert(this.bob));
    assert.strictEqual((this.provider as any).cache.size, 0);
  }

  @test
  async linkFlow() {
    const forbidden = { code: "FORBIDDEN" };
    const anonymous = await this.withCert(this.alice);
    await assert.rejects(() => this.inContext(anonymous, () => this.provider.link()), { code: "UNAUTHORIZED" });
    // Logged without certificate, with an unverified one, with one lacking the identity field
    const noCert = await this.logged("g1");
    await assert.rejects(() => this.inContext(noCert, () => this.provider.link()), forbidden);
    const unverified = await this.logged("g2", cert(certs.client.pem, false));
    await assert.rejects(() => this.inContext(unverified, () => this.provider.link()), forbidden);
    this.provider.getParameters().identityField = "san.email";
    const noEmail = await this.logged("g3", this.bob);
    await assert.rejects(() => this.inContext(noEmail, () => this.provider.link()), forbidden);
    this.provider.getParameters().identityField = "fingerprint256";
    this.provider.getParameters().allowedSubjects = ["CN=nobody"];
    const refused = await this.logged("g4", this.alice);
    await assert.rejects(() => this.inContext(refused, () => this.provider.link()), forbidden);
    delete this.provider.getParameters().allowedSubjects;
    // Linked to the logged user, the certificate then authenticates them
    const ctx = await this.logged("g5", this.alice);
    const userId = ctx.getCurrentUserId();
    const result: any = await this.inContext(ctx, () => this.provider.link());
    assert.strictEqual(result.status, "ok");
    const resolved = await this.provider.resolveCertificate(this.alice, await this.withCert(this.alice));
    assert.strictEqual(resolved?.userId, userId);
    // Another user cannot take it
    const other = await this.logged("g6", this.alice);
    await assert.rejects(() => this.inContext(other, () => this.provider.link()), { code: "IDENT_LINKED_ELSEWHERE" });
  }

  @test
  async stopUnregisters() {
    assert.strictEqual(useCertificateResolver(), this.provider);
    await this.provider.stop();
    assert.strictEqual(useCertificateResolver(), undefined);
    this.provider.resolve();
    assert.strictEqual(useCertificateResolver(), this.provider);
  }
}
