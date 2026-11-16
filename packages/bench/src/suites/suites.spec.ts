import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { MemoryQueue, MemoryStore, PubSubService } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { CancelablePromise } from "@webda/utils";
import { resolveProfile } from "../profile.js";
import type { BenchResult } from "../result.js";
import { benchPubSub } from "./pubsub.js";
import { benchQueue, stopConsumer } from "./queue.js";
import { benchStore } from "./store.js";
import { useServiceType } from "./fixtures.js";

/**
 * Seconds an empty receive blocks: stopping a consumer waits for its pending receive,
 * so a one second timeout adds a second to every consumer scenario
 */
const RECEIVE_TIMEOUT = 0.05;

/**
 * In-process broadcast pub/sub: every subscriber of the bus receives every message
 */
class LocalPubSub extends PubSubService {
  static bus = new EventEmitter().setMaxListeners(100);

  async sendMessage(event: any): Promise<void> {
    const data = JSON.stringify(event);
    setImmediate(() => LocalPubSub.bus.emit("message", data));
  }

  async size(): Promise<number> {
    return 0;
  }

  consume(callback: (event: any) => Promise<void>, proto?: any, onBind?: () => void): CancelablePromise {
    const listener = (data: string) => {
      callback(this.unserialize(data, proto)).catch(() => {});
    };
    LocalPubSub.bus.on("message", listener);
    setImmediate(() => onBind?.());
    return new CancelablePromise(undefined, async () => {
      LocalPubSub.bus.off("message", listener);
    });
  }
}

/**
 * Assert every expected scenario ran and none is unstable
 *
 * @param results - the results
 * @param scenarios - expected scenario names
 */
function assertResults(results: BenchResult[], scenarios: string[]) {
  const names = new Set(results.map(r => r.scenario));
  for (const scenario of scenarios) {
    assert.ok(names.has(scenario), `scenario ${scenario} should run, got ${[...names].join(", ")}`);
  }
  const unstable = results.filter(r => r.unstable);
  assert.deepStrictEqual(
    unstable.map(r => `${r.scenario} ${JSON.stringify(r.params)}: ${[...r.failures, ...r.notes].join("; ")}`),
    []
  );
  for (const result of results) {
    assert.ok(result.ops > 0, `${result.scenario} ${JSON.stringify(result.params)} should run operations`);
    assert.ok(result.throughput > 0, `${result.scenario} should have a throughput`);
  }
}

@suite
class BenchSuitesTest extends WebdaApplicationTest {
  profile = resolveProfile("smoke");

  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  async store() {
    const results = await benchStore(
      {
        backend: "MemoryStore",
        createStore: (name, models) => this.addService(MemoryStore, { models } as any, name)
      },
      { profile: this.profile, reporters: [], filter: () => true, storeName: "SpecBenchStore" }
    );
    assertResults(results, [
      "store.get",
      "store.exists",
      "store.update",
      "store.patch",
      "store.setAttribute",
      "store.incrementAttribute",
      "store.upsert",
      "store.query.eq",
      "store.query.range",
      "store.query.in",
      "store.query.orderBy",
      "store.create",
      "store.delete",
      "store.contention.increment",
      "store.query.paginate",
      "store.iterate",
      "store.updateMany",
      "store.deleteMany"
    ]);
    // One result per concurrency level for the key scenarios
    assert.strictEqual(results.filter(r => r.scenario === "store.get").length, this.profile.concurrency.length);
    const contention = results.find(r => r.scenario === "store.contention.increment");
    assert.strictEqual(contention.checks.finalCounter, contention.checks.expectedCounter);
    const scan = results.find(r => r.scenario === "store.query.paginate");
    assert.strictEqual(scan.checks.scanned, scan.checks.expected);
    assert.ok((scan.checks.scanned as number) >= this.profile.dataset);
    // Store metrics are captured
    assert.ok(results.find(r => r.scenario === "store.get").serviceMetrics !== undefined);
  }

  @test
  async storeCapabilities() {
    const results = await benchStore(
      {
        backend: "MemoryStore",
        createStore: (name, models) => this.addService(MemoryStore, { models } as any, name),
        capabilities: { orderBy: false, bulk: false, atomic: false },
        clean: async () => {}
      },
      {
        profile: { ...this.profile, concurrency: [2] },
        reporters: [],
        filter: () => true,
        storeName: "SpecBenchStoreCaps"
      }
    );
    const names = new Set(results.map(r => r.scenario));
    for (const skipped of [
      "store.query.orderBy",
      "store.updateMany",
      "store.deleteMany",
      "store.setAttribute",
      "store.incrementAttribute",
      "store.contention.increment"
    ]) {
      assert.ok(!names.has(skipped), `${skipped} should be skipped`);
    }
    assert.ok(names.has("store.get"));
  }

