"use strict";
import { v4 as uuidv4 } from "uuid";
import { EventWithContext, WebdaError } from "../core";
import { ConfigurationProvider } from "../index";
import { CoreModel, CoreModelDefinition } from "../models/coremodel";
import { Service, ServiceParameters } from "../services/service";
import { Context } from "../utils/context";

export class StoreNotFoundError extends WebdaError {
  constructor(uuid: string, storeName: string) {
    super("STORE_NOTFOUND", `Item not found ${uuid} Store(${storeName})`);
  }
}

export class UpdateConditionFailError extends WebdaError {
  constructor(uuid: string, conditionField: string, condition: string) {
    super("STORE_UPDATE_CONDITION_FAILED", `UpdateCondition not met on ${uuid}.${conditionField} === ${condition}`);
  }
}

interface EventStore {
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Store emitting
   */
  store: Store;
}
/**
 * Event called before save of an object
 */
export interface EventStoreSave extends EventStore {}
/**
 * Event called after save of an object
 */
export interface EventStoreSaved extends EventStoreSave {}
/**
 * Event called before delete of an object
 */
export interface EventStoreDelete extends EventStore {}
/**
 * Event called after delete of an object
 */
export interface EventStoreDeleted extends EventStoreDelete {}
/**
 * Event called on retrieval of an object
 */
export interface EventStoreGet extends EventStore {}
/**
 * Event called before action on an object
 */
export interface EventStoreAction extends EventWithContext {
  /**
   * Name of the action
   */
  action: string;
  /**
   * Target object unless it is a global action
   */
  object?: CoreModel;
  /**
   * Emitting store
   */
  store: Store;
}
/**
 * Event called after action on an object
 */
export interface EventStoreActioned extends EventStoreAction {
  /**
   * Result of the action
   */
  result: any;
}
/**
 * Event called before update of an object
 */
export interface EventStoreUpdate extends EventStoreUpdated {
  /**
   * Update content
   */
  update: any;
}
/**
 * Event called after update of an object
 */
export interface EventStoreUpdated extends EventStore {}
/**
 * Event called before patch update of an object
 */
export interface EventStorePatchUpdate extends EventStoreUpdate {}
/**
 * Event called after patch update of an object
 */
export interface EventStorePatchUpdated extends EventStoreUpdated {}
/**
 * Event called after partial update of an object
 */
export interface EventStorePartialUpdated {
  /**
   * Object uuid
   */
  object_id: string;
  /**
   * Emitting store
   */
  store: Store;
  /**
   * Info on the update
   */
  partial_update: {
    /**
     * If incremental update
     */
    increment?: {
      /**
       * Increment value
       */
      value: number;
      /**
       * Property to increment
       */
      property: string;
    };
    /**
     * Add item to a collection
     */
    addItem?: {
      /**
       * Item to add
       */
      value: any;
      /**
       * Collection name
       */
      property: string;
      /**
       * Index to add
       */
      index: number;
    };
    /**
     * Delete an item from collection
     */
    deleteItem?: {
      /**
       * Collection name
       */
      property: string;
      /**
       * Index in the collection
       */
      index: number;
    };
  };
}

/**
 * Event sent when a query on the store is emitted
 */
export interface EventStoreFind {
  /**
   * Request sent
   */
  request: any;
  /**
   * Emitting store
   */
  store: Store;
  /**
   * Offset on the results
   */
  offset: number;
  /**
   * Max number of results
   */
  limit: number;
}
/**
 * Event sent when query is resolved
 */
export interface EventStoreFound extends EventStoreFind {
  /**
   * Results from the query
   */
  results: CoreModel[];
}

/**
 * Event sent when object is created via POST request
 */
export interface EventStoreWebCreate extends EventWithContext {
  /**
   * Properties for the object
   */
  values: any;
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Emitting store
   */
  store: Store;
}

/**
 * Event sent when object is retrieved via GET request
 */
export interface EventStoreWebGet extends EventWithContext {
  /**
   * Emitting store
   */
  store: Store;
  /**
   * Target object
   */
  object: CoreModel;
}

