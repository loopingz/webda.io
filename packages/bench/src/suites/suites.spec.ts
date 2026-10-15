import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { EventEmitter } from "node:events";
import { MemoryQueue, MemoryStore, PubSubService } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import { CancelablePromise } from "@webda/utils";
import { resolveProfile } from "../profile.js";
import type { BenchResult } from "../result.js";
import { benchPubSub } from "./pubsub.js";
import { benchQueue } from "./queue.js";
import { benchStore } from "./store.js";
import { useServiceType } from "./fixtures.js";

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
        createQueue: name => this.addService(MemoryQueue, { expire: 1, timeout: 1 } as any, name),
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
}
