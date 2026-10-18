import type { BenchResult } from "../result.js";
import { RESULT_COLUMNS, type Reporter } from "./reporter.js";

/**
 * Render results as a text table
 *
 * @param results - the results
 * @returns the table
 */
export function toTextTable(results: BenchResult[]): string {
  const rows = results.map(r => RESULT_COLUMNS.map(c => c.value(r)));
  const widths = RESULT_COLUMNS.map((c, i) => Math.max(c.title.length, ...rows.map(row => row[i].length)));
  const line = (cells: string[]) =>
    cells
      .map((cell, i) => (RESULT_COLUMNS[i].align === "right" ? cell.padStart(widths[i]) : cell.padEnd(widths[i])))
      .join("  ")
      .trimEnd();
  const output = [line(RESULT_COLUMNS.map(c => c.title)), widths.map(w => "-".repeat(w)).join("  "), ...rows.map(line)];
  for (const result of results.filter(r => r.failures.length || r.notes.length)) {
    output.push(
      `  ${result.scenario} ${JSON.stringify(result.params)}: ${[...result.failures, ...result.notes].join("; ")}`
    );
  }
  return output.join("\n");
}

/**
 * Print the results as a table
 *
 * The table is a report, not a log line: it is written as is (console by default) so it stays readable in the
 * vitest output and the CI logs.
 */
export class ConsoleReporter implements Reporter {
  /**
   * @param write - output function
   */
  constructor(protected write: (text: string) => void = text => console.log(text)) {}

  /**
   * @override
   */
  report(results: BenchResult[]): void {
    if (results.length === 0) {
      return;
    }
    this.write(`\n${toTextTable(results)}\n`);
  }
}
