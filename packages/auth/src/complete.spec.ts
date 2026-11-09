import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, useService } from "@webda/core";
import { TestApplication } from "@webda/core/lib/test/objects.js";
import { AuthTest } from "./test/authtest.js";
import { addStubProviders, stubProvidersConfig } from "./test/stubprovider.js";
import { Authentication } from "./authentication.service.js";
import { AccountExists, IdentLinkedElsewhere, RegistrationDisabled } from "./errors.js";

/**
 * The service is loaded from the compiled lib while the spec imports src: compare error classes by code
 * @param fn - code expected to throw
 * @param cls - expected error class
 * @param message - assertion message
 */
const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }, message?: string) =>
  assert.rejects(fn, { code: cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase() }, message);

const google = (uid: string, email?: string, emailVerified = true) => ({
  provider: "google",
  providerUid: uid,
  email,
  emailVerified,
  amr: ["oauth"],
  profile: { name: "G" }
});

@suite
class CompleteTest extends AuthTest {
  auth: Authentication;
  events: string[] = [];

  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        AuthStore: {
          type: "Webda/MemoryStore",
          models: ["Webda/User", "Webda/Ident", "Webda/RefreshToken", "Webda/RevokedAccess"]
        },
        Authentication: { type: "Webda/Authentication" },
        ...stubProvidersConfig("google", "email")
      }
    };
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    addStubProviders(app, "google", "email");
  }

  async beforeEach() {
    await super.beforeEach();
    this.auth = useService("Authentication" as any);
    this.auth.getParameters().linking = "verified";
    this.auth.getParameters().registration = true;
    // drop any per-test mfaMethods override
    delete (this.auth as any).mfaMethods;
    this.events = [];
    for (const e of ["Authentication.Login", "Authentication.Register", "Authentication.Linked"]) {
      this.auth.on(e as any, () => {
        this.events.push(e);
      });
    }
  }

  async emailUser(email: string, verified: boolean) {
    const user = await this.auth.getUserModel().create({ email, displayName: "E" } as any);
    const ident = new Ident({
      ...Ident.key(email, "email"),
      email,
      verifiedAt: verified ? new Date() : undefined
    } as any);
    ident.setUser(user.getUUID());
    await Ident.getRepository().create(ident);
    return user;
  }

  @test
  async registersNewUser() {
    const ctx = await this.ctx();
    const res: any = await this.inContext(ctx, () => this.auth.complete(google("1", "new@x.com")));
    assert.strictEqual(res.status, "ok");
    assert.ok(res.accessToken && res.refreshToken);
    const json = JSON.stringify(res);
    assert.ok(!/"__/.test(json), "no __ keys");
    assert.ok(!/password/i.test(json), "no password");
    assert.ok(ctx.getSession().isLogged());
    const ident = await Ident.ref(Ident.key("1", "google")).get();
    assert.strictEqual(ident.getUser().toString(), ctx.getCurrentUserId());
    assert.ok(ident.isVerified());
    // email ident created as well, verified because provider asserted it
    assert.ok((await Ident.ref(Ident.key("new@x.com", "email")).get()).isVerified());
    assert.deepStrictEqual(this.events, ["Authentication.Register", "Authentication.Login"]);
  }

  @test
  async knownIdentLogsIn() {
    const ctx1 = await this.ctx();
    await this.inContext(ctx1, () => this.auth.complete(google("1")));
    const ctx2 = await this.ctx();
    await this.inContext(ctx2, () => this.auth.complete(google("1")));
    assert.strictEqual(ctx2.getCurrentUserId(), ctx1.getCurrentUserId());
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, 1);
  }

  @test
  async linkingTruthTable() {
    // [policy, providerVerified, emailIdentVerified, expected]
    const table: [string, boolean, boolean, "link" | "conflict" | "new"][] = [
      ["never", true, true, "conflict"],
      ["verified", true, true, "link"],
      ["verified", false, true, "conflict"],
      ["verified", true, false, "new"],
      ["never", true, false, "new"],
      ["always", false, false, "link"]
    ];
    let i = 0;
    for (const [policy, providerVerified, identVerified, expected] of table) {
      i++;
      const email = `u${i}@x.com`;
      const user = await this.emailUser(email, identVerified);
      this.auth.getParameters().linking = policy as any;
      const ctx = await this.ctx();
      const run = () => this.inContext(ctx, () => this.auth.complete(google(`g${i}`, email, providerVerified)));
      if (expected === "conflict") {
        await rejectsWith(run, AccountExists, `${policy}/${providerVerified}/${identVerified}`);
        assert.ok(!(await Ident.ref(Ident.key(`g${i}`, "google")).exists()));
      } else if (expected === "new") {
        await run();
        assert.notStrictEqual(ctx.getCurrentUserId(), user.getUUID(), `${policy}/${providerVerified}/${identVerified}`);
        // the unverified email ident is neither replaced nor claimed
        assert.strictEqual((await Ident.ref(Ident.key(email, "email")).get()).getUser().toString(), user.getUUID());
      } else {
        await run();
        assert.strictEqual(ctx.getCurrentUserId(), user.getUUID(), `${policy}/${providerVerified}/${identVerified}`);
      }
    }
  }

  @test
  async loggedInLinksExplicitly() {
    const user = await this.emailUser("me@x.com", false);
    this.auth.getParameters().linking = "never";
    const ctx = await this.ctx();
    ctx.getSession().login(user.getUUID(), "me@x.com:email");
    await this.inContext(ctx, () => this.auth.complete(google("9", "other@x.com", false)));
    assert.strictEqual((await Ident.ref(Ident.key("9", "google")).get()).getUser().toString(), user.getUUID());
    assert.ok(this.events.includes("Authentication.Linked"));
  }

  @test
  async identOwnedByOtherUserWhileLoggedIn() {
    const ctxA = await this.ctx();
    await this.inContext(ctxA, () => this.auth.complete(google("7")));
    const other = await this.emailUser("b@x.com", true);
    const ctxB = await this.ctx();
    ctxB.getSession().login(other.getUUID(), "b@x.com:email");
    await rejectsWith(() => this.inContext(ctxB, () => this.auth.complete(google("7"))), IdentLinkedElsewhere);
  }

  @test
  async registrationDisabled() {
    this.auth.getParameters().registration = false;
    const ctx = await this.ctx();
    await rejectsWith(() => this.inContext(ctx, () => this.auth.complete(google("5"))), RegistrationDisabled);
  }

  @test
  async unknownProviderRefused() {
    const before = (await this.auth.getUserModel().query("")).results.length;
    const ctx = await this.ctx();
    await rejectsWith(() => this.inContext(ctx, () => this.auth.complete({ ...google("sp"), provider: "spoofed" })), {
      name: "BadRequest"
    });
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, before);
    assert.ok(!(await Ident.ref(Ident.key("sp", "spoofed")).exists()));
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async mfaGate() {
    const ctx = await this.ctx();
    (this.auth as any).mfaMethods = () => ["totp"];
    const res: any = await this.inContext(ctx, () => this.auth.complete(google("6")));
    assert.deepStrictEqual(res, { status: "mfa_required", methods: ["totp"] });
    assert.ok(ctx.getSession().isPending());
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async mfaSatisfiedBySecondFactor() {
    const ctx = await this.ctx();
    (this.auth as any).mfaMethods = () => ["totp"];
    const res: any = await this.inContext(ctx, () => this.auth.complete({ ...google("8"), amr: ["pwd", "totp"] }));
    assert.strictEqual(res.status, "ok");
    assert.ok(ctx.getSession().isLogged());
  }

  @test
  async mfaNeedsAnEnabledMethodAndAPrimaryFactor() {
    (this.auth as any).mfaMethods = () => ["totp"];
    for (const amr of [["otp"], ["oauth", "otp"], ["oauth", "sms"], ["totp"]]) {
      const ctx = await this.ctx();
      const res: any = await this.inContext(ctx, () => this.auth.complete({ ...google("9"), amr }));
      assert.deepStrictEqual(res, { status: "mfa_required", methods: ["totp"] }, amr.join(","));
      assert.ok(!ctx.getSession().isLogged());
    }
  }

  @test
  async concurrentFirstLogin() {
    const before = (await this.auth.getUserModel().query("")).results.length;
    const [a, b] = await Promise.all([
      this.ctx().then(c => this.inContext(c, () => this.auth.complete(google("c1"))).then(() => c)),
      this.ctx().then(c => this.inContext(c, () => this.auth.complete(google("c1"))).then(() => c))
    ]);
    assert.strictEqual(a.getCurrentUserId(), b.getCurrentUserId());
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, before + 1);
  }

  @test
  async unverifiedProviderEmailCreatesNoEmailIdent() {
    const ctx = await this.ctx();
    await this.inContext(ctx, () => this.auth.complete(google("u1", "squat@x.com", false)));
    assert.ok(!(await Ident.ref(Ident.key("squat@x.com", "email")).exists()));
    assert.ok(await Ident.ref(Ident.key("u1", "google")).exists());
  }

  @test
  async loggedInAlwaysAttachesToCurrentUser() {
    const owner = await this.emailUser("own@x.com", true);
    const me = await this.emailUser("me2@x.com", true);
    this.auth.getParameters().linking = "always";
    const ctx = await this.ctx();
    ctx.getSession().login(me.getUUID(), "me2@x.com:email");
    await this.inContext(ctx, () => this.auth.complete(google("la", "own@x.com", true)));
    assert.strictEqual((await Ident.ref(Ident.key("la", "google")).get()).getUser().toString(), me.getUUID());
    assert.notStrictEqual(me.getUUID(), owner.getUUID());
  }

  @test
  async adoptsIdentWithoutOwner() {
    const user = await this.emailUser("o@x.com", true);
    await Ident.getRepository().create(new Ident({ ...Ident.key("x@y.com", "email"), email: "x@y.com" } as any));
    const ctx = await this.ctx();
    const res: any = await this.inContext(ctx, () =>
      this.auth.complete({
        provider: "email",
        providerUid: "x@y.com",
        email: "x@y.com",
        emailVerified: false,
        amr: ["pwd"],
        user
      })
    );
    assert.strictEqual(res.status, "ok");
    assert.strictEqual(ctx.getCurrentUserId(), user.getUUID());
    assert.strictEqual((await Ident.ref(Ident.key("x@y.com", "email")).get()).getUser().toString(), user.getUUID());
  }

  @test
  async linkIdentityAndCompleteAsEdgeCases() {
    const user = await this.emailUser("link@x.com", true);
    const other = await this.emailUser("other-link@x.com", true);
    const ctx = await this.ctx();
    ctx.getSession().login(user.getUUID(), "link@x.com:email");

    // 1. Link new identity, then link again idempotently (line 448)
    assert.deepStrictEqual(await this.inContext(ctx, () => this.auth.linkIdentity(google("lk1"))), {
      status: "linked"
    });
    assert.deepStrictEqual(await this.inContext(ctx, () => this.auth.linkIdentity(google("lk1"))), {
      status: "linked"
    });

    // 2. Link adopts an unowned ident (lines 451-452)
    await Ident.getRepository().create(new Ident({ ...Ident.key("lk-orphan", "google") } as any));
    assert.deepStrictEqual(await this.inContext(ctx, () => this.auth.linkIdentity(google("lk-orphan"))), {
      status: "linked"
    });
    assert.strictEqual((await Ident.ref(Ident.key("lk-orphan", "google")).get()).getUser().toString(), user.getUUID());

    // 3. linkIdentity concurrent create error handling (lines 464-467)
    const repo = Ident.getRepository();
    const origCreate = repo.create.bind(repo);
    repo.create = async () => {
      throw new Error("DB failure");
    };
    try {
      await assert.rejects(() => this.inContext(ctx, () => this.auth.linkIdentity(google("lk-err"))), /DB failure/);
    } finally {
      repo.create = origCreate;
    }

    // Already exists where winner belongs to current user vs other user
    repo.create = async () => {
      await origCreate(new Ident({ ...Ident.key("lk-race1", "google"), _user: user.getUUID() } as any));
      throw new Error("Already exists");
    };
    try {
      assert.deepStrictEqual(await this.inContext(ctx, () => this.auth.linkIdentity(google("lk-race1"))), {
        status: "linked"
      });
    } finally {
      repo.create = origCreate;
    }

    repo.create = async () => {
      await origCreate(new Ident({ ...Ident.key("lk-race2", "google"), _user: other.getUUID() } as any));
      throw new Error("Already exists");
    };
    try {
      await rejectsWith(
        () => this.inContext(ctx, () => this.auth.linkIdentity(google("lk-race2"))),
        IdentLinkedElsewhere
      );
    } finally {
      repo.create = origCreate;
    }

    // 4. completeAs line 546: findIdent returns undefined first, then returns ident on second check
    const origFindIdent = (this.auth as any).findIdent.bind(this.auth);
    let calls = 0;
    (this.auth as any).findIdent = async (p: string, u: string) => {
      calls++;
      if (u === "race-find" && calls === 1) {
        await origCreate(new Ident({ ...Ident.key("race-find", "google"), _user: user.getUUID() } as any));
        return undefined;
      }
      return origFindIdent(p, u);
    };
    try {
      const c2 = await this.ctx();
      const res: any = await this.inContext(c2, () => this.auth.complete(google("race-find")));
      assert.strictEqual(res.status, "ok");
    } finally {
      (this.auth as any).findIdent = origFindIdent;
    }

    // 5. completeAs line 581 (non-Already-exists error on primary ident create) & line 596 (extra email ident create)
    repo.create = async () => {
      throw new Error("Fatal store error");
    };
    try {
      const c3 = await this.ctx();
      await assert.rejects(() => this.inContext(c3, () => this.auth.complete(google("err-prim"))), /Fatal store error/);
    } finally {
      repo.create = origCreate;
    }

    let createCount = 0;
    repo.create = async (item: any) => {
      createCount++;
      if (createCount === 2) {
        throw new Error("Already exists");
      }
      return origCreate(item);
    };
    try {
      const c4 = await this.ctx();
      const res: any = await this.inContext(c4, () =>
        this.auth.complete(google("extra-race", "extra-race@x.com", true))
      );
      assert.strictEqual(res.status, "ok");
    } finally {
      repo.create = origCreate;
    }
  }
}
