import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { FileUtils } from "@webda/utils";
import { Ident } from "@webda/core";
import { EmailTest } from "../test/emailtest.js";
import { seedV3, seedV3Ident, type RawWriter } from "../test/v3.js";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "auth-migrate-"));

/**
 * `webda auth migrate` over a v3 FileStore folder (plain JSON files)
 */
@suite
class MigrateFileStoreTest extends EmailTest {
  /** @override */
  getTestConfiguration() {
    const config: any = FileUtils.load(process.cwd() + "/test/config.json");
    config.services.AuthStore = { ...config.services.AuthStore, type: "Webda/FileStore", folder };
    return config;
  }

  /** @override */
  async beforeEach() {
    for (const f of fs.readdirSync(folder)) fs.rmSync(path.join(folder, f), { force: true });
    await super.beforeEach();
  }

  /**
   * @param key - storage key
   * @returns the file of a record
   */
  file(key: string): string {
    return path.join(folder, `${key}.json`);
  }

  /** Raw writer into the FileStore folder */
  write: RawWriter = (key, row) => fs.writeFileSync(this.file(key), JSON.stringify(row));

  /**
   * @returns the folder content
   */
  snapshot(): Record<string, string> {
    return Object.fromEntries(fs.readdirSync(folder).map(f => [f, fs.readFileSync(path.join(folder, f)).toString()]));
  }

  @test
  async migratesFolder() {
    const userId = await seedV3(this.write, "File.User@x.com", { validated: true, password: "v3password" });
    seedV3Ident(this.write, "f42", "github", userId);
    const before = this.snapshot();
    const dry = await this.auth.migrate(true);
    assert.deepStrictEqual(dry.idents, { migrated: 2, skipped: 0, failed: [] });
    assert.deepStrictEqual(dry.users, { migrated: 1, skipped: 0, failed: [] });
    assert.deepStrictEqual(this.snapshot(), before);

    const run = await this.auth.migrate(false, 1);
    assert.deepStrictEqual(run.idents, { migrated: 2, skipped: 0, failed: [] });
    assert.deepStrictEqual(run.users, { migrated: 1, skipped: 0, failed: [] });
    assert.ok(!fs.existsSync(this.file("File.User@x.com_email")));
    assert.ok(!fs.existsSync(this.file("f42_github")));
    assert.ok(await Ident.ref(Ident.key("file.user@x.com", "email")).exists());
    assert.strictEqual((await Ident.ref(Ident.key("f42", "github")).get()).getUser().toString(), userId);
    const raw = fs.readFileSync(this.file(userId)).toString();
    assert.ok(!raw.includes("__password"));
    assert.ok(raw.includes("__hash"));

    const rerun = await this.auth.migrate(false);
    assert.deepStrictEqual(rerun.idents, { migrated: 0, skipped: 0, failed: [] });
    assert.deepStrictEqual(rerun.users, { migrated: 0, skipped: 0, failed: [] });
    assert.strictEqual(
      (await this.op("Auth.Email.Login", { email: "file.user@x.com", password: "v3password" })).status,
      "ok"
    );
  }
}
