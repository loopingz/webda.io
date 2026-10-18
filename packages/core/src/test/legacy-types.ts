import type { ModelClass } from "@webda/models";
import * as assert from "node:assert";
import { useApplication } from "../application/hooks.js";
import type { Application } from "../application/application.js";
import { formatMigrationReport, type MigrationReport } from "../stores/migration.js";
import type { Store } from "../stores/store.js";
import { V3Animal, V3Dog, V3Plant, V3Puppy } from "./legacy-types.fixture.model.js";

// This module may be loaded from `src` while the store under test comes from `lib` (store packages alias
// `@webda/core/lib/test`): it never touches the Registry or a class of `@webda/core` directly, only the store
// methods and the fixture models.

/**
 * `models` of a store holding the fixture: two models sharing one table, V3Animal its root
 */
export const LEGACY_TYPE_MODELS = ["Webda/V3Animal", "Webda/V3Plant"];

/**
 * Rows as Webda 3 stored them: short, lower-case, upper-case, aliased, untyped and unknown types, and a type of an
 * ancestor of the table root (`UuidModel`), which belongs to the root like an untyped row
 */
export const LEGACY_TYPE_ROWS: { key: string; data: Record<string, any> }[] = [
  { key: "a1", data: { uuid: "a1", __type: "Webda/V3Animal", name: "current animal" } },
  { key: "a2", data: { uuid: "a2", __type: "V3Animal", name: "short animal" } },
  { key: "a3", data: { uuid: "a3", __type: "webda/v3animal", name: "lower animal" } },
  { key: "a4", data: { uuid: "a4", name: "untyped animal" } },
  { key: "a5", data: { uuid: "a5", __type: "UuidModel", name: "ancestor animal" } },
  { key: "d1", data: { uuid: "d1", __type: "v3dog", name: "lower short dog" } },
  { key: "p1", data: { uuid: "p1", __type: "WEBDA/V3PUPPY", name: "upper puppy" } },
  { key: "p2", data: { uuid: "p2", __type: "Webda/V3Puppy", name: "current puppy" } },
  { key: "g1", data: { uuid: "g1", __type: "Webda/Flora", name: "alias plant" } },
  { key: "g2", data: { uuid: "g2", __type: "Flora", name: "short alias plant" } },
  { key: "g3", data: { uuid: "g3", __type: "Webda/V3Plant", name: "current plant" } },
  { key: "u1", data: { uuid: "u1", __type: "Gone/Model", name: "unknown" } }
];

/**
 * Row whose type matches two models (both declare the alias `Webda/Creature`): ambiguous, so left untouched
 *
 * Not part of {@link LEGACY_TYPE_ROWS}: only the migration check seeds it.
 */
export const LEGACY_TYPE_AMBIGUOUS_ROW = {
  key: "x1",
  data: { uuid: "x1", __type: "Webda/Creature", name: "ambiguous" }
};

/**
 * Totals of a migration report, summed over the tables
 */
export interface LegacyTypeTotals {
  /** Rows read */
  scanned: number;
  /** Rows rewritten */
  updated: number;
  /** Count by change */
  byChange: Record<string, number>;
  /** Untouched rows by stored type */
  unknown: Record<string, number>;
}

/**
 * Exact `types` migration totals over {@link LEGACY_TYPE_ROWS}
 */
export const LEGACY_TYPE_REPORT: LegacyTypeTotals = {
  scanned: 12,
  updated: 8,
  byChange: {
    "(untyped) → Webda/V3Animal": 1,
    "Flora → Webda/V3Plant": 1,
    "UuidModel → Webda/V3Animal": 1,
    "V3Animal → Webda/V3Animal": 1,
    "WEBDA/V3PUPPY → Webda/V3Puppy": 1,
    "Webda/Flora → Webda/V3Plant": 1,
    "v3dog → Webda/V3Dog": 1,
    "webda/v3animal → Webda/V3Animal": 1
  },
  unknown: { "Gone/Model": 1 }
};

/**
 * Register the fixture models in the current application (once), with the runtime Metadata the module loader sets
 */
