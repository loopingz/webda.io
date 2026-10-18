import { describe, expect, it } from "vitest";
import { storageConformance } from "./conformance.js";
import { EncryptedStorage, EncryptedStorageError } from "./encrypted.js";
import { MemoryStorage } from "./memory.js";
import type { LocalRecord } from "../record.js";

const testKey = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

const record = (): LocalRecord => ({
  id: "Note#1",
  ref: { model: "Note", uuid: "1" } as any,
  base: null,
  baseRev: 0,
  current: { name: "secret-name" },
  state: "created",
  pendingMutationId: "m1"
});

storageConformance("EncryptedStorage", async () => {
  const s = new EncryptedStorage(new MemoryStorage());
  s.setDataKey(await testKey());
  return s;
});

describe("EncryptedStorage", () => {
  it("stores no plaintext", async () => {
    const inner = new MemoryStorage();
    const s = new EncryptedStorage(inner);
    s.setDataKey(await testKey());
    const r = record();
    await s.putRecords([r]);
    const raw = await inner.getRecord(r.id);
    expect(JSON.stringify(raw)).not.toContain("secret-name");
    expect(raw!.id).toBe(r.id);
    expect(raw!.ref).toEqual(r.ref);
    expect(raw!.state).toBe(r.state);
    expect(await s.getRecord(r.id)).toEqual(r);
  });

  it("uses a fresh IV per write", async () => {
    const inner = new MemoryStorage();
    const s = new EncryptedStorage(inner);
    s.setDataKey(await testKey());
    await s.putRecords([record()]);
    const a = JSON.stringify(await inner.getRecord("Note#1"));
    await s.putRecords([record()]);
    expect(JSON.stringify(await inner.getRecord("Note#1"))).not.toBe(a);
  });

  it("refuses when locked", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    s.setDataKey(await testKey());
    await s.putRecords([record()]);
    s.setDataKey(undefined);
    expect(s.isLocked()).toBe(true);
    for (const op of [
      () => s.getRecord("Note#1"),
      () => s.scan("Note"),
      () => s.scanPending(),
      () => s.putRecords([record()])
    ]) {
      await expect(op()).rejects.toMatchObject({ code: "LOCKED" });
      await expect(op()).rejects.toBeInstanceOf(EncryptedStorageError);
    }
  });

  it("fails with DECRYPT on a wrong key", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    s.setDataKey(await testKey());
    await s.putRecords([record()]);
    s.setDataKey(await testKey());
    await expect(s.getRecord("Note#1")).rejects.toMatchObject({ code: "DECRYPT" });
  });
});
