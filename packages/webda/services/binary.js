"use strict";
const Executor = require("../executors/executor.js");
var fs = require("fs");

class FileBinaryExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "FileBinaryExecutor";
		if (!fs.existsSync(params.folder)) {
			fs.mkdirSync(params.folder);
		}
	}

	init(config) {
		if (this._params.expose) {
			this.initRoutes(config, this._params.expose);
		}
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

	// Executor side
	execute() {
		var self = this;
		var req = this._rawRequest;
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
		var file;
		if (this._http.method == "POST") {
			var hash = crypto.createHash('sha256');
			var bytes;
			if (req.files !== undefined) {
				file = req.files[0];
			} else {
				file = {};
				file.buffer = req.body;
				file.mimetype = req.headers.contentType;
				file.size = len(req.body);
				file.originalname = '';
			}
			var hashValue = hash.update(file.buffer).digest('hex');
			// TODO Dont overwrite if already there
			fs.writeFile(this._params.folder + hashValue, file.buffer, function (err) {
				var update = {};
				update[self.params.property] = object[self.params.property];
				if (update[self.params.property] === undefined) {
					update[self.params.property] = [];
				}
				var fileObj = {};
				for (var i in req.body) {
					fileObj[i] = req.body[i];
				}
				fileObj['name']=file.originalname;
				fileObj['mimetype']=file.mimetype;
				fileObj['size']=file.size;
				fileObj['hash']=hashValue;
				update[self.params.property].push(fileObj);
				targetStore.update(update, self.params.uid);
		    	self.writeHead(200, {'Content-type': 'application/json'});
				self.write(JSON.stringify(targetStore.get(self.params.uid)));
		    	self.end();
		  	});
		} else if (this._http.method == "GET") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			file = object[this.params.property][this.params.index];
			this.writeHead(200, {
	        	'Content-Type': file.mimetype===undefined?'application/octet-steam':file.mimetype,
	        	'Content-Length': file.size
		    });

		    var readStream = fs.createReadStream(this._params.folder + file.hash);
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
			update[self.params.property] = object[self.params.property];
			update[self.params.property].slice(this.params.index, 1);
			targetStore.update(update, self.params.uid);
			// TODO Delete binary or update its count
		    this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(targetStore.get(self.params.uid)));
			this.end();
		} else if (this._http.method == "PUT") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var update = {};
			if (object[self.params.property][this.params.index].hash !== this.params.hash) {
				throw 412;
			}
			// Should avoid duplication
			var hash = crypto.createHash('sha256');
			var bytes;
			if (req.files !== undefined) {
				file = req.files[0];
			} else {
				file = {};
				file.buffer = req.body;
				file.mimetype = req.headers.contentType;
				file.size = len(req.body);
				file.originalname = '';
			}
			var hashValue = hash.update(file.buffer).digest('hex');
			// TODO Dont overwrite if already there
			fs.writeFile(this._params.folder + hashValue, file.buffer, function (err) {
				var update = {};
				update[self.params.property] = object[self.params.property];
				if (update[self.params.property] === undefined) {
					update[self.params.property] = [];
				}
				var fileObj = {};
				for (var i in req.body) {
					fileObj[i] = req.body[i];
				}
				fileObj['name']=file.originalname;
				fileObj['mimetype']=file.mimetype;
				fileObj['size']=file.size;
				fileObj['hash']=hashValue;
				update[self.params.property] = object[self.params.property];
				update[self.params.property][self.params.index]=fileObj;
				targetStore.update(update, self.params.uid);
		    	self.writeHead(200, {'Content-type': 'application/json'});
				self.write(JSON.stringify(targetStore.get(self.params.uid)));
		    	self.end();
		  	});
		}
	}
}

module.exports = FileBinaryExecutor