import { vi } from "vitest";
import { checkModelPermission, serializeSubjectKey, useApplication, useRepository } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Note, SyncTest, UserContext } from "../../test/fixture.js";
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
    assert.ok(
      changes.every((c, i) => i === 0 || c.seq > changes[i - 1].seq),
      "seq is strictly increasing"
    );
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
  async fullUpdateBumpsRevAndLogs() {
    const note = await Note.create({ title: "a" } as any);
    // MemoryRepository.update rebuilds the row from the model constructor (fields are dropped): the revision is
    // checked on the payload the Update listener completes and in the change log, not on the stored row
    const data: any = { ...note.toDTO(), title: "u" };
    await useRepository(Note).update(data);
    assert.strictEqual(data._rev, 2, "the full update carries the next revision");
    const changes = await this.changes();
    assert.deepStrictEqual(
      changes.map(c => [c.op, c.rev]),
      [
        ["upsert", 1],
        ["upsert", 2]
      ]
    );
  }

  @test
  async touchSkipsInvalidKeysAndLogsDeletes() {
    const note = await Note.create({ title: "a" } as any);
    await note.delete();
    assert.strictEqual((await this.changes()).length, 2);
    await this.sync.touch("Test/Note", [null, {}, note.uuid]);
    const changes = await this.changes();
    assert.strictEqual(changes.length, 3, "invalid keys are skipped");
    assert.strictEqual(changes[2].op, "delete");
    assert.strictEqual(changes[2].subjectKey, note.uuid);
    assert.strictEqual(changes[2].rev, undefined);
  }

  @test
  async bulkOperationsWarnOnce() {
    const log = vi.spyOn(this.sync as any, "log");
    try {
      await Note.create({ title: "bulk" } as any);
      await Note.create({ title: "bulk" } as any);
      const repo: any = useRepository(Note);
      assert.strictEqual(await repo.deleteMany("DELETE WHERE title = 'bulk'"), 2, "the bulk delete still runs");
      await repo.deleteMany("DELETE WHERE title = 'bulk'");
      assert.strictEqual((await Note.query("title = 'bulk'")).results.length, 0);
      assert.strictEqual((await this.changes()).length, 2, "bulk deletes are not logged");
      const warnings = log.mock.calls.filter(
        c => c[0] === "WARN" && /deleteMany on synced model Test\/Note/.test(c[1])
      );
      assert.strictEqual(warnings.length, 1, "warned once per model");
      assert.match(warnings[0][1], /SyncService.touch\(\)/);
    } finally {
      log.mockRestore();
    }
  }

  @test
  async initRefusesUnknownAndUnrevvedModels() {
    const service: any = this.sync;
    const models = service.getParameters().models;
    const schemas = useApplication().getSchemas();
    const hook = vi.spyOn(service, "hook").mockImplementation(() => {});
    clearInterval(service.pruneTimer);
    try {
      service.getParameters().models = ["Test/Nope"];
      await assert.rejects(() => service.init(), /Undefined model Test\/Nope/);
      schemas["Test/Tag"] = { type: "object", properties: { name: { type: "string" } } };
      service.getParameters().models = ["Test/Tag"];
      await assert.rejects(() => service.init(), /Test\/Tag must declare _rev/);
      assert.strictEqual(hook.mock.calls.length, 0, "nothing is hooked when a model is refused");
    } finally {
      delete schemas["Test/Tag"];
      service.getParameters().models = models;
      hook.mockRestore();
      clearInterval(service.pruneTimer);
    }
  }

  @test
  async changeLogIsNeverReadable() {
    const ctx = new UserContext("alice");
    await ctx.init();
    await Note.create({ title: "a" } as any);
    const [change] = await this.changes();
    await assert.rejects(() => checkModelPermission(change, ctx, "get", change.constructor), /not found/i);
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
      [["uuid"], { uuid: null }],
      [[], { uuid: "x" }],
      [["a", "b"], { a: 1, b: "z" }],
      [["a", "b"], { a: 1 }],
      [["a", "b"], "scalar"]
    ]) {
      assert.strictEqual(serializeKey(fields, key), serializeSubjectKey(fields, key));
    }
    assert.strictEqual(serializeKey([], { uuid: "x" }), "x");
    assert.strictEqual(serializeKey(["a", "b"], { a: 1, b: "z" }), '["1","z"]');
  }
}
