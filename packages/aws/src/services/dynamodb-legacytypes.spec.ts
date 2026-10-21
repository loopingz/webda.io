import { DynamoDB } from "@aws-sdk/client-dynamodb";
import {
  checkLegacyTypeLease,
  checkLegacyTypeMigration,
  checkLegacyTypeNormalization,
  checkLegacyTypeResume,
  checkLegacyTypeStartup,
  checkLegacyTypeVisibility,
  registerLegacyTypeFixtures,
  type LegacyTypesHarness
} from "@webda/core/lib/test/index.js";
import { useModel } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { localstackParams, WebdaAwsTest } from "../../test/fixture.js";
import { DynamoStore, DynamoStoreParameters } from "./dynamodb.service.js";

/**
 * Create an empty table keyed by `uuid`, dropping any previous one
 * @param TableName - the table
 */
async function createTable(TableName: string): Promise<void> {
  const dynamodb = new DynamoDB(localstackParams);
  await dynamodb.deleteTable({ TableName }).catch(() => undefined);
  await dynamodb.createTable({
    TableName,
    BillingMode: "PAY_PER_REQUEST",
    KeySchema: [{ AttributeName: "uuid", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "uuid", AttributeType: "S" }]
  });
}

/**
 * The legacy types conformance suite of `@webda/core`, on DynamoDB: Webda 3 items of a table shared by two models
 */
@suite
class DynamoStoreLegacyTypesTest extends WebdaAwsTest {
  tables: string[] = [];

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * Create a store on a fresh table
   * @param name - service name
   * @param models - the `models` parameter
   * @param parameters - extra parameters
   * @returns the store
   */
  async createStore(name: string, models: string[], parameters: Record<string, any> = {}): Promise<DynamoStore> {
    const table = `webda-legacy-${name.toLowerCase()}`;
    await createTable(table);
    this.tables.push(table);
    const store = new DynamoStore(
      name,
      new DynamoStoreParameters().load({ ...localstackParams, table, models, ...parameters })
    );
    this.registerService(store as any, name);
    await store.resolve().init();
    return store;
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters) => (await this.createStore(name, models, parameters)) as any,
    seedRaw: async (store, table, rows) => {
      for (const { key, data } of rows) {
        await (store as DynamoStore)._client.put({ TableName: table, Item: { ...data, uuid: key } });
      }
    }
  };

  async afterAll() {
    const dynamodb = new DynamoDB(localstackParams);
    for (const table of this.tables) {
      await dynamodb.deleteTable({ TableName: table }).catch(() => undefined);
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
  async rawAccess() {
    registerLegacyTypeFixtures();
    // A model mapped to its own table owns the untyped items of that table
    const plants = "webda-legacy-rawaccess-plants";
    await createTable(plants);
    this.tables.push(plants);
    const store = await this.createStore("LegacyTypesRawAccess", ["Webda/V3Animal", "Webda/V3Plant"], {
      tables: { "Webda/V3Plant": plants }
    });
    assert.deepStrictEqual(
      store.getRawTables().map(table => [table.name, table.root]),
      [
        ["webda-legacy-legacytypesrawaccess", useModel("Webda/V3Animal")],
        [plants, useModel("Webda/V3Plant")]
      ]
    );
    for (const key of ["k1", "k2", "k3"]) {
      await store._client.put({ TableName: plants, Item: { uuid: key, __type: "V3Plant" } });
    }
    const seen: string[] = [];
    let token: string | undefined;
    do {
      const page = await store.rawPages(plants, 2, token);
      seen.push(...page.rows.map(row => row.key));
      token = page.continuationToken;
    } while (token);
    assert.deepStrictEqual(seen.sort(), ["k1", "k2", "k3"]);
    await store.rawPatch(plants, "k2", { __type: "Webda/V3Plant", note: "$literal" });
    assert.deepStrictEqual((await store._client.get({ TableName: plants, Key: { uuid: "k2" } })).Item, {
      uuid: "k2",
      __type: "Webda/V3Plant",
      note: "$literal"
    });
    await assert.rejects(() => store.rawPatch(plants, "missing", { __type: "X" }), /not found/);
    await assert.rejects(() => store.rawPages("other", 2), /Unknown table/);
  }
}
