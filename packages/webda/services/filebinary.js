"use strict";
const Binary = require('./binary');
const fs = require("fs");
const _extend = require('util')._extend;

/**
 * FileBinary handles the storage of binary on a hard drive
 *
 * The structure used for now is 
 * /folder/{hash}/data
 * /folder/{hash}/{targetStore}_{uuid}
 * /folder/{hash}/challenge
 *
 * It takes one parameter
 *  folder: "path"
 *
 * See Binary the general interface
 */
class FileBinary extends Binary {
	/** @ignore */
	constructor(webda, name, params) {
		super(webda, name, params);
		if (!fs.existsSync(params.folder)) {
			fs.mkdirSync(params.folder);
		}
		if (!this._params.folder.endsWith('/')) {
			this._params.folder += '/'
		}
	}

	initRoutes(config, expose) {
		super.initRoutes(config, expose);
		// Will redirect to this URL for direct upload
		let url = this._url + "/upload/data/{hash}";
		console.log(url);
      	config[url] = {"method": ["PUT"], "executor": this._name, "_method": this.storeBinary, "aws": {"defaultCode": 204}};
    }

	get(info) {
		var path = this._getPath(info.hash, 'data');
		if (!fs.existsSync(path)) {
			return "";
		}
		return fs.createReadStream(path);
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

	getPutUrl() {
		// Get a full URL, this method should be in a Route Object
		return this._route._http.protocol + "://" + this._route._http.headers.host + this._url + "/upload/data/" + this.body.hash;
	}

	/**
	 * Will give you the redirect url
	 * 
	 * @ignore
	 */
	putRedirectUrl() {
		if (this.body.hash === undefined) {
			console.log("Request not conform", this.body);
			return Promise.reject();
		}
		if (fs.existsSync(this._getPath(this.body.hash, this._params.store + "_" + this._params.uid))) {
			if (!fs.existsSync(this._getPath(this.body.hash, 'data'))) {
				return Promise.resolve(this.getPutUrl());
			}
			// If the link is already register just return directly ok
			return Promise.resolve();
		}
		// Get the target object to add the mapping
		let targetStore = this._verifyMapAndStore();
		return targetStore.get(this._params.uid).then( (object) => {
			return this.updateSuccess(targetStore, object, this._params.property, 'add', this.body, this.body.metadatas);
		}).then ( (updated) => {
			// Need to store the usage of the file
			if (!fs.existsSync(this._getPath(this.body.hash))) {
				fs.mkdirSync(this._getPath(this.body.hash));
			}
			this._touch(this._getPath(this.body.hash, this._params.store + "_" + this._params.uid));
			if (this.challenge(this.body.hash, this.body.challenge)) {
				// Return empty as we dont need to upload the data
				return Promise.resolve();
			}
			// Return the url to upload the binary now
			return Promise.resolve(this.getPutUrl());
		});
	}

	/**
	 * Store the binary sent
	 *
	 * Check the hashs match and that a storage folder exists
	 * The storage folder should have been created by the putRedirectUrl
	 *
	 * @ignore
	 */
	storeBinary() {
		var result = this._getHashes(this.body);
		if (this._params.hash !== result.hash) {
			throw 400;
		}
		if (!fs.existsSync(this._getPath(result.hash))) {
			// The folder should have been create by a previous request
			throw 412;
		}
		let path = this._getPath(result.hash, 'data');
		if (!fs.existsSync(path)) {
			// Save the data
			fs.writeFileSync(path, this.body);
		}
		// Save the challenge
		this._touch(this._getPath(result.hash, "_" + result.challenge));
		return Promise.resolve();
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
			return this.deleteSuccess(targetStore, object, property, index);
		}).then( (updated) => {
			this._cleanUsage(hash, object.uuid);
			return Promise.resolve(updated);
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
		if (file.buffer) {
			fs.writeFileSync(this._getPath(file.hash, 'data'), file.buffer);
		}
		// Store the challenge
		this._touch(this._getPath(file.hash, "_" + file.challenge));
		this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
	}

	store(targetStore, object, property, file, metadatas) {
		this._checkMap(targetStore._name, property);
		this._prepareInput(file);
		file = _extend(file, this._getHashes(file.buffer));
		if (fs.existsSync(this._getPath(file.hash))) {
			this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
			return this.updateSuccess(targetStore, object, property, 'add', file, metadatas);
		}
		this._store(file, targetStore, object)
		return this.updateSuccess(targetStore, object, property, 'add', file, metadatas);
	}

	update(targetStore, object, property, index, file, metadatas) {
		this._checkMap(targetStore._name, property);
		this._prepareInput(file);
		file = _extend(file, this._getHashes(file.buffer));
		if (fs.existsSync(this._getPath(file.hash))) {
			this._touch(this._getPath(file.hash, targetStore._name + "_" + object.uuid));
			return this.updateSuccess(targetStore, object, property, index, file, metadatas);
		}
		this._store(file, targetStore, object)
		return this.updateSuccess(targetStore, object, property, index, file, metadatas);
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