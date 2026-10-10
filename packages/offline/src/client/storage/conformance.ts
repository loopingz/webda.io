import { describe, expect, it } from "vitest";
import type { LocalRecord } from "../record.js";
import type { StorageAdapter } from "./storage.js";

/**
 * @param model - model id
 * @param key - key
 * @param state - state
 * @returns a record
 */
function record(model: string, key: string, state: LocalRecord["state"] = "synced"): LocalRecord {
  const ref = { model, key };
  return { id: `${model}|${key}`, ref, base: { title: key }, baseRev: 1, current: { title: key }, state };
}

/**
 * Behavior every StorageAdapter must have
 * @param name - adapter name
 * @param factory - creates an empty adapter
 */
export function storageConformance(name: string, factory: () => Promise<StorageAdapter>): void {
  describe(`${name} conformance`, () => {
    it("puts, gets and deletes records", async () => {
      const storage = await factory();
      await storage.putRecords([record("A", "1"), record("A", "2"), record("B", "1")]);
      expect((await storage.getRecord("A|1"))?.current).toEqual({ title: "1" });
      expect(await storage.getRecord("A|3")).toBeUndefined();
      await storage.deleteRecords(["A|1"]);
      expect(await storage.getRecord("A|1")).toBeUndefined();
    });

    it("scans by model and pending state", async () => {
      const storage = await factory();
      await storage.putRecords([record("A", "1"), record("A", "2", "dirty"), record("B", "1", "conflict")]);
      expect((await storage.scan("A")).map(r => r.id).sort()).toEqual(["A|1", "A|2"]);
      expect((await storage.scanPending()).map(r => r.id).sort()).toEqual(["A|2", "B|1"]);
      await storage.putRecords([{ ...record("A", "2"), state: "synced" }]);
      expect((await storage.scanPending()).map(r => r.id)).toEqual(["B|1"]);
    });

    it("returns copies, not live references", async () => {
      const storage = await factory();
      const r = record("A", "1");
      await storage.putRecords([r]);
      r.current.title = "mutated";
      const got = await storage.getRecord("A|1");
      expect(got?.current.title).toBe("1");
      got!.current.title = "mutated again";
      expect((await storage.getRecord("A|1"))?.current.title).toBe("1");
    });

    it("stores metadata and clears", async () => {
      const storage = await factory();
      await storage.setMeta("cursor", "abc");
      expect(await storage.getMeta("cursor")).toBe("abc");
      await storage.setMeta("cursor", undefined);
      expect(await storage.getMeta("cursor")).toBeUndefined();
      await storage.setMeta("scopes", [{ model: "A" }]);
      await storage.putRecords([record("A", "1")]);
      await storage.clear();
      expect(await storage.getMeta("scopes")).toBeUndefined();
      expect(await storage.scan("A")).toEqual([]);
    });
  });
}
