import { useLog } from "@webda/workout";
import { diffMetrics, snapshotServiceMetrics } from "./metrics.js";
import { resolveProfile, scenarioFilter, type BenchProfile } from "./profile.js";
import { BENCH_SCHEMA_VERSION, type BenchParams, type BenchResult } from "./result.js";
import { captureEnv, delay, LatencyRecorder, now, ResourceSampler, withTimeout } from "./stats.js";
import type { Reporter } from "./reporters/reporter.js";
import { ConsoleReporter } from "./reporters/console.js";
import { JsonReporter } from "./reporters/json.js";

/**
 * Correctness information returned by a scenario
 */
export interface ScenarioChecks {
  /**
   * Values to report: lost, duplicated, finalCounter...
   */
  checks?: Record<string, string | number | boolean>;
  /**
   * Failed checks, marking the result unstable
   */
  failures?: string[];
  /**
   * Free-form notes
   */
  notes?: string[];
}

/**
 * Common definition of a scenario
 */
export interface BaseScenario {
  /**
   * Scenario name, prefixed by the suite: `store.get`
   */
  name: string;
  /**
   * Parameters of this run, part of the result key
   */
  params?: BenchParams;
  /**
   * Prepare the scenario, not measured
   */
  setup?(): Promise<void>;
  /**
   * Clean after the scenario, not measured
   */
  teardown?(): Promise<void>;
  /**
   * Check the correctness after the measurement, not measured
   */
  verify?(): Promise<ScenarioChecks>;
}

/**
 * Scenario run by N workers, each one waiting for its operation before starting the next one
 */
export interface ClosedLoopScenario extends BaseScenario {
  /**
   * Number of workers
   */
  concurrency: number;
  /**
   * Measured operations, defaults to the profile `ops`
   */
  ops?: number;
  /**
   * Discarded operations run before, defaults to the profile `warmupOps`
   */
  warmupOps?: number;
  /**
   * Maximum duration, defaults to the profile `maxDurationMs`
   */
  maxDurationMs?: number;
  /**
   * One operation
   *
   * @param index - unique index of the operation in the scenario: warmup operations come first
   * @param worker - index of the worker running it
   */
  op(index: number, worker: number): Promise<void>;
}

/**
 * Scenario starting operations at a fixed rate, whatever the previous ones completed or not
 *
 * The latency is measured from the scheduled start of the operation, not its actual start, so a slow backend
 * cannot hide its queueing delay (coordinated omission).
 */
export interface OpenLoopScenario extends BaseScenario {
  /**
   * Operations started per second
   */
  ratePerSec: number;
  /**
   * Duration of the measurement, defaults to the profile `openLoopDurationMs`
   */
  durationMs?: number;
  /**
   * Discarded operations run sequentially before, defaults to min(profile `warmupOps`, 10)
   */
  warmupOps?: number;
  /**
   * Maximum time to wait for operations still running at the end, defaults to the profile `drainTimeoutMs`
   */
  drainTimeoutMs?: number;
  /**
   * One operation: resolves when complete, e.g. when the message is received
   *
   * @param index - unique index of the operation in the scenario: warmup operations come first
   */
  op(index: number): Promise<void>;
}

/**
 * Outcome of a custom scenario
 */
export interface CustomScenarioOutcome extends ScenarioChecks {
  /**
   * Successful operations
   */
  ops: number;
  /**
   * Failed operations
   */
  errors?: number;
  /**
   * Measured duration in ms, defaults to the duration of `run`
   */
  durationMs?: number;
}

/**
 * Scenario measuring itself: throughput of a drain, fan-out deliveries...
 */
export interface CustomScenario extends BaseScenario {
  /**
   * Run the scenario
   *
   * @param latency - recorder for the latencies of the operations
   */
  run(latency: LatencyRecorder): Promise<CustomScenarioOutcome>;
}

/**
 * Options of {@link BenchmarkRunner}
 */
