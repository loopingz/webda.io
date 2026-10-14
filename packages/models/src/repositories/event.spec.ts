import { EventRepository } from "./event";
import { StorableClass } from "../storable";
import { Repository, WEBDA_TEST } from "./repository";
import { RepositoryTest } from "./repository.spec";
import { MemoryRepository } from "./memory";
import type { QueryExecutionInfo } from "./monitoring";
import { afterAll, suite, test } from "@webda/test";
import * as assert from "assert";
import { SubClassModel, TestModel } from "../model.spec";
import { FilterAttributes } from "@webda/tsc-esm";
import { registerRepository } from "./hooks";

@suite
class EventRepositoryTest extends RepositoryTest {
  events: Record<string, number> = {};
  expectations: Record<string, number> = {};
  testExpectations: Record<string, Record<string, number>> = {
    testModelCRUD: {
      Create: 1,
      Created: 1,
      Delete: 1,
      Deleted: 1,
      PartialUpdate: 11,
      PartialUpdated: 9,
      Patch: 4,
      Patched: 4,
      Update: 1,
      Updated: 1
    },
    testModelWithCompositeId: {
      Create: 2,
      Created: 1
    },
    upsert: {
      Create: 4,
      Created: 4
    },
    query: {
      Queried: 18,
      Query: 18
    },
    queryWithNow: {
      Create: 3,
      Created: 3,
      Queried: 2,
      Query: 2
    },
    iterate: {},
    uuidModel: {},
    createWithoutPrimaryKey: {
      Create: 3,
      Created: 3
    }
  };

  getRepository<T extends StorableClass>(model: T, keys: string[]): Repository<T> {
    const repo = new EventRepository(model, keys, new MemoryRepository(model, keys));
    [
      "Create",
      "Update",
      "Delete",
      "PartialUpdate",
      "Created",
      "Updated",
      "Deleted",
      "PartialUpdated",
      "Query",
      "Queried",
      "Patch",
      "Patched"
    ].forEach(event => {
      repo.on(event, () => {
        this.events[event] ??= 0;
        this.events[event]++;
      });
    });
    return repo as Repository<T>;
  }

  /**
   * Override to avoid clearing the listeners
   */
  async beforeEach(testMethod: keyof EventRepositoryTest) {
    // We clear the repositories except QueryDocument
    await (SubClassModel.getRepository() as EventRepository)[WEBDA_TEST]?.clear(true);
    await (TestModel.getRepository() as EventRepository)[WEBDA_TEST]?.clear(true);
    const origin = this[testMethod] as () => Promise<void>;
    // @ts-ignore
    this[testMethod] = async () => {
      this.events = {};
      await origin();
      assert.deepStrictEqual(this.events, this.testExpectations[testMethod], "Events does not match expectations");
    };
  }
}

@suite
class EventClearTest {
  @test
  async clearWithoutExcludeListeners() {
    // Test WEBDA_TEST.clear() without excludeListeners (covers event.ts lines 280-281)
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);

    let count = 0;
    eventRepo.on("Created", () => count++);

    // Verify listener works
    await eventRepo.create({ uuid: "test1", name: "test", age: 1, collection: [] } as any);
    assert.strictEqual(count, 1);

    // Clear without excludeListeners (events.clear() path)
    await eventRepo[WEBDA_TEST].clear();

    // Listener should be gone
    await eventRepo.create({ uuid: "test2", name: "test2", age: 2, collection: [] } as any);
    assert.strictEqual(count, 1); // unchanged - listener was removed
  }

  @test
  async createEventsUseGeneratedPrimaryKey() {
    const repo = new EventRepository(SubClassModel, ["uuid"], new MemoryRepository(SubClassModel, ["uuid"]));
    const ids: Record<string, any> = {};
    repo.on("Create" as any, (evt: any) => (ids.Create = evt.object_id));
    repo.on("Created" as any, (evt: any) => (ids.Created = evt.object_id));
    const item = await repo.create({ name: "n", age: 1, collection: [] } as any);
    assert.ok(item.uuid);
    assert.strictEqual(ids.Create, item.uuid);
    assert.strictEqual(ids.Created, item.uuid);
    assert.strictEqual((await repo.get(item.uuid)).name, "n");
  }

  @test
  async eventEmitterCompatibilityShim() {
    // Consumers like @webda/runtime EventIterator treat a repository as a Node
    // EventEmitter: getMaxListeners/setMaxListeners + removeListener must exist.
    const repo = new EventRepository(SubClassModel, ["uuid"], new MemoryRepository(SubClassModel, ["uuid"]));
    assert.strictEqual(typeof repo.getMaxListeners(), "number");
    repo.setMaxListeners(repo.getMaxListeners() + 5);
    assert.strictEqual(repo.getMaxListeners(), 105);

    let count = 0;
    const listener = () => count++;
    repo.on("Created" as any, listener);
    await repo.create({ uuid: "rm1", name: "n", age: 1, collection: [] } as any);
    assert.strictEqual(count, 1);
    // removeListener is the EventEmitter alias for off()
    repo.removeListener("Created" as any, listener);
    await repo.create({ uuid: "rm2", name: "n", age: 1, collection: [] } as any);
    assert.strictEqual(count, 1);
  }
}

