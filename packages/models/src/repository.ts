import type { ArrayElement, Constructor, Prototype } from "@webda/tsc-esm";
import {
  JSONed,
  SelfJSONed,
  PK,
  PrimaryKey,
  PrimaryKeyType,
  Storable,
  StorableAttributes,
  UpdatableAttributes,
  WEBDA_EVENTS,
  WEBDA_PRIMARY_KEY,
  ConcreteStorable,
  StorableConstructor,
  StorableClass
} from "./storable";
import { ModelRefWithCreate } from "./relations";
import { deserialize, serialize } from "@webda/serialize";
import { ModelClass } from "./model";

/**
 * This represent the injected methods of Store into the Model
 */
export interface Repository<T extends StorableClass = StorableClass> {
  /**
   * Get the root model class for this repository
   * @returns
   */
  getRootModel(): T;
  /**
   * In REST API, composite keys are represented as a string with the format "key1#key2#key3"
   * We need a way to convert this string to the object
   *
   * @param uuid serialized primary key
   * @param forceObject if true, the result will be an object with the primary key fields
   */
  fromUUID(uuid: string, forceObject?: boolean): ModelRefWithCreate<InstanceType<T>>;
  /**
   * Parse the UUID into the primary key
   * @param uuid
   * @param forceObject
   */
  parseUUID(uuid: string, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>>;
  /**
   * Get data from the store
   * @param uuid
   * @returns
   */
  get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<InstanceType<T>>;
  /**
   * Refers to the object in the store
   * @param pk primary key
   */
  ref(pk: PrimaryKeyType<InstanceType<T>> | string): ModelRefWithCreate<InstanceType<T>>;
  /**
   * Remove the primary key from the object
   * @param object
   */
  excludePrimaryKey(object: any): any;
  /**
   * Extract the primary key from the object
   * @param object to extract the primary key from
   */
  getPrimaryKey<K>(object: any, forceObject?: boolean): K extends false ? PrimaryKeyType<InstanceType<T>> : PrimaryKey<InstanceType<T>>;

  /**
   * Get the UUID of the object
   * @param object to extract the primary key from
   */
  getUUID(object: any): string;
  /**
   * Create data in the store
   * @param uuid
   * @param data
   * @returns
   */
  create(data:ConstructorParameters<T>[0], save?: boolean): Promise<InstanceType<T>>;
  /**
   * Upsert data in the store, creating or updating the object
   * @param uuid
   * @param data
   */
  upsert(data: ConstructorParameters<T>[0]): Promise<InstanceType<T>>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  update<K extends StorableAttributes<InstanceType<T>>>(
    data: SelfJSONed<InstanceType<T>> | InstanceType<T>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  patch<K extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    data: Partial<SelfJSONed<InstanceType<T>>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Query the store
   * @param query
   * @returns
   */
  query(query: string): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }>;
  /**
   * Iterate over the store
   * @param query
   * @returns
   */
  iterate(query: string): AsyncGenerator<InstanceType<T>>;
  /**
   * Delete data from the store
   * @param uuid
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  delete<K extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Verify if the object exists
   * @param uuid
   * @returns
   */
  exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uuid
   * @param info
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttributes<K extends StorableAttributes<InstanceType<T>>, L extends UpdatableAttributes<InstanceType<T>, number>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    info: ({ property: L; value?: number } | L)[] | Record<L, number>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Increment attribute of an object
   * @param uuid
   * @param info
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttribute<K extends StorableAttributes<InstanceType<T>>, L extends UpdatableAttributes<InstanceType<T>, number>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    info: { property: L; value?: number } | L,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
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
  upsertItemToCollection<K extends StorableAttributes<InstanceType<T>, Array<any>>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<InstanceType<T>[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]> extends object ? ArrayElement<InstanceType<T>[K]>[L] : ArrayElement<InstanceType<T>[K]> | null
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
  deleteItemFromCollection<K extends StorableAttributes<InstanceType<T>, Array<any>>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void>;
  /**
   * Remove an attribute from an object
   * @param uuid
   * @param attribute
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  removeAttribute<L extends StorableAttributes<InstanceType<T>>, K extends UpdatableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
  /**
   * Set an attribute on an object
   * @param uuid
   * @param attribute
   * @param value
   */
  setAttribute<K extends UpdatableAttributes<InstanceType<T>>, L extends StorableAttributes<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    value: InstanceType<T>[K],
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void;
  once<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void;
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void;
}

/**
 * This is a simple in-memory repository implementation
 * It is used for testing purposes only
 */
export class MemoryRepository<T extends StorableClass> implements Repository<T> {
  private storage = new Map<string, string>();
  private events = new Map<keyof InstanceType<T>[typeof WEBDA_EVENTS], Set<(data: any) => void>>();

