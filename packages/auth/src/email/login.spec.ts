import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident } from "@webda/core";
import { EmailTest } from "../test/emailtest.js";
import { AccountExists, InvalidCredentials, PasswordPolicyError, Throttled } from "../errors.js";

const code = (cls: { name: string }) =>
  cls.name === "PasswordPolicyError" ? "PASSWORD_POLICY" : cls.name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
const rejectsWith = (fn: () => Promise<unknown>, cls: { name: string }) =>
  assert.rejects(fn, (err: any) => err.code === code(cls));

@suite
class EmailLoginTest extends EmailTest {
  @test
  async registerAfterThenLogin() {
    const ctx = await this.ctx();
    const res: any = await this.op(
      "Auth.Email.Register",
      { email: " New_User@X.com ", password: "longenough", profile: { displayName: "N" } },
      ctx
    );
    assert.strictEqual(res.status, "ok");
    assert.ok(ctx.getSession().isLogged());
    assert.strictEqual(this.mailer.sent.length, 1);
    assert.strictEqual(this.mailer.sent[0].template, "EMAIL_REGISTER");
    assert.strictEqual(this.mailer.sent[0].to, "new_user@x.com");
    const ident = await Ident.ref(Ident.key("new_user@x.com", "email")).get();
    assert.ok(!ident.isVerified());
    assert.strictEqual(res.user.displayName, "N");
    assert.strictEqual(JSON.stringify(res).includes("__hash"), false);
    assert.strictEqual(JSON.stringify(res).includes("password"), false);
    const again: any = await this.op("Auth.Email.Login", { email: "NEW_USER@x.com", password: "longenough" });
    assert.strictEqual(again.status, "ok");
    assert.strictEqual(JSON.stringify(again).includes("__hash"), false);
    assert.strictEqual(JSON.stringify(again).includes("password"), false);
  }

  @test
  async registerBeforeRequiresToken() {
    this.email.getParameters().verification = "before";
    const first: any = await this.op("Auth.Email.Register", { email: "b@x.com", password: "longenough" });
    assert.deepStrictEqual(first, { status: "verification_sent" });
    // Only the send throttle is tracked until the link is used
    assert.ok(!(await Ident.ref(Ident.key("b@x.com", "email")).get()).getUser());
    await this.email.flushMails();
    const token = this.tokenOf(this.lastMailUrl());
    const res: any = await this.op("Auth.Email.Register", { email: "b@x.com", password: "longenough", token });
    assert.strictEqual(res.status, "ok");
    assert.ok((await Ident.ref(Ident.key("b@x.com", "email")).get()).isVerified());
  }

  @test
  async registerBeforeIsThrottled() {
    this.email.getParameters().verification = "before";
    for (let i = 0; i < 3; i++) {
      assert.deepStrictEqual(await this.op("Auth.Email.Register", { email: "bomb@x.com", password: "longenough" }), {
        status: "verification_sent"
      });
    }
    await this.email.flushMails();
    assert.strictEqual(this.mailer.sent.length, 1);
    // Only the send throttle is tracked: the ident has no owner
    assert.ok(!(await Ident.ref(Ident.key("bomb@x.com", "email")).get()).getUser());
  }

  @test
  async registerBeforeTokenForOtherEmail() {
    this.email.getParameters().verification = "before";
    await this.op("Auth.Email.Register", { email: "a@x.com", password: "longenough" });
    await this.email.flushMails();
    const token = this.tokenOf(this.lastMailUrl());
    await assert.rejects(
      () => this.op("Auth.Email.Register", { email: "other@x.com", password: "longenough", token }),
      (err: any) => err.code === "TOKEN_INVALID"
    );
  }

  @test
  async registerNone() {
    this.email.getParameters().verification = "none";
    await this.op("Auth.Email.Register", { email: "n@x.com", password: "longenough" });
    assert.strictEqual(this.mailer.sent.length, 0);
    assert.ok(!(await Ident.ref(Ident.key("n@x.com", "email")).get()).isVerified());
  }

