import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { Note, SyncTest } from "../../test/fixture.js";

const MINE = [{ model: "Test/Note", query: "status = 'open'" }];

@suite
class PullTest extends SyncTest {
  /** First pull: resync */
  async start(scopes = MINE, userId?: string): Promise<string> {
    const res = await this.op("Sync.Pull", { scopes }, userId);
    assert.strictEqual(res.resync, true);
    return res.cursor;
  }

  @test
  async resyncWithoutCursor() {
    const res = await this.op("Sync.Pull", { scopes: MINE });
    assert.strictEqual(res.resync, true);
    assert.deepStrictEqual(res.upserts, []);
    assert.ok(res.cursor);
  }

  @test
  async upsertsAndEvicts() {
    const cursor = await this.start();
    const a = await Note.create({ title: "a", status: "open" } as any);
    const b = await Note.create({ title: "b", status: "closed" } as any);
    let res = await this.op("Sync.Pull", { scopes: MINE, cursor });
    assert.deepStrictEqual(
      res.upserts.map(u => [u.ref.key, u.rev, u.object.title]),
      [[a.uuid, 1, "a"]]
    );
    assert.ok(res.evicts.map(e => e.key).includes(b.uuid));
    // a leaves the scope (changed by someone else), then is deleted
    await a.patch({ status: "closed" } as any);
    res = await this.op("Sync.Pull", { scopes: MINE, cursor: res.cursor });
    assert.ok(res.evicts.map(e => e.key).includes(a.uuid));
    assert.ok(!res.upserts.some(u => u.ref.key === a.uuid));
    await a.delete();
    res = await this.op("Sync.Pull", { scopes: MINE, cursor: res.cursor });
    assert.ok(res.evicts.map(e => e.key).includes(a.uuid));
    assert.strictEqual(res.hasMore, false);
  }

  @test
  async dedupsByKey() {
    const cursor = await this.start();
    const a = await Note.create({ title: "a", status: "open" } as any);
    await a.patch({ title: "a2" } as any);
    await a.patch({ title: "a3" } as any);
    const res = await this.op("Sync.Pull", { scopes: MINE, cursor });
    const mine = res.upserts.filter(u => u.ref.key === a.uuid);
    assert.strictEqual(mine.length, 1);
    assert.strictEqual(mine[0].object.title, "a3");
    assert.strictEqual(mine[0].rev, 3);
  }

  @test
  async unreadableIsEvicted() {
    const cursor = await this.start(MINE, "alice");
    const note = await Note.create({ title: "secret", status: "open", owner: "bob" } as any);
    const res = await this.op("Sync.Pull", { scopes: MINE, cursor }, "alice");
    assert.deepStrictEqual(res.upserts, []);
    assert.ok(res.evicts.map(e => e.key).includes(note.uuid));
  }

  @test
  async sameMillisecondWriteIsDelivered() {
    this.sync.getParameters().overlap = "1h";
    const base = Date.now() + 10_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(base);
    try {
      const cursor = await this.start();
      // First note is newer than the settle point (now - overlap) and is served by the first pull
      const a = await Note.create({ title: "a", status: "open" } as any);
      const first = await this.op("Sync.Pull", { scopes: MINE, cursor });
      assert.ok(first.upserts.some(u => u.ref.key === a.uuid));
      // Second note written by a server whose clock sits exactly on the previous pull's settle millisecond
      now.mockReturnValue(base - 3_600_000);
      (this.sync as any).lastMs = 0;
      const b = await Note.create({ title: "b", status: "open" } as any);
      const res = await this.op("Sync.Pull", { scopes: MINE, cursor: first.cursor });
      assert.ok(res.upserts.some(u => u.ref.key === b.uuid));
    } finally {
      now.mockRestore();
    }
  }

