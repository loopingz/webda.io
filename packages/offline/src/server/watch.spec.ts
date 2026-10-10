import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { callOperation } from "@webda/core";
import { Note, SyncTest, Tag, UserContext } from "../../test/fixture.js";
import { SyncChange } from "./syncchange.model.js";

@suite
class WatchTest extends SyncTest {
  @test
  async hintsOnScopedModels() {
    this.sync.getParameters().watchDebounce = 10;
    const gen = this.sync.watch([{ model: "Test/Note" }]);
    const first = gen.next();
    await new Promise(r => setTimeout(r, 5));
    await Note.create({ title: "a" } as any);
    await Note.create({ title: "b" } as any);
    const { value } = await first;
    assert.ok(value.cursor, "hint carries a cursor");
    await gen.return(undefined);
    assert.strictEqual((this.sync as any).changes.listenerCount("change"), 0, "listener removed");
  }

  @test
  async heartbeatWhenIdle() {
    this.sync.getParameters().watchKeepAlive = 20;
    const gen = this.sync.watch([{ model: "Test/Note" }]);
    try {
      const { value } = await gen.next();
      assert.strictEqual(value.heartbeat, true);
      assert.ok(value.cursor);
      assert.strictEqual((this.sync as any).changes.listenerCount("change"), 1);
      // An idle watch keeps beating; without any hint yet, each beat carries the current clock cursor
      const again = (await gen.next()).value;
      assert.strictEqual(again.heartbeat, true);
      assert.ok(again.cursor >= value.cursor);
    } finally {
      await gen.return(undefined);
    }
    assert.strictEqual((this.sync as any).changes.listenerCount("change"), 0, "listener removed");
  }

  @test
  async watchThroughTheOperationPath() {
    this.sync.getParameters().watchKeepAlive = 20;
    const chunks: any[] = [];
    const ctx = new UserContext(undefined, { scopes: [{ model: "Test/Note" }] });
    await ctx.init();
    (ctx as any).write = (chunk: any) => {
      chunks.push(chunk);
      throw new Error("client gone");
    };
    await assert.rejects(() => callOperation(ctx, "Sync.Watch"), /client gone/);
    assert.strictEqual(chunks[0].heartbeat, true);
    assert.ok(chunks[0].cursor);
    assert.strictEqual((this.sync as any).changes.listenerCount("change"), 0, "listener removed");
  }

  @test
  async ignoresOtherModelsAndNeedsNoHeartbeat() {
    this.sync.getParameters().watchDebounce = 5;
    this.sync.getParameters().watchKeepAlive = 0;
    const gen = this.sync.watch([{ model: "Test/Tag" }]);
    let settled = false;
    const first = gen.next().then(res => {
      settled = true;
      return res;
    });
    await new Promise(r => setTimeout(r, 5));
    await Note.create({ title: "unscoped" } as any);
    await new Promise(r => setTimeout(r, 40));
    assert.strictEqual(settled, false, "a change of another model is no hint, and no heartbeat is sent");
    const tag = await Tag.create({ name: "t" } as any);
    const { value } = await first;
    assert.strictEqual(value.heartbeat, undefined);
    const entry = (await this.changes()).find(c => c.subjectKey === tag.uuid);
    assert.strictEqual(value.cursor, entry.seq, "the hint carries the seq of the change");
    await gen.return(undefined);
  }

  @test
  async heartbeatRepeatsTheLastHint() {
    this.sync.getParameters().watchDebounce = 5;
    this.sync.getParameters().watchKeepAlive = 30;
    const gen = this.sync.watch([{ model: "Test/Note" }]);
    const first = gen.next();
    await new Promise(r => setTimeout(r, 5));
    await Note.create({ title: "a" } as any);
    const hint = (await first).value;
    assert.strictEqual(hint.heartbeat, undefined);
    const beat = (await gen.next()).value;
    assert.strictEqual(beat.heartbeat, true);
    assert.strictEqual(beat.cursor, hint.cursor);
    await gen.return(undefined);
  }

  @test
  async changeDuringTheYieldSkipsTheWait() {
    this.sync.getParameters().watchDebounce = 5;
    this.sync.getParameters().watchKeepAlive = 10000;
    const gen = this.sync.watch([{ model: "Test/Note" }]);
    const first = gen.next();
    await new Promise(r => setTimeout(r, 5));
    await Note.create({ title: "a" } as any);
    await first;
    // The consumer was busy: this change arrives before next() is called again
    await Note.create({ title: "b" } as any);
    const second = await Promise.race([
      gen.next().then(r => r.value),
      new Promise(r => setTimeout(() => r("timeout"), 1000))
    ]);
    assert.notStrictEqual(second, "timeout", "the pending change is served without waiting for the keep-alive");
    assert.strictEqual((second as any).heartbeat, undefined);
    await gen.return(undefined);
  }

  @test
  async pruneMovesHorizon() {
    await SyncChange.create({
      seq: "000000000000001-000000-old",
      subjectModel: "Test/Note",
      subjectKey: "x",
      op: "upsert",
      timestamp: new Date(1)
    } as any);
    await (this.sync as any).prune();
    assert.strictEqual((await this.changes()).length, 0);
    const res = await this.op("Sync.Pull", { scopes: [{ model: "Test/Note" }], cursor: "000000000000002" });
    assert.strictEqual(res.resync, true);
  }
  @test
  async horizonFollowsTheClock() {
    const now = Date.now();
    const res = await this.op("Sync.Pull", { scopes: [{ model: "Test/Note" }] });
    const fresh = await this.op("Sync.Pull", { scopes: [{ model: "Test/Note" }], cursor: res.cursor });
    assert.ok(!fresh.resync);
    // No prune ran since: the cursor is older than the retention all the same
    const later = vi.spyOn(Date, "now").mockReturnValue(now + 31 * 24 * 3600 * 1000);
    try {
      const old = await this.op("Sync.Pull", { scopes: [{ model: "Test/Note" }], cursor: res.cursor });
      assert.strictEqual(old.resync, true);
    } finally {
      later.mockRestore();
    }
  }

  @test
  async startupPruneFailureKeepsRetention() {
    const service: any = this.sync;
    clearInterval(service.pruneTimer);
    service.pruneTimer = undefined;
    const prune = vi.spyOn(service, "prune").mockRejectedValueOnce(new Error("store down"));
    const hook = vi.spyOn(service, "hook").mockImplementation(() => {});
    const log = vi.spyOn(service, "log");
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      await service.init();
      assert.ok(service.pruneTimer, "the hourly prune is still scheduled");
      assert.ok(log.mock.calls.some(c => c[0] === "ERROR" && /startup prune failed/.test(c[1])));
      // The hourly prune runs, and its own failures are logged without stopping the timer
      prune.mockRejectedValueOnce(new Error("still down"));
      await vi.advanceTimersByTimeAsync(3600000);
      assert.strictEqual(prune.mock.calls.length, 2);
      assert.ok(log.mock.calls.some(c => c[0] === "ERROR" && c[1] === "Prune failed"));
      await vi.advanceTimersByTimeAsync(3600000);
      assert.strictEqual(prune.mock.calls.length, 3, "the timer survives a failed run");
    } finally {
      clearInterval(service.pruneTimer);
      vi.useRealTimers();
      prune.mockRestore();
      hook.mockRestore();
      log.mockRestore();
    }
  }
}
