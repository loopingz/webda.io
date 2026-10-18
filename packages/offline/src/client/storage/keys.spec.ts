import { describe, expect, it } from "vitest";
import { EncryptedStorage, EncryptedStorageError } from "./encrypted.js";
import type { KeyProvider } from "./keys.js";
import { MemoryStorage } from "./memory.js";
import type { LocalRecord } from "../record.js";

const fakeProvider = (id: string): KeyProvider => {
  const raw = new TextEncoder().encode(id.padEnd(32, "x")).slice(0, 32);
  return {
    id,
    unlock: () => crypto.subtle.importKey("raw", raw, "AES-KW", false, ["wrapKey", "unwrapKey"])
  };
};

const record = (): LocalRecord => ({
  id: "Note#1",
  ref: { model: "Note", uuid: "1" } as any,
  base: null,
  baseRev: 0,
  current: { name: "secret" },
  state: "created"
});

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(EncryptedStorageError);
    return (e as EncryptedStorageError).code;
  }
  return undefined;
};

describe("EncryptedStorage key providers", () => {
  it("generates and wraps a data key on first unlock", async () => {
    const inner = new MemoryStorage();
    const s = new EncryptedStorage(inner);
    await s.unlock(fakeProvider("p1"));
    expect(s.isLocked()).toBe(false);
    const wrapped = await s.getMeta<string>("__encryption.keys.p1");
    expect(typeof wrapped).toBe("string");
    expect(atob(wrapped!).length).toBe(40); // 32 bytes + AES-KW overhead
    expect(await s.providers()).toEqual(["p1"]);
  });

  it("locks and unlocks again", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    await s.putRecords([record()]);
    s.lock();
    expect(s.isLocked()).toBe(true);
    expect(await code(s.getRecord("Note#1"))).toBe("LOCKED");
    await s.unlock(fakeProvider("p1"));
    expect(await s.getRecord("Note#1")).toEqual(record());
  });

  it("adds a provider that unlocks the same data", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    expect(await code(s.addProvider(fakeProvider("p2")))).toBe("LOCKED");
    await s.unlock(fakeProvider("p1"));
    await s.putRecords([record()]);
    await s.addProvider(fakeProvider("p2"));
    expect((await s.providers()).sort()).toEqual(["p1", "p2"]);
    s.lock();
    await s.unlock(fakeProvider("p2"));
    expect(await s.getRecord("Note#1")).toEqual(record());
  });

  it("rejects unknown and removed providers", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    await s.addProvider(fakeProvider("p2"));
    s.lock();
    expect(await code(s.unlock(fakeProvider("p3")))).toBe("NO_KEY");
    await s.unlock(fakeProvider("p2"));
    await s.removeProvider("p1");
    s.lock();
    expect(await code(s.unlock(fakeProvider("p1")))).toBe("NO_KEY");
  });

  it("refuses to remove the last provider", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    expect(await code(s.removeProvider("p1"))).toBe("LAST_PROVIDER");
    expect(await s.providers()).toEqual(["p1"]);
  });

  it("keeps the in-memory data key non-extractable and unusable for export", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    const key = (s as any).key as CryptoKey;
    expect(key.extractable).toBe(false);
    expect((key.algorithm as AesKeyAlgorithm).length).toBe(256);
  });

  it("fails with DECRYPT when the kek is wrong for an existing entry", async () => {
    const inner = new MemoryStorage();
    const s = new EncryptedStorage(inner);
    await s.unlock(fakeProvider("p1"));
    const bad: KeyProvider = { id: "p1", unlock: fakeProvider("other").unlock };
    s.lock();
    expect(await code(s.unlock(bad))).toBe("DECRYPT");
  });

  it("protects the reserved meta namespace", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    expect(await s.getMeta("__encryption.keys.p1")).toBeDefined();
    expect(await code(s.setMeta("__encryption.keys.p1", "x"))).toBe("RESERVED");
    expect(await code(s.setMeta("__encryption.foo", "x"))).toBe("RESERVED");
    await s.setMeta("other", 1);
    expect(await s.getMeta("other")).toBe(1);
  });

  it("drops the provider KEK when the data key is set or cleared directly", async () => {
    const s = new EncryptedStorage(new MemoryStorage());
    await s.unlock(fakeProvider("p1"));
    s.setDataKey(undefined);
    expect((s as any).active).toBeUndefined();
    s.setDataKey(await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]));
    expect(await code(s.addProvider(fakeProvider("p2")))).toBe("NO_KEY");
  });
});
