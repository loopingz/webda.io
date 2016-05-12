"use strict";
const Executor = require("./executor.js");
const Store = require("../stores/store.js");
const fs = require("fs");
const path = require("path");
const mime = require('mime-types');
const crypto = require("crypto");

/**
 * This is an abstract service to represent a storage of files
 * The binary allow you to expose this service as HTTP ( therefore is an executor )
 * It needs an object to attach the binary too
 *
 * The Binary storage should store only once a binary and reference every object that are used by this binary, so it can be cleaned.
 *
 * 
 * @see FileBinary
 * @see S3Binary
 *
 * @exports
 * @abstract
 * @class Binary
 */
class Binary extends Executor {

	/**
	 * When you store a binary to be able to retrieve it you need to store the information into another object
	 *  
	 * If you have a User object define like this : User = {'name': 'Remi', 'uuid': 'Loopingz'}
	 * You will call the store(userStore, 'Loopingz', 'images', filedata, {'type':'profile'})
	 * After a successful call the object will look like User = {'name': 'Remi', 'uuid': 'Loopingz', 'images': [{'type':'profile','hash':'a12545...','size':1245,'mime':'application/octet'}]}
	 *
	 *
	 * @param {Store} targetStore The store that handles the object to attach binary to
	 * @param {String} object The object uuid to get from the store
	 * @param {String} property The object property to add the file to
	 * @param {Object} file The file by itself
	 * @param {Object} metadatas to add to the binary object
	 * @emits 'binaryCreate'
	 */
	store(targetStore, object, property, file, metadatas) {
		throw Error("AbstractBinary has no store method");
	}

	/**
	 * The store can retrieve how many time a binary has been used
	 */
	getUsageCount(hash) {
		throw Error("AbstractBinary has no store method");
	}

	/**
	 * Update a binary 
	 *
	 *
	 * @param {Store} targetStore The store that handles the object to attach binary to
	 * @param {String} object The object uuid to get from the store
	 * @param {String} property The object property to add the file to
	 * @param {Number} index The index of the file to change in the property
	 * @param {Object} file The file by itself
	 * @param {Object} metadatas to add to the binary object
	 * @emits 'binaryUpdate'
	 */
	update(targetStore, object, property, index, file, metadatas) {
		throw Error("AbstractBinary has no update method");
	}

	/**
	 * Update a binary 
	 *
	 *
	 * @param {Store} targetStore The store that handles the object to attach binary to
	 * @param {String} object The object uuid to get from the store
	 * @param {String} property The object property to add the file to
	 * @param {Number} index The index of the file to change in the property
	 * @emits 'binaryDelete'
	 */
	delete(targetStore, object, property, index) {
		throw Error("AbstractBinary has no update method");
	}

	/**
	 * Get a binary 
	 *
	 * @param {Object} info The reference stored in your target object
	 * @emits 'binaryGet'
	 */
	get(info) {
		this.emit('binaryGet', {'object': info, 'service': this});
	}

	/** @ignore */
	init(config) {
		this.initMap(this._params.map);
		if (this._params.expose) {
			this.initRoutes(config, this._params.expose);
		}
	}

	initMap(map) {
		if (map == undefined || map._init) {
			return;
		}
		var maps = {}
		this._lowercaseMaps = {};
		for (var prop in map) {
			this._lowercaseMaps[prop.toLowerCase()]=prop;
			var reverseStore = this._webda.getService(prop);
			if (reverseStore === undefined || ! reverseStore instanceof Store) {
				console.log("Can't setup mapping as store doesn't exist");
				map[prop]["-onerror"] = "NoStore";
				continue;
			}
			reverseStore.addReverseMap(map[prop], {'store': this._name, 'name': map[prop]});
	    }
	}

	_getHashes(buffer) {
		var result = {};
		var hash = crypto.createHash('sha256');
		var challenge = crypto.createHash('sha256');
		challenge.update('WEBDA');
		result.hash = hash.update(buffer).digest('hex');
		result.challenge = challenge.update(buffer).digest('hex');
		return result;
	}

	_prepareInput(file) {
		if (file.path !== undefined) {
			file.buffer = fs.readFileSync(file.path);
			file.originalname = path.basename(file.path);
			file.size = fs.statSync(file.path).size;
			file.mimetype = mime.lookup(file.path) || 'application/octet-stream';
		}
	}

	_checkMap(name, property) {
		if (this._params.map !== undefined && this._params.map[name] !== undefined) {
			for (var i in this._params.map[name]) {
				if (this._params.map[name][i] === property) {
					return;
				}
			}
		}
		throw Error("Unknown mapping");		
	}

	storeSuccess(targetStore, object, property, file, metadatas) {
		var update = {};
		update[property] = object[property];
		if (update[property] === undefined) {
			update[property] = [];
		}
		var fileObj = {};
		for (var i in metadatas) {
			fileObj[i] = metadatas;
		}
		fileObj['name']=file.originalname;
		fileObj['mimetype']=file.mimetype;
		fileObj['size']=file.size;
		fileObj['hash']=file.hash;
		fileObj['challenge']=file.challenge;
		update[property].push(fileObj);
		// Dont handle reverseMap
		console.log("storeSuccess");
		return targetStore.update(update, object.uuid, false).then ( (updated) => {
			console.log("youhou");
			this.emit('binaryCreate', {'object': fileObj, 'service': this});
			console.log("shouldReturn", updated);
			return Promise.resolve(updated);
		});
	}

	

	_validChallenge(challenge) {
		var re = /[0-9A-Fa-f]{64}/g;
		return re.test(challenge);
	}