@suite
class EventRepositoryMonitoringTest {
  @test
  async onQueryCalledOncePerQueryWithDetails() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    await eventRepo.create({ uuid: "u1", name: "Alice", age: 30, collection: [] } as any);
    await eventRepo.create({ uuid: "u2", name: "Bob", age: 25, collection: [] } as any);

    const reports: QueryExecutionInfo[] = [];
    eventRepo.configureMonitoring({
      onQuery: info => reports.push(info)
    });

    const res = await eventRepo.query("age > :min LIMIT 1", { min: 20 });
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].operation, "query");
    assert.strictEqual(reports[0].model, "SubClassModel");
    assert.strictEqual(reports[0].query, "age > 20 LIMIT 1");
    assert.strictEqual(reports[0].count, 1);
    assert.strictEqual(reports[0].paginated, true);
    assert.strictEqual(typeof reports[0].duration, "number");
    assert.strictEqual(reports[0].error, undefined);
  }

  @test
  async onQueryReportsErrorAndRethrows() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    (memRepo as any).query = async () => {
      throw new Error("backend timeout");
    };

    const reports: QueryExecutionInfo[] = [];
    eventRepo.configureMonitoring({
      onQuery: info => reports.push(info)
    });

    await assert.rejects(
      async () => eventRepo.query("name = 'test'"),
      /backend timeout/
    );
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].operation, "query");
    assert.strictEqual(reports[0].error?.message, "backend timeout");
    assert.strictEqual(typeof reports[0].duration, "number");
  }

  @test
  async onQueryThrowingDoesNotBreakQuery() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    await eventRepo.create({ uuid: "u1", name: "Alice", age: 30, collection: [] } as any);

    eventRepo.configureMonitoring({
      onQuery: () => {
        throw new Error("monitor exploded");
      }
    });

    const res = await eventRepo.query("name = 'Alice'");
    assert.strictEqual(res.results.length, 1);
  }

  @test
  async iterateReportsOnceExcludingConsumerTime() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    await eventRepo.create({ uuid: "u1", name: "Alice", age: 30, collection: [] } as any);
    await eventRepo.create({ uuid: "u2", name: "Bob", age: 25, collection: [] } as any);

    const reports: QueryExecutionInfo[] = [];
    eventRepo.configureMonitoring({
      onQuery: info => reports.push(info)
    });

    let items = 0;
    for await (const _ of eventRepo.iterate("age > 10")) {
      items++;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.strictEqual(items, 2);
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].operation, "iterate");
    assert.strictEqual(reports[0].count, 2);
    assert.strictEqual(reports[0].error, undefined);
    // 2 items * 50ms = 100ms consumer time. Reported duration should be much less than 40ms.
    assert.ok(reports[0].duration < 40, `Reported duration ${reports[0].duration}ms should be < 40ms`);
  }

  @test
  async iterateReportsErrorWhenInnerThrows() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    (memRepo as any).iterate = async function* failIterate() {
      throw new Error("stream failed");
    };

    const reports: QueryExecutionInfo[] = [];
    eventRepo.configureMonitoring({
      onQuery: info => reports.push(info)
    });

    await assert.rejects(async () => {
      for await (const _ of eventRepo.iterate("")) {}
    }, /stream failed/);

    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].operation, "iterate");
    assert.strictEqual(reports[0].error?.message, "stream failed");
  }

  @test
  async innerRepositoryIsNotConfigured() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);

    eventRepo.configureMonitoring({
      onQuery: () => {}
    });

    assert.strictEqual((memRepo as any).monitorOptions.onQuery, undefined);
  }

  @test
  async monitorsAggregateAndBulkOperations() {
    const memRepo = new MemoryRepository(SubClassModel, ["uuid"]);
    const eventRepo = new EventRepository(SubClassModel, ["uuid"], memRepo);
    await eventRepo.create({ uuid: "u1", name: "Alice", age: 30, collection: [] } as any);

    const reports: QueryExecutionInfo[] = [];
    eventRepo.configureMonitoring({
      onQuery: info => reports.push(info)
    });

    // aggregate
    await eventRepo.aggregate({
      groupBy: ["name"],
      metrics: { total: { count: "*" } }
    });
    assert.strictEqual(reports.length, 1);
    assert.strictEqual(reports[0].operation, "aggregate");
    assert.strictEqual(reports[0].count, 1);

    // updateMany
    await eventRepo.updateMany("UPDATE SET age = 31 WHERE name = :name", { name: "Alice" });
    assert.strictEqual(reports.length, 2);
    assert.strictEqual(reports[1].operation, "updateMany");
    assert.strictEqual(reports[1].count, 1);

    // deleteMany
    await eventRepo.deleteMany("DELETE WHERE age = :age", { age: 31 });
    assert.strictEqual(reports.length, 3);
    assert.strictEqual(reports[2].operation, "deleteMany");
    assert.strictEqual(reports[2].count, 1);
  }
}
