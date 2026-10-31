import { performance } from "node:perf_hooks";
import type { PubSubService } from "@webda/core";
import { useLog } from "@webda/workout";
import { BenchmarkRunner } from "../runner.js";
import type { BenchProfile } from "../profile.js";
import type { BenchResult } from "../result.js";
import type { Reporter } from "../reporters/reporter.js";
import type { LatencyRecorder } from "../stats.js";
import { now, withTimeout } from "../stats.js";
import { Deferred, parallel } from "./fixtures.js";
import { benchMessage, newRunId, stopConsumer, type BenchMessage } from "./queue.js";

/**
 * What a pub/sub package provides to run {@link benchPubSub}
 */
export interface PubSubBenchHarness {
  /**
   * Backend name displayed in the results: SocketPubSub, PostgresPubSub...
   */
  backend: string;
  /**
   * Create, register in the Core, resolve and initialize a pub/sub service of the type under test
   *
   * Called once for the publisher and once per subscriber: every instance must share the same topic or channel, so a
   * message sent by one is received by all the others.
   *
   * @param name - unique service name
   * @returns the service
   */
  createPubSub(name: string): Promise<PubSubService>;
  /**
   * Release the services at the end
   *
   * @param services - publisher and subscribers
   */
  stop?(services: PubSubService[]): Promise<void>;
  /**
   * Largest payload the backend accepts, bigger payload sizes are skipped (e.g. 7900 for Postgres NOTIFY)
   */
  maxPayloadBytes?: number;
  /**
   * Most subscribers to create, bigger fan-outs are skipped
   */
  maxSubscribers?: number;
  /**
   * The backend is an emulator: numbers are for regression tracking only
   */
  emulated?: boolean;
}

/**
 * Options of {@link benchPubSub}
 */
export interface PubSubBenchOptions {
  /**
   * Profile, defaults to `WEBDA_BENCH_PROFILE` or quick
   */
  profile?: BenchProfile;
  /**
   * Scenario filter, defaults to `WEBDA_BENCH_FILTER`
   */
  filter?: (name: string) => boolean;
  /**
   * Reporters, defaults to console and JSON
   */
  reporters?: Reporter[];
  /**
   * Prefix of the service names
   *
   * @default "BenchPubSub"
   */
  namePrefix?: string;
}

/**
 * Maximum wait for a subscription to be bound
 */
const BIND_TIMEOUT_MS = 10000;
/**
 * Parallel publishers of the throughput scenario
 */
const PUBLISH_CONCURRENCY = 10;

/**
 * Deliveries counted by a subscriber
 */
interface DeliveryStats {
  /**
   * Unique sequences received
   */
  seen: Set<number>;
  /**
   * Messages received more than once
   */
  duplicated: number;
  /**
   * Messages received after a message with a higher sequence
   */
  outOfOrder: number;
  /**
   * Highest sequence received
   */
  lastSeq: number;
}

/**
 * Benchmark a pub/sub service: every subscriber receives every message
 *
 * Scenarios: publish throughput without subscriber, open-loop end-to-end latency, end-to-end throughput, fan-out to
 * several subscribers and round trip per payload size. Queues are not run through this suite: their consumers
 * compete for messages.
 *
 * @param harness - creates the services under test
 * @param options - profile, filter and reporters
 * @returns the results
 */
