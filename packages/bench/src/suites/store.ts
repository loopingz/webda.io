import type { Store } from "@webda/core";
import { supportsAtomicOperations, type Repository } from "@webda/models";
import { BenchmarkRunner, type ScenarioChecks } from "../runner.js";
import type { BenchProfile, DocumentSize } from "../profile.js";
import type { BenchResult } from "../result.js";
import type { Reporter } from "../reporters/reporter.js";
import { now } from "../stats.js";
import {
  BENCH_DOCUMENT_MODEL,
  BENCH_STATES,
  makeDocument,
  parallel,
  registerBenchFixtures,
  SeededRandom
} from "./fixtures.js";

/**
 * Optional features of a store, scenarios needing a missing one are skipped
 */
export interface StoreBenchCapabilities {
  /**
   * Supports `ORDER BY` in queries
   *
   * @default true
   */
  orderBy?: boolean;
  /**
   * Supports `updateMany` / `deleteMany`
   *
   * @default true
   */
  bulk?: boolean;
  /**
   * Supports atomic operations (`incrementAttribute`, `setAttribute`)
   *
   * @default detected on the repository
   */
  atomic?: boolean;
}

/**
 * What a store package provides to run {@link benchStore}
 *
 * Same shape as `LegacyTypesHarness` of `@webda/core/lib/test`: the package creates its store, the suite does the rest.
 */
export interface StoreBenchHarness {
  /**
   * Backend name displayed in the results: MemoryStore, PostgresStore...
   */
  backend: string;
  /**
   * Create, register in the Core, resolve and initialize an EMPTY store of the type under test
   *
   * @param name - service name
   * @param models - the `models` parameter
   * @returns the store
   */
  createStore(name: string, models: string[]): Promise<Store>;
  /**
   * Remove everything stored, called before and after the suite
   *
   * Without it, the suite deletes the documents it created one by one.
   *
   * @param store - the store
   */
  clean?(store: Store): Promise<void>;
  /**
   * Release the store resources at the end (drop table, stop...)
   *
   * @param store - the store
   */
  dropStore?(store: Store): Promise<void>;
  /**
   * Optional features
   */
  capabilities?: StoreBenchCapabilities;
  /**
   * The backend is an emulator: numbers are for regression tracking only
   */
  emulated?: boolean;
}

/**
 * Options of {@link benchStore}
 */
export interface StoreBenchOptions {
  /**
   * Profile, defaults to `WEBDA_BENCH_PROFILE` or quick
   */
  profile?: BenchProfile;
  /**
   * Scenario filter, defaults to `WEBDA_BENCH_FILTER`
   */
  filter?: (name: string) => boolean;
  /**
   * Reporters, defaults to console and JSON
   */
  reporters?: Reporter[];
  /**
   * Service name of the store
   *
   * @default "BenchStore"
   */
  storeName?: string;
}

/**
 * Page size of the scan scenarios
 */
const PAGE_SIZE = 100;
/**
 * Documents deleted by one deleteMany operation
 */
const BULK_SIZE = 100;
/**
 * Parallelism of the unmeasured seeding and cleaning
 */
const SEED_CONCURRENCY = 20;

/**
 * Benchmark a store through the `Repository` API, the path used by applications
 *
 * For each document size, the suite seeds `profile.dataset` documents then runs, for each concurrency level:
 * get, exists, update, patch, setAttribute, incrementAttribute, upsert, queries (equality, range, IN, ORDER BY),
 * create, delete and a contention scenario (concurrent increments of one document, checking the final counter).
 * Then once: paginated scan, iterate and, in the full profile, updateMany / deleteMany.
 *
 * @param harness - creates the store under test
 * @param options - profile, filter and reporters
 * @returns the results
 */
