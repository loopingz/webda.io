import { suite, test } from "@testdeck/mocha";
import { CoreModel, CoreModelDefinition, MemoryStore, Store } from "@webda/core";
import { WebdaSimpleTest } from "@webda/core/lib/test";
import * as assert from "assert";
import { ESUnknownIndexError, ElasticSearchService } from "./elasticsearchservice";

type TestCoreModel = CoreModel & {
  uuid: string;
  status: string;
  toRemove: string;
  toAdd: string;
  counter: number;
  items: any[];
};
@suite
class ElasticSearchTest extends WebdaSimpleTest {
  service: ElasticSearchService;
  store: Store<TestCoreModel>;

  async before() {
    await super.before();
    await this.createServices();
  }

  async createServices() {
    this.store = await this.registerService(new MemoryStore<TestCoreModel>(this.webda, "MemoryStore", {}))
      .resolve()
      .init();
    this.service = await this.registerService(
      new ElasticSearchService(this.webda, "ESService", {
        client: {
          node: "http://localhost:9200"
        },
        indexes: {
          articles: {
            store: "MemoryStore",
            url: "/articles/search"
          }
        }
      })
    )
      .resolve()
      .init();

    try {
      await this.service.__clean();
    } catch (err) {
      console.log(err);
    }
  }

  @test
  async testStore() {
    const model: any = await this.store.save({});
    model.testor = "plop";
    this.service.setRefreshMode("wait_for");
    await this.store.update(model);
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("articles", model.getUuid()));
    assert.strictEqual(await this.service.count("articles"), 1);
    let results = await this.service.search("articles", {
      query: { match_all: {} }
    });
    assert.strictEqual(results.length, 1);
    results = await this.service.search("articles", "*");
    assert.strictEqual(results.length, 1);
    //assert.strictEqual(results[0].testor, "plop");
    await this.store.delete(model);
    await this.waitAsyncEnded();
    assert.ok(!(await this.service.exists("articles", model.getUuid())));
    await this.waitAsyncEnded();

    // Some documents get be created on init so no test on 0
    await this.service.count();
    assert.strictEqual(await this.service.count("articles"), 0);
  }

  async waitAsyncEnded() {
    await this.service.flush("articles");
  }

  @test
  async badIndex() {
    const methods = ["search", "exists", "count"];
    for (const m of methods) {
      await assert.rejects(() => this.service[m]("notexisting"), /Unknown index "notexisting"/);
    }
  }

  @test
  cov() {
    this.service.getClient();
    this.service.setRefreshMode(true);

    // Should display an ERROR msg
    this.service.getParameters().indexes["articles"].store = "plop";
    // @ts-ignore
    this.service.getParameters().indexes["projects"] = {
      model: "plop"
    };
    this.service.resolve();
  }

  @test
  async partialUpdate() {
    const model: any = await this.store.save({ toRemove: "REMOVED?", items: [] });
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
    await this.store.upsertItemToCollection(model.getUuid(), "items", {
      name: "item1"
    });
    await this.waitAsyncEnded();
    await this.store.upsertItemToCollection(model.getUuid(), "items", {
      name: "item2"
    });
    await this.waitAsyncEnded();
    this.store.deleteItemFromCollection(model.getUuid(), "items", 0, undefined, undefined);

    await this.waitAsyncEnded();
    // Have to wait 1s for now...
    await this.sleep(1000);
    const results = await this.service.search<TestCoreModel>("articles", "*");
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
    const store = this.webda.getService<Store>("MemoryStore");
    const es = new ElasticSearchService(this.webda, "ESService", {
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
    const store = this.webda.getService<Store>("MemoryStore");
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
  }
}

@suite
class ModelElasticSearchTest extends WebdaSimpleTest {
  service: ElasticSearchService;
  store: Store<TestCoreModel>;
  SubProject: CoreModelDefinition<CoreModel & { name: string }>;
  Project: CoreModelDefinition<CoreModel & { name: string }>;

  async before() {
    await super.before();
    this.Project = <any>this.webda.getModels()["WebdaDemo/Project"];
    this.SubProject = <any>this.webda.getModels()["WebdaDemo/SubProject"];
    this.store = await this.registerService(
      new MemoryStore<TestCoreModel>(this.webda, "MemoryStore", {
        model: "WebdaDemo/Project"
      })
    )
      .resolve()
      .init();
  }

  @test
  async reindex() {
    const indexName = `projects_${Date.now()}`;
    await this.SubProject.ref("subproject_1").getOrCreate({
      name: "subproject_1"
    });
    await this.SubProject.ref("subproject_2").getOrCreate({
      name: "subproject_2"
    });
    // create a project
    await this.Project.ref("project_1").getOrCreate({ name: "project_1" });
    await this.Project.ref("project_2").getOrCreate({ name: "project_2" });
    this.service = await this.registerService(
      new ElasticSearchService(this.webda, "ESService", {
        client: {
          node: "http://localhost:9200"
        },
        indexes: {
          [indexName]: {
            model: "WebdaDemo/SubProject",
            url: "/projects/search"
          }
        }
      })
    )
      .resolve()
      .init();

    try {
      await this.service.__clean();
    } catch (err) {
      console.log(err);
    }
    await this.service.reindex(indexName);
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists(indexName, "subproject_1"));
    assert.ok(await this.service.exists(indexName, "subproject_2"));
    assert.ok(!(await this.service.exists(indexName, "project_1")));
    assert.ok(!(await this.service.exists(indexName, "project_2")));
  }

  async waitAsyncEnded() {
    try {
      await this.service.flush("projects");
    } catch (err) {}
  }

  @test
  async testModel() {
    const indexName = `projects_${Date.now()}`;
    this.service = await this.registerService(
      new ElasticSearchService(this.webda, "ESService", {
        client: {
          node: "http://localhost:9200"
        },
        indexes: {
          [indexName]: {
            model: "WebdaDemo/SubProject",
            url: "/projects/search"
          }
        }
      })
    )
      .resolve()
      .init();

    try {
      await this.service.__clean();
    } catch (err) {
      console.log(err);
    }
    await this.waitAsyncEnded();
    // create a subproject
    const model = await this.SubProject.ref("subproject_1").getOrCreate({
      name: "subproject_1"
    });
    // create a project
    await this.Project.ref("project_1").getOrCreate({ name: "project_1" });
    this.service.setRefreshMode("wait_for");
    await model.patch({ name: "subproject_1b" });
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists(indexName, model.getUuid()));
    assert.ok(!(await this.service.exists(indexName, "project_1")));
    //assert.strictEqual(await this.service.count("projects"), 1);
    let results = await this.service.search(indexName, {
      query: { match_all: {} }
    });
    assert.strictEqual(results.length, 1);
    results = await this.service.search(indexName, "*");
    assert.strictEqual(results.length, 1);
    //assert.strictEqual(results[0].testor, "plop");
    await model.delete();
    await this.waitAsyncEnded();
    assert.ok(!(await this.service.exists(indexName, model.getUuid())));
    await this.waitAsyncEnded();

    // Some documents get be created on init so no test on 0
    assert.strictEqual(await this.service.count(indexName), 0);
  }
}
