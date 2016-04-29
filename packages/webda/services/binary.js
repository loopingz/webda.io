"use strict";
const Executor = require("../executors/executor.js");
const Store = require("../stores/store.js");
const fs = require("fs");
const path = require("path");
const mime = require('mime-types');

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
		var maps = {}
		for (var prop in map) {
			var reverseStore = this._webda.getService(prop);
			if (reverseStore === undefined || ! reverseStore instanceof Store) {
				console.log("Can't setup mapping as store doesn't exist");
				continue;
			}
			reverseStore.addReverseMap(map[prop], {'store': this._name, 'name': map[prop]});
	    }
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

	storeSuccess(targetStore, object, property, file, metadatas, callback) {
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
		fileObj['hash']=file.hashValue;
		update[property].push(fileObj);
		// Dont handle reverseMap
		targetStore.update(update, object.uuid, false);
		if (callback !== undefined) {
			callback();
		}
		this.emit('binaryCreate', {'object': fileObj, 'service': this});
	}

	store(targetStore, object, property, file, metadatas, callback) {
		throw Error("AbstractBinary has no store method");
	}

	getUsageCount(hash) {
		throw Error("AbstractBinary has no store method");
	}

	update(targetStore, object, property, index, file, metadatas, callback) {
		throw Error("AbstractBinary has no update method");
	}

	delete(targetStore, object, property, index) {
		throw Error("AbstractBinary has no update method");
	}

	updateSuccess(targetStore, object, property, index, file, metadatas, callback) {
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
		fileObj['hash']=file.hashValue;
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

	initRoutes(config, expose) {
		if (typeof(expose) == "boolean") {
	        expose = {};
	        expose.url = "/" + this._name;
	    } else if (typeof(expose) == "string") {
			url = expose;
			expose = {};
			expose.url = url;
		} else if (typeof(expose) == "object" && expose.url == undefined) {
			expose.url = "/" + this._name;
		}
		if (expose.restrict == undefined) {
			expose.restrict = {}
		}
      	var url = expose.url + "/{store}/{uid}/{property}/{index}";
      	// Need index to update or get
      	config[url] = {"method": ["GET"], "executor": this._name, "expose": expose};
      	url = expose.url + "/{store}/{uid}/{property}";
      	// No need the index to add file
      	config[url] = {"method": ["POST"], "executor": this._name, "expose": expose};
      	url = expose.url + "/{store}/{uid}/{property}/{index}/{hash}";
      	// Need hash to avoid concurrent delete
      	config[url] = {"method": ["DELETE", "PUT"], "executor": this._name, "expose": expose};
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

	// Executor side
	execute() {
		var self = this;
		var req = this._rawRequest;
		if (this._params.map[this.params.store] === undefined) {
			throw 404;
		}
		var found = false;
		for (var i in this._params.map[this.params.store]) {
			if (this._params.map[this.params.store][i] === this.params.property) {
				found = true;
				break;
			}
		}
		if (!found) {
			throw 404;	
		}
		var targetStore = this.getStore(this.params.store);
		if (targetStore === undefined) {
			throw 404;
		}
		var object = targetStore.get(this.params.uid);
		if (object === undefined) {
			throw 404;
		}
		if (object[this.params.property] !== undefined && typeof(object[this.params.property]) !== 'object') {
			throw 403;
		}
		
		if (this._http.method == "POST") {
			
			this.store(targetStore, object, self.params.property, this._getFile(req), req.body).then(function() {
				this.writeHead(200, {'Content-type': 'application/json'});
				this.write(JSON.stringify(targetStore.get(object.uuid)));
	    		this.end();
	    	}).catch( function (err) {
	    		this.writeHead(500);
	    		console.log(err);
	    		this.end();
	    	});
		} else if (this._http.method == "GET") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var file = object[this.params.property][this.params.index];
			this.writeHead(200, {
	        	'Content-Type': file.mimetype===undefined?'application/octet-steam':file.mimetype,
	        	'Content-Length': file.size
		    });

		    var readStream = this.get(file);
		    // We replaced all the event handlers with a simple call to readStream.pipe()
		    readStream.pipe(this._rawResponse);
		} else if (this._http.method == "DELETE") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var update = {};
			if (object[self.params.property][this.params.index].hash !== this.params.hash) {
				throw 412;
			}
			this.delete(targetStore, object, self.params.property, index).then (function () {
				this.write(JSON.stringify(targetStore.get(self.params.uid)));
				this.end();
			}).catch( function (err) {
	    		this.writeHead(500);
	    		console.log(err);
	    		this.end();
	    	});
		} else if (this._http.method == "PUT") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var update = {};
			if (object[self.params.property][this.params.index].hash !== this.params.hash) {
				throw 412;
			}
			this.update(targetStore, object, self.params.property, this.params.index, this._getFile(req), req.body).then(function() {
				this.writeHead(200, {'Content-type': 'application/json'});
				this.write(JSON.stringify(targetStore.get(object.uuid)));
	    		this.end();
	    	}).catch( function (err) {
	    		this.writeHead(500);
	    		console.log(err);
	    		this.end();
	    	});
		}
	}
}

module.exports = Binary