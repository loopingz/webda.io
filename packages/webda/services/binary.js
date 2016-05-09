"use strict";
const Executor = require("./executor.js");
const Store = require("../stores/store.js");
const fs = require("fs");
const path = require("path");
const mime = require('mime-types');
const crypto = require("crypto");

class Binary extends Executor {

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
		this._lowerMaps = {};
		var maps = {}
		for (var prop in map) {
			this._lowerMaps[prop.toLowerCase()]=prop;
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
		targetStore.update(update, object.uuid, false);
		this.emit('binaryCreate', {'object': fileObj, 'service': this});
	}

	store(targetStore, object, property, file, metadatas) {
		throw Error("AbstractBinary has no store method");
	}

	getUsageCount(hash) {
		throw Error("AbstractBinary has no store method");
	}

	update(targetStore, object, property, index, file, metadatas) {
		throw Error("AbstractBinary has no update method");
	}

	delete(targetStore, object, property, index) {
		throw Error("AbstractBinary has no update method");
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
		targetStore.update(update, object.uuid, false);
		this.cascadeDelete(info, object_uid);
		this.emit('binaryUpdate', {'object': info, 'service': this});
	}

	get(info) {
		this.emit('binaryGet', {'object': info, 'service': this});
	}

	cascadeDelete(info, uuid) {

	}

	deleteSuccess(targetStore, object, property, index) {
		var update = {};
		var info = object[property][index];
		update[property] = object[property];
		update[property].splice(index, 1);
		targetStore.update(update, object.uuid, false);
		this.emit('binaryDelete', {'object': info, 'service': this});
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
      	config[url] = {"method": ["GET"], "executor": this._name, "expose": expose};
      	
      	// No need the index to add file
      	url = expose.url + "/{store}/{uid}/{property}";
      	config[url] = {"method": ["POST"], "executor": this._name, "expose": expose};

      	// Add file with challenge
      	url += "?c={challenge}&h={hash}";
      	config[url] = {"method": ["POST"], "executor": this._name, "expose": expose};

		// Need hash to avoid concurrent delete
      	url = expose.url + "/{store}/{uid}/{property}/{index}/{hash}";      	
      	config[url] = {"method": ["DELETE", "PUT"], "executor": this._name, "expose": expose};

      	// Challenged upload
      	url += "?c={challenge}&h={hash}";      	
      	config[url] = {"method": ["PUT"], "executor": this._name, "expose": expose};
	}
	// Executor side
	execute() {
		var self = this;
		var req = this._rawRequest;
		var storeName = this._lowerMaps[this._params.store];
		if (storeName === undefined) {
			throw 404;
		}
		var map = this._params.map[storeName];
		var found = false;
		for (var i in map) {
			if (map[i] === this._params.property) {
				found = true;
				break;
			}
		}
		if (!found) {
			throw 404;	
		}
		var targetStore = this.getService(storeName);
		if (targetStore === undefined) {
			throw 404;
		}
		return targetStore.get(this._params.uid).then ((object) => {
			if (object === undefined) {
				throw 404;
			}
			if (object[this._params.property] !== undefined && typeof(object[this._params.property]) !== 'object') {
				throw 403;
			}
		
			if (this._route._http.method == "POST") {
				return this.store(targetStore, object, self._params.property, this._getFile(req), req.body).then(() => {
					return targetStore.get(object.uuid);
				}).then ((object) => {
					this.write(object);
		    	});
			} else if (this._route._http.method == "GET") {
				if (object[this._params.property] === undefined || object[this._params.property][this._params.index] === undefined) {
					throw 404;
				}
				var file = object[this._params.property][this._params.index];
				this.writeHead(200, {
		        	'Content-Type': file.mimetype===undefined?'application/octet-steam':file.mimetype,
		        	'Content-Length': file.size
			    });
				return new Promise((resolve, reject) => {
				    var readStream = this.get(file);
				    // We replaced all the event handlers with a simple call to readStream.pipe()
				    this._stream.on('finish', (src) => {
				    	console.log("_stream finished");
						return resolve();
					});
					this._stream.on('error', (src) => {
						console.log(src);
						return reject();
					});
				    readStream.pipe(this._stream);
				});
			} else if (this._route._http.method == "DELETE") {
				if (object[this._params.property] === undefined || object[this._params.property][this._params.index] === undefined) {
					throw 404;
				}
				var update = {};
				if (object[self._params.property][this._params.index].hash !== this._params.hash) {
					throw 412;
				}
				return this.delete(targetStore, object, self._params.property, index).then (() => {
					return targetStore.get(self._params.uid);
				}).then ((object) => {
					this.write(object);
				});
			} else if (this._route._http.method == "PUT") {
				if (object[this._params.property] === undefined || object[this._params.property][this._params.index] === undefined) {
					throw 404;
				}
				var update = {};
				if (object[self._params.property][this._params.index].hash !== this._params.hash) {
					throw 412;
				}
				return this.update(targetStore, object, self._params.property, this._params.index, this._getFile(req), req.body).then(() => {
					return targetStore.get(object.uuid);
				}).then ( (object) => {
					this.write(object);
		    	});
			}
		});
	}
}

module.exports = Binary