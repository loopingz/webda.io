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

  /**
   * @param pull - pull behavior
   * @returns a minimal transport
   */
  function transportOf(pull: () => Promise<any>): any {
    return {
      pull,
      push: async () => ({ results: [] }),
      snapshot: async () => ({ objects: [] })
    };
  }
  const ok = { upserts: [], evicts: [], cursor: "1", hasMore: false };

  it("grows the backoff up to max and resets after a success", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      let failing = true;
      const client = new OfflineClient({
        storage: new MemoryStorage(),
        transport: transportOf(async () => {
          calls++;
          if (failing) throw Object.assign(new Error("down"), { status: 0 });
          return ok;
        }),
        scopes: [{ model: "A" }],
        syncInterval: 0,
        retry: { base: 100, max: 300 }
      });
      await client.start();
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(calls).toBe(1);
      await vi.advanceTimersByTimeAsync(1); // retry at 100
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(199);
      expect(calls).toBe(2);
      await vi.advanceTimersByTimeAsync(1); // +200
      expect(calls).toBe(3);
      await vi.advanceTimersByTimeAsync(299);
      expect(calls).toBe(3);
      await vi.advanceTimersByTimeAsync(1); // capped at 300
      expect(calls).toBe(4);
      await vi.advanceTimersByTimeAsync(300);
      expect(calls).toBe(5);
      failing = false;
      await vi.advanceTimersByTimeAsync(300);
      expect(calls).toBe(6);
      expect(client.status).toBe("idle");
      failing = true;
      await client.sync().catch(() => {});
      await (client as any).run();
      const before = calls;
      await vi.advanceTimersByTimeAsync(99);
      expect(calls).toBe(before);
      await vi.advanceTimersByTimeAsync(1); // back to base
      expect(calls).toBe(before + 1);
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stop cancels retry, aborts watch and removes the online listener", async () => {
    vi.useFakeTimers();
    const g = globalThis as any;
    const added: any[] = [];
    const removed: any[] = [];
    g.addEventListener = (n: string, fn: any) => added.push([n, fn]);
    g.removeEventListener = (n: string, fn: any) => removed.push([n, fn]);
    try {
      let signal!: AbortSignal;
      let calls = 0;
      const transport = transportOf(async () => {
        calls++;
        throw Object.assign(new Error("down"), { status: 0 });
      });
      transport.watch = async function* (_req: any, s: AbortSignal) {
        signal = s;
        await new Promise(() => {});
      };
      const client = new OfflineClient({
        storage: new MemoryStorage(),
        transport,
        scopes: [{ model: "A" }],
        syncInterval: 0,
        retry: { base: 100, max: 1000 }
      });
      await client.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(added.map(a => a[0])).toEqual(["online"]);
      expect(signal.aborted).toBe(false);
      client.stop();
      expect(signal.aborted).toBe(true);
      expect(removed).toEqual(added);
      const stopped = calls;
      await vi.advanceTimersByTimeAsync(5000);
      expect(calls).toBe(stopped);
    } finally {
      delete g.addEventListener;
      delete g.removeEventListener;
      vi.useRealTimers();
    }
  });

  it("reconnects the watch after the stream ends or throws", async () => {
    let connections = 0;
    const transport = transportOf(async () => ok);
    transport.watch = async function* () {
      connections++;
      if (connections === 1) return;
      if (connections === 2) throw new Error("broken");
      await new Promise(() => {});
    };
    const client = new OfflineClient({
      storage: new MemoryStorage(),
      transport,
      scopes: [{ model: "A" }],
      syncInterval: 0,
      retry: { base: 10, max: 100 }
    });
    await client.start();
    await vi.waitFor(() => expect(connections).toBe(3));
    client.stop();
  });

  it("start is safe against concurrent calls", async () => {
    vi.useFakeTimers();
    try {
      let connections = 0;
      let calls = 0;
      const transport = transportOf(async () => {
        calls++;
        return ok;
      });
      transport.watch = async function* () {
        connections++;
        await new Promise(() => {});
      };
      const client = new OfflineClient({
        storage: new MemoryStorage(),
        transport,
        scopes: [{ model: "A" }],
        syncInterval: 1000
      });
      await Promise.all([client.start(), client.start()]);
      await vi.advanceTimersByTimeAsync(0);
      expect(connections).toBe(1);
      const before = calls;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls).toBe(before + 1);
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
