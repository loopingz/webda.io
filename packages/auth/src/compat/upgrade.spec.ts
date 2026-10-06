import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, useService } from "@webda/core";
import { EmailTest } from "../test/emailtest.js";
import { seedV3, seedV3Ident, type RawWriter } from "../test/v3.js";
import { legacyIdents, legacyKey, splitLegacyKey, upgradeIdent } from "./upgrade.js";

@suite
class V3UpgradeTest extends EmailTest {
  /**
   * @returns the raw storage of the auth store
   */
  get storage(): Map<string, string> {
    return (useService("AuthStore" as any) as any).storage;
  }

  /** Raw writer into the MemoryStore storage map */
  write: RawWriter = (key, row) => this.storage.set(key, JSON.stringify(row));

  @test
  splitKeys() {
    assert.deepStrictEqual(splitLegacyKey("john_doe@x.com_email"), {
      providerUid: "john_doe@x.com",
      provider: "email"
    });
    assert.deepStrictEqual(splitLegacyKey("12345_google"), { providerUid: "12345", provider: "google" });
    assert.strictEqual(splitLegacyKey("nounderscore"), undefined);
    assert.strictEqual(splitLegacyKey("a:b_email"), undefined);
    assert.strictEqual(legacyKey("a_b@x.com", "email"), "a_b@x.com_email");
  }

  @test
  async lazyLoginUpgrades() {
    const userId = await seedV3(this.write, "old_user@x.com", { validated: true, password: "v3password" });
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Email.Login", { email: "old_user@x.com", password: "v3password" }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.strictEqual(ctx.getCurrentUserId(), userId);
    const ident = await Ident.ref(Ident.key("old_user@x.com", "email")).get();
    assert.strictEqual(ident.getLegacyUID(), undefined);
    assert.strictEqual(ident.getUser().toString(), userId);
    assert.strictEqual(ident.email, "old_user@x.com");
    assert.ok(ident.isVerified());
    assert.strictEqual(ident.verifiedAt.toISOString(), "2020-01-01T00:00:00.000Z");
    // v3 _failedLogin carried over then reset by the successful login; send throttle carried over
    assert.strictEqual(ident._loginAttempts, 0);
    assert.strictEqual(ident._throttle.lastSentAt, 42);
    assert.strictEqual(this.storage.has("old_user@x.com_email"), false);
    for (const field of ["_failedLogin", "_validation", "_lastValidationEmail", "_type", "uuid"]) {
      assert.strictEqual((ident as any)[field], undefined, field);
    }
  }

  @test
  async fieldMap() {
    seedV3Ident(this.write, "g_1", "google", "owner1", {
      provider: "google",
      email: "g@x.com",
      __profile: { name: "G" },
      __tokens: { access: "a", refresh: "r" },
      _lastUsed: "2021-02-03T00:00:00.000Z",
      _failedLogin: 2,
      _lastValidationEmail: "2021-01-01T00:00:00.000Z"
    });
    const legacy = await Ident.ref("g_1_google" as any).get();
    const ident = await upgradeIdent(legacy);
    assert.strictEqual(ident.getUUID(), "g_1:google");
    assert.strictEqual(ident.getUser().toString(), "owner1");
    assert.strictEqual(ident.email, "g@x.com");
    assert.deepStrictEqual(ident.__profile, { name: "G" });
    assert.deepStrictEqual(ident.__tokens, { access: "a", refresh: "r" });
    assert.strictEqual(ident.lastUsedAt.toISOString(), "2021-02-03T00:00:00.000Z");
    assert.strictEqual(ident._loginAttempts, 2);
    assert.strictEqual(ident._throttle.lastSentAt, Date.parse("2021-01-01T00:00:00.000Z"));
    assert.ok(!ident.isVerified());
    // persisted as such
    const stored = await Ident.ref(Ident.key("g_1", "google")).get();
    assert.strictEqual(stored._loginAttempts, 2);
    assert.strictEqual(stored.getUser().toString(), "owner1");
  }

  @test
  async unvalidatedV3StillLogsIn() {
    await seedV3(this.write, "nv@x.com", { validated: false, password: "v3password" });
    assert.strictEqual((await this.op("Auth.Email.Login", { email: "nv@x.com", password: "v3password" })).status, "ok");
    assert.ok(!(await Ident.ref(Ident.key("nv@x.com", "email")).get()).isVerified());
  }