export function registerLegacyTypeFixtures(): void {
  const app = useApplication() as Application;
  if ((app.getModels()["Webda/V3Animal"] as unknown) === V3Animal) {
    return;
  }
  const metadata = (identifier: string, ancestors: string[], subclasses: ModelClass[], aliases: string[] = []) => ({
    Identifier: identifier,
    Import: "",
    Plural: `${identifier.split("/").pop()}s`,
    Schemas: {},
    Relations: {},
    Ancestors: ancestors,
    Subclasses: subclasses as any,
    PrimaryKey: ["uuid"],
    Events: [],
    Reflection: {},
    Actions: {},
    Aliases: aliases
  });
  const models: [string, any, any][] = [
    ["Webda/V3Puppy", V3Puppy, metadata("Webda/V3Puppy", ["Webda/V3Dog", "Webda/V3Animal"], [])],
    ["Webda/V3Dog", V3Dog, metadata("Webda/V3Dog", ["Webda/V3Animal"], [V3Puppy])],
    ["Webda/V3Animal", V3Animal, metadata("Webda/V3Animal", [], [V3Dog], ["Webda/Creature"])],
    ["Webda/V3Plant", V3Plant, metadata("Webda/V3Plant", [], [], ["Webda/Flora", "Webda/Creature"])]
  ];
  for (const [identifier, clazz, meta] of models) {
    app.addModel(identifier, clazz, meta);
    clazz.registerSerializer(true, identifier);
  }
}

/**
 * Sum a migration report over its tables
 * @param report - the report
 * @returns the totals
 */
export function sumMigrationReport(report: MigrationReport): LegacyTypeTotals {
  const sum: LegacyTypeTotals = { scanned: 0, updated: 0, byChange: {}, unknown: {} };
  for (const table of Object.values(report.tables)) {
    sum.scanned += table.scanned;
    sum.updated += table.updated;
    for (const [change, n] of Object.entries(table.byChange)) {
      sum.byChange[change] = (sum.byChange[change] ?? 0) + n;
    }
    for (const [type, n] of Object.entries(table.unknown)) {
      sum.unknown[type] = (sum.unknown[type] ?? 0) + n;
    }
  }
  return sum;
}

/**
 * What a store package provides to run the legacy types conformance suite
 */
export interface LegacyTypesHarness {
  /**
   * Create, register in the Core, resolve and initialize an empty store of the type under test
   * @param name - unique service name
   * @param models - the `models` parameter
   * @param parameters - extra store parameters (e.g. `table`, `tables`)
   * @returns the store
   */
  createStore(name: string, models: string[], parameters?: Record<string, any>): Promise<Store>;
  /**
   * Write rows exactly as Webda 3 stored them (plain JSON, `__type` as given), bypassing the repositories
   *
   * Inserts or REPLACES any existing row with the same key (an upsert): the migration check re-seeds a row.
   * @param store - the store
   * @param table - the table, from {@link LegacyTypesHarness.tableOf}
   * @param rows - rows by key
   */
  seedRaw(store: Store, table: string, rows: { key: string; data: Record<string, any> }[]): Promise<void>;
  /**
   * Table holding the rows of a model (default: the first raw table of the store)
   * @param store - the store
   * @param model - the model
   * @returns the table name
   */
  tableOf?(store: Store, model: ModelClass): string;
  /**
   * Lease duration of the lease check, in ms: raise it for slow (remote) backends
   *
   * @default 1000
   */
  leaseDuration?: number;
}

/** Store names must be unique: their migration progress is keyed by name */
let storeCounter = 0;

/**
 * @param ms - delay
 * @returns a promise resolved after the delay
 */
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/**
 * @param harness - the harness
 * @param store - the store
 * @returns the table of the fixture rows
 */
function fixtureTable(harness: LegacyTypesHarness, store: Store): string {
  return harness.tableOf ? harness.tableOf(store, V3Animal as any) : store.getRawTables()![0].name;
}

/**
 * Create a store of the fixture models and seed the Webda 3 rows
 * @param harness - the harness
 * @param label - name prefix
 * @returns the store
 */
async function seedLegacyStore(harness: LegacyTypesHarness, label: string): Promise<Store> {
  registerLegacyTypeFixtures();
  const store = await harness.createStore(`LegacyTypes${label}${++storeCounter}`, LEGACY_TYPE_MODELS);
  await harness.seedRaw(store, fixtureTable(harness, store), structuredClone(LEGACY_TYPE_ROWS));
  return store;
}

/**
 * Stored data of every row of a table, as the backend holds it
 * @param store - the store
 * @param table - the table
 * @returns data by key
 */
