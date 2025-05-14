import { ArrayElement, Constructor } from "@webda/tsc-esm";
import { Eventable, JSONed, JSONedAttributes, PK, PrimaryKeyType, Storable, StorableAttributes, UpdatableAttributes } from "./storable";
import { ModelRefWithCreate } from "./relations";


/**
 * This represent the injected methods of Store into the Model
 */
export interface Repository<T extends Storable & Eventable> {
  /**
   * In REST API, composite keys are represented as a string with the format "key1#key2#key3"
   * We need a way to convert this string to the object
   *
   * @param uuid serialized primary key
   */
  fromUUID(uuid: string): PrimaryKeyType<T>;
  /**
   * Get data from the store
   * @param uuid
   * @returns
   */
  get(primaryKey: PrimaryKeyType<T>): Promise<T>;
  /**
   * Refers to the object in the store
   * @param uuid
   */
  ref(uuid: PrimaryKeyType<T>): ModelRefWithCreate<T>;
  /**
   * Extract the primary key from the object
   * @param object to extract the primary key from
   */
  getPrimaryKey(object: any): PrimaryKeyType<T>;
  /**
   * Create data in the store
   * @param uuid
   * @param data
   * @returns
   */
  create(primaryKey: PrimaryKeyType<T>, data: JSONedAttributes<T>): Promise<T>;
  /**
   * Upsert data in the store, creating or updating the object
   * @param uuid
   * @param data
   */
  upsert(primaryKey: PrimaryKeyType<T>, data: JSONedAttributes<T>): Promise<T>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  update<K extends StorableAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: JSONedAttributes<T>,
    conditionField?: K | null,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  patch<K extends StorableAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: Partial<JSONedAttributes<T>>,
    conditionField?: K | null,
    condition?: T[K] | JSONed<T[K]>
  ): Promise<void>;
  /**
   * Query the store
   * @param query
   * @returns
   */
  query(query: string): Promise<T[]>;
  /**
   * Iterate over the store
   * @param query
   * @returns
   */
  iterate(query: string): AsyncGenerator<T>;
  /**
   * Delete data from the store
   * @param uuid
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  delete<K extends StorableAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    conditionField?: K | null,
    condition?: T[K] | JSONed<T[K]>
  ): Promise<void>;
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
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttributes<K extends StorableAttributes<T>, L extends UpdatableAttributes<T, number>>(
    uuid: PrimaryKeyType<T>,
    info: ({ property: L; value?: number } | L)[] | Record<L, number>,
    conditionField?: K | null,
    condition?: T[K] | JSONed<T[K]>
  ): Promise<void>;
  /**
   * Increment attribute of an object
   * @param uuid
   * @param info
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttribute<K extends StorableAttributes<T>, L extends UpdatableAttributes<T, number>>(
    uuid: PrimaryKeyType<T>,
    info: { property: L; value?: number } | L,
    conditionField?: K | null,
    condition?: T[K] | JSONed<T[K]>
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
  upsertItemToCollection<K extends StorableAttributes<T, Array<any>>, L extends keyof ArrayElement<T[K]>>(
    uuid: PrimaryKeyType<T>,
    collection: K,
    item: ArrayElement<T[K]> | JSONed<ArrayElement<T[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<T[K]> extends object ? ArrayElement<T[K]>[L] : ArrayElement<T[K]> | null,
    itemWriteCondition?: ArrayElement<T[K]> extends object ? L : never
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
  deleteItemFromCollection<K extends StorableAttributes<T, Array<any>>, L extends keyof ArrayElement<T[K]>>(
    uuid: PrimaryKeyType<T>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<T[K]>[L]
  ): Promise<void>;
  /**
   * Remove an attribute from an object
   * @param uuid
   * @param attribute
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  removeAttribute<L extends StorableAttributes<T>, K extends UpdatableAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    attribute: K,
    conditionField?: L | null,
    condition?: T[L] | JSONed<T[L]>
  ): Promise<void>;
  /**
   * Set an attribute on an object
   * @param uuid
   * @param attribute
   * @param value
   */
  setAttribute<K extends UpdatableAttributes<T>, L extends StorableAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    attribute: K,
    value: T[K],
    conditionField?: L | null,
    condition?: T[L] | JSONed<T[L]>
  ): Promise<void>;
  on<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void;
  once<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void;
  off<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void;
}


/**
 * This is a simple in-memory repository implementation
 * It is used for testing purposes only
 */
export class MemoryRepository<T extends Storable> implements Repository<T> {
  private storage = new Map<string, string>();
  private events = new Map<keyof T["Events"], Set<(data: any) => void>>();

  constructor(private model: Constructor<T, any[]>) {}

  fromUUID(uuid: string): PK<T, T["PrimaryKey"][number]> {
    return uuid as unknown as PK<T, T["PrimaryKey"][number]>;
  }

  private makeKey(pk: PK<T, T["PrimaryKey"][number]>): string {
    return typeof pk === "object" ? JSON.stringify(pk) : String(pk);
  }

  async get(primaryKey: PK<T, T["PrimaryKey"][number]>): Promise<T> {
    const key = this.makeKey(primaryKey);
    const item = this.storage.get(key);
    console.log("get", key, this.storage.has(key), item);
    if (!item) throw new Error(`Not found: ${key}`);
    return this.unserialize(item);
  }