  @test
  async registerConflictsAndPolicy() {
    await rejectsWith(
      () => this.op("Auth.Email.Register", { email: "p@x.com", password: "short" }),
      PasswordPolicyError
    );
    assert.ok(!(await Ident.ref(Ident.key("p@x.com", "email")).exists()));
    this.email.getParameters().verification = "before";
    await this.op("Auth.Email.Register", { email: "v@x.com", password: "longenough" });
    await this.email.flushMails();
    const t = this.tokenOf(this.lastMailUrl());
    await this.op("Auth.Email.Register", { email: "v@x.com", password: "longenough", token: t });
    await rejectsWith(
      () => this.op("Auth.Email.Register", { email: "v@x.com", password: "longenough" }),
      AccountExists
    );
  }

  @test
  async unverifiedOwnedEmailCannotBeTakenOver() {
    await this.op("Auth.Email.Register", { email: "u@x.com", password: "longenough" });
    // Same email, other password: must not log into the first account
    await rejectsWith(
      () => this.op("Auth.Email.Register", { email: "u@x.com", password: "otherpassword" }),
      AccountExists
    );
    await rejectsWith(
      () => this.op("Auth.Email.Login", { email: "u@x.com", password: "otherpassword" }),
      InvalidCredentials
    );
  }

  @test
  async adoptsUnownedIdent() {
    const orphan = new Ident({ ...Ident.key("o@x.com", "email"), email: "o@x.com" } as any);
    await Ident.getRepository().create(orphan);
    const res: any = await this.op("Auth.Email.Register", { email: "o@x.com", password: "longenough" });
    assert.strictEqual(res.status, "ok");
    const ident = await Ident.ref(Ident.key("o@x.com", "email")).get();
    assert.strictEqual(ident.getUser().toString(), res.user.uuid);
  }

  @test
  async profileIsSanitized() {
    const res: any = await this.op("Auth.Email.Register", {
      email: "s@x.com",
      password: "longenough",
      profile: {
        displayName: "S",
        uuid: "forced",
        email: "evil@x.com",
        password: { __hash: "x" },
        __hash: "y",
        _foo: 1
      }
    });
    assert.strictEqual(res.status, "ok");
    assert.notStrictEqual(res.user.uuid, "forced");
    assert.strictEqual(res.user.displayName, "S");
    const user: any = await this.auth.getUserModel().ref(res.user.uuid).get();
    assert.strictEqual(user.email, "s@x.com");
    assert.ok(await user.password.verify("longenough"));
    assert.strictEqual(user._foo, undefined);
  }

  @test
  async registerEventsNotLinked() {
    const events: string[] = [];
    this.auth.on("Authentication.Register", () => events.push("Register"));
    this.auth.on("Authentication.Linked", () => events.push("Linked"));
    this.auth.on("Authentication.Login", () => events.push("Login"));
    await this.op("Auth.Email.Register", { email: "e@x.com", password: "longenough" });
    assert.deepStrictEqual(events, ["Register", "Login"]);
  }

  @test
  async sameErrorForUnknownAndWrong() {
    await this.op("Auth.Email.Register", { email: "w@x.com", password: "longenough" });
    const unknown = await this.op("Auth.Email.Login", { email: "nobody@x.com", password: "longenough" }).catch(e => e);
    const wrong = await this.op("Auth.Email.Login", { email: "w@x.com", password: "badbadbad" }).catch(e => e);
    assert.strictEqual(unknown.code, code(InvalidCredentials));
    assert.strictEqual(wrong.code, code(InvalidCredentials));
    assert.strictEqual(unknown.message, wrong.message);
  }

  @test
  async lockout() {
    await this.op("Auth.Email.Register", { email: "l@x.com", password: "longenough" });
    for (let i = 0; i < 3; i++) {
      await rejectsWith(
        () => this.op("Auth.Email.Login", { email: "l@x.com", password: "badbadbad" }),
        InvalidCredentials
      );
    }
    // correct password while locked is still refused
    await rejectsWith(() => this.op("Auth.Email.Login", { email: "l@x.com", password: "longenough" }), Throttled);
    // lockout expiry
    const ref = Ident.ref(Ident.key("l@x.com", "email"));
    const ident = await ref.get();
    assert.strictEqual(ident._loginAttempts, 4);
    await ref.patch({ _lastLoginAttemptAt: Date.now() - 900001 } as any);
    const ok: any = await this.op("Auth.Email.Login", { email: "l@x.com", password: "longenough" });
    assert.strictEqual(ok.status, "ok");
    assert.strictEqual((await ref.get())._loginAttempts, 0);
  }

