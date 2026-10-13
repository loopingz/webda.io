import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useApplication, useModel } from "../application/hooks.js";
import { MemoryStore } from "./memory.service.js";
import { sleep } from "@webda/utils";
import { useCore } from "../core/hooks.js";
import { useRegistry } from "../models/registry.model.js";
import { Store } from "./store.js";
import {
  DEFAULT_MIGRATION_BATCH,
  DEFAULT_TYPE_CHECK_ROWS,
  formatMigrationReport,
  mapRawPage,
  mapRawPatch,
  parseRawValue,
  scanRawRows,
  type MigrationPatcher,
  type RawPage,
  type RawTable
} from "./migration.js";
import {
  LEGACY_TYPE_MODELS,
  LEGACY_TYPE_REPORT,
  LEGACY_TYPE_ROWS,
  registerLegacyTypeFixtures,
  sumMigrationReport
} from "../test/legacy-types.js";

@suite
class MemoryRawAccessTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * @returns a store holding a Webda 3 plain row, a Webda 4 envelope and an untyped row
   */
  rawStore(): MemoryStore {
    const store = new MemoryStore("raw", { models: ["Webda/RegistryEntry"] } as any);
    store.storage.set("b", JSON.stringify({ uuid: "b", __type: "User" }));
    store.storage.set("a", JSON.stringify({ $serializer: { type: "x" }, value: { uuid: "a" }, __type: "Webda/User" }));
    store.storage.set("c", JSON.stringify({ uuid: "c" }));
    return store;
  }

  @test
  async pagesEveryRowInKeyOrder() {
    const store = this.rawStore();
    const first = await store.rawPages("raw", 2);
    assert.deepStrictEqual(
      first.rows.map(row => row.key),
      ["a", "b"]
    );
    assert.strictEqual(first.rows[0].table, "raw");
    assert.strictEqual(first.rows[0].data.__type, "Webda/User");
    assert.strictEqual(first.rows[1].data.__type, "User");
    assert.strictEqual(first.continuationToken, "b");
    // The token is the last key: a row deleted meanwhile does not shift the next page
    store.storage.delete("a");
    const second = await store.rawPages("raw", 2, first.continuationToken);
    assert.deepStrictEqual(
      second.rows.map(row => row.key),
      ["c"]
    );
    assert.strictEqual(second.continuationToken, undefined);
  }

  @test
  async patchMergesTopLevelFields() {
    const store = this.rawStore();
    await store.rawPatch("raw", "a", { __type: "WebdaDemo/User" });
    assert.deepStrictEqual(JSON.parse(store.storage.get("a")!), {
      $serializer: { type: "x" },
      value: { uuid: "a" },
      __type: "WebdaDemo/User"
    });
    await assert.rejects(() => store.rawPatch("raw", "missing", { __type: "x" }), /Raw row not found: missing/);
    await assert.rejects(() => store.rawPatch("other", "a", {}), /Unknown table other/);
  }

  @test
  async unreadableAndObjectRows() {
    // A corrupted row, and a v3 persistence file loaded as objects
    const store = this.rawStore();
    store.storage.set("broken", "{not json");
    (store.storage as Map<string, any>).set("old", { uuid: "old", __type: "User" });
    const page = await store.rawPages("raw", 10);
    const broken = page.rows.find(row => row.key === "broken")!;
    assert.strictEqual(broken.unreadable, true);
    assert.deepStrictEqual(broken.data, {});
    assert.strictEqual(page.rows.find(row => row.key === "old")!.data.__type, "User");
    await store.rawPatch("raw", "old", { __type: "Webda/User" });
    assert.strictEqual(JSON.parse(store.storage.get("old")!).__type, "Webda/User");
    await assert.rejects(() => store.rawPatch("raw", "broken", {}), /cannot be patched/);
  }

  @test
  async rawTablesUseTheStoreName() {
    const store = new MemoryStore("raw", { models: ["Webda/RegistryEntry"] } as any).resolve();
    const RegistryEntry = useModel("Webda/RegistryEntry");
    assert.deepStrictEqual(store.getRawTables(), [{ name: "raw", root: RegistryEntry }]);
    assert.strictEqual((store.getRepository(RegistryEntry as any) as any).getTableRoot(), RegistryEntry);
  }

  @test
  unknownModelLeavesTheTableWithoutRoot() {
    // A model removed from the application: its untyped rows have no owner to be typed with
    const store = new MemoryStore("raw", { models: ["Gone/Model"] } as any);
    assert.deepStrictEqual(store.getRawTables(), [{ name: "raw", root: undefined }]);
  }
}

