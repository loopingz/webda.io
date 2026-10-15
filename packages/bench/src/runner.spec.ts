import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { PROFILES, resolveProfile, scenarioFilter } from "./profile.js";
import { BenchmarkRunner } from "./runner.js";
import { delay, LatencyRecorder, ResourceSampler, captureEnv, withTimeout, nsToMs } from "./stats.js";
import { diffMetrics, snapshotServiceMetrics } from "./metrics.js";
import type { Reporter } from "./reporters/reporter.js";
import type { BenchResult } from "./result.js";
import { benchVitestOptions } from "./vitest.js";
import { Deferred, makeDocument, makePayload, parallel, SeededRandom, waitFor } from "./suites/fixtures.js";

/**
 * Runner with the smoke profile and no reporter
 *
 * @param options - extra options
 * @returns the runner
 */
function smokeRunner(options: Partial<ConstructorParameters<typeof BenchmarkRunner>[0]> = {}) {
  return new BenchmarkRunner({
    suite: "test",
    backend: "Fake",
    profile: resolveProfile("smoke"),
    reporters: [],
    filter: () => true,
    ...options
  });
}

@suite
class ProfileTest {
  @test
  resolve() {
    assert.strictEqual(resolveProfile("full").name, "full");
    assert.strictEqual(resolveProfile("quick", { ops: 3 }).ops, 3);
    assert.strictEqual(PROFILES.quick.ops, 1000, "overrides do not change the built-in profile");
    assert.throws(() => resolveProfile("unknown"), /Unknown benchmark profile 'unknown'/);
    const previous = process.env.WEBDA_BENCH_PROFILE;
    try {
      process.env.WEBDA_BENCH_PROFILE = "smoke";
      assert.strictEqual(resolveProfile().name, "smoke");
      delete process.env.WEBDA_BENCH_PROFILE;
      assert.strictEqual(resolveProfile().name, "quick");
    } finally {
      if (previous === undefined) delete process.env.WEBDA_BENCH_PROFILE;
      else process.env.WEBDA_BENCH_PROFILE = previous;
    }
  }

  @test
  vitestOptions() {
    const options = benchVitestOptions();
    assert.deepStrictEqual(options.include, ["src/**/*.bench.ts"]);
    assert.strictEqual(options.fileParallelism, false);
    assert.strictEqual(options.coverage.enabled, false);
    assert.strictEqual(options.testTimeout, 30 * 60 * 1000);
    const custom = benchVitestOptions({ include: ["bench/*.bench.ts"], timeout: 10 });
    assert.deepStrictEqual(custom.include, ["bench/*.bench.ts"]);
    assert.strictEqual(custom.hookTimeout, 10);
  }

  @test
  filter() {
    assert.ok(scenarioFilter("")("anything"));
    assert.ok(scenarioFilter(undefined)("anything") || process.env.WEBDA_BENCH_FILTER !== undefined);
    const filter = scenarioFilter("store.get, queue.*");
    assert.ok(filter("store.get"));
    assert.ok(!filter("store.getter"));
    assert.ok(filter("queue.consume"));
    assert.ok(!filter("pubsub.publish"));
    // Regexp characters are literal
    assert.ok(!scenarioFilter("store.get")("storexget"));
  }
}

@suite
class StatsTest {
  @test
  latency() {
    const recorder = new LatencyRecorder();
    assert.deepStrictEqual(recorder.summary(), {
      count: 0,
      min: 0,
      mean: 0,
      stddev: 0,
      p50: 0,
      p90: 0,
      p99: 0,
      p999: 0,
      max: 0
    });
    for (let i = 1; i <= 100; i++) {
      recorder.recordMs(i);
    }
    recorder.record(0n); // clamped to 1ns
    const summary = recorder.summary();
    assert.strictEqual(summary.count, 101);
    assert.strictEqual(recorder.count, 101);
    // The native histogram is precise to about 1%
    assert.ok(Math.abs(summary.p50 - 50) < 1, `p50 ${summary.p50}`);
    assert.ok(Math.abs(summary.p99 - 99) < 1.5, `p99 ${summary.p99}`);
    assert.ok(Math.abs(summary.max - 100) < 1.5, `max ${summary.max}`);
    assert.strictEqual(summary.min, 0);
    recorder.reset();
    assert.strictEqual(recorder.count, 0);
    assert.strictEqual(nsToMs(1234567), 1.235);
  }

