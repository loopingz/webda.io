import type { ArrayElement } from "@webda/tsc-esm";
import type {
  PrimaryKey,
  PrimaryKeyType,
  StorableAttributes,
  UpdatableAttributes,
  WEBDA_EVENTS,
  ModelClass,
  PrimaryKeyAttributes
} from "../storable";
import type { Helpers, JSONed, SelfJSONed } from "../types";
import type { ModelRefWithCreate } from "../relations";

export const WEBDA_TEST = Symbol("webda_test");

/**
 * Core repository interface - every repository must implement this
 *
 * Contains only the essential CRUD operations that work across
 * all storage backends (SQL, NoSQL, in-memory, etc.)
 */
export interface CoreRepository<T extends ModelClass = ModelClass> {
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
   * Extract the primary key from the object
   * @param object to extract the primary key from
   * @param forceObject if true, the result will be an object with the primary key fields
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
   * Remove the primary key from the object
   * @param object
   */
  excludePrimaryKey(object: any): any;

  /**
   * Refers to the object in the store
   * @param pk primary key
   */
  ref(pk: PrimaryKeyType<InstanceType<T>>): ModelRefWithCreate<InstanceType<T>>;

  /**
   * Get data from the store
   * @param primaryKey
   * @returns
   */
  get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<Helpers<InstanceType<T>>>;

  /**
   * Create data in the store
   * @param data
   * @param save if false, create in-memory object without saving
   * @returns
   */
  create(data: Helpers<InstanceType<T>>, save?: boolean): Promise<InstanceType<T>>;

  /**
   * Delete data from the store
   * @param uid - Primary key or UID string
   * @param conditionField - Field to check for condition (optional)
   * @param condition - Value to check for condition (optional)
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
   * Event listeners
   */
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

  [WEBDA_TEST]?: {
    clear(): Promise<void>;
  };
}

/**
 * Update operations with optimistic locking support
 *
 * Most repositories should implement this to support updates
 */
export interface Updatable<T extends ModelClass = ModelClass> {
  /**
   * Replace entire object (full update)
   * @param data - Complete object data including primary key
   * @param conditionField - Field to check for optimistic locking (null = no check)
   * @param condition - Expected value for condition field
   */
  update<K extends StorableAttributes<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K]
  ): Promise<void>;

  /**
   * Partially update object (only specified fields)
   * @param uid - Primary key of object to update
   * @param data - Partial object data (only fields to update)
   * @param conditionField - Field to check for optimistic locking (null = no check)
   * @param condition - Expected value for condition field
   */
  patch<K extends StorableAttributes<InstanceType<T>>>(
    uid: PrimaryKeyType<InstanceType<T>> | string,
    data: Partial<Omit<InstanceType<T>, PrimaryKeyAttributes<InstanceType<T>>>>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;

  /**
   * Create or update object (insert if not exists, update if exists)
   */
  upsert(data: Helpers<InstanceType<T>>): Promise<InstanceType<T>>;
}

/**
 * Atomic operations for NoSQL databases
 *
 * Only implement this for storage backends that support atomic updates
 * (DynamoDB, MongoDB, Redis, etc.)
 *
 * SQL databases should NOT implement this - use transactions instead
 */
export interface AtomicOperations<T extends ModelClass = ModelClass> {
  /**
   * Atomically increment numeric field(s)
   * @param primaryKeyOrUid - Primary key of object to update
   * @param info - Fields to increment with optional values (default: 1)
   * @param conditionField - Field to check for condition
   * @param condition - Expected value for condition field
   */
  incrementAttributes<K extends StorableAttributes<InstanceType<T>>, L extends UpdatableAttributes<InstanceType<T>, number>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    info: ({ property: L; value?: number } | L)[] | Record<L, number>,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;

