"use strict";
const Store = require("./store")
var fs = require("fs");

class FileStore extends Store {
	constructor(webda, name, options) {
		super(webda, name, options);
		if (!fs.existsSync(options.folder)) {
			fs.mkdirSync(options.folder);
		}
	}

	file(uid) {
		return this._params.folder + '/' + uid;
	}

	exists(uid) {
		// existsSync is deprecated might change it
		return fs.existsSync(this.file(uid));
	}

	_find(request, offset, limit) {
		var self = this;
		var res = [];
		var path = require('path');
		var files = fs.readdirSync(self._params.folder).filter(function(file) {
    		return !fs.statSync(path.join(self._params.folder, file)).isDirectory();
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

	___cleanData() {
		if (!fs.existsSync(this._params.folder)) {
			fs.mkdir(this._params.folder);  
		}
		var files = fs.readdirSync(this._params.folder);
		for (var file in files) {
			fs.unlink(this._params.folder + '/' + files[file]);
		}
		return Promise.resolve();
	}
}

module.exports = FileStore