  @test
  async resources() {
    const sampler = new ResourceSampler().start();
    await delay(30);
    const resources = sampler.stop();
    assert.ok(resources.cpuUserMs >= 0);
    assert.ok(resources.eventLoopDelay.max >= 0);
    assert.strictEqual(typeof resources.rssDeltaBytes, "number");
    const env = captureEnv();
    assert.strictEqual(env.node, process.version);
    assert.ok(env.cpuCount > 0);
  }

  @test
  async timeout() {
    assert.strictEqual(await withTimeout(Promise.resolve(1), 1000), 1);
    assert.strictEqual(await withTimeout(new Promise(() => {}), 5), undefined);
    assert.strictEqual(await withTimeout(Promise.reject(new Error("no")), 1000), undefined);
  }

  @test
  async fixtures() {
    const a = new SeededRandom(1);
    const b = new SeededRandom(1);
    const values = Array.from({ length: 5 }, () => a.next());
    assert.deepStrictEqual(
      values,
      Array.from({ length: 5 }, () => b.next())
    );
    assert.ok(values.every(v => v >= 0 && v < 1));
    assert.match(a.uuid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.ok(["x", "y"].includes(a.pick(["x", "y"])));
    assert.strictEqual(makePayload(250, 3).length, 250);
    assert.strictEqual(makeDocument(5, "small", "k").state, "OR");
    assert.ok(JSON.stringify(makeDocument(1, "large", "k")).length > 10000);
    let count = 0;
    let running = 0;
    let maxRunning = 0;
    await parallel(10, 3, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await delay(1);
      running--;
      count++;
    });
    assert.strictEqual(count, 10);
    assert.strictEqual(maxRunning, 3);
    const deferred = new Deferred<number>();
    setTimeout(() => deferred.resolve(2), 1);
    assert.strictEqual(await deferred.promise, 2);
    assert.ok(await waitFor(() => count === 10, 100));
    assert.ok(!(await waitFor(() => false, 20)));
  }
}

