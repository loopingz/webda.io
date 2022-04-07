"use strict";
import { v4 as uuidv4 } from "uuid";
import { Store } from "../stores/store";
import { Context, HttpMethodType } from "../utils/context";
import { Service } from "../services/service";

/**
 * Define an export of actions from Model
 */
export type ModelActions = {
  [key: string]: ModelAction;
};
export interface ModelAction {
  /**
   * Method for the route
   *
   * By default ["PUT"]
   */
  methods?: HttpMethodType[];
  /**
   * Define if the action is global or per object
   *
   * The method that implement the action must be called
   * `_${actionName}`
   */
  global?: boolean;
  /**
   * Additional openapi info
   */
  openapi?: any;
}
export interface CoreModelDefinition {
  new (): CoreModel;
  getActions(): { [key: string]: ModelAction };
  getUuidField(): string;
  getLastUpdateField(): string;
  getCreationField(): string;
}

/**
 * Sent if action required attached CoreModel is trigger
 */
export class CoreModelUnattachedError extends Error {
  constructor() {
    super("No store linked to this object");
  }
}

/**
 * Basic Object in Webda
 *
 * It is used to define a data stored
 * Any variable starting with _ can only be set by the server
 * Any variable starting with __ won't be exported outside of the server
 *
 * @class
 * @WebdaModel
 */
class CoreModel {
  static jsonExcludes = ["__store", "__ctx", "__class"];
  /**
   * Class reference to the object
   */
  __class: any;
  /**
   * Type name
   */
  __type: string;
  /**
   * Object context
   *
   * @TJS-ignore
   */
  __ctx: Context;
  /**
   * If object is attached to its store
   *
   * @TJS-ignore
   */
  __store: Store<CoreModel>;

  /**
   * Creation date
   */
  _creationDate: Date;

  /**
   * Last update date
   */
  _lastUpdate: Date;
  /**
   * If an object is deleted but not removed from DB for historic
   *
   * @ignore
   */
  __deleted: boolean;

  constructor() {
    this.__class = new.target;
  }
  /**
   *
   * @returns the uuid of the object
   */
  getUuid(): string {
    // @ts-ignore
    return this[this.__class.getUuidField()];
  }

  /**
   *
   * @param uuid
   * @param target
   */
  setUuid(uuid: string, target: any = this): void {
    target[this.__class.getUuidField()] = uuid;
  }

  /**
   * Get actions callable on an object
   *
   * This will expose them by the Store with /storeUrl/{uuid}/{action}
   */
  static getActions(): ModelActions {
    return {};
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    _ctx: Context,
    _action:
      | "create"
      | "update"
      | "get"
      | "delete"
      | "get_binary"
      | "detach_binary"
      | "attach_binary"
      | "update_binary_metadata"
      | string
  ): Promise<this> {
    throw 403;
  }

  /**
   * Get the UUID property
   */
  static getUuidField(): string {
    return "uuid";
  }

  /**
   * Get the UUID property
   */
  static getLastUpdateField(): string {
    return "_lastUpdate";
  }

  /**
   * Get the UUID property
   */
  static getCreationField(): string {
    return "_creationDate";
  }

  /**
   * Return if an object is attached to its store
   */
  isAttached() {
    return this.__store !== undefined;
  }

