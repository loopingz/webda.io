import { describe, expect, it } from "vitest";
import { OfflineClient, type OfflineClientOptions } from "./client.js";
import { FakeServer } from "./fake-transport.js";
import { MemoryStorage } from "./storage/memory.js";

const SCOPES = [{ model: "App/Task", query: "archived = FALSE" }];

/**
 * @param options - client overrides
 * @returns server, client, tasks
 */
async function setup(options: Partial<OfflineClientOptions> = {}) {
  const server = new FakeServer();
  const storage = new MemoryStorage();
  const client = new OfflineClient({ storage, transport: server, scopes: SCOPES, syncInterval: 0, ...options });
  return { server, storage, client, tasks: client.collection<any>("App/Task") };
}

describe("sync", () => {
  it("resyncs on first sync, then pulls changes", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    server.serverWrite("App/Task", "b", { uuid: "b", title: "B", archived: true });
    await client.sync();
    expect((await tasks.query()).map(t => t.uuid)).toEqual(["a"]);
    server.serverWrite("App/Task", "c", { uuid: "c", title: "C", archived: false });
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: true });
    const events: any[] = [];
    client.on("change", e => events.push([e.origin, e.ref.key, e.object?.title ?? null]));
    await client.sync();
    expect((await tasks.query()).map(t => t.uuid)).toEqual(["c"]);
    expect(events).toEqual(
      expect.arrayContaining([
        ["remote", "c", "C"],
        ["remote", "a", null]
      ])
    );
  });

  it("pushes local creates, patches and deletes", async () => {
    const { server, client, tasks, storage } = await setup();
    await client.sync();
    const t = await tasks.create({ title: "x", archived: false });
    await client.sync();
    expect(server.objects.get(`App/Task|${t.uuid}`)?.object.title).toBe("x");
    expect((await storage.getRecord(`App/Task|${t.uuid}`))?.state).toBe("synced");
    await tasks.patch(t.uuid, { title: "y" });
    await tasks.patch(t.uuid, { done: true });
    await client.sync();
    expect(server.received.at(-1)!.mutations).toHaveLength(1);
    expect(server.objects.get(`App/Task|${t.uuid}`)?.object).toMatchObject({ title: "y", done: true });
    await tasks.delete(t.uuid);
    await client.sync();
    expect(server.objects.has(`App/Task|${t.uuid}`)).toBe(false);
    expect(await storage.getRecord(`App/Task|${t.uuid}`)).toBeUndefined();
  });

  it("auto-merges a concurrent edit of another field", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", body: "1", archived: false });
    await client.sync();
    await tasks.patch("a", { title: "mine" });
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", body: "theirs", archived: false });
    await client.sync();
    expect(server.objects.get("App/Task|a")?.object).toMatchObject({ title: "mine", body: "theirs" });
    expect(await tasks.get("a")).toMatchObject({ title: "mine", body: "theirs" });
    expect(await client.conflicts()).toEqual([]);
  });

  it("manual conflicts wait for resolve()", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    await client.sync();
    await tasks.patch("a", { title: "mine" });
    server.serverWrite("App/Task", "a", { uuid: "a", title: "theirs", archived: false });
    const seen: any[] = [];
    client.on("conflict", c => seen.push(c.ref.key));
    await client.sync();
    expect(seen).toEqual(["a"]);
    const [open] = await client.conflicts();
    expect(open.result.conflicts.map(c => c.path)).toEqual(["/title"]);
    await expect(tasks.patch("a", { title: "again" })).rejects.toThrow(/conflict/);
    await client.resolve(open.ref, new Map([["/title", { choose: "ours" }]]));
    await client.sync();
    expect(server.objects.get("App/Task|a")?.object.title).toBe("mine");
  });

  it("server-wins and client-wins strategies", async () => {
    for (const [strategy, expected] of [
      ["server-wins", "theirs"],
      ["client-wins", "mine"]
    ] as const) {
      const { server, client, tasks } = await setup({ onConflict: strategy });
      server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
      await client.sync();
      await tasks.patch("a", { title: "mine" });
      server.serverWrite("App/Task", "a", { uuid: "a", title: "theirs", archived: false });
      await client.sync();
      expect(server.objects.get("App/Task|a")?.object.title).toBe(expected);
      expect((await tasks.get("a")).title).toBe(expected);
    }
  });

  it("keeps an edit made while the push was in flight", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    await client.sync();
    await tasks.patch("a", { title: "first" });
    const push = server.push.bind(server);
    server.push = async req => {
      await tasks.patch("a", { title: "second" });
      return push(req);
    };
    await client.sync();
    server.push = push;
    expect((await tasks.get("a")).title).toBe("second");
    await client.sync();
    expect(server.objects.get("App/Task|a")?.object.title).toBe("second");
  });

  it("retries a lost push with the same mutationId", async () => {
    const { server, client, tasks, storage } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    await client.sync();
    await tasks.patch("a", { title: "B" });
    const push = server.push.bind(server);
    server.push = async req => {
      await push(req);
      throw new Error("connection reset");
    };
    await expect(client.sync()).rejects.toThrow(/reset/);
    server.push = push;
    const pending = await storage.getRecord("App/Task|a");
    expect(pending?.pendingMutationId).toBeDefined();
    await client.sync();
    const ids = server.received.map(r => r.mutations[0].mutationId);
    expect(ids[0]).toBe(ids[1]);
    expect(await client.conflicts()).toEqual([]);
    expect((await storage.getRecord("App/Task|a"))?.state).toBe("synced");
  });

  it("rejected mutations become errors and can be discarded", async () => {
    const { server, client, tasks, storage } = await setup();
    await client.sync();
    const t = await tasks.create({ title: "x", archived: false });
    server.push = async req => ({
      results: req.mutations.map(m => ({
        mutationId: m.mutationId,
        status: "rejected" as const,
        error: { code: "VALIDATION", message: "bad" }
      }))
    });
    await client.sync();
    const record = await storage.getRecord(`App/Task|${t.uuid}`);
    expect(record?.state).toBe("error");
    expect(record?.error?.code).toBe("VALIDATION");
    await client.discard(record!.ref);
    expect(await storage.getRecord(`App/Task|${t.uuid}`)).toBeUndefined();
  });

  it("evicts only synced records", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    server.serverWrite("App/Task", "b", { uuid: "b", title: "B", archived: false });
    await client.sync();
    await tasks.patch("b", { title: "mine" });
    // Push fails: b stays dirty while both leave the scope
    server.failNext(new Error("offline"));
    await expect(client.sync()).rejects.toThrow();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: true });
    server.serverWrite("App/Task", "b", { uuid: "b", title: "B", archived: true });
    server.push = async req => ({
      results: req.mutations.map(m => ({
        mutationId: m.mutationId,
        status: "rejected" as const,
        error: { code: "X", message: "x" }
      }))
    });
    await client.sync();
    expect(await tasks.get("a")).toBeUndefined();
    expect(await tasks.get("b")).toBeDefined();
  });

  it("setScopes resyncs", async () => {
    const { server, client, tasks } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: true });
    await client.sync();
    expect(await tasks.query()).toEqual([]);
    await client.setScopes([{ model: "App/Task", query: "archived = TRUE" }]);
    await client.sync();
    expect((await tasks.query()).map(t => t.uuid)).toEqual(["a"]);
  });
});

