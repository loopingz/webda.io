import { suite, test } from "@webda/test";
import * as assert from "node:assert";
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
import PostgresStore, { PostgresParameters } from "./postgresstore.service.js";

const params = {
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000,
    max: 2
  }
};

/**
 * The legacy types conformance suite of `@webda/core`, on PostgreSQL: Webda 3 rows of a table shared by two models
 */
@suite
class PostgresStoreLegacyTypesTest extends WebdaApplicationTest {
  stores: PostgresStore[] = [];

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters = {}) => {
      const table = `legacy_${name.toLowerCase()}`;
      const store = new PostgresStore(name, new PostgresParameters().load({ ...params, table, models, ...parameters }));
      this.registerService(store as any, name);
      await store.resolve().init();
      await store.getClient().query(`DELETE FROM ${table}`);
      this.stores.push(store);
      return store as any;
    },
    seedRaw: async (store, table, rows) => {
      for (const { key, data } of rows) {
        await (store as any)
          .getClient()
          .query(
            `INSERT INTO ${table}(uuid, data) VALUES($1, $2) ON CONFLICT (uuid) DO UPDATE SET data = EXCLUDED.data`,
            [key, JSON.stringify(data)]
          );
      }
    }
  };

  async afterAll() {
    for (const store of this.stores) {
      for (const table of store.getRawTables()) {
        await store.getClient().query(`DROP TABLE IF EXISTS ${table.name}`);
      }
      await store.stop();
    }
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
  async uuidTypedKeyColumn() {
    // Webda 3 created some tables with a `uuid` column of type uuid: raw pages compare keys in the column type
    const table = "legacy_uuid_column";
    const store = new PostgresStore("LegacyUuidColumn", new PostgresParameters().load({ ...params, table }));
    const client = new (await import("pg")).default.Client(params.postgresqlServer);
    await client.connect();
    try {
      await client.query(`DROP TABLE IF EXISTS ${table}`);
      await client.query(`CREATE TABLE ${table} (uuid uuid NOT NULL PRIMARY KEY, data jsonb)`);
      const keys = [
        "0b6f6d2e-8a3a-4c4e-9c1e-3f5a2b7c9d01",
        "5d1c2b3a-4e5f-4a6b-8c7d-9e0f1a2b3c4d",
        "c1bc2782-98dc-45c5-96fd-8a0c37ce3fde"
      ];
      for (const key of keys) {
        await client.query(`INSERT INTO ${table}(uuid, data) VALUES($1, $2)`, [
          key,
          JSON.stringify({ uuid: key, __type: "User" })
        ]);
      }
      this.registerService(store as any, "LegacyUuidColumn");
      await store.resolve().init();
      const seen: string[] = [];
      let token: string | undefined;
      do {
        const page = await store.rawPages(table, 2, token);
        seen.push(...page.rows.map(row => row.key));
        token = page.continuationToken;
      } while (token);
      assert.deepStrictEqual(seen, keys);
      await store.rawPatch(table, keys[1], { __type: "Webda/User" });
      const res = await client.query(`SELECT data->>'__type' AS t FROM ${table} WHERE uuid = $1`, [keys[1]]);
      assert.strictEqual(res.rows[0].t, "Webda/User");
    } finally {
      await store.stop();
      await client.query(`DROP TABLE IF EXISTS ${table}`);
      await client.end();
    }
  }
}
