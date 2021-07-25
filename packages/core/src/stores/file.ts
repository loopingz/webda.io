"use strict";
import * as fs from "fs";
import * as path from "path";
import { ModdaDefinition, WebdaError } from "../core";
import { CoreModel } from "../models/coremodel";
import { Store, StoreParameters } from "./store";

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
  async computeParameters() {
    super.computeParameters();
    if (!fs.existsSync(this.parameters.folder)) {
      fs.mkdirSync(this.parameters.folder);
    }
  }

  file(uid) {
    return `${this.parameters.folder}/${uid}${FileStore.EXTENSION}`;
  }

  async exists(uid) {
    // existsSync is deprecated might change it
    return Promise.resolve(fs.existsSync(this.file(uid)));
  }

  async _find(request, offset, limit): Promise<any> {
    var files = fs.readdirSync(this.parameters.folder).filter(file => {
      return !fs.statSync(path.join(this.parameters.folder, file)).isDirectory();
    });
    return Promise.all(files.map(f => this._get(f)));
  }

  _save(object) {
    fs.writeFileSync(
      this.file(object[this._uuidField]),
      JSON.stringify(object.toStoredJSON(), undefined, this.parameters.beautify)
    );
    return Promise.resolve(object);
  }

  async _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    let res = await this._get(uid);
    if (res === undefined) {
      throw Error("NotFound");
    }
    if (index === undefined) {
      if (itemWriteCondition !== undefined && res[prop].length !== itemWriteCondition) {
        throw Error("UpdateCondition not met");
      }
      if (res[prop] === undefined) {
        res[prop] = [item];
      } else {
        res[prop].push(item);
      }
    } else {
      if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
        throw Error("UpdateCondition not met");
      }
      res[prop][index] = item;
    }
    res[this._lastUpdateField] = updateDate;
    await this._save(res);
  }

  async _removeAttribute(uuid: string, attribute: string) {
    let res = await this._get(uuid);
    delete res[attribute];
    await this._save(res);
  }

  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate: Date) {
    let res = await this._get(uid);
    if (res === undefined) {
      throw Error("NotFound");
    }

    if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
      throw Error("UpdateCondition not met");
    }
    res[prop].splice(index, 1);
    res[this._lastUpdateField] = updateDate;
    return this._save(res);
  }

  async _delete(uid, writeCondition, writeConditionField) {
    let res = await this._get(uid);
    if (writeCondition && res && res[writeConditionField] != writeCondition) {
      return Promise.reject(Error("UpdateCondition not met"));
    }
    if (res) {
      fs.unlinkSync(this.file(uid));
    }
    return Promise.resolve();
  }

  async _patch(object, uid, writeCondition, writeConditionField) {
    let stored = await this._get(uid || object[this._uuidField]);
    if (!stored) {
      return Promise.reject(Error("NotFound"));
    }
    if (writeCondition && stored[writeConditionField] != writeCondition) {
      return Promise.reject(Error("UpdateCondition not met"));
    }
    for (var prop in object) {
      stored[prop] = object[prop];
    }
    return this._save(stored);
  }

  async _update(object, uid, writeCondition, writeConditionField) {
    let stored = await this._get(uid || object[this._uuidField]);
    if (!stored) {
      throw new WebdaError("STORE_NOTFOUND", "NotFound");
    }
    if (writeCondition && stored[writeConditionField] != writeCondition) {
      console.log(stored[this._lastUpdateField], writeCondition, this._lastUpdateField, object[writeCondition]);
      throw new WebdaError("STORE_UPDATE_CONDITION_NOT_MET", "UpdateCondition not met");
    }
    let coreModel = new CoreModel();
    coreModel.load(object, true);
    return this._save(coreModel);
  }

  async getAll(uids): Promise<any> {
    if (!uids) {
      uids = [];
      var files = fs.readdirSync(this.parameters.folder);
      for (var file in files) {
        uids.push(files[file].substr(0, files[file].length - FileStore.EXTENSION.length));
      }
    }
    let result = [];
    for (let i in uids) {
      result.push(this._get(uids[i]));
    }
    return Promise.all(result);
  }

  async _get(uid: string): Promise<any> {
    let res = await this.exists(uid);
    if (res) {
      let data = fs.readFileSync(this.file(uid));
      return this.initModel(JSON.parse(data.toString()));
    }
  }

  async _incrementAttribute(uid, prop, value, updateDate: Date) {
    let found = this.exists(uid);
    if (!found) {
      throw Error("NotFound");
    }
    let stored = await this._get(uid);
    if (stored[prop] === undefined) {
      stored[prop] = 0;
    }
    stored[this._lastUpdateField] = updateDate;
    stored[prop] += value;
    return this._save(stored);
  }

  async __clean() {
    if (!fs.existsSync(this.parameters.folder)) {
      return;
    }
    var files = fs.readdirSync(this.parameters.folder);
    var promises = [];
    for (var file in files) {
      let filename = this.parameters.folder + "/" + files[file];
      promises.push(
        new Promise<void>((resolve, reject) => {
          fs.unlink(filename, err => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        })
      );
    }
    await Promise.all(promises);
    if (this.parameters.index) {
      await this.createIndex();
    }
  }
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
