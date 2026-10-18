import { suite, test } from "@webda/test";
import * as assert from "assert";
import { WebdaApplicationTest } from "../test/application.js";
import {
  LEGACY_TYPE_CHECKS,
  checkLegacyTypeLease,
  checkLegacyTypeMigration,
  checkLegacyTypeNormalization,
  checkLegacyTypeResume,
  checkLegacyTypeStartup,
  checkLegacyTypeVisibility,
  checkLegacyTypes,
  type LegacyTypesHarness
} from "../test/legacy-types.js";
import { MemoryStore } from "./memory.service.js";
import { V3Animal } from "../test/legacy-types.fixture.model.js";

/**
 * A backend whose reads fail
 */
class FailingReadsStore extends MemoryStore {
  async rawPages(): Promise<any> {
    throw new Error("backend down");
  }
}

/**
 * A store that warns about stored types even when they are clean, among unrelated logs
 */
class AlwaysWarnsStore extends MemoryStore {
  async checkStoredTypes() {
    const summary = await super.checkStoredTypes();
    this.log("INFO", "Store checked: legacy, untyped or unknown types counted");
    if (!summary?.message) this.log("WARN", `Store ${this.getName()} holds legacy, untyped or unknown types`);
    return summary;
  }
}

@suite
class MemoryLegacyTypesTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = this.harnessOf(MemoryStore);

  /**
   * @param clazz - the store class under test
   * @returns the harness creating stores of the class
   */
  harnessOf(clazz: typeof MemoryStore): LegacyTypesHarness {
    return {
      createStore: async (name, models, parameters = {}) => {
        const store = new clazz(name, { models, ...parameters } as any);
        this.registerService(store, name);
        await store.resolve().init();
        return store;
      },
      seedRaw: async (store, _table, rows) => {
        for (const { key, data } of rows) {
          (store as MemoryStore).storage.set(key, JSON.stringify(data));
        }
      }
    };
  }

  @test
  visibility() {
    return checkLegacyTypeVisibility(this.harness);
  }

  @test
  normalization() {
    return checkLegacyTypeNormalization(this.harness);
  }

  @test
  migration() {
    return checkLegacyTypeMigration(this.harness);
  }

  @test
  resume() {
    return checkLegacyTypeResume(this.harness);
  }

  @test
  lease() {
    return checkLegacyTypeLease(this.harness);
  }

  @test
  startup() {
    return checkLegacyTypeStartup(this.harness);
  }

  @test
  everyCheckIsListed() {
    assert.deepStrictEqual(
      LEGACY_TYPE_CHECKS.map(check => check.name),
      ["visibility", "normalization", "migration", "resume", "lease", "startup"]
    );
  }

  @test
  async harnessTableIsUsed() {
    // The table the harness names is the one the fixture rows are seeded in
    const asked: any[] = [];
    const seeded: string[] = [];
    await checkLegacyTypeVisibility({
      ...this.harness,
      tableOf: (_store, model) => {
        asked.push(model);
        return "legacy-fixture-table";
      },
      seedRaw: (store, table, rows) => {
        seeded.push(table);
        return this.harness.seedRaw(store, table, rows);
      }
    });
    assert.deepStrictEqual(asked, [V3Animal]);
    assert.deepStrictEqual(seeded, ["legacy-fixture-table"]);
  }

  @test
  async leaseCheckFailsWhenTheFirstRunnerFails() {
    // The failure of the first runner is reported, not a timeout waiting for a first page that never comes
    await assert.rejects(() => checkLegacyTypeLease(this.harnessOf(FailingReadsStore)), /backend down/);
  }

  @test
  async startupCheckFailsWhenACleanStoreWarns() {
    await assert.rejects(
      () => checkLegacyTypeStartup(this.harnessOf(AlwaysWarnsStore)),
      (err: any) => err instanceof assert.AssertionError && err.message.includes("holds legacy")
    );
  }

  @test
  async checkLegacyTypesRunsTheChecksNotSkipped() {
    const names = LEGACY_TYPE_CHECKS.map(check => check.name);
    let created = 0;
    const counting: LegacyTypesHarness = {
      ...this.harnessOf(AlwaysWarnsStore),
      createStore: (...args) => {
        created++;
        return this.harnessOf(AlwaysWarnsStore).createStore(...args);
      }
    };
    await checkLegacyTypes(counting, { skip: names });
    assert.strictEqual(created, 0);
    await assert.rejects(
      () => checkLegacyTypes(counting, { skip: names.filter(name => name !== "startup") }),
      /holds legacy/
    );
    assert.ok(created > 0);
  }
}
