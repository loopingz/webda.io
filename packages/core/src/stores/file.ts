import * as fs from "fs";
import * as path from "path";
import { JSONUtils } from "@webda/utils";
import { Store, StoreFindResult, StoreNotFoundError, StoreParameters } from "./store";
import * as WebdaQL from "@webda/ql";

export class FileStoreParameters extends StoreParameters {
  /**
   * Local path where to store all `json` files
   */
  folder: string;
  /**
   * Parameter sent to JSON.stringify when storing the json
   */
  beautify?: string | number;

  constructor(params, store) {
    super(params, store);
    this.folder = params.folder;
    this.beautify = params.beautify;
  }
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
export class FileStore<K extends FileStoreParameters = FileStoreParameters> extends Store<K> {
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
  async find(query: WebdaQL.Query): Promise<StoreFindResult<any>> {
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
  async _create(uuid: string, object: any) {
    const fh = fs.openSync(this.file(uuid), "wx");
    fs.writeSync(fh, JSON.stringify(this.toStoredJSON(object), undefined, this.parameters.beautify));
    fs.closeSync(fh);
    return object;
  }

  /**
   * Store in file the object
   * @param uuid
   * @param object
   * @returns
   */
  protected async persist(uuid: string, object: any) {
    fs.writeFileSync(this.file(uuid), JSON.stringify(this.toStoredJSON(object), undefined, this.parameters.beautify));
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
        uid,
        JSONUtils.loadFile(this.file(uid)),
        prop,
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
    this.checkUpdateCondition(uuid, res, writeConditionField, writeCondition);
    delete res[attribute];
    await this.persist(uuid, res);
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
    this.checkCollectionUpdateCondition(res, prop, itemWriteConditionField, itemWriteCondition, index);
    res[prop].splice(index, 1);
    res._lastUpdate = updateDate;
    return this.persist(uid, res);
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
    this.checkUpdateCondition(uid, stored, writeConditionField, writeCondition);
    for (const prop in object) {
      stored[prop] = object[prop];
    }
    return this.persist(uid, stored);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    const stored = await this._get(uid, true);
    this.checkUpdateCondition(uid, stored, writeConditionField, writeCondition);
    return this.persist(uid, object);
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
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<any> {
    const res = await this._exists(uid);
    if (res) {
      const data = JSON.parse(fs.readFileSync(this.file(uid)).toString());
      if (data.__type !== this._modelType && this.parameters.strict) {
        return undefined;
      }
      return data;
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
    return this.persist(uid, stored);
  }

  /**
   * @override
   */
  async __clean(): Promise<void> {
    // This is only during test
    (await import("fs-extra")).emptyDirSync(this.parameters.folder);
  }
}
