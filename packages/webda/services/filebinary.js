"use strict";
const Binary = require('./binary');
const fs = require("fs");
const _extend = require('util')._extend;

class FileBinary extends Binary {
	constructor(webda, name, params) {
		super(webda, name, params);
		if (!fs.existsSync(params.folder)) {
			fs.mkdirSync(params.folder);
		}
		if (!this._params.folder.endsWith('/')) {
			this._params.folder += '/'
		}
	}

	get(info) {
		var path = this._getPath(info.hash, 'data');
		if (!fs.existsSync(path)) {
			return "";
		}
		return fs.createReadStream();
	}

	_getPath(hash, postfix) {
		if (postfix === undefined) {
			return this._params.folder + hash;
		}
		return this._params.folder + hash + '/' + postfix;
	}

	_touch(path) {
		fs.closeSync(fs.openSync(path, 'w'));
	}

	getUsageCount(hash) {
		return new Promise( (resolve, reject) => {
			var path = this._getPath(hash);
			if (!fs.existsSync(path)) {
				resolve(0);
			}
			var files = fs.readdirSync(path);
			resolve(files.length - 2);
		});
	}

	_cleanHash(hash) {

	}

	_cleanUsage(hash, uuid) {
		if (!fs.existsSync(this._getPath(hash))) return;
		var files = fs.readdirSync(this._getPath(hash));
		for (var i in files) {
			if (files[i].endsWith(uuid)) {
				fs.unlink(this._getPath(hash, files[i]));
			}
		}
		if (files.length == 3) {
			this._cleanHash(hash);
		}
	}

	delete(targetStore, object, property, index) {
		return new Promise( (resolve, reject) => {
			var hash = object[property][index].hash;
			this.deleteSuccess(targetStore, object, property, index);
			this._cleanUsage(hash, object.uuid);
			resolve();
		});
	}

	challenge(hash, challenge) {
		if (!this._validChallenge(challenge)) {
			return false;
		}
		var path = this._getPath(hash);
		if (!fs.existsSync(path) || !fs.existsSync(path+'/_' + challenge)) {
			return false;
		}
		return true;
	}

	cascadeDelete(info, uuid) {
		this._cleanUsage(info.hash, '_'+uuid);
	}

	_store(file, targetStore, object) {
		fs.mkdirSync(this._getPath(file.hash));
		fs.writeFileSync(this._getPath(file.hash, 'data'), file.buffer);
		// Store the challenge
		this._touch(this._getPath(file.hash, "_" + file.challenge));
		this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
	}

	store(targetStore, object, property, file, metadatas) {
		return new Promise( (resolve, reject) => {
			this._checkMap(targetStore._name, property);
			this._prepareInput(file);
			file = _extend(file, this._getHashes(file.buffer));
			if (fs.existsSync(this._getPath(file.hash))) {
				this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
				this.storeSuccess(targetStore, object, property, file, metadatas);
				return resolve();
			}
			this._store(file, targetStore, object)
			this.storeSuccess(targetStore, object, property, file, metadatas);
			return resolve();
		});
	}

	update(targetStore, object, property, index, file, metadatas) {
		return new Promise( (resolve, reject) => {
			this._checkMap(targetStore._name, property);
			this._prepareInput(file);
			file = _extend(file, this._getHashes(file.buffer));
			if (fs.existsSync(this._getPath(file.hash))) {
				this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
				this.updateSuccess(targetStore, object, property, index, file, metadatas);
				return resolve();
			}
			this._store(file, targetStore, object)
			this.updateSuccess(targetStore, object, property, index, file, metadatas);
			return resolve();
		});
	}

	___cleanData() {
		var ids = fs.readdirSync(this._params.folder);
		for (var i in ids) {
			var hash = ids[i];
			if (!fs.existsSync(this._params.folder + hash)) {
				continue;
			}
			var files = fs.readdirSync(this._params.folder + hash);
			for (var file in files) {
				fs.unlinkSync(this._params.folder + hash + '/' + files[file]);
			}
			fs.rmdirSync(this._params.folder + hash + '/');
		}
		return Promise.resolve();
	}
}

module.exports = FileBinary;