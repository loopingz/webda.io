import util from "util";
import { v4 as uuidv4 } from "uuid";
import { Core } from "../core";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { Context, OperationContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { ModelActions } from "./relations";

export function Expose() {
  return function (target: any, propertyKey: string) {
    Object.defineProperty(target, propertyKey, {
      set(value) {
        Object.defineProperty(this, propertyKey, {
          value,
          writable: true,
          configurable: true
        });
      },
      configurable: true
    });
  };
}

class CoreModelQuery {
  constructor(private type: string, private model: string) {}
  /**
   * Query the object
   * @param query
   * @returns
   */
  query(query?: string): Promise<CoreModel[]> {
    return null;
  }

  async forEach() {}

  async getAll() {}
}

/**
 * Filter type keys by type
 */
export type FilterKeys<T extends CoreModel, K> = {
  [L in keyof T]: T[L] extends K ? L : never;
}[keyof T];

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

export interface CoreModelDefinition<T extends CoreModel = CoreModel> {
  new (): T;
  /**
   * Create a CoreModel object loaded with the content of object
   *
   * It allows polymorphism from Store
   *
   * @param model to create by default
   * @param object to load data from
   * @param context if the data is unsafe from http
   */
  factory(model: new () => T, object: any, context?: Context): T;
  getActions(): { [key: string]: ModelAction };
  getUuidField(): string;
  getLastUpdateField(): string;
  getCreationField(): string;
  getPermissionQuery(context?: Context): null | { partial: boolean; query: string };
}

export type Constructor<T, K extends Array<any> = []> = new (...args: K) => T;

/**
 * Sent if action required attached CoreModel is trigger
 * A Model cannot be detached anymore
 *
 * @deprecated
 */
export class CoreModelUnattachedError extends Error {
  constructor() {
    super("No store linked to this object");
  }
}

/**
 * Make a property hidden from json
 * @param target
 * @param propertyKey
 */
export function NotEnumerable(target: any, propertyKey: string) {
  Object.defineProperty(target, propertyKey, {
    set(value) {
      Object.defineProperty(this, propertyKey, {
        value,
        writable: true,
        configurable: true
      });
    },
    configurable: true
  });
}

const ActionsAnnotated: Map<any, ModelActions> = new Map();
/**
 * Define an object method as an action
 * @param target
 * @param propertyKey
 */
export function Action(options: { methods?: HttpMethodType[]; openapi?: any } = {}) {
  return function (target: any, propertyKey: string) {
    let custom: Record<"Actions", ModelActions> = target;
    const global = typeof target === "function";
    if (!global) {
      custom = target.constructor;
    }
    if (!ActionsAnnotated.has(custom)) {
      ActionsAnnotated.set(custom, {});
    }
    const actions = ActionsAnnotated.get(custom);
    actions[propertyKey] = {
      ...options,
      global
    };
  };
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
  /**
   * Class reference to the object
   */
  @NotEnumerable
  __class: CoreModelDefinition;
  /**
   * Type name
   */
  __type: string;
  /**
   * Object context
   *
   * @TJS-ignore
   */
  @NotEnumerable
  __ctx: OperationContext;
  /**
   * If object is attached to its store
   *
   * @TJS-ignore
   */
  @NotEnumerable
  __store: Store<this>;

  @NotEnumerable
  __dirty: Set<string | symbol> = new Set();

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
    // Get the store automatically now
    this.__store = <Store<this>>Core.get()?.getModelStore(this);
  }

  /**
   * Get Store for this model
   * @param this
   * @returns
   */
  static store<T extends CoreModel>(this: Constructor<T>): Store<T> {
    if (!Core.get()) {
      throw new Error("Webda not initialized");
    }
    return <Store<T>>Core.get().getModelStore(this);
  }

  /**
   * Unflat an object
   * @param data
   * @param split
   * @returns
   */
  static unflat<T = any>(data: any, split: string = "#"): T {
    const res: any = {};
    for (let i in data) {
      const attrs = i.split(split);
      let attr = attrs.shift();
      let cur = res;
      while (attr) {
        if (attrs.length) {
          cur[attr] ??= {};
          cur = cur[attr];
        } else {
          cur[attr] = data[i];
        }
        attr = attrs.shift();
      }
    }
    return res;
  }

  /**
   * Create subobject for a model
   *
   * Useful for counters
   *
   * @param split
   * @returns
   */
  unflat<T>(split: string = "#"): T {
    return CoreModel.unflat(this, split);
  }

  /**
   * Flat an object into another
   *
   * {
   *    a: {
   *      b: 1
   *    },
   *    c: 1
   * }
   *
   * become
   *
   * {
   *    "a#b": 1
   *    "c": 1
   * }
   *
   * @param target
   * @param data
   * @param split
   * @param prefix
   */
  static flat(target: any, data: any, split: string = "#", prefix: string = ""): any {
    for (let i in data) {
      if (typeof data[i] === "object") {
        CoreModel.flat(target, data[i], split, i + split);
      } else {
        target[prefix + i] = data[i];
      }
    }
  }

  /**
   * Query for models
   * @param this
   * @param id
   * @returns
   */
  static async query<T extends CoreModel>(
    this: Constructor<T>,
    query: string
  ): Promise<{
    results: T[];
    continuationToken?: string;
  }> {
    // @ts-ignore
    return <any>this.store().query(query);
  }

  /**
   * Return a proxy to the object to detect if dirty
   * @returns
   */
  getProxy(): this {
    const subProxier = prop => {
      return {
        set: (target: this, p: string | symbol, value) => {
          this.__dirty.add(prop);
          target[p] = value;
          return true;
        },
        get: (target: this, p: string | symbol) => {
          if (Array.isArray(target[p]) || target[p] instanceof Object) {
            return new Proxy(target[p], subProxier(prop));
          }
          return target[p];
        },
        deleteProperty: (t, property) => {
          delete t[property];
          this.__dirty.add(prop);
          return true;
        }
      };
    };
    const proxier = {
      deleteProperty: (t, property) => {
        delete t[property];
        this.__dirty.add(property);
        return true;
      },
      set: (target: this, p: string | symbol, value) => {
        if (p !== "__dirty") {
          target.__dirty.add(p);
        }
        target[p] = value;
        return true;
      },
      get: (target: this, p: string | symbol) => {
        if (typeof p === "string" && p.startsWith("__")) {
          return target[p];
        }
        if (Array.isArray(target[p]) || target[p] instanceof Object) {
          return new Proxy(target[p], subProxier(p));
        }
        return target[p];
      }
    };
    return new Proxy(this, proxier);
  }

  /**
   * Return true if needs a save
   * @returns
   */
  isDirty(): boolean {
    return this.__dirty.size > 0;
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
  setUuid(uuid: string, target = this): this {
    target[this.__class.getUuidField()] = uuid;
    return target;
  }

  /**
   * Get actions callable on an object
   *
   * This will expose them by the Store with /storeUrl/{uuid}/{action}
   */
  static getActions<T>(this: Constructor<T>): ModelActions {
    const actions = [];
    // Explore all parent classes to collect all known actions
    let clazz = this;
    // @ts-ignore
    while (clazz !== CoreModel) {
      if (ActionsAnnotated.has(clazz)) {
        actions.push(ActionsAnnotated.get(clazz));
      }
      clazz = Object.getPrototypeOf(clazz);
    }
    return actions.reduce((v, c) => ({ ...v, ...c }), {});
  }

  /**
   * Return the expressable query for permission
   *
   * @param context of the query
   * @returns
   */
  static getPermissionQuery(_ctx: Context): null | { partial: boolean; query: string } {
    return null;
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
      | "subscribe" // To manage MQTT or Websockets
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
   * Create an object
   * @returns
   */
  static factory(model: new () => CoreModel, object: any, context?: OperationContext): CoreModel {
    return new model().setContext(context).load(object, context === undefined);
  }

  /**
   * Detect what looks like a CoreModel but can be from different version
   * @param object
   * @returns
   */
  static instanceOf(object: any): boolean {
    return (
      typeof object.toStoredJSON === "function" && object.__class && object.__class.factory && object.__class.instanceOf
    );
  }

  /**
   * Return if an object is attached to its store
   * @deprecated Will be removed in 3.0
   */
  isAttached(): boolean {
    return this.__store !== undefined;
  }

  /**
   * Attach an object to a store instance
   * @deprecated Will be removed in 3.0
   */
  attach(store: Store<this>): this {
    this.__store = store;
    return this;
  }

  /**
   * Return a unique reference within the application to the object
   *
   * It contains the Store containing it
   * @returns
   */
  getFullUuid() {
    if (!this.isAttached()) {
      throw new Error("Cannot return full uuid of unattached object");
    }
    return `${this.__store.getName()}$${this.getUuid()}`;
  }

  /**
   * Get an object from the full uuid
   * @param core
   * @param fullUuid
   * @param partials
   * @returns
   */
  static async fromFullUuid<T extends CoreModel = CoreModel>(
    fullUuid: string,
    core: Core = Core.get(),
    partials?: any
  ): Promise<T> {
    const [store, uuid] = fullUuid.split("$");
    let service = core.getService<Store<T>>(store);
    if (partials) {
      return service?.newModel(partials).setUuid(uuid);
    }
    return service?.get(uuid);
  }

  /**
   * Remove all the attribute starting with __
   * @param key
   * @param value
   * @returns
   *
   * @deprecated
   */
  _jsonFilter(key, value): any {
    if (key[0] === "_" && key.length > 1 && key[1] === "_") {
      return undefined;
    }
    return value;
  }

  /**
   * Allow to define custom permission per attribute
   *
   * This method allows you to do permission based attribute
   * But also a mask destructive attribute
   *
   * @param key
   * @param value
   * @param mode
   * @param context
   * @returns updated value
   */
  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: OperationContext): any {
    if (mode === "WRITE") {
      return key.startsWith("_") ? undefined : value;
    } else {
      // Will be replaced by this !key.startsWith("__") in 3.0.0
      return this._jsonFilter(key, value);
    }
  }

  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: Partial<this>, secure: boolean = false): this {
    // Object assign with filter
    for (let prop in raw) {
      let val = raw[prop];
      if (!secure) {
        val = this.attributePermission(prop, raw[prop], "WRITE");
        if (val === undefined) {
          continue;
        }
      }
      this[prop] = val;
    }
    if (this._creationDate) {
      this._creationDate = new Date(this._creationDate);
    }
    if (this._lastUpdate) {
      this._lastUpdate = new Date(this._lastUpdate);
    }

    if (!this.getUuid()) {
      this.setUuid(this.generateUid(raw));
    }

    this.handleRelations();
    return this;
  }

  /**
   * Patch every attribute that is based on a relation
   * to add all the helpers
   */
  protected handleRelations() {
    // Get relation
    const addLoader = (attr: string, model) => {
      if (!this[attr]) {
        return;
      }
      this[attr].get = async () => {
        return Core.get().getModelStore(model).get(attr);
      };
      this[attr].set = value => {
        this[attr] = value;
        addLoader(attr, model);
      };
    };

    const addMapLoader = (attr: string, model) => {
      this[attr] ??= [];
      this[attr].forEach(el => {
        el.get = async () => {
          return Core.get().getModelStore(model).get(el);
        };
      });
    };

    const addCollectionLoader = (type: "LINKS_ARRAY" | "LINKS_SIMPLE_ARRAY" | "LINKS_MAP", attr: string, model) => {
      if (type === "LINKS_MAP") {
        this[attr] ??= {};
      } else {
        this[attr] ??= [];
      }

      // Add an item to the collection
      this[attr].add = async value => {
        value.uuid ??= value.getUuid();
        value.get = async () => {
          return Core.get().getModelStore(model).get(value.uuid);
        };
        if (Array.isArray(this[attr])) {
          this[attr].push(value);
        } else {
          this[attr][value.uuid] = value;
        }
      };
      // Remove an item from the collection
      this[attr].remove = async (uuid: string) => {
        if (Array.isArray(this[attr])) {
          this[attr] = this[attr].filter(el => el.uuid !== uuid);
        } else {
          delete this[attr][uuid];
        }
      };
    };

    const rel = Core.get()
      .getApplication()
      .getRelations(<any>this);
    for (let link of rel.links || []) {
      if (link.type === "LINK") {
        addLoader(link.attribute, link.model);
      } else if (link.type.startsWith("LINKS_")) {
        addCollectionLoader(link.type, link.attribute, link.model);
      }
    }
    for (let link of rel.maps || []) {
      addMapLoader(link.attribute, link.model);
    }
    for (let query of rel.queries || []) {
      this[query.attribute] = new CoreModelQuery(query.model, this.getUuid());
    }
    if (rel.parent) {
      addLoader(rel.parent.attribute, rel.parent.model);
    }
  }

  /**
   * Context of the request
   */
  setContext(ctx: OperationContext): this {
    this.__ctx = ctx;
    return this;
  }

  /**
   * Get object context
   *
   * Global object does not belong to a request
   */
  getContext<T extends OperationContext>(): T {
    return <any>this.__ctx || Context.getGlobalContext();
  }

  /**
   * Return the object registered store
   */
  getStore(): Store<this> {
    return this.__store;
  }

  /**
   * Get the object
   * @returns
   */
  async get(): Promise<this> {
    return this.refresh();
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
      Object.assign(this, obj);
      for (let i in this) {
        // @ts-ignore
        if (obj[i] !== this[i]) {
          delete this[i];
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
   * Load a model from the known store
   *
   * @param this the class from which the static is called
   * @param id of the object to load
   * @param defaultValue if object not found return a default object
   * @param context to set on the object
   * @returns
   */
  static async get<T>(
    this: Constructor<T>,
    id: string,
    defaultValue?: Partial<T>,
    context?: OperationContext
  ): Promise<T> {
    // @ts-ignore
    return <any>this.store(this).get(id, context, defaultValue);
  }

  /**
   * Patch current object with this update
   * @param obj
   * @param conditionField if null no condition used otherwise fallback to lastUpdate
   * @param conditionValue
   */
  async patch(obj: Partial<this>, conditionField?: keyof this | null, conditionValue?: any) {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    await this.__store.patch(
      { [this.__class.getUuidField()]: this.getUuid(), ...obj },
      true,
      conditionField,
      conditionValue
    );
    Object.assign(this, obj);
  }

  /**
   * Save this object
   *
   * @throws Error if the object is not coming from a store
   */
  async save(full?: boolean | keyof this, ...args: (keyof this)[]): Promise<this> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    // If proxy is not used and not field specified call save
    if ((!util.types.isProxy(this) && full === undefined) || full === true) {
      if (!this._creationDate || !this._lastUpdate) {
        await this.__store.create(this, this.getContext());
      } else {
        await this.__store.update(this);
      }
      return this;
    }
    const patch: any = {
      [this.__class.getUuidField()]: this.getUuid()
    };
    if (typeof full === "string") {
      [full, ...args].forEach(k => {
        patch[k] = this[k];
      });
    } else {
      for (let entry of this.__dirty.entries()) {
        patch[entry[0]] = this[entry[0]];
      }
    }
    await this.__store.patch(patch);
    this.__dirty.clear();
    return this;
  }

  /**
   * Validate objet modification
   *
   * @param ctx
   * @param updates
   */
  async validate(ctx: Context, updates: any, ignoreRequired: boolean = false): Promise<boolean> {
    ctx.getWebda().validateSchema(this, updates, ignoreRequired);
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
   * Return the object to be serialized without the __store
   *
   * @param stringify
   * @returns
   */
  toStoredJSON(stringify = false): any | string {
    let obj = this._toJSON(true);
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
      if (!secure) {
        value = this.attributePermission(i, value, "READ");
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
