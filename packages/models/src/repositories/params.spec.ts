import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { UuidModel } from "../model.model.js";
import { ModelRelated } from "../relations.js";
import { EventRepository } from "./event.js";
import { registerRepository } from "./hooks.js";
import { MemoryRepository } from "./memory.js";

class Task extends UuidModel {
  title: string = "";
  owner?: string;
  priority: number = 0;

  constructor(data?: Partial<Task>) {
    super(data);
    Object.assign(this, data);
  }
}
Task.registerSerializer();

@suite
class QueryParametersTest {
  repo!: MemoryRepository<typeof Task>;

  /**
   * Register a fresh repository with a few tasks
   */
  async beforeEach() {
    this.repo = new MemoryRepository<typeof Task>(Task, ["uuid"]);
    registerRepository(Task, this.repo);
    await this.repo.create(new Task({ uuid: "t1", title: "first", owner: "alice", priority: 1 }));
    await this.repo.create(new Task({ uuid: "t2", title: "it's second", owner: "bob", priority: 2 }));
    await this.repo.create(new Task({ uuid: "t3", title: "third", priority: 3 }));
  }

  /**
   * @param results - query results
   * @returns the sorted uuids
   */
  uuids(results: Task[]): string[] {
    return results.map(r => r.uuid).sort();
  }

  @test
  async modelQueryWithParameters() {
    assert.deepStrictEqual(this.uuids((await Task.query("owner = ?", ["alice"])).results), ["t1"]);
    assert.deepStrictEqual(
      this.uuids((await Task.query("priority >= :min AND title != :t", { min: 2, t: "third" })).results),
      ["t2"]
    );
    assert.deepStrictEqual(this.uuids((await Task.query("title = ?", ["it's second"])).results), ["t2"]);
    assert.deepStrictEqual(this.uuids((await Task.query("owner = ?", [null])).results), ["t3"]);
    assert.deepStrictEqual(this.uuids((await Task.query("owner IN ?", [["alice", "bob"]])).results), ["t1", "t2"]);
    // Injection attempts stay a value
    assert.deepStrictEqual((await Task.query("owner = ?", ["' OR TRUE OR owner = '"])).results, []);
  }

  @test
  async modelIterateWithParameters() {
    const found: string[] = [];
    for await (const task of Task.iterate("priority > ?", [1])) {
      found.push(task.uuid);
    }
    assert.deepStrictEqual(found.sort(), ["t2", "t3"]);
  }

  @test
  async repositoryQueryWithParameters() {
    assert.deepStrictEqual(this.uuids((await this.repo.query("owner = :o", { o: "bob" })).results), ["t2"]);
    const events = new EventRepository(Task, ["uuid"], this.repo);
    const seen: string[] = [];
    events.on("Query", (evt: any) => seen.push(evt.query));
    assert.deepStrictEqual(this.uuids((await events.query("owner = ?", ["alice"])).results), ["t1"]);
    assert.deepStrictEqual(seen, ["owner = 'alice'"], "the event carries the bound query");
    const found: string[] = [];
    for await (const task of events.iterate("owner != ?", [null])) {
      found.push(task.uuid);
    }
    assert.deepStrictEqual(found.sort(), ["t1", "t2"]);
  }

  @test
  async relationQueryWithParameters() {
    const owner = new Task({ uuid: "alice", title: "owner" });
    const related = new ModelRelated<Task, Task, any>(Task, owner, "owner");
    assert.deepStrictEqual(this.uuids((await related.query("priority = ?", [1])).results), ["t1"]);
    assert.deepStrictEqual(this.uuids((await related.query("priority = ?", [2])).results), []);
    const found: string[] = [];
    for await (const task of related.iterate("title = :t", { t: "first" })) {
      found.push(task.uuid);
    }
    assert.deepStrictEqual(found, ["t1"]);
  }

  @test
  async unboundOrInvalidParameters() {
    await assert.rejects(() => Task.query("owner = ?"), /Unbound parameter/);
    await assert.rejects(() => Task.query("owner = ?", []), /positional parameter/);
    await assert.rejects(() => Task.query("? = 1", ["owner"]), SyntaxError);
  }
}
