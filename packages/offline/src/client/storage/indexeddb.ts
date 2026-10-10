import type { LocalRecord } from "../record.js";
import type { StorageAdapter } from "./storage.js";

const RECORDS = "records";
const META = "meta";

/**
 * @param request - an IndexedDB request
 * @returns its result
 */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * @param tx - a transaction
 * @returns resolves when committed
 */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/**
 * Browser storage: one object store of records (indexed by model and pending flag) and one of metadata
 */
export class IndexedDBStorage implements StorageAdapter {
  protected db?: Promise<IDBDatabase>;

  /**
   * @param name - database name
   * @param factory - IndexedDB factory, `globalThis.indexedDB` by default
   */
  constructor(
    protected name: string,
    protected factory: IDBFactory = globalThis.indexedDB
  ) {}

  /**
   * @returns the opened database
   */
  protected open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const records = db.createObjectStore(RECORDS, { keyPath: "id" });
        records.createIndex("model", "ref.model");
        records.createIndex("pending", "pending");
        db.createObjectStore(META);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return this.db;
  }

  /**
   * @param row - a stored row
   * @returns the record without the index helper field
   */
  protected strip(row: any): LocalRecord | undefined {
    if (!row) return undefined;
    const { pending: _pending, ...record } = row;
    return record;
  }

  async getRecord(id: string): Promise<LocalRecord | undefined> {
    const db = await this.open();
    return this.strip(await done(db.transaction(RECORDS).objectStore(RECORDS).get(id)));
  }

  async putRecords(records: LocalRecord[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(RECORDS, "readwrite");
    const store = tx.objectStore(RECORDS);
    for (const record of records) store.put({ ...record, pending: record.state === "synced" ? 0 : 1 });
    await committed(tx);
  }

  async deleteRecords(ids: string[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(RECORDS, "readwrite");
    for (const id of ids) tx.objectStore(RECORDS).delete(id);
    await committed(tx);
  }

  async scan(model: string): Promise<LocalRecord[]> {
    const db = await this.open();
    const rows = await done(db.transaction(RECORDS).objectStore(RECORDS).index("model").getAll(model));
    return rows.map(row => this.strip(row)!);
  }

  async scanPending(): Promise<LocalRecord[]> {
    const db = await this.open();
    const rows = await done(db.transaction(RECORDS).objectStore(RECORDS).index("pending").getAll(1));
    return rows.map(row => this.strip(row)!);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return (await done(db.transaction(META).objectStore(META).get(key))) as T | undefined;
  }

  async setMeta<T>(key: string, value: T | undefined): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META, "readwrite");
    if (value === undefined) tx.objectStore(META).delete(key);
    else tx.objectStore(META).put(value, key);
    await committed(tx);
  }

  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([RECORDS, META], "readwrite");
    tx.objectStore(RECORDS).clear();
    tx.objectStore(META).clear();
    await committed(tx);
  }
}