  @test
  async wrongPasswordStillUpgradesAndCounts() {
    await seedV3(this.write, "wp@x.com", { validated: true, password: "v3password" });
    await assert.rejects(() => this.op("Auth.Email.Login", { email: "wp@x.com", password: "nope-nope" }));
    const ident = await Ident.ref(Ident.key("wp@x.com", "email")).get();
    // v3 count (1) + this attempt
    assert.strictEqual(ident._loginAttempts, 2);
  }

  @test
  async identsListUpgradesLegacy() {
    const userId = await seedV3(this.write, "list_me@x.com", { validated: true, password: "v3password" });
    seedV3Ident(this.write, "4242", "google", userId, { email: "list_me@x.com" });
    const ctx = await this.ctx();
    // Login upgrades the email ident only
    await this.op("Auth.Email.Login", { email: "list_me@x.com", password: "v3password" }, ctx);
    assert.ok(this.storage.has("4242_google"));
    const list: any[] = await this.op("Auth.Idents", {}, ctx);
    assert.deepStrictEqual(list.map(i => `${i.providerUid}:${i.provider}`).sort(), [
      "4242:google",
      "list_me@x.com:email"
    ]);
    assert.strictEqual(this.storage.has("4242_google"), false);
    assert.ok(await Ident.ref(Ident.key("4242", "google")).exists());
    // Unlink sees the upgraded data
    await this.op("Auth.Unlink", { provider: "google", providerUid: "4242" }, ctx);
    assert.ok(!(await Ident.ref(Ident.key("4242", "google")).exists()));
  }

  @test
  async identQueryWithV3Records() {
    seedV3Ident(this.write, "q_1@x.com", "email", "quser");
    seedV3Ident(this.write, "q2", "github", "quser");
    const results = (await Ident.query("_user = ?", ["quser"])).results;
    assert.strictEqual(results.length, 2);
    assert.ok(results.every(i => i instanceof Ident && i.getLegacyUID()));
    const legacy: string[] = [];
    for await (const ident of legacyIdents(Ident as any, "_user = 'quser'")) {
      legacy.push(ident.getLegacyUID());
    }
    assert.deepStrictEqual(legacy.sort(), ["q2_github", "q_1@x.com_email"]);
  }

  @test
  async upgradeIsIdempotent() {
    await seedV3(this.write, "idem@x.com", { validated: true, password: "v3password", userId: "idem-user" });
    const raw = this.storage.get("idem@x.com_email");
    const first = await upgradeIdent(await Ident.ref("idem@x.com_email" as any).get());
    assert.strictEqual(first.getUUID(), "idem@x.com:email");
    assert.strictEqual(this.storage.has("idem@x.com_email"), false);
    await Ident.ref(Ident.key("idem@x.com", "email")).setAttribute("_loginAttempts", 7);
    // Simulate a crash after the create: the v3 record is still there
    this.storage.set("idem@x.com_email", raw);
    const again = await upgradeIdent(await Ident.ref("idem@x.com_email" as any).get());
    assert.strictEqual(again.getUUID(), "idem@x.com:email");
    // The existing record is kept as is
    assert.strictEqual(again._loginAttempts, 7);
    assert.strictEqual(this.storage.has("idem@x.com_email"), false);
    await assert.rejects(() => upgradeIdent(again), /Not a v3 ident/);
  }

  @test
  async compatibilityOff() {
    const userId = await seedV3(this.write, "off@x.com", { validated: true, password: "v3password" });
    this.auth.getParameters().compatibility.v3 = false;
    try {
      await assert.rejects(
        () => this.op("Auth.Email.Login", { email: "off@x.com", password: "v3password" }),
        (err: any) => err.code === "INVALID_CREDENTIALS"
      );
      assert.ok(this.storage.has("off@x.com_email"));
      assert.ok(!(await Ident.ref(Ident.key("off@x.com", "email")).exists()));
      // Listing ignores (and keeps) v3 records
      const list = await (this.auth as any).listIdents(userId);
      assert.deepStrictEqual(list, []);
      assert.ok(this.storage.has("off@x.com_email"));
    } finally {
      this.auth.getParameters().compatibility.v3 = true;
    }
  }
}
