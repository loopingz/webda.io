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
		return new Promise( function(resolve, reject) {
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
			resolve(this._save(object, uid));
		}.bind(this)).then( function(object) {
			this.emit('storeSaved', {'object': object, 'store': this});
			if (this._params.map != undefined) {
				//console.log('storesaved...');
				//return this.get(object.user);
				return this.handleMap(object, this._params.map, "created").then( function() {
					return Promise.resolve(object);
				}, function (err) {
					return Promise.reject(err)
				});
			} else {
				return Promise.resolve(object);
			}
		}.bind(this));
	}

	_save(object, uid) {
		throw "AbstractStore has no _save";
	}

	update(object, uid, reverseMap) {
		return new Promise( function(resolve, reject) {
			if (uid == undefined) {
				uid = object.uuid;
			}
			if (reverseMap === undefined) {
				reverseMap = true;
			}
			// Dont allow to update collections from map
			if (this._reverseMap != undefined && reverseMap) {
				for (var i in this._reverseMap) {
					if (object[this._reverseMap[i]] != undefined) {
						delete object[this._reverseMap[i]];
					}
				}
			}
			if (Object.keys(object).length === 0) {
				resolve({});
			}
			if (this._params.map != undefined) {
				resolve(this._get(uid).then(function(loaded) {
					return this.handleMap(loaded, this._params.map, object);
				}.bind(this)).then(function() {
					this.emit('storeUpdate', {'object': object, 'store': this});
					return this._update(object, uid);
				}.bind(this)));
			} else {
				this.emit('storeUpdate', {'object': object, 'store': this});
				resolve(this._update(object, uid));
			}
		}.bind(this)).then (function (result) {
			this.emit('storeUpdated', {'object': result, 'store': this});
			return Promise.resolve(result);
		}.bind(this));
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

	_handleUpdatedMap(object, map, mapped, store, updates) {
		// Update only if the key field has been updated
		var found = false;
		for (var field in updates) {
			if (map.fields) {
				var fields = map.fields.split(",");
				for (var mapperfield in fields) {
					if (fields[mapperfield] == field) {
						found = true;
						break;
					}
				}
			}
			// TODO Need to verify also if fields are updated
			if (field == map.key) {
				found = true;
				break;
			}
		}
		if (!found) {
			// None of the mapped keys has been modified -> return
			return Promise.resolve();
		}

		// check if reference object has changed
		if (updates[map.key] != undefined && mapped.uuid != updates[map.key]) {
			// Transfering
			if (this.removeMapper(mapped[map.target], object.uuid)) {
				return this._handleUpdatedMapTransferOut(object, map, mapped, store, updates);
			} else {
				return this._handleUpdatedMapTransferIn(object, map, store, updates);
			}
		} else {
			this.removeMapper(mapped[map.target], object.uuid);
			return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
		}
	}

	_handleUpdatedMapTransferOut(object, map, mapped, store, updates) {
		var update = {};
		update[map.target] = mapped[map.target];
		return store.update(update, mapped.uuid, false).then( function() {
			return this._handleUpdatedMapTransferIn(object, map, store, updates);
		}.bind(this));
	}

	_handleUpdatedMapTransferIn(object, map, store, updates) {
		// TODO Should be update
		return store.get(updates[map.key]).then(function(mapped) {
			if (mapped == undefined) {
				return Promise.resolve();
			}
			// Enforce the collection if needed
			if (mapped[map.target] == undefined) {
				mapped[map.target]=[];
			}
			return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
		}.bind(this));
	}

	_handleUpdatedMapMapper(object, map, mapped, store, updates) {
		// Update the mapper
		var to_update = {};
		var mapper = {};
		mapper.uuid = object.uuid;
		if (map.fields) {
			var fields = map.fields.split(",");
			for (var field in fields) {
				if (updates[fields[field]] != undefined) {
					mapper[fields[field]] = updates[fields[field]];
				} else {
					mapper[fields[field]] = object[fields[field]];
				}
			}
		}
		to_update[map.target]=mapped[map.target];
		to_update[map.target].push(mapper);
		// Remove old reference
		return store.update(to_update, mapped.uuid, false);
	}

	_handleDeletedMap(object, map, mapped, store) {
		// Remove from the collection
		if (mapped[map.target] == undefined) {
			return Promise.resolve();
		}
		if (this.removeMapper(mapped[map.target], object.uuid)) {
			// TODO Should be update
			var update = {};
			update[map.target] = mapped[map.target];
			return store.update(update, mapped.uuid, false);
		}
		return Promise.resolve();
	}

	_handleCreatedMap(object, map, mapped, store) {
		var update = {};
		update[map.target] = mapped[map.target];
		// Add to the object
		var mapper = {};
		mapper.uuid = object.uuid;
		// Add info to the mapped
		if (map.fields) {
			var fields = map.fields.split(",");
			for (var field in fields) {
				mapper[fields[field]] = object[fields[field]];
			}
		}
		// Can happen with self defined uuid like ident
		update[map.target].push(mapper);
		return store.update(update, mapped.uuid, false);
	}

	handleMap(object, map, updates) {
		var promises = [];
		if (object === undefined) {
			return Promise.resolve();
		}
		for (var prop in map) {
			// No mapped property or not in the object
			if (map[prop].key === undefined || object[map[prop].key] === undefined) {
				continue;
			}
			var store = this.getService(prop);
			// Cant find the store for this collection
			if (store == undefined) {
				continue;
			}
			promises.push(store.get(object[map[prop].key]).then( function(mapped) {
				if (mapped == undefined) {
					return Promise.resolve();
				}
				// Enforce the collection if needed
				if (mapped[map[prop].target] == undefined) {
					mapped[map[prop].target]=[];
				}
				if (updates === "created") {
					return this._handleCreatedMap(object, map[prop], mapped, store);
				} else if (updates == "deleted") {
					return this._handleDeletedMap(object, map[prop], mapped, store);
				} else if (typeof(updates) == "object") {
					return this._handleUpdatedMap(object, map[prop], mapped, store, updates);
				} else {
					return Promise.reject(Error("Unknown handleMap type " + updates));
				}
			}.bind(this)));
		}
		if (promises.length == 1) {
			return promises[0];
		} else if (promises.length > 1) {
			return Promise.all(promises)
		} else {
			return Promise.resolve();
		}
	}

	_update(object, uid) {
		throw "AbstractStore has no _update"
	}

	cascadeDelete(obj) {
		return this.delete(obj);
	}

	delete(uid, no_map) {
		var to_delete;
		return new Promise( function(resolve, reject) {
			if (typeof(uid) === 'object') {
				to_delete = uid;
				uid = to_delete.uuid;
				resolve(to_delete);
			} else {
				resolve(this._get(uid));
			}	
		}.bind(this)).then(function (obj) {
			to_delete = obj;
			this.emit('storeDelete', {'object': obj, 'store': this});
			if (this._params.map != undefined) {
				return this.handleMap(obj, this._params.map, "deleted");
			} else {
				return Promise.resolve();
			}
		}.bind(this)).then(function () {
			if (this._cascade != undefined && to_delete !== undefined) {
				var promises = [];
				// Should deactiate the mapping in that case
				for (var i in this._cascade) {
					if (typeof(this._cascade[i]) != "object" || to_delete[this._cascade[i].name] == undefined) continue;
					var targetStore = this.getService(this._cascade[i].store);
					if (targetStore == undefined) continue;
					for (var item in to_delete[this._cascade[i].name]) {
						promises.push(targetStore.cascadeDelete(to_delete[this._cascade[i].name][item], uid));
					}
				}
				return Promise.all(promises);
			} else {
				Promise.resolve();
			}
		}.bind(this)).then(function () {
			return this._delete(uid);
		}.bind(this)).then (function () {
			this.emit('storeDeleted', {'object': to_delete, 'store': this});
			return Promise.resolve();
		}.bind(this));
	}

	_delete(uid) {
		throw "AbstractStore has no _delete";
	}

	get(uid) {
		return this._get(uid).then ( function (object) {
			this.emit('storeGet', {'object': object, 'store': this});
			return Promise.resolve(object);
		}.bind(this));
	}

	_get(uid) {
		throw "AbstractStore has no _get";
	}

	find(request, offset, limit) {
		return new Promise( function(resolve, reject) {
			this.emit('storeFind', {'request': request, 'store': this, 'offset': offset, 'limit': limit});
			resolve(this._find(request, offset, limit));
		}.bind(this)).then (function (result) {
			this.emit('storeFound', {'request': request, 'store': this, 'offset': offset, 'limit': limit, 'results': result});
			return Promise.resolve(result);
		});
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
						continue;
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