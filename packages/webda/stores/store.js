"use strict";

var stores = {};
const uuid = require('uuid');
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
 *   Store.Action: When an action will be done on an object
 *   Store.Actioned: When an action has been done on an object
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
  constructor(webda, name, options) {
    super(webda, name, options);
    this._name = name;
    this._reverseMap = [];
    this._cascade = [];
    this._writeConditionField = "lastUpdate";
  }

  init(config) {
    this.initMap(this._params.map);
    let model = this._params.model;
    if (!model) {
      model = "Webda/CoreModel";
    }
    this._model = this._webda.getModel(model);
    if (!this._model) {
      this._webda.log('WARN', 'Bad model', model,'fallback to CoreModel');
      this._model = this._webda.getModel("Webda/CoreModel");
    }
    if (this._params.expose) {
      this.initRoutes(config, this._params.expose);
    }
  }

  initRoutes(config, expose) {
    if (typeof(expose) == "boolean") {
      expose = {};
      expose.url = "/" + this._name.toLowerCase();
    } else if (typeof(expose) == "string") {
      expose = {url: expose};
    } else if (typeof(expose) == "object" && expose.url == undefined) {
      expose.url = "/" + this._name.toLowerCase();
    }
    expose.restrict = expose.restrict || {}
    if (!expose.restrict.create) {
      this._addRoute(expose.url, {"method": ["POST"], "executor": this._name, "expose": expose, "_method": this.httpCreate});
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
      this._addRoute(expose.url + "/{uuid}", {"method": methods, "executor": this._name, "expose": expose, "_method": this.httpRoute});
    }
    if (this._model && this._model.getActions) {
    	let actions = this._model.getActions();
    	Object.keys(actions).forEach( (name) => {
        let action = actions[name];
        action.name = name;
        if (!action.name) {
          throw Error('Action needs a name got:', action);
        }
    		if (!action.method) {
    			action.method = ['PUT'];
    		}
    		action.executor = this._name;
        if (action.global) {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model['_' + action.name]) {
              throw Error('Action static method _' + action.name + ' does not exist');
            }
            action._method = this.httpAction;
          }
          this._addRoute(expose.url + '/' + action.name, action);
        } else {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model.prototype['_' + action.name]) {
              throw Error('Action method _' + action.name + ' does not exist');
            }
            action._method = this.httpAction;
          }
          this._addRoute(expose.url + '/{uuid}/' + action.name, action);
        }
    	});
    }
  }

  initModel(object) {
    // Make sure to send a model object
    if (!(object instanceof this._model)) {
      object = new this._model(object, true);
    }
    object.__store = this;
    for (var i in this._reverseMap) {
      for (var j in object[this._reverseMap[i].property]) {
        object[this._reverseMap[i].property][j] = this._reverseMap[i].store.initModel(object[this._reverseMap[i].property][j]);

      }
    }
    return object;
  }

  addReverseMap(prop, cascade, store) {
    this._reverseMap.push({'property': prop, 'store': store});
    if (cascade) {
      this._cascade.push(cascade);
    }
  }

  _incrementAttribute(uid, prop, value) {
    throw "AbstractStore has no _incrementAttribute";
  }

  incrementAttribute(uid, prop, value) {
    // If value === 0 no need to update anything
    if (value === 0) {
      return Promise.resolve();
    }
    return this._incrementAttribute(uid, prop, value).then( () => {
      return this.emit('Store.PartialUpdate', {'object_id': uid, 'store': this,
        'partial_update': {'increment': {'value': value, 'property': prop}}});
    });
  }

  upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = 'uuid';
    }
    return this._upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField).then( () => {
      return this.emit('Store.PartialUpdate', {'object_id': uid, 'store': this,
          'partial_update': {'addItem': {'value': item, 'property': prop, 'index': index}}});
    });
  }

  _upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField) {
    throw "AbstractStore has no upsertItemToCollection"
  }

  deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    if (index === undefined || prop === undefined) {
      throw Error("Invalid Argument");
    }
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = 'uuid';
    }
    return this._deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField).then( () => {
      return this.emit('Store.PartialUpdate', {'object_id': uid, 'store': this,
          'partial_update': {'deleteItem': {'value': index, 'property': prop, 'index': index}}});
    });
  }

  _deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    throw "AbstractStore has no deleteItemFromCollection"
  }

  initMap(map) {
    if (map == undefined || map._init) {
      return;
    }
    for (var prop in map) {
      var reverseStore = this._webda.getService(prop);
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        map[prop]["-onerror"] = "NoStore";
        this._webda.log('WARN', 'Can\'t setup mapping as store "', prop,'" doesn\'t exist');
        continue;
      }
      var cascade = undefined;
      if (map[prop].cascade) {
        cascade = {'store': this._name, 'name': map[prop].target};
      }
      reverseStore.addReverseMap(map[prop].target, cascade, this);
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
    if (uid === undefined) {
      uid = object.uuid;
    }
    if (uid === undefined) {
      uid = this.generateUid();
    }
    if (object.uuid === undefined || object.uuid !== uid) {
      object.uuid = uid;
    }
    for (var i in this._reverseMap) {
      if (object[this._reverseMap[i].property] === undefined) {
        object[this._reverseMap[i].property] = [];
      }
    }
    object.lastUpdate = new Date();
    object = this.initModel(object);
    return this.emit('Store.Save', {'object': object, 'store': this}).then(() => {
      // Handle object auto listener
      if (typeof(object._onSave) === 'function') {
        return object._onSave();
      }
      return Promise.resolve();
    }).then(() => {
      return this._save(object, uid);
    }).then((res) => {
      object = this.initModel(res);
      return this.emit('Store.Saved', {'object': object, 'store': this});
    }).then(() => {
      if (typeof(object._onSaved) === 'function') {
        return object._onSaved();
      }
      return Promise.resolve();
    }).then(() => {
      if (this._params.map != undefined) {
        return this.handleMap(object, this._params.map, "created").then(() => {
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
    var saved;
    return new Promise((resolve, reject) => {
      var loaded;
      if (uid == undefined) {
        uid = object.uuid;
      }
      if (reverseMap === undefined) {
        reverseMap = true;
      }
      // Dont allow to update collections from map
      if (this._reverseMap != undefined && reverseMap) {
        for (var i in this._reverseMap) {
          if (object[this._reverseMap[i].property] != undefined) {
            delete object[this._reverseMap[i].property];
          }
        }
      }
      if (Object.keys(object).length === 0) {
        resolve({});
      }
      let writeCondition;
      if (this._params.lastUpdate) {
        writeCondition = lastUpdate;
      }
      object.lastUpdate = new Date();
      resolve(this._get(uid).then((load) => {
        loaded = this.initModel(load);
        return this.handleMap(loaded, this._params.map, object);
      }).then(() => {
        return this.emit('Store.Update', {'object': loaded, 'store': this, 'update': object});
      }).then(() => {
        if (typeof(loaded._onUpdate) === 'function') {
          return loaded._onUpdate(object);
        }
        return Promise.resolve();
      }).then(() => {
        return this._update(object, uid, writeCondition).then((res) => {
          // Return updated
          for (let i in res) {
            loaded[i] = res[i];
          }
          for (let i in object) {
            loaded[i] = object[i];
          }
          return Promise.resolve(loaded);
        });
      }));
    }).then((result) => {
      saved = this.initModel(result);
      return this.emit('Store.Updated', {'object': result, 'store': this});
    }).then(() => {
      if (typeof(saved._onUpdated) === 'function') {
        return saved._onUpdated();
      }
      return Promise.resolve();
    }).then(() => {
      return Promise.resolve(saved);
    });
  }

  getMapper(map, uuid) {
    for (var i = 0; i < map.length; i++) {
      if (map[i]['uuid'] == uuid) {
        return i;
      }
    }
    return -1;
  }

  removeMapper(map, uuid) {
    let i = this.getMapper(map, uuid);
    if (i >= 0) {
      map.splice(i, 1);
      return true;
    }
    return false;
  }

  _handleUpdatedMap(object, map, mapped, store, updates) {
    var mapper = {'uuid': object.uuid};
    // Update only if the key field has been updated
    var found = false;
    for (var field in updates) {
      if (map.fields) {
        let fields = map.fields.split(",");
        for (let i in fields) {
          let mapperfield = fields[i];
          // Create the mapper object
          if (updates[mapperfield] !== undefined) {
            mapper[mapperfield] = updates[mapperfield];
            found = true;
          } else if (object[mapperfield] !== undefined) {
            mapper[mapperfield] = object[mapperfield];
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
      // create mapper
      if (map.fields) {
        let fields = map.fields.split(",");
        for (var j in fields) {
          let mapperfield = fields[j];
          // Create the mapper object
          if (updates[mapperfield] !== undefined) {
            mapper[mapperfield] = updates[mapperfield];
          } else if (object[mapperfield] !== undefined) {
            mapper[mapperfield] = object[mapperfield];
          }
        }
      }
      let i = this.getMapper(mapped[map.target], object.uuid);
      let promise = Promise.resolve();
      if (i >= 0) {
        // Remove the data from old object
        promise.then(() => {
          return store.deleteItemFromCollection(mapped.uuid, map.target, i, object.uuid, 'uuid');
        });
      }
      return promise.then(() => {
        // Add the data to new object
        return store.upsertItemToCollection(updates[map.key], map.target, mapper);
      });
    } else {
      return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
    }
  }

  _handleUpdatedMapTransferOut(object, map, mapped, store, updates) {
    var update = {};
    update[map.target] = mapped[map.target];
    return store.update(update, mapped.uuid, false).then(() => {
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
        mapped[map.target] = [];
      }
      return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
    });
  }

  _handleUpdatedMapMapper(object, map, mapped, store, updates) {
    // Update the mapper
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
    // Remove old reference
    let i = this.getMapper(mapped[map.target], object.uuid);
    // If not found just add it to the collection
    if (i < 0) {
      return store.upsertItemToCollection(mapped.uuid, map.target, mapper);
    }
    // Else update with a check on the uuid
    return store.upsertItemToCollection(mapped.uuid, map.target, mapper, i, object.uuid, 'uuid');
  }

  _handleDeletedMap(object, map, mapped, store) {
    // Remove from the collection
    if (mapped[map.target] === undefined) {
      return Promise.resolve();
    }
    let i = this.getMapper(mapped[map.target], object.uuid);
    if (i >= 0) {
      return store.deleteItemFromCollection(mapped.uuid, map.target, i, object.uuid, 'uuid');
    }
    return Promise.resolve();
  }

  _handleCreatedMap(object, map, mapped, store) {
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
    return store.upsertItemToCollection(mapped.uuid, map.target, mapper);
  }

  _handleMapProperty(store, object, property, updates) {
    return store.get(object[property.key]).then((mapped) => {
      if (mapped == undefined) {
        return Promise.resolve();
      }
      if (updates === "created") {
        return this._handleCreatedMap(object, property, mapped, store);
      } else if (updates == "deleted") {
        return this._handleDeletedMap(object, property, mapped, store);
      } else if (typeof(updates) == "object") {
        return this._handleUpdatedMap(object, property, mapped, store, updates);
      } else {
        return Promise.reject(Error("Unknown handleMap type " + updates));
      }
    })
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
      promises.push(this._handleMapProperty(store, object, map[prop], updates));
    }
    if (promises.length == 1) {
      return promises[0];
    } else if (promises.length > 1) {
      return Promise.all(promises)
    } else {
      return Promise.resolve();
    }
  }

  _update(object, uid, writeCondition) {
    throw "AbstractStore has no _update"
  }

  cascadeDelete(obj) {
    return this.delete(obj);
  }

  /**
   * Delete an object
   *
   * @param {String} uuid to delete
   * @param {Boolean} delete sync even if asyncDelete is active
   * @return {Promise} the deletion promise
   */
  delete(uid, sync) {
    /** @ignore */
    var to_delete;
    var saved;
    return new Promise((resolve, reject) => {
      if (typeof(uid) === 'object') {
        to_delete = uid;
        uid = to_delete.uuid;
        if (uid instanceof this._model) {
          resolve(to_delete);
          return;
        }
      }
      resolve(this._get(uid));
    }).then((obj) => {
      if (obj === undefined) {
        throw 404;
      }
      to_delete = this.initModel(obj);
      saved = obj;
      return this.emit('Store.Delete', {'object': obj, 'store': this});
    }).then(() => {
      if (typeof(to_delete._onDelete) === 'function') {
        return to_delete._onDelete();
      }
      return Promise.resolve();
    }).then(() => {
      if (this._params.map != undefined) {
        return this.handleMap(saved, this._params.map, "deleted");
      } else {
        return Promise.resolve();
      }
    }).then(() => {
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
        return Promise.resolve();
      }
    }).then(() => {
      if (this._params.asyncDelete && !sync) {
        return this._update({'__deleted': true}, uid);
      }
      return this._delete(uid);
    }).then(() => {
      return this.emit('Store.Deleted', {'object': to_delete, 'store': this});
    }).then(() => {
      if (typeof(to_delete._onDeleted) === 'function') {
        return to_delete._onDeleted();
      }
      return Promise.resolve();
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

  _delete(uid, writeCondition) {
    throw "AbstractStore has no _delete";
  }

  /**
   * Get an object
   *
   * @param {Array} uuid to gets if undefined then retrieve the all table
   * @return {Promise} the objects retrieved ( can be [] if not found )
   */
  getAll(list) {
    throw "AbstractStore has no getAll";
  }

  /**
   * Get an object
   *
   * @param {String} uuid to get
   * @return {Promise} the object retrieved ( can be undefined if not found )
   */
  get(uid) {
    /** @ignore */
    return this._get(uid).then((object) => {
      if (!object) {
        return Promise.resolve(undefined);
      }
      object = this.initModel(object);
      return this.emit('Store.Get', {'object': object, 'store': this}).then(() => {
        if (typeof(object._onGet) === 'function') {
          return object._onGet();
        }
        return Promise.resolve();
      }).then(() => {
        return Promise.resolve(object);
      });
    });
  }

  _get(uid) {
    throw "AbstractStore has no _get";
  }

  find(request, offset, limit) {
    return this.emit('Store.Find', {'request': request, 'store': this, 'offset': offset, 'limit': limit}).then(() => {
      return this._find(request, offset, limit);
    }).then((result) => {
      return this.emit('Store.Found', {'request': request, 'store': this, 'offset': offset, 'limit': limit, 'results': result}).then(() => {
        return Promise.resolve(result);
      });
    });
  }

  _find(request, offset, limit) {
    throw "AbstractStore has no _query";
  }

  // ADD THE EXECUTOR PART

  httpCreate(ctx) {
    var object = new this._model(ctx.body);
    return object.canCreate(ctx).then((object) => {
      return object.validate(ctx).catch((err) => {
        throw 400;
      });
    }).then(() => {
      return this.exists(object.uuid);
    }).then((exists) => {
      if (exists) {
        throw 409;
      }
      return this.save(object, object.uuid);
    }).then((new_object) => {
      ctx.write(new_object);
      return this.emit('Store.WebCreate', {'values': ctx.body, 'object': new_object, 'store': this});
    });
  }

  httpAction(ctx) {
    let action = ctx._route.name;
    if (ctx._params.uuid) {
      let object;
      return this.get(ctx._params.uuid).then((res) => {
        object = res;
        if (object === undefined || object.__deleted) {
          throw 404;
        }
        return object.canAct(ctx, action);
      }).then(() => {
        return this.emit('Store.Action', {'action': action, 'object': object,
          'store': this, 'body': ctx.body, 'params': ctx._params});
      }).then(() => {
        return object['_' + action](ctx);
      }).then((res) => {
        if (res) {
          ctx.write(res);
        }
        return this.emit('Store.Actioned', {'object': object, 'store': this});
      });
    } else if (ctx._route.global) {
      return this.emit('Store.Action', {'action': action, 'store': this,
                          'body': ctx.body, 'params': ctx._params}).then( () => {
        return this._model['_' + ctx._route.name](ctx);
      }).then( (res) => {
        if (res) {
          ctx.write(res);
        }
        return this.emit('Store.Actioned', {'action': action, 'store': this, 'body': ctx.body, 'params': ctx._params});
      });
    }
  }

  httpUpdate(ctx) {
    ctx.body.uuid = ctx._params.uuid;
    return this.get(ctx._params.uuid).then((object) => {
      if (!object || object.__deleted) throw 404;
      return object.canAct(ctx, 'update');
    }).then((object) => {
      return object.validate(ctx, ctx.body).catch((err) => {
        throw 400;
      });
    }).then(() => {
      return this.update(ctx.body, ctx._params.uuid);
    }).then((object) => {
      if (object == undefined) {
        throw 500;
      }
      ctx.write(object);
      return this.emit('Store.WebUpdate', {'updates': ctx.body, 'object': object, 'store': this});
    });
  }

  httpGet(ctx) {
    if (ctx._params.uuid) {
      return this.get(ctx._params.uuid).then((object) => {
        if (object === undefined || object.__deleted) {
          throw 404;
        }
        return object.canAct(ctx, 'get');
      }).then((object) => {
        ctx.write(object);
        return this.emit('Store.WebGet', {'object': object, 'store': this});
      });
    } else {
      // List probably
    }
  }

  httpRoute(ctx) {
    if (ctx._route._http.method == "GET") {
      return this.httpGet(ctx);
    } else if (ctx._route._http.method == "DELETE") {
      return this.get(ctx._params.uuid).then((object) => {
        if (!object || object.__deleted) throw 404;
        return object.canAct(ctx, 'delete');
      }).then(() => {
        // http://stackoverflow.com/questions/28684209/huge-delay-on-delete-requests-with-204-response-and-no-content-in-objectve-c#
        // IOS don't handle 204 with Content-Length != 0 it seems
        // Have trouble to handle the Content-Length on API Gateway so returning an empty object for now
        ctx.write({});
        return this.delete(ctx._params.uuid);
      }).then( () => {
        return this.emit('Store.WebDelete', {'object_id': ctx._params.uuid, 'store': this});
      });
    } else if (ctx._route._http.method == "PUT") {
      return this.httpUpdate(ctx);
    }
  }

  __clean() {

  }
}

module.exports = Store
