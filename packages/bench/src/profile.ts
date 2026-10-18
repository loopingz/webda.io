/**
 * Size of the generated store documents
 *
 * - small: about 200 bytes
 * - large: about 10 KB
 */
export type DocumentSize = "small" | "large";

/**
 * Sizing of a benchmark run
 *
 * Every suite reads its parameters from the profile so the same bench file can run quickly on a pull request and
 * longer on a nightly build.
 */
export interface BenchProfile {
  /**
   * Profile name
   */
  name: string;
  /**
   * Operations run before measuring, discarded
   */
  warmupOps: number;
  /**
   * Measured operations of a closed-loop scenario
   */
  ops: number;
  /**
   * Measured operations of a query scenario (heavier than a key lookup)
   */
  queryOps: number;
  /**
   * Full scans of the dataset (pagination, iterate)
   */
  scanOps: number;
  /**
   * Maximum duration of one scenario, in ms: the scenario stops early when reached
   */
  maxDurationMs: number;
  /**
   * Concurrency levels of closed-loop scenarios
   */
  concurrency: number[];
  /**
   * Number of documents seeded before the store scenarios
   */
  dataset: number;
  /**
   * Document sizes of the store scenarios
   */
  docSizes: DocumentSize[];
  /**
   * Run bulk scenarios (updateMany, deleteMany)
   */
  bulk: boolean;
  /**
   * Arrival rates of open-loop scenarios, in operations per second
   */
  rates: number[];
  /**
   * Duration of one open-loop scenario, in ms
   */
  openLoopDurationMs: number;
  /**
   * Messages of queue and pub/sub throughput scenarios
   */
  messages: number;
  /**
   * Subscriber counts of the pub/sub fan-out scenario
   */
  fanout: number[];
  /**
   * Payload sizes of the pub/sub payload scenario, in bytes
   */
  payloadSizes: number[];
  /**
   * `maxConsumers` values of the queue consume scenario
   */
  queueMaxConsumers: number[];
  /**
   * Simulated processing time of a consumed message, in ms
   */
  consumeWorkMs: number;
  /**
   * Run the redelivery scenario
   */
  redelivery: boolean;
  /**
   * Maximum time to wait for messages still in flight at the end of a scenario, in ms
   */
  drainTimeoutMs: number;
}

/**
 * Built-in profiles
 *
 * - smoke: a few operations, used by the unit tests of the suites
 * - quick: pull requests, about a minute per backend
 * - full: nightly or manual runs
 */
export const PROFILES: Record<"smoke" | "quick" | "full", BenchProfile> = {
  smoke: {
    name: "smoke",
    warmupOps: 2,
    ops: 20,
    queryOps: 5,
    scanOps: 1,
    maxDurationMs: 5000,
    concurrency: [1, 4],
    dataset: 50,
    docSizes: ["small"],
    bulk: true,
    rates: [200],
    openLoopDurationMs: 200,
    messages: 30,
    fanout: [1, 2],
    payloadSizes: [100, 2000],
    queueMaxConsumers: [1, 3],
    consumeWorkMs: 0,
    redelivery: true,
    drainTimeoutMs: 10000
  },
  quick: {
    name: "quick",
    warmupOps: 50,
    ops: 1000,
    queryOps: 100,
    scanOps: 3,
    maxDurationMs: 10000,
    concurrency: [1, 10],
    dataset: 1000,
    docSizes: ["small"],
    bulk: false,
    rates: [100],
    openLoopDurationMs: 3000,
    messages: 1000,
    fanout: [1, 5],
    payloadSizes: [100, 10240],
    queueMaxConsumers: [1, 10],
    consumeWorkMs: 2,
    redelivery: false,
    drainTimeoutMs: 30000
  },
  full: {
    name: "full",
    warmupOps: 200,
    ops: 10000,
    queryOps: 500,
    scanOps: 5,
    maxDurationMs: 60000,
    concurrency: [1, 10, 50],
    dataset: 10000,
    docSizes: ["small", "large"],
    bulk: true,
    rates: [100, 1000],
    openLoopDurationMs: 10000,
    messages: 10000,
    fanout: [1, 5, 20],
    payloadSizes: [100, 10240, 262144],
    queueMaxConsumers: [1, 5, 10],
    consumeWorkMs: 2,
    redelivery: true,
    drainTimeoutMs: 120000
  }
};

/**
 * Get a profile by name
 *
 * @param name - profile name, defaults to `WEBDA_BENCH_PROFILE` then `quick`
 * @param overrides - values replacing the profile ones
 * @returns the profile
 */
export function resolveProfile(
  name: string = process.env.WEBDA_BENCH_PROFILE || "quick",
  overrides: Partial<BenchProfile> = {}
): BenchProfile {
  const profile = PROFILES[name as keyof typeof PROFILES];
  if (!profile) {
    throw new Error(`Unknown benchmark profile '${name}', expected one of ${Object.keys(PROFILES).join(", ")}`);
  }
  return { ...profile, ...overrides };
}

/**
 * Build a scenario filter from a comma separated list of patterns, `*` matching any characters
 *
 * `store.get,queue.*` runs `store.get` and every queue scenario. An empty filter runs everything.
 *
 * @param filter - patterns, defaults to `WEBDA_BENCH_FILTER`
 * @returns a function telling if a scenario must run
 */
export function scenarioFilter(filter: string | undefined = process.env.WEBDA_BENCH_FILTER): (name: string) => boolean {
  const patterns = (filter || "")
    .split(",")
    .map(p => p.trim())
    .filter(p => p !== "");
  if (patterns.length === 0) {
    return () => true;
  }
  const regexps = patterns.map(
    p => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$")
  );
  return (name: string) => regexps.some(r => r.test(name));
}
