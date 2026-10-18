/**
 * Options of {@link benchVitestOptions}
 */
export interface BenchVitestOptions {
  /**
   * Bench files to run
   *
   * @default ["src/**\/*.bench.ts"]
   */
  include?: string[];
  /**
   * Maximum duration of one bench file, in ms
   *
   * @default 1800000 (30 minutes)
   */
  timeout?: number;
}

/**
 * Vitest `test` options to run `*.bench.ts` files
 *
 * Benchmarks run as regular vitest files so they reuse the Webda test harness (`WebdaApplicationTest`, `addService`,
 * the content mapper plugin...). They must not run in parallel, nor with coverage, to keep measurements stable.
 *
 * Usage in a package `vitest.bench.config.ts`:
 *
 * ```ts
 * import { defineConfig } from "vite";
 * import { benchVitestOptions } from "@webda/bench/lib/vitest.js";
 * export default defineConfig({ test: benchVitestOptions() });
 * ```
 *
 * @param options - include patterns and timeout
 * @returns the vitest `test` options
 */
export function benchVitestOptions(options: BenchVitestOptions = {}) {
  const timeout = options.timeout ?? 30 * 60 * 1000;
  return {
    include: options.include ?? ["src/**/*.bench.ts"],
    // Benchmarks must not compete with each other for the CPU
    fileParallelism: false,
    pool: "forks" as const,
    testTimeout: timeout,
    hookTimeout: timeout,
    passWithNoTests: true,
    allowOnly: true,
    reporters: "verbose",
    coverage: { enabled: false }
  };
}
