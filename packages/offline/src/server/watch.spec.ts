import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Note, SyncTest } from "../../test/fixture.js";
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