@suite
class RawHelpersTest {
  @test
  nonObjectValuesAreUnreadable() {
    for (const value of [42, null, true, [1], "[1]", "null", '"text"']) {
      assert.deepStrictEqual(
        parseRawValue("t", "k", value),
        { table: "t", key: "k", data: {}, unreadable: true },
        JSON.stringify(value)
      );
    }
  }

  @test
  pagesPastTheLastKeyAndSkipsEmptyValues() {
    const map = new Map<string, any>([
      ["a", "{}"],
      ["b", "{}"]
    ]);
    // A token past every key (its rows were deleted meanwhile): nothing left
    assert.deepStrictEqual(mapRawPage(map, "t", 2, "z"), { rows: [], continuationToken: undefined });
    map.set("c", undefined);
    assert.deepStrictEqual(
      mapRawPage(map, "t", 10).rows.map(row => row.key),
      ["a", "b"]
    );
  }

  @test
  reportFlagsResumedRuns() {
    const report = { store: "s", name: "types", tables: {}, resumed: true, dryRun: false };
    assert.strictEqual(formatMigrationReport(report), "Store s: migration types (resumed)");
    assert.strictEqual(
      formatMigrationReport({ ...report, dryRun: true }),
      "Store s: migration types (dry run, resumed)"
    );
  }

  @test
  async scanStopsAtTheLimitBetweenTables() {
    const tables: RawTable[] = [
      { name: "t1", root: undefined },
      { name: "t2", root: undefined }
    ];
    const maps: Record<string, Map<string, any>> = {
      t1: new Map([
        ["a", "{}"],
        ["b", "{}"]
      ]),
      t2: new Map([
        ["c", "{}"],
        ["d", "{}"]
      ])
    };
    const read: string[] = [];
    const pages = async (table: string, size: number, token?: string): Promise<RawPage> => {
      read.push(table);
      return mapRawPage(maps[table], table, size, token);
    };
    const keys: string[] = [];
    // The limit is reached at the end of the first table: the second one is left unread
    assert.strictEqual(await scanRawRows(pages, tables, 2, row => keys.push(row.key)), true);
    assert.deepStrictEqual(read, ["t1"]);
    assert.deepStrictEqual(keys, ["a", "b"]);
    // Reached at the end of the last table: nothing was left unread
    read.length = 0;
    keys.length = 0;
    assert.strictEqual(await scanRawRows(pages, tables, 4, row => keys.push(row.key)), false);
    assert.deepStrictEqual(read, ["t1", "t2"]);
    assert.deepStrictEqual(keys, ["a", "b", "c", "d"]);
  }
}

/**
 * Generic patcher: flags the even rows, reports row 9 as unknown
 */
const flagEven: MigrationPatcher = (row, context) => {
  if (row.data.n === 9) {
    context.unknown("nine");
    return undefined;
  }
  if (row.data.n % 2 !== 0 || row.data.flagged) return undefined;
  context.change("plain", "flagged");
  return { flagged: true };
};

/**
 * A store with two raw tables, as a multi-table backend
 */
class TwoTableStore extends MemoryStore {
  tables: Record<string, Map<string, any>> = { left: new Map(), right: new Map() };

  getRawTables(): RawTable[] {
    return [
      { name: "left", root: undefined },
      { name: "right", root: undefined }
    ];
  }

  async rawPages(table: string, batchSize: number, token?: string): Promise<RawPage> {
    return mapRawPage(this.tables[table], table, batchSize, token);
  }

  async rawPatch(table: string, key: string, patch: Record<string, any>): Promise<void> {
    mapRawPatch(this.tables[table], key, patch);
  }
}

/**
 * A store without raw access
 */
class OpaqueStore extends Store {
  getRepository(): any {
    return undefined;
  }
}

