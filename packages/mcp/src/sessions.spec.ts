import { suite, test } from "@webda/test";
import * as assert from "assert";
import { McpSessionManager } from "./sessions.js";

const entry = (id: string, closed: string[]) => ({
  id,
  userId: "u",
  lastSeen: 0,
  server: { close: async () => void closed.push(`server:${id}`) } as any,
  transport: { close: async () => void closed.push(`transport:${id}`) }
});

@suite
class McpSessionManagerTest {
  @test
  async touchesAndEvictsIdleSessions() {
    let now = 1000;
    const closed: string[] = [];
    const manager = new McpSessionManager(500, () => now);
    manager.add(entry("a", closed));
    manager.add(entry("b", closed));
    now = 1400;
    assert.ok(manager.get("a")); // touch a
    now = 1600;
    assert.strictEqual(await manager.evictIdle(), 1);
    assert.deepStrictEqual(
      manager.all().map(e => e.id),
      ["a"]
    );
    assert.deepStrictEqual(closed, ["transport:b", "server:b"]);
  }

  @test
  async closesAll() {
    const closed: string[] = [];
    const manager = new McpSessionManager(500);
    manager.add(entry("a", closed));
    await manager.closeAll();
    assert.strictEqual(manager.all().length, 0);
    assert.deepStrictEqual(closed, ["transport:a", "server:a"]);
  }
}