  @test
  async rejectsLimitOffsetOrderBy() {
    for (const query of [
      "status = 'open' LIMIT 5",
      "status = 'open' ORDER BY title ASC",
      "status = 'open' LIMIT 5 OFFSET 'x'"
    ]) {
      await assert.rejects(
        () => this.op("Sync.Pull", { scopes: [{ model: "Test/Note", query }] }),
        /LIMIT|ORDER|OFFSET/i
      );
      await assert.rejects(
        () => this.op("Sync.Snapshot", { scope: { model: "Test/Note", query } }),
        /LIMIT|ORDER|OFFSET/i
      );
    }
  }

  @test
  async snapshotSurvivesUnreadableGap() {
    await Note.create({ title: "a", status: "open" } as any);
    for (let i = 0; i < 5; i++) await Note.create({ title: `x${i}`, status: "open", owner: "bob" } as any);
    await Note.create({ title: "z", status: "open" } as any);
    this.sync.getParameters().pageSize = 1;
    const titles: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const res = await this.op("Sync.Snapshot", { scope: MINE[0], continuationToken: token }, "alice");
      titles.push(...res.objects.map(o => o.object.title));
      token = res.continuationToken;
      assert.ok(++pages < 20);
    } while (token);
    assert.deepStrictEqual(titles.sort(), ["a", "z"]);
  }

  @test
  async rejectsPrivateFields() {
    await assert.rejects(
      () => this.op("Sync.Pull", { scopes: [{ model: "Test/Note", query: "__secret = 'a'" }] }),
      /Private/
    );
    await assert.rejects(
      () => this.op("Sync.Snapshot", { scope: { model: "Test/Note", query: "__secret = 'a'" } }),
      /Private/
    );
  }

  @test
  async pagingTerminatesInsideOverlap() {
    this.sync.getParameters().overlap = "1h";
    const cursor = await this.start();
    for (let i = 0; i < 7; i++) await Note.create({ title: `n${i}`, status: "open" } as any);
    let next = cursor;
    let pages = 0;
    let more = true;
    const seen = new Set<string>();
    while (more) {
      const res = await this.op("Sync.Pull", { scopes: MINE, cursor: next, limit: 3 });
      res.upserts.forEach(u => seen.add(u.ref.key));
      more = res.hasMore;
      if (more) assert.ok(res.cursor > next, "a hasMore page moves the cursor forward");
      next = res.cursor;
      assert.ok(++pages < 10, "paging terminates");
    }
    assert.strictEqual(seen.size, 7);
  }

  @test
  async rejectsBadScopes() {
    await assert.rejects(() => this.op("Sync.Pull", { scopes: [] }), /scope/i);
    await assert.rejects(() => this.op("Sync.Pull", { scopes: [{ model: "Webda/SyncChange" }] }), /not synced/);
    await assert.rejects(
      () => this.op("Sync.Pull", { scopes: [{ model: "Test/Note", query: "DELETE WHERE title = 'a'" }] }),
      /DELETE/
    );
    await assert.rejects(
      () => this.op("Sync.Pull", { scopes: [{ model: "Test/Note", query: "title = " }] }),
      /syntax/i
    );
    const many = Array.from({ length: 21 }, () => ({ model: "Test/Note" }));
    await assert.rejects(() => this.op("Sync.Pull", { scopes: many }), /scopes/);
  }

  @test
  async oldCursorResyncs() {
    const res = await this.op("Sync.Pull", { scopes: MINE, cursor: "000000000000001" });
    assert.strictEqual(res.resync, true);
  }

  @test
  async snapshot() {
    await Note.create({ title: "a", status: "open" } as any);
    await Note.create({ title: "b", status: "open" } as any);
    await Note.create({ title: "c", status: "closed" } as any);
    await Note.create({ title: "d", status: "open", owner: "bob" } as any);
    this.sync.getParameters().pageSize = 1;
    const titles: string[] = [];
    let token: string | undefined;
    let pages = 0;
    do {
      const res = await this.op("Sync.Snapshot", { scope: MINE[0], continuationToken: token }, "alice");
      titles.push(...res.objects.map(o => o.object.title));
      res.objects.forEach(o => assert.strictEqual(o.rev, 1));
      token = res.continuationToken;
      assert.ok(++pages < 10);
    } while (token);
    assert.deepStrictEqual(titles.sort(), ["a", "b"]);
  }
}