@suite
class StoreMigrationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * @param name - unique store name (its registry entries are keyed by it)
   * @returns a store holding r0..r9
   */
  async seededStore(name: string): Promise<MemoryStore> {
    const store: MemoryStore = await this.addService(MemoryStore, { models: ["Webda/RegistryEntry"] } as any, name);
    for (let n = 0; n < 10; n++) {
      store.storage.set(`r${n}`, JSON.stringify({ uuid: `r${n}`, n }));
    }
    return store;
  }

  @test
  async migratesEveryRowAndRecordsProgress() {
    const store = await this.seededStore("engineFull");
    const report = await store.migration("flag", flagEven, { batchSize: 4 });
    assert.deepStrictEqual(report, {
      store: "engineFull",
      name: "flag",
      resumed: false,
      dryRun: false,
      tables: { engineFull: { scanned: 10, updated: 5, byChange: { "plain → flagged": 5 }, unknown: { nine: 1 } } }
    });
    for (let n = 0; n < 10; n++) {
      assert.strictEqual(JSON.parse(store.storage.get(`r${n}`)!).flagged, n % 2 === 0 && n !== 9 ? true : undefined);
    }
    const progress = (await store.getMigrationProgress("flag"))!;
    assert.strictEqual(progress.done, true);
    assert.strictEqual(progress.leaseUntil, 0);
    assert.strictEqual(progress.scanned, 10);
    assert.strictEqual(progress.updated, 5);
    assert.strictEqual(progress.unknown, 1);
    await store.deleteMigrationProgress("flag");
    assert.strictEqual(await store.getMigrationProgress("flag"), undefined);
  }

  @test
  async rerunScansAgainAndUpdatesNothing() {
    const store = await this.seededStore("engineRerun");
    await store.migration("flag", flagEven, { batchSize: 4 });
    const again = await store.migration("flag", flagEven, { batchSize: 4 });
    assert.strictEqual(again.resumed, false);
    assert.deepStrictEqual(again.tables.engineRerun, { scanned: 10, updated: 0, byChange: {}, unknown: { nine: 1 } });
  }

  @test
  async dryRunWritesNothing() {
    const store = await this.seededStore("engineDry");
    const before = new Map(store.storage);
    const report = await store.migration("flag", flagEven, { batchSize: 4, dryRun: true });
    assert.strictEqual(report.dryRun, true);
    assert.strictEqual(report.tables.engineDry.updated, 5);
    assert.deepStrictEqual(new Map(store.storage), before);
    assert.strictEqual(await store.getMigrationProgress("flag"), undefined);
  }

  @test
  async failedDryRunLeavesNoProgress() {
    // A dry run holds no lease: its failure has nothing to release
    const store = await this.seededStore("engineDryFail");
    (store as any).rawPages = async () => {
      throw new Error("Interrupted");
    };
    await assert.rejects(() => store.migration("flag", flagEven, { dryRun: true }), /Interrupted/);
    assert.strictEqual(await store.getMigrationProgress("flag"), undefined);
  }

  @test
  async resumesAfterAnInterruption() {
    const store = await this.seededStore("engineResume");
    const original = store.rawPages.bind(store);
    let calls = 0;
    (store as any).rawPages = async (table: string, batchSize: number, token?: string) => {
      if (++calls === 2) throw new Error("Interrupted");
      return original(table, batchSize, token);
    };
    await assert.rejects(() => store.migration("flag", flagEven, { batchSize: 4 }), /Interrupted/);
    const interrupted = (await store.getMigrationProgress("flag"))!;
    assert.strictEqual(interrupted.done, false);
    assert.strictEqual(interrupted.scanned, 4);
    assert.strictEqual(interrupted.table, "engineResume");
    assert.strictEqual(interrupted.continuationToken, "r3");
    assert.strictEqual(interrupted.leaseUntil, 0, "a failing runner releases its lease");
    delete (store as any).rawPages;
    const resumed = await store.migration("flag", flagEven, { batchSize: 4 });
    assert.strictEqual(resumed.resumed, true);
    assert.deepStrictEqual(resumed.tables.engineResume, {
      scanned: 10,
      updated: 5,
      byChange: { "plain → flagged": 5 },
      unknown: { nine: 1 }
    });
  }

  @test
  async leaseRefusesASecondRunnerAndStopsAStaleOne() {
    // A runner hung past its lease must not write after a takeover
    const store = await this.seededStore("engineLease");
    // Always patches, with a value that differs on every call: a write by the stale runner would be visible
    let sequence = 0;
    const alwaysPatch: MigrationPatcher = () => ({ touched: ++sequence });
    const original = store.rawPages.bind(store);
    let release!: () => void;
    const hung = new Promise<void>(resolve => (release = resolve));
    let calls = 0;
    (store as any).rawPages = async (table: string, batchSize: number, token?: string) => {
      if (++calls === 2) await hung;
      return original(table, batchSize, token);
    };
    const first = store.migration("flag", alwaysPatch, { batchSize: 4, leaseDuration: 1000 });
    let progress = await store.getMigrationProgress("flag");
    while (!progress?.scanned) {
      await sleep(5);
      progress = await store.getMigrationProgress("flag");
    }
    await assert.rejects(
      () => store.migration("flag", alwaysPatch, { batchSize: 4 }),
      (err: any) => err.code === "MIGRATION_ALREADY_RUNNING"
    );
    // The first runner hangs: once its lease expired, the next runner takes over and resumes
    await sleep(Math.max(0, progress.leaseUntil - Date.now()) + 20);
    delete (store as any).rawPages;
    const takeover = await store.migration("flag", alwaysPatch, { batchSize: 4 });
    assert.strictEqual(takeover.resumed, true);
    assert.strictEqual(takeover.tables.engineLease.scanned, 10);
    assert.strictEqual(takeover.tables.engineLease.updated, 10);
    const before = new Map(store.storage);
    const patchedBeforeRelease = sequence;
    release();
    await assert.rejects(first, (err: any) => err.code === "MIGRATION_ALREADY_RUNNING");
    // The stale runner did reach its patcher (so it would have written without the guard)
    assert.ok(sequence > patchedBeforeRelease);
    assert.deepStrictEqual(new Map(store.storage), before);
  }

  /**
   * Run a callback while the Registry conditional patch fails for a reason other than a competing runner
   * @param fail - returns the error to throw for a patch (by call index, release patches set `leaseUntil` to 0),
   *   undefined to let the patch through
   * @param callback - the callback
   * @returns the callback result
   */
  async withRegistryPatch<R>(
    fail: (call: number, patch: any) => Error | undefined,
    callback: () => Promise<R>
  ): Promise<R> {
    const registry: any = useRegistry();
    const original = registry.patch;
    let call = 0;
    registry.patch = async (uuid: string, patch: any, field: string, value: any) => {
      const error = fail(call++, patch);
      if (error) throw error;
      return original.call(registry, uuid, patch, field, value);
    };
    try {
      return await callback();
    } finally {
      registry.patch = original;
    }
  }

  @test
  async registryErrorsOnAcquireAreNotALeaseConflict() {
    const store = await this.seededStore("engineAcquireError");
    await assert.rejects(
      () =>
        this.withRegistryPatch(
          () => new Error("Registry unavailable"),
          () => store.migration("flag", flagEven)
        ),
      (err: any) => err.code !== "MIGRATION_ALREADY_RUNNING" && /Registry unavailable/.test(err.message)
    );
  }

  @test
  async registryErrorsOnProgressSaveAreNotALeaseConflict() {
    const store = await this.seededStore("engineSaveError");
    const errors: string[] = [];
    (store as any).log = (level: string, ...args: any[]) => {
      if (level === "ERROR" || level === "WARN") errors.push(args.join(" "));
    };
    await assert.rejects(
      () =>
        this.withRegistryPatch(
          (call, patch) =>
            call === 0 ? undefined : new Error(patch.leaseUntil === 0 ? "Release failed" : "Save failed"),
          () => store.migration("flag", flagEven, { batchSize: 4 })
        ),
      (err: any) => err.code !== "MIGRATION_ALREADY_RUNNING" && /Save failed/.test(err.message)
    );
    // The release failure is reported, not taken for a lost lease, and does not hide the save failure
    assert.ok(
      errors.some(error => error.includes("Release failed")),
      errors.join("\n")
    );
    assert.ok(!errors.some(error => error.includes("lease lost")), errors.join("\n"));
  }

  @test
  async registryErrorsOnReleaseAreNotALostLease() {
    const store = await this.seededStore("engineReleaseError");
    const warnings: string[] = [];
    (store as any).log = (level: string, ...args: any[]) => {
      if (level === "WARN") warnings.push(args.join(" "));
    };
    await assert.rejects(
      () =>
        this.withRegistryPatch(
          (_call, patch) => (patch.leaseUntil === 0 ? new Error("Release failed") : undefined),
          () => store.migration("flag", flagEven, { batchSize: 4 })
        ),
      /Release failed/
    );
    assert.ok(!warnings.some(warning => warning.includes("lease lost")), warnings.join("\n"));
  }

  @test
  async storesWithoutRawAccessAreRefused() {
    const store = new OpaqueStore("opaque", {} as any);
    assert.strictEqual(store.getRawTables(), undefined);
    await assert.rejects(
      () => store.migration("flag", flagEven),
      (err: any) => err.code === "MIGRATION_UNSUPPORTED"
    );
  }

  @test
  async rawAccessIsUnsupportedByDefault() {
    const store = new OpaqueStore("opaqueRaw", {} as any);
    const unsupported = (err: any) => err.code === "MIGRATION_UNSUPPORTED";
    await assert.rejects(() => store.rawPages("opaqueRaw", 10), unsupported);
    await assert.rejects(() => store.rawPatch("opaqueRaw", "a", { __type: "x" }), unsupported);
    // The types migration and the type count see no table
    await assert.rejects(() => store.migrateTypes(), unsupported);
    assert.deepStrictEqual(await store.countStoredTypes(10), { tables: {}, truncated: false });
  }

  @test
  async deletingAMigrationThatNeverRanIsANoop() {
    const store = await this.seededStore("engineNeverRan");
    await store.deleteMigrationProgress("never");
    assert.strictEqual(await store.getMigrationProgress("never"), undefined);
  }

  @test
  async invalidBatchSizeUsesTheDefault() {
    const store = await this.seededStore("engineBatch");
    const sizes: number[] = [];
    const original = store.rawPages.bind(store);
    (store as any).rawPages = async (table: string, batchSize: number, token?: string) => {
      sizes.push(batchSize);
      return original(table, batchSize, token);
    };
    const report = await store.migration("flag", flagEven, { batchSize: Number("abc") });
    assert.deepStrictEqual(sizes, [DEFAULT_MIGRATION_BATCH]);
    assert.strictEqual(report.tables.engineBatch.scanned, 10);
  }

  @test
  async entryWithoutLeaseFieldsIsFree() {
    // A progress entry written without lease fields (e.g. by hand): free, and a failing patch is not a conflict
    const store = await this.seededStore("engineNoLease");
    await (useRegistry() as any).create({ uuid: "storeMigration.engineNoLease.flag" });
    await assert.rejects(
      () =>
        this.withRegistryPatch(
          () => new Error("Registry unavailable"),
          () => store.migration("flag", flagEven)
        ),
      (err: any) => err.code !== "MIGRATION_ALREADY_RUNNING" && /Registry unavailable/.test(err.message)
    );
    const report = await store.migration("flag", flagEven);
    assert.strictEqual(report.tables.engineNoLease.updated, 5);
  }

  @test
  async losingTheAcquireRaceReportsTheWinner() {
    // Another runner takes the lease between the read and the conditional patch of this one
    const store = await this.seededStore("engineRace");
    const before = new Map(store.storage);
    const registry: any = useRegistry();
    const original = registry.patch;
    registry.patch = async (uuid: string, _patch: any, field: string, value: any) => {
      registry.patch = original;
      await original.call(registry, uuid, { leaseUntil: Date.now() + 60000, owner: "winner" }, field, value);
      throw new Error("Condition failed");
    };
    try {
      await assert.rejects(
        () => store.migration("flag", flagEven),
        (err: any) => err.code === "MIGRATION_ALREADY_RUNNING" && err.message.includes("runner winner")
      );
    } finally {
      registry.patch = original;
    }
    assert.deepStrictEqual(new Map(store.storage), before);
  }

  @test
  async unreadableLeaseAfterAFailedPatchKeepsThePatchError() {
    // The entry cannot be read back to look for a competitor: the patch error is reported as is
    const store = await this.seededStore("engineUnreadableLease");
    const registry: any = useRegistry();
    const get = registry.get;
    let patched = false;
    registry.get = async (...args: any[]) => {
      if (patched) throw new Error("Registry read failed");
      return get.apply(registry, args);
    };
    try {
      await assert.rejects(
        () =>
          this.withRegistryPatch(
            () => {
              patched = true;
              return new Error("Registry unavailable");
            },
            () => store.migration("flag", flagEven)
          ),
        (err: any) => err.code !== "MIGRATION_ALREADY_RUNNING" && /Registry unavailable/.test(err.message)
      );
    } finally {
      registry.get = get;
    }
  }

  @test
  async resumesAMultiTableRunAtItsTable() {
    const store: TwoTableStore = await this.addService(
      TwoTableStore,
      { models: ["Webda/RegistryEntry"] } as any,
      "engineTables"
    );
    for (let n = 0; n < 6; n++) {
      store.tables.left.set(`l${n}`, JSON.stringify({ n }));
      store.tables.right.set(`r${n}`, JSON.stringify({ n }));
    }
    const original = store.rawPages.bind(store);
    /**
     * Fail the given page of the right table
     * @param page - page index in the right table
     */
    const failRightPage = (page: number) => {
      let served = 0;
      store.rawPages = async (table: string, batchSize: number, token?: string) => {
        if (table === "right" && served++ === page) throw new Error("Interrupted");
        return original(table, batchSize, token);
      };
    };
    // Interrupted once the left table is finished: it is not scanned again
    failRightPage(0);
    await assert.rejects(() => store.migration("flag", flagEven, { batchSize: 4 }), /Interrupted/);
    let progress = (await store.getMigrationProgress("flag"))!;
    assert.strictEqual(progress.table, "left");
    assert.strictEqual(progress.continuationToken, undefined);
    // Interrupted in the middle of the right table: the left one is skipped
    failRightPage(1);
    await assert.rejects(() => store.migration("flag", flagEven, { batchSize: 4 }), /Interrupted/);
    progress = (await store.getMigrationProgress("flag"))!;
    assert.strictEqual(progress.table, "right");
    assert.strictEqual(progress.continuationToken, "r3");
    store.rawPages = original;
    const report = await store.migration("flag", flagEven, { batchSize: 4 });
    assert.strictEqual(report.resumed, true);
    assert.deepStrictEqual(report.tables, {
      left: { scanned: 6, updated: 3, byChange: { "plain → flagged": 3 }, unknown: {} },
      right: { scanned: 6, updated: 3, byChange: { "plain → flagged": 3 }, unknown: {} }
    });
    for (const map of Object.values(store.tables)) {
      for (const [key, value] of map) {
        assert.strictEqual(JSON.parse(value).flagged, JSON.parse(value).n % 2 === 0 ? true : undefined, key);
      }
    }
  }

  @test
  async registryStoreMigratesItself() {
    // The progress entry lives in the store being scanned
    const registry = useCore().getService<MemoryStore>("Registry");
    const report = await registry.migration("noop", () => undefined, { batchSize: 2 });
    assert.ok(report.tables.Registry.scanned >= 1);
    assert.strictEqual(report.tables.Registry.updated, 0);
    assert.strictEqual((await registry.getMigrationProgress("noop"))!.done, true);
  }
}

