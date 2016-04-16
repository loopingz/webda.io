"use strict";

var stores = {};
var uuid = require('node-uuid');

class Store {
	constructor (name, options) {
		this.options = options;
		this._name = name;
		if (options.validator != undefined) {
			this.validator = require("./validator").get(options.validator);
		}
	}


	toString() {
		return this.options.type + "[" + this._name + "]";
	}

	save(object, uid) {
		if (this.validator && this.validator.save) {
			if (!this.validator.save(object)) {
				console.log("Illegal attempt to save: " + uid);
				return;
			}
		}
		if (uid == undefined) {
			uid = object.uuid;
		}
		if (uid == undefined) {
			uid = uuid.v4();
		}
		if (object.uuid == undefined || object.uuid != uid) {
			object.uuid = uid;
		}
		object = this._save(object, uid);
		if (this.options.map != undefined) {
			console.log("handleMap");
			this.handleMap(object, this.options.map, "created");
		}
		return object;
	}
	_save(object, uid) {
		throw "AbstractStore has no _save";
	}

	update(object, uid) {
		if (uid == undefined) {
			uid = object.uuid;
		}
		if (this.validator && this.validator.update) {
			if (!this.validator.update(object)) {
				console.log("Illegal attempt to save: " + uid);
				return;
			}
		}
		// Dont allow to update collections from map
		if (this.options.reverseMap != undefined) {
			for (var i in this.options.reverseMap) {
				if (object[this.options.reverseMap[i]] != undefined) {
					delete object[this.options.reverseMap[i]];
				}
			}
		}
		if (this.options.map != undefined) {
			this.handleMap(this._get(uid), this.options.map, object);
		}
		return this._update(object, uid);
	}