  constructor(
    private model: T,
    protected pks: string[],
    protected separator: string = "_"
  ) {}

  /**
   * @inheritdoc
   */
  getRootModel(): T {
    return this.model;
  }

  /**
   * Return a ref from the uuid
   * @param uuid
   * @returns
   */
  fromUUID(uuid: string): ModelRefWithCreate<InstanceType<T>> {
    return this.ref(this.parseUUID(uuid));
  }

  /**
   * @inheritdoc
   */
  parseUUID(uuid: string, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>> {
    if (this.pks.length === 1) {
      return forceObject
        ? ({ [this.pks[0]]: uuid } as PrimaryKey<InstanceType<T>>)
        : (uuid as PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>);
    }
    const parts = uuid.split(this.separator);
    if (parts.length !== this.pks.length) {
      throw new Error(`Invalid UUID: ${uuid}`);
    }
    const result = {} as PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>;
    for (let i = 0; i < this.pks.length; i++) {
      result[this.pks[i] as keyof InstanceType<T>] = parts[i] as any;
    }
    return result;
  }

  /**
   * @inheritdoc
   */
  async get(primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const item = this.storage.get(key);
    if (!item) throw new Error(`Not found: ${key}`);
    return this.deserialize(item);
  }

  /**
   * @inheritdoc
   */
  excludePrimaryKey(object: any): any {
    const pkFields = (object.PrimaryKey || this.pks || []) as Array<keyof T>;
    const result = { ...object };
    for (const field of pkFields) {
      delete result[field];
    }
    return result;
  }

  getPrimaryKey(object: any, forceObject?: false): PrimaryKeyType<InstanceType<T>>;
  getPrimaryKey(object: any, forceObject: true): PrimaryKey<InstanceType<T>>;
  /**
   * @inheritdoc
   */
  getPrimaryKey(object: any, forceObject: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>> {
    const pkFields = (object[WEBDA_PRIMARY_KEY] || this.pks || []) as Array<keyof InstanceType<T>>;
    if (pkFields.length === 0) {
      throw new Error("No primary key defined on model");
    }
    if (pkFields.some(f => object[f] === undefined)) {
      object = new this.model(object) as InstanceType<T>;
    }
    if (pkFields.some(f => object[f] === undefined)) {
      throw new Error(`Missing primary key fields: ${pkFields.filter(f => object[f] === undefined).join(", ")}`);
    }
    if (pkFields.length === 1) {
      if (typeof object === "object") {
        return object[pkFields[0]] as PK<T, any>;
      }
      return forceObject ? ({ [pkFields[0]]: object, toString: () => object.toString() } as PK<T, any>) : object;
    }
    // composite key
    const key = pkFields.reduce((acc, field) => {
      (acc as any)[field] = object[field];
      return acc;
    }, {} as any);
    key.toString = () => {
      return Object.values(key)
        .filter(v => typeof v !== "function")
        .join(this.separator);
    };
    return key;
  }

  /**
   * @inheritdoc
   */
  getUUID(object: any): string {
    return this.getPrimaryKey(object).toString();
  }

  /**
   * @inheritdoc
   */
  async create(data: ConstructorParameters<T>[0], save: boolean = true): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data).toString();
    if (this.storage.has(key)) {
      throw new Error(`Already exists: ${key}`);
    }
    const item: InstanceType<T> = new this.model(data) as InstanceType<T>;
    // @ts-ignore
    if (save !== false) {
      this.storage.set(key, this.serialize(item));
    }
    return item;
  }

  /**
   * @inheritdoc
   */
  async upsert(data: ConstructorParameters<T>[0]): Promise<InstanceType<T>> {
    const key = this.getPrimaryKey(data).toString();
    if (this.storage.has(key)) {
      await this.patch(this.getPrimaryKey(data), data);
      return this.deserialize(this.storage.get(key)!);
    }
    return this.create(data);
  }

  /**
   * @inheritdoc
   */
  async update<K extends StorableAttributes<InstanceType<T>, any>>(
    data: SelfJSONed<InstanceType<T>> | InstanceType<T>,
    _conditionField?: K | null,
    _condition?: InstanceType<T>[K]
  ): Promise<void> {
    const item = await this.get(this.getPrimaryKey(data));
    Object.assign(item, data as any);
    this.storage.set(this.getPrimaryKey(data).toString(), this.serialize(item));
  }