/**
 * Event sent when object is updated via PUT request
 */
export interface EventStoreWebUpdate extends EventWithContext {
  /**
   * Type of update
   */
  method: "PATCH" | "PUT";
  /**
   * Updates to do on the object
   */
  updates: any;
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Emitting store
   */
  store: Store;
}

/**
 * Event sent when object is deleted via DELETE request
 */
export interface EventStoreWebDelete extends EventWithContext {
  /**
   * Object uuid
   */
  object_id: string;
  /**
   * Emitting store
   */
  store: Store;
}

/**
 * Mapper parameters
 */
export interface MapStoreParameter {
  /**
   * Key on the current model which holds the collection
   */
  key: string;
  /**
   * Other fields to duplicate inside the model
   */
  fields: string;
  /**
   * Delete if target object is delete
   * @default false
   */
  cascade?: boolean;
  /**
   * Field to target on the object
   */
  target: string;
}

export type ExposeParameters = {
  /**
   * URL endpoint to use to expose REST Resources API
   *
   * @default service.getName().toLowerCase()
   */
  url?: string;
  /**
   * You can restrict any part of the CRUD
   *
   * @default {}
   */
  restrict?: {
    /**
     * Do not expose the POST
     */
    create?: boolean;
    /**
     * Do not expose the PUT and PATCH
     */
    update?: boolean;
    /**
     * Do not expose the GET
     */
    get?: boolean;
    /**
     * Do not expose the DELETE
     */
    delete?: boolean;
  };
};

/**
 * Store parameter
 */
export class StoreParameters extends ServiceParameters {
  /**
   * Field to store the lastUpdate of the object
   *
   * @default "_lastUpdate"
   */
  lastUpdateField?: string;
  /**
   * Field to store the creationDate of the object
   *
   * @default "_creationDate"
   */
  creationDateField?: string;
  /**
   * Webda model to use within the Store
   *
   * @default "Webda/CoreModel"
   */
  model?: string;
  /**
   * Create an index object that link all other objects uuid
   */
  index?: string[];
  /**
   * You can define a Map between different Stores
   *
   * {@link Pages/pages/Store}
   */
  map: {
    [key: string]: MapStoreParameter;
  };
  /**
   * async delete
   */
  asyncDelete: boolean;
  /**
   * Expose the service to an urls
   */
  expose?: ExposeParameters | boolean | string;

