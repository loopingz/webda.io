import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "../model.model.js";
import { MemoryRepository } from "./memory.js";
import { EventRepository } from "./event.js";
import { registerRepository, Repositories } from "./hooks.js";
import { ModelTypeResolver, setTypeResolver } from "../types-resolver.js";

class Animal extends UuidModel {
  name: string;
}
class Dog extends Animal {}
class Puppy extends Dog {}
class Plant extends UuidModel {
  name: string;
}
for (const clazz of [Animal, Dog, Puppy, Plant]) {
  (clazz as any).registerSerializer();
}
// Subclasses are direct only, as Application.setModelMetadata sets them
(Animal as any).Metadata = { Identifier: "Zoo/Animal", Subclasses: [Dog], PrimaryKey: ["uuid"] };
(Dog as any).Metadata = { Identifier: "Zoo/Dog", Subclasses: [Puppy], PrimaryKey: ["uuid"] };
(Puppy as any).Metadata = { Identifier: "Zoo/Puppy", Subclasses: [], PrimaryKey: ["uuid"] };
(Plant as any).Metadata = { Identifier: "Zoo/Plant", Subclasses: [], Aliases: ["Zoo/Flora"], PrimaryKey: ["uuid"] };

@suite
class MemoryRepositoryLegacyTypesTest {
  shared: Map<string, string>;
  repos: Record<string, MemoryRepository<any>>;

  /**
   * One shared storage, one repository per model, the table root set as MemoryStore does
   * @param install - install an application resolver for the four models
   */
  setup(install: boolean) {
    this.shared = new Map();
    this.repos = {};
    for (const [name, model] of [
      ["animal", Animal],
      ["dog", Dog],
      ["puppy", Puppy],
      ["plant", Plant]
    ] as [string, any][]) {
      const repo = new MemoryRepository(model, ["uuid"], "_", this.shared).setTableRoot(Animal as any);
      registerRepository(model, repo);
      this.repos[name] = repo;
    }
    if (install) {
      setTypeResolver(
        new ModelTypeResolver({ "Zoo/Animal": Animal, "Zoo/Dog": Dog, "Zoo/Puppy": Puppy, "Zoo/Plant": Plant } as any, {
          namespace: "Zoo"
        })
      );
    }
  }

  /**
   * Write Webda 3 plain rows
   * @param rows - data by key
   */
  seed(rows: Record<string, any>) {
    for (const [key, data] of Object.entries(rows)) {
      this.shared.set(key, JSON.stringify({ uuid: key, ...data }));
    }
  }

  /**
   * @param repo - the repository
   * @param query - the query
   * @returns the sorted uuids
   */
  async uuids(repo: MemoryRepository<any>, query: string = ""): Promise<string[]> {
    return (await repo.query(query)).results.map((item: any) => item.uuid).sort();
  }

  afterEach() {
    setTypeResolver(undefined);
    for (const model of [Animal, Dog, Puppy, Plant]) {
      Repositories.delete(model as any);
    }
  }

  @test
  async subclassFilterIsTransitive() {
    this.setup(false);
    await (Puppy as any).create({ uuid: "p", name: "puppy" });
    await (Dog as any).create({ uuid: "d", name: "dog" });
    await (Animal as any).create({ uuid: "a", name: "animal" });
    assert.deepStrictEqual(await this.uuids(this.repos.animal), ["a", "d", "p"]);
    assert.deepStrictEqual(await this.uuids(this.repos.dog), ["d", "p"]);
    assert.deepStrictEqual((this.repos.animal as any).buildClassFilterIdentifiers(), [
      "Zoo/Animal",
      "Zoo/Dog",
      "Zoo/Puppy"
    ]);
  }