  @test
  async queue() {
    const results = await benchQueue(
      {
        backend: "MemoryQueue",
        createQueue: name => this.addService(MemoryQueue, { expire: 1, timeout: RECEIVE_TIMEOUT } as any, name),
        redeliveryDelayMs: 1000
      },
      { profile: this.profile, reporters: [], filter: () => true, queueName: "SpecBenchQueue" }
    );
    assertResults(results, ["queue.send", "queue.drain.raw", "queue.consume", "queue.e2e.latency", "queue.redelivery"]);
    assert.strictEqual(
      results.filter(r => r.scenario === "queue.consume").length,
      this.profile.queueMaxConsumers.length * 2
    );
    for (const result of results.filter(r => r.scenario === "queue.consume" || r.scenario === "queue.drain.raw")) {
      assert.strictEqual(result.checks.received, this.profile.messages);
      assert.strictEqual(result.checks.lost, 0);
    }
    const redelivery = results.find(r => r.scenario === "queue.redelivery");
    assert.ok((redelivery.checks.redelivered as number) > 0);
    assert.ok(redelivery.latency.p50 >= 900, "redelivery happens after the expire delay");
  }

  @test
  async queueWithoutRawReceive() {
    const results = await benchQueue(
      {
        backend: "MemoryQueue",
        createQueue: name => this.addService(MemoryQueue, { expire: 1, timeout: RECEIVE_TIMEOUT } as any, name),
        purge: async q => (q as any).__clean(),
        rawReceive: false,
        inconsistentSize: true
      },
      {
        profile: { ...this.profile, queueMaxConsumers: [2], rates: [100], consumeWorkMs: 1 },
        reporters: [],
        filter: () => true,
        queueName: "SpecBenchQueueNoRaw"
      }
    );
    const names = new Set(results.map(r => r.scenario));
    assert.ok(!names.has("queue.drain.raw"), "raw drain is skipped");
    assert.ok(!names.has("queue.redelivery"), "redelivery needs redeliveryDelayMs");
    assert.ok(names.has("queue.consume"));
    // inconsistentSize skips the size checks
    assert.ok(results.every(r => r.checks.sizeAfter === undefined));
  }

  @test
  async pubsub() {
    const results = await benchPubSub(
      {
        backend: "LocalPubSub",
        createPubSub: name => this.addService(LocalPubSub as any, {}, name) as any,
        maxPayloadBytes: 1000,
        maxSubscribers: 1
      },
      { profile: this.profile, reporters: [], filter: () => true }
    );
    assertResults(results, [
      "pubsub.publish",
      "pubsub.e2e.latency",
      "pubsub.e2e.throughput",
      "pubsub.fanout",
      "pubsub.payload"
    ]);
    // maxSubscribers and maxPayloadBytes skip the bigger variants
    assert.deepStrictEqual(
      results.filter(r => r.scenario === "pubsub.fanout").map(r => r.params.subscribers),
      [1]
    );
    assert.deepStrictEqual(
      results.filter(r => r.scenario === "pubsub.payload").map(r => r.params.payloadBytes),
      [100]
    );
    const fanout = results.find(r => r.scenario === "pubsub.fanout");
    assert.strictEqual(fanout.checks.lost, 0);
    assert.strictEqual(fanout.checks.outOfOrder, 0);
  }

  @test
  serviceType() {
    assert.strictEqual(useServiceType("Webda/MemoryStore"), MemoryStore);
    assert.throws(() => useServiceType("Webda/Unknown"), /Undefined modda Webda\/Unknown/);
  }

  @test
  async pubsubFanout() {
    const results = await benchPubSub(
      {
        backend: "LocalPubSub",
        createPubSub: name => this.addService(LocalPubSub as any, {}, name) as any
      },
      { profile: this.profile, reporters: [], filter: name => name === "pubsub.fanout", namePrefix: "Fanout" }
    );
    assert.deepStrictEqual(
      results.map(r => [r.params.subscribers, r.checks.delivered, r.checks.expected]),
      this.profile.fanout.map(k => {
        const messages = Math.max(10, Math.floor(this.profile.messages / k));
        return [k, messages * k, messages * k];
      })
    );
  }

