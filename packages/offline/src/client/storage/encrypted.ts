import type { LocalRecord } from "../record.js";
import type { KeyProvider } from "./keys.js";
import type { StorageAdapter } from "./storage.js";

/** Record fields that are encrypted; every other field stays readable for indexing */
const ENCRYPTED_FIELDS = ["base", "current", "sent", "conflict", "error"] as const;

/** Length in bytes of the AES-GCM initialization vector */
const IV_LENGTH = 12;

/** Reserved meta namespace, written only by this class */
const RESERVED_PREFIX = "__encryption.";

/** Meta key prefix of the wrapped data key copies, one per provider id */
const KEYS_PREFIX = `${RESERVED_PREFIX}keys.`;

/** Meta key holding the list of provider ids */
const PROVIDERS_KEY = `${RESERVED_PREFIX}providers`;

/** Error codes of {@link EncryptedStorageError} */
export type EncryptedStorageErrorCode = "LOCKED" | "DECRYPT" | "NO_KEY" | "LAST_PROVIDER" | "RESERVED";

/**
 * Error raised by {@link EncryptedStorage}
 */
export class EncryptedStorageError extends Error {
  /**
   * @param code - LOCKED when no data key is set, DECRYPT when a record or wrapped key cannot be decrypted,
   * NO_KEY when no wrapped key exists for the provider, LAST_PROVIDER when removing the only provider,
   * RESERVED when writing the reserved meta namespace
   * @param message - human readable detail
   */
  constructor(
    public readonly code: EncryptedStorageErrorCode,
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
  /** Provider that unlocked the storage with its non-extractable KEK, used to re-wrap the data key in addProvider */
  private active: { id: string; kek: CryptoKey } | undefined;

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
   * Unlock the storage with a provider. When no provider is registered yet, a random AES-256-GCM data key is
   * generated and wrapped for this provider.
   * @param provider - the key provider
   * @throws EncryptedStorageError NO_KEY when providers exist but none for this id, DECRYPT when the KEK is wrong
   */
  async unlock(provider: KeyProvider): Promise<void> {
    const ids = await this.providers();
    const kek = await provider.unlock();
    if (ids.length === 0) {
      // extractable only so it can be wrapped; the key kept in memory is the non-extractable unwrapped copy
      const fresh = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      await this.storeWrapped(provider.id, kek, fresh);
      await this.inner.setMeta(PROVIDERS_KEY, [provider.id]);
    } else if (!ids.includes(provider.id)) {
      throw new EncryptedStorageError("NO_KEY", `No key registered for provider ${provider.id}`);
    }
    this.key = await this.unwrap(provider.id, kek, false);
    this.active = { id: provider.id, kek };
  }

  /**
   * Forget the data key and the provider KEK
   */
  lock(): void {
    this.key = undefined;
    this.active = undefined;
  }

  /**
   * Register another provider able to unlock the same data key. The data key is unwrapped as an extractable copy
   * from the unlocking provider's entry for the duration of the call only.
   * @param provider - the provider to add
   * @throws EncryptedStorageError LOCKED when locked, NO_KEY when the unlocking provider was removed
   */
  async addProvider(provider: KeyProvider): Promise<void> {
    this.requireKey();
    const { id, kek } = this.active!;
    if ((await this.inner.getMeta(KEYS_PREFIX + id)) === undefined)
      throw new EncryptedStorageError("NO_KEY", `Unlocking provider ${id} was removed`);
    const copy = await this.unwrap(id, kek, true);
    await this.storeWrapped(provider.id, await provider.unlock(), copy);
    const ids = await this.providers();
    if (!ids.includes(provider.id)) await this.inner.setMeta(PROVIDERS_KEY, [...ids, provider.id]);
  }

  /**
   * Remove a provider's wrapped key
   * @param id - provider id
   * @throws EncryptedStorageError LAST_PROVIDER when it is the only provider
   */
  async removeProvider(id: string): Promise<void> {
    const ids = await this.providers();
    if (!ids.includes(id)) return;
    if (ids.length === 1) throw new EncryptedStorageError("LAST_PROVIDER", "Cannot remove the last key provider");
    await this.inner.setMeta(
      PROVIDERS_KEY,
      ids.filter(i => i !== id)
    );
    await this.inner.setMeta(KEYS_PREFIX + id, undefined);
  }

  /**
   * @returns the ids of the registered providers
   */
  async providers(): Promise<string[]> {
    return (await this.inner.getMeta<string[]>(PROVIDERS_KEY)) ?? [];
  }

  /**
   * @param id - provider id
   * @param kek - the provider KEK
   * @param dataKey - extractable data key
   */
  private async storeWrapped(id: string, kek: CryptoKey, dataKey: CryptoKey): Promise<void> {
    const wrapped = await crypto.subtle.wrapKey("raw", dataKey, kek, "AES-KW");
    await this.inner.setMeta(KEYS_PREFIX + id, toBase64(new Uint8Array(wrapped)));
  }

  /**
   * @param id - provider id
   * @param kek - the provider KEK
   * @param extractable - whether the unwrapped key is extractable
   * @returns the AES-GCM data key
   * @throws EncryptedStorageError DECRYPT when the KEK cannot unwrap the entry
   */
  private async unwrap(id: string, kek: CryptoKey, extractable: boolean): Promise<CryptoKey> {
    const wrapped = await this.inner.getMeta<string>(KEYS_PREFIX + id);
    if (wrapped === undefined) throw new EncryptedStorageError("NO_KEY", `No key registered for provider ${id}`);
    try {
      return await crypto.subtle.unwrapKey(
        "raw",
        fromBase64(wrapped),
        kek,
        "AES-KW",
        { name: "AES-GCM" },
        extractable,
        ["encrypt", "decrypt"]
      );
    } catch (err) {
      throw new EncryptedStorageError("DECRYPT", `Cannot unwrap data key for ${id}: ${(err as Error).message}`);
    }
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
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
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
   * @throws EncryptedStorageError RESERVED for keys in the `__encryption.` namespace
   */
  async setMeta<T>(key: string, value: T | undefined): Promise<void> {
    if (key.startsWith(RESERVED_PREFIX)) throw new EncryptedStorageError("RESERVED", `Meta key ${key} is reserved`);
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
