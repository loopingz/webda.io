import { vi } from "vitest";
import { serializeSubjectKey, useRepository } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Note, SyncTest } from "../../test/fixture.js";
import { serializeKey } from "../protocol/index.js";
import { SyncChange } from "./syncchange.model.js";

@suite
class RevisionsTest extends SyncTest {
  @test
  async createUpdatePatchDelete() {
    const note = await Note.create({ title: "a" } as any);
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 1);
    await note.patch({ title: "b" } as any);
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 2);
    const loaded = await Note.ref(note.uuid).get();
    loaded.title = "c";
    await loaded.save();
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 3);
    await Note.ref(note.uuid).setAttribute("status" as any, "open");
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 4);
    await note.delete();
    const changes = await this.changes();
    assert.deepStrictEqual(
      changes.map(c => [c.op, c.subjectModel, c.subjectKey]),
      [
        ["upsert", "Test/Note", note.uuid],
        ["upsert", "Test/Note", note.uuid],
        ["upsert", "Test/Note", note.uuid],
        ["upsert", "Test/Note", note.uuid],
        ["delete", "Test/Note", note.uuid]
      ]
    );
    assert.ok(changes.every((c, i) => i === 0 || c.seq > changes[i - 1].seq), "seq is strictly increasing");
  }

  @test
  async partialUpdates() {
    const note = await Note.create({ title: "a", count: 1, tags: ["x"] } as any);
    await useRepository(Note).incrementAttributes(note.uuid, [{ property: "count", value: 2 }] as any);
    let stored = await Note.ref(note.uuid).get();
    assert.strictEqual(stored.count, 3);
    assert.strictEqual(stored._rev, 2);
    await useRepository(Note).upsertItemToCollection(note.uuid, "tags" as any, "y" as any);
    stored = await Note.ref(note.uuid).get();
    assert.strictEqual(stored._rev, 3);
    // One entry per write: the extra _rev increment of a collection write is not logged twice
    assert.strictEqual((await this.changes()).length, 3);
  }

  @test
  async touchLogsBulkChanges() {
    const note = await Note.create({ title: "a" } as any);
    await this.sync.touch("Test/Note", [note.uuid]);
    assert.strictEqual((await this.changes()).length, 2);
  }

  @test
  async failedLogDoesNotFailTheWrite() {
    const spy = vi.spyOn(SyncChange, "create").mockRejectedValueOnce(new Error("log down"));
    try {
      const note = await Note.create({ title: "a" } as any);
      assert.strictEqual((await Note.ref(note.uuid).get())._rev, 1);
      assert.strictEqual((await this.changes()).length, 0);
      await note.patch({ title: "b" } as any);
      assert.strictEqual((await Note.ref(note.uuid).get()).title, "b");
      assert.strictEqual((await this.changes()).length, 1);
    } finally {
      spy.mockRestore();
    }
  }

  @test
  keyEncodingMatchesCore() {
    for (const [fields, key] of <[string[], any][]>[
      [["uuid"], "x"],
      [["uuid"], { uuid: "x" }],
      [["a", "b"], { a: 1, b: "z" }]
    ]) {
      assert.strictEqual(serializeKey(fields, key), serializeSubjectKey(fields, key));
    }
  }
}
