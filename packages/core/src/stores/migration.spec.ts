import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import { useModel } from "../application/hooks.js";
import { MemoryStore } from "./memory.service.js";
import { sleep } from "@webda/utils";
import { useCore } from "../core/hooks.js";
import { Store } from "./store.js";
import { formatMigrationReport, type MigrationPatcher } from "./migration.js";
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
    // Review focus: a corrupted row, and a v3 persistence file loaded as objects
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
    const types = Object.fromEntries([...store.storage.entries()].map(([key, value]) => [key, JSON.parse(value).__type]));
    assert.deepStrictEqual(types, {
      a1: "Webda/V3Animal",
      a2: "Webda/V3Animal",
      a3: "Webda/V3Animal",
      a4: "Webda/V3Animal",
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
        "  typesFormat: 11 scanned, 7 to update",
        "    (untyped) → Webda/V3Animal: 1",
        "    Flora → Webda/V3Plant: 1",
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
    // Review focus: a corrupted row must not stop the migration
    const store = await this.legacyStore("typesUnreadable");
    store.storage.set("zz-broken", "{not json");
    const report = await store.migrateTypes({ batchSize: 4 });
    assert.strictEqual(report.tables.typesUnreadable.unknown["(unreadable)"], 1);
    assert.strictEqual(report.tables.typesUnreadable.updated, 7);
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
