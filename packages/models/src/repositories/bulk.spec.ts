import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PrependCondition, WebdaQLError, parse } from "@webda/ql";
import { UuidModel } from "../model.model.js";
import { EventRepository } from "./event.js";
import { MemoryRepository } from "./memory.js";

class Task extends UuidModel {
  title: string = "";
  status: string = "open";
  priority: number = 0;
  profile?: { verified?: boolean; level?: number; name?: string };
  __secret?: string;

  constructor(data?: Partial<Task>) {
    super(data);
    Object.assign(this, data);
  }
}
Task.registerSerializer();

/** A model whose metadata lists its fields, so SET targets are validated */
class Listed extends UuidModel {
  title: string = "";
  profile?: { name?: string };

  constructor(data?: Partial<Listed>) {
    super(data);
    Object.assign(this, data);
  }
}
Listed.registerSerializer();
(Listed as any).Metadata = { Reflection: { uuid: {}, title: {}, profile: {} } };

/**
 * A store repository without a native bulk path (like Dynamo and Firestore): the generic key-by-key
 * fallback, with its primitives counted
 */
class FallbackRepository extends MemoryRepository<typeof Task> {
  calls: { delete: string[]; patch: string[] } = { delete: [], patch: [] };

  /** @override */
  async deleteMany(statement: any, params?: any): Promise<number> {
    return this.deleteManyByKey(statement, params);
  }

  /** @override */
  async updateMany(statement: any, params?: any): Promise<number> {
    return this.updateManyByKey(statement, params);
  }

  /** @override */
  async delete(primaryKey: any): Promise<void> {
    this.calls.delete.push(String(primaryKey));
    return super.delete(primaryKey);
  }

  /** @override */
  async patch(primaryKey: any, data: any): Promise<void> {
    this.calls.patch.push(String(primaryKey));
    return super.patch(primaryKey, data);
  }
}

/** Parent and child sharing one storage, as a store wires them */
class Animal extends UuidModel {
  kind: string = "";
  constructor(data?: Partial<Animal>) {
    super(data);
    Object.assign(this, data);
  }
}
Animal.registerSerializer();
class Dog extends Animal {}
Dog.registerSerializer();
(Animal as any).Metadata = { Identifier: "Test/Animal", Subclasses: [Dog] };
(Dog as any).Metadata = { Identifier: "Test/Dog", Subclasses: [] };

const EVENTS = [
  "Create",
  "Created",
  "Update",
  "Updated",
  "Patch",
  "Patched",
  "Delete",
  "Deleted",
  "PartialUpdate",
  "PartialUpdated",
  "Query",
  "Queried"
];

/**
 * Run the bulk scenarios against a repository
 */
@suite
class BulkStatementsTest {
  /**
   * @param repo - the repository to fill
   * @param count - number of tasks
   */
  async fill(repo: MemoryRepository<typeof Task>, count: number = 6) {
    for (let i = 1; i <= count; i++) {
      await repo.create(
        new Task({
          uuid: `t${i}`,
          title: `task ${i}`,
          status: i % 2 ? "open" : "done",
          priority: i,
          profile: { name: `p${i}`, level: i }
        })
      );
    }
  }

  /**
   * @param repo - the repository
   * @returns the sorted uuids still stored
   */
  async uuids(repo: MemoryRepository<typeof Task>): Promise<string[]> {
    return (await repo.query("")).results.map(t => t.uuid).sort();
  }

  /**
   * @returns a memory repository and the event repository wrapping it, with every event recorded
   */
  wrapped(): { repo: MemoryRepository<typeof Task>; events: EventRepository<typeof Task>; seen: string[] } {
    const repo = new MemoryRepository<typeof Task>(Task, ["uuid"]);
    const events = new EventRepository<typeof Task>(Task, ["uuid"], repo);
    const seen: string[] = [];
    for (const name of EVENTS) {
      events.on(name as any, () => seen.push(name));
    }
    return { repo, events, seen };
  }

