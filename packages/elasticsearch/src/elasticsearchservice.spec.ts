import { suite, test } from "@testdeck/mocha";
import { Store } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import { ElasticSearchService, ESUnknownIndexError } from "./elasticsearchservice";
import * as assert from "assert";

@suite
class ElasticSearchTest extends WebdaTest {
  service: ElasticSearchService;
  store: Store;

  async before() {
    await super.before();
    this.service = this.getService<ElasticSearchService>("ESService");
    this.store = this.getService<Store>("MemoryStore");
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
    ElasticSearchService.getModda();
    this.service.getClient();
    this.service.setRefreshMode(true);

    // Should display an ERROR msg
    this.service.getParameters().indexes["articles"].store = "plop";
    this.service.resolve();
  }

  @test
  flatten() {
    assert.deepStrictEqual(ElasticSearchService.flatten([1, [2, 3], [4, [5, 6]]]), [1, 2, 3, 4, 5, 6]);
  }

  @test
  async bulk() {
    let objects = [];
    for (let i = 0; i < 1000; i++) {
      objects.push({
        body: `test${i}`.repeat(50),
        title: `Article ${i}`
      });
    }
    await this.service.bulk("articles", objects);
    await this.service.bulk("articles", {
      items: objects
    });
    // @ts-ignore
    this.service.getClient = () => {
      return {
        create: async () => {
          let err = new Error();
          // @ts-ignore
          err.statusCode = 409;
          throw err;
        }
      };
    };
    await this.service.bulk("articles", {
      items: objects.map(doc => [{ index: { _index: "articles", _id: doc.id } }, doc])
    });
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
    let results = await this.service.search("articles", "*");
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].items.length, 1);
    assert.strictEqual(results[0].items[0].name, "item2");
    assert.strictEqual(results[0].counter, 3);
    assert.strictEqual(results[0].toRemove, undefined);
    assert.strictEqual(results[0].toAdd, "ADDED");
    assert.strictEqual(results[0].status, "TESTED");
  }
}
