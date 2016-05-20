"use strict";

var stores = {};
var uuid = require('node-uuid');
const Executor = require("../services/executor");
const _extend = require("util")._extend;

/**
 * This class handle NoSQL storage and mapping (duplication) between NoSQL object
 * TODO Create the mapping documentation
 *
 * It use basic CRUD, and can expose those 4 to through HTTP
 *
 * It emits events :
 *   Store.Save: Before saving the object
 *   Store.Saved: After saving the object
 *   Store.Update: Before updating the object
 *   Store.Updated: After updating the object
 *   Store.Delete: Before deleting the object
 *   Store.Deleted: After deleting the object
 *   Store.Get: When getting the object
 *
 * Mapping:
 *
 *
 * Parameters
 *
 *  map: { ... } 
 *  expose: { // Enable the HTTP exposure
 *      url: '', // The url to expose to by default it is service name in lowercase ( users for example )
 *      restrict: {
 *	       create: true, // Don't expose the POST /users
 *         update: true, // Don't expose the PUT /users/{uuid}
 *         delete: true, // Don't expose the DELETE /users/{uuid}
 *         get: true // Don't expose the GET /users/{uuid}
 *      }	 
 *   }
 */
class Store extends Executor {
	/** @ignore */
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
		let policy = this._params.policy;
		if (!policy) {
			policy = "OwnerPolicy";
		}
		this._policy = this._webda.getService(policy);
		if (!this._policy) {
			console.log("Bad security policy " + policy);
			this._policy = this._webda.getService("OwnerPolicy");
		}
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
		if (!expose.restrict.create) {
			config[expose.url] = {"method": ["POST"], "executor": this._name, "expose": expose, "_method": this.httpCreate};
		}
		// Dont even create the route that are restricted so we can ease up the test on handler
		let methods = [];
		if (!expose.restrict.update) {
			methods.push("PUT");
		}
		if (!expose.restrict.get) {
			methods.push("GET");
		}
		if (!expose.restrict.delete) {
			methods.push("DELETE");
		}
		if (methods.length) {
			config[expose.url+"/{uuid}"] = {"method": methods, "executor": this._name, "expose": expose, "_method": this.httpRoute};
		}
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
				map[prop]["-onerror"] = "NoStore";
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

	generateUid() {
		return uuid.v4();
	}

	/**
	 * Save an object
	 *
	 * @param {Object} Object to save
	 * @param {String} Uuid to use, if not specified take the object.uuid or generate one if not found
	 * @return {Promise} with saved object
	 */
	save(object, uid) {
		/** @ignore */
		return new Promise( (resolve, reject) => {
			if (uid == undefined) {
				uid = object.uuid;
			}
			if (uid == undefined) {
				uid = this.generateUid();
			}
			if (object.uuid == undefined || object.uuid != uid) {
				object.uuid = uid;
			}
			if (this._params.lastUpdate === undefined || this._params.lastUpdate) {
				object.lastUpdate = new Date();
			}
			this.emit('Store.Save', {'object': object, 'store': this});
			resolve(this._save(object, uid));
		}).then( (object) => {
			this.emit('Store.Saved', {'object': object, 'store': this});
			if (this._params.map != undefined) {
				return this.handleMap(object, this._params.map, "created").then( () => {
					return Promise.resolve(object);
				}, function (err) {
					return Promise.reject(err)
				});
			} else {
				return Promise.resolve(object);
			}
		});
	}

	_save(object, uid) {
		throw "AbstractStore has no _save";
	}