  /**
   * @inheritdoc
   */
  async patch<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<SelfJSONed<InstanceType<T>>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey);
    Object.assign(item, data as any);
    this.storage.set(item.getPrimaryKey().toString(), this.serialize(item));
  }

  /**
   * @inheritdoc
   */
  async query(_q: string): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }> {
    throw new Error("Not implemented");
  }

  /**
   * Serialize the object to a string
   *
   * This method is used to allow switching between different serialization methods
   *
   * @param item to serialize
   * @returns serialized object
   */
  serialize(item: InstanceType<T>): string {
    return serialize(item);
  }

  /**
   * Unserialize the object from a string
   *
   * This method is used to allow switching between different serialization methods
   *
   * @param item
   * @returns
   */
  deserialize(item: string): InstanceType<T> {
    return deserialize(item) as InstanceType<T>;
  }

  /**
   * @inheritdoc
   */
  async *iterate(_q: string): AsyncGenerator<InstanceType<T>> {
    throw new Error("Not implemented");
  }

  /**
   * @inheritdoc
   */
  async delete<K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    this.storage.delete(this.getPrimaryKey(primaryKey).toString());
  }

  /**
   * @inheritdoc
   */
  async exists(primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>): Promise<boolean> {
    return this.storage.has(this.getPrimaryKey(primaryKey).toString());
  }

  /**
   * @inheritdoc
   */
  async incrementAttributes<K extends StorableAttributes<InstanceType<T>, any>, L extends StorableAttributes<InstanceType<T>, number>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey);
    if (Array.isArray(info)) {
      for (const entry of info) {
        const prop = typeof entry === "string" ? entry : (entry as any).property;
        const inc = typeof entry === "string" ? 1 : ((entry as any).value ?? 1);
        (item as any)[prop] = ((item as any)[prop] || 0) + inc;
      }
    } else {
      for (const prop in info) {
        (item as any)[prop] = ((item as any)[prop] || 0) + info[prop]!;
      }
    }
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(item));
  }

  /**
   * @inheritdoc
   */
  async incrementAttribute<K extends StorableAttributes<InstanceType<T>, any>, L extends StorableAttributes<InstanceType<T>, number>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: L | { property: L; value?: number },
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.incrementAttributes(primaryKey, [info as any]);
  }

  protected checkItemWriteCondition(
    item: any[],
    index: number,
    itemWriteConditionField: string,
    itemWriteCondition: any
  ): void {
    if (
      (Array.isArray(item) && index < item.length && item[index][itemWriteConditionField] === itemWriteCondition) ||
      !itemWriteCondition
    ) {
      return;
    }
    throw new Error("Item write condition failed");
  }

  /**
   * @inheritdoc
   */
  async upsertItemToCollection<K extends StorableAttributes<InstanceType<T>, any[]>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    (obj as any)[collection] ??= [];
    this.checkItemWriteCondition(
      obj[collection] as Array<any>,
      index as number,
      itemWriteConditionField,
      itemWriteCondition
    );
    const arr = (obj as any)[collection] as Array<any>;
    if (typeof index === "number") {
      arr[index] = item;
    } else {
      arr.push(item);
    }
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /**
   * @inheritdoc
   */
  async deleteItemFromCollection<K extends StorableAttributes<InstanceType<T>, any[]>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    collection: K,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    const arr = (obj as any)[collection] as Array<any>;
    this.checkItemWriteCondition(
      obj[collection] as Array<any>,
      index as number,
      itemWriteConditionField,
      itemWriteCondition
    );
    if (Array.isArray(arr) && index >= 0 && index < arr.length) {
      arr.splice(index, 1);
      this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
    }
  }

  /**
   * @inheritdoc
   */
  async removeAttribute<L extends StorableAttributes<InstanceType<T>, any>, K extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    attribute: K,
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    delete (obj as any)[attribute as string];
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /**
   * @inheritdoc
   */
  async setAttribute<K extends StorableAttributes<InstanceType<T>, any>, L extends StorableAttributes<InstanceType<T>, any>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    attribute: K,
    value: InstanceType<T>[K],
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    (obj as any)[attribute as string] = value;
    this.storage.set(this.getPrimaryKey(primaryKey).toString(), this.serialize(obj));
  }

  /**
   * @inheritdoc
   */
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener as any);
  }

  /**
   * @inheritdoc
   */
  once<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void {
    const wrapper = (d: any) => {
      listener(d);
      this.off(event, wrapper as any);
    };
    this.on(event, wrapper as any);
  }

  /**
   * @inheritdoc
   */
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void): void {
    this.events.get(event)?.delete(listener as any);
  }

  // Optional: trigger events internally
  private emit<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(event: K, data: InstanceType<T>[typeof WEBDA_EVENTS][K]): void {
    this.events.get(event)?.forEach(fn => fn(data));
  }

  /**
   * @inheritdoc
   */
  public ref(key: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>): ModelRefWithCreate<InstanceType<T>> {
    return new ModelRefWithCreate<InstanceType<T>>(key, this as any);
  }
}