  @test
  async deleteMany() {
    const { repo, events, seen } = this.wrapped();
    await this.fill(repo);
    assert.strictEqual(await events.deleteMany("DELETE WHERE status = 'done' AND priority > 2"), 2);
    assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2", "t3", "t5"]);
    // LIMIT
    assert.strictEqual(await events.deleteMany("DELETE WHERE status = ? LIMIT 2", ["open"]), 2);
    assert.strictEqual((await this.uuids(repo)).length, 2);
    // Nothing matches
    assert.strictEqual(await events.deleteMany("DELETE WHERE priority > :p", { p: 100 }), 0);
    // Without WHERE: everything
    assert.strictEqual(await events.deleteMany("DELETE"), 2);
    assert.deepStrictEqual(await this.uuids(repo), []);
    // The parsed form is accepted too
    await this.fill(repo, 3);
    assert.strictEqual(await events.deleteMany(parse("DELETE WHERE priority = 1")), 1);
    assert.deepStrictEqual(
      seen.filter(e => e !== "Query" && e !== "Queried"),
      [],
      "bulk deletes emit no per-object event"
    );
  }

  @test
  async updateMany() {
    const { repo, events, seen } = this.wrapped();
    await this.fill(repo);
    assert.strictEqual(
      await events.updateMany("UPDATE SET status = ?, title = ?, profile.verified = ? WHERE status = ?", [
        "archived",
        "it's done",
        true,
        "done"
      ]),
      3
    );
    for (const uuid of ["t2", "t4", "t6"]) {
      const task: any = await repo.get(uuid);
      assert.strictEqual(task.status, "archived");
      assert.strictEqual(task.title, "it's done");
      assert.deepStrictEqual(task.profile, {
        name: `p${uuid.substring(1)}`,
        level: Number(uuid.substring(1)),
        verified: true
      });
    }
    assert.strictEqual(((await repo.get("t1")) as any).status, "open");
    // Named parameters, LIMIT
    assert.strictEqual(
      await events.updateMany("UPDATE SET priority = :p WHERE status = :s LIMIT 2", { p: 0, s: "open" }),
      2
    );
    assert.strictEqual((await repo.query("priority = 0")).results.length, 2);
    // A nested target under a missing parent creates it
    await repo.create(new Task({ uuid: "bare", title: "bare" }));
    assert.strictEqual(await events.updateMany("UPDATE SET profile.level = 7 WHERE uuid = 'bare'"), 1);
    assert.deepStrictEqual(((await repo.get("bare")) as any).profile, { level: 7 });
    assert.deepStrictEqual(seen, [], "bulk updates emit no per-object event");
  }

  @test
  async updateChangingTheWhereProcessesEachObjectOnce() {
    for (const repo of [new MemoryRepository<typeof Task>(Task, ["uuid"]), new FallbackRepository(Task, ["uuid"])]) {
      // More objects than one iterate page (100)
      await this.fill(repo, 250);
      assert.strictEqual(await repo.updateMany("UPDATE SET priority = 0, status = 'open' WHERE priority > 0"), 250);
      assert.strictEqual((await repo.query("priority = 0 LIMIT 1000")).results.length, 250);
      if (repo instanceof FallbackRepository) {
        assert.strictEqual(repo.calls.patch.length, 250);
        assert.strictEqual(new Set(repo.calls.patch).size, 250, "no object patched twice");
      }
      // The WHERE no longer matches anything
      assert.strictEqual(await repo.updateMany("UPDATE SET priority = 1 WHERE priority > 0"), 0);
    }
  }

  @test
  async fallbackUsesThePerKeyPrimitives() {
    const repo = new FallbackRepository(Task, ["uuid"]);
    const events = new EventRepository<typeof Task>(Task, ["uuid"], repo);
    const seen: string[] = [];
    for (const name of EVENTS) {
      events.on(name as any, () => seen.push(name));
    }
    await this.fill(repo);
    assert.strictEqual(
      await events.updateMany("UPDATE SET profile.verified = TRUE, title = 'x' WHERE status = 'done'"),
      3
    );
    assert.deepStrictEqual(repo.calls.patch.sort(), ["t2", "t4", "t6"]);
    const t2: any = await repo.get("t2");
    assert.deepStrictEqual(t2.profile, { name: "p2", level: 2, verified: true }, "nested siblings kept");
    assert.strictEqual(t2.title, "x");
    assert.strictEqual(await events.deleteMany("DELETE WHERE status = 'open' LIMIT 2"), 2);
    assert.strictEqual(repo.calls.delete.length, 2);
    assert.strictEqual(await events.deleteMany("DELETE WHERE status = ?", ["done"]), 3);
    assert.deepStrictEqual(await this.uuids(repo), ["t5"]);
    assert.deepStrictEqual(seen, [], "the fallback emits no per-object event");
  }