async function readRawRows(store: Store, table: string): Promise<Record<string, Record<string, any>>> {
  const rows: Record<string, Record<string, any>> = {};
  let token: string | undefined;
  do {
    const page = await store.rawPages(table, 100, token);
    for (const row of page.rows) rows[row.key] = row.data;
    token = page.continuationToken;
  } while (token);
  return rows;
}

/**
 * @param rows - rows by key, from {@link readRawRows}
 * @returns the stored `__type` by key
 */
function typesOf(rows: Record<string, Record<string, any>>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rows).map(([key, data]) => [key, data.__type]));
}

/**
 * @param model - the model
 * @param query - the query
 * @returns the sorted uuids of the query results
 */
async function uuids(model: any, query: string = ""): Promise<string[]> {
  return (await model.query(query)).results.map((item: any) => item.uuid).sort();
}

/**
 * @param model - the model
 * @returns the row count of the model, through the aggregation
 */
async function countOf(model: any): Promise<number> {
  const repository = model.getRepository();
  repository.configureAggregation({ fallback: "allow" });
  return (await repository.aggregate({ metrics: { n: { count: "*" } } })).rows[0].n as number;
}

/**
 * Reads see exactly the rows of each model, as the right class; bulk statements and deletes too
 * @param harness - the harness
 */
export async function checkLegacyTypeVisibility(harness: LegacyTypesHarness): Promise<void> {
  await seedLegacyStore(harness, "Visibility");
  assert.deepStrictEqual(await uuids(V3Animal), ["a1", "a2", "a3", "a4", "a5", "d1", "p1", "p2"]);
  assert.deepStrictEqual(await uuids(V3Dog), ["d1", "p1", "p2"]);
  assert.deepStrictEqual(await uuids(V3Puppy), ["p1", "p2"]);
  assert.deepStrictEqual(await uuids(V3Plant), ["g1", "g2", "g3"]);
  assert.deepStrictEqual(await uuids(V3Animal, "name = 'short animal'"), ["a2"]);
  const animals = Object.fromEntries(((await (V3Animal as any).query("")).results as any[]).map(a => [a.uuid, a]));
  assert.ok(animals.d1 instanceof V3Dog && !(animals.d1 instanceof V3Puppy), "d1 loads as V3Dog");
  assert.ok(animals.p1 instanceof V3Puppy, "p1 loads as V3Puppy");
  assert.strictEqual(animals.a2.constructor, V3Animal);
  assert.strictEqual(animals.p1.__type, "Webda/V3Puppy");
  assert.strictEqual(animals.a3.__type, "Webda/V3Animal");
  // A row typed as an ancestor of the table root loads as the root
  assert.strictEqual(animals.a5.constructor, V3Animal);
  assert.strictEqual(animals.a5.__type, "Webda/V3Animal");
  assert.strictEqual(await countOf(V3Animal), 8);
  assert.strictEqual(await countOf(V3Dog), 3);
  assert.strictEqual(await countOf(V3Plant), 3);
  const iterated: string[] = [];
  for await (const item of (V3Dog as any).iterate("")) iterated.push(item.uuid);
  assert.deepStrictEqual(iterated.sort(), ["d1", "p1", "p2"]);
  // get by key is unfiltered: the resolved class, or the repository model keeping an unknown type
  assert.ok((await (V3Animal as any).ref("d1").get()) instanceof V3Dog);
  const unknown: any = await (V3Animal as any).ref("u1").get();
  assert.strictEqual(unknown.constructor, V3Animal);
  assert.strictEqual(unknown.__type, "Gone/Model");
  // Bulk statements only touch the rows of the model
  assert.strictEqual(await (V3Dog as any).getRepository().updateMany("UPDATE SET name = 'dog' WHERE name != ''"), 3);
  assert.deepStrictEqual(await uuids(V3Animal, "name = 'dog'"), ["d1", "p1", "p2"]);
  assert.strictEqual(
    await (V3Animal as any).getRepository().updateMany("UPDATE SET name = 'ancestor' WHERE name = 'ancestor animal'"),
    1
  );
  assert.deepStrictEqual(await uuids(V3Animal, "name = 'ancestor'"), ["a5"]);
  assert.strictEqual(await (V3Plant as any).getRepository().deleteMany("DELETE WHERE name != ''"), 3);
  assert.deepStrictEqual(await uuids(V3Plant), []);
  assert.deepStrictEqual(await uuids(V3Animal), ["a1", "a2", "a3", "a4", "a5", "d1", "p1", "p2"]);
  // A single delete removes the row of a legacy type, whatever its stored type, and only that row
  await (V3Animal as any).ref("a2").delete();
  await (V3Animal as any).ref("p1").delete();
  assert.deepStrictEqual(await uuids(V3Animal), ["a1", "a3", "a4", "a5", "d1", "p2"]);
  assert.deepStrictEqual(await uuids(V3Dog), ["d1", "p2"]);
}