  /**
   * Atomically increment a single numeric field
   * @param primaryKeyOrUid - Primary key of object to update
   * @param info - Field to increment with optional value (default: 1)
   * @param conditionField - Field to check for condition
   * @param condition - Expected value for condition field
   */
  incrementAttribute<K extends StorableAttributes<InstanceType<T>>, L extends UpdatableAttributes<InstanceType<T>, number>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    info: { property: L; value?: number } | L,
    conditionField?: K | null,
    condition?: InstanceType<T>[K] | JSONed<InstanceType<T>[K]>
  ): Promise<void>;

  /**
   * Atomically set a single attribute value
   * @param primaryKeyOrUid - Primary key of object to update
   * @param attribute - Attribute name to set
   * @param value - New value for attribute
   * @param conditionField - Field to check for condition
   * @param condition - Expected value for condition field
   */
  setAttribute<K extends UpdatableAttributes<InstanceType<T>>, L extends StorableAttributes<InstanceType<T>>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    attribute: K,
    value: InstanceType<T>[K],
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;

  /**
   * Atomically remove an attribute
   * @param primaryKeyOrUid - Primary key of object to update
   * @param attribute - Attribute name to remove
   * @param conditionField - Field to check for condition
   * @param condition - Expected value for condition field
   */
  removeAttribute<L extends StorableAttributes<InstanceType<T>>, K extends UpdatableAttributes<InstanceType<T>>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    attribute: K,
    conditionField?: L | null,
    condition?: InstanceType<T>[L] | JSONed<InstanceType<T>[L]>
  ): Promise<void>;
}

/**
 * Collection operations for nested arrays
 *
 * Only implement this for storage backends that support atomic array operations
 * (DynamoDB, MongoDB, etc.)
 */
export interface CollectionOperations<T extends ModelClass = ModelClass> {
  /**
   * Add or update item in a collection (array field)
   * @param primaryKeyOrUid - Primary key of object containing the collection
   * @param collection - Name of the array field
   * @param item - Item to add/update
   * @param index - Position to insert (undefined = append to end)
   * @param itemWriteConditionField - Field to check for condition on item
   * @param itemWriteCondition - Expected value for condition field on item
   */
  upsertItemToCollection<K extends StorableAttributes<InstanceType<T>, Array<any>>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
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
   * Remove item from a collection by index
   * @param primaryKeyOrUid - Primary key of object containing the collection
   * @param collection - Name of the array field
   * @param index - Position of item to remove
   * @param itemWriteConditionField - Field to check for condition on item
   * @param itemWriteCondition - Expected value for condition field on item
   */
  deleteItemFromCollection<K extends StorableAttributes<InstanceType<T>, Array<any>>, L extends keyof ArrayElement<InstanceType<T>[K]>>(
    primaryKeyOrUid: PrimaryKeyType<InstanceType<T>> | string,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void>;
}

/**
 * Type guard to check if repository supports atomic operations
 */
export function supportsAtomicOperations<T extends ModelClass>(
  repo: CoreRepository<T>
): repo is CoreRepository<T> & AtomicOperations<T> {
  return typeof (repo as any).incrementAttribute === "function";
}

/**
 * Type guard to check if repository supports collection operations
 */
export function supportsCollectionOperations<T extends ModelClass>(
  repo: CoreRepository<T>
): repo is CoreRepository<T> & CollectionOperations<T> {
  return typeof (repo as any).upsertItemToCollection === "function";
}

/**
 * Full-featured repository combining all capabilities (backward compatible)
 *
 * This is the main interface that most code will interact with.
 * It extends all specialized interfaces for backward compatibility.
 *
 * Note: All methods are inherited from:
 * - CoreRepository: Basic CRUD, query, and key management
 * - Updatable: Update, patch, and upsert operations
 * - AtomicOperations: Atomic increment, setAttribute, removeAttribute
 * - CollectionOperations: Array/collection manipulation
 */
export interface Repository<T extends ModelClass = ModelClass> extends CoreRepository<T>, Updatable<T>, AtomicOperations<T>, CollectionOperations<T> {
  // All methods are inherited from the extended interfaces
  // This empty interface body maintains backward compatibility while using the new segregated design
}