  @test
  async successResetsFailures() {
    await this.op("Auth.Email.Register", { email: "r@x.com", password: "longenough" });
    await rejectsWith(
      () => this.op("Auth.Email.Login", { email: "r@x.com", password: "badbadbad" }),
      InvalidCredentials
    );
    const ref = Ident.ref(Ident.key("r@x.com", "email"));
    assert.strictEqual((await ref.get())._loginAttempts, 1);
    await this.op("Auth.Email.Login", { email: "r@x.com", password: "longenough" });
    assert.strictEqual((await ref.get())._loginAttempts, 0);
  }

  @test
  async customPolicyFromConfig() {
    this.email.getParameters().password.policy = "^magic$";
    this.email.resolve();
    await this.op("Auth.Email.Register", { email: "m@x.com", password: "magic" });
  }

  @test
  async allowListRefusesAndCreatesNothing() {
    this.email.getParameters().allowedEmailDomains = ["company.com"];
    try {
      const before = (await this.auth.getUserModel().query("")).results.length;
      // after: unverified, so refused even for an allowed domain
      await rejectsWith(() => this.op("Auth.Email.Register", { email: "x@other.com", password: "longenough" }), {
        name: "EmailDomainNotAllowed"
      });
      await rejectsWith(() => this.op("Auth.Email.Register", { email: "x@company.com", password: "longenough" }), {
        name: "EmailDomainNotAllowed"
      });
      assert.ok(!(await Ident.ref(Ident.key("x@other.com", "email")).exists()));
      assert.strictEqual((await this.auth.getUserModel().query("")).results.length, before);
      assert.strictEqual(this.mailer.sent.length, 0);
      // before: a verified allowed domain works
      this.email.getParameters().verification = "before";
      await rejectsWith(() => this.op("Auth.Email.Register", { email: "x@other.com", password: "longenough" }), {
        name: "EmailDomainNotAllowed"
      });
      assert.strictEqual(this.mailer.sent.length, 0);
      await this.op("Auth.Email.Register", { email: "y@company.com", password: "longenough" });
      await this.email.flushMails();
      const token = this.tokenOf(this.lastMailUrl());
      const res: any = await this.op("Auth.Email.Register", { email: "y@company.com", password: "longenough", token });
      assert.strictEqual(res.status, "ok");
    } finally {
      this.email.getParameters().allowedEmailDomains = undefined;
    }
  }

  @test
  async completeRefusesNewUserOnOwnedIdent() {
    const a = await this.auth.getUserModel().create({ email: "own@x.com", displayName: "A" } as any);
    const ident = new Ident({ ...Ident.key("own@x.com", "email"), email: "own@x.com" } as any);
    ident.setUser(a.getUUID());
    await Ident.getRepository().create(ident);
    const b = await this.auth.getUserModel().create({ email: "own@x.com", displayName: "B" } as any);
    const ctx = await this.ctx();
    await assert.rejects(
      () =>
        this.inContext(ctx, () =>
          this.auth.complete(
            {
              provider: "email",
              providerUid: "own@x.com",
              email: "own@x.com",
              emailVerified: false,
              amr: ["pwd"],
              user: b
            },
            { newUser: true }
          )
        ),
      (err: any) => err.code === "ACCOUNT_EXISTS"
    );
    assert.ok(!ctx.getSession().isLogged());
  }

  @test
  async concurrentRegistrationOneWinner() {
    const c1 = await this.ctx();
    const c2 = await this.ctx();
    const before = (await this.auth.getUserModel().query("")).results.length;
    const results = await Promise.allSettled([
      this.op("Auth.Email.Register", { email: "race@x.com", password: "longenough" }, c1),
      this.op("Auth.Email.Register", { email: "race@x.com", password: "otherpassword" }, c2)
    ]);
    const ok = results.filter(r => r.status === "fulfilled");
    const ko: any[] = results.filter(r => r.status === "rejected");
    assert.strictEqual(ok.length, 1);
    assert.strictEqual(ko[0].reason.code, "ACCOUNT_EXISTS");
    assert.strictEqual((await this.auth.getUserModel().query("")).results.length, before + 1);
    const loser = results[0].status === "rejected" ? c1 : c2;
    assert.ok(!loser.getSession().isLogged());
  }