  getPrimaryKey(object: any): PK<T, T["PrimaryKey"][number]> {
    const pkFields = (object.constructor.PrimaryKey || []) as Array<keyof T>;
    if (pkFields.length === 0) {
      throw new Error("No primary key defined on model");
    }
    if (pkFields.length === 1) {
      return object[pkFields[0]] as PK<T, any>;
    }
    // composite key
    return pkFields.reduce((acc, field) => {
      (acc as any)[field] = object[field];
      return acc;
    }, {} as any);
  }

  async create(primaryKey: PK<T, T["PrimaryKey"][number]>, data: JSONedAttributes<T>): Promise<T> {
    const key = this.makeKey(primaryKey);
    if (this.storage.has(key)) {
      throw new Error(`Already exists: ${key}`);
    }
    console.log("create with (data)", data);
    // @ts-ignore
    const item = new this.model(data).setPrimaryKey(primaryKey);
    console.log("create with (model)", item);
    // if composite PK, caller must include PK fields in data
    this.storage.set(key, this.serialize(item));
    console.log("create", key, this.storage.has(key), item);
    return this.unserialize(this.storage.get(key)!);
  }

  async upsert(primaryKey: PK<T, T["PrimaryKey"][number]>, data: JSONedAttributes<T>): Promise<T> {
    const key = this.makeKey(primaryKey);
    if (this.storage.has(key)) {
      const res = this.unserialize(this.storage.get(key)!);
      Object.assign(res, data as any);
      return res;
    }
    return this.create(primaryKey, data);
  }

  async update<K extends StorableAttributes<T, any>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    data: JSONedAttributes<T>,
    _conditionField?: K | null,
    _condition?: T[K]
  ): Promise<void> {
    const item = await this.get(primaryKey);
    Object.assign(item, data as any);
  }

  async patch<K extends StorableAttributes<T, any>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    data: Partial<JSONedAttributes<T>>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    const item = await this.get(primaryKey);
    Object.assign(item, data as any);
    this.storage.set(this.makeKey(primaryKey), this.serialize(item));
  }

  async query(_q: string): Promise<T[]> {
    return Array.from(this.storage.values()).map(v => this.unserialize(v));
  }

  serialize(item: T): string {
    return JSON.stringify(item);
  }

  unserialize(item: string): T {
    return new this.model(JSON.parse(item));
  }

  async *iterate(_q: string): AsyncGenerator<T> {
    for (const item of this.storage.values()) {
      yield this.unserialize(item);
    }
  }

  async delete<K extends StorableAttributes<T, any>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    this.storage.delete(this.makeKey(primaryKey));
  }

  async exists(primaryKey: PK<T, T["PrimaryKey"][number]>): Promise<boolean> {
    return this.storage.has(this.makeKey(primaryKey));
  }

  async incrementAttributes<K extends StorableAttributes<T, any>, L extends StorableAttributes<T, number>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
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
  }

  async incrementAttribute<K extends StorableAttributes<T, any>, L extends StorableAttributes<T, number>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    info: L | { property: L; value?: number },
    _conditionField?: K | null,
    _condition?: any
  ): Promise<void> {
    await this.incrementAttributes(primaryKey, [info as any]);
  }

  async upsertItemToCollection<K extends StorableAttributes<T, any[]>, L extends keyof ArrayElement<T[K]>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    collection: K,
    item: ArrayElement<T[K]> | JSONed<ArrayElement<T[K]>>,
    index?: number,
    _itemWriteConditionField?: any,
    _itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    if (!(obj as any)[collection]) {
      (obj as any)[collection] = [];
    }
    const arr = (obj as any)[collection] as Array<any>;
    if (typeof index === "number") {
      arr[index] = item;
    } else {
      arr.push(item);
    }
  }

  async deleteItemFromCollection<K extends StorableAttributes<T, any[]>, L extends keyof ArrayElement<T[K]>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    collection: K,
    index: number,
    _itemWriteConditionField?: any,
    _itemWriteCondition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    const arr = (obj as any)[collection] as Array<any>;
    if (Array.isArray(arr) && index >= 0 && index < arr.length) {
      arr.splice(index, 1);
    }
  }

  async removeAttribute<L extends StorableAttributes<T, any>, K extends StorableAttributes<T, any>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    attribute: K,
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    delete (obj as any)[attribute as string];
  }

  async setAttribute<K extends StorableAttributes<T, any>, L extends StorableAttributes<T, any>>(
    primaryKey: PK<T, T["PrimaryKey"][number]>,
    attribute: K,
    value: T[K],
    _conditionField?: L | null,
    _condition?: any
  ): Promise<void> {
    const obj = await this.get(primaryKey);
    (obj as any)[attribute as string] = value;
  }

  on<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener as any);
  }

  once<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void {
    const wrapper = (d: any) => {
      listener(d);
      this.off(event, wrapper as any);
    };
    this.on(event, wrapper as any);
  }

  off<K extends keyof T["Events"]>(event: K, listener: (data: T["Events"][K]) => void): void {
    this.events.get(event)?.delete(listener as any);
  }

  // Optional: trigger events internally
  private emit<K extends keyof T["Events"]>(event: K, data: T["Events"][K]): void {
    this.events.get(event)?.forEach(fn => fn(data));
  }

  public ref(key: PK<T, T["PrimaryKey"][number]>): ModelRefWithCreate<T> {
    return new ModelRefWithCreate<T>(key, this);
  }
}
