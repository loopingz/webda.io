

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


    @test
    async modelMapImplementation() {
      const repo = new MemoryRepository<typeof TestSimpleModel>(TestSimpleModel, ["uuid"]);
      const model = new TestSimpleModel();
      model.name = "Test";
      model.setPrimaryKey("test");
      await repo.create(model);
      const mapper = new ModelMapLoaderImplementation(
        repo,
        {
          uuid: "test"
        },
        model
      );
      assert.strictEqual((await mapper.get()).name, "Test");
    }