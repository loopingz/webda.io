import { describe, expect, it } from "vitest";
import { OfflineClient } from "./client.js";
import { MemoryStorage } from "./storage/memory.js";
import type { Transport } from "./transport/transport.js";

interface Task {
  uuid: string;
  title: string;
  done?: boolean;
}

const offline: Transport = {
  pull: async () => {
    throw new Error("offline");
  },
  push: async () => {
    throw new Error("offline");
  },
  snapshot: async () => {
    throw new Error("offline");
  }
};

/**
 * @returns a client and its storage
 */
function setup() {
  const storage = new MemoryStorage();
  const client = new OfflineClient({ storage, transport: offline, scopes: [{ model: "App/Task" }], syncInterval: 0 });
  return { storage, client, tasks: client.collection<Task>("App/Task") };
}

describe("Collection", () => {
  it("creates with a generated uuid and reads back", async () => {
    const { tasks, storage } = setup();
    const task = await tasks.create({ title: "a" });
    expect(task.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(await tasks.get(task.uuid)).toEqual(task);
    const record = await storage.getRecord(`App/Task|${task.uuid}`);
    expect(record?.state).toBe("created");
    expect(record?.baseRev).toBe(0);
    await expect(tasks.create({ uuid: task.uuid, title: "dup" })).rejects.toThrow(/exists/);
  });

  it("patches and deletes a synced object", async () => {
    const { tasks, storage } = setup();
    await storage.putRecords([
      {
        id: "App/Task|t1",
        ref: { model: "App/Task", key: "t1" },
        base: { uuid: "t1", title: "a" },
        baseRev: 3,
        current: { uuid: "t1", title: "a" },
        state: "synced"
      }
    ]);
    const patched = await tasks.patch("t1", { done: true });
    expect(patched).toEqual({ uuid: "t1", title: "a", done: true });
    expect((await storage.getRecord("App/Task|t1"))?.state).toBe("dirty");
    await tasks.delete("t1");
    const record = await storage.getRecord("App/Task|t1");
    expect(record?.state).toBe("deleted");
    expect(record?.current).toBeNull();
    expect(await tasks.get("t1")).toBeUndefined();
  });

  it("deleting a local create forgets it", async () => {
    const { tasks, storage } = setup();
    const task = await tasks.create({ title: "a" });
    await tasks.delete(task.uuid);
    expect(await storage.getRecord(`App/Task|${task.uuid}`)).toBeUndefined();
  });

  it("queries locally with WebdaQL", async () => {
    const { tasks } = setup();
    await tasks.create({ title: "a", done: true });
    await tasks.create({ title: "b", done: false });
    const deleted = await tasks.create({ title: "c", done: false });
    await tasks.delete(deleted.uuid);
    expect((await tasks.query("done = FALSE")).map(t => t.title)).toEqual(["b"]);
    expect((await tasks.query()).length).toBe(2);
  });

  it("emits local change events", async () => {
    const { tasks } = setup();
    const events: any[] = [];
    const off = tasks.on("change", e => events.push(e));
    const task = await tasks.create({ title: "a" });
    await tasks.patch(task.uuid, { title: "b" });
    off();
    await tasks.delete(task.uuid);
    expect(events.map(e => [e.origin, e.object?.title ?? null])).toEqual([
      ["local", "a"],
      ["local", "b"]
    ]);
  });

  it("refuses to patch a missing object or one in conflict", async () => {
    const { tasks, storage } = setup();
    await expect(tasks.patch("nope", { title: "x" })).rejects.toThrow(/not found/);
    await storage.putRecords([
      {
        id: "App/Task|c",
        ref: { model: "App/Task", key: "c" },
        base: { uuid: "c", title: "a" },
        baseRev: 1,
        current: { uuid: "c", title: "b" },
        state: "conflict"
      }
    ]);
    await expect(tasks.patch("c", { title: "x" })).rejects.toThrow(/conflict/);
  });

  it("supports composite keys", async () => {
    const storage = new MemoryStorage();
    const client = new OfflineClient({
      storage,
      transport: offline,
      scopes: [],
      syncInterval: 0,
      primaryKeys: { "App/Member": ["org", "user"] }
    });
    const members = client.collection<any>("App/Member");
    await members.create({ org: "o", user: "u", role: "admin" });
    expect((await members.get({ org: "o", user: "u" }))?.role).toBe("admin");
    expect(await storage.getRecord('App/Member|["o","u"]')).toBeDefined();
    await expect(members.create({ org: "o" })).rejects.toThrow(/key/);
  });
});