export async function benchPubSub(
  harness: PubSubBenchHarness,
  options: PubSubBenchOptions = {}
): Promise<BenchResult[]> {
  const prefix = options.namePrefix ?? "BenchPubSub";
  const publisher = await harness.createPubSub(`${prefix}Publisher`);
  const runner = new BenchmarkRunner({
    suite: "pubsub",
    backend: harness.backend,
    emulated: harness.emulated,
    profile: options.profile,
    filter: options.filter,
    reporters: options.reporters,
    service: publisher
  });
  const profile = runner.profile;
  const subscribers: PubSubService[] = [];
  const getSubscribers = async (count: number) => {
    while (subscribers.length < count) {
      subscribers.push(await harness.createPubSub(`${prefix}Subscriber${subscribers.length}`));
    }
    return subscribers.slice(0, count);
  };
  const active: any[] = [];
  /**
   * Subscribe and wait for the subscription to be bound, the consumer is kept in `active`
   *
   * @param service - the subscriber
   * @param callback - called for each message
   */
  const subscribe = async (service: PubSubService, callback: (message: BenchMessage) => void): Promise<void> => {
    const bound = new Deferred<boolean>();
    const consumer = service.consume(
      async (message: BenchMessage) => callback(message),
      undefined,
      () => bound.resolve(true)
    );
    active.push(consumer);
    if (!(await withTimeout(bound.promise, BIND_TIMEOUT_MS))) {
      useLog("WARN", `[bench] ${service.getName()} subscription not bound after ${BIND_TIMEOUT_MS}ms`);
    }
    // Do not return the consumer: it is a promise pending until cancelled, an async function would wait for it
  };
  const unsubscribeAll = async () => {
    await Promise.all(active.splice(0).map(consumer => stopConsumer(consumer, profile.drainTimeoutMs)));
  };
  /**
   * Subscribe to the deliveries of one run
   *
   * @param service - the subscriber
   * @param run - run identifier, other messages are ignored
   * @param latency - recorder of the delivery latencies
   * @param onMessage - called for each first delivery of a message
   * @returns the delivery statistics, updated as messages arrive
   */
  const subscribeRun = async (
    service: PubSubService,
    run: string,
    latency?: LatencyRecorder,
    onMessage?: (message: BenchMessage) => void
  ): Promise<DeliveryStats> => {
    const stats: DeliveryStats = { seen: new Set(), duplicated: 0, outOfOrder: 0, lastSeq: -1 };
    await subscribe(service, message => {
      if (message?.run !== run) return;
      if (stats.seen.has(message.seq)) {
        stats.duplicated++;
        return;
      }
      if (message.seq < stats.lastSeq) stats.outOfOrder++;
      stats.lastSeq = Math.max(stats.lastSeq, message.seq);
      stats.seen.add(message.seq);
      latency?.recordMs(performance.now() - message.sentAt);
      onMessage?.(message);
    });
    return stats;
  };

  try {
    for (const concurrency of profile.concurrency) {
      const run = newRunId();
      await runner.closedLoop({
        name: "pubsub.publish",
        params: { concurrency, subscribers: 0 },
        concurrency,
        op: index => publisher.sendMessage(benchMessage(run, index))
      });
    }

    for (const ratePerSec of profile.rates) {
      const run = newRunId();
      const pending = new Map<number, Deferred>();
      await runner.openLoop({
        name: "pubsub.e2e.latency",
        params: { ratePerSec, subscribers: 1 },
        ratePerSec,
        setup: async () => {
          const [subscriber] = await getSubscribers(1);
          await subscribeRun(subscriber, run, undefined, message => {
            pending.get(message.seq)?.resolve();
            pending.delete(message.seq);
          });
        },
        op: async index => {
          const deferred = new Deferred();
          pending.set(index, deferred);
          await publisher.sendMessage(benchMessage(run, index));
          await deferred.promise;
        },
        verify: async () => ({ checks: { lost: pending.size } }),
        teardown: unsubscribeAll
      });
    }

    await runner.custom({
      name: "pubsub.e2e.throughput",
      params: { messages: profile.messages, subscribers: 1, publishConcurrency: PUBLISH_CONCURRENCY },
      teardown: unsubscribeAll,
      run: latency => deliver(profile.messages, 1, PUBLISH_CONCURRENCY, latency)
    });

    for (const subscriberCount of profile.fanout) {
      if (harness.maxSubscribers !== undefined && subscriberCount > harness.maxSubscribers) {
        useLog("INFO", `[bench] pubsub.fanout with ${subscriberCount} subscribers skipped (maxSubscribers)`);
        continue;
      }
      const messages = Math.max(10, Math.floor(profile.messages / subscriberCount));
      await runner.custom({
        name: "pubsub.fanout",
        params: { subscribers: subscriberCount, messages },
        teardown: unsubscribeAll,
        // Sequential publishing so the ordering check is meaningful
        run: latency => deliver(messages, subscriberCount, 1, latency)
      });
    }

    for (const payloadBytes of profile.payloadSizes) {
      if (harness.maxPayloadBytes !== undefined && payloadBytes > harness.maxPayloadBytes) {
        useLog("INFO", `[bench] pubsub.payload of ${payloadBytes} bytes skipped (maxPayloadBytes)`);
        continue;
      }
      const run = newRunId();
      const pending = new Map<number, Deferred>();
      await runner.closedLoop({
        name: "pubsub.payload",
        params: { payloadBytes, subscribers: 1 },
        concurrency: 1,
        ops: Math.max(10, Math.floor(profile.ops / 10)),
        warmupOps: Math.min(profile.warmupOps, 10),
        setup: async () => {
          const [subscriber] = await getSubscribers(1);
          await subscribeRun(subscriber, run, undefined, message => {
            pending.get(message.seq)?.resolve();
            pending.delete(message.seq);
          });
        },
        op: async index => {
          const deferred = new Deferred();
          pending.set(index, deferred);
          await publisher.sendMessage(benchMessage(run, index, payloadBytes));
          if (
            !(await withTimeout(
              deferred.promise.then(() => true),
              profile.drainTimeoutMs
            ))
          ) {
            pending.delete(index);
            throw new Error(`message ${index} not received within ${profile.drainTimeoutMs}ms`);
          }
        },
        teardown: unsubscribeAll
      });
    }
  } finally {
    await unsubscribeAll().catch(() => {});
    await harness.stop?.([publisher, ...subscribers]);
  }
  return runner.finish();

  /**
   * Publish messages to subscribers and wait for every delivery
   *
   * @param messages - messages to publish
   * @param subscriberCount - subscribers
   * @param publishConcurrency - parallel publishers
   * @param latency - recorder of the delivery latencies
   * @returns the outcome
   */
  async function deliver(
    messages: number,
    subscriberCount: number,
    publishConcurrency: number,
    latency: LatencyRecorder
  ) {
    const run = newRunId();
    const expected = messages * subscriberCount;
    let delivered = 0;
    let end: bigint | undefined;
    const done = new Deferred<void>();
    const stats: DeliveryStats[] = [];
    for (const subscriber of await getSubscribers(subscriberCount)) {
      stats.push(
        await subscribeRun(subscriber, run, latency, () => {
          if (++delivered === expected) {
            end = now();
            done.resolve();
          }
        })
      );
    }
    const start = now();
    await parallel(messages, publishConcurrency, i => publisher.sendMessage(benchMessage(run, i)));
    await withTimeout(done.promise, profile.drainTimeoutMs);
    end ??= now();
    const lost = expected - delivered;
    const duplicated = stats.reduce((total, s) => total + s.duplicated, 0);
    const outOfOrder = stats.reduce((total, s) => total + s.outOfOrder, 0);
    return {
      ops: delivered,
      errors: lost,
      durationMs: Number(end - start) / 1e6,
      checks: { expected, delivered, lost, duplicated, outOfOrder },
      failures: lost ? [`${lost} deliveries missing`] : []
    };
  }
}
