import type { LocalRecord } from "../record.js";
import type { StorageAdapter } from "./storage.js";

/** Record fields that are encrypted; every other field stays readable for indexing */
const ENCRYPTED_FIELDS = ["base", "current", "sent", "conflict", "error"] as const;

/** Length in bytes of the AES-GCM initialization vector */
const IV_LENGTH = 12;

/**
 * Error raised by {@link EncryptedStorage}
 */
export class EncryptedStorageError extends Error {
  /**
   * @param code - LOCKED when no data key is set, DECRYPT when a record cannot be decrypted
   * @param message - human readable detail
   */
  constructor(
    public readonly code: "LOCKED" | "DECRYPT",
    message: string = code
  ) {
    super(message);
    this.name = "EncryptedStorageError";
  }
}

/**
 * Stored shape of an encrypted record
 */
interface EncryptedRecord extends Pick<LocalRecord, "id" | "ref" | "state" | "baseRev" | "pendingMutationId"> {
  /** AES-GCM output */
  payload: { iv: string; data: string };
}

/**
 * @param bytes - raw bytes
 * @returns base64 string
 */
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/**
 * @param value - base64 string
 * @returns raw bytes
 */
function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

/**
 * StorageAdapter decorator that encrypts record contents with AES-256-GCM.
 * Only `id`, `ref`, `state`, `baseRev` and `pendingMutationId` stay in clear; metadata is not encrypted.
 */
export class EncryptedStorage implements StorageAdapter {
  private key: CryptoKey | undefined;

  /**
   * @param inner - storage holding the encrypted records
   */
  constructor(private readonly inner: StorageAdapter) {}

  /**
   * Set or clear the data key
   * @param key - AES-GCM key, or undefined to lock the storage
   */
  setDataKey(key: CryptoKey | undefined): void {
    this.key = key;
  }

  /**
   * @returns true when no data key is set
   */
  isLocked(): boolean {
    return this.key === undefined;
  }

  /**
   * @returns the data key
   * @throws EncryptedStorageError LOCKED when no key is set
   */
  private requireKey(): CryptoKey {
    if (!this.key) throw new EncryptedStorageError("LOCKED", "Storage is locked");
    return this.key;
  }

  /**
   * @param record - clear record
   * @returns the record with its sensitive fields encrypted
   */
  private async encrypt(record: LocalRecord): Promise<LocalRecord> {
    const key = this.requireKey();
    const secret: Record<string, unknown> = {};
    for (const f of ENCRYPTED_FIELDS) if (record[f] !== undefined) secret[f] = record[f];
    // structuredClone throws on values JSON would silently drop (functions), like the other adapters
    const plain = new TextEncoder().encode(JSON.stringify(structuredClone(secret)));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const data = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(structuredClone(secret)))
    );
    const stored: EncryptedRecord = {
      id: record.id,
      ref: record.ref,
      state: record.state,
      baseRev: record.baseRev,
      pendingMutationId: record.pendingMutationId,
      payload: { iv: toBase64(iv), data: toBase64(new Uint8Array(data)) }
    };
    if (stored.pendingMutationId === undefined) delete stored.pendingMutationId;
    return stored as unknown as LocalRecord;
  }

  /**
   * @param stored - record as held by the inner storage
   * @returns the clear record
   * @throws EncryptedStorageError DECRYPT when the key is wrong or the data tampered
   */
  private async decrypt(stored: LocalRecord): Promise<LocalRecord> {
    const key = this.requireKey();
    const { payload, ...clear } = stored as unknown as EncryptedRecord;
    try {
      const data = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(payload.iv) },
        key,
        fromBase64(payload.data)
      );
      return { ...clear, ...JSON.parse(new TextDecoder().decode(data)) } as LocalRecord;
    } catch (err) {
      throw new EncryptedStorageError("DECRYPT", `Cannot decrypt record ${stored.id}: ${(err as Error).message}`);
    }
  }

  /**
   * @param id - the id
   * @returns the decrypted record, undefined when missing
   */
  async getRecord(id: string): Promise<LocalRecord | undefined> {
    this.requireKey();
    const stored = await this.inner.getRecord(id);
    return stored && this.decrypt(stored);
  }

  /**
   * @param records - the records, all encrypted before any is written
   */
  async putRecords(records: LocalRecord[]): Promise<void> {
    this.requireKey();
    await this.inner.putRecords(await Promise.all(records.map(r => this.encrypt(r))));
  }

  /**
   * @param ids - the ids
   * @returns resolved once deleted
   */
  deleteRecords(ids: string[]): Promise<void> {
    return this.inner.deleteRecords(ids);
  }

  /**
   * @param model - the model
   * @returns every decrypted record of the model
   */
  async scan(model: string): Promise<LocalRecord[]> {
    this.requireKey();
    return Promise.all((await this.inner.scan(model)).map(r => this.decrypt(r)));
  }

  /**
   * @returns every decrypted record whose state is not synced
   */
  async scanPending(): Promise<LocalRecord[]> {
    this.requireKey();
    return Promise.all((await this.inner.scanPending()).map(r => this.decrypt(r)));
  }

  /**
   * @param key - the key
   * @returns the value, metadata is not encrypted
   */
  getMeta<T>(key: string): Promise<T | undefined> {
    return this.inner.getMeta<T>(key);
  }

  /**
   * @param key - the key
   * @param value - the value, undefined removes the key
   * @returns resolved once stored
   */
  setMeta<T>(key: string, value: T | undefined): Promise<void> {
    return this.inner.setMeta(key, value);
  }

  /**
   * Remove every record and metadata
   * @returns resolved once cleared
   */
  clear(): Promise<void> {
    return this.inner.clear();
  }
}
