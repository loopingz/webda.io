import { describe, expect, it } from "vitest";
import { EntityCache, MemoryCacheStorage, WebStorageCacheStorage } from "./cache.js";

/**
 * @returns a minimal Web Storage
 */
function webStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    key: (index: number) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
    map
  };
}

describe("EntityCache", () => {
  it("stores entities and queries, with a ttl", () => {
    const cache = new EntityCache({ ttl: 1000 });
    expect(cache.getEntity("App/Task", "t1")).toBeUndefined();
    cache.setEntity("App/Task", "t1", { uuid: "t1", title: "a" });
    const entry = cache.getEntity("App/Task", "t1")!;
    expect(entry.data).toEqual({ uuid: "t1", title: "a" });
    expect(cache.isFresh(entry)).toBe(true);
    expect(cache.isFresh({ at: Date.now() - 2000 })).toBe(false);
    expect(cache.isFresh(undefined)).toBe(false);
    expect(cache.mergeEntity("App/Task", "t1", { title: "b" })).toEqual({ uuid: "t1", title: "b" });
    cache.setQuery("App/Task", "status = 'open'", ["t1"], "10");
    expect(cache.getQuery("App/Task", "status = 'open'")).toMatchObject({ uids: ["t1"], continuationToken: "10" });
    cache.invalidate("App/Task");
    expect(cache.getQuery("App/Task", "status = 'open'")).toBeUndefined();
    expect(cache.getEntity("App/Task", "t1")).toBeDefined();
    cache.deleteEntity("App/Task", "t1");
    expect(cache.getEntity("App/Task", "t1")).toBeUndefined();
  });

  it("emits change events", () => {
    const cache = new EntityCache();
    const events: unknown[] = [];
    const off = cache.on("change", event => events.push(event));
    cache.setEntity("App/Task", "t1", {});
    cache.invalidate("App/Task", "App/Item");
    cache.deleteEntity("App/Task", "t1");
    off();
    cache.setEntity("App/Task", "t2", {});
    expect(events).toEqual([
      { model: "App/Task", uid: "t1", type: "set" },
      { model: "App/Task", type: "invalidate" },
      { model: "App/Item", type: "invalidate" },
      { model: "App/Task", uid: "t1", type: "delete" }
    ]);
  });

  it("evicts the oldest entities beyond maxEntries", () => {
    const cache = new EntityCache({ maxEntries: 2 });
    const storage = (cache as any).storage as MemoryCacheStorage;
    cache.setEntity("App/Task", "t1", {});
    storage.set("e|App/Task|t1", JSON.stringify({ data: {}, at: 1 }));
    cache.setEntity("App/Task", "t2", {});
    cache.setEntity("App/Task", "t3", {});
    expect(cache.getEntity("App/Task", "t1")).toBeUndefined();
    expect(cache.getEntity("App/Task", "t2")).toBeDefined();
    expect(cache.getEntity("App/Task", "t3")).toBeDefined();
  });

  it("drops an unreadable entry", () => {
    const cache = new EntityCache();
    const storage = (cache as any).storage as MemoryCacheStorage;
    storage.set("e|App/Task|t1", "{not json");
    expect(cache.getEntity("App/Task", "t1")).toBeUndefined();
    expect(storage.keys()).toEqual([]);
    cache.setEntity("App/Task", "t1", {});
    cache.clear();
    expect(storage.keys()).toEqual([]);
  });

  it("works over a Web Storage", () => {
    const web = webStorage();
    web.setItem("other", "x");
    const storage = new WebStorageCacheStorage(web, "sdk:");
    const cache = new EntityCache({ storage, ttl: 1000 });
    cache.setEntity("App/Task", "t1", { title: "a" });
    expect(web.map.has("sdk:e|App/Task|t1")).toBe(true);
    expect(storage.keys()).toEqual(["e|App/Task|t1"]);
    expect(cache.getEntity("App/Task", "t1")?.data).toEqual({ title: "a" });
    storage.clear();
    expect([...web.map.keys()]).toEqual(["other"]);
    // Quota errors are swallowed
    const full = new WebStorageCacheStorage({
      ...web,
      setItem: () => {
        throw new Error("QuotaExceededError");
      }
    });
    expect(() => full.set("k", "v")).not.toThrow();
  });
  it("reads a missing Web Storage key as undefined and merges into a missing entity", () => {
    const storage = new WebStorageCacheStorage(webStorage());
    expect(storage.get("nope")).toBeUndefined();
    const cache = new EntityCache({ storage });
    expect(cache.mergeEntity("App/Task", "t9", { title: "new" })).toEqual({ title: "new" });
    expect(cache.getEntity("App/Task", "t9")?.data).toEqual({ title: "new" });
  });

  it("evicts entities without a timestamp first", () => {
    const cache = new EntityCache({ maxEntries: 1 });
    const storage = (cache as any).storage as MemoryCacheStorage;
    cache.setEntity("App/Task", "t1", {});
    storage.set("e|App/Task|old", JSON.stringify({ data: {} }));
    cache.setEntity("App/Task", "t2", {});
    expect(storage.keys()).toEqual(["e|App/Task|t2"]);
  });
});
