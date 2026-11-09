/**
 * Local key-value storage of a device: holds the device blob (the keyring key wrapped by the device KEK, and the
 * encrypted keyring) and the pinned public key fingerprint. Nothing stored here is ever sent to the server.
 */
export interface DeviceStorage {
  /**
   * Return the value, undefined when missing
   * @param key - storage key
   * @returns the value, undefined when missing
   */
  get(key: string): Promise<string | undefined>;
  /**
   * Perform set
   * @param key - storage key
   * @param value - value
   */
  set(key: string, value: string): Promise<void>;
  /**
   * Remove a key, no-op when missing
   * @param key - storage key
   */
  delete(key: string): Promise<void>;
}

/** In-memory storage, for tests and for sessions that must leave no trace */
export class MemoryStorage implements DeviceStorage {
  /**
   * Values
   */
  protected values = new Map<string, string>();

  /**
   * Return the value, undefined when missing
   * @param key - storage key
   * @returns the value, undefined when missing
   */
  async get(key: string): Promise<string | undefined> {
    return this.values.get(key);
  }

  /**
   * Perform set
   * @param key - storage key
   * @param value - value
   */
  async set(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  /**
   * Delete operation
   * @param key - storage key, no-op when missing
   */
  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

const STORE = "kv";

/**
 * Return its result
 * @param request - an IndexedDB request
 * @returns its result
 */
function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Browser storage: one IndexedDB object store of strings */
export class IndexedDBStorage implements DeviceStorage {
  /**
   * Database client
   */
  protected db?: Promise<IDBDatabase>;

  /**
   * Create a new IndexedDBStorage instance
   * @param name - database name
   * @param factory - IndexedDB factory, `globalThis.indexedDB` by default
   */
  constructor(
    protected name: string = "webda-sealed",
    protected factory: IDBFactory = globalThis.indexedDB
  ) {}

  /**
   * Open operation
   * @returns the opened database
   */
  protected open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
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
   * Run a write and wait for its transaction to commit
   * @param write - operation on the object store
   */
  protected async write(write: (store: IDBObjectStore) => void): Promise<void> {
    const tx = (await this.open()).transaction(STORE, "readwrite");
    const committed = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    write(tx.objectStore(STORE));
    await committed;
  }

  /**
   * Return the value, undefined when missing
   * @param key - storage key
   * @returns the value, undefined when missing
   */
  async get(key: string): Promise<string | undefined> {
    const db = await this.open();
    return (await done<string | undefined>(db.transaction(STORE).objectStore(STORE).get(key))) ?? undefined;
  }

  /**
   * Perform set
   * @param key - storage key
   * @param value - value
   */
  async set(key: string, value: string): Promise<void> {
    await this.write(store => store.put(value, key));
  }

  /**
   * Delete operation
   * @param key - storage key, no-op when missing
   */
  async delete(key: string): Promise<void> {
    await this.write(store => store.delete(key));
  }
}
