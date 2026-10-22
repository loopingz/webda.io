import { performance } from "node:perf_hooks";
import type { Queue } from "@webda/core";
import { BenchmarkRunner, type ScenarioChecks } from "../runner.js";
import type { BenchProfile } from "../profile.js";
import type { BenchResult } from "../result.js";
import type { Reporter } from "../reporters/reporter.js";
import { delay, now, withTimeout } from "../stats.js";
import { Deferred, makePayload, parallel } from "./fixtures.js";

/**
 * What a queue package provides to run {@link benchQueue}
 */
export interface QueueBenchHarness {
  /**
   * Backend name displayed in the results: MemoryQueue, SQSQueue...
   */
  backend: string;
  /**
   * Create, register in the Core, resolve and initialize an EMPTY queue of the type under test
   *
   * @param name - service name
   * @returns the queue
   */
  createQueue(name: string): Promise<Queue>;
  /**
   * Remove every message of the queue
   *
   * Defaults to the `__clean` test hook of the queue.
   *
   * @param queue - the queue
   */
  purge?(queue: Queue): Promise<void>;
  /**
   * Release the queue resources at the end
   *
   * @param queue - the queue
   */
  stopQueue?(queue: Queue): Promise<void>;
  /**
   * `size()` is approximate (SQS, GCP...): size checks are skipped
   */
  inconsistentSize?: boolean;
  /**
   * Delay after which a message not acknowledged is delivered again, enables the `queue.redelivery` scenario
   */
  redeliveryDelayMs?: number;
  /**
   * `receiveMessage` / `deleteMessage` can be called directly, enables the `queue.drain.raw` scenario
   *
   * Set to false for queues that only deliver through `consume()` (e.g. GCPQueue in consumer mode).
   *
   * @default true
   */
  rawReceive?: boolean;
  /**
   * The backend is an emulator: numbers are for regression tracking only
   */
  emulated?: boolean;
}

/**
 * Options of {@link benchQueue}
 */
export interface QueueBenchOptions {
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
   * Service name of the queue
   *
   * @default "BenchQueue"
   */
  queueName?: string;
}

/**
 * Message sent by the queue and pub/sub benchmarks
 */
export interface BenchMessage {
  /**
   * Scenario run identifier: messages of another run are ignored
   */
  run: string;
  /**
   * Sequence number in the run
   */
  seq: number;
  /**
   * `performance.now()` when sent
   */
  sentAt: number;
  /**
   * Padding
   */
  payload: string;
}

/**
 * Size of the payload of the queue messages
 */
const MESSAGE_PAYLOAD_BYTES = 100;
/**
 * Parallelism of the unmeasured prefill
 */
const PREFILL_CONCURRENCY = 20;

let runCounter = 0;

/**
 * New unique run identifier
 *
 * @returns the identifier
 */
export function newRunId(): string {
  return `${process.pid}-${Date.now()}-${runCounter++}`;
}

/**
 * Build a message
 *
 * @param run - run identifier
 * @param seq - sequence number
 * @param payloadBytes - payload size
 * @returns the message
 */
export function benchMessage(run: string, seq: number, payloadBytes: number = MESSAGE_PAYLOAD_BYTES): BenchMessage {
  return { run, seq, sentAt: performance.now(), payload: makePayload(payloadBytes, seq) };
}

/**
 * Benchmark a queue through the `Queue` API
 *
 * Scenarios: send throughput, raw drain (`receiveMessage` + `deleteMessage`), `consume()` workers for each
 * `maxConsumers` and `workerParallelism`, open-loop end-to-end latency and, when the harness defines
 * `redeliveryDelayMs` and the profile enables it, redelivery of failed messages.
 *
 * @param harness - creates the queue under test
 * @param options - profile, filter and reporters
 * @returns the results
 */
