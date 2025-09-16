import type { ArrayElement } from "@webda/tsc-esm";
import type {
  JSONed,
  SelfJSONed,
  PrimaryKey,
  PrimaryKeyType,
  StorableAttributes,
  UpdatableAttributes,
  WEBDA_EVENTS,
  StorableClass
} from "../storable";
import type { ModelRefWithCreate } from "../relations";

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
   * @param uid serialized primary key
   * @param forceObject if true, the result will be an object with the primary key fields
   */
  fromUID(uid: string, forceObject?: boolean): ModelRefWithCreate<InstanceType<T>>;
  /**
   * Parse the UID into the primary key
   * @param uid
   * @param forceObject
   */
  parseUID(uid: string, forceObject?: boolean): PrimaryKeyType<InstanceType<T>> | PrimaryKey<InstanceType<T>>;
  /**
   * Get data from the store
   * @param uid
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
  getPrimaryKey<K>(
    object: any,
    forceObject?: boolean
  ): K extends false ? PrimaryKeyType<InstanceType<T>> : PrimaryKey<InstanceType<T>>;

  /**
   * Get the UID of the object
   * @param object to extract the primary key from
   */
  getUID(object: any): string;
  /**
   * Create data in the store
   * @param uid
   * @param data
   * @returns
   */
  create(data: ConstructorParameters<T>[0], save?: boolean): Promise<InstanceType<T>>;
  /**
   * Upsert data in the store, creating or updating the object
   * @param uid
   * @param data
   */
  upsert(data: ConstructorParameters<T>[0]): Promise<InstanceType<T>>;
  /**
   * Update data in the store, replacing the object
   * @param uid
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
   * @param uid
   * @param data
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  patch<K extends StorableAttributes<InstanceType<T>>>(
    uid: PrimaryKeyType<InstanceType<T>> | string,
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
   * @param uid
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  delete<K extends StorableAttributes<InstanceType<T>>>(
    uid: PrimaryKeyType<InstanceType<T>> | string,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Verify if the object exists
   * @param uid
   * @returns
   */
  exists(uid: PrimaryKeyType<InstanceType<T>> | string): Promise<boolean>;
  /**
   * Increment attributes of an object
   * @param uid
   * @param info
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttributes<
    K extends StorableAttributes<InstanceType<T>>,
    L extends UpdatableAttributes<InstanceType<T>, number>
  >(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    info: ({ property: L; value?: number } | L)[] | Record<L, number>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Increment attribute of an object
   * @param uid
   * @param info
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  incrementAttribute<
    K extends StorableAttributes<InstanceType<T>>,
    L extends UpdatableAttributes<InstanceType<T>, number>
  >(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    info: { property: L; value?: number } | L,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;
  /**
   * Upsert an item to a collection
   * @param primaryKeyOrUid
   * @param collection
   * @param item
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  upsertItemToCollection<
    K extends StorableAttributes<InstanceType<T>, Array<any>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<InstanceType<T>[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]> extends object
      ? ArrayElement<InstanceType<T>[K]>[L]
      : ArrayElement<InstanceType<T>[K]> | null
  ): Promise<void>;
  /**
   * Delete item from a collection
   * @param primaryKeyOrUid
   * @param collection
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @returns
   */
  deleteItemFromCollection<
    K extends StorableAttributes<InstanceType<T>, Array<any>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void>;
  /**
   * Remove an attribute from an object
   * @param primaryKeyOrUid
   * @param attribute
   * @param conditionField Field to check for condition, if not specified the _lastUpdated field will be used, if null no condition will be checked
   * @param condition Value to check for condition
   * @returns
   */
  removeAttribute<L extends StorableAttributes<InstanceType<T>>, K extends UpdatableAttributes<InstanceType<T>>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    attribute: K,
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
  /**
   * Set an attribute on an object
   * @param primaryKeyOrUid
   * @param attribute
   * @param value
   */
  setAttribute<K extends UpdatableAttributes<InstanceType<T>>, L extends StorableAttributes<InstanceType<T>>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    attribute: K,
    value: InstanceType<T>[K],
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
  on<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void;
  once<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void;
  off<K extends keyof InstanceType<T>[typeof WEBDA_EVENTS]>(
    event: K,
    listener: (data: InstanceType<T>[typeof WEBDA_EVENTS][K]) => void
  ): void;
}