describe("never-confirmed records (base === null)", () => {
  it("pushes as create with baseRev 0 whatever the state", async () => {
    const { server, client, tasks, storage } = await setup();
    await client.sync();
    const t = await tasks.create({ title: "x", archived: false });
    const id = `App/Task|${t.uuid}`;
    const rec = (await storage.getRecord(id))!;
    await storage.putRecords([{ ...rec, state: "dirty" }]);
    await client.sync();
    const m = server.received.at(-1)!.mutations[0];
    expect(m.op).toBe("create");
    expect(m.baseRev).toBe(0);
    expect(server.objects.has(id)).toBe(true);
  });

  it("an errored never-confirmed record is pushed as create again after patch", async () => {
    const { server, client, tasks, storage } = await setup();
    await client.sync();
    const t = await tasks.create({ title: "x", archived: false });
    const id = `App/Task|${t.uuid}`;
    const rec = (await storage.getRecord(id))!;
    await storage.putRecords([{ ...rec, state: "error", error: { code: "X", message: "x" } }]);
    await tasks.patch(t.uuid, { title: "y" });
    const after = (await storage.getRecord(id))!;
    expect(after.state).toBe("created");
    expect(after.error).toBeUndefined();
    await client.sync();
    expect(server.received.at(-1)!.mutations[0].op).toBe("create");
    expect(server.objects.get(id)?.object.title).toBe("y");
  });

  it("delete forgets any never-confirmed record", async () => {
    const { tasks, storage } = await setup();
    const t = await tasks.create({ title: "x", archived: false });
    const id = `App/Task|${t.uuid}`;
    const rec = (await storage.getRecord(id))!;
    await storage.putRecords([{ ...rec, state: "error", error: { code: "X", message: "x" } }]);
    await tasks.delete(t.uuid);
    expect(await storage.getRecord(id)).toBeUndefined();
    expect(await tasks.get(t.uuid)).toBeUndefined();
  });

  it("re-creating over a tombstone clears the error but keeps the in-flight mutation", async () => {
    const { server, client, tasks, storage } = await setup();
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    await client.sync();
    await tasks.delete("a");
    const id = "App/Task|a";
    const rec = (await storage.getRecord(id))!;
    await storage.putRecords([{ ...rec, pendingMutationId: "m1", sent: null, error: { code: "X", message: "x" } }]);
    await tasks.create({ uuid: "a", title: "again", archived: false });
    const after = (await storage.getRecord(id))!;
    expect(after.state).toBe("dirty");
    expect(after.pendingMutationId).toBe("m1");
    expect(after.sent).toBeNull();
    expect(after.error).toBeUndefined();
  });
});

