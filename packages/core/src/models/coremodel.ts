import { EventEmitter } from "events";
import { JSONSchema7 } from "json-schema";
import util from "util";
import { v4 as uuidv4 } from "uuid";
import { ModelGraph, ModelsTree } from "../application";
import { Core, EventEmitterUtils } from "../core";
import { WebdaError } from "../errors";
import { EventService } from "../services/asyncevents";
import { BinariesImpl, Binary } from "../services/binary";
import { Service } from "../services/service";
import { Store, StoreEvents } from "../stores/store";
import { WebdaQL } from "../stores/webdaql/query";
import { OperationContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { Throttler } from "../utils/throttler";
import {
  ModelActions,
  ModelLinksArray,
  ModelLinksSimpleArray,
  ModelMapLoaderImplementation,
  RawModel,
  createModelLinksMap
} from "./relations";

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
export class CoreModelQuery {
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
    return WebdaQL.PrependCondition(query, `${this.attribute} = '${this.model.getUuid()}'`);
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
    for await (const model of this.iterate(query, context)) {
      throttler.execute(() => callback(model));
    }
    return throttler.wait();
  }

  /**
   * Iterate through all
   * @param context
   * @returns
   */
  iterate(query?: string, context?: OperationContext) {
    return Core.get().getModelStore(this.getTargetModel()).iterate(this.completeQuery(query), context);
  }

  /**
   * Get all the objects
   * @returns
   */
  async getAll(context?: OperationContext): Promise<this[]> {
    let res = [];
    for await (const item of this.iterate(this.completeQuery(), context)) {
      res.push(item);
    }
    return res;
  }
}

/**
 * Attribute of an object
 *
 * Filter out methods
 */
export type Attributes<T extends object> = {
  [K in keyof T]: T[K] extends Function ? never : K;
}[keyof T];

/**
 * Filter type keys by type
 */
export type FilterAttributes<T extends CoreModel, K> = {
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
  /**
   * Method of the action
   */
  method?: string;
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
export interface CoreModelDefinition<T extends CoreModel = CoreModel> extends EventEmitter {
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
  factory<T extends CoreModel>(this: Constructor<T>, object: Partial<T>, context?: OperationContext): T;
  /**
   * Get the model actions
   */
  getActions(): { [key: string]: ModelAction };
  /**
   * Get the model store
   */
  store(): Store<T>;
  /**
   * Get the model schema
   */
  getSchema(): JSONSchema7;

  /**
   * Get the model hierarchy
   */
  getHierarchy(): { ancestors: string[]; children: ModelsTree };
  /**
   * Get the model relations
   */
  getRelations(): ModelGraph;
  /**
   * Get Model identifier
   */
  getIdentifier(short?: boolean): string;

  /**
   * Complete uuid useful to implement uuid prefix or suffix
   * @param uid
   */
  completeUid(uid: string): string;
  /**
   * Get the model uuid field if you do not want to use the uuid field
   */
  getUuidField(): string;
  /**
   * Permission query for the model
   * @param context
   */
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
  /**
   * Iterate through objects
   * @param query
   * @param includeSubclass
   * @param context
   */
  iterate(query?: string, includeSubclass?: boolean, context?: OperationContext): AsyncGenerator<T>;
  /**
   * Listen to events on the model
   * @param event
   * @param listener
   * @param async
   */
  on<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    listener: (evt: StoreEvents[Key]) => any,
    async?: boolean
  ): this;
  /**
   * Listen to events on the model asynchronously
   * @param event
   * @param listener
   */
  onAsync<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    listener: (evt: StoreEvents[Key]) => any
  ): this;
  /**
   * Emit an event for this class
   * @param this
   * @param event
   * @param evt
   */
  emit<T extends CoreModel, Key extends keyof StoreEvents>(this: Constructor<T>, event: Key, evt: StoreEvents[Key]);
  /**
   * Emit an event for this class and wait for all listeners to finish
   * @param this
   * @param event
   * @param evt
   */
  emitSync<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    evt: StoreEvents[Key]
  ): Promise<void>;
  /**
   * Return the event on the model that can be listened to by an
   * external authorized source
   * @see authorizeClientEvent
   */
  getClientEvents(): ({ name: string; global?: boolean } | string)[];
  /**
   * Authorize a public event subscription
   * @param event
   * @param context
   */
  authorizeClientEvent(_event: string, _context: OperationContext, _model?: T): boolean;
  /**
   * Iterate through the model
   * @param query
   * @param includeSubclass
   */
  iterate(query?: string, includeSubclass?: boolean): AsyncGenerator<T>;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  addListener(event: string | symbol, listener: (...args: any[]) => void): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  once(event: string | symbol, listener: (...args: any[]) => void): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  removeListener(event: string | symbol, listener: (...args: any[]) => void): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  off(eventName: string | symbol, listener: (...args: any[]) => void): this;
  /**
   * EventEmitter interface
   * @param event
   * @param listener
   */
  removeAllListeners(eventName?): this;
}

