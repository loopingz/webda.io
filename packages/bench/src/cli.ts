import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { toTextTable } from "./reporters/console.js";
import { compareResults, comparisonToMarkdown } from "./reporters/compare.js";
import { toGithubBenchmark } from "./reporters/github-benchmark.js";
import { loadResults } from "./reporters/json.js";
import { toMarkdown } from "./reporters/markdown.js";

/**
 * Parsed command line
 */
export interface CliArguments {
  /**
   * Command: report or compare
   */
  command: string;
  /**
   * Positional arguments
   */
  positionals: string[];
  /**
   * Options: --name value or --flag
   */
  options: Record<string, string | boolean>;
}

/**
 * Usage of the command
 */
export const USAGE = `Usage:
  webda-bench report <paths...> [--markdown <file>] [--summary] [--github-benchmark <prefix>]
      Merge the JSON results found in <paths> (files or folders), print them as a table.
      --markdown <file>          write the markdown table to a file
      --summary                  append the markdown table to $GITHUB_STEP_SUMMARY
      --github-benchmark <prefix> write <prefix>-bigger.json (throughput) and <prefix>-smaller.json (p99)
                                 for benchmark-action/github-action-benchmark

  webda-bench compare <baseline> <current> [--threshold 1.5] [--markdown <file>] [--summary] [--fail]
      Compare two sets of results; a scenario regresses when its throughput is divided or its p99 multiplied
      by more than the threshold. --fail exits with code 1 on regression.
`;

/**
 * Parse the command line
 *
 * @param argv - arguments after the script name
 * @returns the parsed arguments
 */
export function parseArguments(argv: string[]): CliArguments {
  const [command = "help", ...rest] = argv;
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg.startsWith("--")) {
      const [name, inline] = arg.substring(2).split("=", 2);
      if (inline !== undefined) {
        options[name] = inline;
      } else if (rest[i + 1] !== undefined && !rest[i + 1].startsWith("--") && !["summary", "fail"].includes(name)) {
        options[name] = rest[++i];
      } else {
        options[name] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { command, positionals, options };
}

/**
 * Write a file, creating its folder
 *
 * @param file - path
 * @param content - content
 */
function writeOutput(file: string, content: string): void {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, content);
}

/**
 * Output markdown as requested by the options
 *
 * @param markdown - the markdown
 * @param options - command options
 */
function outputMarkdown(markdown: string, options: CliArguments["options"]): void {
  if (typeof options.markdown === "string") {
    writeOutput(options.markdown, markdown + "\n");
  }
  if (options.summary && process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n\n");
  }
}

/**
 * Run the command
 *
 * @param argv - arguments after the script name
 * @param log - output function
 * @returns the exit code
 */
export function main(argv: string[], log: (text: string) => void = text => console.log(text)): number {
  const { command, positionals, options } = parseArguments(argv);
  if (command === "report") {
    const results = loadResults(positionals.length ? positionals : ["bench-results"]);
    log(results.length ? toTextTable(results) : "No benchmark results found");
    outputMarkdown(toMarkdown(results, "Webda benchmarks"), options);
    if (typeof options["github-benchmark"] === "string") {
      const { biggerIsBetter, smallerIsBetter } = toGithubBenchmark(results);
      writeOutput(`${options["github-benchmark"]}-bigger.json`, JSON.stringify(biggerIsBetter, undefined, 2));
      writeOutput(`${options["github-benchmark"]}-smaller.json`, JSON.stringify(smallerIsBetter, undefined, 2));
    }
    return 0;
  }
  if (command === "compare") {
    if (positionals.length !== 2) {
      log(USAGE);
      return 2;
    }
    const threshold = typeof options.threshold === "string" ? Number.parseFloat(options.threshold) : 1.5;
    if (!(threshold >= 1)) {
      log(`Invalid threshold '${options.threshold}': expected a number >= 1`);
      return 2;
    }
    const comparisons = compareResults(loadResults([positionals[0]]), loadResults([positionals[1]]), threshold);
    const markdown = comparisonToMarkdown(comparisons);
    log(markdown);
    outputMarkdown(`## Webda benchmarks comparison (threshold ×${threshold})\n\n${markdown}`, options);
    const regressions = comparisons.filter(c => c.regression);
    if (regressions.length) {
      log(`${regressions.length} regression(s): ${regressions.map(r => r.key).join(", ")}`);
      return options.fail ? 1 : 0;
    }
    return 0;
  }
  log(USAGE);
  return command === "help" || command === "--help" ? 0 : 2;
}
