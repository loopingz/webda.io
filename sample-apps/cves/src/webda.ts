import { OmitByTypeRecursive, IsUnion, OmitFirstArg, FilterAttributes, Attributes, Constructor } from "@webda/tsc-esm";
import EventEmitter from "node:events";
import { useLog, WorkerLogLevel } from "@webda/workout";
import { runAsSystem, OperationContext, EventEmitterUtils, getAttributeLevelProxy } from "@webda/core";
import { Proxied, Reflection } from "@webda/core/lib/internal/iapplication";

export function useRepository<T extends Model>(model: ModelClass<T>): Repository<T> {
  return undefined as any;
}

function isModelClass(obj: any): obj is ModelClass<any> {
  return obj.Metadata !== undefined;
}

/**
 * Make a property hidden from json and schema
 *
 * This property will not be saved in the store
 * Nor it will be exposed in the API
 *
 * @param target
 * @param propertyKey
 */
export function NotEnumerable(target: any, propertyKey: any) {
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
 * Define a model uuid
 */
export class Uuid<T extends object> {
  /**
   * Serialize the key
   * @returns
   */
  toString() {
    return Object.values(this.data).join(this.separator);
  }

  static from<T extends object | string | number, K extends keyof T>(
    data: T,
    attributes: K[] | ModelClass<any>,
    separator: string = "-"
  ): Pick<T, K> {
    if (typeof data === "string") {
      return data;
    }
    const res: any = {};
    let attrs: K[];
    if (isModelClass(attributes)) {
      attrs = <any>(
        (Array.isArray(attributes.Metadata.PrimaryKey)
          ? attributes.Metadata.PrimaryKey
          : [attributes.Metadata.PrimaryKey])
      );
    } else {
      attrs = attributes;
    }
    attrs.forEach(e => {
      // Might want to check for separator
      res[e] = data[e];
    });
    return <T>new Uuid(res, separator);
  }

  /**
   * Parse a uuid into a Uuid object
   * @param uuid
   * @param attributes
   * @param separator
   * @returns
   */
  static parse(uuid: string, attributes: string[] | ModelClass<any>, separator?: string): any {
    if (isModelClass(attributes)) {
      separator = attributes.Metadata.PrimaryKeySeparator || "-";
    }
    const info = uuid.split(separator || "-");
    const res = {};
    let attrs: string[];
    if (isModelClass(attributes)) {
      attrs = <any>(
        (Array.isArray(attributes.Metadata.PrimaryKey)
          ? attributes.Metadata.PrimaryKey
          : [attributes.Metadata.PrimaryKey])
      );
    } else {
      attrs = attributes;
    }
    if (info.length !== attrs.length) {
      throw new Error(`Uuid '${uuid}' is invalid for ${attrs.join(",")}`);
    }
    attrs.forEach((a, ind) => {
      res[a] = info[ind];
    });
    return Uuid.from(res, <any>attributes, separator);
  }

  /**
   * Protected constructor that assign the data to the object
   * @param data
   * @param separator
   */
  protected constructor(
    protected data: T,
    protected separator: string = "-"
  ) {
    Object.assign(this, data);
  }
}

interface PrimaryKeyModel {
  PrimaryKey: any;
}

/**
 * This represent the injected methods of Store into the Model
 */
export interface Repository<T extends PrimaryKeyModel> {
  /**
   * Get data from the store
   * @param uuid
   * @returns
   */
  get(uuid: PrimaryKeyType<T>): Promise<T>;
  /**
   * Create data in the store
   * @param uuid
   * @param data
   * @returns
   */
  create(uuid: PrimaryKeyType<T>, data: T): Promise<T>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @returns
   */
  update<K extends Attributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: T,
    conditionField?: K,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @returns
   */
  patch<K extends Attributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: Partial<T>,
    conditionField?: K,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Query the store
   * @param query
   * @returns
   */
  query(query: string): Promise<T[]>;
  /**
   * Delete data from the store
   * @param uuid
   * @returns
   */
  delete<K extends Attributes<T>>(uuid: PrimaryKeyType<T>, conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Verify if the object exists
   * @param uuid
   * @returns
   */
  exists(uuid: PrimaryKeyType<T>): Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uuid
   * @param info
   * @returns
   */
  incrementAttributes<K extends Attributes<T>, L extends FilterAttributes<T, number>>(
    uuid: PrimaryKeyType<T>,
    info: ({ property: L; value?: number } | L)[],
    conditionField?: K,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Upsert an item to a collection
   * @param uuid
   * @param collection
   * @param item
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  upsertItemToCollection<K extends FilterAttributes<T, Array<any>>>(
    uuid: PrimaryKeyType<T>,
    collection: K,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void>;
  /**
   * Delete item from a collection
   * @param uuid
   * @param collection
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  deleteItemFromCollection<K extends FilterAttributes<T, Array<any>>>(
    uuid: PrimaryKeyType<T>,
    collection: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void>;
  /**
   * Remove an attribute from an object
   * @param uuid
   * @param attribute
   * @returns
   */
  removeAttribute<L extends Attributes<T>, K extends Attributes<T>>(
    uuid: PrimaryKeyType<T>,
    attribute: K,
    conditionField?: L,
    condition?: T[L]
  ): Promise<void>;
}

/**
 * Helper for a ModelRef
 */
export type CRUDHelper<T extends AbstractModel> = {
  [K in keyof Omit<Repository<T>, "create" | "query" | "get" | "update">]: OmitFirstArg<Repository<T>[K]>;
} & {
  /**
   * Set attribute on the object
   * @param property
   * @param value
   * @param itemWriteConditionField
   * @param itemWriteCondition
   */
  setAttribute<K extends Attributes<T>, L extends Attributes<T>>(
    property: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  incrementAttribute<K extends FilterAttributes<T, number>, L extends Attributes<T>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  upsert(data: RawModel<T>): Promise<T>;
  create(data: RawModel<T>, withSave?: boolean): Promise<T>;
};

/**
 * Specify the shortcut for a class
 */
export type ModelCRUD<T extends AbstractModel = AbstractModel> = Omit<CRUDHelper<T>, "upsert" | "exists" | "update"> &
  T & { save(full?: boolean | keyof T, ...fields: (keyof T)[]): Promise<T> };

/**
 * EventEmitter per class
 */
export const Emitters: WeakMap<Prototype<any>, EventEmitter> = new WeakMap();

/**
 * Get the model Primary Key type
 *
 * If the PrimaryKey is a union it will return a partial of the model with the PrimaryKey
 * Otherwise it will return the type of the PrimaryKey
 */
export type PrimaryKeyType<T extends { PrimaryKey: any }> =
  IsUnion<T["PrimaryKey"]> extends true ? Pick<T, T["PrimaryKey"]> : T[T["PrimaryKey"]];

/**
 * Raw model without methods
 *
 * This is used to represent a model without methods and stripping out the helper methods
 */
export type RawModel<T extends object> = Partial<
  OmitByTypeRecursive<
    Omit<T, "__dirty" | "Events" | "PrimaryKey" | "__type" | "__types" | "_new" | "context">,
    Function
  >
>;

export type Prototype<T extends Model> = {
  prototype: T;
};

/**
 * Define a model class
 */
export type ModelClass<T extends Model = Model> = {
  /**
   * Metadata for the model
   */
  Metadata: Reflection;
  create(data: RawModel<T>, withSave: boolean): Promise<Proxied<T>>;
  factory(data: RawModel<T>): Promise<Proxied<T>>;
  get(uuid: PrimaryKeyType<T>, defaultValue?: RawModel<T>): Promise<T>;
  ref(uuid: PrimaryKeyType<T>): ModelRef<T>;
  //on<Key extends keyof T["Events"]>(event: Key, listener: (evt: T["Events"][Key]) => any): ModelClass<T>;
  //emit<Key extends keyof T["Events"]>(event: Key, evt: T["Events"][Key]): Promise<void>;
  emit(event: string, evt: any): Promise<void>;
}; // & ModelEmitter<T["Events"]>;

export type ModelEvents<T = any> = {
  Create: { object_id: string; object: T };
  PartialUpdate: any;
  Delete: { object_id: string };
  Update: { object_id: string; object: T; previous: T };
};
/**
 * Represent a permissive core model
 */
export abstract class AbstractModel implements PrimaryKeyModel {
  /**
   * Events for the object
   */
  Events: ModelEvents<this>;
  /**
   * Metadata for the model
   */
  static Metadata: Reflection;
  /**
   * Can be used to defined what is public
   */
  Pojo: any;
  /**
   * We do not want to allow direct instantiation
   */
  protected constructor() {}
  /**
   * Define the primary key for the model
   *
   * This is only used for typing and should not be used in the code
   */
  PrimaryKey: any;
  /**
   * Unserialize the data into the object
   * @param data
   */
  abstract unserialize(data: any): this;
  /**
   * Get the proxy for this object
   */
  abstract getProxy(): Proxied<this>;

  /**
   * Save the object
   */
  abstract save(): Promise<this>;
}

/**
 * Represent a permissive core model
 */
//@StaticInterface<ModelCRUD<Model>>()
export abstract class Model extends AbstractModel {
  /**
   * Accessible class
   */
  Class: ModelClass<this>;
  /**
   * Definition of the primary key for this object
   *
   * @Separator |
   */
  declare PrimaryKey: any;
  /**
   * Dirty fields
   */
  __dirty: Set<string>;

  /**
   * We do not want to allow direct instantiation
   */
  protected constructor() {
    super();
    this.Class = <any>this.constructor;
  }

  /**
   * Get the uuid for the object
   * @returns
   */
  getUuid(): PrimaryKeyType<this> {
    if (Array.isArray(this.Class.Metadata.PrimaryKey)) {
      return <any>Uuid.from(this, <any>this.Class.Metadata.PrimaryKey);
    }
    return this[this.Class.Metadata.PrimaryKey];
  }

  /**
   * Set the uuid for the object
   * @param uuid
   */
  setUuid(uuid: PrimaryKeyType<this>): this {
    if (Array.isArray(this.Class.Metadata.PrimaryKey)) {
      this.Class.Metadata.PrimaryKey.forEach(key => {
        this[key] = uuid[key];
      });
    } else {
      this[this.Class.Metadata.PrimaryKey] = uuid;
    }
    return this;
  }

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static ref<T extends Model>(this: Prototype<T>, uid: PrimaryKeyType<T>): ModelRefWithCreate<T> {
    return new ModelRefWithCreate<T>(uid, <ModelClass<T>>(<unknown>this));
  }

  /**
   * Shortcut to retrieve an object
   *
   * @param defaultValue if defined create an object with this value if needed
   */
  static async get<T extends Model>(
    this: ModelClass<T>,
    uid: PrimaryKeyType<T>,
    defaultValue?: RawModel<T>
  ): Promise<T> {
    const modelDef = <ModelClass<T>>this;
    const data = <any>await useRepository(this as any).get(uid);
    if (data) {
      // @ts-ignore
      const res = new modelDef();
      res.unserialize(data);
      return <T>res.getProxy();
    }
    return <T>await modelDef.create(defaultValue!, false);
  }

  /**
   * Create an object
   * @returns
   */
  static async factory<T extends Model>(this: ModelClass<T>, object: RawModel<T>): Promise<Proxied<T>> {
    return this.create(object, false);
  }

  /**
   * Get a reference to a model
   * @param this
   * @param uid
   * @returns
   */
  static async create<T extends Model>(
    this: Prototype<T>,
    data: RawModel<T>,
    save: boolean = true
  ): Promise<Proxied<T>> {
    const modelDef = <ModelClass<T> & (new () => T)>this;
    const model = new modelDef().unserialize(data);
    if (save) {
      return (await model.save(true)).getProxy();
    }
    const proxied = model.getProxy();
    proxied.__dirty.add("*");
    return proxied;
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
  static iterate<T extends Model>(
    this: ModelClass<T>,
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
  static async query<T extends Model>(
    this: ModelClass<T>,
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
   * Return the expressable query for permission
   *
   * @param context of the query
   * @returns
   */
  static getPermissionQuery(_ctx: OperationContext): null | { partial: boolean; query: string } {
    return null;
  }

  /**
   * ############ Events ############
   */

  /**
   * Listen to events on the model
   * @param event
   * @param listener
   * @param async
   */
  static on<T extends Model, Key extends keyof T["Events"]>(
    this: Prototype<T>,
    event: Key,
    listener: (evt: T["Events"][Key]) => any
  ) {
    if (!Emitters.has(this as any)) {
      Emitters.set(this as any, new EventEmitter());
    }
    Emitters.get(this as any)!.on(<string>event, listener);
    return <any>this;
  }

  /**
   * Emit an event for this class and wait for all listeners to finish
   * @param this
   * @param event
   * @param evt
   */
  static async emit<T extends Model, Key extends keyof T["Events"]>(
    this: Prototype<T>,
    event: Key,
    evt: T["Events"][Key]
  ) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let clazz = this;
    const p: Promise<any>[] = [];
    // @ts-ignore
    while (clazz) {
      // Emit for all parent class
      if (Emitters.has(clazz)) {
        p.push(
          // @ts-ignore
          EventEmitterUtils.emit(Emitters.get(<any>clazz)!, event, evt, (level: WorkerLogLevel, ...args: any[]) =>
            useLog(level, ...args)
          )
        );
      }
      // @ts-ignore
      if (clazz === Model) {
        break;
      }
      clazz = Object.getPrototypeOf(clazz);
    }
    await Promise.all(p);
  }

  /**
   * Get the emitter for this class
   */
  protected static emitter<T extends Model>(this, method, ...args) {
    if (!Emitters.has(this)) {
      Emitters.set(this, new EventEmitter());
    }
    // @ts-ignore
    return Emitters.get(this)[method](...args);
  }

  /**
   * Remove all listeners for this class
   * @param args
   * @returns
   */
  static removeAllListeners(...args) {
    return this.emitter("removeAllListeners", ...args);
  }

  /**
   * Off an event
   * @param args
   * @returns
   */
  static off(...args) {
    return this.emitter("off", ...args);
  }

  /**
   * Once for an event
   * @param args
   * @returns
   */
  static once(...args) {
    return this.emitter("once", ...args);
  }

  /**
   * Save the object
   * @param full
   * @param fields
   * @returns
   */
  async save(full?: boolean | keyof this, ...fields: (keyof this)[]): Promise<this> {
    // Full save
    if (this.__dirty.has("*") || full) {
    }
    return this;
  }

  /**
   * Get the proxy for this object
   * @returns
   */
  getProxy(): this {
    return <this>getAttributeLevelProxy(this);
  }

  /**
   * Unserialize the data into the object
   * @param data
   * @returns
   */
  unserialize(data: any): this {
    Object.assign(this, data);
    return this;
  }
}

/**
 * Helper object that reference a AbstractCoreModel
 */
export class ModelRef<T extends Model = Model> implements Omit<CRUDHelper<T>, "create" | "upsert"> {
  @NotEnumerable
  protected model: ModelClass<T>;
  @NotEnumerable
  protected parent: Model;

  /**
   *
   * @param uuid of the target object
   * @param model definition of the target object
   * @param parent
   */
  constructor(
    protected uuid: PrimaryKeyType<T>,
    model: ModelClass<T>,
    parent?: Model
  ) {
    this.model = model;
    this.parent = parent!;
  }

  /**
   * Get an object
   * @returns
   */
  async get(): Promise<T> {
    return await this.model.get(this.uuid);
  }

  /**
   * Set the uuid of the object
   * @param id
   */
  set(id: PrimaryKeyType<T> | T) {
    this.uuid = id instanceof Object ? id.getUuid() : id;
    this.parent?.__dirty.add(<any>Object.keys(this.parent).find(k => this.parent[k] === this));
  }

  /**
   * Return the uuid
   * @returns
   */
  toString(): string {
    return this.uuid.toString();
  }

  /**
   * Ensure only the uuid is returned when serialized
   * @returns
   */
  toJSON(): PrimaryKeyType<T> {
    return this.uuid;
  }

  /**
   * Return the uuid
   * @returns
   */
  getUuid(): PrimaryKeyType<T> {
    return this.uuid;
  }

  /**
   * @see AbstractModel.deleteItemFromCollection
   */
  async deleteItemFromCollection<K extends FilterAttributes<T, Array<any>>>(
    prop: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const updateDate = await useRepository(this.model).deleteItemFromCollection(
      this.uuid,
      <any>prop,
      index,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<ModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        deleteItem: {
          property: <string>prop,
          index: index
        }
      }
    }));
  }

  /**
   * @see AbstractModel.upsertItemFromCollection
   */
  async upsertItemToCollection<K extends FilterAttributes<T, Array<any>>>(
    prop: K,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const updateDate = await useRepository(this.model).upsertItemToCollection(
      this.uuid,
      <any>prop,
      item,
      index,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<ModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        addItem: {
          value: item,
          property: <string>prop,
          index: index
        }
      }
    }));
  }

  /**
   * @see AbstractModel.deleteItemFromCollection
   */
  exists(): Promise<boolean> {
    return useRepository(this.model).exists(this.uuid);
  }

  /**
   * @see AbstractModel.delete
   */
  delete<K extends Attributes<T>>(conditionField?: K, condition?: T[K]): Promise<void> {
    return useRepository(this.model).delete(this.uuid, <any>conditionField, <any>condition);
  }

  /**
   * @see AbstractModel.patch
   */
  async patch<K extends Attributes<T>>(updates: Partial<T>, conditionField?: K, condition?: T[K]): Promise<void> {
    useLog("INFO", "PATCH", this.uuid, updates, conditionField, condition);
    await useRepository(this.model).patch(this.uuid, updates, <any>conditionField, condition);
  }

  /**
   * @see AbstractModel.setAttribute
   */
  async setAttribute<K extends Attributes<T>, L extends Attributes<T>>(
    attribute: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void> {
    await useRepository(this.model).patch(
      this.uuid,
      <any>{ [attribute]: value },
      <any>itemWriteConditionField,
      itemWriteCondition
    );
  }

  /**
   * @see AbstractModel.removeAttribute
   */
  async removeAttribute<K extends Attributes<T>>(
    attribute: Attributes<T>,
    itemWriteConditionField?: K,
    itemWriteCondition?: T[K]
  ): Promise<void> {
    await useRepository(this.model).removeAttribute(
      this.uuid,
      <any>attribute,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model?.emit("PartialUpdate", <any>{
      object_id: this.uuid,
      partial_update: {
        deleteAttribute: <any>attribute
      }
    });
  }

  /**
   * @see AbstractModel.incrementAttribute
   */
  async incrementAttribute(attribute: FilterAttributes<T, number>, value: number = 1): Promise<void> {
    return this.incrementAttributes([{ property: attribute, value }]);
  }

  /**
   * @see AbstractModel.incrementAttributes
   */
  async incrementAttributes<K extends Attributes<T>>(
    info: (
      | {
          property: FilterAttributes<T, number>;
          value?: number;
        }
      | FilterAttributes<T, number>
    )[],
    itemWriteConditionField?: K,
    itemWriteCondition?: T[K]
  ): Promise<void> {
    const updateDate = await useRepository(this.model).incrementAttributes(
      this.uuid,
      <any>info,
      <any>itemWriteConditionField,
      itemWriteCondition
    );
    await this.model.emit("PartialUpdate", <any>(<ModelEvents["PartialUpdate"]>{
      object_id: this.uuid,
      updateDate,
      partial_update: {
        increments: <{ property: string; value: number }[]>info
      }
    }));
  }
}

/**
 * ModelRef with create
 */
export class ModelRefWithCreate<T extends Model = Model> extends ModelRef<T> implements CRUDHelper<T> {
  /**
   * Allow to create a model
   * @param defaultValue
   * @param context
   * @param withSave
   * @returns
   */
  async create(defaultValue: RawModel<T>, withSave: boolean = true): Promise<Proxied<T>> {
    const result = (await this.model.factory(<Partial<T>>defaultValue)).setUuid(this.uuid);
    if (withSave) {
      await result.save();
    }
    return <T>getAttributeLevelProxy(result);
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
  async getOrCreate(defaultValue: RawModel<T>, withSave: boolean = true): Promise<T> {
    return (await this.get()) || (await this.create(defaultValue, withSave));
  }

  /**
   * Upsert a model
   * @param defaultValue
   * @returns
   */
  async upsert(defaultValue: RawModel<T>): Promise<T> {
    let result = await this.get();
    if (await this.exists()) {
      await this.patch(<any>defaultValue);
    } else {
      result = await this.create(defaultValue);
    }
    return result;
  }
}

/**
 * ModelRef with custom data information
 */
export class ModelRefCustom<T extends Model> extends ModelRef<T> {
  constructor(
    public uuid: PrimaryKeyType<T>,
    model: ModelClass<T>,
    data: any,
    parent: Model
  ) {
    super(uuid, model, parent);
    Object.assign(this, data);
  }

  toJSON(): any {
    return this;
  }

  getUuid(): PrimaryKeyType<T> {
    return this.uuid;
  }
}

export type ModelRefCustomProperties<T extends Model, K> = ModelRefCustom<T> & Pick<T, T["PrimaryKey"]> & K;

/**
 * Define a 1:n relation on the current model to another model
 *
 * T is the model to link to
 * _K is the attribute in T to query
 *
 * _K is not used but is required to complete the graph
 * _K define the attribute to use to load the related objects
 *
 * In SQL if current model is TableA and T is TableB, _K is the foreign key in TableB
 *
 * TODO Deduce attribute from the ModelParent on the other side when "" is used
 */
export type ModelRelated<T extends Model, _K extends FilterAttributes<T, ModelLinker> | "" = ""> = {
  /**
   * Query the related objects
   * @param query
   * @returns
   */
  query: (query?: string) => Promise<{ results: T[]; continuationToken?: string }>;
  /**
   *
   * @param model Iterate through all related objects
   * @returns
   */
  forEach: (model: T) => Promise<void>;
  /**
   * Iterate through linked objects
   */
  iterate: (query: string) => AsyncIterable<T>;
  /**
   * Get all object linked
   * @returns
   */
  getAll: () => Promise<T[]>;
};

// Empty class to allow filtering it with FilterAttributes
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ModelLinker {}
/**
 * Define a link to n:1 or 1:1 relation on the current model to another model
 *
 * T is the model to link to
 *
 * This is expected to be the symetric of ModelRelated or ModelLink in a 1:1 relation
 */
export class ModelLink<T extends Model> implements ModelLinker {
  @NotEnumerable
  protected parent: Model;

  constructor(
    protected uuid: PrimaryKeyType<T>,
    protected model: ModelClass<T>,
    parent?: Model
  ) {
    this.parent = parent!;
  }

  async get(): Promise<T> {
    return await this.model.ref(this.uuid).get();
  }
  set(id: PrimaryKeyType<T> | T) {
    // @ts-ignore
    this.uuid = typeof id.getUuid === "function" ? id.getUuid() : id;
    // Set dirty for parent
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  toString(): string {
    return Uuid.from(<any>this.uuid, this.model).toString();
  }
  toJSON(): string {
    return this.toString();
  }
  getUuid(): string {
    return this.toString();
  }
}

/**
 * Define the parent of the model
 *
 * Similar to @ModelLink but implies a Cascade delete
 */
export type ModelParent<T extends Model> = ModelLink<T>;

/**
 * Methods that allow to manage a collection of linked objects
 */
type ModelCollectionManager<T> = {
  /**
   * Add a linked object
   * @param model
   * @returns
   */
  add: (model: T) => void;
  /**
   * Remove a linked object
   * @param model the model to remove or its uuid
   * @returns
   */
  remove: (model: T) => void;
};

/**
 * Link to a collection of objects
 *
 * This allows to do a n:m or 1:n relation between two models
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects
 */
export class ModelLinksSimpleArray<T extends Model> extends Array<ModelRef<T>> implements ModelLinker {
  @NotEnumerable
  private parent: Model;

  constructor(
    protected model: ModelClass<T>,
    content: any[] = [],
    parent?: Model
  ) {
    super();
    content.forEach(c => this.add(c));
    this.parent = parent!;
  }

  protected getModelRef(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    let modelRef: ModelRef<T>;
    if (typeof model === "string") {
      modelRef = new ModelRef(Uuid.parse(model, this.model), this.model, this.parent);
    } else if (model instanceof ModelRef) {
      modelRef = model;
    } else {
      modelRef = new ModelRef(model, this.model, this.parent);
    }
    return modelRef;
  }

  add(model: string | PrimaryKeyType<T> | ModelRef<T> | T) {
    this.push(this.getModelRef(model));
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  remove(model: string | ModelRef<T> | PrimaryKeyType<T> | T) {
    const uuid = this.getModelRef(model).getUuid().toString();
    const index = this.findIndex(m => m.toString() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
    }
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }
}

/**
 * Link to a collection of objects including some additional data
 *
 * It does not require to have a symetric relation on the other side
 * The array contains uuid of the linked objects and additional properties defined as K
 *
 * Sample usage:
 * ```typescript
 * class MyModel extends AbstractCoreModel {
 *   _links: ModelLinksArray<OtherModel, { custom: string }>;
 * }
 * ```
 */
export class ModelLinksArray<T extends Model, K> extends Array<ModelRefCustomProperties<T, K>> implements ModelLinker {
  @NotEnumerable
  parent: Model;
  constructor(
    protected model: ModelClass<T>,
    content: any[] = [],
    parent?: Model
  ) {
    super();
    this.parent = parent!;
    this.push(
      ...content
        .filter(c => c && c.uuid)
        .map(c => <ModelRefCustomProperties<T, K>>new ModelRefCustom(c.uuid, model, c, this.parent))
    );
  }

  add(model: ModelRefCustomProperties<T, K>) {
    this.push(<ModelRefCustomProperties<T, K & ({ uuid: string } | { getUuid: () => string })>>model);
    this.parent?.__dirty.add(
      Object.keys(this.parent)
        .filter(k => this.parent[k] === this)
        .pop()!
    );
  }

  remove(model: ModelRefCustomProperties<T, K> | string | T) {
    const uuid = typeof model === "string" ? model : (<{ uuid: string }>model).uuid || model.getUuid();
    const index = this.findIndex(m => m.getUuid() === uuid);
    if (index >= 0) {
      this.splice(index, 1);
      this.parent?.__dirty.add(
        Object.keys(this.parent)
          .filter(k => this.parent[k] === this)
          .pop()!
      );
    }
  }
}

/**
 * Define 1:n or n:m relation with some sort of additional data or duplicated data
 *
 * The key of the map is the value of the FK
 * This is similar to ModelLinksArray but the key is used to store the data
 */
export type ModelLinksMap<T extends Model, K> = Readonly<{
  [key: string]: ModelRefCustomProperties<T, K>;
}> &
  ModelCollectionManager<Pick<T, T["PrimaryKey"]> & K> &
  ModelLinker;

export function createModelLinksMap<T extends Model = Model>(model: ModelClass<T>, data: any = {}, parent?: Model) {
  const result = {
    add: (model: ModelRefCustomProperties<T, any>) => {
      result[model.uuid || model.getUuid()] = model;
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      );
    },
    remove: (model: ModelRefCustomProperties<T, any> | string) => {
      // @ts-ignore
      const uuid = typeof model === "string" ? model : model.uuid || model.getUuid();
      delete result[uuid];
      parent?.__dirty.add(
        Object.keys(parent)
          .filter(k => parent[k] === result)
          .pop()!
      );
    }
  };
  Object.keys(data)
    .filter(k => k !== "__proto__")
    .forEach(key => {
      result[key] = new ModelRefCustom(data[key].uuid, model, data[key], parent!);
    });
  Object.defineProperty(result, "add", { enumerable: false });
  Object.defineProperty(result, "remove", { enumerable: false });
  return result;
}

/**
 * Define a ModelMap attribute
 *
 * K is used by the compiler to define the field it comes from
 *
 * This will instructed a ModelMapper to deduplicate information from the T model into this
 * current model attribute.
 *
 * The attribute where the current model uuid is found is defined by K
 * The attributes to dedepulicate are defined by the L type
 *
 * In the T model, the K attribute should be of type ModelLink
 *
 * This is used for NoSQL model where you need to denormalize data
 * Webda will auto update the current model when the T model is updated
 * to keep the data in sync
 *
 * A SQL Store should define a JOIN to get the data with auto-fetch2
 */
export type ModelsMapped<
  T extends Model,
  // Do not remove used by the compiler
  K extends FilterAttributes<T, ModelLinker>,
  L extends Attributes<T>
> = Readonly<ModelMapLoader<T, L>[]>;

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export class ModelMapLoaderImplementation<T extends Model, K = any> {
  @NotEnumerable
  protected _model: ModelClass<T>;
  @NotEnumerable
  protected _parent: Model;
  /**
   * The uuid of the object
   */
  public uuid: PrimaryKeyType<T>;

  constructor(model: ModelClass<T>, data: Pick<T, T["PrimaryKey"]> & K, parent: Model) {
    Object.assign(this, data);
    this._model = model;
    this._parent = parent;
  }

  /**
   *
   * @returns the model
   */
  async get(): Promise<T> {
    return this._model.ref(this.uuid).get();
  }
}

/**
 * Mapper attribute (target of a Mapper service)
 *
 * This is not exported as when mapped the target is always an array
 * TODO Handle 1:1 map
 */
export type ModelMapLoader<T extends Model, K extends keyof T> = ModelMapLoaderImplementation<T, K> & Pick<T, K>;

class User extends Model {
  PrimaryKey: "id";
  id: string;
}

const Test = {
  model: ModelLink<User>
};

type Retest<T> = {
  [K in keyof T]: T[K] extends ModelLink<infer U> ? Pick<U, U["PrimaryKey"]> : T[K];
};

type Test2 = Retest<typeof Test>;

let t2: Test2;

t2.model = "test";
