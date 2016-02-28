var stores = {};
var uuid = require('node-uuid');

var Store = function (name, options) {
	this.options = options;
	this._name = name;
	if (options.validator != undefined) {
		this.validator = require("./validator").get(options.validator);
	}
}

Store.prototype = Store;

Store.prototype.toString = function() {
	return this.options.type + "[" + this._name + "]";
}

Store.prototype.save = function(object, uid) {
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
Store.prototype._save = function(object, uid) {
	throw "AbstractStore has no _save";
}

Store.prototype.update = function(object, uid) {
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

Store.prototype.removeMapper = function(map, uuid, mapper) {
	for (i = 0; i < map.length; i++) {
		if (map[i]['uuid'] == uuid) {
			map.splice(i, 1);
			return true;
		}
	}
	return false;
}

Store.prototype.handleMap = function(object, map, updates) {
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
	for (prop in map) {
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
		mapped = store.get(object[map[prop].key]);
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
			mapper = {};
			mapper.uuid = object.uuid;
			// Add info to the mapped
			if (map[prop].fields) {
				fields = map[prop].fields.split(",");
				for (field in fields) {
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
			found = false;
			for (field in updates) {
				if (map[prop].fields) {
					fields = map[prop].fields.split(",");
					for (mapperfield in fields) {
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

Store.prototype._update = function(object, uid) {
	throw "AbstractStore has no _update"
}

Store.prototype.delete = function(uid, no_map) {
	object = this._get(uid);
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

Store.prototype._delete = function(uid) {
	throw "AbstractStore has no _delete";
}

Store.prototype.get = function(uid) {
	object = this._get(uid);
	if (this.validator && object != undefined) {
		// Need to get the object to verify
		if (!this.validator.get(object)) {
			console.log("Illegal attempt to read: " + uid);
			return;
		}
	}
	return object;
}

Store.prototype._get = function(uid) {
	throw "AbstractStore has no _get";
}

var fs = require("fs");

FileStore = function(name, options) {
	Store.call(this, name, options);
	if (!fs.existsSync(options.folder)) {
		fs.mkdirSync(options.folder);
	}
}

FileStore.prototype = Object.create(Store.prototype);;

FileStore.prototype.file = function(uid) {
	return this.options.folder + '/' + uid;
}

FileStore.prototype.exists = function(uid) {
	// existsSync is deprecated might change it
	return fs.existsSync(this.file(uid));
}

FileStore.prototype._save = function(object, uid) {
	fs.writeFileSync(this.file(uid), JSON.stringify(object));
	return object;
}

FileStore.prototype._delete = function(uid) {
	if (this.exists(uid)) {
		fs.unlinkSync(this.file(uid));
	}
}

FileStore.prototype._update = function(object, uid) {
	if (!this.exists(uid)) {
		return undefined;
	}
	stored = this._get(uid);
	for (prop in object) {
		stored[prop]=object[prop];
	}
	return this._save(stored, uid)
}

FileStore.prototype._get = function(uid) {
	if (!this.exists(uid)) {
		return undefined;
	}
	return JSON.parse(fs.readFileSync(this.file(uid)));
}

var MongoClient = require('mongodb').MongoClient

MongoStore = function(name, options) {
	Store.call(this, name, options);
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
MongoStore.prototype = Object.create(Store.prototype);

MongoStore.prototype.exists = function(uid) {
	// existsSync is deprecated might change it
	return fs.existsSync(this.file(uid));
}

MongoStore.prototype._save = function(object, uid) {
	this._collection.insertOne(object, function(err, result) {

	});
	return object;
}

MongoStore.prototype._delete = function(uid) {
	this._collection.deleteOne({ uuid: uid}, function(err, result) {

	});
	// Should make it sync ?
}

MongoStore.prototype._update = function(object, uid) {
	this._collection.updateOne({ uuid: uid}, object, function (err, reuslt) {

	});
}

MongoStore.prototype._get = function(uid) {
	this._collection.find({ uuid: uid});
}

types = {"FileStore": FileStore};

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