"use strict";
import {
  Store,
  CoreModel
} from '../index';
var fs = require("fs");


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
 */
class FileStore extends Store {
  /** @ignore */
  constructor(webda, name, options) {
    super(webda, name, options);
    if (!fs.existsSync(options.folder)) {
      fs.mkdirSync(options.folder);
    }
  }

  file(uid) {
    return this._params.folder + '/' + uid;
  }

  async exists(uid) {
    // existsSync is deprecated might change it
    return Promise.resolve(fs.existsSync(this.file(uid)));
  }

  async _find(request, offset, limit): Promise < any > {
    var self = this;
    var res = [];
    var path = require('path');
    var files = fs.readdirSync(self._params.folder).filter(function(file) {
      return !fs.statSync(path.join(self._params.folder, file)).isDirectory();
    });
    for (var file in files) {
      res.push(this._get(files[file]));
    }
    return Promise.all(res);
  }

  _save(object, uid) {
    fs.writeFileSync(this.file(uid), JSON.stringify(object.toStoredJSON(), undefined, this._params.beautify));
    return Promise.resolve(object);
  }

  async _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    let res = await this._get(uid);
    if (res === undefined) {
      throw Error("NotFound");
    }
    if (index === undefined) {
      if (itemWriteCondition !== undefined && res[prop].length !== itemWriteCondition) {
        throw Error('UpdateCondition not met');
      }
      if (res[prop] === undefined) {
        res[prop] = [item];
      } else {
        res[prop].push(item);
      }
    } else {
      if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
        throw Error('UpdateCondition not met');
      }
      res[prop][index] = item;
    }
    await this._save(res, uid);
  }

  async _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    let res = await this._get(uid);
    if (res === undefined) {
      throw Error("NotFound");
    }

    if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
      throw Error('UpdateCondition not met');
    }
    res[prop].splice(index, 1);
    return this._save(res, uid);
  }

  async _delete(uid, writeCondition) {
    let res = await this._get(uid);
    if (writeCondition && res && res[this._writeConditionField] != writeCondition) {
      return Promise.reject(Error('UpdateCondition not met'));
    }
    if (res) {
      fs.unlinkSync(this.file(uid));
    }
    return Promise.resolve();
  }

  async _update(object, uid, writeCondition) {
    let stored = await this._get(uid);
    if (!stored) {
      return Promise.reject(Error('NotFound'));
    }
    if (writeCondition && stored[this._writeConditionField] != writeCondition) {
      return Promise.reject(Error('UpdateCondition not met'));
    }
    for (var prop in object) {
      stored[prop] = object[prop];
    }
    return this._save(stored, uid);
  }

  async getAll(uids): Promise < any > {
    if (!uids) {
      uids = [];
      var files = fs.readdirSync(this._params.folder);
      for (var file in files) {
        uids.push(files[file]);
      }
    }
    let result = [];
    for (let i in uids) {
      result.push(this._get(uids[i]));
    }
    return Promise.all(result);
  }

  async _get(uid: string): Promise < any > {
    let res = await this.exists(uid);
    if (res) {
      let data = fs.readFileSync(this.file(uid));
      return this.initModel(JSON.parse(data.toString()));
    }
    return;
  }

  async _incrementAttribute(uid, prop, value) {
    let found = this.exists(uid);
    if (!found) {
      throw Error('NotFound');
    }
    let stored = await this._get(uid);
    if (stored[prop] === undefined) {
      stored[prop] = 0;
    }
    stored[prop] += value;
    return this._save(stored, uid);
  }

  async __clean() {
    if (!fs.existsSync(this._params.folder)) {
      return;
    }
    var files = fs.readdirSync(this._params.folder);
    var promises = [];
    for (var file in files) {
      let filename = this._params.folder + '/' + files[file];
      promises.push(new Promise((resolve, reject) => {
        fs.unlink(filename, (err) => {
          if (err) {
            reject(err);
          }
          resolve();
        });
      }));
    }
    return Promise.all(promises);
  }

  static getModda() {
    return {
      "uuid": "Webda/FileStore",
      "label": "File Store",
      "description": "Implements user registration and login using either email or OAuth, it handles for now Facebook, Google, Amazon, GitHub, Twitter\nIt needs a Idents and a Users Store to work",
      "webcomponents": [],
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "logo": "images/icons/filedb.png",
      "configuration": {
        "default": {
          "folder": "/tmp/types",
        },
        "widget": {
          "tag": "webda-store-configurator",
          "url": "elements/services/webda-store-configurator.html"
        },
        "schema": {
          type: "object",
          properties: {
            "folder": {
              type: "string"
            }
          },
          required: ["folder"]
        }
      }
    }
  }
}

export {
  FileStore
}
