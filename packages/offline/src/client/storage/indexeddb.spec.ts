import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { storageConformance } from "./conformance.js";
import { IndexedDBStorage } from "./indexeddb.js";

let n = 0;
storageConformance("IndexedDBStorage", async () => new IndexedDBStorage(`test-${n++}`));

describe("IndexedDBStorage open", () => {
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
    } as unknown as IDBFactory;
    const storage = new IndexedDBStorage(`retry-${n++}`, factory);
    await expect(storage.getRecord("A|1")).rejects.toThrow(/blocked/);
    expect(await storage.getRecord("A|1")).toBeUndefined();
  });

  it("closes on versionchange so another tab can upgrade", async () => {
    const name = `upgrade-${n++}`;
    const storage = new IndexedDBStorage(name);
    await storage.getRecord("A|1");
    const upgraded = await new Promise<string>(resolve => {
      const request = indexedDB.open(name, 2);
      request.onblocked = () => resolve("blocked");
      request.onsuccess = () => {
        request.result.close();
        resolve("upgraded");
      };
    });
    expect(upgraded).toBe("upgraded");
  });
});
