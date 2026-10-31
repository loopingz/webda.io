import { suite, test } from "@webda/test";
import * as assert from "assert";
import { EventRepository, MemoryRepository, registerRepository, useRepository, UuidModel } from "@webda/models";
import { WebdaApplicationTest } from "../test/index.js";
import { TestApplication } from "../test/objects.js";
import { useApplication } from "../application/hooks.js";
import { useCore } from "../core/hooks.js";
import type { Application } from "../application/application.js";
import * as WebdaError from "../errors/errors.js";
import { RelationIntegrity } from "./relationintegrity.service.js";

/*
 * Test models: plain attributes holding the keys, the relations are declared by the metadata given to addModel
 */
class RiCompany extends UuidModel {
  name?: string;
}
class RiProject extends UuidModel {
  company: string;
}
class RiSubProject extends RiProject {}
class RiTask extends UuidModel {
  project: string;
}
class RiUser extends UuidModel {}
class RiReview extends UuidModel {
  author: string;
}
class RiSession extends UuidModel {
  user: string;
}
class RiProfile extends UuidModel {
  reviewer?: string;
  watchers?: string[];
  fan?: string;
  sponsors?: { uuid: string; since?: number }[];
  byKey?: Record<string, { since?: number }>;
}
class RiFolder extends UuidModel {
  parent?: string;
}
class RiCycleA extends UuidModel {
  b?: string;
}
class RiCycleB extends UuidModel {
  a?: string;
}
class RiStaff extends UuidModel {
  employer?: string;
}
class RiCard extends UuidModel {}
class RiBoard extends UuidModel {
  cards?: { uuid: string }[];
}
class RiShelf extends UuidModel {
  pinned?: { uuid: string }[];
}
/** A model without a primary key: no store registers a repository for it */
class RiAlien {
  uuid?: string;
  company?: string;
}

/**
 * A repository whose store can fail: `iterate` throws, `delete` refuses a missing object
 */
class FlakyRepository extends EventRepository<any> {
  failIterate = false;
  failMissingDelete = false;

  async *iterate(query: string, params?: any): AsyncGenerator<any, any, any> {
    if (this.failIterate) throw new Error("store down");
    yield* super.iterate(query, params);
  }

  async delete(uuid: any, conditionField?: any, condition?: any): Promise<void> {
    if (this.failMissingDelete && !(await this.exists(uuid))) throw new Error(`${uuid} is gone`);
    return super.delete(uuid, conditionField, condition);
  }
}

