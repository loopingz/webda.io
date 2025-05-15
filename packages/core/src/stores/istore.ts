import { Attributes, FilterAttributes, ArrayElement } from "@webda/tsc-esm";

/**
 * This represent the injected methods of Store into the Model
 */
export interface StoreHelper<T extends object = object> {
  /**
   * Get data from the store
   * @param uuid
   * @returns
   */
  get(uuid: string): Promise<T>;
  /**
   * Create data in the store
   * @param uuid
   * @param data
   * @returns
   */
  create(uuid: string, data: T): Promise<T>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @returns
   */
  update<K extends Attributes<T>>(uuid: string, data: T, conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @returns
   */
  patch<K extends Attributes<T>>(uuid: string, data: Partial<T>, conditionField?: K, condition?: T[K]): Promise<void>;
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
  delete<K extends Attributes<T>>(uuid: string, conditionField?: K, condition?: T[K]): Promise<void>;
  /**
   * Verify if the object exists
   * @param uuid
   * @returns
   */
  exists(uuid: string): Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uuid
   * @param info
   * @returns
   */
  incrementAttributes<K extends Attributes<T>, L extends FilterAttributes<T, number>>(
    uuid: string,
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
    uuid: string,
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
    uuid: string,
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
    uuid: string,
    attribute: K,
    conditionField?: L,
    condition?: T[L]
  ): Promise<void>;
}

/**
 * A mapping service allow to link two object together
 *
 * Therefore they need to handle the cascadeDelete
 */
export interface MappingService<T = any> {
  newModel(object: any): T;
}
type OmitFirstArg<F> = F extends (x: any, ...args: infer P) => infer R ? (...args: P) => R : never;

/*
export type CRUDHelper<T extends object> = {
  [K in keyof Omit<StoreHelper<T>, "create" | "query" | "get" | "update">]: OmitFirstArg<StoreHelper<T>[K]>;
} & {
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
  upsert(data: T): Promise<T>;
  create(data: T, withSave?: boolean): Promise<T>;
};

export type CRUDModel<T extends object = object> = Omit<CRUDHelper<T>, "upsert" | "create" | "exists" | "update"> &
  T & { save(full?: boolean | keyof T, ...fields: (keyof T)[]): Promise<T> };

*/
