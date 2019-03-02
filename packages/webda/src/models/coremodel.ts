"use strict";
const uuid = require("uuid");
import { OwnerPolicy } from "../policies/ownerpolicy";
import { Context } from "../utils/context";

interface CoreModelDefinition {
  new (): CoreModel;
  getActions(): any;
}

/**
 * First basic model for Ident
 * Will evolve with version 0.2 and Model addition
 *
 * @class
 */
class CoreModel extends OwnerPolicy {
  static __ctx: Context;
  __store: any;
  _creationDate: Date;
  lastUpdate: Date;
  _lastUpdate: Date;
  __deleted: boolean;

  static getActions() {
    return {};
  }

  getAvailableActions() {
    return {};
  }

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
    let obj = await this.__store.update(changes, this.uuid);
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
      return JSON.stringify(obj);
    }
    return obj;
  }

  _getService(service): any {
    if (!this.__store) {
      return undefined;
    }
    return this.__store.getService(service);
  }

  _toJSON(secure): any {
    let obj: any = {};
    for (let i in this) {
      let value = this[i];
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
