import { describe, it, expect, beforeEach } from "vitest";
import { LogBuffer } from "./logbuffer.js";

describe("LogBuffer", () => {
  let buffer: LogBuffer;

  beforeEach(() => {
    buffer = new LogBuffer(5);
  });

  it("starts empty", () => {
    expect(buffer.getEntries()).toEqual([]);
  });

  it("captures log entries via listener", () => {
    const msg = { type: "log", timestamp: Date.now(), log: { level: "INFO", args: ["Hello", "world"] } };
    (buffer as any).listener(msg);
    const entries = buffer.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].level).toBe("INFO");
    expect(entries[0].message).toBe("Hello world");
  });

  it("respects max size", () => {
    for (let i = 0; i < 7; i++) {
      (buffer as any).listener({ type: "log", timestamp: i, log: { level: "INFO", args: [`msg${i}`] } });
    }
    expect(buffer.getEntries()).toHaveLength(5);
    expect(buffer.getEntries()[0].message).toBe("msg2");
  });

  it("ignores non-log messages", () => {
    (buffer as any).listener({ type: "progress", timestamp: Date.now() });
    expect(buffer.getEntries()).toHaveLength(0);
  });

  it("notifies subscribers", () => {
    const events: any[] = [];
    buffer.onEvent(e => events.push(e));
    (buffer as any).listener({ type: "log", timestamp: Date.now(), log: { level: "WARN", args: ["test"] } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("log");
    expect(events[0].level).toBe("WARN");
  });

  it("unsubscribes", () => {
    const events: any[] = [];
    const unsub = buffer.onEvent(e => events.push(e));
    (buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["a"] } });
    unsub();
    (buffer as any).listener({ type: "log", timestamp: 2, log: { level: "INFO", args: ["b"] } });
    expect(events).toHaveLength(1);
  });

  it("searches by message content", () => {
    (buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["Starting server"] } });
    (buffer as any).listener({
      type: "log",
      timestamp: 2,
      log: { level: "ERROR", args: ["Connection failed"] }
    });
    expect(buffer.search("server")).toHaveLength(1);
    expect(buffer.search("server")[0].message).toBe("Starting server");
  });

  it("searches by level", () => {
    (buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: ["ok"] } });
    (buffer as any).listener({ type: "log", timestamp: 2, log: { level: "ERROR", args: ["fail"] } });
    expect(buffer.search("error")).toHaveLength(1);
  });

  it("handles object args", () => {
    (buffer as any).listener({ type: "log", timestamp: 1, log: { level: "INFO", args: [{ key: "val" }] } });
    expect(buffer.getEntries()[0].message).toBe('{"key":"val"}');
  });
});
