/**
 * This represent the injected methods of Store into the Model
 */
export interface StoreHelper<T = any> {
  /**
   * Get data from the store
   * @param uuid
   * @returns
   */
  get: (uuid: string) => Promise<T>;
  /**
   * Create data in the store
   * @param uuid
   * @param data
   * @returns
   */
  create: (uuid: string, data: T) => Promise<T>;
  /**
   * Update data in the store, replacing the object
   * @param uuid
   * @param data
   * @returns
   */
  update: (uuid: string, data: T, conditionField?: string, condition?: any) => Promise<void>;
  /**
   * Patch data in the store, patching the object
   * @param uuid
   * @param data
   * @returns
   */
  patch: (uuid: string, data: T, conditionField?: string, condition?: any) => Promise<void>;
  /**
   * Query the store
   * @param query
   * @returns
   */
  query: (query: string) => Promise<T[]>;
  /**
   * Delete data from the store
   * @param uuid
   * @returns
   */
  delete: (uuid: string, conditionField?: string, condition?: any) => Promise<void>;
  /**
   * Verify if the object exists
   * @param uuid
   * @returns
   */
  exists: (uuid: string) => Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uuid
   * @param info
   * @returns
   */
  incrementAttributes: (
    uuid: string,
    info: { property: string; value?: number }[],
    conditionField?: string,
    condition?: any
  ) => Promise<Date>;
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
  upsertItemToCollection: (
    uuid: string,
    collection: string,
    item: any,
    index?: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ) => Promise<void>;
  /**
   * Delete item from a collection
   * @param uuid
   * @param collection
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  deleteItemFromCollection: (
    uuid: string,
    collection: string,
    index: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ) => Promise<void>;
  /**
   * Remove an attribute from an object
   * @param uuid
   * @param attribute
   * @returns
   */
  removeAttribute: (uuid: string, attribute: string, conditionField?: string, condition?: any) => Promise<void>;
}