/**
 * Saving a legacy row writes its current identifier; a subclass row keeps its subclass identifier
 * @param harness - the harness
 */
export async function checkLegacyTypeNormalization(harness: LegacyTypesHarness): Promise<void> {
  const store = await seedLegacyStore(harness, "Normalization");
  const table = fixtureTable(harness, store);
  await (V3Animal as any).ref("a2").patch({ name: "patched" });
  await (V3Animal as any).ref("p1").patch({ name: "patched puppy" });
  await (V3Plant as any).ref("g2").patch({ name: "patched plant" });
  await (V3Animal as any).getRepository().update({ uuid: "a3", name: "updated" });
  await (V3Animal as any).ref("a5").patch({ name: "patched ancestor" });
  const types = typesOf(await readRawRows(store, table));
  assert.strictEqual(types.a2, "Webda/V3Animal");
  assert.strictEqual(types.p1, "Webda/V3Puppy");
  assert.strictEqual(types.g2, "Webda/V3Plant");
  assert.strictEqual(types.a3, "Webda/V3Animal");
  assert.strictEqual(types.a5, "Webda/V3Animal");
  assert.strictEqual(types.u1, "Gone/Model");
  assert.strictEqual(types.a4, undefined);
  const puppy: any = await (V3Animal as any).ref("p1").get();
  assert.ok(puppy instanceof V3Puppy);
  assert.strictEqual(puppy.name, "patched puppy");
}

/**
 * The `types` report is exact; a dry run writes nothing; a second run updates nothing; a Webda 4 envelope keeps its
 * value; an ambiguous type is counted and left alone
 * @param harness - the harness
 */
export async function checkLegacyTypeMigration(harness: LegacyTypesHarness): Promise<void> {
  const store = await seedLegacyStore(harness, "Migration");
  const table = fixtureTable(harness, store);
  await harness.seedRaw(store, table, [structuredClone(LEGACY_TYPE_AMBIGUOUS_ROW)]);
  const expected: LegacyTypeTotals = {
    ...LEGACY_TYPE_REPORT,
    scanned: LEGACY_TYPE_REPORT.scanned + 1,
    unknown: { ...LEGACY_TYPE_REPORT.unknown, [LEGACY_TYPE_AMBIGUOUS_ROW.data.__type]: 1 }
  };
  const before = await readRawRows(store, table);
  const dry = await store.migrateTypes({ dryRun: true, batchSize: 4 });
  assert.strictEqual(dry.dryRun, true);
  assert.deepStrictEqual(sumMigrationReport(dry), expected);
  assert.deepStrictEqual(await readRawRows(store, table), before, "a dry run writes no row");
  assert.strictEqual(await store.getMigrationProgress("types"), undefined, "a dry run writes no progress");
  const report = await store.migrateTypes({ batchSize: 4 });
  assert.strictEqual(report.resumed, false);
  assert.deepStrictEqual(sumMigrationReport(report), expected);
  assert.ok(
    formatMigrationReport(report).split("\n").includes(`    ambiguous ${LEGACY_TYPE_AMBIGUOUS_ROW.data.__type}: 1`),
    "the report lists the ambiguous type"
  );
  const rows = await readRawRows(store, table);
  assert.deepStrictEqual(typesOf(rows), {
    a1: "Webda/V3Animal",
    a2: "Webda/V3Animal",
    a3: "Webda/V3Animal",
    a4: "Webda/V3Animal",
    a5: "Webda/V3Animal",
    d1: "Webda/V3Dog",
    p1: "Webda/V3Puppy",
    p2: "Webda/V3Puppy",
    g1: "Webda/V3Plant",
    g2: "Webda/V3Plant",
    g3: "Webda/V3Plant",
    u1: "Gone/Model",
    x1: "Webda/Creature"
  });
  assert.deepStrictEqual(rows.x1, before.x1, "an ambiguous row is left untouched");
  const progress = (await store.getMigrationProgress("types"))!;
  assert.strictEqual(progress.done, true);
  assert.strictEqual(progress.leaseUntil, 0);
  const again = await store.migrateTypes({ batchSize: 4 });
  assert.deepStrictEqual(sumMigrationReport(again), {
    scanned: expected.scanned,
    updated: 0,
    byChange: {},
    unknown: expected.unknown
  });
  assert.deepStrictEqual(await uuids(V3Dog), ["d1", "p1", "p2"]);

  // A row written by Webda 4 through the repository: only its __type is rewritten
  await (V3Animal as any).getRepository().create({ uuid: "e1", name: "envelope" });
  const envelope = (await readRawRows(store, table)).e1;
  assert.ok(envelope, "e1 was written");
  await harness.seedRaw(store, table, [{ key: "e1", data: { ...structuredClone(envelope), __type: "V3Animal" } }]);
  const enveloped = await store.migrateTypes({ batchSize: 4 });
  assert.deepStrictEqual(sumMigrationReport(enveloped), {
    scanned: expected.scanned + 1,
    updated: 1,
    byChange: { "V3Animal → Webda/V3Animal": 1 },
    unknown: expected.unknown
  });
  assert.deepStrictEqual((await readRawRows(store, table)).e1, envelope, "only the __type changed, back to current");
  const loaded: any = await (V3Animal as any).ref("e1").get();
  assert.strictEqual(loaded.name, "envelope");
}