export async function benchStore(harness: StoreBenchHarness, options: StoreBenchOptions = {}): Promise<BenchResult[]> {
  const model = registerBenchFixtures();
  const store = await harness.createStore(options.storeName ?? "BenchStore", [BENCH_DOCUMENT_MODEL]);
  const runner = new BenchmarkRunner({
    suite: "store",
    backend: harness.backend,
    emulated: harness.emulated,
    profile: options.profile,
    filter: options.filter,
    reporters: options.reporters,
    service: store
  });
  const repo: Repository<any> = store.getRepository(model);
  const capabilities: Required<StoreBenchCapabilities> = {
    orderBy: true,
    bulk: true,
    atomic: supportsAtomicOperations(repo),
    ...harness.capabilities
  };
  const tracked = new Set<string>();
  const clean = async () => {
    if (harness.clean) {
      await harness.clean(store);
    } else {
      const keys = [...tracked];
      await parallel(keys.length, SEED_CONCURRENCY, async i => {
        await repo.delete(keys[i]).catch(() => {});
      });
    }
    tracked.clear();
  };
  try {
    await clean();
    for (const docSize of runner.profile.docSizes) {
      await benchDocumentSize(runner, repo, docSize, capabilities, tracked);
      await clean();
    }
  } finally {
    await clean().catch(() => {});
    await harness.dropStore?.(store);
  }
  return runner.finish();
}

/**
 * Run the store scenarios for one document size
 *
 * @param runner - the runner
 * @param repo - repository of the bench documents
 * @param docSize - document size
 * @param capabilities - store features
 * @param tracked - keys of the documents stored, to clean them
 */