@suite
class TypesMigrationTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * @param name - unique store name
   * @returns a MemoryStore holding the Webda 3 fixture rows
   */
  async legacyStore(name: string): Promise<MemoryStore> {
    registerLegacyTypeFixtures();
    const store: MemoryStore = await this.addService(MemoryStore, { models: LEGACY_TYPE_MODELS } as any, name);
    for (const { key, data } of LEGACY_TYPE_ROWS) {
      store.storage.set(key, JSON.stringify(data));
    }
    return store;
  }

  @test
  async rewritesLegacyTypes() {
    const store = await this.legacyStore("typesMemory");
    const report = await store.migrateTypes({ batchSize: 4 });
    assert.deepStrictEqual(sumMigrationReport(report), LEGACY_TYPE_REPORT);
    const types = Object.fromEntries(
      [...store.storage.entries()].map(([key, value]) => [key, JSON.parse(value).__type])
    );
    assert.deepStrictEqual(types, {
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
      u1: "Gone/Model"
    });
  }

  @test
  async reportsReadably() {
    const store = await this.legacyStore("typesFormat");
    const report = await store.migrateTypes({ batchSize: 4, dryRun: true });
    assert.strictEqual(
      formatMigrationReport(report),
      [
        "Store typesFormat: migration types (dry run)",
        "  typesFormat: 12 scanned, 8 to update",
        "    (untyped) → Webda/V3Animal: 1",
        "    Flora → Webda/V3Plant: 1",
        "    UuidModel → Webda/V3Animal: 1",
        "    V3Animal → Webda/V3Animal: 1",
        "    WEBDA/V3PUPPY → Webda/V3Puppy: 1",
        "    Webda/Flora → Webda/V3Plant: 1",
        "    v3dog → Webda/V3Dog: 1",
        "    webda/v3animal → Webda/V3Animal: 1",
        "    unknown Gone/Model: 1"
      ].join("\n")
    );
  }

  @test
  async unreadableRowsAreReportedNotRewritten() {
    // A corrupted row must not stop the migration
    const store = await this.legacyStore("typesUnreadable");
    store.storage.set("zz-broken", "{not json");
    const report = await store.migrateTypes({ batchSize: 4 });
    assert.strictEqual(report.tables.typesUnreadable.unknown["(unreadable)"], 1);
    assert.strictEqual(report.tables.typesUnreadable.updated, 8);
    assert.strictEqual(store.storage.get("zz-broken"), "{not json");
  }

  @test
  async untypedRowsWithoutARootAreLeftAlone() {
    const store: MemoryStore = await this.addService(MemoryStore, { models: [] } as any, "typesNoRoot");
    store.storage.set("x", JSON.stringify({ uuid: "x" }));
    const report = await store.migrateTypes();
    assert.deepStrictEqual(report.tables.typesNoRoot, { scanned: 1, updated: 0, byChange: {}, unknown: {} });
  }
}