@suite
class RunnerTest {
  @test
  async closedLoop() {
    const runner = smokeRunner();
    const indexes: number[] = [];
    let running = 0;
    let maxRunning = 0;
    const result = await runner.closedLoop({
      name: "test.closed",
      params: { concurrency: 4 },
      concurrency: 4,
      ops: 40,
      warmupOps: 8,
      op: async index => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        indexes.push(index);
        await delay(1);
        running--;
        if (index === 20) throw new Error("boom");
      }
    });
    assert.strictEqual(maxRunning, 4);
    assert.strictEqual(indexes.length, 48, "warmup and measured operations run");
    assert.deepStrictEqual(
      [...indexes].sort((a, b) => a - b),
      Array.from({ length: 48 }, (_, i) => i)
    );
    assert.strictEqual(result.ops, 39);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.latency.count, 39);
    assert.strictEqual(result.mode, "closed");
    assert.strictEqual(result.profile, "smoke");
    assert.ok(result.throughput > 0);
    assert.ok(result.unstable, "1 error out of 40 is above 1%");
    assert.deepStrictEqual(result.notes, ["error: boom"]);
    assert.deepStrictEqual(runner.results, [result]);
  }

  @test
  async closedLoopDuration() {
    const runner = smokeRunner();
    const result = await runner.closedLoop({
      name: "test.slow",
      concurrency: 1,
      ops: 1000,
      warmupOps: 0,
      maxDurationMs: 30,
      op: () => delay(5)
    });
    assert.ok(result.ops < 1000);
    assert.ok(result.notes[0].startsWith(`stopped after ${result.ops}/1000 operations`));
    assert.ok(!result.unstable);
  }

  @test
  async filterAndFailures() {
    const runner = smokeRunner({ filter: name => name !== "test.skipped" });
    assert.strictEqual(
      await runner.closedLoop({ name: "test.skipped", concurrency: 1, op: async () => {} }),
      undefined
    );
    const steps: string[] = [];
    const failed = await runner.closedLoop({
      name: "test.setup",
      concurrency: 1,
      setup: async () => {
        throw new Error("setup broke");
      },
      op: async () => {
        steps.push("op");
      },
      teardown: async () => {
        steps.push("teardown");
        throw new Error("teardown broke");
      }
    });
    assert.deepStrictEqual(steps, ["teardown"]);
    assert.deepStrictEqual(failed.failures, ["scenario failed: setup broke"]);
    assert.deepStrictEqual(failed.notes, ["teardown failed: teardown broke"]);
    assert.ok(failed.unstable);
    const verified = await runner.closedLoop({
      name: "test.verify",
      concurrency: 1,
      ops: 2,
      op: async () => {},
      verify: async () => ({ checks: { lost: 1 }, failures: ["lost one"], notes: ["note"] })
    });
    assert.deepStrictEqual(verified.checks, { lost: 1 });
    assert.deepStrictEqual(verified.failures, ["lost one"]);
    assert.deepStrictEqual(verified.notes, ["note"]);
  }

  @test
  async openLoop() {
    const runner = smokeRunner();
    const started: number[] = [];
    const result = await runner.openLoop({
      name: "test.open",
      ratePerSec: 500,
      durationMs: 100,
      warmupOps: 2,
      op: async index => {
        started.push(index);
        // libuv timers may fire up to ~1ms early
        await delay(5);
      }
    });
    assert.strictEqual(started.length, 52);
    assert.strictEqual(result.ops, 50);
    assert.strictEqual(result.errors, 0);
    assert.strictEqual(result.mode, "open");
    // 50 operations at 500/s take about 100ms
    assert.ok(result.durationMs >= 95, `duration ${result.durationMs}`);
    assert.ok(result.latency.p50 >= 3.5, `latency includes the operation, got ${result.latency.p50}`);
  }

  @test
  async openLoopUnfinished() {
    const runner = smokeRunner();
    const result = await runner.openLoop({
      name: "test.lost",
      ratePerSec: 1000,
      durationMs: 10,
      warmupOps: 0,
      drainTimeoutMs: 20,
      op: index => {
        if (index % 2) return new Promise(() => {});
        if (index === 2) return Promise.reject(new Error("rejected"));
        return Promise.resolve();
      }
    });
    assert.strictEqual(result.ops, 4);
    assert.strictEqual(result.errors, 6);
    assert.ok(result.notes.includes("5 operations did not complete within 20ms"));
    assert.ok(result.notes.includes("error: rejected"));
  }

  @test
  async custom() {
    const reported: BenchResult[][] = [];
    const reporter: Reporter = { report: results => void reported.push(results) };
    const runner = smokeRunner({ reporters: [reporter], emulated: true });
    const result = await runner.custom({
      name: "test.custom",
      run: async latency => {
        latency.recordMs(2);
        latency.recordMs(4);
        return { ops: 2, errors: 1, durationMs: 1000, checks: { delivered: 2 }, failures: [] };
      }
    });
    assert.strictEqual(result.throughput, 2);
    assert.strictEqual(result.errors, 1);
    assert.strictEqual(result.emulated, true);
    assert.deepStrictEqual(result.checks, { delivered: 2 });
    assert.strictEqual(await runner.finish(), runner.results);
    assert.deepStrictEqual(reported, [[result]]);
  }

  @test
  async serviceMetrics() {
    let calls = 0;
    const service = {
      metrics: {
        operations: { get: async () => ({ type: "counter", values: [{ value: calls++ * 2 }, { value: 1 }] }) },
        duration: {
          observe: () => {},
          get: async () => ({
            type: "histogram",
            values: [
              { metricName: "x_bucket", value: 9 },
              { metricName: "x_count", value: calls },
              { metricName: "x_sum", value: calls * 0.5 }
            ]
          })
        },
        pending: { set: () => {}, get: async () => assert.fail("gauges are not read") },
        broken: {
          get: async () => {
            throw new Error("unreadable");
          }
        },
        mock: { inc: () => {} }
      }
    };
    const result = await smokeRunner({ service }).closedLoop({
      name: "test.metrics",
      concurrency: 1,
      ops: 1,
      op: async () => {}
    });
    assert.deepStrictEqual(result.serviceMetrics, { operations: 2, duration_count: 1, duration_sum: 0.5 });
    assert.deepStrictEqual(await snapshotServiceMetrics(undefined), {});
    assert.strictEqual(diffMetrics({}, {}), undefined);
  }
}
