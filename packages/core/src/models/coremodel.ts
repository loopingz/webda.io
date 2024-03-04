import * as WebdaQL from "@webda/ql";
import { Constructor, FilterAttributes, NotEnumerable } from "@webda/tsc-esm";
import { randomUUID } from "crypto";
import { JSONSchema7 } from "json-schema";
import util from "util";
import { ModelGraph, ModelsTree } from "../application";
import { Core } from "../core";
import { WebdaError } from "../errors";
import { ModelCreateEvent, ModelDeleteEvent, ModelGetEvent, ModelUpdateEvent } from "../events";
import { BinariesImpl, Binary } from "../services/binary";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { Context, OperationContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { CoreModelQuery, ModelRef, ModelRefWithCreate } from "./coremodelref";
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
  factory<T extends CoreModel>(this: Constructor<T>, object: Partial<T>, context?: Context): T;
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
  getPermissionQuery(context: OperationContext): null | { partial: boolean; query: string };
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
    context?: Context
  ): Promise<{ results: T[]; continuationToken?: string }>;

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
  authorizeClientEvent(_event: string, _context: Context, _model?: T): boolean;
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
   * @TJS-ignore
   */
  @NotEnumerable
  __store: Store<this>;

  /**
   * Dirty fields
   */
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
  static authorizeClientEvent(_event: string, _context: Context, _model?: CoreModel) {
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
    includeSubclass: boolean = true
  ): AsyncGenerator<T> {
    // @ts-ignore
    return this.store().iterate(this.completeQuery(query, includeSubclass));
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

  /**
   * Check if an actions is permitted
   * @param context
   * @param action
   */
  async checkAct(
    context: Context,
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
  static factory<T extends CoreModel>(this: Constructor<T>, object: Partial<T>, context?: Context): T {
    return object instanceof this ? object : new this().load(object, context === undefined);
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
  attributePermission(key: string, value: any, mode: "READ" | "WRITE", context?: Context): any {
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
   * Get object context
   *
   * Global object does not belong to a request
   */
  getContext<T extends Context>(): T {
    return <T>Core.get().getContext();
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
      await this.__store.update(this);
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
  async validate(_ctx: OperationContext, updates: any, ignoreRequired: boolean = false): Promise<boolean> {
    Core.get().validateSchema(this, updates, ignoreRequired);
    return true;
  }

  /**
   * Generate uuid for the object
   *
   * @param object
   * @returns
   */
  generateUid(_object: any = undefined): string {
    return randomUUID();
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
   */
  getService<T extends Service>(service): T {
    return Core.get().getService<T>(service);
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
    return new ModelDeleteEvent(
      {
        object: this,
        object_id: this.getUuid()
      },
      this
    ).emit();
  }

  /**
   * Called when object is retrieved
   */
  async _onGet() {
    // Empty to be overriden
    await new ModelGetEvent(
      {
        object: this
      },
      this
    ).emit();
  }

  /**
   * Called when object is about to be saved
   */
  async _onCreate() {
    // TODO
  }

  /**
   * Called when object is saved
   */
  async _onCreated() {
    await new ModelCreateEvent(
      {
        object: this
      },
      this
    ).emit();
  }

  /**
   * Called when object is about to be updates
   *
   * @param updates to be send
   */
  async _onUpdate(_updates: any) {
    // empty to be overriden
  }

  /**
   * Called when object is updated
   */
  async _onUpdated(updates: any) {
    await new ModelUpdateEvent(
      {
        object: this,
        object_id: this.getUuid(),
        update: updates
      },
      this
    ).emit();
  }

  /**
   * Set attribute on the object and database
   * @param property
   * @param value
   */
  async setAttribute(property: keyof this, value: any) {
    await this.ref().setAttribute(property, value);
    this[property] = value;
  }

  /**
   * Remove attribute from both the object and db
   * @param property
   */
  async removeAttribute(property: keyof this) {
    await this.ref().removeAttribute(property);
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
  ref<T extends this>(): ModelRef<T> {
    return <any>new ModelRef<this>(this.getUuid(), <any>this.__class);
  }

  /**
   * Increment a attributes both in store and object
   * @param info
   */
  async incrementAttributes(info: { property: string; value: number }[]) {
    await this.ref().incrementAttributes(<any>info);
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
  validate(ctx: OperationContext, updates: any, ignoreRequired?: boolean): Promise<boolean> {
    updates.uuid ??= this.generateUid();
    return super.validate(ctx, updates, ignoreRequired);
  }
}

export { CoreModel, UuidModel };
