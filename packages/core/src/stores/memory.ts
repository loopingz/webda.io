import { CoreModel } from "../models/coremodel";
import { Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "./store";

interface StorageMap {
  [key: string]: any;
}

/**
 * Store in Memory
 *
 * @category CoreServices
 * @WebdaModda
 */
class MemoryStore<T extends CoreModel, K extends StoreParameters = StoreParameters> extends Store<T, K> {
  storage: StorageMap = {};

  /**
   * @override
   */
  async init(): Promise<void> {
    return super.init();
  }

  /**
   * @override
   */
  async exists(uid) {
    return this.storage[uid] !== undefined;
  }

  /**
   * @override
   */
  async _find(_request, _offset, _limit): Promise<any> {
    // Need to transfert to Array
    return this.storage;
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
  async _patch(object: any, uuid: string, writeCondition?: any, writeConditionField?: string): Promise<T> {
    let obj = await this._get(uuid, true);
    this.checkUpdateCondition(obj, writeConditionField, writeCondition);
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
    this.checkUpdateCondition(obj, writeConditionField, writeCondition);
    await this._save(object);
    return this._getSync(uid);
  }

  /**
   * @override
   */
  async getAll(uids): Promise<any> {
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
    this.checkUpdateCondition(res, writeConditionField, writeCondition);
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
  async _incrementAttribute(uid, prop, value, updateDate: Date) {
    var res = await this._get(uid, true);
    if (!res[prop]) {
      res[prop] = 0;
    }
    res[this._lastUpdateField] = updateDate;
    res[prop] += value;
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
      prop,
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
    var res = await this._get(uid, true);
    if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    res[prop].splice(index, 1);
    res[this._lastUpdateField] = updateDate;
    return this._save(res);
  }
}

export { MemoryStore, StorageMap, MemoryStore as Plop };