  @test
  async edgeCases() {
    await stopConsumer(undefined, 10);

    const fastProfile = {
      ...this.profile,
      warmupOps: 0,
      ops: 2,
      queryOps: 1,
      scanOps: 1,
      concurrency: [1],
      dataset: 2,
      messages: 2,
      rates: [100],
      openLoopDurationMs: 20,
      queueMaxConsumers: [1],
      redelivery: false,
      drainTimeoutMs: 15,
      payloadSizes: [100]
    };

    // Store failure checks: get -> undefined, exists -> true, query -> empty, deleteMany -> 0
    const storeResults = await benchStore(
      {
        backend: "BrokenStore",
        createStore: async (name, models) => {
          const store = await this.addService(MemoryStore, { models } as any, name);
          const origGetRepository = store.getRepository.bind(store);
          store.getRepository = (model: any) => {
            const repo = origGetRepository(model);
            repo.get = async () => undefined;
            repo.exists = async () => true;
            repo.query = async () => ({ results: [], continuationToken: undefined });
            repo.deleteMany = async () => 0;
            return repo;
          };
          return store;
        }
      },
      {
        profile: fastProfile,
        reporters: [],
        filter: name => ["store.get", "store.exists", "store.query.eq", "store.deleteMany"].includes(name),
        storeName: "SpecBrokenStore"
      }
    );
    assert.ok(storeResults.find(r => r.scenario === "store.get").errors > 0);
    assert.ok(storeResults.find(r => r.scenario === "store.exists").errors > 0);
    assert.ok(storeResults.find(r => r.scenario === "store.query.eq").errors > 0);
    assert.ok(storeResults.find(r => r.scenario === "store.deleteMany").failures.length > 0);

    // Queue duplicate deliveries in drain.raw, consume, and e2e.latency
    const queueResults = await benchQueue(
      {
        backend: "DupQueue",
        createQueue: async name => {
          const q = await this.addService(MemoryQueue, { expire: 1, timeout: RECEIVE_TIMEOUT } as any, name);
          const origReceive = q.receiveMessage.bind(q);
          q.receiveMessage = async (proto?: any) => {
            const items = await origReceive(proto);
            return [...items, ...items];
          };
          return q;
        },
        inconsistentSize: true
      },
      {
        profile: fastProfile,
        reporters: [],
        filter: name => ["queue.drain.raw", "queue.consume", "queue.e2e.latency"].includes(name),
        queueName: "SpecDupQueue"
      }
    );
    assert.ok((queueResults.find(r => r.scenario === "queue.drain.raw").checks.duplicated as number) > 0);
    assert.ok((queueResults.find(r => r.scenario === "queue.consume").checks.duplicated as number) > 0);
    assert.ok((queueResults.find(r => r.scenario === "queue.e2e.latency").checks.duplicated as number) > 0);

    // PubSub duplicate deliveries, unbound subscription timeout, and payload delivery timeout
    class EdgePubSub extends LocalPubSub {
      dropMessages = false;
      override async sendMessage(event: any): Promise<void> {
        if (this.dropMessages) return;
        const data = JSON.stringify(event);
        setImmediate(() => {
          LocalPubSub.bus.emit("message", data);
          LocalPubSub.bus.emit("message", data);
        });
      }
      override consume(callback: (event: any) => Promise<void>, proto?: any): CancelablePromise {
        return super.consume(callback, proto, undefined);
      }
    }
    let publisherInstance: EdgePubSub | undefined;
    const pubsubResults = await benchPubSub(
      {
        backend: "EdgePubSub",
        createPubSub: async name => {
          const svc = (await this.addService(EdgePubSub as any, {}, name)) as unknown as EdgePubSub;
          if (name.endsWith("Publisher")) publisherInstance = svc;
          return svc;
        }
      },
      {
        profile: { ...fastProfile, ops: 1, drainTimeoutMs: 5 },
        reporters: [],
        filter: name => {
          if (name === "pubsub.payload" && publisherInstance) {
            publisherInstance.dropMessages = true;
          }
          return ["pubsub.e2e.throughput", "pubsub.payload"].includes(name);
        },
        namePrefix: "EdgePubSub"
      }
    );
    assert.ok((pubsubResults.find(r => r.scenario === "pubsub.e2e.throughput").checks.duplicated as number) > 0);
    assert.ok(pubsubResults.find(r => r.scenario === "pubsub.payload").errors > 0);
  }

