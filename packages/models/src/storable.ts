import { ArrayElement, FilterAttributes, IsUnion } from "@webda/tsc-esm";
import { ModelRelated } from "./relations";

/**
 * A Storable object is an object that can be stored in a database or anywhere else
 * and can be retrieved later
 *
 * It has a primary key, a toJSON method and an Events object
 *
 */
export interface Storable<T = any, K extends keyof T = any, U = any> {
  PrimaryKey: readonly K[];
  getPrimaryKey(): IsUnion<K> extends true ? Pick<T, K> : T[K];
  /**
   * Return the object as a POJO
   */
  toJSON(): any;
  /**
   * Events is a type-only object?
   */
  Events: U;
  __dirty?: Set<string>;
}

/**
 * Internal type to get the JSONed type of an object
 * @ignore
 */
type JSONedInternal<T> = T extends { toJSON: () => any } ? ReturnType<T["toJSON"]> : T;
/**
 * If object have a toJSON method take the return type of this method
 * otherwise return the object
 */
export type JSONed<T> = T extends object
  ? Omit<JSONedInternal<T>, FilterAttributes<T, ModelRelated<any>>>
  : JSONedInternal<T>;

/**
 * Define a JSONed without refering to its own toJSON
 *
 * To be used within the model definition
 */
export type JSONedAttributes<T extends Storable> = {
  [P in StorableAttributes<T>]: JSONed<T[P]>;
};

/**
 * If object have a toDTO method take the return type of this method
 * otherwise return the object
 */
export type DTOed<T> = T extends { toDTO: () => any } ? ReturnType<T["toDTO"]> : JSONed<T>;

/**
 * Get the type of one key or a Pick of the object is multiple keys provided
 */
export type PK<K, T extends keyof K> = IsUnion<T> extends true ? Pick<K, T> : K[T];
/**
 * Get the primary key type of the object
 *
 * The main difference with the PrimaryKey<T> type is that if the primary key is a not union type, it will
 * be returned as a single type, otherwise it will be returned as a Pick type
 *
 * The PrimaryKey<T> will always return a Pick type
 */
export type PrimaryKeyType<T extends Storable<any, any>> = PK<T, T["PrimaryKey"][number]>;
/**
 * Get the primary key of the object
 *
 * The main difference with the PrimaryKeyType<T> type is that it will always return a Pick type
 *
 * The PrimaryKeyType<T> will return a Pick type only if the primary key is a union type
 */
export type PrimaryKey<T extends Storable<any, any>> = Pick<T, T["PrimaryKey"][number]>;

/**
 * Compare two primary keys for equality
 * @param a
 * @param b
 * @returns
 */
export function PrimaryKeyEquals(a: PrimaryKey<any>, b: PrimaryKey<any>): boolean {
  if (a instanceof Object && b instanceof Object) {
    return Object.keys(a).every(key => a[key] === b[key]);
  }
  return a === b;
}

/**
 * Map type to only numeric properties
 */
export type OnlyNumbers<T> = {
  [K in keyof T as T[K] extends number ? K : never]: T[K];
};

export type Pojo<T extends object> = {
  [P in keyof Omit<T, FilterAttributes<T, Function>>]: JSONed<T[P]>;
};

/**
 * Check if the object is a Storable object
 * @param object
 * @returns
 */
export function isStorable<T = any>(object: any): object is Storable<T> {
  return typeof object.getPrimaryKey === "function" && Array.isArray(object.PrimaryKey);
}

/**
 * Get the model attributes without the internal properties
 */
export type StorableAttributes<T extends Storable, U = any> = FilterAttributes<
  Omit<T, "Events" | "__dirty" | "PrimaryKey" | FilterAttributes<T, Function>>,
  U
>;

type Eventable = {
  Events: any;
};

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
  create(primaryKey: PrimaryKeyType<T>, data: Pojo<T>): Promise<T>;
  /**
   * Upsert data in the store, creating or updating the object
   * @param uuid
   * @param data
   */
  upsert(primaryKey: PrimaryKeyType<T>, data: Pojo<T>): Promise<T>;
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
    data: Pojo<T>,
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
    data: Partial<Pojo<T>>,
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
  incrementAttributes<K extends StorableAttributes<T>, L extends StorableAttributes<T, number>>(
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
  incrementAttribute<K extends StorableAttributes<T>, L extends StorableAttributes<T, number>>(
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
  removeAttribute<L extends StorableAttributes<T>, K extends StorableAttributes<T>>(
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
  setAttribute<K extends StorableAttributes<T>, L extends StorableAttributes<T>>(
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
