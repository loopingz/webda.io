import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { UuidModel } from "../model.model.js";
import type { ModelClass } from "../storable.js";
import { MemoryRepository } from "./memory.js";
import { EventRepository } from "./event.js";
import { checkAggregation } from "./conformance.js";
import { registerRepository, Repositories } from "./hooks.js";

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

/**
 * Schemaless model for the conformance dataset
 */
class Row extends UuidModel {
  /**
   * @param data - initial data
   */
  constructor(data?: any) {
    super(data);
    Object.assign(this, data);
  }
}
Row.registerSerializer();
(Row as any).Metadata = { Identifier: "Test/Row", Subclasses: [] };

@suite
class AggregationConformanceTest {
  @test
  async memory() {
    await checkAggregation(new MemoryRepository(Row, ["uuid"]), { native: true });
  }

  @test
  async fallback() {
    await checkAggregation(new RemoteRepository(Row, ["uuid"]), { native: false });
  }

  @test
  async eventWrapped() {
    await checkAggregation(new EventRepository(Row, ["uuid"], new MemoryRepository(Row, ["uuid"])), {
      native: true
    });
  }
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

@suite
class EventRepositoryAggregationTest {
  @test
  async delegatesBindsAndEmits() {
    const inner = new MemoryRepository(Task, ["uuid"]);
    const repo = new EventRepository(Task, ["uuid"], inner);
    await fill(inner);
    await inner.create({ uuid: "t4", status: "open", points: 1, owner: { uuid: "what?" } } as any);
    const events: [string, any][] = [];
    (repo as any).on("Aggregate", (evt: any) => events.push(["Aggregate", evt]));
    (repo as any).on("Aggregated", (evt: any) => events.push(["Aggregated", evt]));
    const res = await repo.aggregate({ filter: "owner.uuid = ?", metrics: { n: { count: "*" } } }, ["what?"]);
    assert.deepStrictEqual(res, { rows: [{ n: 1 }], native: true }, "bound once, inner stays native");
    assert.deepStrictEqual(
      events.map(([name]) => name),
      ["Aggregate", "Aggregated"]
    );
    assert.strictEqual(events[0][1].query.filter, "owner.uuid = 'what?'");
    assert.strictEqual(events[1][1].native, true);
  }

  @test
  async configurePropagates() {
    const inner = new RemoteRepository(Task, ["uuid"]);
    const repo = new EventRepository(Task, ["uuid"], inner);
    repo.configureAggregation({ fallback: "deny" });
    await assert.rejects(() => repo.aggregate({ metrics: { n: { count: "*" } } }), /runs in memory/);
  }

  @test
  async eventRepositoryRowsAreTyped() {
    const repo = new EventRepository(Task, ["uuid"], new MemoryRepository(Task, ["uuid"]));
    const res = await repo.aggregate({ groupBy: ["status"], metrics: { total: { sum: "points" } } });
    const total: number = res.rows[0]?.total ?? 0;
    assert.strictEqual(total, 0);
    // @ts-expect-error sum needs a numeric path
    void (() => repo.aggregate({ metrics: { bad: { sum: "status" } } }));
  }
}

@suite
class ModelAggregateTest {
  @test
  async staticAggregate() {
    const repo = new MemoryRepository(Task, ["uuid"]);
    registerRepository(Task, repo);
    try {
      assert.strictEqual(typeof Task.aggregate, "function");
      await fill(repo);
      const res = await Task.aggregate(
        { filter: "points > ?", groupBy: ["status"], metrics: { total: { sum: "points" } } },
        [2]
      );
      assert.deepStrictEqual(res, { rows: [{ status: "open", total: 8 }], native: true });
      const total: number = res.rows[0].total;
      assert.strictEqual(total, 8);
      // @ts-expect-error sum needs a numeric path
      void (() => Task.aggregate({ metrics: { bad: { sum: "status" } } }));
    } finally {
      Repositories.delete(Task);
    }
  }
}
