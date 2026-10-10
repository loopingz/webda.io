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
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const records = db.createObjectStore(RECORDS, { keyPath: "id" });
        records.createIndex("model", "ref.model");
        records.createIndex("pending", "pending");
        db.createObjectStore(META);
      };
      request.onsuccess = () => {
        const db = request.result;
        // Another tab upgrades the database: release it, the next call reopens
        db.onversionchange = () => {
          db.close();
          this.db = undefined;
        };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
    }).catch(err => {
      // Do not cache a failed open: the next call retries
      this.db = undefined;
      throw err;
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

  /**
   *
   * @param id - the id
   * @returns the record, undefined when missing
   */
  async getRecord(id: string): Promise<LocalRecord | undefined> {
    const db = await this.open();
    return this.strip(await done(db.transaction(RECORDS).objectStore(RECORDS).get(id)));
  }

  /**
   *
   * @param records - the records
   */
  async putRecords(records: LocalRecord[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(RECORDS, "readwrite");
    const store = tx.objectStore(RECORDS);
    const done = committed(tx);
    try {
      for (const record of records) store.put({ ...record, pending: record.state === "synced" ? 0 : 1 });
    } catch (err) {
      // put throws synchronously (DataCloneError): drop the puts already queued
      done.catch(() => {});
      tx.abort();
      throw err;
    }
    await done;
  }

  /**
   *
   * @param ids - the ids
   */
  async deleteRecords(ids: string[]): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(RECORDS, "readwrite");
    for (const id of ids) tx.objectStore(RECORDS).delete(id);
    await committed(tx);
  }

  /**
   *
   * @param model - the model
   * @returns every record of the model
   */
  async scan(model: string): Promise<LocalRecord[]> {
    const db = await this.open();
    const rows = await done(db.transaction(RECORDS).objectStore(RECORDS).index("model").getAll(model));
    return rows.map(row => this.strip(row)!);
  }

  /**
   *
   * @returns every record not synced
   */
  async scanPending(): Promise<LocalRecord[]> {
    const db = await this.open();
    const rows = await done(db.transaction(RECORDS).objectStore(RECORDS).index("pending").getAll(1));
    return rows.map(row => this.strip(row)!);
  }

  /**
   *
   * @param key - the key
   * @returns the value, undefined when missing
   */
  async getMeta<T>(key: string): Promise<T | undefined> {
    const db = await this.open();
    return (await done(db.transaction(META).objectStore(META).get(key))) as T | undefined;
  }

  /**
   *
   * @param key - the key
   * @param value - the value
   */
  async setMeta<T>(key: string, value: T | undefined): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(META, "readwrite");
    if (value === undefined) tx.objectStore(META).delete(key);
    else tx.objectStore(META).put(value, key);
    await committed(tx);
  }

  /**
   *
   */
  async clear(): Promise<void> {
    const db = await this.open();
    const tx = db.transaction([RECORDS, META], "readwrite");
    tx.objectStore(RECORDS).clear();
    tx.objectStore(META).clear();
    await committed(tx);
  }
}
