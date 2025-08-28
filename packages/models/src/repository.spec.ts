import { test, suite } from "@webda/test";
import { MemoryRepository } from "./repository";
import { SubClassModel, TestModel } from "./model.spec";
import * as assert from "assert";
import { PrimaryKeyEquals, WEBDA_DIRTY, WEBDA_PRIMARY_KEY } from "./storable";

@suite
class RepositoryTest {
  @test
  async testModelCRUD() {
    const repo = new MemoryRepository<SubClassModel>(SubClassModel, ["uuid"]);
    SubClassModel.registerRepository(repo);
    assert.deepStrictEqual(repo.fromUUID("test", true), {
      uuid: "test"
    });
    const object = await repo.ref("test").create({
      name: "Test",
      age: 30,
      collection: [{ name: "item1", type: "type1" }],
      createdAt: new Date(),
      test: 123
    });
    await object.save();
    object.name = "Updated Test";
    object[WEBDA_DIRTY] = new Set(["name"]);
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
      createdAt: "",
      test: 456,
      uuid: "test"
    });
    await object.refresh();
    assert.strictEqual(object.name, "Updated Test");
    assert.strictEqual(object.age, 31);

    await object.ref().delete();
    assert.ok(!(await repo.exists(object.getPrimaryKey())));
    repo.getPrimaryKey(object);
    console.log(object[WEBDA_PRIMARY_KEY]);

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
    const repo = new MemoryRepository<TestModel>(TestModel, ["id", "name"]);
    TestModel.registerRepository(repo);
    const test = await repo.create({
      id: "123",
      name: "Test",
      age: 10,
      email: "test@example.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    let pk = repo.getPrimaryKey(test);
    assert.strictEqual(pk.toString(), "123_Test");
    Object.keys(pk)
      .filter(key => key !== "toString")
      .forEach(key => {
        assert.strictEqual(pk[key], test[key]);
      });
    assert.deepStrictEqual(Object.keys(pk).sort(), ["id", "name", "toString"]);
    const test2 = await repo.get(test.getPrimaryKey());
    assert.deepStrictEqual(test2, test);
    assert.strictEqual(repo.getPrimaryKey({ id: "123", name: "Test" }).toString(), "123_Test");
    assert.deepStrictEqual(repo.fromUUID("123_Test"), { id: "123", name: "Test" });
    await assert.rejects(
      () =>
        repo.create({
          id: "123",
          name: "Test"
        } as any),
      /Already exists: 123_Test/
    );
  }

  @test
  cov() {
    let repo = new MemoryRepository<TestModel>(TestModel, []);
    assert.throws(() => repo.getPrimaryKey({}), /No primary key defined/);
    repo = new MemoryRepository<TestModel>(TestModel, ["uuid", "name"]);
    assert.strictEqual(repo.getRootModel(), TestModel);
    assert.throws(() => repo.fromUUID("test_test_test"), /Invalid UUID/);
    assert.deepStrictEqual(repo.fromUUID("test_test2"), {
      uuid: "test",
      name: "test2"
    });
  }
}