describe("options", () => {
  it("explicit undefined options keep the defaults", async () => {
    const { client } = await setup({
      onConflict: undefined,
      syncInterval: undefined,
      primaryKeys: undefined,
      versioning: undefined,
      retry: undefined
    });
    expect(client.options.onConflict).toBe("manual");
    expect(client.options.syncInterval).toBe(30000);
    expect(client.options.primaryKeys).toEqual({});
    expect(client.options.versioning).toEqual({});
    expect(client.options.retry).toEqual({ base: 1000, max: 60000 });
  });
});

describe("in-flight edge cases", () => {
  /**
   * @returns a synced task "a" and helpers
   */
  async function synced() {
    const ctx = await setup();
    ctx.server.serverWrite("App/Task", "a", { uuid: "a", title: "A", archived: false });
    await ctx.client.sync();
    return ctx;
  }

  it("keeps an edit made after a lost push response", async () => {
    const { server, client, tasks, storage } = await synced();
    await tasks.patch("a", { title: "B" });
    const push = server.push.bind(server);
    server.push = async req => {
      await push(req);
      throw new Error("reset");
    };
    await expect(client.sync()).rejects.toThrow();
    server.push = push;
    await tasks.patch("a", { title: "C" });
    await client.sync();
    const ids = server.received.map(r => r.mutations[0].mutationId);
    expect(ids[0]).toBe(ids[1]);
    expect(server.received[1].mutations[0]).toEqual(server.received[0].mutations[0]);
    expect((await tasks.get("a")).title).toBe("C");
    await client.sync();
    expect(server.objects.get("App/Task|a")?.object.title).toBe("C");
    expect((await storage.getRecord("App/Task|a"))?.state).toBe("synced");
  });

  it("keeps a patch made after a lost create response", async () => {
    const { server, client, tasks } = await synced();
    const t = await tasks.create({ title: "x", archived: false });
    const push = server.push.bind(server);
    server.push = async req => {
      await push(req);
      throw new Error("reset");
    };
    await expect(client.sync()).rejects.toThrow();
    server.push = push;
    await tasks.patch(t.uuid, { title: "y" });
    await client.sync();
    await client.sync();
    expect(server.objects.get(`App/Task|${t.uuid}`)?.object.title).toBe("y");
    expect((await tasks.get(t.uuid)).title).toBe("y");
  });

  it("a delete during an in-flight patch is pushed next", async () => {
    const { server, client, tasks, storage } = await synced();
    await tasks.patch("a", { title: "B" });
    const push = server.push.bind(server);
    server.push = async req => {
      server.push = push;
      await tasks.delete("a");
      return push(req);
    };
    await client.sync();
    server.push = push;
    await client.sync();
    expect(server.objects.has("App/Task|a")).toBe(false);
    expect(await storage.getRecord("App/Task|a")).toBeUndefined();
  });

  it("FakeServer rejects a patch that would remove the object instead of crashing", async () => {
    const { server } = await synced();
    const res = await server.push({
      mutations: [
        { mutationId: "m", ref: { model: "App/Task", key: "a" }, op: "patch", baseRev: 1, patch: null as any }
      ]
    });
    expect(res.results[0].status).not.toBe("ok");
  });

  it("re-create while the delete is in flight becomes a create", async () => {
    const { server, client, tasks, storage } = await synced();
    await tasks.delete("a");
    const push = server.push.bind(server);
    server.push = async req => {
      server.push = push;
      await tasks.create({ uuid: "a", title: "again", archived: false });
      return push(req);
    };
    await client.sync();
    server.push = push;
    expect(server.received.map(r => r.mutations[0].op)).toEqual(["delete", "create"]);
    expect(server.received[1].mutations[0].baseRev).toBe(0);
    expect((await storage.getRecord("App/Task|a"))?.state).toBe("synced");
    await client.sync();
    expect(await client.conflicts()).toEqual([]);
    expect(server.objects.get("App/Task|a")?.object.title).toBe("again");
  });

  it("a patch made while an async strategy awaits is kept", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    let entered!: () => void;
    const inside = new Promise<void>(r => (entered = r));
    const { server, client, tasks } = await setup({
      onConflict: async info => {
        entered();
        await gate;
        return new Map(info.result.conflicts.map(c => [c.path, { choose: "theirs" as const }]));
      }
    });
    server.serverWrite("App/Task", "a", { uuid: "a", title: "A", body: "1", archived: false });
    await client.sync();
    await tasks.patch("a", { title: "mine" });
    server.serverWrite("App/Task", "a", { uuid: "a", title: "theirs", body: "1", archived: false });
    const run = client.sync();
    await inside;
    await tasks.patch("a", { body: "edited" });
    release();
    await run;
    await client.sync();
    expect((await tasks.get("a")).body).toBe("edited");
  });

  it("setScopes during a running pull is not undone", async () => {
    const { server, client, tasks, storage } = await synced();
    const pull = server.pull.bind(server);
    server.pull = async req => {
      const res = await pull(req);
      await client.setScopes([{ model: "App/Task", query: "archived = TRUE" }]);
      return res;
    };
    await client.sync();
    server.pull = pull;
    expect(await storage.getMeta("cursor")).toBeUndefined();
    server.serverWrite("App/Task", "z", { uuid: "z", title: "Z", archived: true });
    await client.sync();
    expect((await tasks.query()).map(t => t.uuid)).toEqual(["z"]);
  });

  it("setScopes evicts synced records of models leaving the scopes", async () => {
    const { client, tasks, storage } = await synced();
    const local = await tasks.create({ title: "mine", archived: false });
    const events: any[] = [];
    client.on("change", e => events.push([e.ref.key, e.object]));
    await client.setScopes([{ model: "App/Other" }]);
    expect(await storage.getRecord("App/Task|a")).toBeUndefined();
    expect(events).toEqual([["a", null]]);
    expect(await storage.getRecord(`App/Task|${local.uuid}`)).toBeDefined();
  });

  it("ignores stale upserts and results of a discarded mutation", async () => {
    const { server, client, tasks, storage } = await synced();
    await tasks.patch("a", { title: "B" });
    const push = server.push.bind(server);
    server.push = async req => {
      await client.discard({ model: "App/Task", key: "a" });
      return push(req);
    };
    await client.sync();
    server.push = push;
    expect((await storage.getRecord("App/Task|a"))?.pendingMutationId).toBeUndefined();
    expect((await tasks.get("a")).title).toBe("B");
  });
});