const NS = "WebdaTest";
const MODELS: [string, any, any][] = [
  [
    "RiCompany",
    RiCompany,
    {
      maps: [
        {
          attribute: "staff",
          model: `${NS}/RiStaff`,
          targetLink: "employer",
          targetAttributes: ["uuid"],
          cascadeDelete: true
        },
        // Not cascading, without a model, to an unknown model, and through the parent attribute of the mapped model
        {
          attribute: "contractors",
          model: `${NS}/RiStaff`,
          targetLink: "employer",
          targetAttributes: [],
          cascadeDelete: false
        },
        { attribute: "ghosts", targetLink: "employer", targetAttributes: [], cascadeDelete: true },
        {
          attribute: "nobodies",
          model: `${NS}/RiNobody`,
          targetLink: "company",
          targetAttributes: [],
          cascadeDelete: true
        },
        {
          attribute: "projects",
          model: `${NS}/RiProject`,
          targetLink: "company",
          targetAttributes: ["uuid"],
          cascadeDelete: true
        }
      ]
    }
  ],
  ["RiStaff", RiStaff, { links: [{ attribute: "employer", model: `${NS}/RiCompany`, type: "LINK" }] }],
  ["RiProject", RiProject, { parent: { attribute: "company", model: `${NS}/RiCompany`, onDelete: "CASCADE" } }],
  ["RiSubProject", RiSubProject, { parent: { attribute: "company", model: `${NS}/RiCompany`, onDelete: "CASCADE" } }],
  ["RiTask", RiTask, { parent: { attribute: "project", model: `${NS}/RiProject` } }],
  ["RiUser", RiUser, {}],
  ["RiReview", RiReview, { parent: { attribute: "author", model: `${NS}/RiUser`, onDelete: "RESTRICT" } }],
  [
    "RiSession",
    RiSession,
    { links: [{ attribute: "user", model: `${NS}/RiUser`, type: "LINK", onDelete: "CASCADE" }] }
  ],
  [
    "RiProfile",
    RiProfile,
    {
      links: [
        { attribute: "reviewer", model: `${NS}/RiCompany`, type: "LINK", onDelete: "SET_NULL" },
        { attribute: "watchers", model: `${NS}/RiCompany`, type: "LINKS_SIMPLE_ARRAY", onDelete: "SET_NULL" },
        { attribute: "fan", model: `${NS}/RiCompany`, type: "LINK" },
        { attribute: "sponsors", model: `${NS}/RiCompany`, type: "LINKS_ARRAY", onDelete: "SET_NULL" },
        { attribute: "byKey", model: `${NS}/RiCompany`, type: "LINKS_MAP", onDelete: "SET_NULL" },
        // A link declared on a generic base: no model
        { attribute: "ghost", type: "LINK", onDelete: "CASCADE" }
      ]
    }
  ],
  ["RiFolder", RiFolder, { parent: { attribute: "parent", model: `${NS}/RiFolder`, onDelete: "CASCADE" } }],
  ["RiCycleA", RiCycleA, { links: [{ attribute: "b", model: `${NS}/RiCycleB`, type: "LINK", onDelete: "CASCADE" }] }],
  ["RiCycleB", RiCycleB, { links: [{ attribute: "a", model: `${NS}/RiCycleA`, type: "LINK", onDelete: "CASCADE" }] }],
  ["RiCard", RiCard, {}],
  [
    "RiBoard",
    RiBoard,
    {
      links: [
        { attribute: "cards", model: `${NS}/RiCard`, type: "LINKS_ARRAY", onDelete: "CASCADE", ownership: "CONTAINS" },
        // A model of a dependency not loaded here: nothing to delete
        {
          attribute: "phantoms",
          model: `${NS}/RiNobody`,
          type: "LINKS_SIMPLE_ARRAY",
          onDelete: "CASCADE",
          ownership: "CONTAINS"
        }
      ]
    }
  ],
  [
    "RiShelf",
    RiShelf,
    {
      links: [
        {
          attribute: "pinned",
          model: `${NS}/RiCard`,
          type: "LINKS_ARRAY",
          onDelete: "RESTRICT",
          ownership: "CONTAINS"
        },
        // Not applied: NONE, and no model
        { attribute: "ignored", model: `${NS}/RiCard`, type: "LINKS_ARRAY", onDelete: "NONE", ownership: "CONTAINS" },
        { attribute: "ghosts", type: "LINKS_ARRAY", onDelete: "CASCADE", ownership: "CONTAINS" }
      ]
    }
  ],
  // Its own dependent: a policy applies to it, but no store emits its deletes
  ["RiAlien", RiAlien, { parent: { attribute: "company", model: `${NS}/RiAlien` } }]
];

for (const [name, clazz] of MODELS) {
  clazz.registerSerializer?.(true, `${NS}/${name}`);
}

/**
 * Register the test models, with their relations, in the application
 * @param app - the application
 */
function addModels(app: Application): void {
  for (const [name, clazz, relations] of MODELS) {
    const ancestors = clazz === RiSubProject ? [`${NS}/RiProject`] : [];
    app.addModel(`${NS}/${name}`, clazz, {
      Identifier: `${NS}/${name}`,
      Ancestors: ancestors,
      Subclasses: clazz === RiProject ? [`${NS}/RiSubProject`] : [],
      Relations: relations,
      PrimaryKey: clazz === RiAlien ? undefined : ["uuid"],
      Events: [],
      Schemas: {},
      Actions: {},
      Import: "",
      Plural: name + "s",
      Reflection: {}
    } as any);
  }
}