  @test
  async statementTypesAreChecked() {
    const repo = new MemoryRepository<typeof Task>(Task, ["uuid"]);
    await this.fill(repo, 2);
    // query / iterate are SELECT only: no DELETE, no UPDATE, no field list
    for (const statement of [
      "DELETE WHERE priority = 1",
      "UPDATE SET title = 'x'",
      "SELECT title WHERE priority = 1"
    ]) {
      await assert.rejects(() => repo.query(statement), WebdaQLError, statement);
      await assert.rejects(async () => {
        for await (const _ of repo.iterate(statement)) {
          // Never reached
        }
      }, WebdaQLError);
      await assert.rejects(() => repo.query(parse(statement) as any), WebdaQLError, statement);
    }
    assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2"], "nothing was deleted or changed");
    // The bulk methods take their own statement only
    for (const statement of ["priority = 1", "SELECT title", "UPDATE SET title = 'x'"]) {
      await assert.rejects(() => repo.deleteMany(statement), /deleteMany needs a DELETE statement/, statement);
    }
    for (const statement of ["priority = 1", "SELECT title", "DELETE"]) {
      await assert.rejects(() => repo.updateMany(statement), /updateMany needs an? UPDATE statement/, statement);
    }
    await assert.rejects(() => repo.deleteMany(parse("DELETE"), [1]), /statement string/);
    assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2"]);
  }

  @test
  async setTargetsAreChecked() {
    for (const repo of [new MemoryRepository<typeof Task>(Task, ["uuid"]), new FallbackRepository(Task, ["uuid"])]) {
      await this.fill(repo, 2);
      for (const statement of [
        "UPDATE SET uuid = 'other'",
        "UPDATE SET uuid.x = 1",
        "UPDATE SET __secret = 'x'",
        "UPDATE SET profile.__hidden = 1",
        "UPDATE SET profile.constructor = 1",
        "UPDATE SET prototype = 1"
      ]) {
        await assert.rejects(() => repo.updateMany(statement), WebdaQLError, statement);
      }
      assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2"]);
      assert.strictEqual(((await repo.get("t1")) as any).__secret, undefined);
      assert.strictEqual(({} as any).x, undefined);
    }
    // The model fields, when its metadata lists them
    const listed = new MemoryRepository<typeof Listed>(Listed, ["uuid"]);
    await listed.create(new Listed({ uuid: "l1", title: "a" }));
    assert.strictEqual(await listed.updateMany("UPDATE SET title = 'b', profile.name = 'n'"), 1);
    await assert.rejects(() => listed.updateMany("UPDATE SET unknown = 1"), /Unknown assignment field "unknown"/);
    assert.deepStrictEqual(listed.getAllowedFields()?.sort(), ["profile", "title", "uuid"]);
    assert.strictEqual(new MemoryRepository<typeof Task>(Task, ["uuid"]).getAllowedFields(), undefined);
  }

  @test
  async nullCannotBeAssigned() {
    const repo = new MemoryRepository<typeof Task>(Task, ["uuid"]);
    await this.fill(repo, 1);
    await assert.rejects(() => repo.updateMany("UPDATE SET title = ?", [null]), /cannot be assigned/);
  }

