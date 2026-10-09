import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { UuidModel } from "../model.model.js";
import type { ModelClass } from "../storable.js";
import { MemoryRepository } from "./memory.js";

/**
 * Model with typed attributes for aggregation tests (same fixture style as memory-classfilter.spec.ts)
 */
class Task extends UuidModel {
  status: "open" | "done";
  points: number;
  owner: { uuid: string };
  /**
   * @param data - initial data
   */
  constructor(data?: Partial<Task>) {
    super(data);
    Object.assign(this, data);
  }
}
Task.registerSerializer();
(Task as any).Metadata = { Identifier: "Test/Task", Subclasses: [] };

/**
 * A MemoryRepository subclass stands in for a remote backend without native aggregation
 */
class RemoteRepository<T extends ModelClass> extends MemoryRepository<T> {}

/**
 * Fill a repository
 * @param repo - the repository
 */
async function fill(repo: MemoryRepository<any>): Promise<void> {
  await repo.create({ uuid: "t1", status: "open", points: 3, owner: { uuid: "u1" } } as any);
  await repo.create({ uuid: "t2", status: "open", points: 5, owner: { uuid: "u2" } } as any);
  await repo.create({ uuid: "t3", status: "done", points: 2, owner: { uuid: "u1" } } as any);
}

@suite
class RepositoryAggregationTest {
  @test
  async memoryIsNative() {
    const repo = new MemoryRepository(Task, ["uuid"]);
    await fill(repo);
    const res = await repo.aggregate(
      {
        filter: "points > ?",
        groupBy: ["status"],
        metrics: { n: { count: "*" }, total: { sum: "points" } },
        orderBy: [{ key: "status", direction: "ASC" }]
      },
      [2]
    );
    assert.strictEqual(res.native, true);
    assert.deepStrictEqual(res.rows, [{ status: "open", n: 2, total: 8 }]);
    // Compile-time row typing
    const total: number = res.rows[0].total;
    const status: "open" | "done" | null = res.rows[0].status;
    assert.ok(total !== undefined && status !== undefined);
  }

  @test
  async fallbackWarnsOncePerShape() {
    const repo = new RemoteRepository(Task, ["uuid"]);
    await fill(repo);
    const warnings: string[] = [];
    repo.configureAggregation({ warn: message => warnings.push(message) });
    const spec = { groupBy: ["owner.uuid"], metrics: { n: { count: "*" } } } as const;
    const res = await repo.aggregate(spec);
    await repo.aggregate(spec);
    assert.strictEqual(res.native, false);
    assert.strictEqual(res.rows.length, 2);
    assert.strictEqual(warnings.length, 1, "warn only once per shape");
    assert.match(warnings[0], /Test\/Task/);
    assert.match(warnings[0], /owner\.uuid/);
  }

  @test
  async fallbackAllow() {
    const repo = new RemoteRepository(Task, ["uuid"]);
    const warnings: string[] = [];
    repo.configureAggregation({ fallback: "allow", warn: message => warnings.push(message) });
    assert.strictEqual((await repo.aggregate({ metrics: { n: { count: "*" } } })).native, false);
    assert.strictEqual(warnings.length, 0);
  }

  @test
  async fallbackDeny() {
    const repo = new RemoteRepository(Task, ["uuid"]);
    repo.configureAggregation({ fallback: "deny" });
    await assert.rejects(
      () => repo.aggregate({ metrics: { n: { count: "*" } } }),
      (err: any) => err.code === "AGGREGATION_NOT_NATIVE"
    );
  }

  @test
  async maxGroups() {
    const repo = new MemoryRepository(Task, ["uuid"]);
    await fill(repo);
    repo.configureAggregation({ maxGroups: 1 });
    await assert.rejects(
      () => repo.aggregate({ groupBy: ["status"], metrics: { n: { count: "*" } } }),
      (err: any) => err.code === "AGGREGATION_TOO_MANY_GROUPS"
    );
  }

  @test
  typing() {
    const repo = new MemoryRepository(Task, ["uuid"]);
    // @ts-expect-error sum needs a numeric path
    void (() => repo.aggregate({ metrics: { s: { sum: "status" } } }));
    // @ts-expect-error unknown path
    void (() => repo.aggregate({ groupBy: ["nope"], metrics: { n: { count: "*" } } }));
    // @ts-expect-error order key must be a group path or an alias
    void (() => repo.aggregate({ metrics: { n: { count: "*" } }, orderBy: [{ key: "x", direction: "ASC" }] }));
  }
}
