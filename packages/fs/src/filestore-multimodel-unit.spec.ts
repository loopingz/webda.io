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
}
