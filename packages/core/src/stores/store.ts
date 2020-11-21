"use strict";
import { v4 as uuidv4 } from "uuid";
import { ConfigurationProvider } from "../index";
import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { Service, ServiceParameters } from "../services/service";
import { Context } from "../utils/context";

export class StoreParameters extends ServiceParameters {
  lastUpdateField: string;
  creationDateField: string;
  model: string;
  index: string[] | undefined;
  map: {
    [key: string]: {
      key: string;
      fields: string;
    };
  };
  asyncDelete: boolean;
  expose?: {
    url: string;
    restrict: {
      create?: boolean;
      update?: boolean;
      get?: boolean;
      delete?: boolean;
    };
  };

  constructor(params: any, service: Service<any>) {
    super(params);
    this.lastUpdateField = this.lastUpdateField ?? "_lastUpdate";
    this.creationDateField = this.creationDateField ?? "_creationDate";
    this.model = this.model ?? "Webda/CoreModel";
    let expose = params.expose;
    if (typeof expose == "boolean") {
      expose = {};
      expose.url = "/" + service.getName().toLowerCase();
    } else if (typeof expose == "string") {
      expose = {
        url: expose
      };
    } else if (typeof expose == "object" && expose.url == undefined) {
      expose.url = "/" + service.getName().toLowerCase();
    }
    if (expose) {
      expose.restrict = expose.restrict || {};
      this.expose = expose;
    }
  }
}

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
 * @category CoreServices
 */