	challenge(hash, challenge) {
		return false;
	}

	updateSuccess(targetStore, object, property, index, file, metadatas) {
		var update = {};
		update[property] = object[property];
		if (update[property] === undefined) {
			update[property] = [];
		}
		var fileObj = {};
		for (var i in metadatas) {
			fileObj[i] = metadatas;
		}
		fileObj['name']=file.originalname;
		fileObj['mimetype']=file.mimetype;
		fileObj['size']=file.size;
		fileObj['hash']=file.hash;
		fileObj['challenge']=file.challenge;
		update[property] = object[property];
		var object_uid = object.uuid;
		var info = update[property][index];
		update[property][index]=fileObj;
		return targetStore.update(update, object.uuid, false).then( (updated) => {
			this.cascadeDelete(info, object_uid);
			this.emit('binaryUpdate', {'object': info, 'service': this});
			return Promise.resolve(updated);
		});
	}


	cascadeDelete(info, uuid) {

	}

	deleteSuccess(targetStore, object, property, index) {
		var update = {};
		var info = object[property][index];
		update[property] = object[property];
		update[property].splice(index, 1);
		return targetStore.update(update, object.uuid, false).then ( (updated) => {
			this.emit('binaryDelete', {'object': info, 'service': this});
			return Promise.resolve(updated)
		});
	}

	_getFile(req) {
		var file;
		if (req.files !== undefined) {
			file = req.files[0];
		} else {
			file = {};
			file.buffer = req.body;
			file.mimetype = req.headers.contentType;
			file.size = len(req.body);
			file.originalname = '';
		}
		return file;
	}

	initRoutes(config, expose) {
		if (typeof(expose) == "boolean") {
	        expose = {};
	        expose.url = "/" + this._name.toLowerCase();
	    } else if (typeof(expose) == "string") {
			url = expose;
			expose = {};
			expose.url = url;
		} else if (typeof(expose) == "object" && expose.url == undefined) {
			expose.url = "/" + this._name.toLowerCase();
		}
		if (expose.restrict == undefined) {
			expose.restrict = {}
		}
      	// Need index to update or get
      	var url = expose.url + "/{store}/{uid}/{property}/{index}";
      	config[url] = {"method": ["GET"], "executor": this._name, "expose": expose, "_method": this.httpRoute};
      	
      	// No need the index to add file
      	url = expose.url + "/{store}/{uid}/{property}";
      	config[url] = {"method": ["POST"], "executor": this._name, "expose": expose, "_method": this.httpPost};

      	// Add file with challenge
      	url += "?c={challenge}&h={hash}";
      	config[url] = {"method": ["POST"], "executor": this._name, "expose": expose, "_method": this.httpRoute};

		// Need hash to avoid concurrent delete
      	url = expose.url + "/{store}/{uid}/{property}/{index}/{hash}";      	
      	config[url] = {"method": ["DELETE", "PUT"], "executor": this._name, "expose": expose, "_method": this.httpRoute};

      	// Challenged upload
      	url += "?c={challenge}&h={hash}";      	
      	config[url] = {"method": ["PUT"], "executor": this._name, "expose": expose, "_method": this.httpRoute};
	}

	httpPost() {
		let targetStore = this._verifyMapAndStore();
		return targetStore.get(this._params.uid).then ((object) => {
			console.log("storing file");
			return this.store(targetStore, object, this._params.property, this._getFile(this), this.body).then((object) => {
				console.log("writing answer");
				this.write(object);
				return Promise.resolve();
			});
		});
	}

	_verifyMapAndStore() {
		// To avoid any probleme lowercase everything
		var map = this._params.map[this._lowercaseMaps[this._params.store.toLowerCase()]];
		if (map === undefined || map.indexOf(this._params.property) == -1) {
			throw 404;	
		}
		var targetStore = this.getService(this._params.store);
		if (targetStore === undefined) {
			throw 404;
		}
		return targetStore;
	}

	// Executor side
	httpRoute() {
		let targetStore = this._verifyMapAndStore();
		return targetStore.get(this._params.uid).then ((object) => {
			if (object === undefined) {
				throw 404;
			}
			if (object[this._params.property] !== undefined && typeof(object[this._params.property]) !== 'object') {
				throw 403;
			}
			if (object[this._params.property] === undefined || object[this._params.property][this._params.index] === undefined) {
				throw 404;
			}
			if (this._route._http.method == "GET") {
				var file = object[this._params.property][this._params.index];
				this.writeHead(200, {
		        	'Content-Type': file.mimetype===undefined?'application/octet-steam':file.mimetype,
		        	'Content-Length': file.size
			    });
				return new Promise((resolve, reject) => {
				    var readStream = this.get(file);
				    // We replaced all the event handlers with a simple call to readStream.pipe()
				    this._stream.on('finish', (src) => {
						return resolve();
					});
					this._stream.on('error', (src) => {
						return reject();
					});
				    readStream.pipe(this._stream);
				});
			} else {
				var update = {};
				if (object[this._params.property][this._params.index].hash !== this._params.hash) {
					throw 412;
				}
				if (this._route._http.method == "DELETE") {
					return this.delete(targetStore, object, this._params.property, index).then ((object) => {
						this.write(object);
					});
				} else if (this._route._http.method == "PUT") {
					return this.update(targetStore, object, this._params.property, this._params.index, this._getFile(this), this.body).then((object) => {
						this.write(object);
		    		});
				}
			}
		});
	}
}

module.exports = Binary