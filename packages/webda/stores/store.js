"use strict";

var stores = {};
var uuid = require('node-uuid');
const Executor = require("../executors/executor");

class Store extends Executor {
	constructor (webda, name, options) {
		super(webda, name, options);
		this._name = name;
		this._reverseMap = [];
		this._cascade = [];
	}

	init(config) {
		this.initMap(this._params.map);
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
		config[expose.url] = {"method": ["POST", "GET"], "executor": this._name, "expose": expose};
		config[expose.url+"/{uuid}"] = {"method": ["GET", "PUT", "DELETE"], "executor": this._name, "expose": expose};
	}

	addReverseMap(prop, cascade) {
		this._reverseMap.push(prop);
		if (cascade) {
			this._cascade.push(cascade);
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
			var cascade = undefined;
			if (map[prop].cascade) {
				cascade = {'store': this._name, 'name': map[prop].target};
			}
			reverseStore.addReverseMap(map[prop].target, cascade);
	    }
	}
	toString() {
		return this._params.type + "[" + this._name + "]";
	}

	save(object, uid) {
		if (uid == undefined) {
			uid = object.uuid;
		}
		if (uid == undefined) {
			uid = uuid.v4();
		}
		if (object.uuid == undefined || object.uuid != uid) {
			object.uuid = uid;
		}
		this.emit('storeSave', {'object': object, 'store': this});
		object = this._save(object, uid);
		this.emit('storeSaved', {'object': object, 'store': this});
		if (this._params.map != undefined) {
			this.handleMap(object, this._params.map, "created");
		}
		return object;
	}
	_save(object, uid) {
		throw "AbstractStore has no _save";
	}

	update(object, uid) {
		if (uid == undefined) {
			uid = object.uuid;
		}
		// Dont allow to update collections from map
		if (this._reverseMap != undefined) {
			for (var i in this._reverseMap) {
				if (object[this._reverseMap[i]] != undefined) {
					delete object[this._reverseMap[i]];
				}
			}
		}
		if (this._params.map != undefined) {
			this.handleMap(this._get(uid), this._params.map, object);
		}
		this.emit('storeUpdate', {'object': object, 'store': this});
		var result = this._update(object, uid);
		this.emit('storeUpdated', {'object': result, 'store': this});
		return result;
	}

	removeMapper(map, uuid, mapper) {
		for (var i = 0; i < map.length; i++) {
			if (map[i]['uuid'] == uuid) {
				map.splice(i, 1);
				return true;
			}
		}
		return false;
	}

	handleMap(object, map, updates) {
		//stores = module.exports;
		/*
		"map": {
			"users": {
				"key": "user",
				"target": "idents",
				"fields": "type"
			}
		}
		*/
		if (object === undefined) {
			return;
		}
		for (var prop in map) {
			// No mapped property or not in the object
			if (map[prop].key == undefined || object[map[prop].key] == undefined) {
				continue;
			}
			var store = this.getService(prop);
			// Cant find the store for this collection
			if (store == undefined) {
				continue;
			}
			var mapped = store.get(object[map[prop].key]);
			// Invalid mapping
			if (mapped == undefined) {
				continue;
			}
			// Enforce the collection if needed
			if (mapped[map[prop].target] == undefined) {
				mapped[map[prop].target]=[];
			}
			if ( updates == "created" ) {
				// Add to the object
				var mapper = {};
				mapper.uuid = object.uuid;
				// Add info to the mapped
				if (map[prop].fields) {
					var fields = map[prop].fields.split(",");
					for (var field in fields) {
						mapper[fields[field]] = object[fields[field]];
					}
				}
				// Can happen with self defined uuid like ident
				mapped[map[prop].target].push(mapper);
				// TODO Should be update
				store.save(mapped);
			} else if (updates == "deleted") {
				// Remove from the collection
				if (mapped[map[prop].target] == undefined) {
					continue;
				}
				if (this.removeMapper(mapped[map[prop].target], object.uuid)) {
					// TODO Should be update
					store.save(mapped, mapped.uuid);
				}
			} else if (typeof(updates) == "object") {
				// Update only if the key field has been updated
				var found = false;
				for (field in updates) {
					if (map[prop].fields) {
						fields = map[prop].fields.split(",");
						for (var mapperfield in fields) {
							if (fields[mapperfield] == field) {
								found = true;
								break;
							}
						}
					}
					// TODO Need to verify also if fields are updated
					if (field == map[prop].key) {
						found = true;
						break;
					}
				}
				if (!found) {
					continue;
				}
				// check if reference object has changed
				if (updates[map[prop].key] != undefined && mapped.uuid != updates[map[prop].key]) {
					if (this.removeMapper(mapped[map[prop].target], object.uuid)) {
						store.save(mapped, mapped.uuid);
					}
					// TODO Should be update
					mapped = store.get(updates[map[prop].key])
					if (mapped == undefined) {
						continue
					}
					// Enforce the collection if needed
					if (mapped[map[prop].target] == undefined) {
						mapped[map[prop].target]=[];
					}
				} else {
					this.removeMapper(mapped[map[prop].target], object.uuid);
				}
				// Update the mapper
				mapper = {};
				mapper.uuid = object.uuid;
				if (map[prop].fields) {
					fields = map[prop].fields.split(",");
					for (field in fields) {
						if (updates[fields[field]] != undefined) {
							mapper[fields[field]] = updates[fields[field]];
						} else {
							mapper[fields[field]] = object[fields[field]];
						}
					}
				}
				mapped[map[prop].target].push(mapper);
				// Remove old reference
				store.save(mapped, mapped.uuid);
			}
		}
	}