  @test
  async forgedQueryObjectsAreRefused() {
    for (const repo of [new MemoryRepository<typeof Task>(Task, ["uuid"]), new FallbackRepository(Task, ["uuid"])]) {
      await this.fill(repo, 3);
      const forged: [string, (q: any) => void][] = [
        ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["x}' IS NULL OR TRUE OR data#>>'{y"])],
        ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["$where"])],
        ["DELETE WHERE uuid = 'nope'", q => (q.filter.value = { $ne: "nope" })],
        ["DELETE WHERE uuid = 'nope'", q => (q.filter = { eval: () => true, toString: () => "TRUE" })],
        ["DELETE LIMIT 1", q => (q.limit = Number.NaN)],
        ["UPDATE SET title = 'x'", q => (q.assignments = [{ field: "title", value: { $set: 1 } }])],
        ["UPDATE SET title = 'x'", q => (q.assignments = [{ field: "__proto__.x", value: 1 }])],
        ["UPDATE SET title = 'x'", q => (q.assignments = [{ field: "a.$x", value: 1 }])]
      ];
      for (const [statement, change] of forged) {
        const q: any = parse(statement);
        change(q);
        const run = () => (q.type === "DELETE" ? repo.deleteMany(q) : repo.updateMany(q));
        await assert.rejects(run, WebdaQLError, `${statement} ${change}`);
        if (q.type === "DELETE") {
          // The same forged filter or LIMIT is refused by query() too
          await assert.rejects(() => repo.query({ ...q, type: "SELECT" }), WebdaQLError);
        }
      }
      assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2", "t3"], "nothing was deleted");
      assert.strictEqual(({} as any).x, undefined);
      // A well-formed object works
      assert.strictEqual(await repo.deleteMany(parse("DELETE WHERE priority = 1")), 1);
      assert.strictEqual((await repo.query(parse("priority > 1") as any)).results.length, 2);
    }
  }

  @test
  async limitZeroAffectsNothing() {
    for (const repo of [new MemoryRepository<typeof Task>(Task, ["uuid"]), new FallbackRepository(Task, ["uuid"])]) {
      await this.fill(repo, 3);
      assert.strictEqual(await repo.deleteMany("DELETE LIMIT 0"), 0);
      assert.strictEqual(await repo.deleteMany(PrependCondition("DELETE LIMIT 0", "priority > 0")), 0);
      assert.strictEqual(await repo.updateMany(PrependCondition("UPDATE SET title = 'z' LIMIT 0", "priority > 0")), 0);
      assert.deepStrictEqual(await this.uuids(repo), ["t1", "t2", "t3"]);
      assert.strictEqual((await repo.query("title = 'z'")).results.length, 0);
    }
  }

  @test
  async edgeSetTargetsAreRefused() {
    const repo = new MemoryRepository<typeof Task>(Task, ["uuid"]);
    await this.fill(repo, 1);
    for (const statement of [
      "UPDATE SET profile = 'x', profile.level = 2",
      "UPDATE SET profile.level = 2, profile = 'x'",
      "UPDATE SET title = 'a', title = 'b'",
      "UPDATE SET a..b = 1",
      "UPDATE SET .a = 1",
      "UPDATE SET toString.x = 1",
      "UPDATE SET profile.hasOwnProperty = 1",
      "UPDATE SET valueOf = 1"
    ]) {
      await assert.rejects(() => repo.updateMany(statement), WebdaQLError, statement);
    }
    assert.strictEqual(String(await repo.get("t1")).length > 0, true);
  }

  @test
  async fallbackSkipsObjectsGoneMeanwhile() {
    const repo = new FallbackRepository(Task, ["uuid"]);
    await this.fill(repo, 3);
    // An object deleted between the key collection and its write: like Dynamo / Firestore, patch then throws
    const patch = repo.patch.bind(repo);
    repo.patch = async (key: any, data: any) => {
      if (String(key) === "t2") {
        await repo.delete("t2");
        throw new Error("Not found: t2");
      }
      return patch(key, data);
    };
    assert.strictEqual(await repo.updateMany("UPDATE SET title = 'x'"), 2);
    assert.strictEqual((await repo.query("title = 'x'")).results.length, 2);
    // Any other failure still stops the statement
    repo.patch = async () => {
      throw new Error("backend down");
    };
    await assert.rejects(() => repo.updateMany("UPDATE SET title = 'y'"), /backend down/);
  }

  @test
  async bulkStaysInTheModelHierarchy() {
    const storage = new Map<string, string>();
    const animals = new MemoryRepository<typeof Animal>(Animal, ["uuid"], undefined, storage);
    const dogs = new MemoryRepository<typeof Dog>(Dog, ["uuid"], undefined, storage);
    await animals.create(new Animal({ uuid: "a1", kind: "cat" }));
    await dogs.create(new Dog({ uuid: "d1", kind: "dog" }));
    // The child repository only reaches its own rows
    assert.strictEqual(await dogs.updateMany("UPDATE SET kind = 'x'"), 1);
    assert.strictEqual(((await animals.get("a1")) as any).kind, "cat");
    assert.strictEqual(await dogs.deleteMany("DELETE"), 1);
    assert.ok(storage.has("a1"));
    // The parent reaches its subclasses
    await dogs.create(new Dog({ uuid: "d2", kind: "dog" }));
    assert.strictEqual(await animals.deleteMany("DELETE"), 2);
    assert.strictEqual(storage.size, 0);
  }
}
