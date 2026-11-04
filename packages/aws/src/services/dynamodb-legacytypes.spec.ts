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
import { DynamoRepository, DynamoStore, DynamoStoreParameters } from "./dynamodb.service.js";

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
    // A patch of the key alone writes nothing
    await store.rawPatch(plants, "k1", { uuid: "other" });
    assert.deepStrictEqual((await store._client.get({ TableName: plants, Key: { uuid: "k1" } })).Item, {
      uuid: "k1",
      __type: "V3Plant"
    });
    // An unknown identifier in models owns no table
    store.getParameters().models.push("Unknown/Model");
    assert.strictEqual((store as any).tableRootOf("nowhere"), undefined);
  }

  @test
  async rawAccessFailures() {
    const store = await this.createStore("LegacyTypesRawFailures", ["Webda/V3Animal"]);
    const table = store.getRawTables()[0].name;
    const { scan, update } = store._client;
    try {
      // A scan page without items
      store._client.scan = (async () => ({})) as any;
      assert.deepStrictEqual(await store.rawPages(table, 2), { rows: [], continuationToken: undefined });
      // Any failure but a missing row is raised
      store._client.update = (async () => {
        throw new Error("Throughput exceeded");
      }) as any;
      await assert.rejects(() => store.rawPatch(table, "k1", { __type: "X" }), /Throughput exceeded/);
    } finally {
      store._client.scan = scan;
      store._client.update = update;
    }
  }

  @test
  async migrateCommand() {
    registerLegacyTypeFixtures();
    const store = await this.createStore("LegacyTypesMigrate", ["Webda/V3Animal"]);
    const table = store.getRawTables()[0].name;
    const typeOf = async () => (await store._client.get({ TableName: table, Key: { uuid: "m1" } })).Item!.__type;
    await store._client.put({ TableName: table, Item: { uuid: "m1", __type: "V3Animal" } });
    assert.strictEqual(await store.migrate(true, 10, true), 0);
    assert.strictEqual(await typeOf(), "V3Animal", "a dry run writes nothing");
    assert.strictEqual(await store.migrate(), 0);
    assert.strictEqual(await typeOf(), "Webda/V3Animal");
  }

  @test
  async legacyTypeRewriteEdgeCases() {
    registerLegacyTypeFixtures();
    const store = await this.createStore("LegacyTypesEdges", ["Webda/V3Animal"]);
    const table = store.getRawTables()[0].name;
    const Animal: any = useModel("Webda/V3Animal");
    const item = async (uuid: string) => (await store._client.get({ TableName: table, Key: { uuid } })).Item;
    // An untyped item and an empty type are left as they are by a patch
    await store._client.put({ TableName: table, Item: { uuid: "e1", name: "a" } });
    await store._client.put({ TableName: table, Item: { uuid: "e2", __type: "", name: "a" } });
    await store.getRepository(Animal).patch("e1", { name: "b" });
    await store.getRepository(Animal).patch("e2", { name: "b" });
    assert.deepStrictEqual(await item("e1"), { uuid: "e1", name: "b" });
    assert.deepStrictEqual(await item("e2"), { uuid: "e2", __type: "", name: "b" });
    // Rewritten meanwhile: the conditioned rewrite is skipped
    const repo: any = new DynamoRepository(Animal, ["uuid"], store._client, table);
    await store._client.put({ TableName: table, Item: { uuid: "e3", __type: "Webda/V3Animal" } });
    await repo.rewriteLegacyType("e3", "V3Animal");
    assert.strictEqual((await item("e3"))!.__type, "Webda/V3Animal");
    // Any other failure is raised
    const { update } = store._client;
    try {
      store._client.update = (async () => {
        throw new Error("Throughput exceeded");
      }) as any;
      await assert.rejects(() => repo.rewriteLegacyType("e3", "V3Animal"), /Throughput exceeded/);
    } finally {
      store._client.update = update;
    }
    // A type that is not a string hydrates as the repository model and keeps the stored value
    const odd = repo.fromItem({ uuid: "e4", __type: 5 });
    assert.ok(odd instanceof Animal);
    assert.strictEqual(odd.__type, 5);
  }
}
