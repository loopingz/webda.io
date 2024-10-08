import { EventEmitter } from "events";
import * as WebdaError from "../errors/errors";
import * as WebdaQL from "@webda/ql";
import { Context } from "../contexts/icontext";
import { OperationContext } from "../contexts/operationcontext";
import type { HttpMethodType } from "../contexts/httpcontext";
import { Throttler } from "../utils/throttler";
import {
  ModelLinksArray,
  ModelLinksSimpleArray,
  ModelMapLoaderImplementation,
  ModelRef,
  ModelRefWithCreate,
  createModelLinksMap
} from "./relations";
import { runAsSystem, useContext } from "../contexts/execution";
import { Attributes, NotEnumerable, type Constructor, type FilterAttributes } from "@webda/tsc-esm";
import { EventEmitterUtils } from "../events/asynceventemitter";
import { getUuid } from "../utils/uuid";
import { AbstractCoreModel, CoreModelEvents, ModelAttributes } from "./imodel";
import { useApplication, useModel, useModelId } from "../application/hook";
import { StoreHelper } from "../stores/istore";
import { useLog } from "../loggers/hooks";
import { WorkerLogLevel } from "@webda/workout";
import { getAttributeLevelProxy } from "./coremodelproxy";
import { OperationDefinitionInfo } from "../core/icore";
import { Service } from "../services/service";
import { BinariesImpl, Binary } from "../services/binary";
import {
  CoreModelDefinition,
  CoreModelFullDefinition,
  ModelAction,
  ModelActions,
  Proxied,
  RawModel
} from "../application/iapplication";

/**
 * This is implementation of ModelRelated
 *
 *
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
    this.targetModel ??= useModel(this.type);
    return this.targetModel;
  }
  /**
   * Query the object
   * @param query
   * @returns
   */
  query(query?: string): Promise<{
    results: CoreModel[];
    continuationToken?: string;
  }> {
    return <any>this.getTargetModel().query(this.completeQuery(query), true);
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
  async forEach(callback: (model: any) => Promise<void>, query?: string, parallelism: number = 3) {
    const throttler = new Throttler();
    throttler.setConcurrency(parallelism);
    for await (const model of this.iterate(query)) {
      throttler.execute(() => callback(model));
    }
    return throttler.wait();
  }

  /**
   * Iterate through all
   * @param context
   * @returns
   */
  iterate(query?: string) {
    return this.getTargetModel().iterate(this.completeQuery(query));
  }
}

/**
 * Annotatated Actions
 *
 * Used to store all actions annotated on a class
 */
const ActionsAnnotated: Map<any, ModelActions> = new Map();
/**
 * Define an object method as an action
 * @param target
 * @param propertyKey
 */
