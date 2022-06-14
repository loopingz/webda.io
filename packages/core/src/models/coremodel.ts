import { v4 as uuidv4 } from "uuid";
import { Core } from "../index";
import { Service } from "../services/service";
import { Store } from "../stores/store";
import { Context } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";

type ModelLoader<T> = { refresh: () => Promise<T>; getUuid(): string };

type ModelLinker<T> = string & ModelLoader<T>;

/**
 * Load related objects
 */
export type ModelLinked<T> = (query?: string) => Promise<T[]>;
/**
 * Define a ModelMap attribute
 */
export type ModelMap<T, _FK extends keyof T, K extends keyof T> = (Pick<T, K> & ModelLoader<T>)[];
/**
 * Define a link to 1:n relation
 */
export type ModelLink<T, _FK extends keyof T = any> = ModelLinker<T>;
/**
 * Define several links for n:m relation
 */
export type ModelLinks<T, _FK extends keyof T> = ModelLinker<T>[] | { [key: string]: ModelLinker<T> };
/**
 * Define the parent of the model
 */
export type ModelParent<T> = ModelLink<T, any>;
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

export type Constructor<T> = new (...args: any[]) => T;
/**
 * Sent if action required attached CoreModel is trigger
 */
export class CoreModelUnattachedError extends Error {
  constructor() {
    super("No store linked to this object");
  }
}

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
  @NotEnumerable
  __ctx: Context;
  /**
   * If object is attached to its store
   *
   * @TJS-ignore
   */
  @NotEnumerable
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
  setUuid(uuid: string, target = this): this {
    target[this.__class.getUuidField()] = uuid;
    return target;
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
  static factory(model: new () => CoreModel, object: any, context?: Context): CoreModel {
    return new model().setContext(context).load(object, context === undefined);
  }

  /**
   * Return if an object is attached to its store
   */
  isAttached(): boolean {
    return this.__store !== undefined;
  }

  /**
   * Attach an object to a store instance
   */
  attach(store: Store<CoreModel>): this {
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
  static async fromFullUuid<T extends CoreModel = CoreModel>(core: Core, fullUuid: string, partials?: any): Promise<T> {
    const [store, uuid] = fullUuid.split("$");
    let service = core.getService<Store<T>>(store);
    if (partials) {
      return service.initModel(partials).setUuid(uuid);
    }
    return service.get(uuid);
  }
  /**
   * Load an object from RAW
   *
   * @param raw data
   * @param secure if false will ignore any _ variable
   */
  load(raw: any, secure: boolean = false): this {
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
    return this;
  }

  /**
   * Context of the request
   */
  setContext(ctx: Context): this {
    this.__ctx = ctx;
    return this;
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
  async update(changes): Promise<this> {
    if (!this.__store) {
      throw new CoreModelUnattachedError();
    }
    changes[this.__class.getUuidField()] = this[this.__class.getUuidField()];
    let obj = await this.__store.patch(changes);
    for (var i in obj) {
      this[i] = obj[i];
    }
    return this;
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
