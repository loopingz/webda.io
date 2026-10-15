import { mkdirSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
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
 *
 * Several runners of the same process writing the same file (e.g. two suites of one bench file) are merged; a file
 * left by a previous process is replaced.
 */
export class JsonReporter implements Reporter {
  /**
   * Results written by this process, by file
   */
  protected static written = new Map<string, BenchResult[]>();

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
      const path = join(this.outputDir, file);
      const results = [...(JsonReporter.written.get(path) ?? []), ...group];
      JsonReporter.written.set(path, results);
      const content: BenchResultsFile = { schemaVersion: BENCH_SCHEMA_VERSION, results };
      writeFileSync(path, JSON.stringify(content, undefined, 2));
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
  const readFile = (path: string) => {
    if (!path.endsWith(".json")) {
      return;
    }
    try {
      const content: BenchResultsFile = JSON.parse(readFileSync(path).toString());
      if (content?.schemaVersion === BENCH_SCHEMA_VERSION && Array.isArray(content.results)) {
        results.push(...content.results);
      }
    } catch {
      // Missing or not a results file
    }
  };
  // Read directly instead of checking first: no window between a check and the use of the path
  const visit = (path: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(path, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOTDIR") {
        readFile(path);
      }
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() && entry.name !== "node_modules") {
        visit(join(path, entry.name));
      } else if (entry.isFile()) {
        readFile(join(path, entry.name));
      }
    }
  };
  paths.forEach(visit);
  return results;
}
