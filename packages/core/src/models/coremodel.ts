"use strict";
import { v4 as uuidv4 } from "uuid";
import { Store } from "../stores/store";
import { Context } from "../utils/context";
import { Service } from "..";
import { JSONSchema6 } from "json-schema";

interface CoreModelDefinition {
  new (): CoreModel;
  getActions(): any;
  getUuidField(): string;
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
 */
class CoreModel {
  static jsonExcludes = ["__store", "__ctx"];
  /**
   * Class reference to the object
   */
  __class: any;
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
  static getActions() {
    return {};
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    ctx: Context,
    action: "create" | "update" | "get" | "delete" | "get_binary" | "detach_binary" | "attach_binary" | string
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
   * Get actions available for the current instance of an object
   */
  getAvailableActions() {
    return {};
  }

  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: any, secure: boolean = false) {
    if (!raw) {
      return;
    }
    if (!raw.uuid) {
      raw.uuid = this.generateUid(raw);
    }
    for (let prop in raw) {
      if (!secure && prop[0] === "_") {
        continue;
      }
      this[prop] = raw[prop];
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
   * Allow to specify the JSONSchema to configure this service
   *
   * Return undefined by default to fallback on typescript-json-schema guess
   *
   * Using this method should only be exception
   */
  static getSchema(): JSONSchema6 {
    return undefined;
  }

  /**
   * Validate objet modification
   *
   * @param ctx
   * @param updates
   */
  async validate(ctx: Context, updates: any = undefined): Promise<boolean> {
    // Load updates before validating itself
    if (!updates) {
      this.load(updates);
    }
    if (!ctx.getWebda().validateSchema(this, this)) {
      throw new Error(
        ctx
          .getWebda()
          .validationLastErrors()
          .map(e => e.message)
          .join(",")
      );
    }
    return true;
  }

  /**
   * Generate uuid for the object
   *
   * @param object
   * @returns
   */
  generateUid(object: any = undefined): string {
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
    obj.__store = undefined;
    if (stringify) {
      return JSON.stringify(obj, (key, value) => {
        if (CoreModel.jsonExcludes.indexOf(key) >= 0) {
          return undefined;
        }
        return value;
      });
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
  async _onUpdate(updates: any) {
    // Empty to be overriden
  }

  /**
   * Called when object is updated
   */
  async _onUpdated() {
    // Empty to be overriden
  }
}

export { CoreModel, CoreModelDefinition };
