import util from "util";
import { v4 as uuidv4 } from "uuid";
import { Core } from "../core";
import { DeepPartial, Service } from "../services/service";
import { Store } from "../stores/store";
import { OperationContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { Throttler } from "../utils/throttler";
import { ModelActions, ModelLink, ModelLinksArray, ModelLinksMap, ModelLinksSimpleArray } from "./relations";

/**
 * Create a new type with only optional
 */
export type ModelPartial<T> = {
  [P in keyof T]?: T[P] extends ModelLinksSimpleArray<CoreModel>
    ? Partial<T[P]>
    : T[P] extends ModelLinksMap<CoreModel>
    ? Partial<T[P]>
    : T[P] extends ModelLinksArray<CoreModel>
    ? Partial<T[P]>
    : T[P] extends ModelLink<CoreModel>
    ? Partial<T[P]>
    : T[P] extends object
    ? DeepPartial<T[P]>
    : T[P];
};

/**
 * Expose the model through API or GraphQL if it exists
 * @returns
 */
export function Expose(
  segment?: string,
  restrict?: {
    create?: boolean;
    update?: boolean;
    list?: boolean;
    get?: boolean;
    delete?: boolean;
  }
) {
  return function (target: any): void {
    segment ??= target.constructor.name.toLowerCase();
    // @ts-ignore
    target.Expose ??= {
      segment,
      restrict
    };
  };
}

class CoreModelQuery {
  @NotEnumerable
  private type: string;
  @NotEnumerable
  private model: CoreModel;
  @NotEnumerable
  private attribute: string;

  constructor(type: string, model: CoreModel, attribute: string) {
    this.attribute = attribute;
    this.type = type;
    this.model = model;
  }
  /**
   * Query the object
   * @param query
   * @returns
   */
  query(
    query?: string,
    context?: OperationContext
  ): Promise<{
    results: CoreModel[];
    continuationToken?: string;
  }> {
    return Core.get().getModelStore(Core.get().getModel(this.type)).query(this.completeQuery(query), context);
  }

  /**
   * Complete the query with condition
   * @param query
   * @returns
   */
  protected completeQuery(query?: string): string {
    query = query ? `(${query}) AND` : "";
    query += ` ${this.attribute} = '${this.model.getUuid()}'`;
    return query;
  }

  /**
   *
   * @param callback
   * @param context
   */
  async forEach(
    callback: (model: any) => Promise<void>,
    query?: string,
    context?: OperationContext,
    parallelism: number = 3
  ) {
    const throttler = new Throttler();
    throttler.setConcurrency(parallelism);
    let continuationToken: string | undefined;
    do {
      const result = await this.query(query + continuationToken ? "OFFSET " + continuationToken : "", context);
      continuationToken = result.continuationToken;
      for (const model of result.results) {
        throttler.queue(() => callback(model));
      }
      await throttler.waitForCompletion();
    } while (continuationToken);
  }

  /**
   * Get all objects linked
   * @param context
   * @returns
   */
  async getAll(query?: string, context?: OperationContext) {
    return Core.get().getModelStore(Core.get().getModel(this.type)).queryAll(this.completeQuery(query), context);
  }
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
  factory(model: new () => T, object: any, context?: OperationContext): T;
  getActions(): { [key: string]: ModelAction };
  store(): Store<T>;
  getUuidField(): string;
  getLastUpdateField(): string;
  getCreationField(): string;
  getPermissionQuery(context?: OperationContext): null | { partial: boolean; query: string };
}

export type Constructor<T, K extends Array<any> = []> = new (...args: K) => T;

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
   * Type name
   */
  __typeTree: string[];
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
    // Get the type automatically now
    this.__type = Core.get()?.getApplication().getModelFromInstance(this);
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
   * Complete the uid with prefix if any
   *
   * Useful when object are stored with a prefix for full uuid
   * @param uid
   * @returns
   */
  static completeUid(uid: string): string {
    return uid;
  }

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static ref<T extends CoreModel>(
    this: Constructor<T>,
    uid: string
  ): {
    exists: () => Promise<boolean>;
    /**
     * Load a model from the known store
     *
     * @param this the class from which the static is called
     * @param id of the object to load
     * @param defaultValue if object not found return a default object
     * @param context to set on the object
     * @returns
     */
    get: (defaultValue?: Partial<T>, context?: OperationContext) => Promise<T>;
    delete: () => Promise<void>;
    incrementAttributes: (
      info: {
        property: FilterKeys<T, number>;
        value: number;
      }[]
    ) => Promise<void | any[]>;
    removeAttribute(attribute: keyof T, itemWriteCondition?: any, itemWriteConditionField?: keyof T): Promise<void>;
    setAttribute(attribute: keyof T, value: any): Promise<void>;
    conditionalPatch(updates: Partial<T>, conditionField: any, condition: any): Promise<boolean>;
    patch(updates: Partial<T>): Promise<boolean>;
    upsertItemToCollection(
      prop: FilterKeys<T, any[]>,
      item: any,
      index?: number,
      itemWriteCondition?: any,
      itemWriteConditionField?: string
    ): Promise<void>;
    deleteItemFromCollection(
      prop: FilterKeys<T, any[]>,
      index: number,
      itemWriteCondition: any,
      itemWriteConditionField?: string
    ): Promise<void>;
  } {
    const store = <Store<T>>Core.get().getModelStore(this);
    // @ts-ignore
    uid = this.completeUid(uid);
    return {
      deleteItemFromCollection: (
        prop: FilterKeys<T, any[]>,
        index: number,
        itemWriteCondition: any,
        itemWriteConditionField?: string
      ) => store.deleteItemFromCollection(uid, prop, index, itemWriteCondition, itemWriteConditionField),
      upsertItemToCollection: (
        prop: FilterKeys<T, any[]>,
        item: any,
        index?: number,
        itemWriteCondition?: any,
        itemWriteConditionField?: string
      ) => store.upsertItemToCollection(uid, prop, item, index, itemWriteCondition, itemWriteConditionField),
      exists: () => store.exists(uid),
      get: async (defaultValue?: Partial<T>, context?: OperationContext) => {
        return (await store.get(uid, context)) || new this().load(defaultValue).setUuid(uid);
      },
      delete: () => store.delete(uid),
      conditionalPatch: (updates: Partial<T>, conditionField: any, condition: any) =>
        store.conditionalPatch(uid, updates, conditionField, condition),
      patch: (updates: Partial<T>) => store.conditionalPatch(uid, updates, null, undefined),
      setAttribute: (attribute: keyof T, value: any) => store.setAttribute(uid, attribute, value),
      removeAttribute: (attribute: keyof T, itemWriteCondition?: any, itemWriteConditionField?: keyof T) =>
        store.removeAttribute(uid, attribute, itemWriteCondition, itemWriteConditionField),
      incrementAttributes: (
        info: {
          property: FilterKeys<T, number>;
          value: number;
        }[]
      ) => store.incrementAttributes(uid, info)
    };
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
  static getPermissionQuery(_ctx: OperationContext): null | { partial: boolean; query: string } {
    return null;
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    _ctx: OperationContext,
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
   * Return a unique reference within the application to the object
   *
   * It contains the Store containing it
   * @returns
   */
  getFullUuid() {
    return `${this.__type.replace(/\//, "-")}$${this.getUuid()}`;
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
    const [model, uuid] = fullUuid.split("$");
    let modelObject = core.getApplication().getModel(model.replace("-", "/"));
    if (partials) {
      return <T>new modelObject().load(partials, true).setUuid(uuid);
    }
    return <Promise<T>>new modelObject().setUuid(uuid).get();
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
  load(raw: ModelPartial<this>, secure: boolean = false): this {
    // Object assign with filter
    for (let prop in raw) {
      let val = raw[prop];
      if (!secure) {
        val = this.attributePermission(prop, raw[prop], "WRITE");
        if (val === undefined) {
          continue;
        }
      }
      // @ts-ignore
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
      this[attr] ??= {};
      if (typeof this[attr] === "string") {
        this[attr] = new String(this[attr]);
      }
      this[attr].get = async () => {
        return Core.get().getModelStore(Core.get().getModel(model)).get(this[attr]);
      };
      this[attr].set = value => {
        if (typeof value === "string") {
          value = new String(value);
        }
        this[attr] = value;
        addLoader(attr, model);
      };
    };

    const addMapLoader = (attr: string, model) => {
      this[attr] ??= [];
      this[attr].forEach(el => {
        el.get = async () => {
          return Core.get().getModelStore(Core.get().getModel(model)).get(el.uuid);
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
      this[attr].add = value => {
        if (type === "LINKS_ARRAY") {
          value.uuid ??= value.getUuid();
        }
        if (typeof value === "string") {
          value = new String(value);
        }
        value.get = async () => {
          return Core.get()
            .getModelStore(Core.get().getModel(model))
            .get(type !== "LINKS_SIMPLE_ARRAY" ? value.uuid || value.getUuid() : value);
        };
        if (Array.isArray(this[attr])) {
          this[attr].push(value);
        } else {
          this[attr][value.uuid || value.getUuid()] = value;
        }
      };
      // Remove an item from the collection
      this[attr].remove = (uuid: string | { getUuid: () => string }) => {
        if (uuid instanceof Object) {
          uuid = uuid.getUuid();
        }
        if (Array.isArray(this[attr])) {
          this[attr].splice(
            this[attr].findIndex(el => el.uuid !== uuid),
            1
          );
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
      this[query.attribute] = new CoreModelQuery(query.model, this, query.targetAttribute);
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
    return <any>this.__ctx || OperationContext.getGlobalContext();
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
    return this.__store.delete(this.getUuid());
  }

  /**
   * Patch current object with this update
   * @param obj
   * @param conditionField if null no condition used otherwise fallback to lastUpdate
   * @param conditionValue
   */
  async patch(obj: Partial<this>, conditionField?: keyof this | null, conditionValue?: any) {
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
  async validate(ctx: OperationContext, updates: any, ignoreRequired: boolean = false): Promise<boolean> {
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
