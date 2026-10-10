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

  @test
  async conflictDoesNotLeakUnreadable() {
    const note = await Note.create({ title: "secret", owner: "bob" } as any);
    for (const op of ["patch", "delete"]) {
      const [res] = await this.push(
        [{ mutationId: `m-${op}`, ref: { model: "Test/Note", key: note.uuid }, baseRev: 5, op, patch: {} }],
        "alice"
      );
      assert.strictEqual(res.status, "rejected");
      assert.strictEqual(res.error.code, "NOT_FOUND");
      assert.ok(!JSON.stringify(res).includes("secret"));
    }
  }

  @test
  async replayByAnotherUserDoesNotLeak() {
    const note = await Note.create({ title: "secret", owner: "bob" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b" });
    const m = {
      mutationId: "shared",
      ref: { model: "Test/Note", key: note.uuid },
      baseRev: 1,
      op: "patch",
      patch: delta
    };
    assert.strictEqual((await this.push([m], "bob"))[0].status, "ok");
    const [replay] = await this.push([m], "alice");
    assert.strictEqual(replay.status, "rejected");
    assert.strictEqual(replay.error.code, "NOT_FOUND");
  }

  @test
  async deleteRaceIsConflict() {
    const note = await Note.create({ title: "a" } as any);
    const repo: any = useRepository(Note);
    const original = repo.delete;
    repo.delete = async (...args: any[]) => {
      repo.delete = original;
      // another writer: outside the push write context
      await (this.sync as any).pushContext.exit(() => Note.ref(note.uuid).patch({ title: "concurrent" } as any));
      // MemoryRepository.delete ignores its condition: fail like a conditional backend would
      throw new Error("Condition failed: _rev");
    };
    try {
      const [res] = await this.push([
        { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "delete" }
      ]);
      assert.strictEqual(res.status, "conflict");
      assert.strictEqual(res.rev, 2);
      assert.ok(!(await this.changes()).some(c => c.mutationId === "m1"), "m1 never attached to the other writer");
      const [retry] = await this.push([
        { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "delete" }
      ]);
      assert.strictEqual(retry.status, "conflict");
    } finally {
      repo.delete = original;
    }
  }

  @test
  async createRaceIsConflict() {
    const uuid = "22222222-2222-4222-8222-222222222222";
    const repo: any = useRepository(Note);
    const original = repo.create;
    repo.create = async (...args: any[]) => {
      repo.create = original;
      await (this.sync as any).pushContext.exit(() => original.call(repo, { uuid, title: "winner" }));
      return original.apply(repo, args);
    };
    try {
      const [res] = await this.push([
        {
          mutationId: "m1",
          ref: { model: "Test/Note", key: uuid },
          baseRev: 0,
          op: "create",
          patch: { title: "loser" }
        }
      ]);
      assert.strictEqual(res.status, "conflict");
      assert.strictEqual(res.object.title, "winner");
      assert.ok(!(await this.changes()).some(c => c.mutationId === "m1"), "m1 never attached to the other writer");
      const [retry] = await this.push([
        {
          mutationId: "m1",
          ref: { model: "Test/Note", key: uuid },
          baseRev: 0,
          op: "create",
          patch: { title: "loser" }
        }
      ]);
      assert.strictEqual(retry.status, "conflict");
      assert.strictEqual(retry.object.title, "winner");
    } finally {
      repo.create = original;
    }
  }

  @test
  async deltaCannotRewriteKey() {
    const note = await Note.create({ title: "a" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b", uuid: "33333333-3333-4333-8333-333333333333" });
    const [res] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta }
    ]);
    assert.strictEqual(res.status, "ok");
    assert.strictEqual((await Note.ref(note.uuid).get()).title, "b");
    assert.strictEqual(await Note.ref("33333333-3333-4333-8333-333333333333").exists(), false);
  }
  @test
  async pushOnlyWritesChangedFields() {
    const due = new Date("2026-01-02T03:04:05.000Z");
    const note = await Note.create({ title: "a", body: "keep", due } as any);
    const repo: any = useRepository(Note);
    const original = repo.patch;
    const payloads: any[] = [];
    repo.patch = async (...args: any[]) => {
      payloads.push({ ...args[1] });
      return original.apply(repo, args);
    };
    try {
      const dto = note.toDTO();
      const [res] = await this.push([
        {
          mutationId: "m1",
          ref: { model: "Test/Note", key: note.uuid },
          baseRev: 1,
          op: "patch",
          patch: diff(dto, { ...dto, title: "b" })
        }
      ]);
      assert.strictEqual(res.status, "ok");
      assert.deepStrictEqual(Object.keys(payloads[0]).sort(), ["_rev", "title", "uuid"]);
      const stored: any = await Note.ref(note.uuid).get();
      assert.strictEqual(stored.title, "b");
      assert.ok(stored.due instanceof Date, "the Date field is not rewritten as a string");
      assert.strictEqual(stored.due.getTime(), due.getTime());
      // A removal is still written explicitly
      const after = stored.toDTO();
      const { body: _body, ...without } = after;
      const [removed] = await this.push([
        {
          mutationId: "m2",
          ref: { model: "Test/Note", key: note.uuid },
          baseRev: 2,
          op: "patch",
          patch: diff(after, without)
        }
      ]);
      assert.strictEqual(removed.status, "ok");
      assert.ok("body" in payloads[1] && payloads[1].body === undefined);
      assert.strictEqual((await Note.ref(note.uuid).get()).body, undefined);
    } finally {
      repo.patch = original;
    }
  }

  @test
  async pushLimitIsMaxMutations() {
    const mutation = (i: number) => ({
      mutationId: `m${i}`,
      ref: { model: "Test/Note", key: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}` },
      baseRev: 0,
      op: "create",
      patch: { title: `n${i}` }
    });
    assert.strictEqual(this.sync.getParameters().maxMutations, 100);
    this.sync.getParameters().pageSize = 2;
    const results = await this.push([0, 1, 2, 3].map(mutation));
    assert.strictEqual(results.length, 4);
    this.sync.getParameters().maxMutations = 3;
    await assert.rejects(() => this.push([4, 5, 6, 7].map(mutation)), /At most 3 mutations/);
  }
}
