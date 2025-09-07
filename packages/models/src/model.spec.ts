import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Model, ModelClass, UuidModel } from "./model";
import { isStorable, PrimaryKeyEquals, SelfJSONed, Storable, StorableClass, WEBDA_PRIMARY_KEY } from "./storable";
import { ExecutionContext, isExposable, isSecurable, Operation } from "./index";
import { MemoryRepository, Repository } from "./repository";

type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;
type ExceptPartial<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export class TestModel extends Model {
  [WEBDA_PRIMARY_KEY] = ["id", "name"] as const;
  id: string;
  name: string;
  age: number;
  email: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(data?: ExceptPartial<SelfJSONed<TestModel>, "createdAt" | "updatedAt">) {
    super();
    this.deserialize(data || {});
  }

  deserialize(data: Partial<SelfJSONed<TestModel>>): this {
    this.id = data.id || "";
    this.name = data.name || "";
    this.age = data.age || 0;
    this.email = data.email || "";
    this.createdAt = data.createdAt ? new Date(data.createdAt as any) : new Date();
    this.updatedAt = data.updatedAt ? new Date(data.updatedAt as any) : new Date();
    return this;
  }

  @Operation({
    name: "testAction"
  })
  async action() {}

  @Operation
  async action2() {}
}

TestModel.registerSerializer();

export class SubClassModel extends UuidModel {
  name: string;
  age: number;
  readonly test: number;
  collection: { name: string; type: string }[];
  createdAt: Date;

  constructor(data: SelfJSONed<SubClassModel> = {} as any) {
    super(data);
    this.name = data.name;
    this.age = data.age;
    if (data.age < 0) {
      throw new Error("Age cannot be negative");
    }
    this.test = data.test || data.age * 4;
    this.collection = data.collection;
    // @ts-ignore
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
  }
}

SubClassModel.registerSerializer();

type Repo<T extends Storable> = Repository<StorableClass<T> & ModelClass<T>>;
@suite
class ModelTest {
  @test
  async repositories() {
    // Ensuring that the repositories are re  gistered correctly
    const repo1: Repo<UuidModel> = new MemoryRepository(UuidModel, ["uuid"]);
    const repo2 = new MemoryRepository<typeof TestModel>(TestModel, ["id", "name"]);
    assert.throws(() => UuidModel.getRepository(), /No repository found/);
    UuidModel.registerRepository(repo1);
    TestModel.registerRepository(repo2);
    assert.strictEqual(UuidModel.getRepository(), repo1);
    assert.strictEqual(TestModel.getRepository(), repo2);
    assert.strictEqual(SubClassModel.getRepository(), repo1);
    assert.strictEqual(
      new SubClassModel({
        uuid: "plop",
        age: 0,
        collection: [],
        createdAt: "",
        name: "",
        test: 123
      }).getRepository(),
      repo1
    );
    assert.strictEqual(new UuidModel().getRepository(), repo1);
    assert.strictEqual(new TestModel().getRepository(), repo2);
    await TestModel.create({
      id: "123",
      name: "Test",
      age: 10,
      email: "test@example.com"
    })
  }

  @test
  async basicMethods() {
    // Ensuring that the primary keys are set correctly
    const model = new TestModel();
    model.id = "123";
    model.name = "Test";
    const pk = model.getPrimaryKey();
    assert.strictEqual(pk.id, "123");
    assert.strictEqual(pk.name, "Test");
    assert.strictEqual(model.getUUID(), "123_Test");
    assert.strictEqual(pk.toString(), "123_Test");

    const model2 = new UuidModel();
    model2.uuid = "456";
    assert.strictEqual(model2.getPrimaryKey(), "456");
    assert.strictEqual(model2.getUUID(), "456");
    assert.strictEqual(await model2.canAct(undefined as ExecutionContext, "" as never), false);
    assert.strictEqual(model2.toProxy(), model2);

    if (isSecurable(model2)) {
      assert.ok(typeof model2.toProxy === "function");
    }

    if (isExposable(model2)) {
      assert.ok(typeof model2.canAct === "function");
    }

    if (isStorable(model2)) {
      assert.ok(typeof model2.getPrimaryKey === "function");
    }

    const model3 = new UuidModel();
    model3.uuid = "456";

    assert.ok(PrimaryKeyEquals(model2.getPrimaryKey(), model3.getPrimaryKey()));

    const model4 = new TestModel();
    model4.id = "123";
    model4.name = "Test";

    assert.ok(PrimaryKeyEquals(model.getPrimaryKey(), model4.getPrimaryKey()));
    assert.ok(PrimaryKeyEquals(model, model4));

    // toJSON return itself for now
    assert.deepStrictEqual(model4.toJSON(), model4);
    // toDTO return itself for now
    assert.deepStrictEqual(model4.toDTO(), model4);

    TestModel.ref({
      id: "123",
      name: "Test"
    });

    model4.setPrimaryKey({
      id: "124",
      name: "Test"
    });
    assert.ok(!PrimaryKeyEquals(model, model4));
  }

  @test
  async upsert() {
    const repo1 = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    SubClassModel.registerRepository(repo1);
    const model1 = await SubClassModel.ref("test").upsert({
      name: "Test",
      collection: [],
      createdAt: "",
      age: 0,
      test: 123
    });
  }
}