	/**
	 * Update an object
	 *
	 * @param {Object} Object to save
	 * @param {String} Uuid to use, if not specified take the object.uuid or generate one if not found
	 * @param {Boolean} reverseMap internal use only, for disable map resolution
	 * @return {Promise} with saved object
	 */
	update(object, uid, reverseMap) {
		/** @ignore */
		return new Promise( (resolve, reject) => {
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
				resolve(this._get(uid).then((loaded) => {
					return this.handleMap(loaded, this._params.map, object);
				}).then(() => {
					this.emit('Store.Update', {'object': object, 'store': this});
					if (this._params.lastUpdate === undefined || this._params.lastUpdate) {
						object.lastUpdate = new Date();
					}
					return this._update(object, uid);
				}));
			} else {
				this.emit('Store.Update', {'object': object, 'store': this});
				resolve(this._update(object, uid));
			}
		}).then ( (result) => {
			this.emit('Store.Updated', {'object': result, 'store': this});
			return Promise.resolve(result);
		});
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
		return store.update(update, mapped.uuid, false).then( () => {
			return this._handleUpdatedMapTransferIn(object, map, store, updates);
		});
	}

	_handleUpdatedMapTransferIn(object, map, store, updates) {
		// TODO Should be update
		return store.get(updates[map.key]).then((mapped) => {
			if (mapped == undefined) {
				return Promise.resolve();
			}
			// Enforce the collection if needed
			if (mapped[map.target] == undefined) {
				mapped[map.target]=[];
			}
			return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
		});
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
			promises.push(store.get(object[map[prop].key]).then( (mapped) => {
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
			}));
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

	/**
	 * Delete an object
	 *
	 * @param {String} uuid to delete
	 * @return {Promise} the deletion promise
	 */
	delete(uid) {
		/** @ignore */
		var to_delete;
		return new Promise( (resolve, reject) => {
			if (typeof(uid) === 'object') {
				to_delete = uid;
				uid = to_delete.uuid;
				resolve(to_delete);
			} else {
				resolve(this._get(uid));
			}	
		}).then( (obj) => {
			if (obj === undefined) {
				throw 404;
			}
			to_delete = obj;
			this.emit('Store.Delete', {'object': obj, 'store': this});
			if (this._params.map != undefined) {
				return this.handleMap(obj, this._params.map, "deleted");
			} else {
				return Promise.resolve();
			}
		}).then( () => {
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
		}).then( () => {
			return this._delete(uid);
		}).then ( () => {
			this.emit('Store.Deleted', {'object': to_delete, 'store': this});
			return Promise.resolve(true);
		});
	}

	/**
	 * Check if an object exists
	 * @abstract
	 * @params {String} uuid of the object
	 */
	exists(uid) {
		/** @ignore */
	}

	_delete(uid) {
		throw "AbstractStore has no _delete";
	}

	/**
	 * Get an object
	 *
	 * @param {String} uuid to delete
	 * @return {Promise} the object retrieved ( can be undefined if not found )
	 */
	get(uid) {
		/** @ignore */
		return this._get(uid).then ( (object) => {
			this.emit('Store.Get', {'object': object, 'store': this});
			return Promise.resolve(object);
		});
	}

	_get(uid) {
		throw "AbstractStore has no _get";
	}

	find(request, offset, limit) {
		return new Promise( (resolve, reject) => {
			this.emit('Store.Find', {'request': request, 'store': this, 'offset': offset, 'limit': limit});
			return resolve(this._find(request, offset, limit));
		}).then ( (result) => {
			this.emit('Store.Found', {'request': request, 'store': this, 'offset': offset, 'limit': limit, 'results': result});
			return Promise.resolve(result);
		});
	}

	_find(request, offset, limit) {
		throw "AbstractStore has no _query";	
	}

	// ADD THE EXECUTOR PART

	httpCreate(ctx) {
		var object = ctx.body;
		// Policy
		this._policy.canCreate(ctx, object);

		if (!object.uuid) {
			object.uuid = this.generateUid();
		}
		for (var prop in object) {
			if (prop[0] == "_") {
				delete object[prop]
			}
		}
		if (this._params.validator) {
			if (!this._webda.validate(object, this._params.validator)) {
				throw 400;
			}
		}
		return this.exists(object.uuid).then( (exists) => {
			if (exists) {
				throw 409;
			}
			return this.save(object, object.uuid);	
		}).then ( (new_object) => {
			ctx.write(new_object);
		});
	}

	httpUpdate(ctx) {
		for (var prop in ctx.body) {
			if (prop[0] == "_") {
				delete ctx.body[prop]
			}
		}
		ctx.body.uuid = ctx._params.uuid;
		return this.get(ctx._params.uuid).then ( (object) => {
			if (!object) throw 404;
			this._policy.canUpdate(ctx, object, ctx.body);

			if (this._params.validator) {
				if (!this._webda.validate(_extend(object, ctx.body), this._params.validator)) {
					throw 400;
				}
			}
			return this.update(ctx.body, ctx._params.uuid);
		}).then ( (object) => {
			if (object == undefined) {
				throw 500;
			}
			ctx.write(object);
		});
	}

	httpGet(ctx) {
		if (ctx._params.uuid) {
			return this.get(ctx._params.uuid).then( (object) => {
                if (object === undefined) {
					throw 404;
				}
				this._policy.canGet(ctx, object);
	            ctx.write(object);
			});
		} else {
			// List probably
		}
	}

	httpRoute(ctx) {
		if (ctx._route._http.method == "GET") {
			return this.httpGet(ctx);
		} else if (ctx._route._http.method == "DELETE") {
			return this.get(ctx._params.uuid).then ( (object) => {
				if (!object) throw 404;
				this._policy.canDelete(ctx, object);	
				return this.delete(ctx._params.uuid);
			});
		} else if (ctx._route._http.method == "PUT") {
			return this.httpUpdate(ctx);
		}
	}

}

module.exports = Store