import { resultKey, type BenchResult } from "../result.js";
import { formatNumber } from "./reporter.js";

/**
 * Comparison of one scenario between a baseline and a current run
 */
export interface Comparison {
  /**
   * Result key, see {@link resultKey}
   */
  key: string;
  /**
   * Baseline result
   */
  baseline: BenchResult;
  /**
   * Current result
   */
  current: BenchResult;
  /**
   * current / baseline throughput: below 1 is slower
   */
  throughputRatio: number;
  /**
   * current / baseline p99 latency: above 1 is slower
   */
  p99Ratio: number;
  /**
   * One of the ratios crossed the threshold
   */
  regression: boolean;
}

/**
 * Compare two runs
 *
 * A scenario regresses when its throughput is divided by more than the threshold or its p99 latency multiplied by
 * more than the threshold. Unstable results and scenarios missing on one side are ignored.
 *
 * @param baseline - results of the reference run
 * @param current - results of the run to check
 * @param threshold - tolerated factor, e.g. 1.5 for 50%
 * @returns the comparisons, sorted by key
 */
export function compareResults(baseline: BenchResult[], current: BenchResult[], threshold: number = 1.5): Comparison[] {
  const base = new Map(baseline.filter(r => !r.unstable).map(r => [resultKey(r), r]));
  const comparisons: Comparison[] = [];
  for (const result of current) {
    const key = resultKey(result);
    const reference = base.get(key);
    if (!reference || result.unstable) {
      continue;
    }
    const throughputRatio = reference.throughput > 0 ? result.throughput / reference.throughput : 1;
    const p99Ratio = reference.latency.p99 > 0 ? result.latency.p99 / reference.latency.p99 : 1;
    comparisons.push({
      key,
      baseline: reference,
      current: result,
      throughputRatio,
      p99Ratio,
      regression: throughputRatio * threshold < 1 || p99Ratio > threshold
    });
  }
  return comparisons.sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Render comparisons as a markdown table
 *
 * @param comparisons - the comparisons
 * @returns the markdown
 */
export function comparisonToMarkdown(comparisons: Comparison[]): string {
  if (comparisons.length === 0) {
    return "_No comparable benchmark results._";
  }
  const percent = (ratio: number) => `${ratio >= 1 ? "+" : ""}${formatNumber((ratio - 1) * 100, 1)}%`;
  const lines = [
    "| scenario | ops/s base | ops/s current | Δ ops/s | p99 base | p99 current | Δ p99 | |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |"
  ];
  for (const c of comparisons) {
    lines.push(
      `| ${c.key.replace(/\\/g, "\\\\").replace(/\|/g, "\\|")} | ${formatNumber(c.baseline.throughput, 0)} | ${formatNumber(c.current.throughput, 0)}` +
        ` | ${percent(c.throughputRatio)} | ${c.baseline.latency.p99} | ${c.current.latency.p99} | ${percent(c.p99Ratio)}` +
        ` | ${c.regression ? "⚠️ regression" : ""} |`
    );
  }
  return lines.join("\n");
}
