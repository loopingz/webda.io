import { resultKey, type BenchResult } from "../result.js";

/**
 * Entry of the `customBiggerIsBetter` / `customSmallerIsBetter` formats of
 * [github-action-benchmark](https://github.com/benchmark-action/github-action-benchmark)
 */
export interface GithubBenchmarkEntry {
  /**
   * Benchmark name, unique across runs
   */
  name: string;
  /**
   * Unit of the value
   */
  unit: string;
  /**
   * Value
   */
  value: number;
  /**
   * Variation, displayed next to the value
   */
  range?: string;
  /**
   * Tooltip
   */
  extra?: string;
}

/**
 * Convert results to the github-action-benchmark formats
 *
 * The action accepts one tool per file: throughput goes to `customBiggerIsBetter`, p99 latency to
 * `customSmallerIsBetter`. Unstable results are excluded so they do not trigger false alerts.
 *
 * @param results - the results
 * @returns the entries of both files
 */
export function toGithubBenchmark(results: BenchResult[]): {
  biggerIsBetter: GithubBenchmarkEntry[];
  smallerIsBetter: GithubBenchmarkEntry[];
} {
  const stable = results.filter(r => !r.unstable && r.ops > 0);
  const extra = (r: BenchResult) =>
    `ops=${r.ops} errors=${r.errors} p50=${r.latency.p50}ms max=${r.latency.max}ms${r.emulated ? " emulated" : ""}`;
  return {
    biggerIsBetter: stable.map(r => ({
      name: `${resultKey(r)} throughput`,
      unit: "ops/s",
      value: r.throughput,
      extra: extra(r)
    })),
    smallerIsBetter: stable.map(r => ({
      name: `${resultKey(r)} p99`,
      unit: "ms",
      value: r.latency.p99,
      range: `± ${r.latency.stddev}`,
      extra: extra(r)
    }))
  };
}