/**
 * A run interrupted after one page resumes and ends with the same totals
 * @param harness - the harness
 */
export async function checkLegacyTypeResume(harness: LegacyTypesHarness): Promise<void> {
  const store = await seedLegacyStore(harness, "Resume");
  const original = store.rawPages.bind(store);
  let served = 0;
  (store as any).rawPages = async (table: string, batchSize: number, token?: string) => {
    if (served > 0) throw new Error("Interrupted");
    const page = await original(table, batchSize, token);
    served += page.rows.length;
    return page;
  };
  try {
    await assert.rejects(() => store.migrateTypes({ batchSize: 4 }), /Interrupted/);
  } finally {
    delete (store as any).rawPages;
  }
  const interrupted = (await store.getMigrationProgress("types"))!;
  assert.strictEqual(interrupted.done, false);
  assert.strictEqual(interrupted.scanned, 4);
  assert.strictEqual(interrupted.leaseUntil, 0);
  const resumed = await store.migrateTypes({ batchSize: 4 });
  assert.strictEqual(resumed.resumed, true);
  assert.deepStrictEqual(sumMigrationReport(resumed), LEGACY_TYPE_REPORT);
}

/**
 * A second runner fails fast; an expired lease is taken over; the stale runner stops without writing
 *
 * Both runners use a patcher that always patches, so a stale runner that kept writing would be caught.
 * @param harness - the harness
 */
export async function checkLegacyTypeLease(harness: LegacyTypesHarness): Promise<void> {
  const store = await seedLegacyStore(harness, "Lease");
  const table = fixtureTable(harness, store);
  const original = store.rawPages.bind(store);
  let release!: () => void;
  const hung = new Promise<void>(resolve => (release = resolve));
  let served = 0;
  (store as any).rawPages = async (name: string, batchSize: number, token?: string) => {
    if (served > 0) await hung;
    const page = await original(name, batchSize, token);
    served += page.rows.length;
    return page;
  };
  const mark = (runner: string) => () => ({ runner });
  const leaseDuration = harness.leaseDuration ?? 1000;
  let first: Promise<unknown> | undefined;
  let firstError: unknown;
  try {
    first = store.migration("lease", mark("stale"), { batchSize: 4, leaseDuration });
    first.catch(err => (firstError = err));
    let progress = await store.getMigrationProgress("lease");
    const deadline = Date.now() + Math.max(10000, leaseDuration * 5);
    while (!progress?.scanned) {
      if (firstError) throw firstError;
      assert.ok(Date.now() < deadline, "the first runner never saved its first page");
      await pause(5);
      progress = await store.getMigrationProgress("lease");
    }
    await assert.rejects(
      () => store.migration("lease", mark("second"), { batchSize: 4 }),
      (err: any) => err?.code === "MIGRATION_ALREADY_RUNNING"
    );
    await pause(Math.max(0, progress.leaseUntil - Date.now()) + 20);
  } catch (err) {
    release();
    await first?.catch(() => undefined);
    throw err;
  } finally {
    delete (store as any).rawPages;
  }
  const takeover = await store.migration("lease", mark("takeover"), { batchSize: 4 });
  assert.strictEqual(takeover.resumed, true);
  const totals = sumMigrationReport(takeover);
  assert.strictEqual(totals.scanned, LEGACY_TYPE_ROWS.length);
  assert.strictEqual(totals.updated, LEGACY_TYPE_ROWS.length);
  const before = await readRawRows(store, table);
  const runners = Object.values(before).map(data => data.runner);
  assert.strictEqual(runners.filter(runner => runner === "stale").length, 4, "the stale runner wrote its first page");
  assert.strictEqual(runners.filter(runner => runner === "takeover").length, LEGACY_TYPE_ROWS.length - 4);
  release();
  await assert.rejects(first, (err: any) => err?.code === "MIGRATION_ALREADY_RUNNING");
  assert.deepStrictEqual(await readRawRows(store, table), before, "the stale runner writes nothing");
}

