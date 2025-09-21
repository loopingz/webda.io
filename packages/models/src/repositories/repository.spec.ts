import { test, suite, beforeAll } from "@webda/test";
import { MemoryRepository } from "./memory";
import { SubClassModel, TestModel } from "../model.spec";
import * as assert from "assert";
import { PrimaryKeyEquals, SelfJSONed, StorableClass, WEBDA_DIRTY, WEBDA_PRIMARY_KEY } from "../storable";
import { Model } from "../model";
import { Repository, WEBDA_TEST } from "./repository";

export class QueryDocument extends Model {
  [WEBDA_PRIMARY_KEY] = ["id"] as const;

  constructor(data: Partial<SelfJSONed<QueryDocument>> = {}) {
    super();
    Object.assign(this, data);
  }
  state: "CA" | "OR" | "NY" | "FL" = "CA";
  states: ("CA" | "OR" | "NY" | "FL")[] = [];
  order: number = 0;
  team: { id: number } = { id: 0 };
  role: number = 0;
  id: number = 0;

  static fill() {
    const docs: QueryDocument[] = [];
    for (let i = 0; i < 1000; i++) {
      docs.push(
        new QueryDocument({
          state: ["CA", "OR", "NY", "FL"][i % 4] as QueryDocument["state"],
          states: [["CA", "OR", "NY", "FL"][i % 4], ["CA", "OR", "NY", "FL"][(i + 1) % 4]] as QueryDocument["states"],
          order: i,
          team: {
            id: i % 20
          },
          role: i % 10,
          id: i
        })
      );
    }
    return docs;
  }
}

@suite
export class RepositoryTest {
  getRepository<T extends StorableClass>(model: T, keys: string[]): Repository<T> {
    return new MemoryRepository(model, keys) as Repository<T>;
  }

  async beforeAll() {
    let repo = this.getRepository<typeof QueryDocument>(QueryDocument, ["id"]);
    QueryDocument.registerRepository(repo);
    let repoSub = this.getRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    SubClassModel.registerRepository(repoSub);
    let repoTest = this.getRepository<typeof TestModel>(TestModel, ["id", "name"]);
    TestModel.registerRepository(repoTest);

    const docs = QueryDocument.fill();
    for (const doc of docs) {
      await repo.create(doc);
    }
  }

  beforeEach() {
    // We clear the repositories except QueryDocument
    SubClassModel.getRepository()[WEBDA_TEST]?.clear();
    TestModel.getRepository()[WEBDA_TEST]?.clear();
  }

  @test
  async testModelCRUD() {
    const repo = SubClassModel.getRepository() as MemoryRepository<typeof SubClassModel>;
    console.log("Using repository:", repo.constructor.name);
    assert.deepStrictEqual(repo.parseUID("test", true), {
      uuid: "test"
    });
    console.log("WILL CREATE");
    const object = await repo.ref("test").create({
      name: "Test",
      age: 30,
      collection: [{ name: "item1", type: "type1" }],
      createdAt: new Date()
    });
    await object.save();
    console.log("HAS CREATED");
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

    let count = 0;
    const listener = () => count++;
    repo.on("test", listener);
    repo.once("test", () => count++);
    await repo["emit"]("test", object);
    assert.strictEqual(count, 2);
    await repo["emit"]("test", object);
    assert.strictEqual(count, 3);
    repo.off("test", listener);
    await repo["emit"]("test", object);
    assert.strictEqual(count, 3);
  }

  @test async iterate() {
    let count = 0;
    for await (const doc of QueryDocument.iterate('state = "CA"')) {
      assert.strictEqual(doc.state, "CA");
      count++;
    }
    assert.strictEqual(count, 250);
    count = 0;
    // It will generate the pagination size
    for await (const doc of QueryDocument.iterate('state = "CA" LIMIT 10')) {
      assert.strictEqual(doc.state, "CA");
      count++;
    }
    assert.strictEqual(count, 250);
  }

