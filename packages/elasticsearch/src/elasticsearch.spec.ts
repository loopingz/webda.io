import { suite, test } from "@webda/test";
import { useDynamicService, useModel, useRegistry, useRepository } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { TestApplication } from "@webda/core/lib/test/objects.js";
import * as assert from "assert";
import { ElasticSearchService, ElasticSearchServiceParameters, ESUnknownIndexError } from "./elasticsearch.service.js";

/**
 * Base test registering the ElasticSearchService from sources
 */
class ElasticSearchBaseTest extends WebdaApplicationTest {
  service: ElasticSearchService;

  /**
   * Register the service from sources
   * @param app - the test application
   */
  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    (<any>ElasticSearchService).createConfiguration = (params: any = {}) =>
      new ElasticSearchServiceParameters().load(params);
    app.addModda("Webda/ElasticSearchService", ElasticSearchService);
  }

  /**
   * Retrieve the service and clean the indexes
   */
  async beforeEach() {
    await super.beforeEach();
    this.service = useDynamicService<ElasticSearchService>("ESService");
    this.service.setRefreshMode("wait_for");
    await this.service.__clean();
    for (const name of ["Webda/User", "Webda/SimpleUser"]) {
      const repo = useRepository(<any>useModel(name));
      for (const item of (await repo.query("")).results) {
        await repo.delete(repo.getPrimaryKey(item));
      }
    }
    await useRegistry()
      .delete(`storeMigration.ESService.reindex.users`)
      .catch(() => {});
  }

  /**
   * Make the indexes changes visible
   */
  async waitAsyncEnded() {
    await this.service.flush("users");
    await this.service.flush("simpleusers");
  }

  /**
   * @returns the User model
   */
  get User(): any {
    return useModel("Webda/User");
  }

  /**
   * @returns the SimpleUser model
   */
  get SimpleUser(): any {
    return useModel("Webda/SimpleUser");
  }
}

