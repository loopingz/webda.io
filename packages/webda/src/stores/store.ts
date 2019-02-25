"use strict";
const uuid = require("uuid");
import {
  Executor,
  ConfigurationProvider,
  CoreModel,
  CoreModelDefinition
} from "../index";

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
class Store<T extends CoreModel> extends Executor
  implements ConfigurationProvider {
  _reverseMap: any[] = [];
  _cascade: any[] = [];
  _writeConditionField: string;
  _model: CoreModelDefinition;
  _exposeUrl: string;

  /** @ignore */
  normalizeParams() {
    this._writeConditionField = "lastUpdate";
    let model = this._params.model;
    if (!model) {
      model = "Webda/CoreModel";
    }
    this._model = this._webda.getModel(model);
  }

  async init(): Promise<void> {
    this.normalizeParams();
    this.initMap(this._params.map);
  }

  initRoutes() {
    this.normalizeParams();
    if (!this._params.expose) {
      return;
    }
    let expose = this._params.expose;
    if (typeof expose == "boolean") {
      expose = {};
      expose.url = "/" + this._name.toLowerCase();
    } else if (typeof expose == "string") {
      expose = {
        url: expose
      };
    } else if (typeof expose == "object" && expose.url == undefined) {
      expose.url = "/" + this._name.toLowerCase();
    }
    expose.restrict = expose.restrict || {};
    if (!expose.restrict.create) {
      this._addRoute(expose.url, ["POST"], this.httpCreate, {
        model: this._model.name,
        post: {
          description: `The way to create a new ${this._model.name} model`,
          summary: "Create a new " + this._model.name,
          model: this._model.name,
          operationId: `create${this._model.name}`,
          responses: {
            "200": {
              model: this._model.name
            },
            "400": "Object is invalid",
            "403": "You don't have permissions",
            "409": "Object already exists"
          }
        }
      });
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
    this._exposeUrl = expose.url;
    if (methods.length) {
      this._addRoute(expose.url + "/{uuid}", methods, this.httpRoute, {
        model: this._model.name,
        get: {
          description: `Retrieve ${
            this._model.name
          } model if permissions allow`,
          summary: "Retrieve a " + this._model.name,
          operationId: `get${this._model.name}`,
          responses: {
            "200": {
              model: this._model.name
            },
            "400": "Object is invalid",
            "403": "You don't have permissions",
            "404": "Unknown object"
          }
        },
        put: {
          description: `Update a new ${
            this._model.name
          } if the permissions allow`,
          summary: "Update a " + this._model.name,
          model: this._model.name,
          operationId: `updatet${this._model.name}`,
          responses: {
            "200": {
              model: this._model.name
            },
            "400": "Object is invalid",
            "403": "You don't have permissions",
            "404": "Unknown object"
          }
        },
        delete: {
          operationId: `delete${this._model.name}`,
          description: `Delete ${this._model.name} if the permissions allow`,
          summary: "Delete a " + this._model.name,
          model: this._model.name,
          responses: {
            "204": "",
            "403": "You don't have permissions",
            "404": "Unknown object"
          }
        }
      });
    }
    if (this._model && this._model.getActions) {
      let actions = this._model.getActions();
      Object.keys(actions).forEach(name => {
        let action: any = actions[name];
        action.name = name;
        if (!action.name) {
          throw Error("Action needs a name got:" + action);
        }
        if (!action.method) {
          action.method = ["PUT"];
        }
        if (action.global) {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model["_" + action.name]) {
              throw Error(
                "Action static method _" + action.name + " does not exist"
              );
            }
            action._method = this.httpGlobalAction;
          }
          this._addRoute(
            expose.url + "/" + action.name,
            action.method,
            action._method,
            action.swagger
          );
        } else {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model.prototype["_" + action.name]) {
              throw Error("Action method _" + action.name + " does not exist");
            }
            action._method = this.httpAction;
          }
          this._addRoute(
            expose.url + "/{uuid}/" + action.name,
            action.method,
            action._method,
            action.swagger
          );
        }
      });
    }
  }

  getUrl(): string {
    return this._exposeUrl;
  }

  initModel(object): T {
    // Make sure to send a model object
    if (!(object instanceof this._model)) {
      object = new this._model(object, true);
    }
    object.__store = this;
    for (var i in this._reverseMap) {
      for (var j in object[this._reverseMap[i].property]) {
        object[this._reverseMap[i].property][j] = this._reverseMap[
          i
        ].store.initModel(object[this._reverseMap[i].property][j]);
      }
    }
    return object;
  }

  addReverseMap(prop, cascade, store) {
    this._reverseMap.push({
      property: prop,
      store: store
    });
    if (cascade) {
      this._cascade.push(cascade);
    }
  }

  isMapped(property: string): boolean {
    if (property === undefined) {
      return false;
    }
    if (!this._params.map) {
      return false;
    }
    let map = this._params.map;
    for (let prop in map) {
      // No mapped property or not in the object
      if (map[prop].key === undefined) {
        continue;
      }
      if (map[prop].fields.split(",").indexOf(property) >= 0) {
        return true;
      }
    }
    return false;
  }

  async _incrementAttribute(uid, prop, value, updateDate: Date): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async incrementAttribute(uid, prop, value) {
    // If value === 0 no need to update anything
    if (value === 0) {
      return Promise.resolve();
    }
    let updateDate = new Date();
    await this._incrementAttribute(uid, prop, value, updateDate);
    await this._handleMapFromPartial(uid, updateDate, prop);
    return this.emitSync("Store.PartialUpdate", {
      object_id: uid,
      store: this,
      partial_update: {
        increment: {
          value: value,
          property: prop
        }
      }
    });
  }

  async upsertItemToCollection(
    uid,
    prop,
    item,
    index,
    itemWriteCondition,
    itemWriteConditionField
  ) {
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = "uuid";
    }
    let updateDate = new Date();
    await this._upsertItemToCollection(
      uid,
      prop,
      item,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
    await this._handleMapFromPartial(uid, updateDate);
    await this.emitSync("Store.PartialUpdate", {
      object_id: uid,
      store: this,
      partial_update: {
        addItem: {
          value: item,
          property: prop,
          index: index
        }
      }
    });
  }

  async _handleMapFromPartial(
    uid: string,
    updateDate: Date,
    prop: string = undefined
  ) {
    if (this.isMapped("lastUpdate") || this.isMapped(prop)) {
      // Not optimal need to reload the object
      let object = await this._get(uid);
      let updates = {
        lastUpdate: updateDate
      };
      if (this.isMapped(prop)) {
        updates[prop] = object.prop;
      }
      await this.handleMap(object, this._params.map, updates);
    }
  }

  async _upsertItemToCollection(
    uid,
    prop,
    item,
    index,
    itemWriteCondition,
    itemWriteConditionField,
    updateDate: Date
  ): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async deleteItemFromCollection(
    uid,
    prop,
    index,
    itemWriteCondition,
    itemWriteConditionField
  ) {
    if (index === undefined || prop === undefined) {
      throw Error("Invalid Argument");
    }
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = "uuid";
    }
    let updateDate = new Date();
    await this._deleteItemFromCollection(
      uid,
      prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
    await this._handleMapFromPartial(uid, updateDate);
    await this.emitSync("Store.PartialUpdate", {
      object_id: uid,
      store: this,
      partial_update: {
        deleteItem: {
          value: index,
          property: prop,
          index: index
        }
      }
    });
  }

  async _deleteItemFromCollection(
    uid,
    prop,
    index,
    itemWriteCondition,
    itemWriteConditionField,
    updateDate: Date
  ): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  initMap(map) {
    if (map == undefined || map._init) {
      return;
    }
    for (var prop in map) {
      var reverseStore: Store<CoreModel> = <Store<CoreModel>>(
        this._webda.getService(prop)
      );
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        map[prop]["-onerror"] = "NoStore";
        this.log(
          "WARN",
          "Can't setup mapping as store \"",
          prop,
          "\" doesn't exist"
        );
        continue;
      }
      var cascade = undefined;
      if (map[prop].cascade) {
        cascade = {
          store: this._name,
          name: map[prop].target
        };
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
  async save(object, uid = object.uuid) {
    /** @ignore */
    if (uid === undefined) {
      uid = this.generateUid();
    }
    if (object.uuid === undefined || object.uuid !== uid) {
      object.uuid = uid;
      object._creationDate = new Date();
    }
    for (var i in this._reverseMap) {
      if (object[this._reverseMap[i].property] === undefined) {
        object[this._reverseMap[i].property] = [];
      }
    }
    object.lastUpdate = new Date();
    object = this.initModel(object);
    await this.emitSync("Store.Save", {
      object: object,
      store: this
    });
    // Handle object auto listener
    await object._onSave();
    let res = await this._save(object, uid);
    object = this.initModel(res);
    await this.emitSync("Store.Saved", {
      object: object,
      store: this
    });
    await object._onSaved();
    if (this._params.map != undefined) {
      await this.handleMap(object, this._params.map, "created");
    }
    return object;
  }

  async _save(object, uid): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  /**
   * Update an object
   *
   * @param {Object} Object to save
   * @param {String} Uuid to use, if not specified take the object.uuid or generate one if not found
   * @param {Boolean} reverseMap internal use only, for disable map resolution
   * @return {Promise} with saved object
   */
  async update(object: any, uid: string = undefined, reverseMap = true) {
    /** @ignore */
    var saved;
    var loaded;
    if (uid == undefined) {
      uid = object.uuid;
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
      return {};
    }
    let writeCondition;
    if (this._params.lastUpdate) {
      writeCondition = "lastUpdate";
    }
    object.lastUpdate = new Date();
    let load = await this._get(uid);
    loaded = this.initModel(load);
    await this.handleMap(loaded, this._params.map, object);
    await this.emitSync("Store.Update", {
      object: loaded,
      store: this,
      update: object
    });
    await loaded._onUpdate(object);
    let res: any = await this._update(object, uid, writeCondition);
    // Return updated
    for (let i in res) {
      loaded[i] = res[i];
    }
    for (let i in object) {
      loaded[i] = object[i];
    }
    saved = this.initModel(loaded);
    await this.emitSync("Store.Updated", {
      object: saved,
      store: this
    });
    await saved._onUpdated();
    return saved;
  }

  getMapper(map, uuid) {
    for (var i = 0; i < map.length; i++) {
      if (map[i]["uuid"] == uuid) {
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
    var mapper = {
      uuid: object.uuid
    };
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
          return store.deleteItemFromCollection(
            mapped.uuid,
            map.target,
            i,
            object.uuid,
            "uuid"
          );
        });
      }
      return promise.then(() => {
        // Add the data to new object
        return store.upsertItemToCollection(
          updates[map.key],
          map.target,
          mapper
        );
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
    return store.get(updates[map.key]).then(mapped => {
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
    var mapper: any = {};
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
    return store.upsertItemToCollection(
      mapped.uuid,
      map.target,
      mapper,
      i,
      object.uuid,
      "uuid"
    );
  }

  _handleDeletedMap(object, map, mapped, store) {
    // Remove from the collection
    if (mapped[map.target] === undefined) {
      return Promise.resolve();
    }
    let i = this.getMapper(mapped[map.target], object.uuid);
    if (i >= 0) {
      return store.deleteItemFromCollection(
        mapped.uuid,
        map.target,
        i,
        object.uuid,
        "uuid"
      );
    }
    return Promise.resolve();
  }

  _handleCreatedMap(object, map, mapped, store) {
    // Add to the object
    var mapper: any = {};
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

  async _handleMapProperty(store, object, property, updates) {
    let mapped = await store.get(object[property.key]);
    if (mapped == undefined) {
      return;
    }
    if (updates === "created") {
      return this._handleCreatedMap(object, property, mapped, store);
    } else if (updates == "deleted") {
      return this._handleDeletedMap(object, property, mapped, store);
    } else if (typeof updates == "object") {
      return this._handleUpdatedMap(object, property, mapped, store, updates);
    } else {
      return Promise.reject(Error("Unknown handleMap type " + updates));
    }
  }

  async handleMap(object, map, updates): Promise<any[]> {
    let promises = [];
    if (object === undefined) {
      return;
    }
    for (let prop in map) {
      // No mapped property or not in the object
      if (map[prop].key === undefined || object[map[prop].key] === undefined) {
        continue;
      }
      let store: Store<CoreModel> = <Store<CoreModel>>this.getService(prop);
      // Cant find the store for this collection
      if (store == undefined) {
        continue;
      }
      promises.push(this._handleMapProperty(store, object, map[prop], updates));
    }
    return Promise.all(promises);
  }

  async _update(object, uid, writeCondition?): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async cascadeDelete(obj: any, uuid: string): Promise<any> {
    // We dont need uuid but Binary store will need it
    return this.delete(obj.uuid);
  }

  /**
   * Delete an object
   *
   * @param {String} uuid to delete
   * @param {Boolean} delete sync even if asyncDelete is active
   * @return {Promise} the deletion promise
   */
  async delete(uid, sync = false) {
    /** @ignore */
    let to_delete: T;
    if (typeof uid === "object") {
      to_delete = uid;
      uid = to_delete.uuid;
      if (!(to_delete instanceof this._model)) {
        to_delete = this.initModel(await this._get(uid));
      }
    } else {
      to_delete = this.initModel(await this._get(uid));
    }
    if (to_delete === undefined) {
      throw 404;
    }
    await this.emitSync("Store.Delete", {
      object: to_delete,
      store: this
    });
    await to_delete._onDelete();
    if (this._params.map != undefined) {
      await this.handleMap(to_delete, this._params.map, "deleted");
    }
    if (this._cascade != undefined && to_delete !== undefined) {
      var promises = [];
      // Should deactiate the mapping in that case
      for (let i in this._cascade) {
        if (
          typeof this._cascade[i] != "object" ||
          to_delete[this._cascade[i].name] == undefined
        )
          continue;
        var targetStore: Store<CoreModel> = this.getTypedService<
          Store<CoreModel>
        >(this._cascade[i].store);
        if (targetStore == undefined) continue;
        for (var item in to_delete[this._cascade[i].name]) {
          promises.push(
            targetStore.cascadeDelete(
              to_delete[this._cascade[i].name][item],
              to_delete.uuid
            )
          );
        }
      }
      await Promise.all(promises);
    }
    if (this._params.asyncDelete && !sync) {
      await this._update(
        {
          __deleted: true
        },
        uid
      );
    } else {
      await this._delete(uid);
    }
    await this.emitSync("Store.Deleted", {
      object: to_delete,
      store: this
    });
    await to_delete._onDeleted();
  }

  /**
   * Check if an object exists
   * @abstract
   * @params {String} uuid of the object
   */
  async exists(uid: string): Promise<boolean> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async _delete(uid: string, writeCondition?): Promise<void> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async _get(uid: string): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  /**
   * Get an object
   *
   * @param {Array} uuid to gets if undefined then retrieve the all table
   * @return {Promise} the objects retrieved ( can be [] if not found )
   */
  async getAll(list = undefined): Promise<T[]> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  /**
   * Provide a way to store configuration in store
   * @param {string} id
   * @returns {Promise<Map<string, any>>}
   */
  async getConfiguration(id: string): Promise<Map<string, any>> {
    let object = await this._get(id);
    if (!object) {
      return undefined;
    }
    let result = new Map<string, any>();
    for (let i in object) {
      if (i === "uuid" || i === "lastUpdate" || i.startsWith("_")) {
        continue;
      }
      result[i] = object[i];
    }
    return result;
  }

  /**
   * Get an object
   *
   * @param {String} uuid to get
   * @return {Promise} the object retrieved ( can be undefined if not found )
   */
  async get(uid: string): Promise<T> {
    /** @ignore */
    if (!uid) {
      return undefined;
    }
    let object = await this._get(uid);
    if (!object) {
      return undefined;
    }
    object = this.initModel(object);
    await this.emitSync("Store.Get", {
      object: object,
      store: this
    });
    await object._onGet();
    return object;
  }

  async find(
    request: any = undefined,
    offset: number = 0,
    limit: number = undefined
  ): Promise<any> {
    await this.emitSync("Store.Find", {
      request: request,
      store: this,
      offset: offset,
      limit: limit
    });
    let result = this._find(request, offset, limit);
    await this.emitSync("Store.Found", {
      request: request,
      store: this,
      offset: offset,
      limit: limit,
      results: result
    });
    return result;
  }

  async _find(request, offset, limit) {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  // ADD THE EXECUTOR PART

  async httpCreate(ctx) {
    var object = new this._model(ctx.body);
    object._creationDate = new Date();
    await object.canAct(ctx, "create");
    try {
      await object.validate(ctx);
    } catch (err) {
      this.log("DEBUG", "Object is not valid", err);
      throw 400;
    }
    if (await this.exists(object.uuid)) {
      throw 409;
    }
    await this.save(object, object.uuid);
    ctx.write(object);
    await this.emitSync("Store.WebCreate", {
      values: ctx.body,
      object: object,
      store: this
    });
  }

  async httpAction(ctx) {
    let action = ctx._route._http.url.split("/").pop();
    if (!ctx._params.uuid) {
      throw 400;
    }

    let object = await this.get(ctx._params.uuid);
    if (object === undefined || object.__deleted) {
      throw 404;
    }
    await object.canAct(ctx, action);
    await this.emitSync("Store.Action", {
      action: action,
      object: object,
      store: this,
      body: ctx.body,
      params: ctx._params
    });
    let res = await object["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      object: object,
      store: this,
      body: ctx.body,
      params: ctx._params
    });
  }

  async httpGlobalAction(ctx) {
    let action = ctx._route._http.url.split("/").pop();
    await this.emitSync("Store.Action", {
      action: action,
      store: this,
      body: ctx.body,
      params: ctx._params
    });
    let res = await this._model["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      store: this,
      body: ctx.body,
      params: ctx._params
    });
  }

  async httpUpdate(ctx) {
    ctx.body.uuid = ctx._params.uuid;
    let object = await this.get(ctx._params.uuid);
    if (!object || object.__deleted) throw 404;
    await object.canAct(ctx, "update");
    try {
      await object.validate(ctx, ctx.body);
    } catch (err) {
      this.log("Object invalid", err);
      throw 400;
    }
    object = await this.update(ctx.body, ctx._params.uuid);
    if (object == undefined) {
      throw 500;
    }
    ctx.write(object);
    await this.emitSync("Store.WebUpdate", {
      updates: ctx.body,
      object: object,
      store: this
    });
  }

  async httpGet(ctx) {
    if (ctx._params.uuid) {
      let object = await this.get(ctx._params.uuid);
      if (object === undefined || object.__deleted) {
        throw 404;
      }
      await object.canAct(ctx, "get");
      await this.emitSync("Store.WebGet", {
        object: object,
        store: this
      });
      ctx.write(object);
    } else {
      // List probably
    }
  }

  async httpRoute(ctx) {
    if (ctx._route._http.method == "GET") {
      return this.httpGet(ctx);
    } else if (ctx._route._http.method == "DELETE") {
      let object = await this.get(ctx._params.uuid);
      if (!object || object.__deleted) throw 404;
      await object.canAct(ctx, "delete");
      // http://stackoverflow.com/questions/28684209/huge-delay-on-delete-requests-with-204-response-and-no-content-in-objectve-c#
      // IOS don't handle 204 with Content-Length != 0 it seems
      // Have trouble to handle the Content-Length on API Gateway so returning an empty object for now
      ctx.write({});
      await this.delete(ctx._params.uuid);
      await this.emitSync("Store.WebDelete", {
        object_id: ctx._params.uuid,
        store: this
      });
    } else if (ctx._route._http.method == "PUT") {
      return this.httpUpdate(ctx);
    }
  }
}

export { Store };
