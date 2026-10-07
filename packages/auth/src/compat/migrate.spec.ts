import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Ident, useService } from "@webda/core";
import { MemoryRepository, registerRepository } from "@webda/models";
import { EmailTest } from "../test/emailtest.js";
import { seedV3, seedV3Ident, type RawWriter } from "../test/v3.js";

/** Application ident model subclassing the core Ident */
class MigrateIdent extends Ident {}

/** Application ident model stored apart from the core Ident */
class ApartIdent extends Ident {}

/**
 * Find the stored password hash of a raw user row, whatever the envelope
 * @param row - parsed raw row
 * @returns the hash
 */
function storedHash(row: any): string | undefined {
  return row?.password?.__hash ?? row?.value?.password?.__hash ?? row?.data?.password?.__hash;
}

@suite
class MigrateTest extends EmailTest {
  /**
   * @returns the raw storage of the auth store
   */
  get storage(): Map<string, string> {
    return (useService("AuthStore" as any) as any).storage;
  }

  /** @override */
  async beforeEach() {
    await super.beforeEach();
    this.storage.clear();
  }

  /** Raw writer into the MemoryStore storage map */
  write: RawWriter = (key, row) => this.storage.set(key, JSON.stringify(row));

  /**
   * @returns a copy of the raw storage
   */
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.storage.entries());
  }

  @test
  async dryRunThenRun() {
    const m1 = await seedV3(this.write, "m1@x.com", { validated: true, password: "v3password" });
    await seedV3(this.write, "m2_x@x.com", { validated: false, password: "v3password" });
    seedV3Ident(this.write, "777", "google", "ghost");
    const before = this.snapshot();
    const dry = await this.auth.migrate(true);
    assert.strictEqual(dry.dryRun, true);
    assert.deepStrictEqual(dry.idents, { migrated: 3, skipped: 0, failed: [] });
    assert.deepStrictEqual(dry.users, { migrated: 2, skipped: 0, failed: [] });
    assert.deepStrictEqual(this.snapshot(), before);

    const run = await this.auth.migrate(false, 1);
    assert.strictEqual(run.dryRun, false);
    assert.deepStrictEqual(run.idents, { migrated: 3, skipped: 0, failed: [] });
    assert.deepStrictEqual(run.users, { migrated: 2, skipped: 0, failed: [] });
    assert.strictEqual(run.incomplete, undefined);
    for (const key of ["m1@x.com_email", "m2_x@x.com_email", "777_google"]) {
      assert.ok(!this.storage.has(key), key);
    }
    const google = await Ident.ref(Ident.key("777", "google")).get();
    assert.strictEqual(google.getUser().toString(), "ghost");
    const email = await Ident.ref(Ident.key("m1@x.com", "email")).get();
    assert.strictEqual(email.getUser().toString(), m1);
    assert.ok(email.isVerified());
    assert.ok(!(await Ident.ref(Ident.key("m2_x@x.com", "email")).get()).isVerified());

    const rerun = await this.auth.migrate(false);
    assert.deepStrictEqual(rerun.idents, { migrated: 0, skipped: 0, failed: [] });
    assert.deepStrictEqual(rerun.users, { migrated: 0, skipped: 0, failed: [] });
    // Migrated users still log in with their v3 password
    assert.strictEqual((await this.op("Auth.Email.Login", { email: "m1@x.com", password: "v3password" })).status, "ok");
  }

  @test
  async resumesAfterFailure() {
    await seedV3(this.write, "f1@x.com", { validated: true, password: "v3password" });
    // v3 did not normalise emails: "Dup@x.com" upgrades to "dup@x.com", already held by another user
    seedV3Ident(this.write, "Dup@x.com", "email", "user-a");
    const taken = new Ident({ ...Ident.key("dup@x.com", "email"), email: "dup@x.com" } as any);
    taken.setUser("user-b");
    await Ident.getRepository().create(taken);

    const dry = await this.auth.migrate(true);
    assert.deepStrictEqual(dry.idents, { migrated: 1, skipped: 0, failed: ["Dup@x.com_email"] });

    const run = await this.auth.migrate(false, 1);
    assert.deepStrictEqual(run.idents, { migrated: 1, skipped: 0, failed: ["Dup@x.com_email"] });
    assert.ok(await Ident.ref(Ident.key("f1@x.com", "email")).exists());
    // The failing record is kept for a later run, the existing one untouched
    assert.ok(this.storage.has("Dup@x.com_email"));
    assert.strictEqual((await Ident.ref(Ident.key("dup@x.com", "email")).get()).getUser().toString(), "user-b");

    const rerun = await this.auth.migrate(false);
    assert.deepStrictEqual(rerun.idents, { migrated: 0, skipped: 0, failed: ["Dup@x.com_email"] });
  }

  @test
  async transientFailureIsReported() {
    seedV3Ident(this.write, "t1", "github", "tu");
    seedV3Ident(this.write, "t2", "github", "tu");
    const repo: any = Ident.getRepository();
    const original = repo.create;
    try {
      repo.create = async (item: any) => {
        if (item.providerUid === "t1") throw new Error("Backend unavailable");
        return original.call(repo, item);
      };
      const run = await this.auth.migrate(false);
      assert.deepStrictEqual(run.idents, { migrated: 1, skipped: 0, failed: ["t1_github"] });
      assert.ok(this.storage.has("t1_github"));
    } finally {
      repo.create = original;
    }
    // Once the backend is back, a new run finishes the job
    const run = await this.auth.migrate(false);
    assert.deepStrictEqual(run.idents, { migrated: 1, skipped: 0, failed: [] });
    assert.ok(await Ident.ref(Ident.key("t1", "github")).exists());
  }

  @test
  async normalisesEmailKeys() {
    const userId = await seedV3(this.write, "Mixed.Case@X.com", { validated: true, password: "v3password" });
    const run = await this.auth.migrate(false);
    assert.deepStrictEqual(run.idents, { migrated: 1, skipped: 0, failed: [] });
    assert.ok(!this.storage.has("Mixed.Case@X.com_email"));
    const ident = await Ident.ref(Ident.key("mixed.case@x.com", "email")).get();
    assert.strictEqual(ident.getUser().toString(), userId);
    const ctx = await this.ctx();
    const res: any = await this.op("Auth.Email.Login", { email: "Mixed.Case@X.com", password: "v3password" }, ctx);
    assert.strictEqual(res.status, "ok");
    assert.strictEqual(ctx.getCurrentUserId(), userId);
  }

  @test
  async usersRewritten() {
    const userId = await seedV3(this.write, "u@x.com", { validated: true, password: "v3password" });
    const v4 = await this.auth.getUserModel().create({ email: "v4@x.com" } as any);
    const v4Raw = this.storage.get(v4.getUUID());
    const hash = JSON.parse(this.storage.get(userId)).__password;
    const run = await this.auth.migrate(false);
    assert.deepStrictEqual(run.users, { migrated: 1, skipped: 0, failed: [] });
    const raw = JSON.parse(this.storage.get(userId));
    assert.strictEqual(JSON.stringify(raw).includes("__password"), false);
    assert.strictEqual(storedHash(raw), hash);
    // Users already in the v4 layout are not rewritten
    assert.strictEqual(this.storage.get(v4.getUUID()), v4Raw);
    assert.deepStrictEqual((await this.auth.migrate(false)).users, { migrated: 0, skipped: 0, failed: [] });
  }

  /**
   * Register an Ident subclass and use it as the ident model
   * @param clazz - the subclass
   * @param name - its identifier
   * @param repository - its repository, defaults to the auth store
   */
  useIdentModel(clazz: any, name: string, repository?: any) {
    const meta: any = (Ident as any).Metadata;
    this.registerModel(clazz, name, { ...meta, Identifier: name, Ancestors: ["Webda/Ident"], Subclasses: [] });
    clazz.registerSerializer(true, name);
    registerRepository(clazz, repository ?? (useService("AuthStore" as any) as any).getRepository(clazz));
    this.auth.getParameters().identModel = name;
  }

  @test
  async customIdentModel() {
    this.useIdentModel(MigrateIdent, "WebdaTest/MigrateIdent");
    try {
      // v3 rows are typed as the core Webda/Ident: the MigrateIdent repository does not query them
      const userId = await seedV3(this.write, "custom@x.com", { validated: true, password: "v3password" });
      seedV3Ident(this.write, "c1", "github", userId);
      const dry = await this.auth.migrate(true);
      assert.deepStrictEqual(dry.idents, { migrated: 2, skipped: 0, failed: [] });
      const run = await this.auth.migrate(false);
      assert.deepStrictEqual(run.idents, { migrated: 2, skipped: 0, failed: [] });
      for (const [uid, provider] of [
        ["custom@x.com", "email"],
        ["c1", "github"]
      ]) {
        const key = `${uid}:${provider}`;
        assert.strictEqual(JSON.parse(this.storage.get(key)).__type, "WebdaTest/MigrateIdent", key);
        assert.ok(!this.storage.has(`${uid}_${provider}`));
        const ident = await MigrateIdent.ref(Ident.key(uid, provider)).get();
        assert.ok(ident instanceof MigrateIdent);
        assert.strictEqual(ident.getUser().toString(), userId);
      }
      assert.deepStrictEqual((await this.auth.migrate(false)).idents, { migrated: 0, skipped: 0, failed: [] });
    } finally {
      this.auth.getParameters().identModel = "Webda/Ident";
    }
  }

  @test
  async customIdentModelOnAnotherStore() {
    // The core Ident repository (auth store) holds v3 rows the ident model's own store cannot reach
    this.useIdentModel(
      ApartIdent,
      "WebdaTest/ApartIdent",
      new MemoryRepository(ApartIdent as any, ["providerUid", "provider"], ":")
    );
    try {
      seedV3Ident(this.write, "apart", "github", "apart-user");
      const run = await this.auth.migrate(false);
      assert.deepStrictEqual(run.idents, { migrated: 0, skipped: 1, failed: [] });
      assert.ok(this.storage.has("apart_github"));
    } finally {
      this.auth.getParameters().identModel = "Webda/Ident";
    }
  }
}
