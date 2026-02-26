import { EventRepository } from "./event";
import { StorableClass } from "../storable";
import { Repository, WEBDA_TEST } from "./repository";
import { RepositoryTest } from "./repository.spec";
import { MemoryRepository } from "./memory";
import { afterAll, suite } from "@webda/test";
import * as assert from "assert";
import { SubClassModel, TestModel } from "../model.spec";
import { FilterAttributes } from "@webda/tsc-esm";

@suite
class EventRepositoryTest extends RepositoryTest {
  events: Record<string, number> = {};
  expectations: Record<string, number> = {};
  testExpectations: Record<string, Record<string, number>> = {
    testModelCRUD: {
      Create: 1,
      Created: 1,
      Delete: 1,
      Deleted: 1,
      PartialUpdate: 11,
      PartialUpdated: 9,
      Patch: 4,
      Patched: 4,
      Update: 1,
      Updated: 1
    },
    testModelWithCompositeId: {
      Create: 2,
      Created: 1
    },
    upsert: {
      Create: 4,
      Created: 4
    },
    query: {
      Queried: 18,
      Query: 18
    },
    iterate: {},
    uuidModel: {}
  };

  getRepository<T extends StorableClass>(model: T, keys: string[]): Repository<T> {
    const repo = new EventRepository(model, keys, new MemoryRepository(model, keys));
    [
      "Create",
      "Update",
      "Delete",
      "PartialUpdate",
      "Created",
      "Updated",
      "Deleted",
      "PartialUpdated",
      "Query",
      "Queried",
      "Patch",
      "Patched"
    ].forEach(event => {
      repo.on(event, () => {
        this.events[event] ??= 0;
        this.events[event]++;
      });
    });
    return repo as Repository<T>;
  }

  /**
   * Override to avoid clearing the listeners
   */
  async beforeEach(testMethod: keyof EventRepositoryTest) {
    // We clear the repositories except QueryDocument
    await (SubClassModel.getRepository() as EventRepository)[WEBDA_TEST]?.clear(true);
    await (TestModel.getRepository() as EventRepository)[WEBDA_TEST]?.clear(true);
    const origin = this[testMethod] as () => Promise<void>;
    // @ts-ignore
    this[testMethod] = async () => {
      this.events = {};
      await origin();
      assert.deepStrictEqual(this.events, this.testExpectations[testMethod], "Events does not match expectations");
    };
  }
}