export interface BenchmarkRunnerOptions {
  /**
   * Suite name: store, queue, pubsub...
   */
  suite: string;
  /**
   * Backend name
   */
  backend: string;
  /**
   * The backend is an emulator
   */
  emulated?: boolean;
  /**
   * Profile, defaults to {@link resolveProfile}()
   */
  profile?: BenchProfile;
  /**
   * Scenario filter, defaults to {@link scenarioFilter}()
   */
  filter?: (name: string) => boolean;
  /**
   * Reporters called by {@link BenchmarkRunner.finish}, defaults to console and JSON
   */
  reporters?: Reporter[];
  /**
   * Service whose Webda metrics are captured for each scenario
   */
  service?: any;
}

/**
 * Errors of a scenario
 */
export interface ErrorAccumulator {
  /**
   * Number of failed operations
   */
  count: number;
  /**
   * Messages of the first errors
   */
  messages: string[];
}

/**
 * Error ratio above which a result is unstable
 */
const UNSTABLE_ERROR_RATIO = 0.01;
/**
 * Maximum number of error messages kept in the notes
 */
const MAX_ERROR_NOTES = 3;

/**
 * Run scenarios and collect their results
 */
export class BenchmarkRunner {
  /**
   * Results of the scenarios run so far
   */
  readonly results: BenchResult[] = [];
  /**
   * Profile in use
   */
  readonly profile: BenchProfile;
  /**
   * Scenario filter
   */
  protected filter: (name: string) => boolean;
  /**
   * Reporters
   */
  protected reporters: Reporter[];

  /**
   * @param options - suite, backend, profile...
   */
  constructor(protected options: BenchmarkRunnerOptions) {
    this.profile = options.profile ?? resolveProfile();
    this.filter = options.filter ?? scenarioFilter();
    this.reporters = options.reporters ?? [new ConsoleReporter(), new JsonReporter()];
  }

  /**
   * Tell if a scenario is selected by the filter
   *
   * @param name - scenario name
   * @returns true when the scenario must run
   */
  shouldRun(name: string): boolean {
    return this.filter(name);
  }

  /**
   * Run a closed-loop scenario
   *
   * @param scenario - the scenario
   * @returns the result, undefined when filtered out
   */
  async closedLoop(scenario: ClosedLoopScenario): Promise<BenchResult | undefined> {
    const ops = scenario.ops ?? this.profile.ops;
    const warmupOps = scenario.warmupOps ?? this.profile.warmupOps;
    const maxDurationMs = scenario.maxDurationMs ?? this.profile.maxDurationMs;
    const concurrency = Math.max(1, scenario.concurrency);
    return this.execute(scenario, "closed", async (latency, errors) => {
      // Warmup: same load, nothing recorded
      await this.workers(warmupOps, 0, concurrency, maxDurationMs, scenario.op, undefined, errors);
      errors.count = 0;
      errors.messages.length = 0;
      latency.reset();
      const start = now();
      const done = await this.workers(ops, warmupOps, concurrency, maxDurationMs, scenario.op, latency, errors);
      const durationMs = Number(now() - start) / 1e6;
      const notes =
        done < ops ? [`stopped after ${done}/${ops} operations: maxDurationMs ${maxDurationMs} reached`] : [];
      return { ops: done - errors.count, durationMs, notes };
    });
  }

