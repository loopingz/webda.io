import * as WebdaQL from "@webda/ql";
import * as crypto from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { open } from "node:fs/promises";
import { Readable, Writable } from "node:stream";
import { createGzip } from "node:zlib";
import { CoreModel } from "../models/coremodel";
import { GunzipConditional } from "../utils/serializers";
import { Store, StoreFindResult, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "./store";
interface StorageMap {
  [key: string]: string;
}

/**
 * Memory store
 */
class MemoryStoreParameters extends StoreParameters {
  /**
   * Persist the data in a file
   */
  persistence?: {
    /**
     * File path to save to
     */
    path: string;
    /**
     * Encryption key for AES encryption
     */
    key?: string;
    /**
     * By default only save once every 1s if modified
     *
     * @default 1000
     */
    delay?: number;
    /**
     * cipher to use
     */
    cipher?: string;
    /**
     * Compression level to use
     * @default 9
     * @max 9
     * @min 0
     */
    compressionLevel?: number;
  };

  constructor(params: any, service: MemoryStore) {
    super(params, service);
    if (this.persistence) {
      this.persistence.delay ??= 1000;
      this.persistence.cipher ??= "aes-256-ctr";
      this.persistence.compressionLevel ??= 9;
    }
    // Memory store cannot be cached
    this.noCache = true;
  }
}

class LDJSONMemoryStreamWriter extends Readable {
  private data: any[];
  private index: number = 0;

  constructor(protected storage: any) {
    super();
    this.data = Object.keys(storage);
  }

  _read() {
    if (this.index >= this.data.length) {
      this.push(null);
      return;
    }
    const key = this.data[this.index++];
    this.push(key + "\t" + this.storage[key] + "\n");
  }
}

class LDJSONMemoryStreamReader extends Writable {
  current: string = "";
  oldFormat: string = undefined;
  firstBytes: boolean = true;
  constructor(protected data: any) {
    super();
  }

  /**
   * Handle old format by storing it to memory to JSON.parse it later
   * Or read the new format to avoid parsing
   *
   * @returns
   */
  _write(chunk: any, encoding: BufferEncoding, callback: (error?: Error) => void): void {
    if (this.firstBytes) {
      this.firstBytes = false;
      if (chunk[0] === "{".charCodeAt(0)) {
        this.oldFormat = "";
      }
    }
    if (this.oldFormat !== undefined) {
      this.oldFormat += chunk.toString();
      callback();
      return;
    }

    // Split by new line
    const res = chunk.toString().split("\n");
    // First chunk is the end of the last line
    res[0] = this.current + res[0];
    for (let i = 0; i < res.length - 1; i++) {
      const info = res[i];
      const split = info.indexOf("\t");
      this.data[info.substring(0, split)] = info.substring(split + 1);
    }
    this.current = res[res.length - 1];

    callback();
  }

  _final(callback: (error?: Error) => void): void {
    // Parse the content if old format
    if (this.oldFormat !== undefined) {
      let data = JSON.parse(this.oldFormat);
      for (let i in data) {
        this.data[i] = data[i];
      }
    }
    callback();
  }
}

/**
 * Store in Memory
 *
 * @category CoreServices
 * @WebdaModda
 */
class MemoryStore<
  T extends CoreModel = CoreModel,
  K extends MemoryStoreParameters = MemoryStoreParameters
> extends Store<T, K> {
  /**
   * Inmemory storage
   */
  storage: StorageMap = {};
  /**
   * Persistence timeout id
   */
  private persistenceTimeout;
  /**
   * Current persistence
   */
  persistencePromise = null;
  /**
   * AES encryption key
   */
  private key: Buffer;

  /**
   * Persist inmemory storage to file
   *
   * Called every this.parameters.persistence.delay ms
   */
  async persist() {
    if (this.persistenceTimeout) {
      clearTimeout(this.persistenceTimeout);
      this.persistenceTimeout = null;
    }
    const source = new LDJSONMemoryStreamWriter(this.storage);
    let pipeline: Readable = source;
    if (this.parameters.persistence.compressionLevel > 0) {
      pipeline = pipeline.pipe(
        createGzip({
          level: this.parameters.persistence.compressionLevel
        })
      );
    }

    const dest = createWriteStream(this.parameters.persistence.path);
    if (this.key) {
      let iv = crypto.randomBytes(16);
      let cipher = crypto.createCipheriv(this.parameters.persistence.cipher, this.key, iv);
      pipeline = pipeline.pipe(cipher);
      dest.write(iv);
    }
    pipeline.pipe(dest);
    await new Promise<void>((resolve, reject) => {
      dest.on("finish", () => {
        this.log("DEBUG", "Persisted memory data");
        resolve();
      });
      dest.on("error", err => {
        this.log("ERROR", "Cannot persist memory data", err);
        reject(err);
      });
    });
  }

  /**
   * Load a persisted memory data
   */
  async load() {
    let pipeline: Readable;
    if (this.key) {
      let fh = await open(this.parameters.persistence.path, "r");
      let iv = Buffer.alloc(16);
      await fh.read(iv, 0, 16);
      let decipher = crypto.createDecipheriv(this.parameters.persistence.cipher, this.key, iv);
      pipeline = fh.createReadStream({ start: 16 }).pipe(decipher);
    } else {
      pipeline = createReadStream(this.parameters.persistence.path);
    }
    // Uncompress if needed
    pipeline = pipeline.pipe(new GunzipConditional());

    const dest = new LDJSONMemoryStreamReader(this.storage);
    pipeline.pipe(dest);
    await new Promise<void>((resolve, reject) => {
      dest.on("finish", () => {
        this.log("DEBUG", "Load memory data");
        resolve();
      });
      dest.on("error", err => {
        reject(err);
      });
    });
  }

  /**
   * @override
   */
  loadParameters(params: any): MemoryStoreParameters {
    return new MemoryStoreParameters(params, this);
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    if (this.parameters.persistence) {
      if (this.parameters.persistence.key) {
        this.key = crypto.createHash("sha256").update(this.parameters.persistence.key).digest();
      }
      try {
        if (existsSync(this.parameters.persistence.path)) {
          this.storage = {};
          await this.load();
        }
      } catch (err) {
        this.log("INFO", "Cannot loaded persisted memory data", err);
        this.storage = {};
      }
      // Set a proxy if we need to delay the persistence
      if (this.parameters.persistence.delay > 0) {
        this.storage = new Proxy(this.storage, {
          set: (target: StorageMap, p: string, value: any): boolean => {
            target[p] = value;
            const timeout = async () => {
              // If we are already persisting, wait for it to finish
              if (this.persistencePromise) {
                this.persistenceTimeout ??= setTimeout(timeout, this.parameters.persistence.delay);
                return;
              }
              this.persistencePromise = this.persist();
              await this.persistencePromise;
              this.persistencePromise = null;
            };
            this.persistenceTimeout ??= setTimeout(timeout, this.parameters.persistence.delay);
            return true;
          }
        });
      }
    }
    return super.init();
  }

  /**
   * Ensure the store is saved if persistence is on
   */
  async stop(): Promise<void> {
    if (this.parameters.persistence) {
      await this.persist();
    }
  }

  /**
   * @override
   */
  async _exists(uid) {
    return this.storage[uid] !== undefined;
  }

  /**
   * @override
   */
  async find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    return this.simulateFind(query, Object.keys(this.storage));
  }

  /**
   * @override
   */
  async _save(object: T): Promise<T> {
    let uid = object.getUuid();
    this.storage[uid] = object.toStoredJSON(true);
    return this._getSync(uid);
  }

  /**
   * @override
   */
  async _delete(uid: string): Promise<void> {
    delete this.storage[uid];
  }

  /**
   * @override
   */
  async _patch(object: any, uuid: string, writeCondition?: any, writeConditionField?: string): Promise<T> {
    let obj = await this._get(uuid, true);
    this.checkUpdateCondition(obj, <keyof T>writeConditionField, writeCondition);
    for (let prop in object) {
      obj[prop] = object[prop];
    }
    this.storage[uuid] = obj.toStoredJSON(true);
    return this._getSync(uuid);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<T> {
    let obj = await this._get(uid, true);
    this.checkUpdateCondition(obj, <keyof T>writeConditionField, writeCondition);
    return this._save(object);
  }

  /**
   * @override
   */
  async getAll(uids?: string[]): Promise<any> {
    if (!uids) {
      return Object.keys(this.storage).map(key => {
        return this._getSync(key);
      });
    }
    let result = [];
    for (let i in uids) {
      if (this.storage[uids[i]]) {
        result.push(this._getSync(uids[i]));
      }
    }
    return result;
  }

  /**
   * Retrieve the object as model
   *
   * @param uid
   * @returns
   */
  _getSync(uid: string, raiseIfNotFound: boolean = false): T {
    if (this.storage[uid]) {
      return this.initModel(JSON.parse(this.storage[uid]));
    } else if (raiseIfNotFound) {
      throw new StoreNotFoundError(uid, this.getName());
    }
    return null;
  }

  /**
   * @override
   */
  async _removeAttribute(uuid: string, attribute: string, writeCondition?: any, writeConditionField?: string) {
    let res = await this._get(uuid, true);
    this.checkUpdateCondition(res, <keyof T>writeConditionField, writeCondition);
    delete res[attribute];
    this._save(res);
  }

  /**
   * @override
   */
  async _get(uid, raiseIfNotFound: boolean = false) {
    if (!this.storage[uid]) {
      if (raiseIfNotFound) {
        throw new StoreNotFoundError(uid, this.getName());
      }
      return;
    }
    return this._getSync(uid);
  }

  /**
   * @override
   */
  async __clean() {
    this.storage = {};
  }

  /**
   * @override
   */
  async _incrementAttributes(uid, params: { property: string; value: number }[], updateDate: Date) {
    const res = await this._get(uid, true);
    params.forEach(({ property: prop, value }) => {
      if (!res[prop]) {
        res[prop] = 0;
      }
      res[prop] += value;
    });
    res._lastUpdate = updateDate;
    return this._save(res);
  }

  /**
   * @inheritdoc
   */
  async _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ) {
    return this.simulateUpsertItemToCollection(
      this._getSync(uid, true),
      <any>prop,
      item,
      updateDate,
      index,
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  /**
   * @override
   */
  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    let res = await this._get(uid, true);
    if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    res[prop].splice(index, 1);
    res._lastUpdate = updateDate;
    return this._save(res);
  }
}

export { MemoryStore, MemoryStore as Plop, StorageMap };