async function benchDocumentSize(
  runner: BenchmarkRunner,
  repo: Repository<any>,
  docSize: DocumentSize,
  capabilities: Required<StoreBenchCapabilities>,
  tracked: Set<string>
): Promise<void> {
  const profile = runner.profile;
  const rng = new SeededRandom(42);
  const keys = Array.from({ length: profile.dataset }, () => rng.uuid());
  const randomKey = () => keys[rng.int(keys.length)];
  await parallel(keys.length, SEED_CONCURRENCY, async i => {
    await repo.create(makeDocument(i, docSize, keys[i]));
    tracked.add(keys[i]);
  });

  for (const concurrency of profile.concurrency) {
    const params = { concurrency, docSize, dataset: profile.dataset };

    await runner.closedLoop({
      name: "store.get",
      params,
      concurrency,
      op: async () => {
        if (!(await repo.get(randomKey()))) {
          throw new Error("document not found");
        }
      }
    });

    await runner.closedLoop({
      name: "store.exists",
      params,
      concurrency,
      op: async index => {
        // Half the lookups target a missing document
        const missing = index % 2 === 1;
        if ((await repo.exists(missing ? rng.uuid() : randomKey())) === missing) {
          throw new Error(`exists should return ${!missing}`);
        }
      }
    });

    await runner.closedLoop({
      name: "store.update",
      params,
      concurrency,
      op: async index => {
        const key = randomKey();
        await repo.update(makeDocument(profile.dataset + index, docSize, key));
      }
    });

    await runner.closedLoop({
      name: "store.patch",
      params,
      concurrency,
      op: index => repo.patch(randomKey(), { order: index, state: BENCH_STATES[index % BENCH_STATES.length] })
    });

    if (capabilities.atomic) {
      await runner.closedLoop({
        name: "store.setAttribute",
        params,
        concurrency,
        op: index => repo.setAttribute(randomKey(), "state", BENCH_STATES[index % BENCH_STATES.length])
      });

      await runner.closedLoop({
        name: "store.incrementAttribute",
        params,
        concurrency,
        op: () => repo.incrementAttribute(randomKey(), "counter")
      });
    }

    await runner.closedLoop({
      name: "store.upsert",
      params,
      concurrency,
      op: async index => {
        // Half the upserts create a document
        const key = index % 2 === 0 ? randomKey() : rng.uuid();
        await repo.upsert(makeDocument(index, docSize, key));
        tracked.add(key);
      }
    });

    const queries: [string, string, boolean][] = [
      ["store.query.eq", `state = "CA" LIMIT ${PAGE_SIZE}`, true],
      ["store.query.range", `team.id > 15 LIMIT ${PAGE_SIZE}`, true],
      ["store.query.in", `state IN ["CA", "NY"] LIMIT ${PAGE_SIZE}`, true],
      ["store.query.orderBy", `state = "CA" ORDER BY order DESC LIMIT 20`, capabilities.orderBy]
    ];
    for (const [name, query, supported] of queries) {
      if (!supported) continue;
      await runner.closedLoop({
        name,
        params,
        concurrency,
        ops: profile.queryOps,
        warmupOps: Math.min(profile.warmupOps, profile.queryOps),
        op: async () => {
          const res = await repo.query(query);
          if (res.results.length === 0) {
            throw new Error(`query '${query}' returned no result`);
          }
        }
      });
    }

    // Created documents are reused by the delete scenario
    const created: string[] = [];
    await runner.closedLoop({
      name: "store.create",
      params,
      concurrency,
      warmupOps: 0,
      op: async index => {
        const key = rng.uuid();
        await repo.create(makeDocument(index, docSize, key));
        tracked.add(key);
        created.push(key);
      }
    });

    await runner.closedLoop({
      name: "store.delete",
      params,
      concurrency,
      warmupOps: 0,
      ops: created.length,
      op: async index => {
        await repo.delete(created[index]);
        tracked.delete(created[index]);
      }
    });

    if (capabilities.atomic && concurrency > 1) {
      const key = rng.uuid();
      let increments = 0;
      await runner.closedLoop({
        name: "store.contention.increment",
        params,
        concurrency,
        warmupOps: 0,
        setup: async () => {
          await repo.create(makeDocument(0, docSize, key));
          tracked.add(key);
        },
        op: async () => {
          await repo.incrementAttribute(key, "counter");
          increments++;
        },
        verify: async (): Promise<ScenarioChecks> => {
          const counter = (await repo.get(key))?.counter;
          return {
            checks: { expectedCounter: increments, finalCounter: counter },
            failures: counter === increments ? [] : [`final counter ${counter}, expected ${increments}`]
          };
        }
      });
    }
  }

  const scanParams = { docSize, dataset: profile.dataset, pageSize: PAGE_SIZE };
  let scanned = 0;
  const verifyScan = async (): Promise<ScenarioChecks> => ({
    checks: { scanned, expected: tracked.size },
    failures: scanned === tracked.size ? [] : [`scanned ${scanned} documents, expected ${tracked.size}`]
  });
  await runner.closedLoop({
    name: "store.query.paginate",
    params: scanParams,
    concurrency: 1,
    ops: profile.scanOps,
    warmupOps: 0,
    op: async () => {
      let count = 0;
      let token: string | undefined;
      do {
        const res = await repo.query(`LIMIT ${PAGE_SIZE}${token ? ` OFFSET "${token}"` : ""}`);
        count += res.results.length;
        token = res.continuationToken;
      } while (token);
      scanned = count;
    },
    verify: verifyScan
  });

  await runner.closedLoop({
    name: "store.iterate",
    params: scanParams,
    concurrency: 1,
    ops: profile.scanOps,
    warmupOps: 0,
    op: async () => {
      let count = 0;
      for await (const _ of repo.iterate(`LIMIT ${PAGE_SIZE}`)) {
        count++;
      }
      scanned = count;
    },
    verify: verifyScan
  });

  if (profile.bulk && capabilities.bulk) {
    let updated = 0;
    await runner.closedLoop({
      name: "store.updateMany",
      params: scanParams,
      concurrency: 1,
      ops: profile.scanOps,
      warmupOps: 0,
      op: async index => {
        updated = await repo.updateMany(`UPDATE SET counter = ${index + 1} WHERE state = "CA"`);
      },
      verify: async () => ({ checks: { updated } })
    });

    await runner.custom({
      name: "store.deleteMany",
      params: { docSize, bulkSize: BULK_SIZE },
      run: async latency => {
        let ops = 0;
        let measuredNs = 0n;
        const failures: string[] = [];
        for (let i = 0; i < profile.scanOps; i++) {
          const bulkKeys = Array.from({ length: BULK_SIZE }, () => rng.uuid());
          await parallel(bulkKeys.length, SEED_CONCURRENCY, async j => {
            await repo.create({ ...makeDocument(j, docSize, bulkKeys[j]), state: "BULK" });
            tracked.add(bulkKeys[j]);
          });
          const start = now();
          const deleted = await repo.deleteMany(`DELETE WHERE state = "BULK"`);
          measuredNs += latency.recordSince(start);
          bulkKeys.forEach(k => tracked.delete(k));
          if (deleted !== BULK_SIZE) {
            failures.push(`deleteMany removed ${deleted} documents, expected ${BULK_SIZE}`);
          }
          ops++;
        }
        // Only the deleteMany calls are measured
        return { ops, failures, durationMs: Number(measuredNs) / 1e6 };
      }
    });
  }
}
