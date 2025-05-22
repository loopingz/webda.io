import { Test } from "mocha";
import { UuidModel } from "./model";
import {
  createModelLinksMap,
  ModelLink,
  ModelLinksArray,
  ModelLinksSimpleArray,
  ModelMapLoaderImplementation
} from "./relations";
import { MemoryRepository } from "./repository";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PrimaryKeyEquals } from "./storable";
import { TestModel } from "./model.spec";

class TestSimpleModel extends UuidModel {
  name: string;
  age: number;

  constructor(data?: { name: string; age: number }) {
    super();
    this.name = data?.name || "";
    this.age = data?.age || 0;
  }
}

@suite
class RelationsTest {
  @test
  async modelRef() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    TestSimpleModel.registerRepository(repo);
    const model = new TestSimpleModel();
    model.setPrimaryKey("test");
    await repo.create("test", model);
    await model.ref().patch({ name: "Test" });
    assert.strictEqual((await model.ref().get()).name, "Test");
    assert.deepStrictEqual(model.ref().getPrimaryKey(), model.getPrimaryKey());
    assert.deepStrictEqual(model.ref().toJSON(), "test");
  }

  @test
  async modelLink() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    TestSimpleModel.registerRepository(repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model.setPrimaryKey("test");
    await repo.create("test", model);
    const link = new ModelLink("test", repo);
    assert.ok(PrimaryKeyEquals(link.getPrimaryKey(), model.getPrimaryKey()));
    assert.ok((await link.get()) instanceof TestSimpleModel);
    assert.strictEqual(link.toJSON(), "test");
    assert.strictEqual(link.toString(), "test");
    link.set("test2");
    assert.ok(!PrimaryKeyEquals(link.getPrimaryKey(), model.getPrimaryKey()));
    await assert.rejects(() => link.get(), /Not found/);
  }

  @test
  async modelMapImplementation() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    const model = new TestSimpleModel();
    model.name = "Test";
    repo.create("test", model);
    const mapper = new ModelMapLoaderImplementation(
      repo,
      {
        uuid: "test"
      },
      model
    );
    assert.strictEqual((await mapper.get()).name, "Test");
  }

  @test
  async modelLinksArray() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    TestSimpleModel.registerRepository(repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model.setPrimaryKey("test");
    await repo.create("test", model);
    const model2 = await repo.create("test2", new TestSimpleModel({ name: "Test2", age: 20 }));
    model2.__WEBDA_DIRTY = new Set();
    let links = new ModelLinksArray<TestSimpleModel, { status: "OK" | "NOK" }>(repo, [], model2);
    links.add({
      uuid: "test",
      status: "OK"
    });
    assert.ok(model2.__WEBDA_DIRTY.size === 0);
    links.remove("test");
    assert.ok(links.length === 0);
    assert.ok(model2.__WEBDA_DIRTY.size === 0);
    model2["fake"] = links;
    links.add({
      uuid: "test",
      status: "OK"
    });
    assert.ok(model2.__WEBDA_DIRTY.has("fake"));
    model2.__WEBDA_DIRTY.clear();
    links.toJSON();
    model2["fake2"] = links;
    delete model2["fake"];
    assert.deepStrictEqual(links[0].toJSON(), {
      uuid: "test",
      status: "OK"
    });
    links.remove(links[0]);
    assert.ok(model2.__WEBDA_DIRTY.has("fake2"));
    assert.ok(links.length === 0);

    // Without parent
    links = new ModelLinksArray<TestSimpleModel, { status: "OK" | "NOK" }>(
      repo,
      [
        {
          uuid: "test",
          status: "OK"
        }
      ],
      model2
    );
    links.add({
      uuid: "test2",
      status: "OK"
    });
    assert.ok(links.length === 2);
    links.remove("test2");
    assert.ok(links.length === 1);
    assert.strictEqual((await links[0].get()).name, "Test");
    model2["fake2"] = links;
    model2.__WEBDA_DIRTY.clear();
    links.unshift(
      {
        uuid: "test2",
        status: "OK"
      },
      links[0]
    );
    assert.ok(model2.__WEBDA_DIRTY.has("fake2"));
    model2.__WEBDA_DIRTY.clear();
    links.shift();
    assert.ok(model2.__WEBDA_DIRTY.has("fake2"));
    model2.__WEBDA_DIRTY.clear();
    links.pop();
    assert.ok(model2.__WEBDA_DIRTY.has("fake2"));
    model2.__WEBDA_DIRTY.clear();
    assert.ok(links.length === 1);
    assert.throws(
      () => new ModelLinksArray(repo, [{ __WEBDA_KEY: "toto" } as any]),
      /__WEBDA_\* are reserved keywords/
    );
  }

  @test
  async modelLinksSimpleArray() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    TestSimpleModel.registerRepository(repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model.setPrimaryKey("test");
    await repo.create("test", model);
    const model2 = await repo.create("test2", new TestSimpleModel({ name: "Test2", age: 20 }));
    model2.__WEBDA_DIRTY = new Set();
    let links = new ModelLinksSimpleArray<TestSimpleModel>(repo, [], model2);
    links.add(model);
    assert.ok(model2.__WEBDA_DIRTY.size === 0);
    links.remove("test");
    assert.ok(links.length === 0);
    assert.ok(model2.__WEBDA_DIRTY.size === 0);
    model2["fake"] = links;
    links.add("test");
    assert.ok(model2.__WEBDA_DIRTY.has("fake"));
    model2.__WEBDA_DIRTY.clear();
    links.unshift("test", "test2");
    assert.ok(model2.__WEBDA_DIRTY.has("fake"));
    model2.__WEBDA_DIRTY.clear();
    links.shift();
    assert.ok(model2.__WEBDA_DIRTY.has("fake"));
    model2.__WEBDA_DIRTY.clear();
    links.pop();
    assert.ok(model2.__WEBDA_DIRTY.has("fake"));
    model2.__WEBDA_DIRTY.clear();
    links.toJSON();
    model2["fake2"] = links;
    delete model2["fake"];
    links.remove(links[0]);
    assert.ok(model2.__WEBDA_DIRTY.has("fake2"));
    assert.ok(links.length === 0);

    // Without parent
    links = new ModelLinksSimpleArray<TestSimpleModel>(repo, ["test"]);
    links.add("test2");
    assert.ok(links.length === 2);
    links.remove("test2");
    assert.ok(links.length === 1);
    assert.strictEqual((await links[0].get()).name, "Test");

    const repo2 = new MemoryRepository<TestModel>(TestModel, ["id", "name"]);
    const links2 = new ModelLinksSimpleArray<TestModel>(repo2, []);
    links2.add({
      id: "test",
      name: "test"
    });
  }

  @test
  async modelLinksMap() {
    const repo = new MemoryRepository<TestSimpleModel>(TestSimpleModel, ["uuid"]);
    TestSimpleModel.registerRepository(repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model.__WEBDA_DIRTY = new Set();
    const map = createModelLinksMap<TestSimpleModel, { name: string }>(
      repo,
      {
        test: {
          name: "test"
        }
      },
      model
    );
    map.add({
      name: "test2",
      uuid: "test2"
    });
    assert.strictEqual(model.__WEBDA_DIRTY.size, 0);
    model["fake"] = map;
    map.add({
      name: "test3",
      uuid: "test3"
    });
    assert.strictEqual(model.__WEBDA_DIRTY.size, 1);
    assert.ok(model.__WEBDA_DIRTY!.has("fake"));
    model.__WEBDA_DIRTY!.clear();
    map.remove("test3");
    assert.ok(model.__WEBDA_DIRTY!.has("fake"));
    model.__WEBDA_DIRTY!.clear();
    map.remove("test4");
    assert.strictEqual(model.__WEBDA_DIRTY.size, 0);
  }

  @test
  async modelLinksMapWithCompositeId() {
    const repo = new MemoryRepository<TestModel>(TestModel, ["id", "name"]);
    TestModel.registerRepository(repo);
    const model = new TestModel({ id: "test", name: "test" } as any);
    model.__WEBDA_DIRTY = new Set();
    const map = createModelLinksMap<TestModel, { status: string }>(repo, {});
    map.add({
      name: "test2",
      id: "test2",
      status: "test"
    });
    assert.strictEqual(JSON.stringify(map), JSON.stringify({ test2_test2: { status: "test" } }));
    map.remove({
      id: "test2",
      name: "test2"
    });
    assert.strictEqual(JSON.stringify(map), JSON.stringify({}));
  }
}
