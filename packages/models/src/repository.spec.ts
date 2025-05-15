import { test, suite } from "@webda/test";
import { MemoryRepository } from "./repository";
import { SubClassModel, TestModel } from "./model.spec";
import * as assert from "assert";
import { PrimaryKeyEquals } from "./storable";

@suite
class RepositoryTest {
  @test
  async testModelCRUD() {
    const repo = new MemoryRepository<SubClassModel>(SubClassModel);
    SubClassModel.registerRepository(repo);
    const object = await repo.ref("test").create({
      name: "Test",
      age: 30,
      collection: [{ name: "item1", type: "type1" }],
      createdAt: new Date(),
      test: 123
    });
    await object.save();
    object.name = "Updated Test";
    object.__dirty = new Set(["name"]);
    await object.save();
    const object2 = await repo.get(object.getPrimaryKey());
    assert.strictEqual(object2.name, "Updated Test");
    assert.strictEqual(object2.age, 30);

    await object.ref().incrementAttribute("age", 1);
    await repo.incrementAttribute(object.getPrimaryKey(), "age");
    await repo.incrementAttributes(object.getPrimaryKey(), {
      age: 12
    });
    await object.ref().setAttribute("name", "New Name");
    await object.ref().removeAttribute("createdAt");
    assert.ok(await object.ref().exists());

    await repo.exists(object.getPrimaryKey());

    assert.ok(PrimaryKeyEquals(object.getPrimaryKey(), repo.getPrimaryKey(object)));
    // iterate
    // query
    // update
    // emit, off, on, once
    // deleteItemFromCollection
    // upsertItemToCollection
    // fromUUID
    await object.ref().upsertItemToCollection("collection", {
      name: "item2",
      type: "type2"
    });
    await assert.rejects(
      () =>
        object.ref().upsertItemToCollection(
          "collection",
          {
            name: "item1",
            type: "type2"
          },
          0,
          "name",
          "item2"
        ),
      /Item write condition failed/
    );
    await object.refresh();
    assert.strictEqual(object.collection[0].type, "type1");
    await object.ref().upsertItemToCollection(
      "collection",
      {
        name: "item1",
        type: "type2"
      },
      0,
      "name",
      "item1"
    );
    await object.refresh();
    assert.strictEqual(object.collection[0].type, "type2");
    await assert.rejects(
      () => object.ref().deleteItemFromCollection("collection", 0, "name", "item2"),
      /Item write condition failed/
    );
    await object.refresh();
    assert.strictEqual(object.collection[0].type, "type2");
    assert.strictEqual(object.collection.length, 2);
    await object.ref().deleteItemFromCollection("collection", 0);
    await object.refresh();
    assert.strictEqual(object.collection.length, 1);
    // We reinitialize the collection to null to enforce the null collection
    await object.ref().setAttribute("collection", null); // Enforce a null collection
    await object.ref().upsertItemToCollection("collection", {
      name: "item2",
      type: "type2"
    });
    await object.refresh();
    assert.strictEqual(object.collection.length, 1);

    await object.ref().update({
      name: "Updated Test",
      age: 31,
      collection: [{ name: "item3", type: "type3" }],
      createdAt: new Date(),
      test: 456
    });
    await object.refresh();
    assert.strictEqual(object.name, "Updated Test");
    assert.strictEqual(object.age, 31);

    await object.ref().delete();
    assert.ok(!(await repo.exists(object.getPrimaryKey())));
    await object.ref().upsert({
      name: "Test"
    });
    await object.refresh();
    assert.strictEqual(object.name, "Test");
    await assert.rejects(
      () =>
        object.ref().create({
          name: "Test"
        }),
      /Already exists/
    );
    repo.getPrimaryKey(object);
    console.log(object.PrimaryKey);

    let count = 0;
    const listener = () => count++;
    repo.on("test", listener);
    repo.once("test", () => count++);
    repo["emit"]("test", object);
    assert.strictEqual(count, 2);
    repo["emit"]("test", object);
    assert.strictEqual(count, 3);
    repo.off("test", listener);
    repo["emit"]("test", object);
    assert.strictEqual(count, 3);

    await assert.rejects(async () => {
      for await (it of repo.iterate()) {
        // do nothing
      }
    }, /Not implemented/);
    await assert.rejects(() => repo.query(), /Not implemented/);
  }

  @test
  async testModelWithCompositeId() {
    const repo = new MemoryRepository<TestModel>(TestModel);
    TestModel.registerRepository(repo);
    const test = await repo.create(
      {
        id: "123",
        name: "Test"
      },
      {
        content: "test"
      }
    );
    assert.deepStrictEqual(repo.getPrimaryKey(test), {
      id: "123",
      name: "Test"
    });
    const test2 = await repo.get(test.getPrimaryKey());
    assert.deepStrictEqual(test2, test);
    assert.throws(() => repo.getPrimaryKey({}), /No primary key defined on model/);
    assert.throws(() => repo.fromUUID("test"), /Not implemented/);
  }
}