export async function benchQueue(harness: QueueBenchHarness, options: QueueBenchOptions = {}): Promise<BenchResult[]> {
  const queue = await harness.createQueue(options.queueName ?? "BenchQueue");
  const runner = new BenchmarkRunner({
    suite: "queue",
    backend: harness.backend,
    emulated: harness.emulated,
    profile: options.profile,
    filter: options.filter,
    reporters: options.reporters,
    service: queue
  });
  const profile = runner.profile;
  const parameters: any = queue.getParameters();
  const originalParameters = { maxConsumers: parameters.maxConsumers, workerParallelism: parameters.workerParallelism };
  const purge = async () => {
    if (harness.purge) {
      await harness.purge(queue);
    } else {
      await (queue as any).__clean?.();
    }
  };
  const prefill = async (run: string, count: number) => {
    await parallel(count, PREFILL_CONCURRENCY, i => queue.sendMessage(benchMessage(run, i)));
  };
  const sizeCheck = async (): Promise<ScenarioChecks> => {
    if (harness.inconsistentSize) {
      return {};
    }
    // The last acknowledgement may still be in flight
    await delay(10);
    const size = await queue.size();
    return { checks: { sizeAfter: size }, failures: size === 0 ? [] : [`queue size is ${size} after the scenario`] };
  };

  try {
    await purge();
    for (const concurrency of profile.concurrency) {
      const run = newRunId();
      await runner.closedLoop({
        name: "queue.send",
        params: { concurrency, payloadBytes: MESSAGE_PAYLOAD_BYTES },
        concurrency,
        op: index => queue.sendMessage(benchMessage(run, index)),
        teardown: purge
      });
    }

    // Raw drain runs before any consume(): a cancelled consumer may still finish its last receive
    for (const concurrency of harness.rawReceive === false ? [] : profile.concurrency) {
      await runner.custom({
        name: "queue.drain.raw",
        params: { concurrency, messages: profile.messages },
        setup: purge,
        run: async latency => {
          const run = newRunId();
          await prefill(run, profile.messages);
          const seen = new Set<number>();
          let duplicated = 0;
          let end: bigint | undefined;
          const start = now();
          const deadline = Date.now() + profile.drainTimeoutMs;
          const worker = async () => {
            while (seen.size < profile.messages && Date.now() < deadline) {
              const items = await queue.receiveMessage();
              for (const item of items) {
                await queue.deleteMessage(item.ReceiptHandle);
                const message = item.Message as BenchMessage;
                if (message?.run !== run) continue;
                if (seen.has(message.seq)) {
                  duplicated++;
                  continue;
                }
                seen.add(message.seq);
                latency.recordMs(performance.now() - message.sentAt);
                if (seen.size === profile.messages) {
                  end = now();
                }
              }
            }
          };
          const workers = Promise.all(Array.from({ length: concurrency }, worker));
          // Workers blocked in a long-polling receive do not count in the duration
          await withTimeout(workers, profile.drainTimeoutMs);
          end ??= now();
          const lost = profile.messages - seen.size;
          return {
            ops: seen.size,
            errors: lost,
            durationMs: Number(end - start) / 1e6,
            checks: { received: seen.size, lost, duplicated },
            failures: lost ? [`${lost} messages not received`] : []
          };
        },
        verify: sizeCheck
      });
    }

    for (const maxConsumers of profile.queueMaxConsumers) {
      for (const workerParallelism of [true, false]) {
        await runner.custom({
          name: "queue.consume",
          params: { maxConsumers, workerParallelism, workMs: profile.consumeWorkMs, messages: profile.messages },
          setup: async () => {
            await purge();
            parameters.maxConsumers = maxConsumers;
            parameters.workerParallelism = workerParallelism;
          },
          run: async latency => {
            const run = newRunId();
            await prefill(run, profile.messages);
            const seen = new Set<number>();
            const done = new Deferred<bigint>();
            let duplicated = 0;
            let inflight = 0;
            let maxInflight = 0;
            const start = now();
            const consumer = queue.consume(async (message: BenchMessage) => {
              if (message?.run !== run) return;
              inflight++;
              maxInflight = Math.max(maxInflight, inflight);
              try {
                if (profile.consumeWorkMs) {
                  await delay(profile.consumeWorkMs);
                }
              } finally {
                inflight--;
              }
              if (seen.has(message.seq)) {
                duplicated++;
                return;
              }
              seen.add(message.seq);
              latency.recordMs(performance.now() - message.sentAt);
              if (seen.size === profile.messages) {
                done.resolve(now());
              }
            });
            const end = (await withTimeout(done.promise, profile.drainTimeoutMs)) ?? now();
            await stopConsumer(consumer, profile.drainTimeoutMs);
            const lost = profile.messages - seen.size;
            return {
              ops: seen.size,
              errors: lost,
              durationMs: Number(end - start) / 1e6,
              checks: { received: seen.size, lost, duplicated, maxInflight },
              failures: lost ? [`${lost} messages not received`] : []
            };
          },
          verify: sizeCheck
        });
      }
    }
    parameters.maxConsumers = Math.max(...profile.queueMaxConsumers);
    parameters.workerParallelism = true;

    for (const ratePerSec of profile.rates) {
      const run = newRunId();
      const pending = new Map<number, Deferred>();
      let duplicated = 0;
      let consumer: any;
      await runner.openLoop({
        name: "queue.e2e.latency",
        params: { ratePerSec, maxConsumers: parameters.maxConsumers },
        ratePerSec,
        setup: async () => {
          await purge();
          consumer = queue.consume(async (message: BenchMessage) => {
            if (message?.run !== run) return;
            const deferred = pending.get(message.seq);
            if (!deferred) {
              duplicated++;
              return;
            }
            pending.delete(message.seq);
            deferred.resolve();
          });
        },
        op: async index => {
          const deferred = new Deferred();
          pending.set(index, deferred);
          await queue.sendMessage(benchMessage(run, index));
          await deferred.promise;
        },
        verify: async () => {
          await stopConsumer(consumer, profile.drainTimeoutMs);
          const size = await sizeCheck();
          return { ...size, checks: { ...size.checks, duplicated, lost: pending.size } };
        },
        teardown: async () => {
          await stopConsumer(consumer, profile.drainTimeoutMs);
          await purge();
        }
      });
    }

    const redeliveryDelayMs = harness.redeliveryDelayMs;
    if (profile.redelivery && redeliveryDelayMs !== undefined) {
      const count = Math.min(profile.messages, 100);
      await runner.custom({
        name: "queue.redelivery",
        params: { messages: count, failureRate: 0.05 },
        setup: purge,
        run: async latency => {
          const run = newRunId();
          const failedAt = new Map<number, number>();
          const succeeded = new Set<number>();
          const done = new Deferred<void>();
          const shouldFail = (seq: number) => seq % 20 === 0;
          const consumer = queue.consume(async (message: BenchMessage) => {
            if (message?.run !== run || succeeded.has(message.seq)) return;
            if (shouldFail(message.seq) && !failedAt.has(message.seq)) {
              failedAt.set(message.seq, performance.now());
              throw new Error("Benchmark induced failure");
            }
            const firstFailure = failedAt.get(message.seq);
            if (firstFailure !== undefined) {
              latency.recordMs(performance.now() - firstFailure);
            }
            succeeded.add(message.seq);
            if (succeeded.size === count) done.resolve();
          });
          await prefill(run, count);
          await withTimeout(done.promise, redeliveryDelayMs * 3 + profile.drainTimeoutMs);
          await stopConsumer(consumer, profile.drainTimeoutMs);
          const lost = count - succeeded.size;
          const redelivered = [...failedAt.keys()].filter(seq => succeeded.has(seq)).length;
          return {
            // Only the redelivered messages are measured
            ops: redelivered,
            errors: lost,
            checks: { delivered: succeeded.size, failed: failedAt.size, redelivered, lost },
            failures: lost ? [`${lost} messages never processed`] : []
          };
        },
        verify: sizeCheck
      });
    }
  } finally {
    parameters.maxConsumers = originalParameters.maxConsumers;
    parameters.workerParallelism = originalParameters.workerParallelism;
    await purge().catch(() => {});
    await harness.stopQueue?.(queue);
  }
  return runner.finish();
}

/**
 * Cancel a consumer and wait for its loop to end, at most `timeoutMs`
 *
 * @param consumer - the consumer returned by `consume()`
 * @param timeoutMs - maximum wait
 */
export async function stopConsumer(consumer: any, timeoutMs: number): Promise<void> {
  if (!consumer) {
    return;
  }
  // A CancelablePromise rejects when cancelled: handle it before cancelling
  const finished = Promise.resolve(consumer).catch((): void => undefined);
  await consumer.cancel?.();
  await withTimeout(finished, timeoutMs);
}
