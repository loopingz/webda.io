var stores = {};

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
	this._save(object, uid);
}
Store.prototype._save = function(object, uid) {
	throw "AbstractStore";
}

Store.prototype.delete = function(uid) {
	if (this.validator) {
		// Need to get the object to verify
		if (!this.validator.delete(this._get(uid))) {
			console.log("Illegal attempt to delete: " + uid);
			return;
		}
	}
	this._delete(uid);
}

Store.prototype._delete = function(uid) {
	throw "AbstractStore";
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
	throw "AbstractStore";
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
}

FileStore.prototype._delete = function(uid) {
	if (this.exists(uid)) {
		fs.unlink(this.file(uid));
	}
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