"use strict";
import * as uuid from "uuid";
import { OwnerPolicy } from "../policies/ownerpolicy";
import { Store } from "../stores/store";
import { Context } from "../utils/context";
import { Service } from "..";
interface CoreModelDefinition {
  new (): CoreModel;
  getActions(): any;
  getUuidField(): string;
}

class CoreModelMapper<T extends CoreModel> {
  private __store: Store<CoreModel>;

  constructor(uuid, properties = {}, store) {
    this[this.__store.getModel().getUuidField()] = uuid;
  }

  async load(): Promise<T> {
    return <T>await this.__store.get(this[this.__store.getModel().getUuidField()]);
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
class CoreModel extends OwnerPolicy {
  static jsonExcludes = ["__store", "__ctx"];
  /**
   * Object context
   */
  __ctx: Context;
  /**
   * If object is attached to its store
   */
  __store: Store<CoreModel>;

  _creationDate: Date;
  lastUpdate: Date;
  _lastUpdate: Date;
  /**
   * If an object is deleted but not removed from DB for historic
   */
  __deleted: boolean;

  /**
   * Get actions callable on an object
   *
   * This will expose them by the Store with /storeUrl/{uuid}/{action}
   */
  static getActions() {
    return {};
  }

  /**
   * Get the UUID property
   */
  static getUuidField(): string | string[] {
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
  async refresh(): Promise<CoreModel> {
    if (!this.__store) {
      throw Error("No store linked to this object");
    }
    let obj = await this.__store.get(this.uuid);
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
      throw Error("No store linked to this object");
    }
    return this.__store.delete(this.uuid);
  }

  /**
   * Save this object
   *
   * @throws Error if the object is not coming from a store
   */
  async save(): Promise<void> {
    if (!this.__store) {
      throw Error("No store linked to this object");
    }
    let obj = await this.__store.save(this);
    for (var i in obj) {
      this[i] = obj[i];
    }
  }

  /**
   * Update this object
   *
   * @throws Error if the object is not coming from a store
   */
  async update(changes): Promise<void> {
    if (!this.__store) {
      throw Error("No store linked to this object");
    }
    changes[this.__store.getModel().getUuidField()] = this[this.__store.getModel().getUuidField()];
    let obj = await this.__store.update(changes);
    for (var i in obj) {
      this[i] = obj[i];
    }
  }

  /**
   * Return the object schema, if defined any modification done to the object by external source
   * must comply to this schema
   */
  _getSchema(): any {
    return;
  }

  async validate(ctx, updates = undefined): Promise<boolean> {
    let schema = this._getSchema();
    if (!schema) {
      return true;
    }
    if (updates) {
      this.load(updates);
    }
    if (!ctx._webda.validate(this, schema)) {
      throw Error(ctx._webda.validationLastErrors());
    }
    return true;
  }

  generateUid(object: any = undefined): string {
    return uuid.v4().toString();
  }

  _jsonFilter(key, value): any {
    if (key[0] === "_" && key.length > 1 && key[1] === "_") {
      return undefined;
    }
    return value;
  }

  toStoredJSON(stringify = false): any {
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
   * Get a service
   *
   * @param service to retrieve
   * WARNING: Only object attached to a store can retrieve service
   */
  getService(service): any {
    if (!this.__store) {
      return undefined;
    }
    return this.__store.getService(service);
  }

  /**
   * Get a pre typed service
   *
   * @param service to retrieve
   * WARNING: Only object attached to a store can retrieve service
   */
  getTypedService<T extends Service>(service): T {
    if (!this.__store) {
      return undefined;
    }
    return <T>this.__store.getService(service);
  }

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

  toJSON(): any {
    return this._toJSON(false);
  }

  async _onDelete() {}
  async _onDeleted() {}
  async _onGet() {}
  async _onSave() {}
  async _onSaved() {}
  async _onUpdate(updates: any) {}
  async _onUpdated() {}
}

export { CoreModel, CoreModelDefinition };
