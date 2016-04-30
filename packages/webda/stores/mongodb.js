"use strict";
const Store = require("./store")

var MongoClient = require('mongodb').MongoClient

class MongoStore extends Store {
	constructor(webda, name, options) {
		super(webda, name, options);
		this._connectPromise = undefined;
		if (options.collection === undefined || options.mongo === undefined) {
			throw Error("collection and url must be setup");
		}
	}

	_connect() {
		if (this._connectPromise === undefined) {
			this._connectPromise = new Promise( function(resolve, reject) {
				console.log("Connect to: " + this._params.mongo);
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
		// existsSync is deprecated might change it
		return fs.existsSync(this.file(uid));
	}

	_save(object, uid) {
		return new Promise( function (resolve, reject) {
			this._collection.insertOne(object, function(err, result) {

			});
		});
	}

	_find(request, offset, limit) {
		this._collection.insertOne(object, function(err, result) {

		});
		return object;
	}

	_delete(uid) {
		this._collection.deleteOne({ uuid: uid}, function(err, result) {

		});
		// Should make it sync ?
	}

	_update(object, uid) {
		this._collection.updateOne({ uuid: uid}, object, function (err, reuslt) {

		});
	}

	_get(uid) {
		this._collection.find({ uuid: uid});
	}
}

module.exports = MongoStore;