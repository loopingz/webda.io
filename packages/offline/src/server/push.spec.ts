import { useRepository } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { diff } from "@webda/versioning";
import { Note, SyncTest } from "../../test/fixture.js";

@suite
class PushTest extends SyncTest {
  async push(mutations: any[], userId?: string) {
    return (await this.op("Sync.Push", { mutations }, userId)).results;
  }

  @test
  async createWithClientKey() {
    const uuid = "11111111-1111-4111-8111-111111111111";
    const [res] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: uuid }, baseRev: 0, op: "create", patch: { title: "a" } }
    ]);
    assert.strictEqual(res.status, "ok");
    assert.strictEqual(res.rev, 1);
    assert.strictEqual((await Note.ref(uuid).get()).title, "a");
    const [again] = await this.push([
      { mutationId: "m2", ref: { model: "Test/Note", key: uuid }, baseRev: 0, op: "create", patch: { title: "b" } }
    ]);
    assert.strictEqual(again.status, "conflict");
    assert.strictEqual(again.object.title, "a");
  }

  @test
  async createOnUnreadableKey() {
    const note = await Note.create({ title: "x", owner: "bob" } as any);
    const [res] = await this.push(
      [
        {
          mutationId: "m1",
          ref: { model: "Test/Note", key: note.uuid },
          baseRev: 0,
          op: "create",
          patch: { title: "y" }
        }
      ],
      "alice"
    );
    assert.strictEqual(res.status, "rejected");
    assert.strictEqual(res.error.code, "KEY_IN_USE");
    assert.ok(!JSON.stringify(res).includes('"x"'), "no content leaks");
  }

  @test
  async patchWithRevisionCheck() {
    const note = await Note.create({ title: "a", body: "1" } as any);
    const delta = diff({ ...note.toDTO() }, { ...note.toDTO(), title: "b" });
    const [ok] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta }
    ]);
    assert.strictEqual(ok.status, "ok");
    assert.strictEqual(ok.rev, 2);
    assert.strictEqual(ok.object.title, "b");
    const [stale] = await this.push([
      { mutationId: "m2", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta }
    ]);
    assert.strictEqual(stale.status, "conflict");
    assert.strictEqual(stale.rev, 2);
    assert.strictEqual(stale.object.title, "b");
  }

  @test
  async replayedMutationIsOk() {
    const note = await Note.create({ title: "a" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b" });
    const m = {
      mutationId: "same",
      ref: { model: "Test/Note", key: note.uuid },
      baseRev: 1,
      op: "patch",
      patch: delta
    };
    assert.strictEqual((await this.push([m]))[0].status, "ok");
    const [replay] = await this.push([m]);
    assert.strictEqual(replay.status, "ok");
    assert.strictEqual(replay.rev, 2);
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 2, "not applied twice");
  }

  @test
  async preexistingObjectWithoutRev() {
    // Written before sync was enabled: bypass the repository events
    const inner: any = (useRepository(Note) as any).repository;
    const legacy: any = await inner.create({ title: "old" });
    assert.strictEqual((await Note.ref(legacy.uuid).get())._rev, undefined);
    const delta = diff({ ...(legacy.toDTO?.() ?? legacy) }, { ...(legacy.toDTO?.() ?? legacy), title: "new" });
    const [res] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: legacy.uuid }, baseRev: 0, op: "patch", patch: delta }
    ]);
    assert.strictEqual(res.status, "ok");
    assert.strictEqual(res.rev, 1);
  }

  @test
  async deleteAndDeleted() {
    const note = await Note.create({ title: "a" } as any);
    const [stale] = await this.push([
      { mutationId: "m0", ref: { model: "Test/Note", key: note.uuid }, baseRev: 7, op: "delete" }
    ]);
    assert.strictEqual(stale.status, "conflict");
    const [ok] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "delete" }
    ]);
    assert.strictEqual(ok.status, "ok");
    assert.strictEqual(await Note.ref(note.uuid).exists(), false);
    const [gone] = await this.push([
      {
        mutationId: "m2",
        ref: { model: "Test/Note", key: note.uuid },
        baseRev: 1,
        op: "patch",
        patch: diff({}, { title: "x" })
      }
    ]);
    assert.strictEqual(gone.status, "conflict");
    assert.strictEqual(gone.object, null);
  }

  @test
  async permissionsAndValidation() {
    const note = await Note.create({ title: "a", owner: "bob" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b" });
    const [forbidden] = await this.push(
      [{ mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta }],
      "alice"
    );
    assert.strictEqual(forbidden.status, "rejected");
    const invalid = diff(note.toDTO(), { ...note.toDTO(), count: "many" });
    const [bad] = await this.push(
      [{ mutationId: "m2", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: invalid }],
      "bob"
    );
    assert.strictEqual(bad.status, "rejected");
    assert.strictEqual(bad.error.code, "VALIDATION");
    const [unsynced] = await this.push([
      { mutationId: "m3", ref: { model: "Webda/SyncChange", key: "x" }, baseRev: 0, op: "create", patch: {} }
    ]);
    assert.strictEqual(unsynced.status, "rejected");
    assert.strictEqual(unsynced.error.code, "NOT_SYNCED");
  }

  @test
  async clientCannotForgeRev() {
    const note = await Note.create({ title: "a" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b", _rev: 99 });
    const [res] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta }
    ]);
    assert.strictEqual(res.rev, 2);
    assert.strictEqual((await Note.ref(note.uuid).get())._rev, 2);
  }
}
