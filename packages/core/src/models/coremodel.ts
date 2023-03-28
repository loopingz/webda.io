import { JSONSchema7 } from "json-schema";
import util from "util";
import { v4 as uuidv4 } from "uuid";
import { ModelGraph } from "../application";
import { Core } from "../core";
import { WebdaError } from "../errors";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { OperationContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { Throttler } from "../utils/throttler";
import { createModelLinksMap, ModelActions, ModelLinksArray, ModelLinksSimpleArray, RawModel } from "./relations";

/**
 * Expose the model through API or GraphQL if it exists
 * The model will be exposed using its class name + 's'
 * If you need to have a specific plural, use the annotation WebdaPlural
 *  to define the plural name
 *
 * @returns
 */
export function Expose(params: Partial<ExposeParameters> = {}) {
  return function (target: CoreModelDefinition): void {
    params.restrict ??= {};
    target.Expose = <ExposeParameters>params;
  };
}

/**
 *
 */
class CoreModelQuery {
  @NotEnumerable
  private type: string;
  @NotEnumerable
  private model: CoreModel;
  @NotEnumerable
  private attribute: string;
  @NotEnumerable
  private targetModel: CoreModelDefinition;

  constructor(type: string, model: CoreModel, attribute: string) {
    this.attribute = attribute;
    this.type = type;
    this.model = model;
  }

  /**
   * Retrieve target model definition
   * @returns
   */
  getTargetModel(): CoreModelDefinition {
    this.targetModel ??= Core.get().getModel(this.type);
    return this.targetModel;
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
    return this.getTargetModel().query(this.completeQuery(query), true, context);
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
    return Core.get().getModelStore(this.getTargetModel()).queryAll(this.completeQuery(query), context);
  }
}

/**
 * Filter type keys by type
 */
export type FilterKeys<T extends CoreModel, K> = {
  [L in keyof T]: T[L] extends K ? L : never;
}[keyof T];

/**
 * Define an Action on a model
 *
 * It is basically a method designed to be called by the API or external
 * systems
 */
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

/**
 * Expose parameters for the model
 */
export interface ExposeParameters {
  /**
   * If model have parent but you still want it to be exposed as root
   * in domain-like service: DomainService, GraphQL
   *
   * It would create alias for the model in the root too
   */
  root?: boolean;
  /**
   * You can select to not expose some methods like create, update, delete, get, query
   */
  restrict: {
    /**
     * Create a new object
     */
    create?: boolean;
    /**
     * Update an existing object
     *
     * Includes PUT and PATCH
     */
    update?: boolean;
    /**
     * Query the object
     */
    query?: boolean;
    /**
     * Get a single object
     */
    get?: boolean;
    /**
     * Delete an object
     */
    delete?: boolean;
    /**
     * Do not create operations for the model
     */
    operation?: boolean;
  };
}

/**
 *
 */
export interface CoreModelDefinition<T extends CoreModel = CoreModel> {
  new (): T;
  /**
   * If the model have some Expose annotation
   */
  Expose?: ExposeParameters;
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
  getSchema(): JSONSchema7;
  /**
   * Get Model identifier
   */
  getIdentifier(short?: boolean): string;
  /**
   * Get the model hierarchy
   *
   * Ancestors will contain every model it inherits from
   * Children will contain every model that inherits from this model in a tree structure
   */
  getHierarchy(): {
    ancestors: string[];
    children: ModelGraph;
  };
  completeUid(uid: string): string;
  getUuidField(): string;
  getLastUpdateField(): string;
  getCreationField(): string;
  getPermissionQuery(context?: OperationContext): null | { partial: boolean; query: string };
  /**
   * Reference to an object without doing a DB request yet
   */
  ref: typeof CoreModel.ref;
  /**
   * Create a new model
   * @param this
   * @param data
   */
  create<T extends CoreModel>(this: Constructor<T>, data: RawModel<T>): Promise<T>;
  /**
   * Query the model
   * @param query
   */
  query(
    query?: string,
    includeSubclass?: boolean,
    context?: OperationContext
  ): Promise<{ results: T[]; continuationToken?: string }>;
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

export class ModelRef<T extends CoreModel> {
  @NotEnumerable
  protected store: Store<T>;
  @NotEnumerable
  protected model: CoreModelDefinition<T>;

  constructor(protected uuid: string, model: CoreModelDefinition<T>) {
    this.model = model;
    this.uuid = uuid === "" ? undefined : model.completeUid(uuid);
    this.store = Core.get().getModelStore(model);
  }
  async get(): Promise<T> {
    return this.store.get(this.uuid);
  }
  set(id: string | T) {
    this.uuid = id instanceof CoreModel ? id.getUuid() : id;
  }
  toString(): string {
    return this.uuid;
  }
  toJSON(): string {
    return this.uuid;
  }
  getUuid(): string {
    return this.uuid;
  }
  deleteItemFromCollection(
    prop: FilterKeys<T, any[]>,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField?: string
  ): Promise<void> {
    return this.store.deleteItemFromCollection(this.uuid, prop, index, itemWriteCondition, itemWriteConditionField);
  }
  upsertItemToCollection(
    prop: FilterKeys<T, any[]>,
    item: any,
    index?: number,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ) {
    return this.store.upsertItemToCollection(this.uuid, prop, item, index, itemWriteCondition, itemWriteConditionField);
  }
  exists(): Promise<boolean> {
    return this.store.exists(this.uuid);
  }
  delete(): Promise<void> {
    return this.store.delete(this.uuid);
  }
  conditionalPatch(updates: Partial<T>, conditionField: any, condition: any): Promise<boolean> {
    return this.store.conditionalPatch(this.uuid, updates, conditionField, condition);
  }
  patch(updates: Partial<T>): Promise<boolean> {
    return this.store.conditionalPatch(this.uuid, updates, null, undefined);
  }
  setAttribute(attribute: keyof T, value: any): Promise<void> {
    return this.store.setAttribute(this.uuid, attribute, value);
  }
  removeAttribute(attribute: keyof T, itemWriteCondition?: any, itemWriteConditionField?: keyof T): Promise<void> {
    return this.store.removeAttribute(this.uuid, attribute, itemWriteCondition, itemWriteConditionField);
  }
  incrementAttributes(
    info: {
      property: FilterKeys<T, number>;
      value: number;
    }[]
  ): Promise<any[]> {
    return this.store.incrementAttributes(this.uuid, info);
  }
}

export class ModelRefWithCreate<T extends CoreModel> extends ModelRef<T> {
  /**
   * Allow to create a model
   * @param defaultValue
   * @param context
   * @param withSave
   * @returns
   */
  async create(defaultValue: RawModel<T>, context?: OperationContext, withSave: boolean = true): Promise<T> {
    let result = new this.model().setContext(context).load(defaultValue, true).setUuid(this.uuid);
    if (withSave) {
      await result.save();
    }
    return result;
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
  async getOrCreate(defaultValue: RawModel<T>, context?: OperationContext, withSave: boolean = true): Promise<T> {
    return (await this.get()) || this.create(defaultValue, context, withSave);
  }
}

export class ModelRefCustom<T extends CoreModel> extends ModelRef<T> {
  constructor(public uuid: string, model: CoreModelDefinition<T>, data: any) {
    super(uuid, model);
    Object.assign(this, data);
  }

  toJSON(): any {
    return this;
  }
  getUuid(): string {
    return this.uuid;
  }
}

export type ModelRefCustomProperties<T extends CoreModel, K> = ModelRefCustom<T> & K;

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
   * Types name
   */
  __types: string[];
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
    this.__store = <Store<this>>Core.get()?.getModelStore(new.target);
    // Get the type automatically now
    this.__type = Core.get()?.getApplication().getShortId(Core.get()?.getApplication().getModelFromInstance(this));
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
    return Core.get().getModelStore(this);
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
   * Return the known schema
   * @returns
   */
  static getSchema() {
    const app = Core.get()?.getApplication();
    return app?.getSchema(app.getModelFromConstructor(this));
  }

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static ref<T extends CoreModel>(this: Constructor<T>, uid: string): ModelRefWithCreate<T> {
    return new ModelRefWithCreate(uid, <CoreModelDefinition<T>>this);
  }

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static create<T extends CoreModel>(this: Constructor<T>, data: RawModel<T>): Promise<T> {
    return new this().load(data, true).save();
  }

  /**
   * Get identifier for this model
   * @returns
   */
  static getIdentifier(short: boolean = true): string {
    const res = Core.get().getApplication().getModelName(this);
    if (short) {
      return Core.get().getApplication().getShortId(res);
    } else {
      return res;
    }
  }

  /**
   * Get hierarchy for this model
   * @returns
   */
  static getHierarchy(): {
    ancestors: string[];
    children: ModelGraph;
  } {
    return Core.get().getApplication().getModelHierarchy(this);
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
    query: string = "",
    includeSubclass: boolean = true,
    context?: OperationContext
  ): Promise<{
    results: T[];
    continuationToken?: string;
  }> {
    if (!query.includes("__type")) {
      if (query.trim() !== "") {
        query = ` AND ${query}`;
      }
      const app = Core.get().getApplication();
      const name = app.getShortId(app.getModelName(this));
      if (includeSubclass) {
        query = `__types CONTAINS "${name}"${query}`;
      } else {
        query = `__type = "${name}"${query}`;
      }
    }
    // @ts-ignore
    return <any>this.store().query(query, context);
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

  async checkAct(
    ctx: OperationContext,
    action:
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
  ) {
    let msg = await this.canAct(ctx, action);
    if (msg !== true) {
      throw new WebdaError.Forbidden(msg === false ? "No permission" : msg);
    }
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    ctx: OperationContext,
    action:
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
  ): Promise<string | boolean> {
    return "This model does not support any action: override checkAct";
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
      return !key.startsWith("__") ? value : undefined;
    }
  }

  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: RawModel<this>, secure: boolean = false): this {
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
    const addMapLoader = (attr: string, model) => {
      this[attr] ??= [];
      this[attr].forEach(el => {
        el.get = async () => {
          return Core.get().getModelStore(Core.get().getModel(model)).get(el.uuid);
        };
      });
    };

    const rel =
      Core.get()
        ?.getApplication()
        ?.getRelations(<any>this) || {};
    for (let link of rel.links || []) {
      const model = Core.get().getModel(link.model);
      if (link.type === "LINK") {
        this[link.attribute] ??= "";
        if (typeof this[link.attribute] === "string") {
          this[link.attribute] = new ModelRef(this[link.attribute], model);
        }
      } else if (link.type === "LINKS_ARRAY") {
        this[link.attribute] = new ModelLinksArray(model, this[link.attribute]);
      } else if (link.type === "LINKS_SIMPLE_ARRAY") {
        this[link.attribute] = new ModelLinksSimpleArray(model, this[link.attribute]);
      } else if (link.type === "LINKS_MAP") {
        this[link.attribute] = createModelLinksMap(model, this[link.attribute]);
      }
    }
    for (let link of rel.maps || []) {
      addMapLoader(link.attribute, link.model);
    }
    for (let query of rel.queries || []) {
      this[query.attribute] = new CoreModelQuery(query.model, this, query.targetAttribute);
    }
    if (rel.parent) {
      this[rel.parent.attribute] ??= "";
      if (typeof this[rel.parent.attribute] === "string") {
        this[rel.parent.attribute] = new ModelRef(this[rel.parent.attribute], Core.get().getModel(rel.parent.model));
      }
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
    return <any>this.__ctx || Core.get().getGlobalContext();
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
      if (value instanceof ModelRef) {
        obj[i] = value.toString();
      } else {
        obj[i] = value;
      }
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

/**
 * CoreModel with a uuid
 */
class UuidModel extends CoreModel {
  uuid: string;
}

export { CoreModel, UuidModel };
