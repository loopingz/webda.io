import { suite, test } from "@webda/test";
import * as assert from "assert";
import { DirtyModelMixin, ExceptPartial, Model, UuidModel, WEBDA_DELETED } from "./model";
import { isStorable, isModelClass, PrimaryKeyEquals, ModelClass, WEBDA_PRIMARY_KEY } from "./storable";
import { MemoryRepository } from "./repositories/memory";
import { SelfJSONed, WebdaFieldsMixIn } from "./types";
import { registerRepository } from "./repositories/hooks";
import { Merge } from "@webda/tsc-esm";
import { track } from "@webda/utils";
import { supportsAtomicOperations, supportsCollectionOperations } from "./repositories/repository";

// Import index to cover re-exports
import * as IndexExports from "./index";

export class TestModel extends Model {
  [WEBDA_PRIMARY_KEY] = ["id", "name"] as const;
  id!: string;
  name!: string;
  age!: number;
  email!: string;
  createdAt!: Date;
  updatedAt!: Date;

  constructor(data?: Merge<SelfJSONed<TestModel>, TestModel>) {
    super();
    data ??= {} as any;
    data!.createdAt ??= new Date(data!.createdAt);
    data!.updatedAt ??= new Date(data!.updatedAt);
    this.load(data as any);
  }

  static getDeserializers<T extends ModelClass>(
    this: T
  ): Partial<Record<keyof InstanceType<T>, (value: any) => any>> | undefined {
    return {
      createdAt: Model.DefaultDeserializer.Date,
      updatedAt: Model.DefaultDeserializer.Date
    } as any;
  }
}

interface TestModelInterface extends TestModel {
  get createdAt(): Date;
  set createdAt(value: number | string | Date);
}

TestModel.registerSerializer();

export class SubClassModel extends UuidModel {
  name: string;
  age: number;
  readonly test: number;
  collection: { name: string; type: string }[];
  createdAt: Date;
  metadata: {
    counter: number;
  };

  constructor(data: SelfJSONed<ExceptPartial<SubClassModel, "createdAt">> = {} as any) {
    super(data);
    this.name = data.name;
    this.age = data.age;
    if (data.age < 0) {
      throw new Error("Age cannot be negative");
    }
    this.test = data.test || data.age * 4;
    this.collection = data.collection;
    this.createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    this.metadata = {
      counter: data.metadata?.counter ?? 0
    };
  }

  static getDeserializers<T extends ModelClass>(
    this: T
  ): Partial<Record<keyof InstanceType<T>, (value: any) => any>> | undefined {
    return {
      createdAt: Model.DefaultDeserializer.Date
    } as any;
  }
}

SubClassModel.registerSerializer();

