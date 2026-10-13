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
  type LegacyTypesHarness
} from "../test/legacy-types.js";
import { MemoryStore } from "./memory.service.js";

@suite
class MemoryLegacyTypesTest extends WebdaApplicationTest {
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  harness: LegacyTypesHarness = {
    createStore: async (name, models, parameters = {}) => {
      const store = new MemoryStore(name, { models, ...parameters } as any);
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
}
