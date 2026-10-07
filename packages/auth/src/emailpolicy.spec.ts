import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, Service, useService } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "./test/authtest.js";
import { Authentication } from "./authentication.service.js";
import { applyEmailPolicy, emailDomain } from "./provider.js";
import { AccountExists, EmailDomainNotAllowed } from "./errors.js";

const rejectsWith = (fn: () => Promise<unknown> | unknown, cls: { name: string }) =>
  assert.rejects(async () => fn(), { code: cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() });

class PolicyProvider extends Service {
  readonly providerName = "google";
  getPublicInfo() {
    return { name: "google", type: "oauth" as const, startUrl: "/auth/google" };
  }
}

const google = (uid: string, email?: string, emailVerified = true) => ({
  provider: "google",
  providerUid: uid,
  email,
  emailVerified,
  amr: ["oauth"],
  profile: { name: "G" }
});

@suite
class EmailPolicyTest extends AuthTest {
  auth: Authentication;
  provider: any;

  /** @param policy - parameters to expose on the provider service */
  setPolicy(policy: any) {
    this.provider.parameters = Object.assign({}, this.provider.getParameters(), policy);
  }

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: { type: "Webda/MemoryStore", models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken"] },
        Authentication: { type: "Webda/Authentication" },
        google: { type: "WebdaTest/PolicyProvider" }
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.addModda("WebdaTest/PolicyProvider", PolicyProvider);
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.auth.getParameters().linking = "verified";
    this.auth.getParameters().registration = true;
    this.provider = useService("google") as any;
    this.setPolicy({ allowedEmailDomains: undefined, trustEmailVerification: undefined });
  }

  async login(identity: any) {
    const ctx = await this.ctx();
    await this.inContext(ctx, () => this.auth.complete(identity));
    return ctx;
  }

  async counts() {
    return [(await this.auth.getUserModel().query("")).results.length, (await Ident.query("")).results.length];
  }

  async emailUser(email: string) {
    const user = await this.auth.getUserModel().create({ email, displayName: "E" } as any);
    const ident = new Ident({ ...Ident.key(email, "email"), email, verifiedAt: new Date() } as any);
    ident.setUser(user.getUUID());
    await Ident.getRepository().create(ident);
    return user;
  }

  @test
  domainHelper() {
    assert.strictEqual(emailDomain("A@Sub.Example.COM"), "sub.example.com");
    assert.strictEqual(emailDomain("nope"), undefined);
  }

  @test
  pureApply() {
    const id = google("1", "a@x.com");
    const copy = JSON.parse(JSON.stringify(id));
    assert.strictEqual(applyEmailPolicy(id, undefined), id);
    const out = applyEmailPolicy(id, { trustEmailVerification: false });
    assert.strictEqual(out.emailVerified, false);
    assert.deepStrictEqual(id, copy);
  }

  @test
  async noPolicyUnchanged() {
    const id = google("1", "a@x.com");
    assert.deepStrictEqual(applyEmailPolicy(id, undefined), google("1", "a@x.com"));
    await this.login(id);
    assert.ok((await Ident.ref(Ident.key("1", "google")).get()).isVerified());
  }

  @test
  async allowedDomains() {
    this.setPolicy({ allowedEmailDomains: [" Company.com "] });
    await this.login(google("a1", "bob@company.com"));
    const before = await this.counts();
    for (const email of ["bob@other.com", "bob@evil-company.com", "bob@sub.company.com", undefined]) {
      await rejectsWith(() => this.login(google("a2", email)), EmailDomainNotAllowed);
    }
    assert.deepStrictEqual(await this.counts(), before);
    assert.ok(!(await Ident.ref(Ident.key("a2", "google")).exists()));
  }

  @test
  async trustFalse() {
    this.setPolicy({ trustEmailVerification: false });
    const owner = await this.emailUser("u@x.com");
    // the unverified claim cannot link to the verified owner (Task 16 truth table: verified/false/true = conflict)
    await rejectsWith(() => this.login(google("t1", "u@x.com")), AccountExists);
    assert.ok(!(await Ident.ref(Ident.key("t1", "google")).exists()));
    assert.strictEqual((await Ident.ref(Ident.key("u@x.com", "email")).get()).getUser().toString(), owner.getUUID());
    await this.login(google("t2", "n@x.com"));
    assert.ok(!(await Ident.ref(Ident.key("t2", "google")).get()).isVerified());
    assert.ok(!(await Ident.ref(Ident.key("n@x.com", "email")).exists()));
  }

  @test
  async trustList() {
    this.setPolicy({ trustEmailVerification: ["company.com"] });
    const owner = await this.emailUser("u@company.com");
    const ctx = await this.login(google("l1", "u@company.com"));
    assert.strictEqual(ctx.getCurrentUserId(), owner.getUUID());
    const other = await this.emailUser("u@other.com");
    await rejectsWith(() => this.login(google("l2", "u@other.com")), AccountExists);
    assert.ok(!(await Ident.ref(Ident.key("l2", "google")).exists()));
    // unverified claim of an unknown address registers without a verified ident
    await this.login(google("l3", "new@other.com"));
    assert.ok(!(await Ident.ref(Ident.key("l3", "google")).get()).isVerified());
    assert.ok(!(await Ident.ref(Ident.key("new@other.com", "email")).exists()));
    const created = await Ident.ref(Ident.key("l3", "google")).get();
    assert.notStrictEqual(created.getUser().toString(), owner.getUUID());
    assert.notStrictEqual(created.getUser().toString(), other.getUUID());
  }

  @test
  async allowListRequiresTrustedVerifiedEmail() {
    const before = await this.counts();
    this.setPolicy({ allowedEmailDomains: ["company.com"] });
    await rejectsWith(() => this.login(google("v1", "x@company.com", false)), EmailDomainNotAllowed);
    this.setPolicy({ allowedEmailDomains: ["company.com"], trustEmailVerification: false });
    await rejectsWith(() => this.login(google("v2", "x@company.com", true)), EmailDomainNotAllowed);
    this.setPolicy({ allowedEmailDomains: ["company.com"], trustEmailVerification: ["other.com"] });
    await rejectsWith(() => this.login(google("v3", "x@company.com", true)), EmailDomainNotAllowed);
    this.setPolicy({ allowedEmailDomains: [] });
    await rejectsWith(() => this.login(google("v4", "x@company.com", true)), EmailDomainNotAllowed);
    assert.deepStrictEqual(await this.counts(), before);
    this.setPolicy({ allowedEmailDomains: ["company.com"], trustEmailVerification: ["company.com"] });
    await this.login(google("v5", "x@company.com", true));
    this.setPolicy({ allowedEmailDomains: ["company.com"] });
    await this.login(google("v6", "y@company.com", true));
  }

  @test
  async invalidPolicyTypes() {
    for (const bad of [
      { allowedEmailDomains: "company.com" },
      { trustEmailVerification: "yes" },
      { allowedEmailDomains: [1] }
    ]) {
      this.setPolicy({ allowedEmailDomains: undefined, trustEmailVerification: undefined, ...bad });
      await assert.rejects(
        () => this.login(google("w1", "x@company.com")),
        /Invalid email policy for provider 'google'/
      );
    }
  }
}