	_update(object, uid) {
		throw "AbstractStore has no _update"
	}

	delete(uid, no_map) {
		var object = this._get(uid);
		this.emit('storeDelete', {'object': object, 'store': this});
		if (this._params.map != undefined) {
			this.handleMap(object, this._params.map, "deleted");
		}
		if (this._cascade != undefined) {
			// Should deactiate the mapping in that case
			for (var i in this._cascade) {
				if (typeof(this._cascade[i]) != "object" || object[this._cascade[i].name] == undefined) continue;
				var targetStore = this.getStore(this._cascade[i].store);
				if (targetStore == undefined) continue;
				for (var item in object[this._cascade[i].name]) {
					targetStore.delete(object[this._cascade[i].name][item].uuid);
				}
			}
		}
		this._delete(uid);
		this.emit('storeDeleted', {'object': object, 'store': this});
	}

	_delete(uid) {
		throw "AbstractStore has no _delete";
	}

	get(uid) {
		var object = this._get(uid);
		this.emit('storeGet', {'object': object, 'store': this});
		return object;
	}

	_get(uid) {
		throw "AbstractStore has no _get";
	}

	find(request, offset, limit) {
		this.emit('storeFind', {'request': request, 'store': this, 'offset': offset, 'limit': limit});
		var result = this._find(request, offset, limit);
		this.emit('storeFound', {'request': request, 'store': this, 'offset': offset, 'limit': limit, 'results': result});
		return result;
	}

	_find(request, offset, limit) {
		throw "AbstractStore has no _query";	
	}

	// ADD THE EXECUTOR PART

	checkAuthentication(object) {
		if (this.params.expose.restrict.authentication) {
			var field = "user";
			if (typeof(this.params.expose.restrict.authentication) == "string") {
				field = this.params.expose.restrict.authentication;
			}
			if (this.session.currentuser == undefined || this.session.currentuser.uuid != object[field]) {
				throw 403;
			}
		}
		return true;
	}

	execute(executor) {
		var store = this;
		if (store == undefined) {
			console.log("Unkown store: " + this.callable.store);
			this.writeHead(500);
			this.end();
			return;
		}
		if (this._http.method == "GET") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.get) {
				throw 404;
			}
			if (this.params.uuid) {
				var object = store.get(this.params.uuid);
	                        if (object === undefined) {
	                            throw 404;
	                        }
				if (!this.checkAuthentication(object)) {
					return;
				}
				this.writeHead(200, {'Content-type': 'application/json'});
				var result = {};
				for (var prop in object) {
					// Server private property
					if (prop[0] == "_") {
						continue
					}
					result[prop] = object[prop]
				}
	            this.write(JSON.stringify(result));
				this.end();
				return;
			} else {
				// List probably
			}
		} else if (this._http.method == "DELETE") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.delete) {
				throw 404;
			}
			var object = store.get(this.params.uuid);
			if (object === undefined) {
				throw 404;
			}
			if (!this.checkAuthentication(object)) {
				return;
			}
			if (this.params.uuid) {
				store.delete(this.params.uuid);
				throw 204;
			}
		} else if (this._http.method == "POST") {
			var object = this.body;
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.create) {
				throw 404;
			}
			if (this.callable.expose.restrict.authentication) {
				if (this.session.currentuser == undefined) {
					throw 401;
				}
				object.user = this.session.currentuser.uuid;
			}
			if (!object.uuid) {
				object.uuid = uuid.v4();
			}
			if (store.exists(object.uuid)) {
				throw 409;
			}
			for (var prop in object) {
				if (prop[0] == "_") {
					delete object[prop]
				}
			}
			var new_object = store.save(object, object.uuid);
			this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(new_object));
			this.end();
			return;
		} else if (this._http.method == "PUT") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.update) {
				throw 404;
			}
			if (!store.exists(this.params.uuid)) {
				throw 404;
			}
			if (this.callable.expose.restrict.authentication) {
				var currentObject = store.get(this.params.uuid);
				if (!this.checkAuthentication(currentObject)) {
					return;
				}
			}
			for (var prop in this.body) {
				if (prop[0] == "_") {
					delete this.body[prop]
				}
			}
			var object = store.update(this.body, this.params.uuid);
			if (object == undefined) {
				throw 500;
			}
			this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(object));
			this.end();
			return;
		}
		throw 404;
	}
}

module.exports = Store