@suite
class TypeCheckTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * A resolved store whose WARN logs are recorded, not yet initialized
   * @param name - unique store name
   * @param parameters - extra parameters
   * @returns the store and its warnings
   */
  newStore(name: string, parameters: any = {}): { store: MemoryStore; warnings: string[] } {
    registerLegacyTypeFixtures();
    const store = new MemoryStore(name, { models: LEGACY_TYPE_MODELS, ...parameters } as any);
    const warnings: string[] = [];
    (store as any).log = (level: string, ...args: any[]) => {
      if (level === "WARN") warnings.push(args.join(" "));
    };
    this.registerService(store, name);
    store.resolve();
    return { store, warnings };
  }

  /**
   * @param store - the store
   */
  seed(store: MemoryStore) {
    for (const { key, data } of LEGACY_TYPE_ROWS) {
      store.storage.set(key, JSON.stringify(data));
    }
  }

  @test
  async warnsOnceAtStartup() {
    const { store, warnings } = this.newStore("checkStartup");
    this.seed(store);
    await store.init();
    const typeWarnings = warnings.filter(warning => warning.includes("legacy, untyped or unknown types"));
    assert.strictEqual(typeWarnings.length, 1, warnings.join("\n"));
    for (const part of [
      "Store checkStartup",
      "'V3Animal' → Webda/V3Animal: 1",
      "untyped → Webda/V3Animal: 1",
      "'Flora' → Webda/V3Plant: 1",
      "'UuidModel' → Webda/V3Animal: 1",
      "unknown 'Gone/Model': 1",
      "webda migrate"
    ]) {
      assert.ok(typeWarnings[0].includes(part), `${part} in ${typeWarnings[0]}`);
    }
    assert.ok(!typeWarnings[0].includes("at least"));
    const summary = (await store.checkStoredTypes())!;
    assert.deepStrictEqual(
      { legacy: summary.legacy, untyped: summary.untyped, unknown: summary.unknown, truncated: summary.truncated },
      { legacy: 7, untyped: 1, unknown: 1, truncated: false }
    );
  }

  @test
  async cappedScanSaysAtLeast() {
    const { store, warnings } = this.newStore("checkCapped", { typeCheck: { maxRows: 3 } });
    this.seed(store);
    const summary = (await store.checkStoredTypes())!;
    assert.strictEqual(summary.truncated, true);
    assert.strictEqual(summary.legacy, 2);
    assert.ok(warnings.at(-1)!.includes("at least"), warnings.at(-1));
  }

  @test
  async cleanOrDisabledStoresStaySilent() {
    const clean = this.newStore("checkClean");
    clean.store.storage.set("a1", JSON.stringify(LEGACY_TYPE_ROWS[0].data));
    await clean.store.init();
    const typeWarning = (warning: string) => warning.includes("legacy, untyped or unknown types");
    assert.deepStrictEqual(clean.warnings.filter(typeWarning), []);
    const disabled = this.newStore("checkDisabled", { typeCheck: { enabled: false } });
    this.seed(disabled.store);
    await disabled.store.init();
    assert.deepStrictEqual(disabled.warnings.filter(typeWarning), []);
    assert.strictEqual(await disabled.store.checkStoredTypes(), undefined);
  }

  @test
  async unreadableRowsAreCounted() {
    // A corrupted row is reported, the check goes on
    const { store, warnings } = this.newStore("checkUnreadable");
    store.storage.set("broken", "{not json");
    const summary = (await store.checkStoredTypes())!;
    assert.strictEqual(summary.unknown, 1);
    assert.ok(warnings[0].includes("unknown '(unreadable)': 1"), warnings[0]);
  }

  @test
  async unsetRowLimitUsesTheDefault() {
    const { store } = this.newStore("checkDefaultLimit", { typeCheck: { maxRows: undefined } });
    const limits: number[] = [];
    const original = store.countStoredTypes.bind(store);
    store.countStoredTypes = async (maxRows: number) => {
      limits.push(maxRows);
      return original(maxRows);
    };
    this.seed(store);
    const summary = (await store.checkStoredTypes())!;
    assert.deepStrictEqual(limits, [DEFAULT_TYPE_CHECK_ROWS]);
    assert.strictEqual(summary.truncated, false);
  }

  @test
  async aCheckFailingWithANonErrorIsReported() {
    const { store, warnings } = this.newStore("checkFailingString");
    (store as any).countStoredTypes = async () => {
      throw "backend string failure";
    };
    await store.init();
    assert.ok(
      warnings.some(warning => warning.includes("Cannot check the stored types of checkFailingString: backend string")),
      warnings.join("\n")
    );
  }

  @test
  async aFailingCheckNeverFailsStartup() {
    const { store, warnings } = this.newStore("checkFailing");
    (store as any).countStoredTypes = async () => {
      throw new Error("backend down");
    };
    await store.init();
    assert.ok(
      warnings.some(warning => warning.includes("backend down")),
      warnings.join("\n")
    );
  }
}

