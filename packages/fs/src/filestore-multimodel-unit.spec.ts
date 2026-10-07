import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Ident, User } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fs-multimodel-"));

/**
 * One FileStore folder holding a single-key model (User) and a composite-key one (Ident)
 */
@suite
class FileStoreMultiModelTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return {
      parameters: { ignoreBeans: true },
      services: {
        Files: { type: "Webda/FileStore", folder, models: ["Webda/User", "Webda/Ident"] }
      }
    };
  }

  async beforeEach() {
    for (const f of fs.readdirSync(folder)) fs.rmSync(path.join(folder, f), { force: true });
    await super.beforeEach();
  }

  @test
  async queriesOnlyOwnRecords() {
    const user = await User.create({ email: "a@x.com" } as any);
    const ident = new Ident({ ...Ident.key("a@x.com", "email"), email: "a@x.com" } as any);
    ident.setUser(user.getUUID());
    await Ident.getRepository().create(ident);
    assert.deepStrictEqual(
      (await User.query("")).results.map(u => u.getUUID()),
      [user.getUUID()]
    );
    assert.deepStrictEqual(
      (await Ident.query("")).results.map(i => i.getUUID()),
      ["a@x.com:email"]
    );
    // store level find uses the same filtered listing
    const store: any = this.getService("Files");
    const found = await store.find({ filter: { eval: () => true }, limit: 10 } as any);
    assert.deepStrictEqual(
      found.results.map((u: any) => u.getUUID()),
      [user.getUUID()]
    );
  }

  @test
  async corruptedOwnFileRejects() {
    await User.create({ email: "b@x.com" } as any);
    fs.writeFileSync(path.join(folder, "broken.json"), "{not json");
    await assert.rejects(() => User.query(""));
  }

  @test
  async v3RecordsLoadAndQuery() {
    // v3 FileStore layout: plain JSON files, idents keyed "<uid>_<provider>"
    const write = (key: string, row: any) => fs.writeFileSync(path.join(folder, `${key}.json`), JSON.stringify(row));
    write("v3user", { uuid: "v3user", __type: "Webda/User", email: "o_ld@x.com", __password: "$2a$10$abc" });
    write("o_ld@x.com_email", {
      uuid: "o_ld@x.com_email",
      __type: "Webda/Ident",
      _type: "email",
      _user: "v3user",
      email: "o_ld@x.com"
    });
    const ident = new Ident({ ...Ident.key("123", "google") } as any);
    ident.setUser("v3user");
    await Ident.getRepository().create(ident);
    // v3 users hydrate as User, the v3 password mapped
    const user: any = await User.ref("v3user").get();
    assert.ok(user instanceof User);
    assert.strictEqual(user.password.__hash, "$2a$10$abc");
    // Ident queries see v3 records as legacy idents instead of throwing
    const results = (await Ident.query("_user = ?", ["v3user"])).results;
    assert.deepStrictEqual(results.map(i => i.getLegacyUID() ?? i.getUUID()).sort(), [
      "123:google",
      "o_ld@x.com_email"
    ]);
    assert.deepStrictEqual(
      (await User.query("")).results.map(u => u.getUUID()),
      ["v3user"]
    );
    // and stay addressable by their v3 key
    assert.ok(await Ident.ref("o_ld@x.com_email" as any).exists());
    await Ident.ref("o_ld@x.com_email" as any).delete();
    assert.ok(!fs.existsSync(path.join(folder, "o_ld@x.com_email.json")));
    assert.ok(fs.existsSync(path.join(folder, "123:google.json")));
  }
}
