import { suite, test } from "@webda/test";
import * as assert from "assert";
import { MemoryStore, StoreParameters, useModel } from "../index.js";
import { WebdaApplicationTest } from "../test/application.js";

/**
 * MemoryStore model wiring and the Webda 3 → 4 types migration
 *
 * The former tests of this file exercised the Webda 3 store API (`_get`, `put`, `getAll`, `setModel`,
 * `forceModel`, `defaultModel`, `cleanModelAliases`) that Webda 4 removed.
 */
@suite
class MemoryStoreModelsTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return "../../sample-app/webda.config.jsonc";
  }

  @test
  async additionalModels() {
    const subProject = useModel("WebdaDemo/SubProject");
    const project = useModel("WebdaDemo/Project");
    let store = new MemoryStore(
      "additionalModel",
      new StoreParameters().load({ model: "WebdaDemo/SubProject" })
    ).resolve();
    assert.strictEqual(store.handleModel(project), -1);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), -1);
    store = new MemoryStore(
      "additionalModel",
      new StoreParameters().load({
        model: "WebdaDemo/SubProject",
        additionalModels: ["WebdaDemo/Project"]
      })
    ).resolve();
    assert.strictEqual(store.handleModel(project), 0);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), 1);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/SubSubProject")), 2);
    store = new MemoryStore(
      "additionalModel",
      new StoreParameters().load({
        model: "WebdaDemo/SubProject",
        additionalModels: ["WebdaDemo/Project"],
        strict: true
      })
    ).resolve();
    // Strict only drops the subclasses: the explicitly listed Project is still handled
    assert.strictEqual(store.handleModel(project), 0);
    assert.strictEqual(store.handleModel(subProject), 0);
    assert.strictEqual(store.handleModel(useModel("WebdaDemo/AnotherSubProject")), -1);
  }

  @test
  removedParameters() {
    const parameters: any = new StoreParameters().load({ models: ["Webda/User"] });
    assert.strictEqual(parameters.defaultModel, undefined);
    assert.strictEqual(parameters.forceModel, undefined);
    assert.strictEqual(parameters.modelAliases, undefined);
    assert.deepStrictEqual(parameters.typeCheck, { enabled: true, maxRows: 10000 });
  }

  /**
   * Webda 3 rows of Webda/User stamped with the forms Webda 3 wrote: the short `User` resolves to the application
   * WebdaDemo/User first, the lower-case `webda/user` to the framework Webda/User
   */
  @test
  async migration() {
    const store: MemoryStore = await this.addService(MemoryStore, { models: ["Webda/User"] } as any, "LegacyUsers");
    for (let i = 0; i < 1200; i++) {
      const __type = i % 10 === 0 ? "webda/user" : i % 2 === 0 ? "User" : "Webda/User";
      store.storage.set(`id_${i}`, JSON.stringify({ uuid: `id_${i}`, __type, email: `u${i}@x.com` }));
    }
    const report = await store.migrateTypes({ batchSize: 500 });
    assert.deepStrictEqual(report.tables.LegacyUsers, {
      scanned: 1200,
      updated: 600,
      byChange: { "webda/user → Webda/User": 120, "User → WebdaDemo/User": 480 },
      unknown: {}
    });
    for (let i = 0; i < 1200; i++) {
      const expected = i % 10 === 0 || i % 2 === 1 ? "Webda/User" : "WebdaDemo/User";
      assert.strictEqual(JSON.parse(store.storage.get(`id_${i}`)!).__type, expected, `id_${i}`);
    }
    const progress = (await store.getMigrationProgress("types"))!;
    assert.strictEqual(progress.done, true);
    assert.strictEqual(progress.scanned, 1200);
    await store.deleteMigrationProgress("types");
    assert.strictEqual(await store.getMigrationProgress("types"), undefined);
    const again = await store.migrateTypes({ batchSize: 500 });
    assert.strictEqual(again.tables.LegacyUsers.updated, 0);
  }
}
