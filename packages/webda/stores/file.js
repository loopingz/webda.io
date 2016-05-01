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
		return Promise.resolve(fs.existsSync(this.file(uid)));
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
		return Promise.all(res);
	}

	_save(object, uid) {
		fs.writeFileSync(this.file(uid), JSON.stringify(object));
		return Promise.resolve(object);
	}

	_delete(uid) {
		return this.exists(uid).then ( (res) => {
			if (res) {
				fs.unlinkSync(this.file(uid));
			}
			return Promise.resolve();
		});
	}

	_update(object, uid) {
		return this.exists(uid).then( (found) => {
			if (!found) {
				return Promise.reject(Error('NotFound'));
			}
			return this._get(uid);
		}).then( (stored) => {
			for (var prop in object) {
				stored[prop]=object[prop];
			}
			return this._save(stored, uid);
		});
	}

	_get(uid) {
		return this.exists(uid).then ((res) => {
			if (res) {
				return Promise.resolve(JSON.parse(fs.readFileSync(this.file(uid))));		
			}
			return Promise.resolve(undefined);
		});
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