  constructor(params: any, service: Service<any>) {
    super(params);
    this.lastUpdateField ??= "_lastUpdate";
    this.creationDateField ??= "_creationDate";
    this.model ??= "Webda/CoreModel";
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
abstract class Store<T extends CoreModel = CoreModel, K extends StoreParameters = StoreParameters>
  extends Service<K>
  implements ConfigurationProvider
{
  /**
   * Contain the reverse map
   */
  _reverseMap: any[] = [];
  /**
   * Contains cascade delete information
   */
  _cascade: any[] = [];
  /**
   * Contains the current model
   */
  _model: CoreModelDefinition;
  /**
   * Contain the model update date
   */
  _lastUpdateField: string;
  /**
   * Contain the model creation date
   */
  _creationDateField: string;
  /**
   * Contain the model uuid field
   */
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
    const p = this.parameters;
    this._model = this._webda.getModel(p.model);
    this._uuidField = this._model.getUuidField();
    this._lastUpdateField = p.lastUpdateField;
    this._creationDateField = p.creationDateField;
  }

  /**
   * Return Store current model
   * @returns
   */
  getModel() {
    return this._model;
  }

  /**
   * Create index if not existing
   *
   * @inheritdoc
   */
  async init(): Promise<void> {
    this.initMap(this.parameters.map);
    if (this.parameters.index) {
      await this.createIndex();
    }
  }

  /**
   * @inheritdoc
   */
  initRoutes() {
    if (!this.parameters.expose) {
      return;
    }
    // We enforce ExposeParameters within the constructor
    const expose = <ExposeParameters>this.parameters.expose;

    if (!expose.restrict.create) {
      this.addRoute(expose.url, ["POST"], this.httpCreate, {
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
    if (methods.length) {
      this.addRoute(expose.url + "/{uuid}", methods, this.httpRoute, {
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
          this.addRoute(expose.url + "/" + action.name, action.method, action._method, action.openapi);
        } else {
          // By default will grab the object and then call the action
          if (!action._method) {
            if (!this._model.prototype["_" + action.name]) {
              throw Error("Action method _" + action.name + " does not exist");
            }
            action._method = this.httpAction;
          }
          this.addRoute(expose.url + "/{uuid}/" + action.name, action.method, action._method, action.openapi);
        }
      });
    }
  }

  /**
   * Get the url where the store is exposed
   */
  getUrl(): string {
    return (<ExposeParameters>this.parameters.expose).url;
  }

  /**
   * Init a model from the current stored data
   *
   * Initial the reverse map as well
   *
   * @param object
   * @returns
   */
  initModel(object: any = {}): T {
    // Make sure to send a model object
    if (!(object instanceof this._model)) {
      let model = new this._model();
      model.load(object, true);
      object = model;
    }
    if (!object.getUuid()) {
      object.setUuid(object.generateUid(object));
    }
    object.__store = this;
    for (var i in this._reverseMap) {
      for (var j in object[this._reverseMap[i].property]) {
        // Use Partial
        object[this._reverseMap[i].property][j] = this._reverseMap[i].store.initModel(
          object[this._reverseMap[i].property][j]
        );
        object[this._reverseMap[i].property][j].setContext(object.getContext());
      }
    }
    return object;
  }

  /**
   * Add reverse map information
   *
   * @param prop
   * @param cascade
   * @param store
   */
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
    if (!this.parameters.map) {
      return false;
    }
    let map = this.parameters.map;
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

  async incrementAttribute(uid: string, prop: string, value: number) {
    // If value === 0 no need to update anything
    if (value === 0) {
      return Promise.resolve();
    }
    let updateDate = new Date();
    await this._incrementAttribute(uid, prop, value, updateDate);
    await this._handleMapFromPartial(uid, updateDate, prop);
    return this.emitSync("Store.PartialUpdated", <EventStorePartialUpdated>{
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
    uid: string,
    prop: string,
    item: any,
    index: number = undefined,
    itemWriteCondition: any = undefined,
    itemWriteConditionField: string = undefined
  ) {
    if (itemWriteConditionField === undefined) {
      itemWriteConditionField = this._uuidField;
    }
    let updateDate = new Date();
    await this._upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField, updateDate);

    await this._handleMapFromPartial(uid, updateDate);
    await this.emitSync("Store.PartialUpdated", <EventStorePartialUpdated>{
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
        updates[prop] = object[prop];
      }
      await this.handleMap(object, this.parameters.map, updates);
    }
  }

  async deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string = this._uuidField
  ) {
    let updateDate = new Date();
    await this._deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField, updateDate);
    await this._handleMapFromPartial(uid, updateDate);
    await this.emitSync("Store.PartialUpdated", <EventStorePartialUpdated>{
      object_id: uid,
      store: this,
      partial_update: {
        deleteItem: {
          property: prop,
          index: index
        }
      }
    });
  }

  async createIndex() {
    if (!this.parameters.index || (await this.exists("index"))) {
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

    object = this.initModel(object);
    if (!object.getUuid()) {
      throw new Error(object);
    }
    // Dates should be store by the Store
    object[this._creationDateField] ??= new Date();
    object[this._lastUpdateField] = new Date();

    if (ctx) {
      object.setContext(ctx);
    }
    await this.emitSync("Store.Save", <EventStoreSave>{
      object: object,
      store: this
    });
    // Handle object auto listener
    await object._onSave();
    let res = await this._save(object);
    object = this.initModel(res);
    await this.emitSync("Store.Saved", <EventStoreSaved>{
      object: object,
      store: this
    });
    await object._onSaved();
    if (this.parameters.map != undefined) {
      await this.handleMap(object, this.parameters.map, "created");
    }
    // Handle index
    if (this.parameters.index && object.getUuid() !== "index" && object.getUuid()) {
      await this.handleIndex(object, "created");
    }
    return object;
  }

  /**
   * Patch an object
   *
   * @param object
   * @param reverseMap
   * @returns
   */
  async patch(object: any, reverseMap = true) {
    return this.update(object, reverseMap, true);
  }

  /**
   * Check if an UpdateCondition is met
   * @param model
   * @param conditionField
   * @param condition
   * @param uid
   */
  checkUpdateCondition(model: T, conditionField?: string, condition?: any, uid?: string) {
    if (conditionField) {
      if (model[conditionField] !== condition) {
        throw new UpdateConditionFailError(uid ? uid : model.getUuid(), conditionField, condition);
      }
    }
  }

  /**
   * Check if an UpdateCondition is met
   * @param model
   * @param conditionField
   * @param condition
   * @param uid
   */
  checkCollectionUpdateCondition(
    model: T,
    collection: string,
    conditionField?: string,
    condition?: any,
    index?: number
  ) {
    // No index so addition to collection
    if (index === null) {
      // The condition must be length of the collection
      if (!model[collection] || model[collection].length !== condition) {
        throw new UpdateConditionFailError(model.getUuid(), collection, condition);
      }
    } else if (condition && model[collection][index][conditionField] !== condition) {
      throw new UpdateConditionFailError(model.getUuid(), `${collection}[${index}].${conditionField}`, condition);
    }
  }

  /**
   *
   * @param model
   * @param prop
   * @param item
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @param updateDate
   */
  async simulateUpsertItemToCollection(
    model: T,
    prop: string,
    item: any,
    updateDate: Date,
    index?: number,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ) {
    this.checkCollectionUpdateCondition(model, prop, itemWriteConditionField, itemWriteCondition, index);
    if (index === undefined) {
      if (model[prop] === undefined) {
        model[prop] = [item];
      } else {
        model[prop].push(item);
      }
    } else {
      model[prop][index] = item;
    }
    model[this._lastUpdateField] = updateDate;
    await this._save(model);
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
    let partialEvent = partial ? "Patch" : "";
    if (Object.keys(object).length === 0) {
      return {};
    }

    object[this._lastUpdateField] = new Date();
    let load = await this._get(object[this._uuidField], true);
    loaded = this.initModel(load);
    await this.handleMap(loaded, this.parameters.map, object);
    // Handle index
    if (this.parameters.index && loaded[this._uuidField] !== "index" && loaded[this._uuidField]) {
      await this.handleIndex(loaded, object);
    }
    await this.emitSync(`Store.${partialEvent}Update`, <EventStoreUpdate | EventStorePatchUpdate>{
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
    await this.emitSync(`Store.${partialEvent}Updated`, <EventStoreUpdated | EventStorePatchUpdated>{
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

  _handleUpdatedMapMapper(object: CoreModel, map, mapped: CoreModel, store: Store, updates) {
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

  async _handleDeletedMap(object: CoreModel, map, mapped: CoreModel, store: Store) {
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
  }

  async _handleCreatedMap(object: CoreModel, map, mapped: CoreModel, store: Store) {
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

  async _handleMapProperty(store: Store, object, property, updates) {
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
      throw Error("Unknown handleMap type " + updates);
    }
  }

  /**
   * Remove an attribute from an object
   *
   * @param uuid
   * @param attribute
   * @returns
   */
  async removeAttribute(uuid: string, attribute: string, itemWriteCondition?: any, itemWriteConditionField?: string) {
    // Probably want to genereate some events from here
    return this._removeAttribute(uuid, attribute, itemWriteCondition, itemWriteConditionField);
  }

  async handleIndex(object: CoreModel, updates: object | string) {
    let mapUpdates = {};
    if (typeof updates === "object") {
      let toUpdate = false;
      for (let i in updates) {
        if (this.parameters.index.indexOf(i) >= 0) {
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
    this.parameters.index.forEach(id => {
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

  /**
   * Cascade delete a related object
   *
   * @param obj
   * @param uuid
   * @returns
   */
  async cascadeDelete(obj: any, uuid: string): Promise<any> {
    // We dont need uuid but Binary store will need it
    return this.delete(obj[this._uuidField]);
  }

  /**
   * Delete an object from the store without condition nor async
   * @param uid to delete
   * @returns
   */
  async forceDelete(uid: string): Promise<void> {
    return this.delete(uid, undefined, undefined, true);
  }

  /**
   * Delete an object
   *
   * @param {String} uuid to delete
   * @param {Boolean} delete sync even if asyncDelete is active
   * @return {Promise} the deletion promise
   */
  async delete(
    uid: string | T,
    writeCondition?: any,
    writeConditionField?: string,
    sync: boolean = false
  ): Promise<void> {
    /** @ignore */
    let to_delete: T;
    // Allow full object or just its uuid
    if (typeof uid === "object") {
      to_delete = uid;
      uid = to_delete[this._uuidField];
    } else {
      to_delete = await this._get(uid);
      if (to_delete === undefined) {
        return;
      }
      to_delete = this.initModel(to_delete);
    }

    // Check condition as we have the object
    if (writeCondition) {
      if (to_delete[writeConditionField] !== writeCondition) {
        throw new UpdateConditionFailError(to_delete.getUuid(), writeConditionField, writeCondition);
      }
    }
    await this.emitSync("Store.Delete", <EventStoreDelete>{
      object: to_delete,
      store: this
    });
    await to_delete._onDelete();
    if (this.parameters.map != undefined) {
      await this.handleMap(to_delete, this.parameters.map, "deleted");
    }
    // Handle index
    if (this.parameters.index && to_delete[this._uuidField] !== "index" && to_delete[this._uuidField]) {
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
    if (this.parameters.asyncDelete && !sync) {
      await this._patch(
        {
          __deleted: true
        },
        to_delete.getUuid()
      );
    } else {
      await this._delete(to_delete.getUuid(), writeCondition, writeConditionField);
    }
    await this.emitSync("Store.Deleted", <EventStoreDeleted>{
      object: to_delete,
      store: this
    });
    await to_delete._onDeleted();
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
      // @ts-ignore
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
    await this.emitSync("Store.Get", <EventStoreGet>{
      object: object,
      store: this
    });
    await object._onGet();
    return object;
  }

  /**
   * Set one attribute in an object
   *
   * this is an helper function that calls patch
   *
   * @param uid of the object
   * @param property to update1
   * @param value new value
   * @returns
   */
  async setAttribute(uid: string, property: string, value: any): Promise<void> {
    let patch: any = {};
    patch[property] = value;
    patch[this.getUuidField()] = uid;
    await this.patch(patch);
  }

  /**
   * Search inside the store
   *
   * Still need to define a good abstraction for it
   *
   * @param request
   * @param offset
   * @param limit
   * @returns
   */
  async find(request: any = undefined, offset: number = 0, limit: number = undefined): Promise<any> {
    await this.emitSync("Store.Find", <EventStoreFind>{
      request: request,
      store: this,
      offset: offset,
      limit: limit
    });
    let result = await this._find(request, offset, limit);
    await this.emitSync("Store.Found", <EventStoreFound>{
      request: request,
      store: this,
      offset: offset,
      limit: limit,
      results: result
    });
    return result;
  }

  /**
   * Handle POST
   * @param ctx
   */
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
    await this.emitSync("Store.WebCreate", <EventStoreWebCreate>{
      context: ctx,
      values: body,
      object: object,
      store: this
    });
  }

  /**
   * Handle obect action
   * @param ctx
   */
  async httpAction(ctx: Context) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    let object = await this.get(ctx.parameter("uuid"), ctx);
    if (object === undefined || object.__deleted) {
      throw 404;
    }
    await object.canAct(ctx, action);
    await this.emitSync("Store.Action", <EventStoreAction>{
      action: action,
      object: object,
      store: this,
      context: ctx
    });
    let res = await object["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", <EventStoreActioned>{
      action: action,
      object: object,
      store: this,
      context: ctx,
      result: res
    });
  }

  /**
   * Handle collection action
   * @param ctx
   */
  async httpGlobalAction(ctx: Context) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    await this.emitSync("Store.Action", <EventStoreAction>{
      action: action,
      store: this,
      context: ctx
    });
    let res = await this._model["_" + action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", <EventStoreActioned>{
      action: action,
      store: this,
      context: ctx,
      result: res
    });
  }

  /**
   * Handle HTTP Update for an object
   *
   * @param ctx context of the request
   */
  async httpUpdate(ctx: Context) {
    let body = ctx.getRequestBody();
    let uuid = ctx.parameter("uuid");
    body[this._uuidField] = uuid;
    let object = await this.get(uuid, ctx);
    if (!object || object.__deleted) throw 404;
    await object.canAct(ctx, "update");
    if (ctx.getHttpContext().getMethod() === "PATCH") {
      try {
        await object.validate(ctx, body);
      } catch (err) {
        this.log("INFO", "Object invalid", err);
        throw 400;
      }
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
      try {
        await updateObject.validate(ctx);
      } catch (err) {
        this.log("INFO", "Object invalid", err);
        throw 400;
      }

      // Add mappers back to
      object = await this.update(updateObject);
    }
    ctx.write(object);
    await this.emitSync("Store.WebUpdate", <EventStoreWebUpdate>{
      context: ctx,
      updates: body,
      object: object,
      store: this,
      method: ctx.getHttpContext().getMethod()
    });
  }

  /**
   * Handle GET on object
   *
   * @param ctx context of the request
   */
  async httpGet(ctx: Context) {
    let uuid = ctx.parameter("uuid");
    if (uuid) {
      let object = await this.get(uuid, ctx);
      if (object === undefined || object.__deleted) {
        throw 404;
      }
      await object.canAct(ctx, "get");
      ctx.write(object);
      await this.emitSync("Store.WebGet", <EventStoreWebGet>{
        context: ctx,
        object: object,
        store: this
      });
      ctx.write(object);
    } else {
      // List probably
    }
  }

  /**
   * Handle HTTP request
   *
   * @param ctx context of the request
   * @returns
   */
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
      await this.emitSync("Store.WebDelete", <EventStoreWebDelete>{
        context: ctx,
        object_id: uuid,
        store: this
      });
    } else if (ctx.getHttpContext().getMethod() === "PUT" || ctx.getHttpContext().getMethod() === "PATCH") {
      return this.httpUpdate(ctx);
    }
  }

  /**
   * Return the model uuid field
   */
  getUuidField(): string {
    return this._uuidField;
  }

  // All the abstract method
  abstract _find(request, offset, limit): Promise<CoreModel[]>;

  /**
   * Check if an object exists
   * @abstract
   * @params {String} uuid of the object
   */
  abstract exists(uid: string): Promise<boolean>;

  /**
   * The underlying store should recheck writeCondition only if it does not require
   * another get()
   *
   * @param uid
   * @param writeCondition
   * @param itemWriteConditionField
   */
  abstract _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string): Promise<void>;

  /**
   * Retrieve an element from the store
   *
   * @param uid to retrieve
   * @param raiseIfNotFound raise an StoreNotFound exception if not found
   */
  abstract _get(uid: string, raiseIfNotFound?: boolean): Promise<T>;

  /**
   * Get an object
   *
   * @param {Array} uuid to gets if undefined then retrieve the all table
   * @return {Promise} the objects retrieved ( can be [] if not found )
   */
  abstract getAll(list?: string[]): Promise<T[]>;

  abstract _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any>;

  abstract _patch(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any>;

  abstract _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void>;

  /**
   * Save within the store
   * @param object
   */
  abstract _save(object: T): Promise<any>;

  /**
   * Increment the attribute
   * @param uid
   * @param prop
   * @param value
   * @param updateDate
   */
  abstract _incrementAttribute(uid: string, prop: string, value: number, updateDate: Date): Promise<any>;

  abstract _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any>;

  abstract _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any>;
}

export { Store };
