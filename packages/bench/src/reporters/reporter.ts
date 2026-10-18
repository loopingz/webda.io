import type { BenchResult } from "../result.js";

/**
 * Receive the results of a benchmark run
 */
export interface Reporter {
  /**
   * Report the results
   *
   * @param results - results of the run
   */
  report(results: BenchResult[]): void | Promise<void>;
}

/**
 * Format a number with a fixed number of significant decimals
 *
 * @param value - the number
 * @param decimals - decimals to keep
 * @returns the formatted number
 */
export function formatNumber(value: number, decimals: number = 2): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals, minimumFractionDigits: 0 });
}

/**
 * Format the parameters of a result
 *
 * @param params - the parameters
 * @returns `key=value` pairs separated by spaces
 */
export function formatParams(params: BenchResult["params"]): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
}

/**
 * Flags of a result
 *
 * @param result - the result
 * @returns `unstable`, `emulated` or an empty string
 */
export function formatFlags(result: BenchResult): string {
  return [result.unstable ? "unstable" : "", result.emulated ? "emulated" : ""].filter(f => f).join(",");
}

/**
 * Columns of the results tables
 */
export const RESULT_COLUMNS: { title: string; value: (r: BenchResult) => string; align?: "right" }[] = [
  { title: "suite", value: r => r.suite },
  { title: "backend", value: r => r.backend },
  { title: "scenario", value: r => r.scenario },
  { title: "params", value: r => formatParams(r.params) },
  { title: "ops/s", value: r => formatNumber(r.throughput, 0), align: "right" },
  { title: "p50 ms", value: r => formatNumber(r.latency.p50, 3), align: "right" },
  { title: "p99 ms", value: r => formatNumber(r.latency.p99, 3), align: "right" },
  { title: "max ms", value: r => formatNumber(r.latency.max, 3), align: "right" },
  { title: "ops", value: r => String(r.ops), align: "right" },
  { title: "errors", value: r => String(r.errors), align: "right" },
  { title: "flags", value: r => formatFlags(r) }
];