/**
 * The startup check WARNs once with the counts; a clean store stays silent
 * @param harness - the harness
 */
export async function checkLegacyTypeStartup(harness: LegacyTypesHarness): Promise<void> {
  const store = await seedLegacyStore(harness, "Startup");
  const warnings: string[] = [];
  (store as any).log = (level: string, ...args: any[]) => {
    const message = args.join(" ");
    if (level === "WARN" && message.includes("legacy, untyped or unknown types")) warnings.push(message);
  };
  try {
    const summary = (await store.checkStoredTypes())!;
    assert.deepStrictEqual(
      { legacy: summary.legacy, untyped: summary.untyped, unknown: summary.unknown, truncated: summary.truncated },
      { legacy: 7, untyped: 1, unknown: 1, truncated: false }
    );
    assert.strictEqual(warnings.length, 1, warnings.join("\n"));
    for (const part of [
      "'V3Animal' → Webda/V3Animal: 1",
      "untyped → Webda/V3Animal: 1",
      "'Flora' → Webda/V3Plant: 1",
      "'UuidModel' → Webda/V3Animal: 1",
      "unknown 'Gone/Model': 1",
      "webda migrate"
    ]) {
      assert.ok(warnings[0].includes(part), `${part} in ${warnings[0]}`);
    }
  } finally {
    delete (store as any).log;
  }
  registerLegacyTypeFixtures();
  const clean = await harness.createStore(`LegacyTypesClean${++storeCounter}`, LEGACY_TYPE_MODELS);
  await harness.seedRaw(
    clean,
    fixtureTable(harness, clean),
    structuredClone(LEGACY_TYPE_ROWS.filter(row => ["a1", "p2", "g3"].includes(row.key)))
  );
  const cleanWarnings: string[] = [];
  (clean as any).log = (level: string, ...args: any[]) => {
    const message = args.join(" ");
    if (level === "WARN" && message.includes("legacy, untyped or unknown types")) cleanWarnings.push(message);
  };
  try {
    const summary = (await clean.checkStoredTypes())!;
    assert.strictEqual(summary.message, undefined);
    assert.deepStrictEqual(cleanWarnings, []);
  } finally {
    delete (clean as any).log;
  }
}

/**
 * Every check of the suite, by name
 */
export const LEGACY_TYPE_CHECKS: { name: string; check: (harness: LegacyTypesHarness) => Promise<void> }[] = [
  { name: "visibility", check: checkLegacyTypeVisibility },
  { name: "normalization", check: checkLegacyTypeNormalization },
  { name: "migration", check: checkLegacyTypeMigration },
  { name: "resume", check: checkLegacyTypeResume },
  { name: "lease", check: checkLegacyTypeLease },
  { name: "startup", check: checkLegacyTypeStartup }
];

/**
 * Run the whole suite
 *
 * A plain function rather than a test suite so store packages share it without duplicating test classes across
 * module resolutions.
 * @param harness - the harness
 * @param options - names of the checks to skip, with a documented reason
 * @param options.skip - check names
 */
export async function checkLegacyTypes(harness: LegacyTypesHarness, options: { skip?: string[] } = {}): Promise<void> {
  for (const { name, check } of LEGACY_TYPE_CHECKS) {
    if (options.skip?.includes(name)) continue;
    await check(harness);
  }
}
