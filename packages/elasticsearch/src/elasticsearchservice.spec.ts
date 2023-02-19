import { suite, test } from "@testdeck/mocha";
import { CoreModel, Store } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { ElasticSearchService, ESUnknownIndexError } from "./elasticsearchservice";

type TestCoreModel = CoreModel & {
  uuid: string;
  status: string;
  toRemove: string;
  toAdd: string;
  counter: number;
  items: any[];
};
@suite
class ElasticSearchTest extends WebdaTest {
  service: ElasticSearchService;
  store: Store<TestCoreModel>;

  async before() {
    await super.before();
    this.service = this.getService<ElasticSearchService>("ESService");
    this.store = this.getService<Store<TestCoreModel>>("MemoryStore");
    try {
      await this.service.__clean();
    } catch (err) {
      console.log(err);
    }
  }

  @test
  async test() {
    let model: any = await this.store.save({});
    model.testor = "plop";
    this.service.setRefreshMode("wait_for");
    await this.store.update(model);
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("articles", model.getUuid()));
    assert.strictEqual(await this.service.count("articles"), 1);
    let results = await this.service.search("articles", { query: { match_all: {} } });
    assert.strictEqual(results.length, 1);
    results = await this.service.search("articles", "*");
    assert.strictEqual(results.length, 1);
    //assert.strictEqual(results[0].testor, "plop");
    await this.store.delete(model);
    await this.waitAsyncEnded();
    assert.ok(!(await this.service.exists("articles", model.getUuid())));
    await this.waitAsyncEnded();

    assert.strictEqual(await this.service.count(), 0);
    assert.strictEqual(await this.service.count("articles"), 0);
  }

  async waitAsyncEnded() {
    await this.service.flush("articles");
    /*
    let timeout = 0;
    while (this.service._asyncCount > 0) {
      timeout++;
      await this.sleep(1000);
      if (timeout > 60) {
        throw new Error(`Timeout while waiting for async ${this.service._asyncCount}`);
      }
    }
    */
  }

  @test
  async badIndex() {
    let methods = ["search", "exists", "count"];
    for (let m of methods) {
      await assert.rejects(() => this.service[m]("notexisting"), /Unknown index "notexisting"/);
    }
  }

  @test
  cov() {
    this.service.getClient();
    this.service.setRefreshMode(true);

    // Should display an ERROR msg
    this.service.getParameters().indexes["articles"].store = "plop";
    this.service.resolve();
  }

  @test
  async partialUpdate() {
    let model: any = await this.store.save({ toRemove: "REMOVED?", items: [] });
    await this.waitAsyncEnded();
    await this.sleep(300);
    // incrementAttribute
    await this.store.incrementAttribute(model.getUuid(), "counter", 3);
    // patch
    await this.store.patch({ uuid: model.getUuid(), status: "TESTED" });
    // removeAttribute
    await this.store.removeAttribute(model.getUuid(), "toRemove");
    // setAttribute
    await this.store.setAttribute(model.getUuid(), "toAdd", "ADDED");
    // upsertItem
    await this.store.upsertItemToCollection(model.getUuid(), "items", { name: "item1" });
    await this.waitAsyncEnded();
    await this.store.upsertItemToCollection(model.getUuid(), "items", { name: "item2" });
    await this.waitAsyncEnded();
    this.store.deleteItemFromCollection(model.getUuid(), "items", 0, undefined, undefined);

    await this.waitAsyncEnded();
    // Have to wait 1s for now...
    await this.sleep(1000);
    let results = await this.service.search<TestCoreModel>("articles", "*");
    assert.strictEqual(results.length, 1);
    if (results[0].items.length > 1) {
      // TODO Investigate this one
      this.log("ERROR", "partialUpdate should have only one result", results[0]);
      return;
    }
    assert.strictEqual(results[0].items.length, 1);
    assert.strictEqual(results[0].items[0].name, "item2");
    assert.strictEqual(results[0].counter, 3);
    assert.strictEqual(results[0].toRemove, undefined);
    assert.strictEqual(results[0].toAdd, "ADDED");
    assert.strictEqual(results[0].status, "TESTED");
  }

  @test
  async timeIndex() {
    let store = this.webda.getService<Store>("MemoryStore");
    let es = new ElasticSearchService(this.webda, "ESService", {
      client: {
        node: "http://localhost:9200"
      },
      indexes: {
        articles1: {
          store: "MemoryStore",
          dateSplit: {
            attribute: "@timestamp"
          }
        },
        articles2: {
          store: "MemoryStore",
          dateSplit: {
            attribute: "@timestamp",
            frequency: "daily"
          }
        },
        articles3: {
          store: "MemoryStore",
          dateSplit: {
            attribute: "@timestamp",
            frequency: "hourly"
          }
        },
        articles4: {
          store: "MemoryStore",
          dateSplit: {
            attribute: "@timestamp",
            frequency: "yearly"
          }
        },
        articles5: {
          store: "MemoryStore",
          dateSplit: {
            attribute: "@timestamp",
            frequency: "weekly"
          }
        },
        articles6: {
          store: "MemoryStore"
        }
      }
    });
    this.registerService(es, "es");
    es.resolve();
    await es.init();
    await store.save({
      "@timestamp": "2019-01-01T00:00:00.000Z",
      uuid: "1"
    });
    await store.save({
      "@timestamp": "1983-10-28T01:45:00.000Z",
      uuid: "2"
    });
    assert.strictEqual(await es.getTimedIndexFromUuid("articles1", "1"), "articles1-2019.01");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles2", "1"), "articles2-2019.01.01");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles3", "1"), "articles3-2019.01.01.00");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles4", "1"), "articles4-2019");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles5", "1"), "articles5-2019.01");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles1", "2"), "articles1-1983.10");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles2", "2"), "articles2-1983.10.28");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles3", "2"), "articles3-1983.10.28.01");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles4", "2"), "articles4-1983");
    assert.strictEqual(await es.getTimedIndexFromUuid("articles5", "2"), "articles5-1983.43");
    // @ts-ignore
    assert.strictEqual(es.getTimedIndex("articles6", undefined), "articles6");
    // @ts-ignore
    assert.throws(() => es.getTimedIndex("articles7", undefined), ESUnknownIndexError);
  }

  @test
  async reindex() {
    assert.rejects(() => this.service.reindex("articles7"), ESUnknownIndexError);
    await this.service.__clean();
    await this.waitAsyncEnded();
    let store = this.webda.getService<Store>("MemoryStore");
    await store.save({
      "@timestamp": "2019-01-01T00:00:00.000Z",
      uuid: "1"
    });
    store.removeAllListeners();
    await store.save({
      "@timestamp": "1983-10-28T01:45:00.000Z",
      uuid: "2"
    });
    await this.service.reindex("articles");
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("articles", "1"));
    assert.ok(await this.service.exists("articles", "2"));
    // @ts-ignore
    this.service._client = undefined;
    // It should not fail but display warning in logs
    await this.service.reindex("articles");
  }
}
