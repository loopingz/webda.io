import { suite, test } from "@webda/test";
import * as assert from "assert";
import { UuidModel } from "../model.model.js";
import { MemoryRepository } from "./memory";
import { EventRepository } from "./event";

/** Model with a value held outside its own enumerable fields */
class Note extends UuidModel {
  text: string;
  get shout(): string {
    return (this as any)._shout;
  }
  set shout(value: string) {
    Object.defineProperty(this, "_shout", { value, enumerable: false, writable: true, configurable: true });
  }
}
Note.registerSerializer();
(Note as any).Metadata = { Identifier: "Test/Note", Subclasses: [] };

@suite
class CreateInstanceTest {
  @test
  async createStoresTheGivenInstanceAndRefusesAnExistingKey() {
    for (const repo of [
      new MemoryRepository(Note, ["uuid"]),
      new EventRepository(Note, ["uuid"], new MemoryRepository(Note, ["uuid"]))
    ]) {
      const note = new Note();
      note.text = "first";
      note.shout = "HEY";
      // The instance prepared by the caller is the one created: nothing it holds is lost by a copy
      const created = await repo.create(note as any);
      assert.strictEqual(created, note);
      assert.strictEqual((created as any).shout, "HEY");
      const other = new Note();
      other.uuid = note.uuid;
      other.text = "second";
      await assert.rejects(() => repo.create(other as any), /^Error: Already exists/);
      assert.strictEqual((await repo.get(note.uuid)).text, "first");
    }
  }
}
