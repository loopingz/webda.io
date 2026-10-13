import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { useApplication } from "@webda/core";
import {
  WebdaApplicationTest,
  checkLegacyTypeLease,
  checkLegacyTypeMigration,
  checkLegacyTypeNormalization,
  checkLegacyTypeResume,
  checkLegacyTypeStartup,
  checkLegacyTypeVisibility,
  registerLegacyTypeFixtures,
  LEGACY_TYPE_MODELS,
  LEGACY_TYPE_ROWS,
  type LegacyTypesHarness
} from "@webda/core/lib/test";
import { FileStore, FileStoreParameters } from "./filestore.service.js";

@suite
class FileStoreLegacyTypesTest extends WebdaApplicationTest {
  folders: string[] = [];

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters = {}) => {
      const folder = fs.mkdtempSync(path.join(os.tmpdir(), "fs-legacy-"));
      this.folders.push(folder);
      const store = new FileStore(name, new FileStoreParameters().load({ folder, models, ...parameters }));
      this.registerService(store as any, name);
      await store.resolve().init();
      return store as any;
    },
    seedRaw: async (store, _table, rows) => {
      const folder = (store as any).getParameters().folder;
      for (const { key, data } of rows) {
        fs.writeFileSync(path.join(folder, `${key}.json`), JSON.stringify(data));
      }
    }
  };

  async afterAll() {
    for (const folder of this.folders) fs.rmSync(folder, { recursive: true, force: true });
    await super.afterAll();
  }

  @test
  visibility() {
    return checkLegacyTypeVisibility(this.harness);
  }

  @test
  normalization() {
    return checkLegacyTypeNormalization(this.harness);
  }

  @test
  migration() {
    return checkLegacyTypeMigration(this.harness);
  }

  @test
  resume() {
    return checkLegacyTypeResume(this.harness);
  }

  @test
  lease() {
    return checkLegacyTypeLease(this.harness);
  }

  @test
  startup() {
    return checkLegacyTypeStartup(this.harness);
  }

  @test
  async rawAccessReadsTheFolder() {
    // A half-written file is reported, not fatal
    const store: any = await this.harness.createStore("fsRaw", ["Webda/RegistryEntry"]);
    const folder = store.getParameters().folder;
    fs.writeFileSync(path.join(folder, "b.json"), JSON.stringify({ uuid: "b", __type: "V3Animal" }));
    fs.writeFileSync(path.join(folder, "a.json"), "{not json");
    const page = await store.rawPages("fsRaw", 10);
    assert.deepStrictEqual(
      page.rows.map((row: any) => [row.key, row.unreadable ?? false]),
      [
        ["a", true],
        ["b", false]
      ]
    );
    await store.rawPatch("fsRaw", "b", { __type: "Webda/V3Animal" });
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(folder, "b.json"), "utf-8")).__type, "Webda/V3Animal");
    assert.deepStrictEqual(
      store.getRawTables().map((table: any) => table.name),
      ["fsRaw"]
    );
  }

  @test
  async strictReadsResolveLegacyTypes() {
    registerLegacyTypeFixtures();
    const store: any = await this.harness.createStore("fsStrict", ["Webda/V3Animal"], { strict: true });
    const folder = store.getParameters().folder;
    fs.writeFileSync(path.join(folder, "a.json"), JSON.stringify({ uuid: "a", __type: "v3animal" }));
    fs.writeFileSync(path.join(folder, "d.json"), JSON.stringify({ uuid: "d", __type: "v3dog" }));
    assert.strictEqual((await store._get("a")).uuid, "a");
    assert.strictEqual(await store._get("d"), undefined);
    // An untyped row names no model: a strict store does not serve it
    fs.writeFileSync(path.join(folder, "u.json"), JSON.stringify({ uuid: "u" }));
    assert.strictEqual(await store._get("u"), undefined);
  }

  @test
  async migrateCommandRewritesTheFolder() {
    registerLegacyTypeFixtures();
    const store: any = await this.harness.createStore("fsMigrate", LEGACY_TYPE_MODELS);
    const folder = store.getParameters().folder;
    await this.harness.seedRaw(store, "fsMigrate", LEGACY_TYPE_ROWS);
    const typeOf = (key: string) => JSON.parse(fs.readFileSync(path.join(folder, `${key}.json`), "utf-8")).__type;
    // The unknown row fails the command unless allowed; a dry run writes nothing
    assert.strictEqual(await store.migrate(true, 4, false), 1);
    assert.strictEqual(typeOf("a2"), "V3Animal");
    assert.strictEqual(await store.migrate(false, 4, true), 0);
    assert.strictEqual(typeOf("a2"), "Webda/V3Animal");
    assert.strictEqual(typeOf("u1"), "Gone/Model");
  }

  @test
  moduleDeclaresTheComposableCommand() {
    const file: any = useApplication().getModules().moddas["Webda/FileStore"];
    assert.deepStrictEqual(Object.keys(file.commands.migrate.args), ["dryRun", "batch", "allowUnknown"]);
    assert.ok(file.capabilities.includes("store"));
  }
}