export type Constructor<T, K extends Array<any> = []> = new (...args: K) => T;

/**
 * Make a property hidden from json and schema
 *
 * This property will not be saved in the store
 * Nor it will be exposed in the API
 *
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
export function Action(options: { methods?: HttpMethodType[]; openapi?: any; name?: string } = {}) {
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
    actions[options.name || propertyKey] = {
      ...options,
      global,
      method: propertyKey
    };
  };
}

export class ModelRef<T extends CoreModel> {
  @NotEnumerable
  protected store: Store<T>;
  @NotEnumerable
  protected model: CoreModelDefinition<T>;
  @NotEnumerable
  protected parent: CoreModel;

  constructor(
    protected uuid: string,
    model: CoreModelDefinition<T>,
    parent?: CoreModel
  ) {
    this.model = model;
    this.uuid = uuid === "" ? undefined : model.completeUid(uuid);
    this.store = Core.get().getModelStore(model);
  }
  async get(context?: OperationContext): Promise<T> {
    return (await this.store.get(this.uuid))?.setContext(context || this.parent?.getContext());
  }
  set(id: string | T) {
    this.uuid = id instanceof CoreModel ? id.getUuid() : id;
    this.parent?.__dirty.add(Object.keys(this.parent).find(k => this.parent[k] === this));
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
  async deleteItemFromCollection(
    prop: FilterAttributes<T, any[]>,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField?: string
  ): Promise<this> {
    const updateDate = await this.store.deleteItemFromCollection(
      this.uuid,
      prop,
      index,
      itemWriteCondition,
      itemWriteConditionField
    );
    await this.model.emitSync("Store.PartialUpdated", {
      object_id: this.uuid,
      store: this.store,
      updateDate,
      partial_update: {
        deleteItem: {
          property: <string>prop,
          index: index
        }
      }
    });
    return this;
  }
  async upsertItemToCollection(
    prop: FilterAttributes<T, any[]>,
    item: any,
    index?: number,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<this> {
    const updateDate = await this.store.upsertItemToCollection(
      this.uuid,
      prop,
      item,
      index,
      itemWriteCondition,
      itemWriteConditionField
    );
    await this.model.emitSync("Store.PartialUpdated", {
      object_id: this.uuid,
      store: this.store,
      updateDate,
      partial_update: {
        addItem: {
          value: item,
          property: <string>prop,
          index: index
        }
      }
    });
    return this;
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
  async setAttribute(attribute: keyof T, value: any): Promise<this> {
    await this.store.setAttribute(this.uuid, attribute, value);
    return this;
  }
  async removeAttribute(
    attribute: keyof T,
    itemWriteCondition?: any,
    itemWriteConditionField?: keyof T
  ): Promise<this> {
    await this.store.removeAttribute(this.uuid, attribute, itemWriteCondition, itemWriteConditionField);
    await this.model?.emitSync("Store.PartialUpdated", {
      object_id: this.uuid,
      store: this.store,
      partial_update: {
        deleteAttribute: <any>attribute
      }
    });
    return this;
  }
  async incrementAttributes(
    info: {
      property: FilterAttributes<T, number>;
      value: number;
    }[]
  ): Promise<this> {
    const updateDate = await this.store.incrementAttributes(this.uuid, info);
    await this.model.emitSync("Store.PartialUpdated", {
      object_id: this.uuid,
      store: this.store,
      updateDate,
      partial_update: {
        increments: <{ property: string; value: number }[]>info
      }
    });
    return this;
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
  constructor(
    public uuid: string,
    model: CoreModelDefinition<T>,
    data: any,
    parent: CoreModel
  ) {
    super(uuid, model, parent);
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

export const Emitters: WeakMap<Constructor<CoreModel>, EventEmitter> = new WeakMap();

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
  __class: CoreModelDefinition<this>;
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
    this.__class = <CoreModelDefinition<this>>(<any>new.target);
    // Get the store automatically now
    this.__store = <Store<this>>Core.get()?.getModelStore(new.target);
    // Get the type automatically now
    this.__type = process.env.WEBDA_V2_COMPATIBLE
      ? Core.get()?.getApplication().getModelFromInstance(this)
      : Core.get()
          ?.getApplication()
          .getShortId(Core.get()?.getApplication().getModelFromInstance(this));
  }

  /**
   * Listen to events on the model
   * @param event
   * @param listener
   * @param async
   */
  static on<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    listener: (evt: StoreEvents[Key]) => any,
    async: boolean = false
  ) {
    if (!Emitters.has(this)) {
      Emitters.set(this, new EventEmitter());
    }
    // TODO Manage async
    if (async) {
      Core.get()
        .getService<EventService>("AsyncEvents")
        .bindAsyncListener(<CoreModelDefinition>(<unknown>this), event, listener);
    } else {
      Emitters.get(this).on(event, listener);
    }
    return <any>this;
  }

  /**
   * Emit an event for this class
   * @param this
   * @param event
   * @param evt
   */
  static emit<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    evt: StoreEvents[Key]
  ) {
    let clazz = this;
    // @ts-ignore
    while (clazz) {
      // Emit for all parent class
      if (Emitters.has(clazz)) {
        EventEmitterUtils.emit(Emitters.get(clazz), event, evt);
      }
      // @ts-ignore
      if (clazz === CoreModel) {
        break;
      }
      clazz = Object.getPrototypeOf(clazz);
    }
  }

  /**
   * Emit an event for this class and wait for all listeners to finish
   * @param this
   * @param event
   * @param evt
   */
  static async emitSync<T extends CoreModel, Key extends keyof StoreEvents>(
    this: Constructor<T>,
    event: Key,
    evt: StoreEvents[Key]
  ) {
    let clazz = this;
    let p = [];
    // @ts-ignore
    while (clazz) {
      // Emit for all parent class
      if (Emitters.has(clazz)) {
        p.push(EventEmitterUtils.emitSync(Emitters.get(clazz), event, evt));
      }
      // @ts-ignore
      if (clazz === CoreModel) {
        break;
      }
      clazz = Object.getPrototypeOf(clazz);
    }
    await Promise.all(p);
  }

  /**
   * Listen to events on the model asynchronously
   * @param event
   * @param listener
   */
  static onAsync<Key extends keyof StoreEvents>(event: Key, listener: (evt: StoreEvents[Key]) => any, queue?: string) {
    return this.on(event, listener, true);
  }

  /**
   *
   * @param event
   * @param listener
   * @returns
   */
  static addListener<Key extends keyof StoreEvents>(event: Key, listener: (...args: any[]) => void) {
    return this.on(event, listener);
  }

  static emitter(method, ...args) {
    if (!Emitters.has(this)) {
      Emitters.set(this, new EventEmitter());
    }
    // @ts-ignore
    return Emitters.get(this)[method](...args);
  }

  static removeListener(...args) {
    return this.emitter("removeListener", ...args);
  }

  static off(...args) {
    return this.emitter("off", ...args);
  }

  static once(...args) {
    return this.emitter("once", ...args);
  }

  static removeAllListeners(...args) {
    return this.emitter("removeAllListeners", ...args);
  }

  static setMaxListeners(...args) {
    return this.emitter("setMaxListeners", ...args);
  }

  static getMaxListeners(...args) {
    return this.emitter("getMaxListeners", ...args);
  }

  static listeners(...args) {
    return this.emitter("listeners", ...args);
  }

  static rawListeners(...args) {
    return this.emitter("rawListeners", ...args);
  }

  static listenerCount(...args) {
    return this.emitter("listenerCount", ...args);
  }

  static prependListener(...args) {
    return this.emitter("prependListener", ...args);
  }

  static prependOnceListener(...args) {
    return this.emitter("prependOnceListener", ...args);
  }

  static eventNames(...args) {
    return this.emitter("eventNames", ...args);
  }
  /**
   *
   * @returns
   */
  static getRelations() {
    return Core.get()?.getApplication().getRelations(this);
  }

  /**
   * Do not declare any public events by default
   * @returns
   */
  static getClientEvents() {
    return [];
  }

  /**
   * Does not allow any event by default
   * @param _event
   * @param _context
   * @returns
   */
  static authorizeClientEvent(_event: string, _context: OperationContext, _model?: CoreModel) {
    return false;
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
   * Get the model hierarchy
   *
   * Ancestors will contain every model it inherits from
   * Children will contain every model that inherits from this model in a tree structure
   */
  static getHierarchy(): {
    ancestors: string[];
    children: ModelsTree;
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
   * Complete the query with __type/__types
   * @param query
   * @param includeSubclass
   * @returns
   */
  protected static completeQuery(query: string, includeSubclass: boolean = true): string {
    if (!query.includes("__type")) {
      let condition;
      const app = Core.get().getApplication();
      const name = app.getShortId(app.getModelName(this));
      if (includeSubclass) {
        condition = `__types CONTAINS "${name}"`;
      } else {
        condition = `__type = "${name}"`;
      }
      return WebdaQL.PrependCondition(query, condition);
    }
    return query;
  }

  /**
   * Iterate through the model
   *
   * How to use a iterator is:
   *
   * ```
   * for await (const model of CoreModel.iterate()) {
   *    // Do something with my model
   * }
   * ```
   *
   * @param this
   * @param query
   * @param includeSubclass
   * @param context
   * @returns
   */
  static iterate<T extends CoreModel>(
    this: Constructor<T>,
    query: string = "",
    includeSubclass: boolean = true,
    context?: OperationContext
  ): AsyncGenerator<T> {
    // @ts-ignore
    return this.store().iterate(this.completeQuery(query, includeSubclass), context);
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
    // @ts-ignore
    return <any>this.store().query(this.completeQuery(query, includeSubclass), context);
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
    // Reduce right to give priority to the last class:
    return actions.reduceRight((v, c) => ({ ...v, ...c }), {});
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
    context: OperationContext,
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
    let msg = await this.canAct(context, action);
    if (msg !== true) {
      throw new WebdaError.Forbidden(msg === false ? "No permission" : msg);
    }
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    _context: OperationContext,
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
  ): Promise<string | boolean> {
    return "This model does not support any action: override canAct";
  }

  /**
   * Get the UUID property
   */
  static getUuidField(): string {
    return "uuid";
  }

  /**
   * Create an object
   * @returns
   */
  static factory<T extends CoreModel>(this: Constructor<T>, object: Partial<T>, context?: OperationContext): T {
    return object instanceof this ? object : new this().setContext(context).load(object, context === undefined);
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
  load(raw: RawModel<this>, secure: boolean = false, relations: boolean = true): this {
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
    if (relations) {
      this.handleRelations();
    }
    return this;
  }

  /**
   * Patch every attribute that is based on a relation
   * to add all the helpers
   */
  protected handleRelations() {
    const rel =
      Core.get()
        ?.getApplication()
        ?.getRelations(<any>this) || {};
    for (let link of rel.links || []) {
      const model = Core.get().getModel(link.model);
      if (link.type === "LINK") {
        this[link.attribute] ??= "";
        if (typeof this[link.attribute] === "string") {
          this[link.attribute] = new ModelRef(this[link.attribute], model, this);
        }
      } else if (link.type === "LINKS_ARRAY") {
        this[link.attribute] = new ModelLinksArray(model, this[link.attribute], this);
      } else if (link.type === "LINKS_SIMPLE_ARRAY") {
        this[link.attribute] = new ModelLinksSimpleArray(model, this[link.attribute], this);
      } else if (link.type === "LINKS_MAP") {
        this[link.attribute] = createModelLinksMap(model, this[link.attribute], this);
      }
    }
    for (let link of rel.maps || []) {
      this[link.attribute] = (this[link.attribute] || []).map(
        el => new ModelMapLoaderImplementation(Core.get().getModel(link.model), el, this)
      );
    }
    for (let query of rel.queries || []) {
      this[query.attribute] = new CoreModelQuery(query.model, this, query.targetAttribute);
    }
    if (rel.parent) {
      this[rel.parent.attribute] ??= "";
      if (typeof this[rel.parent.attribute] === "string") {
        this[rel.parent.attribute] = new ModelRef(
          this[rel.parent.attribute],
          Core.get().getModel(rel.parent.model),
          this
        );
      }
    }
    for (let binary of rel.binaries || []) {
      if (binary.cardinality === "ONE") {
        this[binary.attribute] = new Binary(binary.attribute, this);
      } else {
        this[binary.attribute] = new BinariesImpl().assign(this, binary.attribute);
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
      this.handleRelations();
    }
    return this;
  }

  /**
   * Delete this object
   *
   * @throws Error if the object is not coming from a store
   */
  async delete(): Promise<void> {
    return this.__store.delete(this);
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
      } else if (value instanceof Binary) {
        obj[i] = value.toJSON();
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

  /**
   * Set attribute on the object and database
   * @param property
   * @param value
   */
  async setAttribute(property: keyof this, value: any) {
    await this.getRef().setAttribute(property, value);
    this[property] = value;
  }

  /**
   * Remove attribute from both the object and db
   * @param property
   */
  async removeAttribute(property: keyof this) {
    await this.getRef().removeAttribute(property);
    delete this[property];
  }

  /**
   * Increment an attribute both in store and object
   * @param property
   * @param value
   */
  async incrementAttribute(property: FilterAttributes<this, number>, value: number) {
    return this.incrementAttributes([<any>{ property, value }]);
  }

  /**
   * Return a model ref
   * @returns
   */
  getRef<T extends this>(): ModelRef<T> {
    return <any>new ModelRef<this>(this.getUuid(), <any>this.__class);
  }

  /**
   * Increment a attributes both in store and object
   * @param info
   */
  async incrementAttributes(info: { property: string; value: number }[]) {
    await this.getRef().incrementAttributes(<any>info);
    for (let inc of info) {
      this[inc.property] ??= 0;
      this[inc.property] += inc.value;
    }
  }
}

/**
 * CoreModel with a uuid
 */
class UuidModel extends CoreModel {
  uuid: string;

  /**
   * @override
   */
  validate(ctx: OperationContext<any, any>, updates: any, ignoreRequired?: boolean): Promise<boolean> {
    updates.uuid ??= this.generateUid();
    return super.validate(ctx, updates, ignoreRequired);
  }
}

export { CoreModel, UuidModel };