export function Action(options: { methods?: HttpMethodType[]; openapi?: any; name?: string } = {}) {
  return (target: any, propertyKey: string) => {
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

/**
 * EventEmitter per class
 */
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
export class CoreModel extends AbstractCoreModel {
  @NotEnumerable
  Events: CoreModelEvents<this> = undefined;
  @NotEnumerable
  static Identifier: string = undefined;
  /**
   * Store helper for this model
   */
  protected static Store: StoreHelper & { name: string } = undefined;

  /**
   * Types name
   */
  __types: string[];

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

  /**
   * Listen to events on the model
   * @param event
   * @param listener
   * @param async
   */
  static on<T extends CoreModel, Key extends keyof T["Events"]>(
    this: Constructor<T>,
    event: Key,
    listener: (evt: T["Events"][Key]) => any
  ) {
    if (!Emitters.has(this)) {
      Emitters.set(this, new EventEmitter());
    }
    Emitters.get(this).on(<string>event, listener);
    return <any>this;
  }

  /**
   * On that specific instance
   * @param event
   * @param listener
   * @param async
   * @returns
   */
  //on(event: string, listener: (evt: any) => any, async: boolean = false) {}

  /**
   * Return the model id
   * @returns
   */
  static getIdentifier(full?: boolean) {
    return useModelId(this.constructor, full);
  }
  /**
   * Emit an event for this class and wait for all listeners to finish
   * @param this
   * @param event
   * @param evt
   */
  static async emit<T extends CoreModel, Key extends keyof T["Events"]>(
    this: Constructor<T>,
    event: Key,
    evt: T["Events"][Key]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let clazz = this;
    const p = [];
    // @ts-ignore
    while (clazz) {
      // Emit for all parent class
      if (Emitters.has(clazz)) {
        p.push(
          EventEmitterUtils.emit(Emitters.get(clazz), event, evt, (level: WorkerLogLevel, ...args: any[]) =>
            useLog(level, ...args)
          )
        );
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
   *
   * @param event
   * @param listener
   * @returns
   */
  static addListener<T extends CoreModel, Key extends keyof T["Events"]>(
    event: Key,
    listener: (event: T["Events"][Key]) => void
  ) {
    return this.on(<any>event, listener);
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

  static store() {
    return useModel(this.Store.name);
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
  static ref<T extends CoreModel>(this: Constructor<T>, uid: string): ModelRefWithCreate<T> {
    return new ModelRefWithCreate<T>(uid, <CoreModelFullDefinition<T>>this);
  }

  /**
   * Shortcut to retrieve an object
   *
   * @param defaultValue if defined create an object with this value if needed
   */
  static async get<T extends CoreModel>(this: CoreModelDefinition<T>, uid: string, defaultValue?: any): Promise<T> {
    return <T>await (<CoreModelFullDefinition<T>>this).Store.get(uid) || (await this.create(defaultValue, false));
  }

  static resolve(): void {}

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static async create<T extends CoreModel>(
    this: Constructor<T>,
    data: RawModel<T>,
    save: boolean = true
  ): Promise<Proxied<T>> {
    const model = new this().load(data, true);
    runAsSystem(() => (model._new = true));
    if (save) {
      return getAttributeLevelProxy(await model.save());
    }
    return getAttributeLevelProxy(model);
  }

  /**
   * The model is new and not saved yet
   *
   * It is set by the factory method and by the create method
   */
  @NotEnumerable
  _new: boolean;

  /**
   * By default allow a field
   * @returns
   */
  isDeleted(): boolean {
    return this.__deleted;
  }

  /**
   * Unflat an object
   * @param data
   * @param split
   * @returns
   */
  static unflat<T = any>(data: any, split: string = "#"): T {
    const res: any = {};
    for (const i in data) {
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
    for (const i in data) {
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
      const name = useModelId(this, true);
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
    includeSubclass: boolean = true
  ): Promise<{
    results: T[];
    continuationToken?: string;
  }> {
    // @ts-ignore
    return <any>this.store().query(this.completeQuery(query, includeSubclass));
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
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

  /**
   * Check if permission is granted and throw an exception if not
   * @param context
   * @param action
   */
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
    const msg = await this.canAct(context, action);
    if (msg !== true) {
      throw new WebdaError.Forbidden(msg === false ? "No permission" : msg);
    }
  }

  /**
   * By default nothing is permitted on a CoreModel
   * @returns
   */
  async canAct(
    _context: Context,
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
  static async factory<T extends CoreModel>(this: CoreModelDefinition<T>, object: RawModel<T>): Promise<Proxied<T>> {
    return this.create(object, false);
  }

  /**
   * Return a unique reference within the application to the object
   *
   * It contains the Store containing it
   * @returns
   */
  getFullUuid() {
    return `${this.__class.getIdentifier().replace(/\//, "-")}$${this.getUuid()}`;
  }

  /**
   * Get an object from the full uuid
   * @param core
   * @param fullUuid
   * @param partials
   * @returns
   */
  static async fromFullUuid<T extends CoreModel = CoreModel>(fullUuid: string, partials?: any): Promise<T> {
    const [model, uuid] = fullUuid.split("$");
    const modelObject = <CoreModelFullDefinition<CoreModel>>useModel(model.replace("-", "/"));
    if (partials) {
      return <T>new modelObject().load(partials, true).setUuid(uuid);
    }
    return <Promise<T>>new modelObject().setUuid(uuid).refresh();
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
  attributePermission(key: string | symbol, value: any, mode: "READ" | "WRITE"): any {
    if (typeof key === "symbol" || !this.context) {
      return value;
    }
    if (mode === "WRITE") {
      return key.startsWith("_") ? undefined : value;
    } else {
      return !key.startsWith("__") ? value : undefined;
    }
  }

  /**
   * Return attributes permissions information
   *
   * The model proxy will refuse update to readonly property and refuse read of forbidden properties.
   * This will be cached per context
   * @returns
   */
  attributesPermissions(): { readonly: string[]; forbidden: string[] } | undefined {
    return;
  }

  /**
   * Usefull to check if the object has permission on an attribute
   *
   * Usually permissions should only be applied when a context is not system
   * But for some specific like masked data, it can apply even for system
   *
   * @param context
   * @param mode
   * @returns
   */
  hasAttributePermissions(_mode: "READ" | "WRITE"): boolean {
    return !this.context.isGlobalContext();
  }

  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: Partial<RawModel<this>>, relations: boolean = true): this {
    this.context = useContext();
    const filterAttribute = this.hasAttributePermissions("WRITE");
    // Object assign with filter
    for (const prop in raw) {
      let val = raw[prop];
      if (filterAttribute) {
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
    const rel = useApplication()?.getRelations(<any>this) || {};
    for (const link of rel.links || []) {
      const model = <CoreModelFullDefinition<AbstractCoreModel>>useModel(link.model);
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
    for (const link of rel.maps || []) {
      this[link.attribute] = (this[link.attribute] || []).map(
        el => new ModelMapLoaderImplementation(useModel(link.model), el, this)
      );
    }
    for (const query of rel.queries || []) {
      this[query.attribute] = new CoreModelQuery(query.model, this, query.targetAttribute);
    }
    if (rel.parent) {
      this[rel.parent.attribute] ??= "";
      if (typeof this[rel.parent.attribute] === "string") {
        this[rel.parent.attribute] = new ModelRef(
          this[rel.parent.attribute],
          <CoreModelFullDefinition<CoreModel>>useModel(rel.parent.model),
          this
        );
      }
    }
    for (const binary of rel.binaries || []) {
      if (binary.cardinality === "ONE") {
        this[binary.attribute] = new Binary(binary.attribute, this);
      } else {
        this[binary.attribute] = new BinariesImpl().assign(this, binary.attribute);
      }
    }
  }

  /**
   * Get the object again
   *
   * @throws Error if the object is not coming from a store
   */
  async refresh(): Promise<this> {
    return runAsSystem(async () => {
      const obj = await this.__class.Store.get(this.getUuid());
      if (obj) {
        Object.assign(this, obj);
        for (const i in this) {
          // @ts-ignore
          if (obj[i] !== this[i]) {
            delete this[i];
          }
        }
        this.handleRelations();
      }
      this.__dirty?.clear();
      return this;
    });
  }

  /**
   * Delete this object
   *
   * @throws Error if the object is not coming from a store
   */
  async delete<K extends keyof ModelAttributes<this>>(
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  ): Promise<void> {
    return this.__class.Store.delete(this.getUuid(), <any>itemWriteConditionField, itemWriteCondition);
  }

  /**
   * Patch current object with this update
   * @param obj
   * @param conditionField if null no condition used otherwise fallback to lastUpdate
   * @param conditionValue
   */
  async patch(obj: Partial<this>, conditionField?: keyof this | null, conditionValue?: any) {
    await this.__class.Store.patch(this.getUuid(), obj, <any>conditionField, conditionValue);
    Object.assign(this, obj);
    // Clear dirty if exists - should only exists if using proxy
    Object.keys(obj).forEach(k => {
      this.__dirty?.delete(k);
    });
  }

  /**
   * If the object is proxied through our CoreModelProxy
   * @returns
   */
  isProxied(): boolean {
    return this.__dirty !== undefined;
  }

  /**
   * @deprecated You should override the save method
   */
  _onSave() {}

  /**
   * @deprecated You should override the save method
   */
  _onSaved() {}

  /**
   * @deprecated You should override the save/patch method
   */
  _onUpdate() {}

  /**
   * @deprecated You should override the save/patch method
   */
  _onUpdated() {}

  /**
   * @deprecated You should override the delete method
   */
  _onDelete() {}

  /**
   * @deprecated You should override the delete method
   */
  _onDeleted() {}
  /**
   * Save this object
   *
   * @param full
   *    - if `true` save all the object
   *    - if `false` or `undefined` save only the dirty fields
   *    - if a string save only the specified fields
   * @params fields additional to save only used if full is a string
   *
   * @throws Error if the object is not coming from a store
   */
  async save(full?: boolean | keyof this, ...fields: (keyof this)[]): Promise<this> {
    // If proxy is not used and not field specified call save
    // When no proxy is used __dirty is undefined
    if (full === true || this._new || !this.isProxied()) {
      if (this._new) {
        await this.__class.Store.create(this.getUuid(), this);
      } else {
        await this.__class.Store.update(this.getUuid(), this);
      }
      return this;
    }
    const patch: any = {};
    if (typeof full === "string") {
      [full, ...fields].forEach(k => {
        patch[k] = this[k];
      });
    } else {
      for (const entry of this.__dirty) {
        patch[entry[0]] = this[entry[0]];
      }
    }
    await this.__class.Store.patch(this.getUuid(), patch);
    // Clear dirty if exists - should only exists if using proxy
    this.__dirty?.clear();
    return this;
  }

  /**
   * Properties managed by the CoreModelProxy
   */
  @NotEnumerable
  readonly __dirty: Set<string> = undefined;

  /**
   * Return if the object is dirty: unsaved modifications
   */
  isDirty(): boolean {
    return this.__dirty.size > 0;
  }

  /**
   * Generate uuid for the object
   *
   * @param object
   * @returns
   */
  generateUid(_object: any = undefined): string {
    return getUuid();
  }

  /**
   * Return the object without sensitive attributes
   *
   * @returns Object to serialize
   */
  toJSON(): any {
    const filterAttribute = this.hasAttributePermissions("READ");
    const obj: any = {};
    for (const i in this) {
      let value = this[i];
      if (filterAttribute) {
        value = this.attributePermission(i, value, "READ");
      }
      if (value === undefined) continue;
      if (value instanceof Service) {
        continue;
      } else if (value instanceof CoreModelQuery) {
        continue;
      } else if (value instanceof ModelRef) {
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
   * Upsert item to a collection
   * @param collection
   * @param item
   * @param index
   * @param conditionField
   * @param conditionValue
   */
  async upsertItemToCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    item: any,
    index?: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void> {
    await this.__class.Store.upsertItemToCollection(
      this.getUuid(),
      <any>collection,
      item,
      index,
      <any>conditionField,
      conditionValue
    );
  }

  async deleteItemFromCollection<K extends FilterAttributes<this, Array<any>>>(
    collection: K,
    index: number,
    conditionField?: any,
    conditionValue?: any
  ): Promise<void> {
    await this.__class.Store.deleteItemFromCollection(
      this.getUuid(),
      <any>collection,
      index,
      <any>conditionField,
      conditionValue
    );
  }

  /**
   * Set attribute on the object and database
   * @param property
   * @param value
   */
  async setAttribute<K extends keyof ModelAttributes<this>, L extends keyof ModelAttributes<this>>(
    property: K,
    value: this[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: this[L]
  ) {
    await this.getRef().setAttribute(<any>property, value, <any>itemWriteConditionField, itemWriteCondition);
    this[property] = value;
    this.__dirty?.delete(<string>property);
  }

  /**
   * Remove attribute from both the object and db
   * @param property to remove
   * @param itemWriteConditionField to check
   * @param itemWriteCondition value to check
   */
  async removeAttribute<K extends Attributes<this>>(
    property: Attributes<this>,
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  ) {
    await this.getRef().removeAttribute(property, itemWriteConditionField, itemWriteCondition);
    delete this[property];
    this.__dirty?.delete(<string>property);
  }

  /**
   * Increment an attribute both in store and object
   * @param property
   * @param value
   */
  async incrementAttribute(property: FilterAttributes<this, number>, value?: number) {
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
  async incrementAttributes<K extends Attributes<this>, L extends FilterAttributes<this, number>>(
    info: ({ property: L; value: number } | L)[],
    itemWriteConditionField?: K,
    itemWriteCondition?: this[K]
  ) {
    const args: { property: L; value: number }[] = <any>(
      info.map(i => (typeof i === "string" ? { property: i, value: 1 } : i))
    );
    await this.getRef().incrementAttributes(<any>args, itemWriteConditionField, itemWriteCondition);
    // Update local object
    for (const inc of args) {
      // @ts-ignore
      this[inc.property] ??= 0;
      // @ts-ignore
      this[inc.property] += inc.value;
      // Remove dirty flag for this property
      this.__dirty?.delete(<string>inc.property);
    }
  }

  /**
   * Register model operations
   * @param this
   * @param registerOperation
   * @returns
   */
  static registerOperations<T extends CoreModel>(
    this: CoreModelDefinition<T>,
    registerOperation: (id: string, info: OperationDefinitionInfo) => void
  ) {
    const actions = this.getActions();
    const modelKey = this.getIdentifier();
    const shortId = useModelId(modelKey, false);
    if (!shortId) {
      // No shortId means the model is not exposed, it is superseeded by something else
      return;
    }
    Object.keys(actions).forEach(name => {
      const id = `${shortId}.${name.substring(0, 1).toUpperCase() + name.substring(1)}`;
      const info: any = {
        model: this.getIdentifier(),
        method: `modelAction`,
        id
      };
      info.input = `${modelKey}.${name}.input`;
      info.output = `${modelKey}.${name}.output`;
      info.parameters = actions[name].global ? undefined : "uuidRequest";
      info.context = {
        model: this,
        action: { ...actions[name], name }
      };
      registerOperation(id, info);
    });
  }

  /**
   * Action on a model
   * @param context
   */
  protected async operationAction(context: OperationContext) {
    const { model, action } = context.getExtension<{
      model: CoreModelDefinition<CoreModel>;
      action: ModelAction & { name: string };
    }>("operationContext");
    if (!action.global) {
      const object = await model.ref(context.getParameters().uuid).get();
      if (!object || object.isDeleted()) {
        throw new WebdaError.NotFound("Object not found");
      }
      await object.checkAct(context, action.name);
      const output = await object[action.name](context);
      context.write(output);
    } else {
      model[action.name](context);
    }
  }
}

/**
 * A CoreModel that can be any object
 *
 * @category CoreModel
 */
export type CoreModelAny<T = any> = CoreModel & T;
