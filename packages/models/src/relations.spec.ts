import { UuidModel } from "./model";
import { ModelLink, ModelLinksArray, ModelLinksSimpleArray } from "./relations";
import { MemoryRepository } from "./repositories/memory";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PrimaryKeyEquals, WEBDA_PLURAL } from "./storable";
import { registerRepository } from "./repositories/hooks";
import { track } from "../../utils/lib/dirty";

class TestSimpleModel extends UuidModel {
  name: string;
  age: number;

  constructor(data?: { name?: string; age?: number; uuid?: string }) {
    super(data);
    this.name = data?.name || "";
    this.age = data?.age || 0;
  }
  [WEBDA_PLURAL]?: string | undefined;
}

TestSimpleModel.registerSerializer();

@suite
class RelationsTest {
  @test
  async modelRef() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);
    const model = new TestSimpleModel();
    model.setPrimaryKey("test");
    await repo.create(model);
    await model.ref().patch({ name: "Test" });
    assert.strictEqual((await model.ref().get()).name, "Test");
    assert.deepStrictEqual(model.ref().getPrimaryKey(), model.getPrimaryKey());
    assert.deepStrictEqual(model.ref().toJSON(), "test");
  }

  @test
  async modelLink() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model.setPrimaryKey("test");
    await repo.create(model);
    const link = new ModelLink(TestSimpleModel).set("test");
    assert.ok(PrimaryKeyEquals(link.getPrimaryKey(), model.getPrimaryKey()));
    assert.ok((await link.get()) instanceof TestSimpleModel);
    assert.strictEqual(link.toJSON(), "test");
    assert.strictEqual(link.toString(), "test");
    link.set("test2");
    assert.ok(!PrimaryKeyEquals(link.getPrimaryKey(), model.getPrimaryKey()));
    await assert.rejects(() => link.get(), /Not found/);
  }

  @test
  async modelLinksArray() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);
    const model = new TestSimpleModel({ name: "Test", age: 10, uuid: "test" });
    await repo.create(model);
    const model2 = track(await repo.create(new TestSimpleModel({ name: "Test2", age: 20, uuid: "test2" })));

    let links = new ModelLinksArray<TestSimpleModel, { status: "OK" | "NOK" }>(repo, [], model2);
    links.add({
      uuid: "test",
      status: "OK"
    });
    assert.ok(model2.dirty.getProperties().length === 0);
    links.remove("test");
    assert.ok(links.length === 0);
    assert.ok(model2.dirty.getProperties().length === 0);
    model2["fake"] = links;
    links.add({
      uuid: "test",
      status: "OK"
    });
    assert.ok(model2.dirty.has("fake"));
    model2.dirty.clear();
    links.toJSON();
    model2["fake2"] = links;
    delete model2["fake"];
    assert.deepStrictEqual(links[0].toJSON(), {
      uuid: "test",
      status: "OK"
    });
    links.remove(links[0]);
    assert.ok(model2.dirty.has("fake2"));
    assert.ok(links.length === 0);
  }

  @test
  async modelLinksSimpleArray() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);
    const model = new TestSimpleModel({ name: "Test", age: 10, uuid: "test" });
    model.setPrimaryKey("test");
    await repo.create(model);
    const model2 = track(await repo.create(new TestSimpleModel({ name: "Test2", age: 20, uuid: "test2" })));
    let links = new ModelLinksSimpleArray<TestSimpleModel>(repo, [], model2);
    links.add(model);
    assert.ok(model2.dirty.getProperties().length === 0);
    links.remove("test");
    assert.ok(links.length === 0);
    assert.ok(model2.dirty.getProperties().length === 0);
    model2["fake"] = links;
    links.add("test");
    assert.ok(model2.dirty.has("fake"));
    model2.dirty.clear();
    links.unshift("test", "test2");
    assert.ok(model2.dirty.has("fake"));
    model2.dirty.clear();
    links.shift();
    assert.ok(model2.dirty.has("fake"));
    model2.dirty.clear();
    links.pop();
    assert.ok(model2.dirty.has("fake"));
    model2.dirty.clear();
    links.toJSON();
    model2["fake2"] = links;
    delete model2["fake"];
    links.remove(links[0]);
    assert.ok(model2.dirty.has("fake2"));
    assert.ok(links.length === 0);
  }
}