  @test
  async lossyBackends() {
    const fastProfile = {
      ...this.profile,
      warmupOps: 0,
      ops: 4,
      queryOps: 1,
      scanOps: 1,
      concurrency: [2],
      dataset: 2,
      messages: 2,
      rates: [100],
      openLoopDurationMs: 20,
      queueMaxConsumers: [1],
      redelivery: true,
      drainTimeoutMs: 30,
      fanout: [1],
      payloadSizes: [100]
    };

    // Store with a no-op increment and a paginated query that returns nothing: default store name
    const storeNames: string[] = [];
    const storeResults = await benchStore(
      {
        backend: "LossyStore",
        createStore: async (name, models) => {
          storeNames.push(name);
          const store = await this.addService(MemoryStore, { models } as any, name);
          const origGetRepository = store.getRepository.bind(store);
          store.getRepository = (model: any) => {
            const repo = origGetRepository(model);
            repo.incrementAttribute = async () => undefined;
            const origQuery = repo.query.bind(repo);
            repo.query = async (query: string) => {
              if (query.startsWith("LIMIT") && !query.includes("OFFSET")) {
                return { results: [], continuationToken: "next" };
              } else if (query.startsWith("LIMIT")) {
                return { results: [], continuationToken: undefined };
              }
              return origQuery(query);
            };
            return repo;
          };
          return store;
        }
      },
      {
        profile: fastProfile,
        reporters: [],
        filter: name => ["store.contention.increment", "store.query.paginate"].includes(name)
      }
    );
    assert.deepStrictEqual(storeNames, ["BenchStore"]);
    const contention = storeResults.find(r => r.scenario === "store.contention.increment");
    assert.deepStrictEqual(contention.failures, [`final counter 0, expected ${contention.checks.expectedCounter}`]);
    const paginate = storeResults.find(r => r.scenario === "store.query.paginate");
    assert.deepStrictEqual(paginate.failures, [`scanned 0 documents, expected ${paginate.checks.expected}`]);

    // Queue that loses every other message, delivers messages of another run and never gets empty
    const queueNames: string[] = [];
    let lossy = true;
    const queueResults = await benchQueue(
      {
        backend: "LossyQueue",
        createQueue: async name => {
          queueNames.push(name);
          const q = await this.addService(MemoryQueue, { expire: 1, timeout: RECEIVE_TIMEOUT } as any, name);
          const origSend = q.sendMessage.bind(q);
          q.sendMessage = async (message: any) => {
            await origSend({ ...message, run: "another-run" });
            if (lossy && message.seq % 2) return;
            await origSend(message);
          };
          q.size = async () => 3;
          return q;
        },
        redeliveryDelayMs: 5
      },
      {
        profile: fastProfile,
        reporters: [],
        filter: name => {
          // The latency scenario waits for every message it sends
          lossy = name !== "queue.e2e.latency";
          return ["queue.drain.raw", "queue.consume", "queue.e2e.latency", "queue.redelivery"].includes(name);
        }
      }
    );
    assert.deepStrictEqual(queueNames, ["BenchQueue"]);
    for (const scenario of ["queue.drain.raw", "queue.consume"]) {
      const result = queueResults.find(r => r.scenario === scenario);
      assert.strictEqual(result.checks.received, 1, scenario);
      assert.deepStrictEqual(result.failures, ["1 messages not received", "queue size is 3 after the scenario"]);
      assert.ok(result.unstable);
    }
    const latency = queueResults.find(r => r.scenario === "queue.e2e.latency");
    assert.strictEqual(latency.checks.lost, 0);
    assert.deepStrictEqual(latency.failures, ["queue size is 3 after the scenario"]);
    const redelivery = queueResults.find(r => r.scenario === "queue.redelivery");
    assert.ok((redelivery.checks.lost as number) > 0);
    assert.strictEqual(redelivery.failures[0], `${redelivery.checks.lost} messages never processed`);

    // PubSub delivering the first message late and losing one
    class LossyPubSub extends LocalPubSub {
      override async sendMessage(event: any): Promise<void> {
        if (event.seq === 5) return;
        const data = JSON.stringify(event);
        setTimeout(() => LocalPubSub.bus.emit("message", data), event.seq === 0 ? 10 : 0);
      }
    }
    const [fanout] = await benchPubSub(
      {
        backend: "LossyPubSub",
        createPubSub: name => this.addService(LossyPubSub as any, {}, name) as any
      },
      { profile: fastProfile, reporters: [], filter: name => name === "pubsub.fanout", namePrefix: "LossyPubSub" }
    );
    assert.strictEqual(fanout.checks.expected, 10);
    assert.strictEqual(fanout.checks.lost, 1);
    assert.strictEqual(fanout.checks.outOfOrder, 1);
    assert.deepStrictEqual(fanout.failures, ["1 deliveries missing"]);
  }
}