  @test
  async query() {
    const queries = {
      'state = "CA"': 250,
      "team.id > 15": 200,
      "team.id >= 15": 250,
      "team.id <= 14": 750,
      'state IN ["CA", "NY"]': 500,
      'state IN ["CA", "NY", "NV"]': 500,
      'state = "CA" AND team.id > 15': 50,
      "team.id < 5 OR team.id > 15": 450,
      "role < 5 AND team.id > 10 OR team.id > 15": 400,
      "role < 5 AND (team.id > 10 OR team.id > 15)": 200,
      'state LIKE "C_"': 250,
      'state LIKE "C__"': 0,
      'state LIKE "C%"': 250,
      'state != "CA"': 750,
      'states CONTAINS "CA"': 500,
      "role = 4": 100,
      "": 1000,
      'state = "CA" LIMIT 10': 10
    };
    for (const [query, expected] of Object.entries(queries)) {
      const res = await QueryDocument.query(query);
      assert.strictEqual(
        res.results.length,
        expected,
        `Query: ${query}, Result: ${res.results.length}, Expected: ${expected}`
      );
    }
  }

  @test
  async upsert() {
    const repo = TestModel.getRepository() as MemoryRepository<typeof TestModel>;
    const test = await repo.upsert({
      id: "123",
      name: "Test",
      age: 10,
      email: "test@example.com"
    });
    assert.strictEqual(test.id, "123");
    assert.strictEqual(test.name, "Test");
    assert.strictEqual(test.age, 10);
    assert.strictEqual(test.email, "test@example.com");
    assert.ok(await repo.exists(test.getPrimaryKey()));
    assert.ok(await repo.exists(test.getPrimaryKey().toString()));
    await TestModel.ref({
      id: "124",
      name: "Test"
    }).upsert({
      age: 11,
      email: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    assert.ok(
      await repo.exists({
        id: "124",
        name: "Test"
      })
    );
    assert.ok(await repo.exists("124_Test"));
    const repoSimple = SubClassModel.getRepository() as MemoryRepository<typeof SubClassModel>;
    const test2 = await repoSimple.upsert({
      uuid: "uuid-123",
      name: "Test2",
      age: 20
    });
    assert.strictEqual(test2.uuid, "uuid-123");
    assert.strictEqual(test2.name, "Test2");
    assert.strictEqual(test2.age, 20);
    await SubClassModel.ref("uuid-124").upsert({
      name: "Test2",
      age: 20,
      createdAt: new Date().toISOString(),
      test: 12,
      collection: []
    });
    assert.ok(await repoSimple.exists("uuid-123"));
    assert.ok(await repoSimple.exists("uuid-124"));
  }

  @test
  async testModelWithCompositeId() {
    const repo = TestModel.getRepository() as Repository<typeof TestModel>;
    const test = await repo.create({
      id: "123",
      name: "Test",
      age: 10,
      email: "test@example.com",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    const pk = repo.getPrimaryKey(test);
    assert.strictEqual(pk.toString(), "123_Test");
    Object.keys(pk)
      .filter(key => key !== "toString")
      .forEach(key => {
        assert.deepStrictEqual(pk[key], test[key]);
      });
    assert.deepStrictEqual(Object.keys(pk).sort(), ["id", "name", "toString"]);
    const test2 = await repo.get(test.getPrimaryKey());
    assert.deepStrictEqual(test2, test);
    assert.strictEqual(repo.getPrimaryKey({ id: "123", name: "Test" }).toString(), "123_Test");
    assert.deepStrictEqual(repo.parseUID("123_Test"), { id: "123", name: "Test" });
    await assert.rejects(
      () =>
        repo.create({
          id: "123",
          name: "Test"
        } as any),
      /Already exists: 123_Test/
    );
  }
}

@suite
export class CovRepositoryTest {
  @test
  cov() {
    let repo = new MemoryRepository<typeof TestModel>(TestModel, []);
    assert.throws(() => repo.getPrimaryKey({}), /No primary key defined/);
    repo = new MemoryRepository<typeof TestModel>(TestModel, ["uuid", "name"]);
    assert.strictEqual(repo.getRootModel(), TestModel);
    assert.throws(() => repo.parseUID("test_test_test"), /Invalid UID/);
    assert.deepStrictEqual(repo.parseUID("test_test2"), {
      uuid: "test",
      name: "test2"
    });
  }
}
