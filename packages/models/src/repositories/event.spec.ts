import { EventRepository } from "./event";
import { StorableClass } from "../storable";
import { Repository } from "./repository";
import { RepositoryTest } from "./repository.spec";
import { MemoryRepository } from "./memory";
import { afterAll, suite } from "@webda/test";
import * as assert from "assert";

@suite
class EventRepositoryTest extends RepositoryTest {
  events: Record<string, number> = {};
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

  @afterAll
  afterAll() {
    assert.deepStrictEqual(this.events, {
      Create: 1000,
      Created: 1000,
      Queried: 18,
      Query: 18,
      Update: 3
    });
    console.log("Total events:", this.events);
  }
}
