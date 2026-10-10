import { runWithContext, useRepository } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { diff } from "@webda/versioning";
import { Member, Note, SyncTest, Tag, UserContext } from "../../test/fixture.js";
import { serializeKey } from "../protocol/index.js";

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

  /**
   * Call push() directly, bypassing the operation input schema (a transport without schema validation)
   * @param mutations - the mutations
   * @param userId - the caller
   * @returns the results
   */
  async rawPush(mutations: any, userId?: string) {
    const ctx = new UserContext(userId);
    await ctx.init();
    return runWithContext(ctx, () => this.sync.push(mutations));
  }

  @test
  async malformedMutationsAreRejectedOneByOne() {
    await assert.rejects(() => this.rawPush("nope"), /mutations must be an array/);
    const uuid = "44444444-4444-4444-8444-444444444444";
    const { results } = await this.rawPush([
      {},
      { mutationId: "m2" },
      { mutationId: "m3", ref: { model: "Test/Note", key: 7 } },
      { mutationId: "m4", ref: { model: "Test/Note", key: "" }, op: "create", baseRev: 0, patch: { title: "x" } },
      { mutationId: "m5", ref: { model: "Test/Note", key: uuid }, op: "upsert", baseRev: 0 },
      { mutationId: "m6", ref: { model: "Test/Note", key: uuid }, op: "create", baseRev: 0, patch: { title: "ok" } }
    ]);
    assert.deepStrictEqual(
      results.map(r => [r.mutationId, r.status, (r as any).error?.code]),
      [
        ["", "rejected", "INVALID"],
        ["m2", "rejected", "INVALID"],
        ["m3", "rejected", "INVALID"],
        ["m4", "rejected", "INVALID_KEY"],
        ["m5", "rejected", "INVALID"],
        ["m6", "ok", undefined]
      ]
    );
    assert.match((results[4] as any).error.message, /Unknown op upsert/);
    assert.strictEqual((await Note.ref(uuid).get()).title, "ok", "the valid mutation of the batch is applied");
  }

  @test
  async createValidationAndPermissions() {
    const uuid = "55555555-5555-4555-8555-555555555555";
    const [noPatch] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: uuid }, baseRev: 0, op: "create" }
    ]);
    assert.strictEqual(noPatch.status, "rejected");
    assert.strictEqual(noPatch.error.code, "VALIDATION");
    const [badType] = await this.push([
      { mutationId: "m2", ref: { model: "Test/Note", key: uuid }, baseRev: 0, op: "create", patch: { title: 5 } }
    ]);
    assert.strictEqual(badType.error.code, "VALIDATION");
    assert.strictEqual(await Note.ref(uuid).exists(), false);
    // A create refused by canAct is Forbidden: there is no object to hide
    const [forbidden] = await this.push(
      [
        {
          mutationId: "m3",
          ref: { model: "Test/Note", key: uuid },
          baseRev: 0,
          op: "create",
          patch: { title: "x", owner: "bob" }
        }
      ],
      "alice"
    );
    assert.strictEqual(forbidden.status, "rejected");
    assert.strictEqual(forbidden.error.code, "FORBIDDEN");
    assert.match(forbidden.error.message, /not allowed/);
    // A model without a JSON schema skips the validation
    const [tag] = await this.push([
      { mutationId: "m4", ref: { model: "Test/Tag", key: uuid }, baseRev: 0, op: "create", patch: { name: "t" } }
    ]);
    assert.strictEqual(tag.status, "ok");
    assert.strictEqual(tag.rev, 1);
    assert.strictEqual((await Tag.ref(uuid).get()).name, "t");
  }

  @test
  async readableButLockedIsForbidden() {
    const note = await Note.create({ title: "a", status: "locked" } as any);
    const delta = diff(note.toDTO(), { ...note.toDTO(), title: "b" });
    const [patch, del] = await this.push([
      { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "patch", patch: delta },
      { mutationId: "m2", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "delete" }
    ]);
    for (const res of [patch, del]) {
      assert.strictEqual(res.status, "rejected");
      assert.strictEqual(res.error.code, "FORBIDDEN");
    }
    assert.strictEqual((await Note.ref(note.uuid).get()).title, "a");
  }

  @test
  async replayAfterTheObjectIsGone() {
    const note = await Note.create({ title: "a" } as any);
    const m = {
      mutationId: "m1",
      ref: { model: "Test/Note", key: note.uuid },
      baseRev: 1,
      op: "patch",
      patch: diff(note.toDTO(), { ...note.toDTO(), title: "b" })
    };
    assert.strictEqual((await this.push([m]))[0].status, "ok");
    await Note.ref(note.uuid).delete();
    const [replay] = await this.push([m]);
    assert.deepStrictEqual(replay, { mutationId: "m1", status: "ok", rev: 0 });
  }

  @test
  async deleteOfAMissingObjectIsOk() {
    const [res] = await this.push([
      {
        mutationId: "m1",
        ref: { model: "Test/Note", key: "66666666-6666-4666-8666-666666666666" },
        baseRev: 3,
        op: "delete"
      }
    ]);
    assert.deepStrictEqual(res, { mutationId: "m1", status: "ok", rev: 0 });
    assert.strictEqual((await this.changes()).length, 0, "nothing is logged");
  }

  /**
   * Make the next repository call of `method` run `race` outside the push context, then throw like a conditional
   * backend would
   * @param method - repository method
   * @param race - the concurrent writer
   */
  raceOn(method: string, race: () => Promise<void>): () => void {
    const repo: any = useRepository(Note);
    const original = repo[method];
    repo[method] = async () => {
      repo[method] = original;
      await (this.sync as any).pushContext.exit(race);
      throw new Error("Condition failed: _rev");
    };
    return () => (repo[method] = original);
  }

  @test
  async patchRaces() {
    const note = await Note.create({ title: "a" } as any);
    const m = (id: string) => ({
      mutationId: id,
      ref: { model: "Test/Note", key: note.uuid },
      baseRev: 1,
      op: "patch",
      patch: diff(note.toDTO(), { ...note.toDTO(), title: "b" })
    });
    // Another writer patched first: conflict with its value
    let restore = this.raceOn("patch", async () => {
      await Note.ref(note.uuid).patch({ title: "concurrent" } as any);
    });
    try {
      const [res] = await this.push([m("m1")]);
      assert.strictEqual(res.status, "conflict");
      assert.strictEqual(res.rev, 2);
      assert.strictEqual(res.object.title, "concurrent");
    } finally {
      restore();
    }
    // Another writer deleted first: conflict without object
    const other = await Note.create({ title: "a" } as any);
    restore = this.raceOn("patch", async () => {
      await Note.ref(other.uuid).delete();
    });
    try {
      const [res] = await this.push([{ ...m("m2"), ref: { model: "Test/Note", key: other.uuid } }]);
      assert.deepStrictEqual(res, { mutationId: "m2", status: "conflict", rev: 0, object: null });
    } finally {
      restore();
    }
    // Nothing changed: a backend failure is internal and logged, never leaked
    const third = await Note.create({ title: "a" } as any);
    const log = vi.spyOn(this.sync as any, "log");
    restore = this.raceOn("patch", async () => {});
    try {
      const [res] = await this.push([{ ...m("m3"), ref: { model: "Test/Note", key: third.uuid } }]);
      assert.deepStrictEqual(res, {
        mutationId: "m3",
        status: "rejected",
        error: { code: "INTERNAL", message: "Internal error" }
      });
      assert.ok(log.mock.calls.some(c => c[0] === "ERROR" && /mutation failed/.test(String(c[1]))));
    } finally {
      restore();
      log.mockRestore();
    }
  }

  @test
  async raceMovingTheObjectOutOfReachHidesIt() {
    const note = await Note.create({ title: "a", owner: "bob" } as any);
    const restore = this.raceOn("patch", async () => {
      await Note.ref(note.uuid).patch({ owner: "alice", title: "secret" } as any);
    });
    try {
      const [res] = await this.push(
        [
          {
            mutationId: "m1",
            ref: { model: "Test/Note", key: note.uuid },
            baseRev: 1,
            op: "patch",
            patch: diff(note.toDTO(), { ...note.toDTO(), title: "b" })
          }
        ],
        "bob"
      );
      assert.strictEqual(res.status, "rejected");
      assert.strictEqual(res.error.code, "NOT_FOUND");
      assert.ok(!JSON.stringify(res).includes("secret"));
    } finally {
      restore();
    }
  }

  @test
  async deleteRaces() {
    const note = await Note.create({ title: "a" } as any);
    // Another writer deleted first: the delete is still a success
    let restore = this.raceOn("delete", async () => {
      await Note.ref(note.uuid).delete();
    });
    try {
      const [res] = await this.push([
        { mutationId: "m1", ref: { model: "Test/Note", key: note.uuid }, baseRev: 1, op: "delete" }
      ]);
      assert.deepStrictEqual(res, { mutationId: "m1", status: "ok", rev: 0 });
    } finally {
      restore();
    }
    const other = await Note.create({ title: "a" } as any);
    restore = this.raceOn("delete", async () => {});
    try {
      const [res] = await this.push([
        { mutationId: "m2", ref: { model: "Test/Note", key: other.uuid }, baseRev: 1, op: "delete" }
      ]);
      assert.strictEqual(res.status, "rejected");
      assert.strictEqual(res.error.code, "INTERNAL");
      assert.strictEqual(await Note.ref(other.uuid).exists(), true);
    } finally {
      restore();
    }
  }

  @test
  async createFailureIsInternal() {
    const uuid = "77777777-7777-4777-8777-777777777777";
    const restore = this.raceOn("create", async () => {});
    try {
      const [res] = await this.push([
        { mutationId: "m1", ref: { model: "Test/Note", key: uuid }, baseRev: 0, op: "create", patch: { title: "x" } }
      ]);
      assert.strictEqual(res.status, "rejected");
      assert.strictEqual(res.error.code, "INTERNAL");
      assert.strictEqual(await Note.ref(uuid).exists(), false);
    } finally {
      restore();
    }
  }

  @test
  async compositeKeys() {
    const scopes = [{ model: "Test/Member" }];
    const start = (await this.op("Sync.Pull", { scopes })).cursor;
    const key = serializeKey(["org", "user"], { org: "acme", user: "bob" })!;
    const ref = { model: "Test/Member", key };
    const [created] = await this.push([
      { mutationId: "m1", ref, baseRev: 0, op: "create", patch: { role: "admin", org: "evil" } }
    ]);
    assert.strictEqual(created.status, "ok");
    assert.strictEqual(created.rev, 1);
    assert.deepStrictEqual([created.object.org, created.object.user, created.object.role], ["acme", "bob", "admin"]);
    const stored = await Member.ref({ org: "acme", user: "bob" } as any).get();
    assert.strictEqual(stored.role, "admin");
    const dto = stored.toDTO();
    const [patched] = await this.push([
      { mutationId: "m2", ref, baseRev: 1, op: "patch", patch: diff(dto, { ...dto, role: "member" }) }
    ]);
    assert.strictEqual(patched.status, "ok");
    assert.strictEqual(patched.rev, 2);
    assert.strictEqual((await Member.ref({ org: "acme", user: "bob" } as any).get()).role, "member");
    const res = await this.op("Sync.Pull", { scopes, cursor: start });
    assert.deepStrictEqual(
      res.upserts.map(u => [u.ref.key, u.rev]),
      [[key, 2]]
    );
    const [malformed, short] = await this.push([
      { mutationId: "m3", ref: { model: "Test/Member", key: "not-json" }, baseRev: 0, op: "create", patch: {} },
      { mutationId: "m4", ref: { model: "Test/Member", key: '["acme"]' }, baseRev: 0, op: "create", patch: {} }
    ]);
    assert.strictEqual(malformed.error.code, "INVALID_KEY");
    assert.strictEqual(short.error.code, "INVALID_KEY");
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