  @test
  async parallelFailuresAreCountedAndLockEngages() {
    await this.op("Auth.Email.Register", { email: "par@x.com", password: "longenough" });
    const res = await Promise.allSettled(
      Array.from({ length: 5 }, () => this.op("Auth.Email.Login", { email: "par@x.com", password: "badbadbad" }))
    );
    const codes = res.map((r: any) => r.reason?.code);
    assert.ok(codes.filter(c => c === "INVALID_CREDENTIALS").length <= 3, codes.join());
    assert.strictEqual(
      codes.filter(c => c === "THROTTLED").length,
      5 - codes.filter(c => c === "INVALID_CREDENTIALS").length
    );
    const ident = await Ident.ref(Ident.key("par@x.com", "email")).get();
    assert.strictEqual(ident._loginAttempts, 5);
    await rejectsWith(() => this.op("Auth.Email.Login", { email: "par@x.com", password: "longenough" }), Throttled);
  }

  @test
  async correctPasswordInsideBurstIsThrottled() {
    await this.op("Auth.Email.Register", { email: "bu@x.com", password: "longenough" });
    for (let i = 0; i < 3; i++) {
      await rejectsWith(
        () => this.op("Auth.Email.Login", { email: "bu@x.com", password: "badbadbad" }),
        InvalidCredentials
      );
    }
    const res = await Promise.allSettled([
      ...Array.from({ length: 4 }, () => this.op("Auth.Email.Login", { email: "bu@x.com", password: "badbadbad" })),
      this.op("Auth.Email.Login", { email: "bu@x.com", password: "longenough" })
    ]);
    assert.ok(res.every(r => r.status === "rejected"));
    assert.ok(res.every((r: any) => r.reason.code === "THROTTLED"));
  }

  @test
  async countingWorksWhenIncrementReturnsVoid() {
    await this.op("Auth.Email.Register", { email: "vd@x.com", password: "longenough" });
    const repo: any = Ident.getRepository();
    const original = repo.incrementAttributes;
    repo.incrementAttributes = async (...args: any[]) => {
      await original.apply(repo, args);
    };
    try {
      for (let i = 0; i < 3; i++) {
        await rejectsWith(
          () => this.op("Auth.Email.Login", { email: "vd@x.com", password: "badbadbad" }),
          InvalidCredentials
        );
      }
      await rejectsWith(() => this.op("Auth.Email.Login", { email: "vd@x.com", password: "longenough" }), Throttled);
    } finally {
      repo.incrementAttributes = original;
    }
  }

  @test
  async adoptionDoesNotKeepUnprovenVerification() {
    const orphan = new Ident({
      ...Ident.key("ad@x.com", "email"),
      email: "ad@x.com",
      verifiedAt: new Date()
    } as any);
    await Ident.getRepository().create(orphan);
    await this.op("Auth.Email.Register", { email: "ad@x.com", password: "longenough" });
    assert.ok(!(await Ident.ref(Ident.key("ad@x.com", "email")).get()).isVerified());
  }

  @test
  async profileOnlyAllowsModelAttributes() {
    const res: any = await this.op("Auth.Email.Register", {
      email: "pf@x.com",
      password: "longenough",
      profile: { displayName: "P", locale: "fr", notAnAttribute: "x", password: "x", _avatar: "y" }
    });
    const user: any = await this.auth.getUserModel().ref(res.user.uuid).get();
    assert.strictEqual(user.displayName, "P");
    assert.strictEqual(user.locale, "fr");
    assert.strictEqual(user.notAnAttribute, undefined);
    assert.notStrictEqual(user._avatar, "y");
    assert.ok(await user.password.verify("longenough"));
  }

  @test
  async listedAsProvider() {
    assert.deepStrictEqual(await this.op("Auth.Providers"), [{ name: "email", type: "password" }]);
  }
}
