import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BENCH_SCHEMA_VERSION, type BenchResult, type BenchResultsFile } from "../result.js";
import type { Reporter } from "./reporter.js";

/**
 * Default output folder of the results
 *
 * @returns `WEBDA_BENCH_OUTPUT` or `<cwd>/bench-results`
 */
export function defaultOutputDir(): string {
  return resolve(process.env.WEBDA_BENCH_OUTPUT || join(process.cwd(), "bench-results"));
}

/**
 * Write the results as JSON, one file per suite and backend: `<suite>-<backend>.json`
 */
export class JsonReporter implements Reporter {
  /**
   * @param outputDir - folder of the results
   */
  constructor(protected outputDir: string = defaultOutputDir()) {}

  /**
   * @override
   */
  report(results: BenchResult[]): void {
    const groups = new Map<string, BenchResult[]>();
    for (const result of results) {
      const file = `${result.suite}-${result.backend}`.replace(/[^a-zA-Z0-9_.-]/g, "_") + ".json";
      groups.set(file, [...(groups.get(file) ?? []), result]);
    }
    if (groups.size === 0) {
      return;
    }
    mkdirSync(this.outputDir, { recursive: true });
    for (const [file, group] of groups) {
      const content: BenchResultsFile = { schemaVersion: BENCH_SCHEMA_VERSION, results: group };
      writeFileSync(join(this.outputDir, file), JSON.stringify(content, undefined, 2));
    }
  }
}

/**
 * Load the results of JSON files
 *
 * @param paths - files or folders, folders are read recursively
 * @returns the results of every file with a compatible schema version
 */
export function loadResults(paths: string[]): BenchResult[] {
  const results: BenchResult[] = [];
  const visit = (path: string) => {
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) {
        if (entry !== "node_modules") visit(join(path, entry));
      }
      return;
    }
    if (!path.endsWith(".json")) {
      return;
    }
    try {
      const content: BenchResultsFile = JSON.parse(readFileSync(path).toString());
      if (content?.schemaVersion === BENCH_SCHEMA_VERSION && Array.isArray(content.results)) {
        results.push(...content.results);
      }
    } catch {
      // Not a results file
    }
  };
  paths.forEach(visit);
  return results;
}
