"use strict";
const Store = require("./store")
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

  exists(uid) {
    // existsSync is deprecated might change it
    return Promise.resolve(fs.existsSync(this.file(uid)));
  }

  _find(request) {
    var self = this;
    var res = [];
    var path = require('path');
    var files = fs.readdirSync(self._params.folder).filter(function (file) {
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

  _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    return this._get(uid).then((res) => {
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
      return this._save(res, uid);
    });
  }

  _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    return this._get(uid).then((res) => {
      if (res === undefined) {
        throw Error("NotFound");
      }

      if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
        throw Error('UpdateCondition not met');
      }
      res[prop].splice(index, 1);
      return this._save(res, uid);
    });
  }

  _delete(uid, writeCondition) {
    return this._get(uid).then((res) => {
      if (writeCondition && res && res[this._writeConditionField] != writeCondition) {
        return Promise.reject(Error('UpdateCondition not met'));
      }
      if (res) {
        fs.unlinkSync(this.file(uid));
      }
      return Promise.resolve();
    });
  }

  _update(object, uid, writeCondition) {
    return this._get(uid).then((stored) => {
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
    });
  }

  getAll(uids) {
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

  _get(uid) {
    return this.exists(uid).then((res) => {
      if (res) {
        let data = fs.readFileSync(this.file(uid));
        return Promise.resolve(this.initModel(JSON.parse(data.toString())));
      }
      return Promise.resolve(undefined);
    });
  }

  _incrementAttribute(uid, prop, value) {
    return this.exists(uid).then((found) => {
      if (!found) {
        return Promise.reject(Error('NotFound'));
      }
      return this._get(uid);
    }).then((stored) => {
      if (stored[prop] === undefined) {
        stored[prop] = 0;
      }
      stored[prop] += value;
      return this._save(stored, uid);
    });
  }

  __clean() {
    if (!fs.existsSync(this._params.folder)) {
      return Promise.resolve();
    }
    var files = fs.readdirSync(this._params.folder);
    var promises = [];
    for (var file in files) {
      let filename = this._params.folder + '/' + files[file];
      promises.push( new Promise( (resolve, reject) => {
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

module.exports = FileStore