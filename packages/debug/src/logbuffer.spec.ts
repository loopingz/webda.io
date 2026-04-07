import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { LogBuffer } from "./logbuffer.js";

// Mock @webda/workout to test subscribe/unsubscribe
const mockListeners = new Map<string, Set<Function>>();
vi.mock("@webda/workout", () => ({
  useWorkerOutput: () => ({
    on: (event: string, fn: Function) => {
      if (!mockListeners.has(event)) mockListeners.set(event, new Set());
      mockListeners.get(event)!.add(fn);
    },
    removeListener: (event: string, fn: Function) => {
      mockListeners.get(event)?.delete(fn);
    }
  })
}));

@suite
class LogBufferTest {
  buffer: LogBuffer;

  beforeEach() {
    this.buffer = new LogBuffer(5);
    mockListeners.clear();
  }

  @test
  startsEmpty() {
    assert.deepStrictEqual(this.buffer.getEntries(), []);
  }

  @test
  capturesLogEntriesViaListener() {
    const msg = { type: "log", timestamp: Date.now(), log: { level: "INFO", args: ["Hello", "world"] } };
    (this.buffer as any).listener(msg);
    const entries = this.buffer.getEntries();
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].level, "INFO");
    assert.strictEqual(entries[0].message, "Hello world");
  }

  @test
  respectsMaxSize() {
    for (let i = 0; i < 7; i++) {
      (this.buffer as any).listener({ type: "log", timestamp: i, log: { level: "INFO", args: [`msg${i}`] } });
    }
    assert.strictEqual(this.buffer.getEntries().length, 5);
    assert.strictEqual(this.buffer.getEntries()[0].message, "msg2");
  }

  @test
  ignoresNonLogMessages() {
    (this.buffer as any).listener({ type: "progress", timestamp: Date.now() });
    assert.strictEqual(this.buffer.getEntries().length, 0);
  }

  @test
  notifiesSubscribers() {
    const events: any[] = [];
    this.buffer.onEvent(e => events.push(e));
    (this.buffer as any).listener({ type: "log", timestamp: Date.now(), log: { level: "WARN", args: ["test"] } });
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].type, "log");
    assert.strictEqual(events[0].level, "WARN");
  }

  @test
  unsubscribes() {
    const events: any[] = [];
    const unsub = this.buffer.onEvent(e => events.push(e));
    (this.buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["a"] } });
    unsub();
    (this.buffer as any).listener({ type: "log", timestamp: 2, log: { level: "INFO", args: ["b"] } });
    assert.strictEqual(events.length, 1);
  }

  @test
  searchesByMessageContent() {
    (this.buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["Starting server"] } });
    (this.buffer as any).listener({
      type: "log",
      timestamp: 2,
      log: { level: "ERROR", args: ["Connection failed"] }
    });
    assert.strictEqual(this.buffer.search("server").length, 1);
    assert.strictEqual(this.buffer.search("server")[0].message, "Starting server");
  }

  @test
  searchesByLevel() {
    (this.buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["ok"] } });
    (this.buffer as any).listener({ type: "log", timestamp: 2, log: { level: "ERROR", args: ["fail"] } });
    assert.strictEqual(this.buffer.search("error").length, 1);
  }

  @test
  handlesObjectArgs() {
    (this.buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: [{ key: "val" }] } });
    assert.strictEqual(this.buffer.getEntries()[0].message, '{"key":"val"}');
  }

  @test
  subscribeAddsListenerToWorkerOutput() {
    this.buffer.subscribe();
    const listeners = mockListeners.get("message");
    assert.ok(listeners !== undefined);
    assert.strictEqual(listeners!.size, 1);
    assert.strictEqual(listeners!.has((this.buffer as any).listener), true);
  }

  @test
  unsubscribeRemovesListenerFromWorkerOutput() {
    this.buffer.subscribe();
    assert.strictEqual(mockListeners.get("message")!.size, 1);
    this.buffer.unsubscribe();
    assert.strictEqual(mockListeners.get("message")!.size, 0);
  }

  @test
  subscribeThenUnsubscribeRoundTripWorks() {
    this.buffer.subscribe();
    this.buffer.unsubscribe();
    // Calling unsubscribe again should not throw
    this.buffer.unsubscribe();
    assert.strictEqual(mockListeners.get("message")?.size ?? 0, 0);
  }
}
