import * as crypto from "crypto";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { CoreModel } from "../models/coremodel";
import {
  Store,
  StoreFindResult,
  StoreNotFoundError,
  StoreParameters,
  UpdateConditionFailError,
} from "./store";
import { WebdaQL } from "./webdaql/query";

interface StorageMap {
  [key: string]: any;
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
  };

  constructor(params: any, service: MemoryStore) {
    super(params, service);
    if (this.persistence) {
      this.persistence.delay ??= 1000;
      this.persistence.cipher ??= "aes-256-ctr";
    }
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
   * AES encryption key
   */
  private key: Buffer;

  /**
   * Persist inmemory storage to file
   *
   * Called every this.parameters.persistence.delay ms
   */
  persist() {
    writeFileSync(this.parameters.persistence.path, this.encrypt());
    this.persistenceTimeout = null;
  }

  /**
   * Encrypt data with provided key
   * @returns
   */
  encrypt() {
    let data = JSON.stringify(this.storage, undefined, 2);
    if (!this.key) {
      return data;
    }
    // Initialization Vector
    let iv = crypto.randomBytes(16);
    let cipher = crypto.createCipheriv(
      this.parameters.persistence.cipher,
      this.key,
      iv
    );
    return Buffer.concat([
      iv,
      cipher.update(Buffer.from(data)),
      cipher.final(),
    ]).toString("base64");
  }

  /**
   * Decrypt data with provided key
   * @param data
   * @returns
   */
  decrypt(data: string) {
    if (!this.key) {
      return data;
    }
    let input = Buffer.from(data, "base64");
    let iv = input.slice(0, 16);
    let decipher = crypto.createDecipheriv(
      this.parameters.persistence.cipher,
      this.key,
      iv
    );
    return (
      decipher.update(input.slice(16)).toString() + decipher.final().toString()
    );
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
        this.key = crypto
          .createHash("sha256")
          .update(this.parameters.persistence.key)
          .digest();
      }
      try {
        if (existsSync(this.parameters.persistence.path)) {
          this.storage = JSON.parse(
            this.decrypt(
              readFileSync(this.parameters.persistence.path).toString()
            )
          );
        }
      } catch (err) {
        this.log("INFO", "Cannot loaded persisted memory data", err);
        this.storage = {};
      }
      this.storage = new Proxy(this.storage, {
        set: (target: StorageMap, p: string, value: any): boolean => {
          target[p] = value;
          this.persistenceTimeout ??= setTimeout(
            () => this.persist(),
            this.parameters.persistence.delay
          );
          return true;
        },
      });
    }
    return super.init();
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
    let uid = object[this._uuidField];
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
  async _patch(
    object: any,
    uuid: string,
    writeCondition?: any,
    writeConditionField?: string
  ): Promise<T> {
    let obj = await this._get(uuid, true);
    this.checkUpdateCondition(
      obj,
      <keyof T>writeConditionField,
      writeCondition
    );
    for (let prop in object) {
      obj[prop] = object[prop];
    }
    this.storage[uuid] = obj.toStoredJSON(true);
    return this._getSync(uuid);
  }

  /**
   * @override
   */
  async _update(
    object: any,
    uid: string,
    writeCondition?: any,
    writeConditionField?: string
  ): Promise<T> {
    let obj = await this._get(uid, true);
    this.checkUpdateCondition(
      obj,
      <keyof T>writeConditionField,
      writeCondition
    );
    return this._save(object);
  }

  /**
   * @override
   */
  async getAll(uids?: string[]): Promise<any> {
    if (!uids) {
      return Object.keys(this.storage).map((key) => {
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
  async _removeAttribute(
    uuid: string,
    attribute: string,
    writeCondition?: any,
    writeConditionField?: string
  ) {
    let res = await this._get(uuid, true);
    this.checkUpdateCondition(
      res,
      <keyof T>writeConditionField,
      writeCondition
    );
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
  async _incrementAttributes(
    uid,
    params: { property: string; value: number }[],
    updateDate: Date
  ) {
    const res = await this._get(uid, true);
    params.forEach(({ property: prop, value }) => {
      if (!res[prop]) {
        res[prop] = 0;
      }
      res[prop] += value;
    });
    res[this._lastUpdateField] = updateDate;
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
  async _deleteItemFromCollection(
    uid,
    prop,
    index,
    itemWriteCondition,
    itemWriteConditionField,
    updateDate: Date
  ) {
    let res = await this._get(uid, true);
    if (
      itemWriteCondition &&
      res[prop][index][itemWriteConditionField] != itemWriteCondition
    ) {
      throw new UpdateConditionFailError(
        uid,
        itemWriteConditionField,
        itemWriteCondition
      );
    }
    res[prop].splice(index, 1);
    res[this._lastUpdateField] = updateDate;
    return this._save(res);
  }
}

export { MemoryStore, StorageMap, MemoryStore as Plop };
