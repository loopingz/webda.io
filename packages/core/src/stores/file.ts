"use strict";
import * as fs from "fs";
import * as path from "path";
import { ModdaDefinition } from "../core";
import { CoreModel } from "../models/coremodel";
import { JSONUtils } from "../utils/serializers";
import { Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "./store";

class FileStoreParameters extends StoreParameters {
  /**
   * Local path where to store all `json` files
   */
  folder: string;
  /**
   * Parameter sent to JSON.stringiy when storing the json
   */
  beautify?: string | number;
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
 */
class FileStore<T extends CoreModel, K extends FileStoreParameters = FileStoreParameters> extends Store<T, K> {
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
  async exists(uid) {
    return fs.existsSync(this.file(uid));
  }

  async _find(request, offset, limit): Promise<any> {
    var files = fs.readdirSync(this.parameters.folder).filter(file => {
      return !fs.statSync(path.join(this.parameters.folder, file)).isDirectory();
    });
    return Promise.all(files.map(f => this._get(f)));
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
    let res = await this._get(uuid, true);
    this.checkUpdateCondition(res, writeConditionField, writeCondition);
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
    let res = await this._get(uid, true);
    this.checkCollectionUpdateCondition(res, prop, itemWriteConditionField, itemWriteCondition, index);
    res[prop].splice(index, 1);
    res[this._lastUpdateField] = updateDate;
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
    let stored = await this._get(uid, true);
    this.checkUpdateCondition(stored, writeConditionField, writeCondition);
    for (var prop in object) {
      stored[prop] = object[prop];
    }
    return this._save(stored);
  }

  /**
   * @override
   */
  async _update(object: any, uid: string, writeCondition?: any, writeConditionField?: string): Promise<any> {
    let stored = await this._get(uid, true);
    this.checkUpdateCondition(stored, writeConditionField, writeCondition);
    return this._save(this.initModel(object));
  }

  /**
   * @override
   */
  async getAll(uids?: string[]): Promise<any> {
    if (!uids) {
      uids = [];
      var files = fs.readdirSync(this.parameters.folder);
      for (var file in files) {
        uids.push(files[file].substr(0, files[file].length - FileStore.EXTENSION.length));
      }
    }
    let result = [];
    for (let i in uids) {
      let model = this._get(uids[i]);
      result.push(model);
    }
    return (await Promise.all(result)).filter(f => f !== undefined);
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound: boolean = false): Promise<T> {
    let res = await this.exists(uid);
    if (res) {
      let data = fs.readFileSync(this.file(uid));
      return this.initModel(JSON.parse(data.toString()));
    } else if (raiseIfNotFound) {
      throw new StoreNotFoundError(uid, this.getName());
    }
  }

  /**
   * @override
   */
  async _incrementAttribute(uid: string, prop: string, value: number, updateDate: Date): Promise<any> {
    let stored = await this._get(uid, true);
    if (stored[prop] === undefined) {
      stored[prop] = 0;
    }
    stored[this._lastUpdateField] = updateDate;
    stored[prop] += value;
    return this._save(stored);
  }

  /**
   * @override
   */
  async __clean(): Promise<void> {
    // This is only during test
    require("fs-extra").emptyDirSync(this.parameters.folder);
    if (this.parameters.index) {
      await this.createIndex();
    }
  }

  /**
   *
   * @inheritdoc
   */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/FileStore",
      label: "File Store",
      description:
        "Implements user registration and login using either email or OAuth, it handles for now Facebook, Google, Amazon, GitHub, Twitter\nIt needs a Idents and a Users Store to work",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      logo: "images/icons/filedb.png"
    };
  }
}

export { FileStore };