	removeMapper(map, uuid, mapper) {
		for (var i = 0; i < map.length; i++) {
			if (map[i]['uuid'] == uuid) {
				map.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	handleMap(object, map, updates) {
		//stores = module.exports;
		/*
		"map": {
			"users": {
				"key": "user",
				"target": "idents",
				"fields": "type"
			}
		}
		*/
		if (object === undefined) {
			return;
		}
		for (var prop in map) {
			// No mapped property or not in the object
			if (map[prop].key == undefined || object[map[prop].key] == undefined) {
				continue;
			}
			var store = stores[prop];
			// Cant find the store for this collection
			if (store == undefined) {
				console.log("no store for " + prop);
				continue;
			}
			var mapped = store.get(object[map[prop].key]);
			// Invalid mapping
			if (mapped == undefined) {
				continue;
			}
			// Enforce the collection if needed
			if (mapped[map[prop].target] == undefined) {
				mapped[map[prop].target]=[];
			}
			if ( updates == "created" ) {
				// Add to the object
				var mapper = {};
				mapper.uuid = object.uuid;
				// Add info to the mapped
				if (map[prop].fields) {
					var fields = map[prop].fields.split(",");
					for (var field in fields) {
						mapper[fields[field]] = object[fields[field]];
					}
				}
				// Can happen with self defined uuid like ident
				mapped[map[prop].target].push(mapper);
				// TODO Should be update
				store.save(mapped);
			} else if (updates == "deleted") {
				// Remove from the collection
				if (mapped[map[prop].target] == undefined) {
					continue;
				}
				if (this.removeMapper(mapped[map[prop].target], object.uuid)) {
					// TODO Should be update
					store.save(mapped, mapped.uuid);
				}
			} else if (typeof(updates) == "object") {
				// Update only if the key field has been updated
				var found = false;
				for (field in updates) {
					if (map[prop].fields) {
						fields = map[prop].fields.split(",");
						for (var mapperfield in fields) {
							if (fields[mapperfield] == field) {
								found = true;
								break;
							}
						}
					}
					// TODO Need to verify also if fields are updated
					if (field == map[prop].key) {
						found = true;
						break;
					}
				}
				if (!found) {
					continue;
				}
				// check if reference object has changed
				if (updates[map[prop].key] != undefined && mapped.uuid != updates[map[prop].key]) {
					if (this.removeMapper(mapped[map[prop].target], object.uuid)) {
						store.save(mapped, mapped.uuid);
					}
					// TODO Should be update
					mapped = store.get(updates[map[prop].key])
					if (mapped == undefined) {
						continue
					}
					// Enforce the collection if needed
					if (mapped[map[prop].target] == undefined) {
						mapped[map[prop].target]=[];
					}
				} else {
					console.log("should remove mapper");
					this.removeMapper(mapped[map[prop].target], object.uuid);
				}
				// Update the mapper
				mapper = {};
				mapper.uuid = object.uuid;
				if (map[prop].fields) {
					fields = map[prop].fields.split(",");
					for (field in fields) {
						if (updates[fields[field]] != undefined) {
							mapper[fields[field]] = updates[fields[field]];
						} else {
							mapper[fields[field]] = object[fields[field]];
						}
					}
				}
				mapped[map[prop].target].push(mapper);
				// Remove old reference
				store.save(mapped, mapped.uuid);
			}
		}
	}

	_update(object, uid) {
		throw "AbstractStore has no _update"
	}

	delete(uid, no_map) {
		var object = this._get(uid);
		if (this.validator) {
			// Need to get the object to verify
			if (!this.validator.delete(object)) {
				console.log("Illegal attempt to delete: " + uid);
				return;
			}
		}
		if (this.options.map != undefined) {
			this.handleMap(object, this.options.map, "deleted");
		}
		if (this.options.cascade != undefined) {
			// Should deactiate the mapping in that case
			for (var i in this.options.cascade) {
				if (typeof(this.options.cascade[i]) != "object" || object[this.options.cascade[i].name] == undefined) continue;
				var targetStore = stores[this.options.cascade[i].store];
				if (targetStore == undefined) continue;
				for (var item in object[this.options.cascade[i].name]) {
					targetStore.delete(object[this.options.cascade[i].name][item].uuid);
				}
			}
		}
		this._delete(uid);
	}

	_delete(uid) {
		throw "AbstractStore has no _delete";
	}

	get(uid) {
		var object = this._get(uid);
		if (this.validator && object != undefined) {
			// Need to get the object to verify
			if (!this.validator.get(object)) {
				console.log("Illegal attempt to read: " + uid);
				return;
			}
		}
		return object;
	}

	_get(uid) {
		throw "AbstractStore has no _get";
	}

	query(request, offset, limit) {
		return this._query(request, offset, limit);
	}

	_query(request, offset, limit) {
		throw "AbstractStore has no _query";	
	}
}

var fs = require("fs");

class FileStore extends Store {
	constructor(name, options) {
		super(name, options);
		if (!fs.existsSync(options.folder)) {
			fs.mkdirSync(options.folder);
		}
	}

	file(uid) {
		return this.options.folder + '/' + uid;
	}

	exists(uid) {
		// existsSync is deprecated might change it
		return fs.existsSync(this.file(uid));
	}

	_query(request, offset, limit) {
		var self = this;
		var res = [];
		var path = require('path');
		var files = fs.readdirSync(self.options.folder).filter(function(file) {
    		return !fs.statSync(path.join(self.options.folder, file)).isDirectory();
  		});
  		for (var file in files) {
  			res.push(this._get(files[file]));
  		}
		return res;
	}

	_save(object, uid) {
		fs.writeFileSync(this.file(uid), JSON.stringify(object));
		return object;
	}

	_delete(uid) {
		if (this.exists(uid)) {
			fs.unlinkSync(this.file(uid));
		}
	}

	_update(object, uid) {
		if (!this.exists(uid)) {
			return undefined;
		}
		var stored = this._get(uid);
		for (var prop in object) {
			stored[prop]=object[prop];
		}
		return this._save(stored, uid)
	}

	_get(uid) {
		if (!this.exists(uid)) {
			return undefined;
		}
		return JSON.parse(fs.readFileSync(this.file(uid)));
	}
}

var MongoClient = require('mongodb').MongoClient

class MongoStore extends Store {
	constructor(name, options) {
		super(name, options);
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

var types = {"FileStore": FileStore};

module.exports.add = function (name, options) {
	if (types[options.type] == undefined) {
		throw "Invalid store type for " + name;
	}
	stores[name] = new types[options.type](name, options);
}
module.exports.get = function (name) {
	return stores[name];
}
module.exports.remove = function (name) {
	delete stores[name];
}