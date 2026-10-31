import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { UuidModel } from "../model.model.js";
import type { ModelClass } from "../storable.js";
import { MemoryRepository } from "./memory.js";
import { EventRepository } from "./event.js";
import { checkCount, checkCountClassFilter } from "./conformance.js";
import { registerRepository, Repositories } from "./hooks.js";
import type { QueryExecutionInfo } from "./monitoring.js";

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
(Row as any).Metadata = { Identifier: "Test/CountRow", Subclasses: [] };

/**
 * Parent and child sharing one storage
 */
class Animal extends Row {}
Animal.registerSerializer();
class Dog extends Animal {}
Dog.registerSerializer();
(Animal as any).Metadata = { Identifier: "Test/CountAnimal", Subclasses: [Dog] };
(Dog as any).Metadata = { Identifier: "Test/CountDog", Subclasses: [] };

/**
 * A MemoryRepository subclass stands in for a remote backend without a native count
 */
class RemoteRepository<T extends ModelClass> extends MemoryRepository<T> {
  /** Objects read by iterate() */
  read = 0;

  /** @override */
  async *iterate(query: string, params?: any): AsyncGenerator<InstanceType<T>, any, any> {
    for await (const item of super.iterate(query, params)) {
      this.read++;
      yield item;
    }
  }
}

/**
 * @param repo - the repository
 * @param n - number of rows to create
 */
async function fill(repo: MemoryRepository<any>, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await repo.create({ uuid: `r${String(i).padStart(4, "0")}`, even: i % 2 === 0 } as any);
  }
}

@suite
class CountConformanceTest {
  @test
  async memory() {
    await checkCount(new MemoryRepository(Row, ["uuid"]), { native: true });
  }

  @test
  async fallback() {
    await checkCount(new RemoteRepository(Row, ["uuid"]), { native: false });
  }

  @test
  async eventWrapped() {
    await checkCount(new EventRepository(Row, ["uuid"], new MemoryRepository(Row, ["uuid"])), { native: true });
  }

  @test
  async classFilter() {
    const storage = new Map<string, string>();
    await checkCountClassFilter(
      new MemoryRepository(Animal, ["uuid"], undefined, storage),
      new MemoryRepository(Dog, ["uuid"], undefined, storage),
      async (repo, uuid) => void (await repo.create({ uuid } as any))
    );
  }
}

@suite
class RepositoryCountTest {
  @test
  async fallbackStopsAfterMax() {
    const repo = new RemoteRepository(Row, ["uuid"]);
    await fill(repo, 250);
    repo.configureAggregation({ fallback: "allow" });
    repo.read = 0;
    assert.deepStrictEqual(await repo.count("", undefined, { max: 10 }), { value: 10, relation: "gte", native: false });
    assert.strictEqual(repo.read, 11, "the scan stops at max + 1");
    repo.read = 0;
    assert.deepStrictEqual(await repo.count("even = TRUE"), { value: 125, relation: "eq", native: false });
    assert.strictEqual(repo.read, 125, "an exact count reads every matching row");
  }

  @test
  async fallbackWarnsOnce() {
    const repo = new RemoteRepository(Row, ["uuid"]);
    await fill(repo, 3);
    const warnings: string[] = [];
    repo.configureAggregation({ warn: message => warnings.push(message) });
    assert.strictEqual((await repo.count()).native, false);
    await repo.count("even = TRUE");
    await repo.count("", undefined, { max: 1 });
    assert.strictEqual(warnings.length, 1, "warn only once");
    assert.match(warnings[0], /Count on Test\/CountRow runs in memory: the backend has no native count/);
    assert.doesNotMatch(warnings[0], /grouped by/);
  }

  @test
  async fallbackAllow() {
    const repo = new RemoteRepository(Row, ["uuid"]);
    const warnings: string[] = [];
    repo.configureAggregation({ fallback: "allow", warn: message => warnings.push(message) });
    assert.deepStrictEqual(await repo.count(), { value: 0, relation: "eq", native: false });
    assert.strictEqual(warnings.length, 0);
  }

  @test
  async fallbackDeny() {
    const repo = new RemoteRepository(Row, ["uuid"]);
    await fill(repo, 3);
    repo.configureAggregation({ fallback: "deny" });
    repo.read = 0;
    await assert.rejects(
      () => repo.count(),
      (err: any) => err.code === "AGGREGATION_NOT_NATIVE" && /Count on Test\/CountRow/.test(err.message)
    );
    assert.strictEqual(repo.read, 0, "nothing is scanned");
  }

  @test
  async memoryIsNativeAndStopsAfterMax() {
    const repo = new MemoryRepository(Row, ["uuid"]);
    await fill(repo, 250);
    // deny does not apply: a plain MemoryRepository counts its own data
    repo.configureAggregation({ fallback: "deny" });
    assert.deepStrictEqual(await repo.count("", undefined, { max: 100 }), {
      value: 100,
      relation: "gte",
      native: true
    });
    assert.deepStrictEqual(await repo.count("even = ?", [false]), { value: 125, relation: "eq", native: true });
  }
}

@suite
class EventRepositoryCountTest {
  @test
  async delegatesBindsAndMonitors() {
    const inner = new MemoryRepository(Row, ["uuid"]);
    const repo = new EventRepository(Row, ["uuid"], inner);
    await fill(inner, 5);
    const infos: QueryExecutionInfo[] = [];
    repo.configureMonitoring({ onQuery: info => infos.push(info) });
    const res = await repo.count("even = ?", [true], { max: 2 });
    assert.deepStrictEqual(res, { value: 2, relation: "gte", native: true });
    assert.strictEqual(infos.length, 1);
    assert.strictEqual(infos[0].operation, "count");
    assert.strictEqual(infos[0].query, "even = TRUE");
    assert.strictEqual(infos[0].count, 2);
  }

  @test
  async configurePropagates() {
    const repo = new EventRepository(Row, ["uuid"], new RemoteRepository(Row, ["uuid"]));
    repo.configureAggregation({ fallback: "deny" });
    await assert.rejects(() => repo.count(), /runs in memory/);
  }
}

@suite
class ModelCountTest {
  @test
  async staticCount() {
    const repo = new MemoryRepository(Row, ["uuid"]);
    registerRepository(Row, repo);
    try {
      await fill(repo, 4);
      assert.deepStrictEqual(await Row.count(), { value: 4, relation: "eq", native: true });
      assert.deepStrictEqual(await Row.count("even = ?", [true], { max: 1 }), {
        value: 1,
        relation: "gte",
        native: true
      });
    } finally {
      Repositories.delete(Row);
    }
  }
}