@suite
class ModelTest {
  @test
  async repositories() {
    // Ensuring that the repositories are re  gistered correctly
    const repo1 = new MemoryRepository(UuidModel, ["uuid"]);
    const repo2 = new MemoryRepository<typeof TestModel>(TestModel, ["id", "name"]);
    assert.throws(() => UuidModel.getRepository(), /No repository found/);
    registerRepository(UuidModel, repo1);
    registerRepository(TestModel, repo2);
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
    });
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
    assert.ok(model.createdAt instanceof Date);
    assert.ok(model.updatedAt instanceof Date);

    const model2 = new UuidModel();
    model2.uuid = "456";
    assert.strictEqual(model2.getPrimaryKey(), "456");
    assert.strictEqual(model2.getUUID(), "456");

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
    registerRepository(SubClassModel, repo1);
    const model1 = await SubClassModel.ref("test").upsert({
      name: "Test",
      collection: [],
      createdAt: "2025-01-01T00:00:00Z",
      age: 0,
      test: 123
    });
    assert.strictEqual(model1.uuid, "test");
    assert.strictEqual(model1.name, "Test");
    assert.strictEqual(model1.age, 0);
    assert.strictEqual(model1.test, 123);
    assert.ok(model1.createdAt instanceof Date);
    assert.strictEqual(model1.createdAt.toISOString(), "2025-01-01T00:00:00.000Z");

    // Retrieving again should not create a new one
    const model2 = await SubClassModel.ref("test").upsert({
      name: "Test2",
      collection: [],
      createdAt: "2025-01-01T00:00:00Z",
      age: 1,
      test: 123
    });
    assert.strictEqual(model2.uuid, "test");
    assert.strictEqual(model2.name, "Test2");
    assert.strictEqual(model2.age, 1);
    assert.strictEqual(model2.test, 123);
    assert.ok(model2.createdAt instanceof Date);
    assert.strictEqual(model2.createdAt.toISOString(), "2025-01-01T00:00:00.000Z");

    assert.strictEqual((await repo1.query("")).results.length, 1);
  }

  @test
  async deleteAndIsDeleted() {
    const repo1 = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repo1);
    const model = await SubClassModel.ref("del-test").create({
      name: "ToDelete",
      collection: [],
      createdAt: "",
      age: 5
    } as any);
    assert.strictEqual(model.isDeleted(), undefined);
    await model.delete();
    assert.ok(!(await repo1.exists("del-test")));
  }

  @test
  async patch() {
    const repo1 = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repo1);
    const model = await SubClassModel.ref("patch-test").create({
      name: "Original",
      collection: [],
      createdAt: "",
      age: 10
    } as any);
    await model.patch({ name: "Patched" } as any);
    assert.strictEqual(model.name, "Patched");
    const fromRepo = await repo1.get("patch-test");
    assert.strictEqual(fromRepo.name, "Patched");
  }

  @test
  async saveWithDirty() {
    const repo1 = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    registerRepository(SubClassModel, repo1);
    const model = await SubClassModel.ref("dirty-test").create({
      name: "Original",
      collection: [],
      createdAt: "",
      age: 10
    } as any);
    const trackedModel = track(model);
    // Simulate dirty tracking
    assert.strictEqual(trackedModel.dirty.valueOf(), false);
    trackedModel.name = "DirtySave";
    assert.strictEqual(trackedModel.dirty.getProperties().length, 1);
    await trackedModel.save();
    assert.strictEqual(trackedModel.dirty.valueOf(), false);
    const fromRepo = await repo1.get("dirty-test");
    assert.strictEqual(fromRepo.name, "DirtySave");
  }

  @test
  async deserializeWithoutInstance() {
    // Test deserialize creating a new instance (no instance param)
    const result = TestModel.deserialize({ id: "1", name: "Deserialized" });
    assert.strictEqual(result.id, "1");
    assert.strictEqual(result.name, "Deserialized");
  }

  @test
  coverageHelpers() {
    // isModelClass
    assert.ok(isModelClass(TestModel));
    assert.ok(isModelClass(SubClassModel));
    assert.ok(!isModelClass({}));
    assert.ok(!isModelClass("string"));
    assert.ok(!isModelClass(null));
    assert.ok(!isModelClass(function () {}));

    // WebdaFieldsMixIn - just returns the class unchanged
    const result = WebdaFieldsMixIn(TestModel);
    assert.strictEqual(result, TestModel);

    // IndexExports should be defined (covers index.ts re-exports)
    assert.ok(IndexExports.Model);
    assert.ok(IndexExports.MemoryRepository);

    // supportsAtomicOperations / supportsCollectionOperations
    const repo = new MemoryRepository<typeof SubClassModel>(SubClassModel, ["uuid"]);
    assert.ok(supportsAtomicOperations(repo as any));
    assert.ok(supportsCollectionOperations(repo as any));
    // Test with a plain object that doesn't support them
    assert.ok(!supportsAtomicOperations({ get: () => {} } as any));
    assert.ok(!supportsCollectionOperations({ get: () => {} } as any));

    // toProxy
    const model = new SubClassModel({ name: "Test", age: 1, collection: [], test: 1 } as any);
    assert.strictEqual(model.toProxy(), model);
  }
}
