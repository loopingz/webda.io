import { OmitFirstArg } from "@webda/tsc-esm";
import { AbstractModel, ModelAttributes, Pojo, PrimaryKeyType } from "../internal/iapplication";

/**
 * This represent the injected methods of Store into the Model
 */
export interface Repository<T extends AbstractModel> {
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
  update<K extends ModelAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: Pojo<T>,
    conditionField?: K,
    condition?: T[K]
  ): Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @returns
   */
  patch<K extends ModelAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    data: Pojo<T>,
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
  delete<K extends ModelAttributes<T>>(uuid: PrimaryKeyType<T>, conditionField?: K, condition?: T[K]): Promise<void>;
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
  incrementAttributes<K extends ModelAttributes<T>, L extends ModelAttributes<T, number>>(
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
  upsertItemToCollection<K extends ModelAttributes<T, Array<any>>>(
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
  deleteItemFromCollection<K extends ModelAttributes<T, Array<any>>>(
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
  removeAttribute<L extends ModelAttributes<T>, K extends ModelAttributes<T>>(
    uuid: PrimaryKeyType<T>,
    attribute: K,
    conditionField?: L,
    condition?: T[L]
  ): Promise<void>;
}

export type NonDeclarativeModel<T extends AbstractModel> = {
  [K in keyof Omit<T, "Events" | "PrimaryKey" | "Class" | "__dirty">]: T[K];
};

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
  setAttribute<K extends ModelAttributes<T>, L extends ModelAttributes<T>>(
    property: K,
    value: T[K],
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  incrementAttribute<K extends ModelAttributes<T, number>, L extends ModelAttributes<T>>(
    property: K,
    value?: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: T[L]
  ): Promise<void>;
  upsert(data: Pojo<T>): Promise<T>;
  create(data: Pojo<T>, withSave?: boolean): Promise<T>;
};