@suite
class ElasticSearchTest extends ElasticSearchBaseTest {
  @test
  async testModel() {
    const repo = useRepository(this.User);
    await repo.create({ uuid: "user1", testor: "plop" });
    await repo.update({ uuid: "user1", testor: "plop2" });
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("users", "user1"));
    assert.strictEqual(await this.service.count("users"), 1);
    let results = await this.service.search("users", {
      query: { match_all: {} }
    });
    assert.strictEqual(results.length, 1);
    assert.ok(results[0] instanceof this.User);
    assert.strictEqual((<any>results[0]).testor, "plop2");
    results = await this.service.search("users", "*");
    assert.strictEqual(results.length, 1);
    await repo.patch("user1", { status: "PATCHED" });
    await this.waitAsyncEnded();
    assert.strictEqual((<any>(await this.service.search("users", "*"))[0]).status, "PATCHED");
    await repo.delete("user1");
    await this.waitAsyncEnded();
    assert.ok(!(await this.service.exists("users", "user1")));
    // Deleting an unknown document is ignored
    await this.service["onDeleted"](this.service.checkIndex("users"), "unknown");
    // Other errors are thrown
    const deleteMethod = this.service["_delete"];
    this.service["_delete"] = async () => {
      throw new Error("ES down");
    };
    try {
      await assert.rejects(() => this.service["onDeleted"](this.service.checkIndex("users"), "unknown"), /ES down/);
    } finally {
      this.service["_delete"] = deleteMethod;
    }
    // Some documents get be created on init so no test on 0
    await this.service.count();
    assert.strictEqual(await this.service.count("users"), 0);
  }

  @test
  async subModel() {
    await useRepository(this.SimpleUser).create({ uuid: "simple1", name: "simple1" });
    await useRepository(this.User).create({ uuid: "user1", name: "user1" });
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("simpleusers", "simple1"));
    assert.ok(!(await this.service.exists("simpleusers", "user1")));
    assert.ok(await this.service.exists("users", "user1"));
    const results = await this.service.search("simpleusers", "*");
    assert.strictEqual(results.length, 1);
    assert.ok(results[0] instanceof this.SimpleUser);
    // Partial update on a model not indexed
    await useRepository(this.User).incrementAttribute("user1", <any>"counter", 2);
    await this.waitAsyncEnded();
    assert.ok(!(await this.service.exists("simpleusers", "user1")));
  }

  @test
  async badIndex() {
    const methods = ["search", "exists", "count", "reindex", "getTimedIndexFromUuid"];
    for (const m of methods) {
      await assert.rejects(() => this.service[m]("notexisting"), ESUnknownIndexError);
    }
  }

  @test
  async cov() {
    this.service.getClient();
    this.service.setRefreshMode(true);
    const service = new ElasticSearchService(
      "cov",
      new ElasticSearchServiceParameters().load({
        client: { node: "http://localhost:9200" },
        indexes: {
          // Should display an ERROR msg
          projects: { model: "plop" }
        }
      })
    );
    await service.resolve().init();
    assert.throws(() => service.checkIndex("projects"), ESUnknownIndexError);
    await service.stop();
  }

  @test
  async partialUpdate() {
    const repo = useRepository(this.User);
    await repo.create({ uuid: "user1", toRemove: "REMOVED?", items: [] });
    await repo.incrementAttribute("user1", <any>{ property: "counter", value: 3 });
    await repo.incrementAttributes("user1", <any>{ counter2: 2 });
    await repo.incrementAttributes("user1", <any>["counter3"]);
    await repo.patch("user1", { status: "TESTED" });
    await repo.removeAttribute("user1", <any>"toRemove");
    await repo.setAttribute("user1", <any>"toAdd", "ADDED");
    await repo.upsertItemToCollection("user1", <any>"items", { name: "item1" });
    await repo.upsertItemToCollection("user1", <any>"items", { name: "item2" });
    await repo.upsertItemToCollection("user1", <any>"items", { name: "item3" });
    await repo.upsertItemToCollection("user1", <any>"items", { name: "item2b" }, 1);
    await repo.deleteItemFromCollection("user1", <any>"items", 0);
    await this.waitAsyncEnded();
    const results = await this.service.search<any>("users", "*");
    assert.strictEqual(results.length, 1);
    assert.deepStrictEqual(
      results[0].items.map(i => i.name),
      ["item2b", "item3"]
    );
    assert.strictEqual(results[0].counter, 3);
    assert.strictEqual(results[0].counter2, 2);
    assert.strictEqual(results[0].counter3, 1);
    assert.strictEqual(results[0].toRemove, undefined);
    assert.strictEqual(results[0].toAdd, "ADDED");
    assert.strictEqual(results[0].status, "TESTED");
  }

  @test
  async timeIndex() {
    // Create the objects before the service listens to avoid indexing them
    const repo = useRepository(this.User);
    await repo.create({ uuid: "1", timestamp: "2019-01-01T00:00:00.000Z" });
    await repo.create({ uuid: "2", timestamp: "1983-10-28T01:45:00.000Z" });
    const service = new ElasticSearchService(
      "es",
      new ElasticSearchServiceParameters().load({
        client: { node: "http://localhost:9200" },
        indexes: {
          articles1: { model: "Webda/User", dateSplit: { attribute: "timestamp" } },
          articles2: { model: "Webda/User", dateSplit: { attribute: "timestamp", frequency: "daily" } },
          articles3: { model: "Webda/User", dateSplit: { attribute: "timestamp", frequency: "hourly" } },
          articles4: { model: "Webda/User", dateSplit: { attribute: "timestamp", frequency: "yearly" } },
          articles5: { model: "Webda/User", dateSplit: { attribute: "timestamp", frequency: "weekly" } },
          articles6: { model: "Webda/User" }
        }
      })
    );
    await service.resolve().init();
    try {
      assert.strictEqual(await service.getTimedIndexFromUuid("articles1", "1"), "articles1-2019.01");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles2", "1"), "articles2-2019.01.01");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles3", "1"), "articles3-2019.01.01.00");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles4", "1"), "articles4-2019");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles5", "1"), "articles5-2019.01");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles1", "2"), "articles1-1983.10");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles2", "2"), "articles2-1983.10.28");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles3", "2"), "articles3-1983.10.28.01");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles4", "2"), "articles4-1983");
      assert.strictEqual(await service.getTimedIndexFromUuid("articles5", "2"), "articles5-1983.43");
      assert.strictEqual(service.getTimedIndex("articles6", undefined), "articles6");
      assert.throws(() => service.getTimedIndex("articles7", undefined), ESUnknownIndexError);
    } finally {
      await service.stop();
    }
  }

  @test
  async reindex() {
    const repo = useRepository(this.User);
    // Stop listening so the documents are only indexed by reindex
    this.service["removeListeners"]();
    await repo.create({ uuid: "1", timestamp: "2019-01-01T00:00:00.000Z" });
    await repo.create({ uuid: "2", timestamp: "1983-10-28T01:45:00.000Z" });
    await useRepository(this.SimpleUser).create({ uuid: "simple1" });
    this.service["setupIndexes"]();
    assert.ok(!(await this.service.exists("users", "1")));
    await this.service.reindex("users");
    await this.service.reindex("simpleusers");
    await this.waitAsyncEnded();
    assert.ok(await this.service.exists("users", "1"));
    assert.ok(await this.service.exists("users", "2"));
    assert.ok(await this.service.exists("simpleusers", "simple1"));
    assert.ok(!(await this.service.exists("simpleusers", "1")));
    assert.strictEqual((await useRegistry().get(`storeMigration.ESService.reindex.users`)).count >= 2, true);
  }
}
