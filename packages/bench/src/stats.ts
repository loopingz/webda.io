import { execSync } from "node:child_process";
import { cpus, totalmem } from "node:os";
import { createHistogram, monitorEventLoopDelay, type RecordableHistogram } from "node:perf_hooks";
import type { BenchEnv, LatencySummary, ResourceSummary } from "./result.js";

/**
 * Nanoseconds to milliseconds, rounded to the microsecond
 *
 * @param ns - nanoseconds
 * @returns milliseconds
 */
export function nsToMs(ns: number): number {
  return Math.round(ns / 1000) / 1000;
}

/**
 * Current high-resolution time, in nanoseconds
 *
 * @returns the time
 */
export function now(): bigint {
  return process.hrtime.bigint();
}

/**
 * Record latencies in a native histogram (`perf_hooks.createHistogram`)
 */
export class LatencyRecorder {
  /**
   * Native histogram, in nanoseconds
   */
  protected histogram: RecordableHistogram = createHistogram();

  /**
   * Record a duration
   *
   * @param ns - duration in nanoseconds; values below 1 are recorded as 1
   */
  record(ns: bigint | number): void {
    const value = typeof ns === "bigint" ? ns : BigInt(Math.round(ns));
    this.histogram.record(value < 1n ? 1n : value);
  }

  /**
   * Record the duration since a start time
   *
   * @param start - start time from {@link now}
   * @returns the duration in nanoseconds
   */
  recordSince(start: bigint): bigint {
    const duration = now() - start;
    this.record(duration);
    return duration;
  }

  /**
   * Record a duration in milliseconds
   *
   * @param ms - duration in milliseconds
   */
  recordMs(ms: number): void {
    this.record(Math.round(ms * 1e6));
  }

  /**
   * Number of recorded samples
   *
   * @returns the count
   */
  get count(): number {
    return this.histogram.count;
  }

  /**
   * Forget the recorded samples
   */
  reset(): void {
    this.histogram.reset();
  }

  /**
   * Summary of the distribution
   *
   * @returns the summary in milliseconds, all zero when nothing was recorded
   */
  summary(): LatencySummary {
    const h = this.histogram;
    if (h.count === 0) {
      return { count: 0, min: 0, mean: 0, stddev: 0, p50: 0, p90: 0, p99: 0, p999: 0, max: 0 };
    }
    return {
      count: h.count,
      min: nsToMs(h.min),
      mean: nsToMs(h.mean),
      stddev: nsToMs(h.stddev),
      p50: nsToMs(h.percentile(50)),
      p90: nsToMs(h.percentile(90)),
      p99: nsToMs(h.percentile(99)),
      p999: nsToMs(h.percentile(99.9)),
      max: nsToMs(h.max)
    };
  }
}

/**
 * Sample the process resources (CPU, memory, event loop delay) between {@link start} and {@link stop}
 */
export class ResourceSampler {
  /**
   * CPU usage at start
   */
  protected cpu: NodeJS.CpuUsage;
  /**
   * Memory usage at start
   */
  protected memory: NodeJS.MemoryUsage;
  /**
   * Event loop delay monitor
   */
  protected loop = monitorEventLoopDelay({ resolution: 10 });

  /**
   * Start sampling
   *
   * @returns this for chaining
   */
  start(): this {
    this.cpu = process.cpuUsage();
    this.memory = process.memoryUsage();
    this.loop.reset();
    this.loop.enable();
    return this;
  }

  /**
   * Stop sampling
   *
   * @returns the resources used since {@link start}
   */
  stop(): ResourceSummary {
    this.loop.disable();
    const cpu = process.cpuUsage(this.cpu);
    const memory = process.memoryUsage();
    const hasSamples = this.loop.count > 0;
    return {
      cpuUserMs: Math.round(cpu.user / 1000),
      cpuSystemMs: Math.round(cpu.system / 1000),
      rssDeltaBytes: memory.rss - this.memory.rss,
      heapUsedDeltaBytes: memory.heapUsed - this.memory.heapUsed,
      eventLoopDelay: {
        p50: hasSamples ? nsToMs(this.loop.percentile(50)) : 0,
        p99: hasSamples ? nsToMs(this.loop.percentile(99)) : 0,
        max: hasSamples ? nsToMs(this.loop.max) : 0
      }
    };
  }
}

let commit: string | undefined | null = null;

/**
 * Git commit of the working directory
 *
 * @returns `GITHUB_SHA`, else `git rev-parse HEAD`, else undefined
 */
export function gitCommit(): string | undefined {
  if (commit === null) {
    commit = process.env.GITHUB_SHA;
    if (!commit) {
      try {
        commit = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim();
      } catch {
        commit = undefined;
      }
    }
  }
  return commit || undefined;
}

/**
 * Describe the environment
 *
 * @returns the environment
 */
export function captureEnv(): BenchEnv {
  const cpuList = cpus();
  return {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: cpuList[0]?.model?.trim() ?? "unknown",
    cpuCount: cpuList.length,
    totalMemoryBytes: totalmem(),
    commit: gitCommit(),
    ci: !!process.env.CI
  };
}

/**
 * Wait for a delay
 *
 * @param ms - delay in milliseconds
 * @returns a promise resolved after the delay
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for a promise, at most a delay
 *
 * The timer is cleared once the promise settles, so no timer outlives the wait.
 *
 * @param promise - the promise
 * @param ms - maximum wait in milliseconds
 * @returns the value of the promise, undefined on timeout or rejection
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise.catch((): undefined => undefined),
      new Promise<undefined>(resolve => {
        timer = setTimeout(() => resolve(undefined), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}
