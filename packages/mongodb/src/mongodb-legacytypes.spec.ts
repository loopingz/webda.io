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
import { useModel } from "@webda/core";
import { MongoParameters, MongoStore } from "./mongodb.service.js";

const MONGO_URL = "mongodb://root:webda.io@localhost:37017";

/**
 * The legacy types conformance suite of `@webda/core`, on MongoDB: Webda 3 documents of a collection shared by two
 * models
 */
@suite
class MongoStoreLegacyTypesTest extends WebdaApplicationTest {
  stores: MongoStore[] = [];

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters = {}) => {
      const store = new MongoStore(
        name,
        new MongoParameters().load({
          mongoUrl: MONGO_URL,
          database: "webda-test",
          collection: `legacy_${name.toLowerCase()}`,
          models,
          ...parameters
        })
      );
      this.registerService(store as any, name);
      await store.resolve().init();
      await store.__clean();
      this.stores.push(store);
      return store as any;
    },
    seedRaw: async (store, table, rows) => {
      const collection = await (store as MongoStore)._connect();
      assert.strictEqual(table, collection.collectionName);
      for (const { key, data } of rows) {
        await collection.replaceOne({ _id: <any>key }, { ...data }, { upsert: true });
      }
    }
  };

  async afterAll() {
    for (const store of this.stores) {
      await (await store._connect()).drop().catch(() => undefined);
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
  async rawAccess() {
    const store = await this.harness.createStore("LegacyTypesRaw", ["Webda/V3Animal"]);
    const table = store.getRawTables()![0].name;
    const collection = await (store as MongoStore)._connect();
    assert.strictEqual(table, collection.collectionName);
    await collection.insertMany([
      { _id: <any>"k1", uuid: "k1", __type: "V3Animal" },
      { _id: <any>"k2", uuid: "k2" },
      { _id: <any>"k3", uuid: "k3", __type: "V3Animal" }
    ]);
    const seen: string[] = [];
    let token: string | undefined;
    do {
      const page = await store.rawPages(table, 2, token);
      seen.push(...page.rows.map(row => row.key));
      for (const row of page.rows) assert.strictEqual(row.data._id, undefined, "_id is the key, not data");
      token = page.continuationToken;
    } while (token);
    assert.deepStrictEqual(seen, ["k1", "k2", "k3"]);
    await store.rawPatch(table, "k2", { __type: "Webda/V3Animal" });
    assert.deepStrictEqual(await collection.findOne({ _id: <any>"k2" }), {
      _id: "k2",
      uuid: "k2",
      __type: "Webda/V3Animal"
    });
    await assert.rejects(() => store.rawPatch(table, "missing", { __type: "X" }), /not found/);
    // A patch keeps an untyped document untyped and stores `$`-prefixed values as data
    await collection.insertOne({ _id: <any>"k4", uuid: "k4", name: "untyped" });
    await (useModel("Webda/V3Animal") as any).ref("k4").patch({ name: "$name" });
    assert.deepStrictEqual(await collection.findOne({ _id: <any>"k4" }), { _id: "k4", uuid: "k4", name: "$name" });
    await assert.rejects(() => store.rawPages("other", 2), /Unknown table/);
  }

  @test
  async migrateCommand() {
    const store = (await this.harness.createStore("LegacyTypesMigrate", ["Webda/V3Animal"])) as MongoStore;
    const collection = await store._connect();
    const typeOf = async () => (await collection.findOne({ _id: <any>"m1" }))!.__type;
    await collection.insertOne({ _id: <any>"m1", uuid: "m1", __type: "V3Animal" });
    assert.strictEqual(await store.migrate(true, 10, true), 0);
    assert.strictEqual(await typeOf(), "V3Animal", "a dry run writes nothing");
    assert.strictEqual(await store.migrate(), 0);
    assert.strictEqual(await typeOf(), "Webda/V3Animal");
  }
}