  /**
   * Attach an object to a store instance
   */
  attach(store: Store<CoreModel>) {
    this.__store = store;
  }

  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: any, secure: boolean = false) {
    // Object assign with filter
    for (let prop in raw) {
      if (!secure && prop[0] === "_") {
        continue;
      }
      this[prop] = raw[prop];
    }
    this.__type = this.__class.name;

    if (!this.getUuid()) {
      this.setUuid(this.generateUid(raw));
    }
  }

  /**
   * Context of the request
   */
  setContext(ctx: Context) {
    this.__ctx = ctx;
  }

  /**
   * Get object context
   *
   * Global object does not belong to a request
   */
  getContext() {
    return this.__ctx || Context.getGlobalContext();
  }

  /**
   * Return the object registered store
   */
  getStore() {
    return this.__store;
  }

  /**
   * Get the object again
   *
   * @throws Error if the object is not coming from a store
   */
  async refresh(): Promise<this> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    let obj = await this.__store.get(this.getUuid());
    if (obj) {
      for (let i in obj) {
        this[i] = obj[i];
      }
      for (let i in this) {
        // @ts-ignore
        if (obj[i] !== this[i]) {
          this[i] = undefined;
        }
      }
    }
    return this;
  }

  /**
   * Delete this object
   *
   * @throws Error if the object is not coming from a store
   */
  async delete(): Promise<void> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    return this.__store.delete(this.getUuid());
  }

  /**
   * Save this object
   *
   * @throws Error if the object is not coming from a store
   */
  async save(): Promise<this> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    let obj = await this.__store.save(this);
    for (var i in obj) {
      this[i] = obj[i];
    }
    return this;
  }

  /**
   * Update this object
   *
   * @throws Error if the object is not coming from a store
   */
  async update(changes): Promise<void> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    changes[this.__class.getUuidField()] = this[this.__class.getUuidField()];
    let obj = await this.__store.patch(changes);
    for (var i in obj) {
      this[i] = obj[i];
    }
  }

  /**
   * Validate objet modification
   *
   * @param ctx
   * @param updates
   */
  async validate(ctx: Context, updates: any = undefined): Promise<boolean> {
    ctx.getWebda().validateSchema(this, updates);
    return true;
  }

  /**
   * Generate uuid for the object
   *
   * @param object
   * @returns
   */
  generateUid(_object: any = undefined): string {
    return uuidv4().toString();
  }

  /**
   * Remove all the attribute starting with __
   * @param key
   * @param value
   * @returns
   */
  _jsonFilter(key, value): any {
    if (key[0] === "_" && key.length > 1 && key[1] === "_") {
      return undefined;
    }
    return value;
  }

  /**
   * Return the object to be serialized without the __store
   *
   * @param stringify
   * @returns
   */
  toStoredJSON(stringify = false): any | string {
    let obj = this._toJSON(true);
    CoreModel.jsonExcludes.forEach(attr => {
      delete obj[attr];
    });
    obj.__type = this.__class.name;
    if (stringify) {
      return JSON.stringify(obj);
    }
    return obj;
  }

  /**
   * Get a pre typed service
   *
   * @param service to retrieve
   * WARNING: Only object attached to a store can retrieve service
   */
  getService<T extends Service>(service): T {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    return this.__store.getService<T>(service);
  }

  /**
   * Remove the specific attributes if not secure
   *
   *
   *
   * @param secure serialize server fields also
   * @returns filtered object to be serialized
   */
  _toJSON(secure): any {
    let obj: any = {};
    for (let i in this) {
      let value = this[i];
      if (CoreModel.jsonExcludes.indexOf(i) >= 0) {
        continue;
      }
      if (!secure) {
        value = this._jsonFilter(i, this[i]);
      }
      if (value === undefined) continue;
      obj[i] = value;
    }
    return obj;
  }

  /**
   * Return the object without sensitive attributes
   *
   * @returns Object to serialize
   */
  toJSON(): any {
    return this._toJSON(false);
  }

  /**
   * Called when object is about to be deleted
   */
  async _onDelete() {
    // Empty to be overriden
  }

  /**
   * Called when object has been deleted
   */
  async _onDeleted() {
    // Empty to be overriden
  }

  /**
   * Called when object is retrieved
   */
  async _onGet() {
    // Empty to be overriden
  }

  /**
   * Called when object is about to be saved
   */
  async _onSave() {
    // Empty to be overriden
  }

  /**
   * Called when object is saved
   */
  async _onSaved() {
    // Empty to be overriden
  }

  /**
   * Called when object is about to be updates
   *
   * @param updates to be send
   */
  async _onUpdate(_updates: any) {
    // Empty to be overriden
  }

  /**
   * Called when object is updated
   */
  async _onUpdated() {
    // Empty to be overriden
  }
}

export { CoreModel };