/**
 * One event repository per model; a subclass shares the storage of its ancestor
 */
function registerRepositories(): void {
  const projects = new Map<string, string>();
  for (const [, clazz] of MODELS) {
    if (clazz === RiAlien) continue;
    const storage = clazz === RiProject || clazz === RiSubProject ? projects : undefined;
    const Repository = clazz === RiSession ? FlakyRepository : EventRepository;
    registerRepository(
      clazz,
      new Repository(clazz, ["uuid"], new MemoryRepository(clazz, ["uuid"], undefined, storage)) as any
    );
  }
}

/**
 * Collect the `Deleted` events of a model
 * @param model - the model
 * @returns the deleted keys
 */
function deletedOf(model: any): string[] {
  const deleted: string[] = [];
  useRepository(model).on("Deleted", (evt: any) => {
    deleted.push(String(evt.object_id));
  });
  return deleted;
}

/**
 * @param model - a model
 * @param uuid - a key
 * @returns whether the object exists
 */
function exists(model: any, uuid: string): Promise<boolean> {
  return useRepository(model).exists(uuid);
}

@suite
class RelationIntegrityTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    addModels(useApplication<Application>());
    return core;
  }

  /**
   * @returns the service declared by the Core
   */
  get integrity(): RelationIntegrity {
    return useCore().getService<RelationIntegrity>("RelationIntegrity");
  }

  async beforeEach() {
    await super.beforeEach();
    registerRepositories();
    this.integrity.hookRepositories();
  }

  @test
  async declaredByTheCore() {
    assert.ok(this.integrity instanceof RelationIntegrity);
    assert.strictEqual(this.integrity.getParameters().maxDepth, 16);
    assert.strictEqual(this.integrity.getParameters().concurrency, 10);
  }

  @test
  async cascadesThroughThreeLevelsAndSubclasses() {
    const company = await RiCompany.create({ uuid: "c1" } as any);
    await RiCompany.create({ uuid: "c2" } as any);
    await RiProject.create({ uuid: "p1", company: "c1" } as any);
    await RiSubProject.create({ uuid: "sp1", company: "c1" } as any);
    await RiProject.create({ uuid: "p2", company: "c2" } as any);
    await RiTask.create({ uuid: "t1", project: "p1" } as any);
    // A task of the subproject: its parent relation targets RiProject, an ancestor of RiSubProject
    await RiTask.create({ uuid: "t2", project: "sp1" } as any);
    await RiTask.create({ uuid: "t3", project: "p2" } as any);
    const deletedTasks = deletedOf(RiTask);

    await company.delete();

    assert.strictEqual(await exists(RiCompany, "c1"), false);
    assert.strictEqual(await exists(RiProject, "p1"), false);
    assert.strictEqual(await exists(RiSubProject, "sp1"), false);
    assert.strictEqual(await exists(RiTask, "t1"), false);
    assert.strictEqual(await exists(RiTask, "t2"), false);
    assert.deepStrictEqual(deletedTasks.sort(), ["t1", "t2"]);
    // Another company is untouched
    assert.strictEqual(await exists(RiProject, "p2"), true);
    assert.strictEqual(await exists(RiTask, "t3"), true);
  }

  @test
  async restrictRefusesAndDeletesNothing() {
    const user = await RiUser.create({ uuid: "u1" } as any);
    await RiReview.create({ uuid: "r1", author: "u1" } as any);
    await RiSession.create({ uuid: "s1", user: "u1" } as any);

    await assert.rejects(() => user.delete(), WebdaError.Conflict);
    assert.strictEqual(await exists(RiUser, "u1"), true);
    assert.strictEqual(await exists(RiReview, "r1"), true);
    assert.strictEqual(await exists(RiSession, "s1"), true);

    // Without reviews, the delete goes through and cascades
    await useRepository(RiReview).delete("r1");
    await user.delete();
    assert.strictEqual(await exists(RiUser, "u1"), false);
    assert.strictEqual(await exists(RiSession, "s1"), false);
  }

  @test
  async setNullRemovesTheLinkOrTheItem() {
    await RiCompany.create({ uuid: "c1" } as any);
    await RiProfile.create({
      uuid: "pr1",
      reviewer: "c1",
      // A missing or numeric item is not a key of the company
      watchers: ["c0", "c1", null, 7, "c2"],
      fan: "c1",
      sponsors: [{ uuid: "c1", since: 1 }, { uuid: "c2", since: 2 }, { since: 3 }],
      byKey: { c1: { since: 1 }, c2: { since: 2 } }
    } as any);
    await RiProfile.create({ uuid: "pr2", reviewer: "c2", watchers: ["c2"], sponsors: null } as any);

    await useRepository(RiCompany).delete("c1");

    const profile: any = await useRepository(RiProfile).get("pr1");
    assert.strictEqual(profile.reviewer, undefined);
    assert.deepStrictEqual([...profile.watchers], ["c0", null, 7, "c2"]);
    assert.deepStrictEqual(
      [...profile.sponsors].map((s: any) => s.uuid),
      ["c2", undefined]
    );
    assert.deepStrictEqual(Object.keys(profile.byKey), ["c2"]);
    // A link without policy: nothing happens
    assert.strictEqual(profile.fan, "c1");
    const other: any = await useRepository(RiProfile).get("pr2");
    assert.strictEqual(other.reviewer, "c2");
    assert.deepStrictEqual([...other.watchers], ["c2"]);
  }

  @test
  async cascadeDeleteOfAModelsMapped() {
    await RiCompany.create({ uuid: "c1" } as any);
    await RiStaff.create({ uuid: "st1", employer: "c1" } as any);
    await RiStaff.create({ uuid: "st2", employer: "c2" } as any);
    await useRepository(RiCompany).delete("c1");
    assert.strictEqual(await exists(RiStaff, "st1"), false);
    assert.strictEqual(await exists(RiStaff, "st2"), true);
  }

  @test
  async containsDeletesTheListedModels() {
    await RiCard.create({ uuid: "k1" } as any);
    await RiCard.create({ uuid: "k2" } as any);
    await RiCard.create({ uuid: "k3" } as any);
    const board = await RiBoard.create({ uuid: "b1", cards: [{ uuid: "k1" }, { uuid: "k2" }] } as any);

    await board.delete();

    assert.strictEqual(await exists(RiCard, "k1"), false);
    assert.strictEqual(await exists(RiCard, "k2"), false);
    assert.strictEqual(await exists(RiCard, "k3"), true);
  }

  @test
  async containsMissingOrEmpty() {
    // Nothing listed, a listed model already gone, a model not loaded, and a missing owner
    await RiCard.create({ uuid: "k1" } as any);
    const empty = await RiBoard.create({ uuid: "b0" } as any);
    await empty.delete();
    const board = await RiBoard.create({
      uuid: "b1",
      cards: [{ uuid: "k1" }, { uuid: "gone" }],
      phantoms: ["x1", { uuid: "x2" }]
    } as any);
    await board.delete();
    assert.strictEqual(await exists(RiCard, "k1"), false);
    await useRepository(RiBoard).delete("missing");
  }

  @test
  async indexEdgeCases() {
    const service: any = this.integrity;
    // An entry of the application models can be undefined (a model that failed to load): skipped
    service.buildIndex({ ...useApplication().getModels(), [`${NS}/RiMissing`]: undefined });
    assert.deepStrictEqual(service.dependentsOf("Nope/Model"), []);
    // A company cascades to its projects through the parent and the mapped relation, once
    assert.deepStrictEqual(
      service.dependentsOf(`${NS}/RiCompany`).filter((d: any) => d.model === `${NS}/RiProject`),
      [{ model: `${NS}/RiProject`, attribute: "company", type: "PARENT", onDelete: "CASCADE" }]
    );
    assert.deepStrictEqual(
      service.ownedOf(`${NS}/RiShelf`).map((o: any) => o.attribute),
      ["pinned"]
    );
    // Hydrated maps and links
    assert.deepStrictEqual(service.keysOf(`${NS}/RiCompany`, { toJSON: () => ({ c1: {} }) }, "LINKS_MAP"), ["c1"]);
    assert.deepStrictEqual(
      service.keysOf(`${NS}/RiCompany`, [{ getPrimaryKey: () => "c2" }, "c3", undefined], "LINKS_SIMPLE_ARRAY"),
      ["c2", "c3"]
    );
    assert.deepStrictEqual(service.keysOf(`${NS}/RiCompany`, 42, "LINKS_ARRAY"), []);
  }

  @test
  async cascadeFailureIsReported() {
    const sessions = useRepository(RiSession) as FlakyRepository;
    await RiUser.create({ uuid: "u1" } as any);
    await RiSession.create({ uuid: "s1", user: "u1" } as any);
    sessions.failIterate = true;
    try {
      await assert.rejects(() => useRepository(RiUser).delete("u1"), /store down/);
    } finally {
      sessions.failIterate = false;
    }
    // The user is deleted, the session is an orphan
    assert.strictEqual(await exists(RiUser, "u1"), false);
    assert.strictEqual(await exists(RiSession, "s1"), true);
  }

  @test
  async deleteAllSkipsVisitedAndGoneObjects() {
    const service: any = this.integrity;
    const sessions = useRepository(RiSession) as FlakyRepository;
    const session = await RiSession.create({ uuid: "s1", user: "u1" } as any);
    const errors: any[] = [];
    await service.deleteAll([session], { visited: new Set([`${NS}/RiSession#s1`]), depth: 1 }, errors);
    assert.strictEqual(await exists(RiSession, "s1"), true);
    // Deleted meanwhile: the store refuses, not an error
    await sessions.delete("s1");
    sessions.failMissingDelete = true;
    try {
      await service.deleteAll([session], { visited: new Set(), depth: 1 }, errors);
    } finally {
      sessions.failMissingDelete = false;
    }
    assert.deepStrictEqual(errors, []);
  }

  @test
  async containsRestrict() {
    await RiCard.create({ uuid: "k1" } as any);
    const shelf = await RiShelf.create({ uuid: "sh1", pinned: [{ uuid: "k1" }, { uuid: "gone" }] } as any);
    await assert.rejects(() => shelf.delete(), WebdaError.Conflict);
    assert.strictEqual(await exists(RiShelf, "sh1"), true);
    // Only missing models listed: nothing restricts
    await useRepository(RiCard).delete("k1");
    await shelf.delete();
    assert.strictEqual(await exists(RiShelf, "sh1"), false);
  }

  @test
  async selfParentTreeAndCycleTerminate() {
    await RiFolder.create({ uuid: "f1" } as any);
    await RiFolder.create({ uuid: "f2", parent: "f1" } as any);
    await RiFolder.create({ uuid: "f3", parent: "f2" } as any);
    await RiFolder.create({ uuid: "f4", parent: "f2" } as any);
    await useRepository(RiFolder).delete("f1");
    for (const uuid of ["f1", "f2", "f3", "f4"]) {
      assert.strictEqual(await exists(RiFolder, uuid), false, uuid);
    }

    // A -> B -> A
    await RiCycleA.create({ uuid: "a1", b: "b1" } as any);
    await RiCycleB.create({ uuid: "b1", a: "a1" } as any);
    await RiCycleA.create({ uuid: "a2", b: "b1" } as any);
    await useRepository(RiCycleA).delete("a1");
    assert.strictEqual(await exists(RiCycleA, "a1"), false);
    assert.strictEqual(await exists(RiCycleB, "b1"), false);
    assert.strictEqual(await exists(RiCycleA, "a2"), false);
  }

  @test
  async maxDepth() {
    const service = this.integrity;
    const maxDepth = service.getParameters().maxDepth;
    try {
      service.getParameters().maxDepth = 2;
      await RiFolder.create({ uuid: "d0" } as any);
      for (let i = 1; i <= 4; i++) {
        await RiFolder.create({ uuid: `d${i}`, parent: `d${i - 1}` } as any);
      }
      await assert.rejects(() => useRepository(RiFolder).delete("d0"), /maxDepth/);
      // The levels within the depth are deleted, the rest is left as orphans
      assert.strictEqual(await exists(RiFolder, "d0"), false);
      assert.strictEqual(await exists(RiFolder, "d4"), true);
    } finally {
      service.getParameters().maxDepth = maxDepth;
    }
  }

  @test
  async maxDepthAggregatesTheErrors() {
    const service = this.integrity;
    const maxDepth = service.getParameters().maxDepth;
    try {
      service.getParameters().maxDepth = 1;
      await RiFolder.create({ uuid: "d0" } as any);
      for (const branch of ["a", "b"]) {
        await RiFolder.create({ uuid: `d1${branch}`, parent: "d0" } as any);
        await RiFolder.create({ uuid: `d2${branch}`, parent: `d1${branch}` } as any);
      }
      // Both branches fail at the same level: one error reporting the two
      await assert.rejects(
        () => useRepository(RiFolder).delete("d0"),
        (err: any) => err instanceof AggregateError && err.errors.length === 2 && /failed 2 times/.test(err.message)
      );
      assert.strictEqual(await exists(RiFolder, "d1a"), false);
      assert.strictEqual(await exists(RiFolder, "d2a"), true);
    } finally {
      service.getParameters().maxDepth = maxDepth;
    }
  }

  @test
  async deleteManyDoesNotCascade() {
    await RiCompany.create({ uuid: "c1" } as any);
    await RiProject.create({ uuid: "p1", company: "c1" } as any);
    assert.strictEqual(await useRepository(RiCompany).deleteMany("DELETE WHERE uuid = 'c1'"), 1);
    assert.strictEqual(await exists(RiCompany, "c1"), false);
    assert.strictEqual(await exists(RiProject, "p1"), true);
  }

  @test
  async hooksARepositoryOnce() {
    // A second call (a recomputed store, a test) does not cascade twice
    this.integrity.hookRepositories();
    await RiCompany.create({ uuid: "c1" } as any);
    await RiProject.create({ uuid: "p1", company: "c1" } as any);
    const deleted = deletedOf(RiProject);
    await useRepository(RiCompany).delete("c1");
    assert.deepStrictEqual(deleted, ["p1"]);
  }
}

