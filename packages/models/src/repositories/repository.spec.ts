import { test, suite } from "@webda/test";
import { MemoryRepository } from "./memory";
import { SubClassModel, TestModel } from "../model.spec";
import * as assert from "assert";
import { PrimaryKeyEquals, SelfJSONed, StorableClass, WEBDA_DIRTY, WEBDA_PRIMARY_KEY } from "../storable";
import { Model, UuidModel } from "../model";
import { Repository, WEBDA_TEST } from "./repository";
import { registerRepository, Repositories } from "./hooks";

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

// Register serializer for QueryDocument
QueryDocument.registerSerializer();

@suite
export class RepositoryTest {
  getRepository<T extends StorableClass>(model: T, keys: string[]): Repository<T> {
    return new MemoryRepository(model, keys) as Repository<T>;
  }

  async beforeAll() {
    const repo = this.getRepository<typeof QueryDocument>(QueryDocument, ["id"]);
    registerRepository(QueryDocument, repo);
    const repoSub = this.getRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repoSub);
    const repoTest = this.getRepository<typeof TestModel>(TestModel, ["id", "name"]);
    registerRepository(TestModel, repoTest);
    assert.strictEqual(SubClassModel.getRepository(), repoSub);
    assert.strictEqual(TestModel.getRepository(), repoTest);
    assert.strictEqual(QueryDocument.getRepository(), repo);
    const docs = QueryDocument.fill();
    for (const doc of docs) {
      await repo.create(doc);
    }
  }

  async beforeEach(_testMethod: string) {
    // We clear the repositories except QueryDocument
    await SubClassModel.getRepository()[WEBDA_TEST]?.clear();
    await TestModel.getRepository()[WEBDA_TEST]?.clear();
  }

  @test
  async testModelCRUD() {
    const repo = SubClassModel.getRepository() as MemoryRepository<typeof SubClassModel>;
    assert.deepStrictEqual(repo.parseUID("test", true), {
      uuid: "test"
    });
    const object = await repo.ref("test").create({
      name: "Test",
      age: 30,
      collection: [{ name: "item1", type: "type1" }],
      createdAt: new Date()
    });
    await object.save();
    object.name = "Updated Test";
    object[WEBDA_DIRTY] = new Set(["name"]);
    await object.save();
    const object2 = await repo.get(object.getPrimaryKey());
    assert.strictEqual(object2.name, "Updated Test");
    assert.strictEqual(object2.age, 30);

    await object.ref().incrementAttribute("age", 1);
    await object.ref().incrementAttribute("metadata.counter", 1);
    await repo.incrementAttribute(object.getPrimaryKey(), "age");
    await repo.incrementAttributes(object.getPrimaryKey(), {
      age: 12,
      "metadata.counter": 5
    });
    await object.ref().setAttribute("name", "New Name");
    await object.ref().removeAttribute("createdAt");
    assert.ok(await object.ref().exists());
    const control = await repo.get(object.getPrimaryKey());
    assert.strictEqual(control.age, 30 + 1 + 1 + 12);
    assert.strictEqual(control.metadata.counter, 0 + 1 + 5);
    assert.strictEqual(control.name, "New Name");
    assert.notStrictEqual(control.createdAt, undefined);

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

  @test
  async uuidModel() {
    const repo = new MemoryRepository<typeof UuidModel>(UuidModel, ["uuid"]);
    registerRepository(UuidModel, repo);
    const model = await UuidModel.create({});
    assert.ok(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/.exec(model.getUUID()) !== null);
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

  @test
  async covAbstract() {
    const repo = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repo);
    await repo.create(new SubClassModel({ uuid: "from-uid", name: "Test", age: 1, collection: [] } as any));

    // fromUID
    const ref = repo.fromUID("from-uid");
    assert.ok(ref);
    const model = await ref.get();
    assert.strictEqual(model.uuid, "from-uid");

    // excludePrimaryKey (uses this.pks)
    const excluded = repo.excludePrimaryKey({ uuid: "test", name: "Test" });
    assert.strictEqual(excluded.uuid, undefined);
    assert.strictEqual(excluded.name, "Test");

    // excludePrimaryKey with object that has PrimaryKey property (uses object.PrimaryKey)
    const excludedWithPK = repo.excludePrimaryKey({ PrimaryKey: ["name"], uuid: "test", name: "Test" });
    assert.strictEqual(excludedWithPK.uuid, "test");
    assert.strictEqual(excludedWithPK.name, undefined);

    // emit with no listeners (early return path)
    await (repo as any).emit("nonexistent_event", {});

    // getPrimaryKey with forceObject and primitive for single pk
    const pkObj = repo.getPrimaryKey("test-pk", true);
    assert.strictEqual((pkObj as any).uuid, "test-pk");
    assert.strictEqual(pkObj.toString(), "test-pk");

    // getPrimaryKey with forceObject and object input (returns object directly)
    const pkObjFromObj = repo.getPrimaryKey({ uuid: "test-pk2" }, true);
    assert.strictEqual((pkObjFromObj as any).uuid, "test-pk2");
  }

  @test
  async covCompositeKey() {
    const compositeRepo = new MemoryRepository<typeof TestModel>(TestModel, ["id", "name"]);
    registerRepository(TestModel, compositeRepo);

    // getPrimaryKey with string for composite key (parseUID path)
    const compositePk = compositeRepo.getPrimaryKey("123_Test");
    assert.strictEqual(compositePk.toString(), "123_Test");

    // getPrimaryKey with missing composite key fields (error)
    assert.throws(() => compositeRepo.getPrimaryKey({ id: "123" }), /Missing primary key fields/);
  }

  @test
  async covHooksModelBase() {
    // Register a repo on the Model base class itself to cover hooks.ts break path
    const modelRepo = new MemoryRepository(Model as any, ["id"]);
    registerRepository(Model as any, modelRepo);

    // Create a class that extends Model directly, with no repo of its own
    class OrphanModel extends Model {
      [WEBDA_PRIMARY_KEY] = ["id"] as const;
      id: string;
      constructor(data?: any) {
        super();
        this.id = data?.id || "";
      }
    }

    const found = OrphanModel.getRepository();
    assert.strictEqual(found, modelRepo);

    // Cleanup
    Repositories.delete(Model as any);
  }

  @test
  async covMemoryConditions() {
    const repo = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repo);
    await repo.create(new SubClassModel({ uuid: "cond-test", name: "Original", age: 10, collection: [] } as any));

    // patch with condition that succeeds (checkCondition truthy + match)
    await repo.patch("cond-test", { name: "Updated" } as any, "name", "Original");
    const updated = await repo.get("cond-test");
    assert.strictEqual(updated.name, "Updated");

    // patch with condition that fails (checkCondition truthy + mismatch)
    await assert.rejects(
      () => repo.patch("cond-test", { name: "Fail" } as any, "name", "WrongValue"),
      /Condition failed/
    );

    // update with condition that succeeds
    await repo.update(
      { uuid: "cond-test", name: "Updated2", age: 10, collection: [], test: 40 } as any,
      "name",
      "Updated"
    );

    // update with condition that fails
    await assert.rejects(
      () => repo.update({ uuid: "cond-test", name: "Fail", age: 10, collection: [], test: 40 } as any, "name", "Wrong"),
      /Condition failed/
    );

    // incrementAttributes with array entry without value (covers ?? 1 fallback)
    await repo.incrementAttributes("cond-test", [{ property: "age" } as any]);
    const incResult = await repo.get("cond-test");
    assert.strictEqual(incResult.age, 11); // 10 + 1 (default)

    // incrementAttributes Record-style on initially-undefined property (covers || 0 branch)
    await repo.incrementAttributes("cond-test", { "metadata.newProp": 3 } as any);
    const incResult2 = await repo.get("cond-test");
    assert.strictEqual((incResult2.metadata as any).newProp, 3); // 0 + 3
  }

  @test
  async covQueryOrderBy() {
    const repo = new MemoryRepository<typeof QueryDocument>(QueryDocument, ["id"]);
    registerRepository(QueryDocument, repo);
    const docs = QueryDocument.fill();
    for (const doc of docs) {
      await repo.create(doc);
    }

    // ORDER BY on string field (string comparison branch)
    const res1 = await repo.query('state = "CA" ORDER BY state ASC LIMIT 5');
    assert.strictEqual(res1.results.length, 5);
    assert.ok(res1.continuationToken);

    // ORDER BY on numeric field (descending)
    const res2 = await repo.query("ORDER BY order DESC LIMIT 10");
    assert.strictEqual(res2.results.length, 10);
    assert.strictEqual(res2.results[0].order, 999);
    assert.ok(res2.continuationToken);

    // ORDER BY on numeric field (ascending)
    const res3 = await repo.query("ORDER BY order ASC LIMIT 5");
    assert.strictEqual(res3.results.length, 5);
    assert.strictEqual(res3.results[0].order, 0);
    assert.ok(res3.continuationToken);

    // ORDER BY with multiple fields (covers valA === valB continue and return -1)
    const res4 = await repo.query("ORDER BY state ASC, order ASC LIMIT 10");
    assert.strictEqual(res4.results.length, 10);
    assert.ok(res4.continuationToken);

    // ORDER BY on non-sequential numeric field (covers valA > valB branch in sort)
    const res5 = await repo.query("ORDER BY role ASC LIMIT 10");
    assert.strictEqual(res5.results.length, 10);
    assert.ok(res5.continuationToken);
  }
}
