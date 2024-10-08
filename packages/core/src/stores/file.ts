import * as fs from "fs";
import * as path from "path";
import { CoreModel, FilterAttributes } from "../models/coremodel";
import { JSONUtils } from "../utils/serializers";
import { Store, StoreFindResult, StoreNotFoundError, StoreParameters } from "./store";
import * as WebdaQL from "@webda/ql";

class FileStoreParameters extends StoreParameters {
  /**
   * Local path where to store all `json` files
   */
  folder: string;
  /**
   * Parameter sent to JSON.stringify when storing the json
   */
  beautify?: string | number;
  /**
   * Disable memory cache
   *
   * Useful if several process update storage files
   *
   * @default false
   */
  noCache?: boolean;
}

/**
 * Simple file storage of object
 *
 * Storage structure
 *   /folder/{uuid}
 *
 *
 * Parameters:
 *  folder: to store to
 *
 * @category CoreServices
 * @WebdaModda
 */
class FileStore<T extends CoreModel = CoreModel, K extends FileStoreParameters = FileStoreParameters> extends Store<
  T,
  K
> {
  static EXTENSION = ".json";

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): FileStoreParameters {
    return new FileStoreParameters(params, this);
  }

  /**
   * Create the storage folder if does not exist
   */
  computeParameters() {
    super.computeParameters();
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder);
    }
  }

  /**
   * Get the file path of an object
   * @param uid of the object
   * @returns
   */
  file(uid) {
    return `${this.parameters.folder}/${uid}${FileStore.EXTENSION}`;
  }

  /**
   * @override
   */
  async _exists(uid) {
    return fs.existsSync(this.file(uid));
  }

  /**
   * @override
   */
  async find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    const files = fs
      .readdirSync(this.parameters.folder)
      .filter(file => {
        return !fs.statSync(path.join(this.parameters.folder, file)).isDirectory();
      })
      .map(f => f.substring(0, f.length - FileStore.EXTENSION.length))
      .sort();
    return this.simulateFind(query, files);
  }

  /**
   * @override
   */
  async _save(object: T) {
    fs.writeFileSync(
      this.file(object.getUuid()),
      JSON.stringify(object.toStoredJSON(), undefined, this.parameters.beautify)
    );
    return object;
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
    try {
      // Need to keep sync to avoid conflicts
      return await this.simulateUpsertItemToCollection(
        this.initModel(JSONUtils.loadFile(this.file(uid))),
        <FilterAttributes<T, any[]>>prop,
        item,
        updateDate,
        index,
        itemWriteCondition,
        itemWriteConditionField
      );
    } catch (err) {
      throw new StoreNotFoundError(uid, this.getName());
    }
  }

  /**
   * @inheritdoc
   */
  async _removeAttribute(uuid: string, attribute: string, writeCondition?: any, writeConditionField?: string) {
    const res = await this._get(uuid, true);
    this.checkUpdateCondition(res, <keyof T>writeConditionField, writeCondition);
    delete res[attribute];
    await this._save(res);
  }

  /**
   * @inheritdoc
   */
  async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ) {
    const res = await this._get(uid, true);
    this.checkCollectionUpdateCondition(
      res,
      <FilterAttributes<T, any[]>>prop,
      <keyof T>itemWriteConditionField,
      itemWriteCondition,
      index
    );
    res[prop].splice(index, 1);
    res._lastUpdate = updateDate;
    return this._save(res);
  }

  /**
   * @inheritdoc
   */
  async _delete(uid: string) {
    const filePath = this.file(uid);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * @inheritdoc
   */
  async _patch(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    const stored = await this._get(uid, true);
    this.checkUpdateCondition(stored, <keyof T>writeConditionField, writeCondition);
    for (const prop in object) {
      stored[prop] = object[prop];
    }
    return this._save(stored);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    const stored = await this._get(uid, true);
    this.checkUpdateCondition(stored, <keyof T>writeConditionField, writeCondition);
    return this._save(this.initModel(object));
  }

  /**
   * @override
   */
  async getAll(uids?: string[]): Promise<any> {
    if (!uids) {
      uids = [];
      const files = fs.readdirSync(this.parameters.folder);
      for (const file in files) {
        uids.push(files[file].substring(0, files[file].length - FileStore.EXTENSION.length));
      }
    }
    const result = [];
    for (const i in uids) {
      const model = this._get(uids[i]);
      result.push(model);
    }
    return (await Promise.all(result)).filter(f => f !== undefined);
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<T> {
    const res = await this.exists(uid);
    if (res) {
      const data = JSON.parse(fs.readFileSync(this.file(uid)).toString());
      if (data.__type !== this._modelType && this.parameters.strict) {
        return undefined;
      }
      return this.initModel(data);
    } else if (raiseIfNotFound) {
      throw new StoreNotFoundError(uid, this.getName());
    }
  }

  /**
   * @override
   */
  async _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any> {
    const stored = await this._get(uid, true);
    params.forEach(({ property: prop, value }) => {
      if (stored[prop] === undefined) {
        stored[prop] = 0;
      }
      stored._lastUpdate = updateDate;
      stored[prop] += value;
    });
    stored._lastUpdate = updateDate;
    return this._save(stored);
  }

  /**
   * @override
   */
  async __clean(): Promise<void> {
    // This is only during test
    (await import("fs-extra")).emptyDirSync(this.parameters.folder);
  }
}

export { FileStore };
