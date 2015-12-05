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
	if (this.options.expose != undefined && this.options.expose.map != undefined) {
		this.handleMap(object, this.options.expose.map, "created");
	}
	return object;
}
Store.prototype._save = function(object, uid) {
	throw "AbstractStore has no _save";
}

Store.prototype.update = function(object, uid) {
	if (this.validator && this.validator.update) {
		if (!this.validator.update(object)) {
			console.log("Illegal attempt to save: " + uid);
			return;
		}
	}
	if (this.options.expose != undefined && this.options.expose.map != undefined) {
		this.handleMap(object, this.options.expose.map, "updated");
	}
	return this._update(object, uid);
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
		store = stores[prop]
		// Cant find the store for this collection
		if (store == undefined) {
			console.log("no store for " + prop);
			continue;
		}
		mapped = store.get(object[map[prop].key]);
		// Enforce the collection if needed
		if (mapped[map[prop].target] == undefined) {
			mapped[map[prop].target]={};
		}
		// Invalid mapping
		if (mapped == undefined) {
			continue;
		}
		if ( updates == "created" ) {
			console.log("will update on created");
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
			
			mapped[map[prop].target][mapper.uuid]=mapper;
			// TODO Should be update
			store.save(mapped);
		} else if (updates == "deleted") {
			// Remove from the collection
			if (mapped[map[prop].target] == undefined || mapped[map[prop].target][object.uuid] == undefined) {
				continue;
			}
			delete mapped[map[prop].target][object.uuid];
			// TODO Should be update
			store.save(mapped, mapped.uuid);
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
				if (mapped[map[prop].target][object.uuid] != undefined) {
					delete mapped[map[prop].target][object.uuid];
					store.save(mapped, mapped.uuid);
				}
				// TODO Should be update
				mapped = store.get(updates[map[prop].key])
				if (mapped == undefined) {
					continue
				}
			}
			// Update the mapper
			mapper = {};
			mapper.uuid = object.uuid;
			if (map[prop].fields) {
				fields = map[prop].fields.split(",");
				for (field in fields) {
					mapper[fields[field]] = object[fields[field]];
				}
			}
			mapped[map[prop].target][mapper.uuid]=mapper;
			// Remove old reference
			console.log("update ...");
			store.save(mapped, mapped.uuid);
		}
	}
}

Store.prototype._update = function(object, uid) {
	throw "AbstractStore has no _update"
}

Store.prototype.delete = function(uid) {
	object = this._get(uid);
	if (this.validator) {
		// Need to get the object to verify
		if (!this.validator.delete(object)) {
			console.log("Illegal attempt to delete: " + uid);
			return;
		}
	}
	if (this.options.expose != undefined && this.options.expose.map != undefined) {
		this.handleMap(object, this.options.expose.map, "deleted");
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
		fs.unlink(this.file(uid));
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