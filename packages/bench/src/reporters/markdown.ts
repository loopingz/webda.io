import { appendFileSync } from "node:fs";
import type { BenchResult } from "../result.js";
import { RESULT_COLUMNS, type Reporter } from "./reporter.js";

/**
 * Render results as a markdown table
 *
 * @param results - the results
 * @param title - optional title
 * @returns the markdown
 */
export function toMarkdown(results: BenchResult[], title?: string): string {
  const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
  const lines: string[] = [];
  if (title) {
    lines.push(`## ${title}`, "");
  }
  if (results.length === 0) {
    lines.push("_No benchmark results._");
    return lines.join("\n");
  }
  lines.push(`| ${RESULT_COLUMNS.map(c => c.title).join(" | ")} |`);
  lines.push(`| ${RESULT_COLUMNS.map(c => (c.align === "right" ? "---:" : "---")).join(" | ")} |`);
  for (const result of results) {
    lines.push(`| ${RESULT_COLUMNS.map(c => escape(c.value(result))).join(" | ")} |`);
  }
  const env = results[0].env;
  lines.push(
    "",
    `_Node ${env.node} on ${env.platform}/${env.arch}, ${env.cpuCount} × ${env.cpu}` +
      `${env.commit ? `, commit ${env.commit.substring(0, 8)}` : ""}, profile ${results[0].profile}._`
  );
  const unstable = results.filter(r => r.unstable);
  if (unstable.length) {
    lines.push("", "**Unstable results**", "");
    for (const result of unstable) {
      lines.push(`- \`${result.backend} ${result.scenario}\`: ${[...result.failures, ...result.notes].join("; ")}`);
    }
  }
  return lines.join("\n");
}

/**
 * Append the results to the GitHub step summary (`GITHUB_STEP_SUMMARY`) when available
 */
export class MarkdownReporter implements Reporter {
  /**
   * @param file - markdown file to append to, defaults to `GITHUB_STEP_SUMMARY`
   * @param title - title of the table
   */
  constructor(
    protected file: string | undefined = process.env.GITHUB_STEP_SUMMARY,
    protected title: string = "Webda benchmarks"
  ) {}

  /**
   * @override
   */
  report(results: BenchResult[]): void {
    if (!this.file || results.length === 0) {
      return;
    }
    appendFileSync(this.file, toMarkdown(results, this.title) + "\n\n");
  }
}
