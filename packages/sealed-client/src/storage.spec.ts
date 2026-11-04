import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { IndexedDBStorage, MemoryStorage, type DeviceStorage } from "./storage.js";

/**
 * Behaviour shared by every DeviceStorage
 * @param name - adapter name
 * @param create - adapter factory
 */
function conformance(name: string, create: () => DeviceStorage) {
  describe(name, () => {
    it("gets, sets, overwrites and deletes strings", async () => {
      const s = create();
      expect(await s.get("a")).toBeUndefined();
      await s.set("a", "1");
      await s.set("b", "2");
      expect(await s.get("a")).toBe("1");
      await s.set("a", "3");
      expect(await s.get("a")).toBe("3");
      await s.delete("a");
      expect(await s.get("a")).toBeUndefined();
      expect(await s.get("b")).toBe("2");
      // Deleting a missing key is a no-op
      await s.delete("missing");
    });
  });
}

conformance("MemoryStorage", () => new MemoryStorage());
let n = 0;
conformance("IndexedDBStorage", () => new IndexedDBStorage(`sealed-test-${n++}`));

describe("indexedDbStorage", () => {
  it("persists across instances of the same database", async () => {
    await new IndexedDBStorage("sealed-persist").set("webda-sealed:pin:u1", "fp");
    expect(await new IndexedDBStorage("sealed-persist").get("webda-sealed:pin:u1")).toBe("fp");
  });

  it("retries opening after a failure", async () => {
    let failures = 1;
    const factory = {
      open(name: string, version: number) {
        if (failures-- > 0) {
          const request: any = {};
          setTimeout(() => {
            request.error = new Error("blocked by the browser");
            request.onerror?.();
          });
          return request;
        }
        return indexedDB.open(name, version);
      }
    } as IDBFactory;
    const s = new IndexedDBStorage("sealed-retry", factory);
    await expect(s.get("a")).rejects.toThrow("blocked by the browser");
    await s.set("a", "1");
    expect(await s.get("a")).toBe("1");
  });

  it("releases the database when another connection deletes it, then reopens", async () => {
    const s = new IndexedDBStorage("sealed-versionchange");
    await s.set("a", "1");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase("sealed-versionchange");
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    expect(await s.get("a")).toBeUndefined();
    await s.set("a", "2");
    expect(await s.get("a")).toBe("2");
  });
});