@suite
class RelationIntegrityWithoutModuleTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    // An application not loading the @webda/core module
    delete app.getModdas()["Webda/RelationIntegrity"];
  }

  @test
  async declaredFromTheClass() {
    const service = useCore().getService<RelationIntegrity>("RelationIntegrity");
    assert.ok(service instanceof RelationIntegrity);
    assert.strictEqual(service.getParameters().enabled, true);
  }
}

@suite
class RelationIntegrityDisabledTest extends WebdaApplicationTest {
  getTestConfiguration(): string | undefined {
    return process.cwd() + "/../../sample-app";
  }

  async tweakApp(app: TestApplication) {
    await super.tweakApp(app);
    app.getCurrentConfiguration().services.RelationIntegrity = {
      type: "Webda/RelationIntegrity",
      enabled: false
    };
  }

  protected async buildWebda() {
    const core = await super.buildWebda();
    addModels(useApplication<Application>());
    return core;
  }

  async beforeEach() {
    await super.beforeEach();
    registerRepositories();
    useCore().getService<RelationIntegrity>("RelationIntegrity").hookRepositories();
  }

  @test
  async noCascade() {
    await RiCompany.create({ uuid: "c1" } as any);
    await RiProject.create({ uuid: "p1", company: "c1" } as any);
    await useRepository(RiCompany).delete("c1");
    assert.strictEqual(await exists(RiProject, "p1"), true);
  }
}
