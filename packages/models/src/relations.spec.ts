import { UuidModel } from "./model";
import {
  ModelLink,
  ModelLinksArray,
  ModelLinksSimpleArray,
  ModelRelated,
  ModelRefCustomMap,
  JunctionLink,
  ModelRef,
  RelationData
} from "./relations";
import { MemoryRepository } from "./repositories/memory";
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PrimaryKeyEquals, WEBDA_PLURAL, WEBDA_PRIMARY_KEY } from "./storable";
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

    const links = new ModelLinksArray<TestSimpleModel, { status: "OK" | "NOK" }>(repo, [], model2);
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
    const links = new ModelLinksSimpleArray<TestSimpleModel>(TestSimpleModel);
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

  @test
  async modelRefErrors() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    // ModelRef without repository (get throws synchronously since it's not async)
    const ref = new ModelRef<TestSimpleModel>("test" as any);
    assert.throws(() => ref.get(), /Relation repository is not initialized/);

    // ModelLink without key set
    const link = new ModelLink(TestSimpleModel);
    assert.throws(() => link.getPrimaryKey(), /Relation key is not initialized/);
    assert.throws(() => link.toJSON(), /Relation key is not initialized/);
    assert.throws(() => link.toString(), /Relation key is not initialized/);
    await assert.rejects(() => link.get(), /Relation key is not initialized/);

    // ModelLink.set with a storable instance (isStorable path)
    const model = new TestSimpleModel({ uuid: "s1", name: "Storable" });
    link.set(model);
    assert.strictEqual(link.getPrimaryKey(), "s1");

    // ModelLink.set with a PrimaryKeyType object (not string, not Storable)
    link.set({ uuid: "pk-obj" } as any);
    assert.deepStrictEqual(link.getPrimaryKey(), { uuid: "pk-obj" });

    // ModelRef without key - getPrimaryKey error
    const noKeyRef = new ModelRef<TestSimpleModel>(undefined as any, repo as any);
    assert.throws(() => noKeyRef.getPrimaryKey(), /Relation key is not initialized/);
  }

  @test
  async modelRelated() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    const parent = new TestSimpleModel({ uuid: "parent1", name: "Parent" });
    await repo.create(parent);
    await repo.create(new TestSimpleModel({ uuid: "child1", name: "Child1" }));

    const related = new ModelRelated<TestSimpleModel, TestSimpleModel, any>(TestSimpleModel, parent, "name");

    // toJSON returns undefined
    assert.strictEqual(related.toJSON(), undefined);

    // getQuery
    const query = related.getQuery();
    assert.ok(query.includes("parent1"));

    // query
    const result = await related.query();
    assert.ok(result.results);

    // iterate
    const items: TestSimpleModel[] = [];
    for await (const item of related.iterate("")) {
      items.push(item);
    }
  }

  @test
  async modelLinksArrayComprehensive() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    await repo.create(new TestSimpleModel({ name: "A", age: 10, uuid: "a" }));
    await repo.create(new TestSimpleModel({ name: "B", age: 20, uuid: "b" }));
    await repo.create(new TestSimpleModel({ name: "C", age: 30, uuid: "c" }));

    const links = new ModelLinksArray<TestSimpleModel, { status: string }>(repo, [
      { uuid: "a", status: "active" } as any,
      { uuid: "b", status: "inactive" } as any
    ]);

    // Proxy indexed access (get)
    assert.strictEqual(links[0].getPrimaryKey(), "a");
    assert.strictEqual(links[1].getPrimaryKey(), "b");

    // push
    const newLen = links.push({ uuid: "c", status: "pending" } as any);
    assert.strictEqual(newLen, 3);
    assert.strictEqual(links.length, 3);

    // push with existing ModelRefCustom (instanceof path)
    const existingRef = links.at(0)!;
    links.push(existingRef as any);
    assert.strictEqual(links.length, 4);
    links.pop(); // clean up

    // pop
    const popped = links.pop();
    assert.ok(popped);
    assert.strictEqual(links.length, 2);

    // shift
    const shifted = links.shift();
    assert.ok(shifted);
    assert.strictEqual(links.length, 1);

    // unshift
    links.unshift({ uuid: "a", status: "reactivated" } as any);
    assert.strictEqual(links.length, 2);
    assert.strictEqual(links[0].getPrimaryKey(), "a");

    // splice - remove and add
    const spliced = links.splice(0, 1, { uuid: "c", status: "new" } as any);
    assert.strictEqual(spliced.length, 1);
    assert.strictEqual(links.length, 2);

    // splice - no deletions, no additions (should not dirty)
    const emptyS = links.splice(0, 0);
    assert.strictEqual(emptyS.length, 0);

    // at
    assert.ok(links.at(0));
    assert.strictEqual(links.at(99), undefined);

    // find
    const found = links.find(item => item.getPrimaryKey() === "b");
    assert.ok(found);

    // findIndex
    const idx = links.findIndex(item => item.getPrimaryKey() === "b");
    assert.ok(idx >= 0);

    // includes
    assert.ok(links.includes(links.at(0)!));

    // map
    const mapped = links.map(item => item.getPrimaryKey());
    assert.strictEqual(mapped.length, 2);

    // filter
    const filtered = links.filter(item => item.getPrimaryKey() === "b");
    assert.strictEqual(filtered.length, 1);

    // forEach
    let count = 0;
    links.forEach(() => count++);
    assert.strictEqual(count, 2);

    // some
    assert.ok(links.some(item => item.getPrimaryKey() === "b"));
    assert.ok(!links.some(item => item.getPrimaryKey() === "z"));

    // every
    assert.ok(!links.every(item => item.getPrimaryKey() === "b"));

    // toJSON on the array
    const json = links.toJSON();
    assert.ok(Array.isArray(json));

    // toJSON on individual item (ModelRefCustom.toJSON)
    const itemJson = links.at(0)!.toJSON();
    assert.ok(itemJson);

    // Symbol.iterator
    const iterItems: any[] = [];
    for (const item of links) {
      iterItems.push(item);
    }
    assert.strictEqual(iterItems.length, 2);

    // remove returning false (not found)
    assert.ok(!links.remove("nonexistent" as any));

    // Proxy indexed set
    const prevFirst = links[0];
    links[0] = links[1];
    assert.strictEqual(links[0], links[1]);
    links[0] = prevFirst;

    // Non-numeric proxy set
    (links as any)["customProp"] = "value";
    assert.strictEqual((links as any)["customProp"], "value");

    // Empty pop/shift
    while (links.length > 0) links.pop();
    assert.strictEqual(links.pop(), undefined);
    assert.strictEqual(links.shift(), undefined);
  }

  @test
  async modelLinksSimpleArrayMethods() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    await repo.create(new TestSimpleModel({ uuid: "s1", name: "S1" }));
    await repo.create(new TestSimpleModel({ uuid: "s2", name: "S2" }));

    const links = new ModelLinksSimpleArray<TestSimpleModel>(TestSimpleModel, ["s1", "s2"]);

    // at
    assert.ok(links.at(0));
    assert.strictEqual(links.at(0)!.getPrimaryKey(), "s1");
    assert.strictEqual(links.at(99), undefined);

    // find
    const found = links.find(item => item.getPrimaryKey() === "s2");
    assert.ok(found);

    // findIndex
    assert.strictEqual(links.findIndex(item => item.getPrimaryKey() === "s2"), 1);

    // map
    const mapped = links.map(item => item.getPrimaryKey());
    assert.deepStrictEqual(mapped, ["s1", "s2"]);

    // filter
    const filtered = links.filter(item => item.getPrimaryKey() === "s1");
    assert.strictEqual(filtered.length, 1);

    // forEach
    let count = 0;
    links.forEach(() => count++);
    assert.strictEqual(count, 2);

    // some
    assert.ok(links.some(item => item.getPrimaryKey() === "s1"));
    assert.ok(!links.some(item => item.getPrimaryKey() === "z"));

    // every
    assert.ok(links.every(item => typeof item.getPrimaryKey() === "string"));

    // Symbol.iterator
    const items: any[] = [];
    for (const item of links) {
      items.push(item);
    }
    assert.strictEqual(items.length, 2);

    // splice
    links.push("s1");
    const spliced = links.splice(0, 1, "s2");
    assert.strictEqual(spliced.length, 1);

    // splice no-op
    const emptyS = links.splice(0, 0);
    assert.strictEqual(emptyS.length, 0);

    // set
    links.set(["s1", "s2"]);
    assert.strictEqual(links.length, 2);

    // set with undefined
    links.set();
    assert.strictEqual(links.length, 0);

    // Proxy indexed set
    links.set(["s1", "s2"]);
    links[0] = links[1];
    assert.strictEqual(links[0].getPrimaryKey(), "s2");

    // Non-numeric proxy set
    (links as any)["custom"] = "test";
    assert.strictEqual((links as any)["custom"], "test");

    // push with ModelRef instance (instanceof ModelRef branch)
    const ref = links.at(0)!;
    links.push(ref as any);
    assert.strictEqual(links.length, 3);

    // push plain key object (not string, not ModelRef, not Storable) - else branch in getModelRef
    links.push({ uuid: "s1" } as any);
    assert.strictEqual(links.length, 4);

    // remove not found
    assert.ok(!links.remove("nonexistent"));
  }

  @test
  async junctionLink() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    const junction = new JunctionLink<TestSimpleModel, TestSimpleModel>();
    junction.linkA = new ModelLink(TestSimpleModel).set("a1") as any;
    junction.linkB = new ModelLink(TestSimpleModel).set("b1");

    // getPrimaryKey
    const pk = junction.getPrimaryKey();
    assert.strictEqual(pk.linkA, "a1");
    assert.strictEqual(pk.linkB, "b1");

    // getUUID
    assert.strictEqual(junction.getUUID(), "a1_b1");

    // toProxy
    assert.strictEqual(junction.toProxy(), junction);

    // load
    assert.strictEqual(junction.load({}), junction);

    // WEBDA_PRIMARY_KEY
    assert.deepStrictEqual(junction[WEBDA_PRIMARY_KEY], ["linkA", "linkB"]);
  }

  @test
  async modelRefCustomMap() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);

    // toJSON with data
    const map = new ModelRefCustomMap<TestSimpleModel, { custom: string }>("test" as any, repo as any, {
      custom: "data"
    });
    assert.deepStrictEqual(map.toJSON(), { custom: "data" });

    // toJSON with falsy data (|| {} branch)
    const mapFalsy = new ModelRefCustomMap<TestSimpleModel, any>("test" as any, repo as any, false as any);
    assert.deepStrictEqual(mapFalsy.toJSON(), {});
  }
}
