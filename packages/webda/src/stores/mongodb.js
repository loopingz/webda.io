"use strict";
const Store = require("./store");
const CoreModel = require("../models/coremodel");

var MongoClient = require('mongodb').MongoClient;


/**
 * Store Objects in MongoDB
 *
 * Parameters:
 *   mongo: 'mongodb://127.0.0.1:27017' // If not found try to read WEBDA_MONGO_URL env variable
 *
 */
class MongoStore extends Store {
  /** @ignore */
  constructor(webda, name, options) {
    super(webda, name, options);
    this._connectPromise = undefined;
    if (options.mongo === undefined || options.mongo === '') {
      this._params.mongo = options.mongo = process.env["WEBDA_MONGO_URL"];
    }
    if (this._params.mongo) {
      // Get the database name from url
      this._params.mongoDb = this._params.mongo.substr(this._params.mongo.lastIndexOf('/') + 1);
    }
    if (!webda._configurationMode && options.collection === undefined || options.mongo === undefined || this._params.mongoDb === undefined) {
      this._createException = "collection and url must be setup";
    }
  }

  _connect() {
    if (this._connectPromise === undefined) {
      this._connectPromise = new Promise((resolve, reject) => {
        MongoClient.connect(this._params.mongo, (err, client) => {
          if (err) {
            return reject(err);
          }
          this._client = client;
          this._db = client.db(this._params.mongoDb);
          this._collection = this._db.collection(this._params.collection);
          return resolve();
        });
      });
    }
    return this._connectPromise;
  }

  exists(uid) {
    // Should use find + limit 1
    return this._get(uid).then((result) => {
      return Promise.resolve(result !== undefined);
    });
  }

  _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    return this._connect().then(() => {
      var params = {
        '$pull': {}
      };
      params['$pull'][prop] = {};
      params['$pull'][prop][itemWriteConditionField] = itemWriteCondition;
      return this._collection.updateOne({
        _id: uid
      }, params);
    });
  }

  _incrementAttribute(uid, prop, value) {
    return this._connect().then(() => {
      var params = {
        '$inc': {}
      };
      params['$inc'][prop] = value;
      return this._collection.updateOne({
        _id: uid
      }, params);
    });
  }

  _upsertItemToCollection(uid, prop, item, index, itemUid) {
    return this._connect().then(() => {
      var params = {};
      if (index === undefined) {
        params = {
          '$push': {}
        };
        params['$push'][prop] = item;
      } else {
        params = {
          '$set': {}
        };
        params['$set'][prop + "." + index] = item;
      }
      return this._collection.updateOne({
        _id: uid
      }, params);
    });
  }

  _save(object, uid) {
    if (object instanceof CoreModel) {
      object = object.toStoredJSON();
    }
    object._id = object.uuid;
    return this._connect().then(() => {
      return this._collection.insertOne(object);
    }).then(() => {
      return Promise.resolve(object);
    });
  }

  _find(request) {
    return this._connect().then(() => {
      return new Promise((resolve, reject) => {
        this._collection.find(request, (err, result) => {
          if (err) {
            reject(err);
          }
          resolve(result);
        });
      });
    });
  }

  _delete(uid, writeCondition) {
    return this._connect().then(() => {
      return this._collection.deleteOne({
        _id: uid
      });
    });
  }

  _update(object, uid, writeCondition) {
    if (object instanceof CoreModel) {
      object = object.toStoredJSON();
    }
    return this._connect().then(() => {
      return this._collection.updateOne({
        _id: uid
      }, {
        '$set': object
      });
    }).then((result) => {
      return Promise.resolve(object);
    });
  }

  getAll(uids) {
    return this._connect().then(() => {
      let params = {};
      if (uids) {
        params._id = {
          $in: uids
        };
      }
      return this._collection.find(params);
    }).then((result) => {
      return result.toArray();
    }).then((items) => {
      return items.map(this.initModel, this);
    });
  }

  _get(uid) {
    return this._connect().then(() => {
      return this._collection.findOne({
        _id: uid
      });
    }).then((result) => {
      return Promise.resolve(result === null ? undefined : result);
    });
  }

  __clean() {
    return this._connect().then(() => {
      return this._collection.deleteMany();
    });
  }

  static getModda() {
    return {
      "uuid": "Webda/MongoStore",
      "label": "MongoStore",
      "description": "Implements MongoDB NoSQL",
      "webcomponents": [],
      "documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
      "logo": "images/icons/mongodb.png",
      "configuration": {
        "default": {
          "mongourl": "mongodb://127.0.0.1:27017",
        },
        "widget": {
          "tag": "webda-store-configurator",
          "url": "elements/services/webda-store-configurator.html"
        },
        "schema": {
          type: "object",
          properties: {
            "mongourl": {
              type: "string"
            }
          },
          required: ["mongourl"]
        }
      }
    }
  }
}

module.exports = MongoStore;
