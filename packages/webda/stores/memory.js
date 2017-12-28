"use strict";
const Store = require("./store");

class MemoryStore extends Store {

  init(config) {
    this.storage = {};
    super.init(config);
  }

  exists(uid) {
    return Promise.resolve(this.storage[uid] !== undefined);
  }

  _find(request, offset, limit) {
    // Need to transfert to Array
    return Promise.resolve(this.storage);
  }

  _save(object, uid) {
    this.storage[uid] = object;
    return Promise.resolve(this.storage[uid]);
  }

  _delete(uid) {
    delete this.storage[uid];
    return Promise.resolve();
  }

  _update(object, uid) {
    for (let prop in object) {
      this.storage[uid][prop] = object[prop];
    }
    return Promise.resolve(this.storage[uid]);
  }

  getAll(uids) {
    if (!uids) {
      return Object.keys(this.storage).map((key) => {
        return this.storage[key];
      });
    }
    let result = [];
    for (let i in uids) {
      if (this.storage[uids[i]]) {
        result.push(this.storage[uids[i]]);
      }
    }
    return Promise.resolve(result);
  }

  _get(uid) {
    return Promise.resolve(this.storage[uid]);
  }

  __clean() {
    this.storage = {};
    return Promise.resolve();
  }

  _incrementAttribute(uid, prop, value) {
    var res = this.storage[uid];
    if (res === undefined) {
      throw Error("NotFound");
    }
    if (!res[prop]) {
      res[prop] = 0;
    }
    res[prop] += value;
    return this._save(res, uid);
  }

  _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    var res = this.storage[uid];
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
  }

  _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    var res = this.storage[uid];
    if (res === undefined) {
      throw Error("NotFound");
    }

    if (itemWriteCondition && res[prop][index][itemWriteConditionField] != itemWriteCondition) {
      throw Error('UpdateCondition not met');
    }
    res[prop].splice(index, 1);
    return this._save(res, uid);
  }

  static getModda() {
    return {
      "uuid": "Webda/MemoryStore",
      "label": "MemoryStore",
      "description": "Implements a simple in memory store",
      "webcomponents": [],
      "documentation": "",
      "logo": "images/placeholders/memorystore.png",
      "configuration": {
        "default": {
        }
      }
    }
  }
}


module.exports = MemoryStore;