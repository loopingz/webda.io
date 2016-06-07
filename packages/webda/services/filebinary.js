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

	getPutUrl(ctx) {
		// Get a full URL, this method should be in a Route Object
		return ctx._route._http.protocol + "://" + ctx._route._http.headers.host + this._url + "/upload/data/" + ctx.body.hash;
	}

	/**
	 * Will give you the redirect url
	 * 
	 * @ignore
	 */
	putRedirectUrl(ctx) {
		if (ctx.body.hash === undefined) {
			console.log("Request not conform", ctx.body);
			return Promise.reject();
		}
		if (fs.existsSync(this._getPath(ctx.body.hash, ctx._params.store + "_" + ctx._params.uid))) {
			if (!fs.existsSync(this._getPath(ctx.body.hash, 'data'))) {
				return Promise.resolve(this.getPutUrl(ctx));
			}
			// If the link is already register just return directly ok
			return Promise.resolve();
		}
		// Get the target object to add the mapping
		let targetStore = this._verifyMapAndStore(ctx);
		return targetStore.get(ctx._params.uid).then( (object) => {
			return this.updateSuccess(targetStore, object, ctx._params.property, 'add', ctx.body, ctx.body.metadatas);
		}).then ( (updated) => {
			// Need to store the usage of the file
			if (!fs.existsSync(this._getPath(ctx.body.hash))) {
				fs.mkdirSync(this._getPath(ctx.body.hash));
			}
			this._touch(this._getPath(ctx.body.hash, ctx._params.store + "_" + ctx._params.uid));
			if (this.challenge(ctx.body.hash, ctx.body.challenge)) {
				// Return empty as we dont need to upload the data
				return Promise.resolve();
			}
			// Return the url to upload the binary now
			return Promise.resolve(this.getPutUrl(ctx));
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
	storeBinary(ctx) {
		var result = this._getHashes(ctx.body);
		if (ctx._params.hash !== result.hash) {
			throw 400;
		}
		if (!fs.existsSync(this._getPath(result.hash))) {
			// The folder should have been create by a previous request
			throw 412;
		}
		let path = this._getPath(result.hash, 'data');
		if (!fs.existsSync(path)) {
			// Save the data
			fs.writeFileSync(path, ctx.body);
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
		var hash = object[property][index].hash;
		return this.deleteSuccess(targetStore, object, property, index).then( (updated) => {
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

	static getModda() {
		return {
			"uuid": "Webda/FileBinary",
			"label": "File Storage",
			"description": "Implements storage of files on the server filesystem",
			"webcomponents": [],
			"documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
			"logo": "images/placeholders/filestorage.png",
			"configuration": {
				"default": {
					"folder": "/tmp/binaries",
				},
				"schema": {
					type: "object",
					properties: {
						"expose": {
							type: "boolean"
						},
						"folder": {
							type: "string"
						}
					},
					required: ["folder"]
				}
			}
		}
	}
}

module.exports = FileBinary;