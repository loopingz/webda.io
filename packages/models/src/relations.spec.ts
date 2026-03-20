import { UuidModel } from "./model";
import { ModelLink, ModelLinksArray, ModelLinksSimpleArray } from "./relations";
import { MemoryRepository } from "./repositories/memory";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PrimaryKeyEquals, WEBDA_PLURAL } from "./storable";
import { registerRepository } from "./repositories/hooks";
import { track } from "../../utils/lib/dirty";
import { Test } from "mocha";

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
    // @ts-ignore
    model2["fake"] = links;
    model2.dirty.clear();
    // @ts-ignore
    model2["fake"].add({
      uuid: "test",
      status: "OK"
    });
    assert.deepStrictEqual(model2.dirty.getProperties(), ["fake.items.0", "fake.items.length"]);
    model2.dirty.clear();
    links.toJSON();
    // @ts-ignore
    model2["fake2"] = links;
    // @ts-ignore
    delete model2["fake"];
    // @ts-ignore
    model2["fake2"].remove(links[0]);
    assert.deepStrictEqual(model2.dirty.getProperties(), ["fake2", "fake2.items.0", "fake2.items.length"]);
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
    let links = new ModelLinksSimpleArray<TestSimpleModel>(TestSimpleModel);
    links.add(model);
    assert.ok(model2.dirty.getProperties().length === 0);
    links.remove("test");
    assert.ok(links.length === 0);
    assert.ok(model2.dirty.getProperties().length === 0);
    // @ts-ignore
    model2["fake"] = links;
    model2.dirty.clear();
    // @ts-ignore
    model2["fake"].add("test");
    console.log(model2.dirty.getProperties());
    assert.deepStrictEqual(model2.dirty.getProperties(), ["fake.items.0", "fake.items.length"]);
    model2.dirty.clear();
    // @ts-ignore
    model2["fake"].unshift("test", "test2");
    assert.deepStrictEqual(model2.dirty.getProperties(), [
      "fake.items.2",
      "fake.items.0",
      "fake.items.1",
      "fake.items.length"
    ]);
    model2.dirty.clear();
    // @ts-ignore
    model2["fake"].shift();
    assert.deepStrictEqual(model2.dirty.getProperties(), [
      "fake.items.0",
      "fake.items.1",
      "fake.items.2",
      "fake.items.length"
    ]);
    model2.dirty.clear();
    // @ts-ignore
    model2["fake"].pop();
    assert.deepStrictEqual(model2.dirty.getProperties(), ["fake.items.1", "fake.items.length"]);
    model2.dirty.clear();
    links.toJSON();
    // @ts-ignore
    model2["fake2"] = links;
    // @ts-ignore
    delete model2["fake"];
    // @ts-ignore
    model2["fake2"].remove(links[0]);
    assert.deepStrictEqual(model2.dirty.getProperties(), ["fake2", "fake2.items.0", "fake2.items.length"]);
    assert.ok(links.length === 0);
  }
}