  @test
  async legacyRowsAreVisibleAndNormalized() {
    this.setup(true);
    this.seed({
      a1: { __type: "Zoo/Animal", name: "current" },
      a2: { __type: "Animal", name: "short" },
      a3: { name: "untyped" },
      d1: { __type: "zoo/dog", name: "lower" },
      p1: { __type: "PUPPY", name: "upper short" },
      g1: { __type: "Zoo/Flora", name: "alias" },
      // The short name of a renamed model
      g2: { __type: "flora", name: "short alias" },
      u1: { __type: "Gone/Thing", name: "unknown" }
    });
    assert.deepStrictEqual(await this.uuids(this.repos.animal), ["a1", "a2", "a3", "d1", "p1"]);
    assert.deepStrictEqual(await this.uuids(this.repos.dog), ["d1", "p1"]);
    assert.deepStrictEqual(await this.uuids(this.repos.puppy), ["p1"]);
    assert.deepStrictEqual(await this.uuids(this.repos.plant), ["g1", "g2"]);
    assert.deepStrictEqual(await this.uuids(this.repos.animal, "name = 'short'"), ["a2"]);
    // Rows load as the resolved class, with the current identifier attached (not enumerable)
    const p1: any = await this.repos.animal.get("p1");
    assert.ok(p1 instanceof Puppy);
    assert.strictEqual(p1.__type, "Zoo/Puppy");
    assert.ok(!Object.keys(p1).includes("__type"));
    // An unknown type read by key loads as the repository model and keeps its stored type
    const u1: any = await this.repos.animal.get("u1");
    assert.strictEqual(u1.constructor, Animal);
    assert.strictEqual(u1.__type, "Gone/Thing");
    // A row of an unrelated model is still refused
    await assert.rejects(() => this.repos.plant.get("d1"), /does not belong/);
    // Saving writes the current identifier; a subclass row keeps its subclass identifier
    await this.repos.animal.patch("a2", { name: "patched" } as any);
    await this.repos.animal.patch("p1", { name: "patched" } as any);
    await this.repos.plant.patch("g2", { name: "patched" } as any);
    assert.strictEqual(JSON.parse(this.shared.get("a2")!).__type, "Zoo/Animal");
    assert.strictEqual(JSON.parse(this.shared.get("p1")!).__type, "Zoo/Puppy");
    assert.strictEqual(JSON.parse(this.shared.get("g2")!).__type, "Zoo/Plant");
    assert.strictEqual(JSON.parse(this.shared.get("u1")!).__type, "Gone/Thing");
  }

  @test
  async unknownModelFallsBackToExactHierarchy() {
    // The installed resolver does not know these hand-stamped models
    this.setup(false);
    setTypeResolver(new ModelTypeResolver({}, { namespace: "Other" }));
    this.seed({ a: { __type: "Zoo/Animal" }, p: { __type: "Zoo/Puppy" }, s: { __type: "Animal" } });
    assert.deepStrictEqual(await this.uuids(this.repos.animal), ["a", "p"]);
    assert.deepStrictEqual(await this.uuids(this.repos.dog), ["p"]);
  }

  @test
  async renamedEnvelopeRowLoadsAsTheAliasedModel() {
    this.setup(true);
    await (Plant as any).create({ uuid: "g", name: "renamed" });
    // A Webda 4 row written when the model was still Zoo/Flora
    const envelope = JSON.parse(this.shared.get("g")!);
    envelope.__type = "Zoo/Flora";
    envelope.$serializer.type = "@webda/models/Flora";
    this.shared.set("g", JSON.stringify(envelope));
    const plant: any = await this.repos.plant.get("g");
    assert.ok(plant instanceof Plant);
    assert.strictEqual(plant.name, "renamed");
    assert.strictEqual(plant.__type, "Zoo/Plant");
    assert.deepStrictEqual(await this.uuids(this.repos.plant), ["g"]);
  }

  @test
  repositoryExposesTypeHelpers() {
    this.setup(true);
    assert.deepStrictEqual(this.repos.dog.acceptedTypes(), [
      "Zoo/Dog",
      "Dog",
      "zoo/dog",
      "dog",
      "Zoo/Puppy",
      "Puppy",
      "zoo/puppy",
      "puppy"
    ]);
    assert.strictEqual(this.repos.dog.belongsToModel("PUPPY"), true);
    assert.strictEqual(this.repos.dog.belongsToModel(undefined), false);
    assert.strictEqual(this.repos.animal.belongsToModel(undefined), true);
    const inner = new MemoryRepository(Dog as any, ["uuid"], "_", new Map());
    const events = new EventRepository(Dog as any, ["uuid"], inner).setTableRoot(Animal as any);
    assert.strictEqual(inner.getTableRoot(), Animal);
    assert.strictEqual(events.getTableRoot(), Animal);
  }

  @test
  async unresolvedStoredTypeIsKeptOnSave() {
    this.setup(true);
    this.seed({ u1: { __type: "Gone/Thing", name: "unknown" }, a1: { __type: "Zoo/Animal", name: "current" } });
    await this.repos.animal.patch("u1", { name: "patched" } as any);
    const stored = JSON.parse(this.shared.get("u1")!);
    assert.strictEqual(stored.__type, "Gone/Thing");
    assert.strictEqual(stored.value.name, "patched");
    await this.repos.animal.patch("a1", { name: "patched" } as any);
    assert.strictEqual(JSON.parse(this.shared.get("a1")!).__type, "Zoo/Animal");
  }
}