class Store<T extends CoreModel, K extends StoreParameters = StoreParameters> extends Service<K>
  implements ConfigurationProvider {
  _reverseMap: any[] = [];
  _cascade: any[] = [];
  _model: CoreModelDefinition;
  _exposeUrl: string;
  _lastUpdateField: string;
  _creationDateField: string;
  protected _uuidField: string = "uuid";

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): StoreParameters {
    return new StoreParameters(params, this);
  }

  /**
   * Retrieve the Model
   *
   * @throws Error if model is not found
   */
  computeParameters(): void {
    super.computeParameters();
    const p = this._params;
    this._model = this._webda.getModel(p.model);
    if (!this._model) {
      throw new Error(`${p.model} model is not found`);
    }
    this._uuidField = this._model.getUuidField();
    this._lastUpdateField = p.lastUpdateField || "_lastUpdate";
    this._creationDateField = p.creationDateField || "_creationDate";
  }

  getModel() {
    return this._model;
  }

  getUuidField() {
    return this._uuidField;
  }

  async init(): Promise<void> {
    this.initMap(this._params.map);
    if (this._params.index) {
      await this.createIndex();
    }
  }

  initRoutes() {
    if (!this._params.expose) {
      return;
    }
    const expose = this._params.expose;

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
      methods.push("PATCH");
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
          description: `Retrieve ${this._model.name} model if permissions allow`,
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
          description: `Update a ${this._model.name} if the permissions allow`,
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
        patch: {
          description: `Patch a ${this._model.name} if the permissions allow`,
          summary: "Patch a " + this._model.name,
          model: this._model.name,
          operationId: `updatet${this._model.name}`,
          responses: {
            "204": "",
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
              throw Error("Action static method _" + action.name + " does not exist");
            }
            action._method = this.httpGlobalAction;
          }
          this._addRoute(expose.url + "/" + action.name, action.method, action._method, action.openapi);
        } else {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model.prototype["_" + action.name]) {
              throw Error("Action method _" + action.name + " does not exist");
            }
            action._method = this.httpAction;
          }
          this._addRoute(expose.url + "/{uuid}/" + action.name, action.method, action._method, action.openapi);
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
      let model = new this._model();
      model.load(object, true);
      object = model;
    }
    object.__store = this;
    for (var i in this._reverseMap) {
      for (var j in object[this._reverseMap[i].property]) {
        object[this._reverseMap[i].property][j] = this._reverseMap[i].store.initModel(
          object[this._reverseMap[i].property][j]
        );
        object[this._reverseMap[i].property][j].setContext(object.getContext());
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
    index = undefined,
    itemWriteCondition = undefined,
    itemWriteConditionField = undefined
  ) {
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = this._uuidField;
    }
    let updateDate = new Date();
    await this._upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField, updateDate);

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

  async _handleMapFromPartial(uid: string, updateDate: Date, prop: string = undefined) {
    if (this.isMapped(prop) || this.isMapped(this._lastUpdateField)) {
      // Not optimal need to reload the object
      let object = await this._get(uid);
      let updates = {};
      updates[this._lastUpdateField] = updateDate;
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

  async deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField) {
    if (index === undefined || prop === undefined) {
      throw Error("Invalid Argument");
    }
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = this._uuidField;
    }
    let updateDate = new Date();
    await this._deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate);
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

  async createIndex() {
    if (!this._params.index || (await this.exists("index"))) {
      return;
    }
    let index = {};
    index[this._uuidField] = "index";
    index[this._lastUpdateField] = new Date();
    await this.save(index);
  }

  initMap(map) {
    if (map == undefined || map._init) {
      return;
    }
    for (var prop in map) {
      var reverseStore: Store<CoreModel, any> = this._webda.getService<Store<CoreModel, any>>(prop);
      if (reverseStore === undefined || !(reverseStore instanceof Store)) {
        map[prop]["-onerror"] = "NoStore";
        this.log("WARN", "Can't setup mapping as store \"", prop, "\" doesn't exist");
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
    return uuidv4();
  }

  /**
   * Save an object
   *
   * @param {Object} Object to save
   * @param {String} Uuid to use, if not specified take the object.uuid or generate one if not found
   * @return {Promise} with saved object
   */
  async save(object, ctx: Context = undefined) {
    /** @ignore */
    for (var i in this._reverseMap) {
      if (object[this._reverseMap[i].property] === undefined) {
        object[this._reverseMap[i].property] = [];
      }
    }
    object[this._creationDateField] = object[this._lastUpdateField] = new Date();
    object = this.initModel(object);
    if (ctx) {
      object.setContext(ctx);
    }
    if (!object[this._uuidField]) {
      object[this._uuidField] = object.generateUid();
      object[this._creationDateField] = new Date();
      if (!object[this._uuidField]) {
        object[this._uuidField] = this.generateUid();
      }
    }
    await this.emitSync("Store.Save", {
      object: object,
      store: this
    });
    // Handle object auto listener
    await object._onSave();
    let res = await this._save(object);
    object = this.initModel(res);
    await this.emitSync("Store.Saved", {
      object: object,
      store: this
    });
    await object._onSaved();
    if (this._params.map != undefined) {
      await this.handleMap(object, this._params.map, "created");
    }
    // Handle index
    if (this._params.index && object[this._uuidField] !== "index" && object[this._uuidField]) {
      await this.handleIndex(object, "created");
    }
    return object;
  }

  async _save(object: CoreModel): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async patch(object: any, reverseMap = true) {
    return this.update(object, reverseMap, true);
  }

  /**
   * Update an object
   *
   * @param {Object} Object to save
   * @param {Boolean} reverseMap internal use only, for disable map resolution
   * @return {Promise} with saved object
   */
  async update(object: any, reverseMap = true, partial = false) {
    /** @ignore */
    var saved;
    var loaded;
    // Dont allow to update collections from map
    if (this._reverseMap != undefined && reverseMap) {
      for (let i in this._reverseMap) {
        if (object[this._reverseMap[i].property] != undefined) {
          delete object[this._reverseMap[i].property];
        }
      }
    }
    let partialEvent = partial ? "Partial" : "";
    if (Object.keys(object).length === 0) {
      return {};
    }

    object[this._lastUpdateField] = new Date();
    let load = await this._get(object[this._uuidField]);
    loaded = this.initModel(load);
    await this.handleMap(loaded, this._params.map, object);
    // Handle index
    if (this._params.index && loaded[this._uuidField] !== "index" && loaded[this._uuidField]) {
      await this.handleIndex(loaded, object);
    }
    await this.emitSync(`Store.${partialEvent}Update`, {
      object: loaded,
      store: this,
      update: object
    });
    await loaded._onUpdate(object);
    let res: any;
    if (partial) {
      await this._patch(object, object[this._uuidField], load[this._lastUpdateField], this._lastUpdateField);
      res = object;
    } else {
      // Copy back the mappers
      for (let i in this._reverseMap) {
        object[this._reverseMap[i].property] = loaded[this._reverseMap[i].property];
      }
      res = await this._update(object, object[this._uuidField], load[this._lastUpdateField], this._lastUpdateField);
    }
    // Return updated
    for (let i in res) {
      loaded[i] = res[i];
    }
    for (let i in object) {
      loaded[i] = object[i];
    }
    saved = this.initModel(loaded);
    await this.emitSync(`Store.${partialEvent}Updated`, {
      object: saved,
      store: this
    });
    await saved._onUpdated();
    return saved;
  }

  getMapper(map, uuid) {
    for (var i = 0; i < map.length; i++) {
      if (map[i][this._uuidField] === uuid) {
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

  async _handleUpdatedMap(object, map, mapped, store, updates) {
    var mapper = {};
    mapper[this._uuidField] = object[this._uuidField];
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
      return;
    }

    // check if reference object has changed
    if (updates[map.key] != undefined && mapped[this._uuidField] != updates[map.key]) {
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
      let i = this.getMapper(mapped[map.target], object[this._uuidField]);
      if (i >= 0) {
        // Remove the data from old object
        await store.deleteItemFromCollection(
          mapped[this._uuidField],
          map.target,
          i,
          object[this._uuidField],
          this._uuidField
        );
      }
      // Add the data to new object
      await store.upsertItemToCollection(updates[map.key], map.target, mapper);
    } else {
      return this._handleUpdatedMapMapper(object, map, mapped, store, updates);
    }
  }

  _handleUpdatedMapTransferOut(object, map, mapped, store, updates) {
    var update = {};
    update[map.target] = mapped[map.target];
    return store.update(update, mapped[this._uuidField], false).then(() => {
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
    mapper[this._uuidField] = object[this._uuidField];
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
    let i = this.getMapper(mapped[map.target], object[this._uuidField]);
    // If not found just add it to the collection
    if (i < 0) {
      return store.upsertItemToCollection(mapped[this._uuidField], map.target, mapper);
    }
    // Else update with a check on the uuid
    return store.upsertItemToCollection(
      mapped[this._uuidField],
      map.target,
      mapper,
      i,
      object[this._uuidField],
      this._uuidField
    );
  }

  _handleDeletedMap(object, map, mapped, store) {
    // Remove from the collection
    if (mapped[map.target] === undefined) {
      return Promise.resolve();
    }
    let i = this.getMapper(mapped[map.target], object[this._uuidField]);
    if (i >= 0) {
      return store.deleteItemFromCollection(
        mapped[this._uuidField],
        map.target,
        i,
        object[this._uuidField],
        this._uuidField
      );
    }
    return Promise.resolve();
  }

  _handleCreatedMap(object, map, mapped, store) {
    // Add to the object
    var mapper: any = {};
    mapper[this._uuidField] = object[this._uuidField];
    // Add info to the mapped
    if (map.fields) {
      var fields = map.fields.split(",");
      for (var field in fields) {
        mapper[fields[field]] = object[fields[field]];
      }
    }
    return store.upsertItemToCollection(mapped[this._uuidField], map.target, mapper);
  }

  async _handleMapProperty(store, object, property, updates) {
    let mapped = await store.get(object[property.key] || updates[property.key]);
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

  async _removeAttribute(uuid: string, attribute: string) {}

  async removeAttribute(uuid: string, attribute: string) {
    return this._removeAttribute(uuid, attribute);
  }

  async handleIndex(object: CoreModel, updates: object | string) {
    let mapUpdates = {};
    if (typeof updates === "object") {
      let toUpdate = false;
      for (let i in updates) {
        if (this._params.index.indexOf(i) >= 0) {
          toUpdate = true;
        }
      }
      if (!toUpdate) {
        return;
      }
    } else if (updates === "deleted") {
      await this.removeAttribute("index", object[this._uuidField]);
      return;
    } else if (updates === "created") {
      updates = object;
    }
    let mapper = {};
    this._params.index.forEach(id => {
      mapper[id] = updates[id];
    });
    mapUpdates[object[this._uuidField]] = mapper;
    mapUpdates[this._lastUpdateField] = new Date();
    await this._patch(mapUpdates, "index");
  }

  async handleMap(object, map, updates): Promise<any[]> {
    let promises = [];
    if (object === undefined) {
      return;
    }
    for (let prop in map) {
      // No mapped property or not in the object
      if (
        map[prop].key === undefined ||
        (object[map[prop].key] === undefined && updates[map[prop].key] === undefined)
      ) {
        continue;
      }
      let store: Store<CoreModel, any> = this.getService<Store<CoreModel, any>>(prop);
      // Cant find the store for this collection
      if (store == undefined) {
        continue;
      }
      promises.push(this._handleMapProperty(store, object, map[prop], updates));
    }
    return Promise.all(promises);
  }

  async _update(
    object,
    uid,
    itemWriteCondition: any = undefined,
    itemWriteConditionField: string = undefined
  ): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async _patch(
    object: any,
    uid: string,
    itemWriteCondition: any = undefined,
    itemWriteConditionField: string = undefined
  ): Promise<any> {
    throw Error("Virtual abstract class - concrete only for MixIn usage");
  }

  async cascadeDelete(obj: any, uuid: string): Promise<any> {
    // We dont need uuid but Binary store will need it
    return this.delete(obj[this._uuidField]);
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
      uid = to_delete[this._uuidField];
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
    // Handle index
    if (this._params.index && to_delete[this._uuidField] !== "index" && to_delete[this._uuidField]) {
      await this.handleIndex(to_delete, "deleted");
    }
    if (this._cascade != undefined && to_delete !== undefined) {
      var promises = [];
      // Should deactiate the mapping in that case
      for (let i in this._cascade) {
        if (typeof this._cascade[i] != "object" || to_delete[this._cascade[i].name] == undefined) continue;
        var targetStore: Store<CoreModel, any> = this.getService<Store<CoreModel, any>>(this._cascade[i].store);
        if (targetStore == undefined) continue;
        for (var item in to_delete[this._cascade[i].name]) {
          promises.push(targetStore.cascadeDelete(to_delete[this._cascade[i].name][item], to_delete[this._uuidField]));
        }
      }
      await Promise.all(promises);
    }
    if (this._params.asyncDelete && !sync) {
      await this._patch(
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

  async _delete(uid: string, writeCondition?, itemWriteConditionField?: string): Promise<void> {
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
   * By default we cannot know if the store will trigger or not
   *
   * @param id
   * @param callback
   */
  canTriggerConfiguration(id: string, callback: () => void) {
    return false;
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
      if (i === this._uuidField || i === this._lastUpdateField || i.startsWith("_")) {
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
  async get(uid: string, ctx: Context = undefined): Promise<T> {
    /** @ignore */
    if (!uid) {
      return undefined;
    }
    let object = await this._get(uid);
    if (!object) {
      return undefined;
    }
    object = this.initModel(object);
    object.setContext(ctx);
    await this.emitSync("Store.Get", {
      object: object,
      store: this
    });
    await object._onGet();
    return object;
  }

  async find(request: any = undefined, offset: number = 0, limit: number = undefined): Promise<any> {
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

  async httpCreate(ctx: Context) {
    let body = ctx.getRequestBody();
    var object = new this._model();
    object.setContext(ctx);
    object.load(body);
    object[this._creationDateField] = new Date();
    await object.canAct(ctx, "create");
    try {
      await object.validate(ctx);
    } catch (err) {
      this.log("INFO", "Object is not valid", err);
      throw 400;
    }
    if (object[this._uuidField] && (await this.exists(object[this._uuidField]))) {
      throw 409;
    }
    await this.save(object, ctx);
    ctx.write(object);
    await this.emitSync("Store.WebCreate", {
      context: ctx,
      values: body,
      object: object,
      store: this
    });
  }

  async httpAction(ctx: Context) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    let body = ctx.getRequestBody();
    let uuid = ctx.parameter("uuid");
    if (!uuid) {
      throw 400;
    }
    let object = await this.get(uuid, ctx);
    if (object === undefined || object.__deleted) {
      throw 404;
    }
    await object.canAct(ctx, action);
    await this.emitSync("Store.Action", {
      action: action,
      object: object,
      store: this,
      body,
      params: ctx.getRequestParameters()
    });
    let res = await object["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      object: object,
      store: this,
      body,
      params: ctx.getRequestParameters()
    });
  }

  async httpGlobalAction(ctx: Context) {
    let body = ctx.getRequestBody();
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    await this.emitSync("Store.Action", {
      action: action,
      store: this,
      body,
      params: ctx.getParameters()
    });
    let res = await this._model["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      store: this,
      body,
      params: ctx.getParameters()
    });
  }

  async httpUpdate(ctx: Context) {
    let body = ctx.getRequestBody();
    let uuid = ctx.parameter("uuid");
    body[this._uuidField] = uuid;
    let object = await this.get(uuid, ctx);
    if (!object || object.__deleted) throw 404;
    await object.canAct(ctx, "update");
    try {
      await object.validate(ctx, body);
    } catch (err) {
      this.log("INFO", "Object invalid", err);
      throw 400;
    }
    if (ctx.getHttpContext().getMethod() === "PATCH") {
      let updateObject: any = new this._model();
      updateObject.setContext(ctx);
      updateObject.load(body);
      await this.patch(updateObject);
      object = undefined;
    } else {
      let updateObject: any = new this._model();
      updateObject.load(body);
      // Copy back the _ attributes
      for (let i in object) {
        if (i.startsWith("_")) {
          updateObject[i] = object[i];
        }
      }
      // Add mappers back to
      object = await this.update(updateObject);
    }
    ctx.write(object);
    await this.emitSync("Store.WebUpdate", {
      context: ctx,
      updates: body,
      object: object,
      store: this
    });
  }

  async httpGet(ctx: Context) {
    let uuid = ctx.parameter("uuid");
    if (uuid) {
      let object = await this.get(uuid, ctx);
      if (object === undefined || object.__deleted) {
        throw 404;
      }
      await object.canAct(ctx, "get");
      ctx.write(object);
      await this.emitSync("Store.WebGet", {
        context: ctx,
        object: object,
        store: this
      });
      ctx.write(object);
    } else {
      // List probably
    }
  }

  async httpRoute(ctx: Context) {
    let uuid = ctx.parameter("uuid");
    if (ctx.getHttpContext().getMethod() == "GET") {
      return this.httpGet(ctx);
    } else if (ctx.getHttpContext().getMethod() == "DELETE") {
      let object = await this.get(uuid, ctx);
      if (!object || object.__deleted) throw 404;
      await object.canAct(ctx, "delete");
      // http://stackoverflow.com/questions/28684209/huge-delay-on-delete-requests-with-204-response-and-no-content-in-objectve-c#
      // IOS don't handle 204 with Content-Length != 0 it seems
      // Have trouble to handle the Content-Length on API Gateway so returning an empty object for now
      ctx.write({});
      await this.delete(uuid);
      await this.emitSync("Store.WebDelete", {
        context: ctx,
        object_id: uuid,
        store: this
      });
    } else if (ctx.getHttpContext().getMethod() === "PUT" || ctx.getHttpContext().getMethod() === "PATCH") {
      return this.httpUpdate(ctx);
    }
  }
}

export { Store };
