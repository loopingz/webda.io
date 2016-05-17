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

	_save(object, uid) {
		object._id = object.uuid;
		return this._connect().then( () => {
			return this._collection.insertOne(object);
		}).then ( () => {
			return Promise.resolve(object);
		});
	}

	_find(request, offset, limit) {
		return this._connect().then( () => {
			return new Promise( (resolve, reject) => {
				this._collection.find({ _id: uid}, (err, result) => {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			});
		});
	}

	_delete(uid) {
		return this._connect().then( () => {
			return this._collection.deleteOne({ _id: uid});
		});
	}

	_update(object, uid) {
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