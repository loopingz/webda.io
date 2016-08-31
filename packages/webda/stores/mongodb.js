"use strict";
const Store = require("./store")

var MongoClient = require('mongodb').MongoClient


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
		if (!webda._configurationMode && options.collection === undefined || options.mongo === undefined) {
			this._createException = "collection and url must be setup";
		}
	}

	_connect() {
		if (this._connectPromise === undefined) {
			this._connectPromise = new Promise( (resolve, reject) => {
				MongoClient.connect(this._params.mongo, (err, db) => {
				  if (err) {
				  	return reject(err);
				  }
				  this._db = db;
				  this._collection = this._db.collection(this._params.collection);
				  return resolve();
				});
			});
		}
		return this._connectPromise;
	}

	exists(uid) {
		// Should use find + limit 1
		return this._get(uid).then ((result) => {
			Promise.resolve(result !== undefined);
		});
	}

	_deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
		return this._connect().then( () => {
			var params = {'$pull': {}};
			params['$pull'][prop] = {};
			params['$pull'][prop][itemWriteConditionField] = itemWriteCondition;
			return this._collection.updateOne({ _id: uid}, params);
		});
		var params = {'TableName': this._params.table, 'Key': {"uuid": uid}};
		var attrs = {};
		attrs["#"+prop] = prop;
		params.ExpressionAttributeNames = attrs;
		params.UpdateExpression = "REMOVE #" + prop + "[" + index + "]";
		params.WriteCondition = "attribute_not_exists(#" + prop + "[" + index + "]) AND #" + prop + "[" + index + "]." + itemWriteConditionField + " = " + uid;
		return this._client.update(params).promise();
	}

	upsertItemToCollection(uid, prop, item, index, itemUid) {
		return this._connect().then( () => {
			var params = {};
			if (index === undefined) {
				params = {'$push': {}};
				params['$push'][prop] = item;
			} else {
				params = {'$set': {}};
				params['$set'][prop+"."+index] = item;
			}
			return this._collection.updateOne({ _id: uid}, params);
		});
	}

	_save(object, uid) {
		object._id = object.uuid;
		return this._connect().then( () => {
			return this._collection.insertOne(object);
		}).then ( () => {
			return Promise.resolve(object);
		});
	}

	_find(request) {
		return this._connect().then( () => {
			return new Promise( (resolve, reject) => {
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
		return this._connect().then( () => {
			return this._collection.deleteOne({ _id: uid});
		});
	}

	_update(object, uid, writeCondition) {
		return this._connect().then( () => {
			return this._collection.updateOne({ _id: uid}, {'$set': object});
		}).then ( (result) => {
			return Promise.resolve(object);
		});
	}

	_get(uid) {
		return this._connect().then( () => {
			return this._collection.findOne({ _id: uid});
		}).then ((result) => {
			return Promise.resolve(result===null?undefined:result);
		});
	}

	___cleanData() {
		return this._connect().then( () => {
			return new Promise( (resolve, reject) => {
				this._collection.remove((err, result) => {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			});
		});
	}

	static getModda() {
		return {
			"uuid": "Webda/MongoStore",
			"label": "MongoStore",
			"description": "Implements MongoDB NoSQL",
			"webcomponents": [],
			"documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Store.md",
			"logo": "images/placeholders/mongodb.png",
			"configuration": {
				"default": {
					"mongourl": "mongodb://127.0.0.1:27017",
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