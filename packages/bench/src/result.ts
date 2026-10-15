/**
 * Version of the {@link BenchResult} JSON format
 *
 * Increase it on breaking changes so the comparison tool can refuse to compare incompatible results.
 */
export const BENCH_SCHEMA_VERSION = 1;

/**
 * Latency distribution, in milliseconds
 */
export interface LatencySummary {
  /**
   * Number of recorded samples
   */
  count: number;
  /**
   * Minimum
   */
  min: number;
  /**
   * Mean
   */
  mean: number;
  /**
   * Standard deviation
   */
  stddev: number;
  /**
   * Median
   */
  p50: number;
  /**
   * 90th percentile
   */
  p90: number;
  /**
   * 99th percentile
   */
  p99: number;
  /**
   * 99.9th percentile
   */
  p999: number;
  /**
   * Maximum
   */
  max: number;
}

/**
 * Resources used by the process during a scenario
 */
export interface ResourceSummary {
  /**
   * User CPU time, in ms
   */
  cpuUserMs: number;
  /**
   * System CPU time, in ms
   */
  cpuSystemMs: number;
  /**
   * RSS at the end minus RSS at the start, in bytes
   */
  rssDeltaBytes: number;
  /**
   * Heap used at the end minus heap used at the start, in bytes
   */
  heapUsedDeltaBytes: number;
  /**
   * Event loop delay, in ms
   */
  eventLoopDelay: {
    /**
     * Median
     */
    p50: number;
    /**
     * 99th percentile
     */
    p99: number;
    /**
     * Maximum
     */
    max: number;
  };
}

/**
 * Environment the benchmark ran in
 */
export interface BenchEnv {
  /**
   * Node.js version
   */
  node: string;
  /**
   * Operating system platform
   */
  platform: string;
  /**
   * CPU architecture
   */
  arch: string;
  /**
   * CPU model
   */
  cpu: string;
  /**
   * Number of logical CPUs
   */
  cpuCount: number;
  /**
   * Total memory, in bytes
   */
  totalMemoryBytes: number;
  /**
   * Git commit, when known
   */
  commit?: string;
  /**
   * Running in a CI
   */
  ci: boolean;
}

/**
 * Parameter values of a scenario
 */
export type BenchParams = Record<string, string | number | boolean>;

/**
 * Result of one scenario run with one set of parameters
 */
export interface BenchResult {
  /**
   * Format version, see {@link BENCH_SCHEMA_VERSION}
   */
  schemaVersion: number;
  /**
   * Suite: store, queue, pubsub, blog...
   */
  suite: string;
  /**
   * Backend name: MemoryStore, PostgresStore...
   */
  backend: string;
  /**
   * Scenario name, prefixed by the suite: store.get, queue.consume...
   */
  scenario: string;
  /**
   * Parameters of the run: concurrency, docSize...
   */
  params: BenchParams;
  /**
   * Profile used
   */
  profile: string;
  /**
   * How the load was generated
   *
   * - closed: N workers waiting for each operation, measures throughput
   * - open: operations started at a fixed rate, latency measured from the scheduled start (no coordinated omission)
   * - custom: the scenario measures itself
   */
  mode: "closed" | "open" | "custom";
  /**
   * The backend is an emulator (localstack, GCP emulators): numbers are for regression tracking only
   */
  emulated: boolean;
  /**
   * Successful operations
   */
  ops: number;
  /**
   * Failed operations
   */
  errors: number;
  /**
   * Measured duration, in ms
   */
  durationMs: number;
  /**
   * Successful operations per second
   */
  throughput: number;
  /**
   * Latency of the successful operations
   */
  latency: LatencySummary;
  /**
   * Process resources
   */
  resources: ResourceSummary;
  /**
   * Correctness values: lost, duplicated, finalCounter...
   */
  checks: Record<string, string | number | boolean>;
  /**
   * Failed correctness checks
   */
  failures: string[];
  /**
   * More than 1% of errors or a failed check: the numbers are not reliable
   */
  unstable: boolean;
  /**
   * Free-form notes: first error messages, skipped variants...
   */
  notes: string[];
  /**
   * Webda metrics of the service under test, delta over the scenario
   */
  serviceMetrics?: Record<string, number>;
  /**
   * Environment
   */
  env: BenchEnv;
  /**
   * ISO date of the run
   */
  timestamp: string;
}

/**
 * Content of a results file
 */
export interface BenchResultsFile {
  /**
   * Format version
   */
  schemaVersion: number;
  /**
   * Results
   */
  results: BenchResult[];
}

/**
 * Unique key of a result, used to compare runs
 *
 * @param result - the result
 * @returns `suite/backend/scenario` followed by the sorted parameters
 */
export function resultKey(result: Pick<BenchResult, "suite" | "backend" | "scenario" | "params">): string {
  const params = Object.keys(result.params)
    .sort()
    .map(k => `${k}=${result.params[k]}`)
    .join(",");
  return `${result.suite}/${result.backend}/${result.scenario}${params ? `[${params}]` : ""}`;
}