@suite
class MigrateCommandTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  @test
  async exitCodeFollowsUnknownTypes() {
    registerLegacyTypeFixtures();
    const store: MemoryStore = await this.addService(
      MemoryStore,
      { models: LEGACY_TYPE_MODELS } as any,
      "commandMemory"
    );
    for (const { key, data } of LEGACY_TYPE_ROWS) {
      store.storage.set(key, JSON.stringify(data));
    }
    assert.strictEqual(await store.migrate(true, 4, false), 1);
    assert.strictEqual(JSON.parse(store.storage.get("a2")!).__type, "V3Animal", "a dry run writes nothing");
    assert.strictEqual(await store.migrate(false, 4, true), 0);
    assert.strictEqual(JSON.parse(store.storage.get("a2")!).__type, "Webda/V3Animal");
  }

  @test
  async invalidBatchUsesTheDefault() {
    registerLegacyTypeFixtures();
    const store: MemoryStore = await this.addService(
      MemoryStore,
      { models: LEGACY_TYPE_MODELS } as any,
      "commandBatch"
    );
    for (const { key, data } of LEGACY_TYPE_ROWS) {
      store.storage.set(key, JSON.stringify(data));
    }
    const sizes: number[] = [];
    const original = store.rawPages.bind(store);
    (store as any).rawPages = async (table: string, batchSize: number, token?: string) => {
      sizes.push(batchSize);
      return original(table, batchSize, token);
    };
    assert.strictEqual(await store.migrate(true, Number("abc"), true), 0);
    assert.deepStrictEqual(sizes, [DEFAULT_MIGRATION_BATCH]);
  }

  @test
  async storesWithoutRawAccessAreSkipped() {
    assert.strictEqual(await new OpaqueStore("opaqueCommand", {} as any).migrateCommand(), 0);
  }

  @test
  moduleDeclaresTheComposableCommand() {
    const memory: any = useApplication().getModules().moddas["Webda/MemoryStore"];
    assert.deepStrictEqual(Object.keys(memory.commands.migrate.args), ["dryRun", "batch", "allowUnknown"]);
    assert.strictEqual(memory.commands.migrate.args.batch.default, 500);
    assert.strictEqual(memory.commands.migrate.phase, "initialized");
    assert.ok(memory.capabilities.includes("store"));
  }
}
