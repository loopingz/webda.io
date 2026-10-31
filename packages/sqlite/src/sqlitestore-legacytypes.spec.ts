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
  startup() {
    return checkLegacyTypeStartup(this.harness);
  }
}
