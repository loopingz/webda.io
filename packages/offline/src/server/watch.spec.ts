import { suite, test } from "@webda/test";
import * as assert from "assert";
import { callOperation } from "@webda/core";
import { Note, SyncTest, UserContext } from "../../test/fixture.js";
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
    const { value } = await gen.next();
    assert.strictEqual(value.heartbeat, true);
    assert.ok(value.cursor);
    assert.strictEqual((this.sync as any).changes.listenerCount("change"), 1);
    await gen.return(undefined);
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
}
