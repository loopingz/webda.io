var stores = {};

var Store = function (options) {
	self = this;
	self.options = options;
}

Store.prototype = Store;

Store.prototype.save = function(object, uid) {
	throw "AbstractStore";
}

Store.prototype.delete = function(uid) {
	throw "AbstractStore";
}

Store.prototype.get = function(uid) {
	throw "AbstractStore";
}

var fs = require("fs");

FileStore = function(options) {
	Store.call(this, options);
	if (!fs.existsSync(options.folder)) {
		fs.mkdirSync(options.folder);
	}
}

FileStore.prototype.file = function(uid) {
	return this.options.folder + '/' + uid;
}

FileStore.prototype.exists = function(uid) {
	// existsSync is deprecated might change it
	return fs.existsSync(this.file(uid));
}

FileStore.prototype.save = function(object, uid) {
	fs.writeFileSync(this.file(uid), JSON.stringify(object));	
}

FileStore.prototype.delete = function(uid) {
	if (this.exists(uid)) {
		fs.unlink(this.file(uid));
	}
}

FileStore.prototype.get = function(uid) {
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
	stores[name] = new types[options.type](options);
}
module.exports.get = function (name) {
	return stores[name];
}
module.exports.remove = function (name) {
	delete stores[name];
}