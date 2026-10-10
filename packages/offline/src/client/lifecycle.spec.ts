import { describe, expect, it, vi } from "vitest";
import { OfflineClient } from "./client.js";
import { FakeServer } from "./fake-transport.js";
import { MemoryStorage } from "./storage/memory.js";

describe("OfflineClient lifecycle", () => {
  it("syncs on start and on the timer, reports status", async () => {
    vi.useFakeTimers();
    try {
      const server = new FakeServer();
      const client = new OfflineClient({
        storage: new MemoryStorage(),
        transport: server,
        scopes: [{ model: "A" }],
        syncInterval: 1000
      });
      const statuses: string[] = [];
      client.on("status", s => statuses.push(s));
      await client.start();
      const after = server.pullCalls;
      expect(after).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(1000);
      expect(server.pullCalls).toBeGreaterThan(after);
      expect(statuses).toContain("syncing");
      expect(client.status).toBe("idle");
      client.stop();
      const stopped = server.pullCalls;
      await vi.advanceTimersByTimeAsync(5000);
      expect(server.pullCalls).toBe(stopped);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off and recovers after a network failure", async () => {
    vi.useFakeTimers();
    try {
      const server = new FakeServer();
      const client = new OfflineClient({
        storage: new MemoryStorage(),
        transport: server,
        scopes: [{ model: "A" }],
        syncInterval: 0,
        retry: { base: 100, max: 1000 }
      });
      server.failNext(Object.assign(new Error("fetch failed"), { status: 0 }));
      await client.start();
      expect(client.status).toBe("offline");
      await vi.advanceTimersByTimeAsync(100);
      expect(client.status).toBe("idle");
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pulls on watch hints", async () => {
    const server = new FakeServer();
    let push!: (v: any) => void;
    server.watch = async function* () {
      yield await new Promise<any>(resolve => (push = resolve));
    } as any;
    const client = new OfflineClient({
      storage: new MemoryStorage(),
      transport: server,
      scopes: [{ model: "A" }],
      syncInterval: 0
    });
    await client.start();
    // The watch loop connects asynchronously after start()
    await vi.waitFor(() => expect(push).toBeTypeOf("function"));
    const before = server.pullCalls;
    server.serverWrite("A", "x", { uuid: "x" });
    push({ cursor: "1" });
    await vi.waitFor(() => expect(server.pullCalls).toBeGreaterThan(before));
    expect(await client.collection("A").get("x")).toEqual({ uuid: "x" });
    client.stop();
  });

  it("ignores heartbeat watch events", async () => {
    const server = new FakeServer();
    let emit!: (v: any) => void;
    const gate = new Promise<void>(resolve => (emit = resolve));
    server.watch = async function* () {
      yield { cursor: "1", heartbeat: true };
      yield { cursor: "2", heartbeat: true };
      await gate;
      yield { cursor: "3" };
      await new Promise(() => {});
    } as any;
    const client = new OfflineClient({
      storage: new MemoryStorage(),
      transport: server,
      scopes: [{ model: "A" }],
      syncInterval: 0
    });
    await client.start();
    const before = server.pullCalls;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(server.pullCalls).toBe(before);
    emit(undefined);
    await vi.waitFor(() => expect(server.pullCalls).toBeGreaterThan(before));
    client.stop();
  });
});