  /**
   * Run operations with a pool of workers
   *
   * @param count - operations to run
   * @param offset - index of the first operation
   * @param concurrency - number of workers
   * @param maxDurationMs - stop starting operations after this duration
   * @param op - the operation
   * @param latency - recorder, undefined to discard the latencies
   * @param errors - error accumulator
   * @returns the number of operations run
   */
  protected async workers(
    count: number,
    offset: number,
    concurrency: number,
    maxDurationMs: number,
    op: ClosedLoopScenario["op"],
    latency: LatencyRecorder | undefined,
    errors: ErrorAccumulator
  ): Promise<number> {
    let next = 0;
    const deadline = now() + BigInt(Math.round(maxDurationMs * 1e6));
    const worker = async (w: number) => {
      while (next < count && now() < deadline) {
        const index = offset + next++;
        const start = now();
        try {
          await op(index, w);
          latency?.recordSince(start);
        } catch (err) {
          this.recordError(errors, err);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(count, 1)) }, (_, w) => worker(w)));
    return next;
  }

  /**
   * Run an open-loop scenario
   *
   * @param scenario - the scenario
   * @returns the result, undefined when filtered out
   */
  async openLoop(scenario: OpenLoopScenario): Promise<BenchResult | undefined> {
    const durationMs = scenario.durationMs ?? this.profile.openLoopDurationMs;
    const warmupOps = scenario.warmupOps ?? Math.min(this.profile.warmupOps, 10);
    const drainTimeoutMs = scenario.drainTimeoutMs ?? this.profile.drainTimeoutMs;
    const total = Math.max(1, Math.round((scenario.ratePerSec * durationMs) / 1000));
    const intervalNs = 1e9 / scenario.ratePerSec;
    return this.execute(scenario, "open", async (latency, errors) => {
      for (let i = 0; i < warmupOps; i++) {
        // Warmup errors are not reported; a backend slow to wake up (polling consumers) cannot block the scenario
        await withTimeout(
          Promise.resolve().then(() => scenario.op(i)),
          drainTimeoutMs
        );
      }
      let launched = 0;
      let completed = 0;
      let lastCompletion = now();
      const running: Promise<void>[] = [];
      const start = now();
      const scheduledAt = (i: number) => start + BigInt(Math.round(i * intervalNs));
      while (launched < total) {
        const due = Math.min(total, Math.floor(Number(now() - start) / intervalNs) + 1);
        while (launched < due) {
          const i = launched++;
          const scheduled = scheduledAt(i);
          running.push(
            scenario.op(warmupOps + i).then(
              () => {
                completed++;
                lastCompletion = now();
                latency.record(lastCompletion - scheduled);
              },
              err => {
                completed++;
                lastCompletion = now();
                this.recordError(errors, err);
              }
            )
          );
        }
        if (launched < total) {
          const waitMs = Number(scheduledAt(launched) - now()) / 1e6;
          if (waitMs >= 1) {
            await delay(Math.floor(waitMs));
          } else {
            await new Promise(resolve => setImmediate(resolve));
          }
        }
      }
      let timer: NodeJS.Timeout;
      await Promise.race([
        Promise.all(running),
        new Promise<void>(resolve => {
          timer = setTimeout(resolve, drainTimeoutMs);
        })
      ]);
      clearTimeout(timer);
      const notes: string[] = [];
      if (completed < total) {
        const unfinished = total - completed;
        errors.count += unfinished;
        notes.push(`${unfinished} operations did not complete within ${drainTimeoutMs}ms`);
        lastCompletion = now();
      }
      return { ops: latency.count, durationMs: Number(lastCompletion - start) / 1e6, notes };
    });
  }

  /**
   * Run a custom scenario
   *
   * @param scenario - the scenario
   * @returns the result, undefined when filtered out
   */
  async custom(scenario: CustomScenario): Promise<BenchResult | undefined> {
    return this.execute(scenario, "custom", async (latency, errors) => {
      const start = now();
      const outcome = await scenario.run(latency);
      errors.count += outcome.errors ?? 0;
      return { ...outcome, durationMs: outcome.durationMs ?? Number(now() - start) / 1e6 };
    });
  }

  /**
   * Run a scenario: setup, measure, verify, teardown and build its result
   *
   * @param scenario - the scenario
   * @param mode - how the load is generated
   * @param measure - the measurement
   * @returns the result, undefined when filtered out
   */
  protected async execute(
    scenario: BaseScenario,
    mode: BenchResult["mode"],
    measure: (
      latency: LatencyRecorder,
      errors: ErrorAccumulator
    ) => Promise<CustomScenarioOutcome & { durationMs: number }>
  ): Promise<BenchResult | undefined> {
    if (!this.shouldRun(scenario.name)) {
      return undefined;
    }
    const params = scenario.params ?? {};
    const latency = new LatencyRecorder();
    const errors: ErrorAccumulator = { count: 0, messages: [] };
    const failures: string[] = [];
    const notes: string[] = [];
    const checks: Record<string, string | number | boolean> = {};
    const sampler = new ResourceSampler();
    let outcome: CustomScenarioOutcome & { durationMs: number } = { ops: 0, durationMs: 0 };
    let metricsBefore: Record<string, number> = {};
    let serviceMetrics: Record<string, number> | undefined;
    let resources = new ResourceSampler().start().stop();
    useLog("INFO", `[bench] ${this.options.suite}/${this.options.backend} ${scenario.name} ${JSON.stringify(params)}`);
    try {
      await scenario.setup?.();
      metricsBefore = await snapshotServiceMetrics(this.options.service);
      sampler.start();
      try {
        outcome = await measure(latency, errors);
      } finally {
        resources = sampler.stop();
      }
      serviceMetrics = diffMetrics(metricsBefore, await snapshotServiceMetrics(this.options.service));
      const verified = (await scenario.verify?.()) ?? {};
      Object.assign(checks, outcome.checks, verified.checks);
      failures.push(...(outcome.failures ?? []), ...(verified.failures ?? []));
      notes.push(...(outcome.notes ?? []), ...(verified.notes ?? []));
    } catch (err) {
      failures.push(`scenario failed: ${err?.message ?? err}`);
      useLog("ERROR", `[bench] ${scenario.name} failed`, err);
    } finally {
      try {
        await scenario.teardown?.();
      } catch (err) {
        notes.push(`teardown failed: ${err?.message ?? err}`);
      }
    }
    notes.push(...errors.messages);
    const ops = Math.max(0, outcome.ops);
    const durationMs = Math.round(outcome.durationMs * 1000) / 1000;
    const result: BenchResult = {
      schemaVersion: BENCH_SCHEMA_VERSION,
      suite: this.options.suite,
      backend: this.options.backend,
      scenario: scenario.name,
      params,
      profile: this.profile.name,
      mode,
      emulated: !!this.options.emulated,
      ops,
      errors: errors.count,
      durationMs,
      throughput: durationMs > 0 ? Math.round((ops / durationMs) * 1000 * 100) / 100 : 0,
      latency: latency.summary(),
      resources,
      checks,
      failures,
      unstable: failures.length > 0 || errors.count > (ops + errors.count) * UNSTABLE_ERROR_RATIO,
      notes,
      serviceMetrics,
      env: captureEnv(),
      timestamp: new Date().toISOString()
    };
    this.results.push(result);
    useLog(
      result.unstable ? "WARN" : "INFO",
      `[bench] ${scenario.name} → ${result.throughput} ops/s p50=${result.latency.p50}ms p99=${result.latency.p99}ms` +
        ` errors=${result.errors}${failures.length ? ` failures=${failures.join("; ")}` : ""}`
    );
    return result;
  }

  /**
   * Count an error and keep its message for the first ones
   *
   * @param errors - accumulator
   * @param err - the error
   */
  protected recordError(errors: ErrorAccumulator, err: any): void {
    errors.count++;
    if (errors.messages.length < MAX_ERROR_NOTES) {
      errors.messages.push(`error: ${err?.message ?? err}`);
    }
  }

  /**
   * Send the results to the reporters
   *
   * @returns the results
   */
  async finish(): Promise<BenchResult[]> {
    for (const reporter of this.reporters) {
      await reporter.report(this.results);
    }
    return this.results;
  }
}
