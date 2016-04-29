"use strict";
const Store = require("./store")

var MongoClient = require('mongodb').MongoClient

class MongoStore extends Store {
	constructor(webda, name, options) {
		super(webda, name, options);
		var self = this;
		// Connection URL
		var url = 'mongodb://localhost:27017/myproject';
		// Use connect method to connect to the Server
		MongoClient.connect(url, function(err, db) {
		  assert.equal(null, err);
		  console.log("Connected correctly to server");
		  self._db = db;
		  self._collection = self._db.collection('');
		});
	}

	exists(uid) {
		// existsSync is deprecated might change it
		return fs.existsSync(this.file(uid));
	}

	_save(object, uid) {
		this._collection.insertOne(object, function(err, result) {

		});
		return object;
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