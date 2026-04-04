
export function createModelLinksMap<T extends Storable = Storable, K extends object = object>(
  repo: Repository<ModelClass<T>>,
  data: any = {},
  parent?: T
) {
  const setDirty = () => {
    const attrName = parent
      ? Object.keys(parent)
          .filter(k => (parent as any)[k] === result)
          .pop()!
      : undefined;
    if (!attrName) {
      return;
    }
    parent?.[WEBDA_DIRTY]?.add(attrName);
  };
  const result = {
    add: (model: JSONed<ModelRefCustomProperties<T, K>>) => {
      const uuid = repo.getUID(model);
      const pk = repo.getPrimaryKey(model);
      (result as any)[uuid] = new ModelRefCustomMap(pk, repo, repo.excludePrimaryKey(model), parent!);
      setDirty();
    },
    remove: (model: ModelRefCustomProperties<T, any> | PrimaryKeyType<T>) => {
      const uuid = repo.getUID(model);
      if (!(result as any)[uuid]) {
        return;
      }
      delete (result as any)[uuid];
      setDirty();
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      data[key] = new ModelRefCustomMap(repo.parseUID(key), repo, data[key], parent!);
    });
  Object.defineProperty(result, "add", { enumerable: false });
  Object.defineProperty(result, "remove", { enumerable: false });
  return result;
}

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export class ModelMapLoaderImplementation<T extends Storable, K = any> {
  protected [RelationRepository]: Repository<ModelClass<T>>;
  protected [RelationParent]?: T;
  /**
   * The uuid of the object
   */
  public uuid!: PrimaryKeyType<T>;

  constructor(model: Repository<ModelClass<T>>, data: PrimaryKey<T> & K, parent: T) {
    assignNonSymbols(this, data);
    this[RelationRepository] = model;
    this[RelationParent] = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this[RelationRepository].get(this.uuid) as Promise<T>;
  }
}
/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapLoader<T extends Storable, K extends keyof T> = ModelMapLoaderImplementation<T, K> & Pick<T, K>;

/**
 * Define a ModelMap attribute
 *
 * K is used by the compiler to define the field it comes from
 *
 * This will instructed a ModelMapper to deduplicate information from the T model into this
 * current model attribute.
 *
 * The attribute where the current model uuid is found is defined by K
 * The attributes to dedepulicate are defined by the L type
 *
 * In the T model, the K attribute should be of type ModelLink
 *
 * This is used for NoSQL model where you need to denormalize data
 * Webda will auto update the current model when the T model is updated
 * to keep the data in sync
 *
 * A SQL Store should define a JOIN to get the data with auto-fetch2
 */
export type ModelsMapped<
  T extends Storable,
  // Do not remove used by the compiler
  K extends FilterAttributes<T, ModelLinker>,
  L extends Attributes<T>
> = Readonly<ModelMapLoader<T, L>[]>;



  @test
  async modelLinksMap() {
    const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
    registerRepository(TestSimpleModel, repo);
    const model = new TestSimpleModel({ name: "Test", age: 10 });
    model[WEBDA_DIRTY] = new Set();
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
    assert.strictEqual(model[WEBDA_DIRTY].size, 0);
    model["fake"] = map;
    map.add({
      name: "test3",
      uuid: "test3"
    });
    assert.strictEqual(model[WEBDA_DIRTY].size, 1);
    assert.ok(model[WEBDA_DIRTY]!.has("fake"));
    model[WEBDA_DIRTY]!.clear();
    map.remove("test3");
    assert.ok(model[WEBDA_DIRTY]!.has("fake"));
    model[WEBDA_DIRTY]!.clear();
    map.remove("test4");
    assert.strictEqual(model[WEBDA_DIRTY].size, 0);
  }

  @test
  async modelLinksMapWithCompositeId() {
    const repo = new MemoryRepository<typeof TestModel>(TestModel, ["id", "name"]);
    registerRepository(TestModel, repo);
    const model = new TestModel({ id: "test", name: "test" } as any);
    model[WEBDA_DIRTY] = new Set();
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