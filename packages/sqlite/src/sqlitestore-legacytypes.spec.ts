import { useApplication } from "@webda/core";
import {
  WebdaApplicationTest,
  checkLegacyTypeLease,
  checkLegacyTypeMigration,
  checkLegacyTypeNormalization,
  checkLegacyTypeResume,
  checkLegacyTypeStartup,
  checkLegacyTypeVisibility,
  type LegacyTypesHarness
} from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import { __resetDatabases } from "./dbregistry.js";
import SQLiteStore, { SQLiteStoreParameters } from "./sqlitestore.service.js";

/**
 * The legacy types conformance suite of `@webda/core`, on SQLite: Webda 3 rows of a table shared by two models
 */
@suite
class SQLiteStoreLegacyTypesTest extends WebdaApplicationTest {
  stores: SQLiteStore[] = [];

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters = {}) => {
      const table = `legacy_${name.toLowerCase()}`;
      const store = new SQLiteStore(name, new SQLiteStoreParameters().load({ table, models, ...parameters }));
      this.registerService(store as any, name);
      await store.resolve().init();
      await store.getClient()!.query(`DELETE FROM ${table}`);
      this.stores.push(store);
      return store as any;
    },
    seedRaw: async (store, table, rows) => {
      for (const { key, data } of rows) {
        await (store as any)
          .getClient()
          .query(`INSERT OR REPLACE INTO ${table}(uuid, data) VALUES(?1, ?2)`, [key, JSON.stringify(data)]);
      }
    }
  };

  async afterAll() {
    for (const store of this.stores) {
      await store.stop();
    }
    __resetDatabases();
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
  async startup() {
    await checkLegacyTypeStartup(this.harness);
    const store = this.stores[0];
    if (store) {
      await store.migrate(true, 100, true);
      // Cover SQLStore edge cases (resolveTable/resolveTableModel without metadata, unknown model in models, rawPages unreadable JSON)
      class NoMeta {}
      const app = useApplication();
      (app.getModels() as any)["Test/NoMeta"] = NoMeta;
      (app.getModels() as any)["Test/NullModel"] = undefined;
      const origTable = store.getParameters().table!;
      store.resolveTable("Test/NoMeta" as any);
      store.resolveTableModel("Test/NoMeta" as any);
      const origModels = store.getParameters().models;
      store.getParameters().models = ["Unknown/ModelId"];
      (store as any).tableRootOf(origTable);
      const origHierarchy = store._modelsHierarchy;
      (store as any)._modelsHierarchy = {
        "Unknown/ModelId": {},
        "Test/NullModel": {},
        ...store._modelsHierarchy
      };
      store.getRepositories();
      store.getRawTables();
      store.getParameters().models = origModels;
      (store as any)._modelsHierarchy = origHierarchy;
      delete (app.getModels() as any)["Test/NoMeta"];
      delete (app.getModels() as any)["Test/NullModel"];
      const tbl = store.getRawTables()[0].name;
      await store.getClient()!.query(`INSERT OR REPLACE INTO ${tbl}(uuid, data) VALUES(?1, ?2)`, ["bad-json", "{}"]);
      const origDecode = (store as any).dialect.decode;
      (store as any).dialect.decode = () => {
        throw new Error("corrupt");
      };
      try {
        const page = await store.rawPages(tbl, 10);
        if (!page.rows.some(r => r.unreadable)) {
          throw new Error("Expected unreadable row");
        }
      } finally {
        (store as any).dialect.decode = origDecode;
        await store.getClient()!.query(`DELETE FROM ${tbl} WHERE uuid = ?1`, ["bad-json"]);
      }
    }
  }
}
