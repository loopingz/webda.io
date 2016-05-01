"use strict";
const Store = require("./store")

var MongoClient = require('mongodb').MongoClient

class MongoStore extends Store {
	constructor(webda, name, options) {
		super(webda, name, options);
		this._connectPromise = undefined;
		if (options.mongo === undefined || options.mongo === '') {
			this._params.mongo = options.mongo = process.env["WEBDA_MONGO_URL"];
		}
		if (options.collection === undefined || options.mongo === undefined) {
			throw Error("collection and url must be setup");
		}
	}

	_connect() {
		if (this._connectPromise === undefined) {
			this._connectPromise = new Promise( function(resolve, reject) {
				MongoClient.connect(this._params.mongo, function(err, db) {
				  if (err) {
				  	return reject(err);
				  }
				  this._db = db;
				  this._collection = this._db.collection(this._params.collection);
				  return resolve();
				}.bind(this));
			}.bind(this));
		}
		return this._connectPromise;
	}

	exists(uid) {
		// Should use find + limit 1
		return this._get(uid).then (function (result) {
			Promise.resolve(result !== undefined);
		});
	}

	_save(object, uid) {
		object._id = object.uuid;
		return this._connect().then( function() {
			return this._collection.insertOne(object);
		}.bind(this)).then (function () {
			return Promise.resolve(object);
		});
	}

	_find(request, offset, limit) {
		return this._connect().then( function() {
			return new Promise( function (resolve, reject) {
				this._collection.find({ _id: uid}, function(err, result) {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			}.bind(this));
		}.bind(this));
	}

	_delete(uid) {
		return this._connect().then( function() {
			return this._collection.deleteOne({ _id: uid});
		}.bind(this));
	}

	_update(object, uid) {
		return this._connect().then( function() {
			return this._collection.updateOne({ _id: uid}, {'$set': object});
		}.bind(this)).then (function (result) {
			return Promise.resolve(object);
		});
	}

	_get(uid) {
		return this._connect().then( function() {
			return this._collection.findOne({ _id: uid});
		}.bind(this)).then (function(result) {
			return Promise.resolve(result===null?undefined:result);
		}.bind(this));
	}

	___cleanData() {
		return this._connect().then( function() {
			return new Promise( function (resolve, reject) {
				this._collection.remove(function(err, result) {
					if (err) {
						reject(err);
					}
					resolve(result);
				});
			}.bind(this));
		}.bind(this));
	}
}

module.exports = MongoStore;