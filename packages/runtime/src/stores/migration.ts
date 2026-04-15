import { CoreModel, Inject, Store, StoreFindResult, StoreParameters } from "@webda/core";
import * as WebdaQL from "@webda/ql";

/**
 * Configuration for MigrationStore — specifies the source and destination stores
 */
export class MigrationStoreParameters extends StoreParameters {
  /**
   * From store
   */
  from: string;
  /**
   * To store
   */
  to: string;
}

/**
 * @WebdaModda
 */
export class MigrationStore<
  T extends CoreModel,
  K extends MigrationStoreParameters = MigrationStoreParameters
> extends Store<T, K> {
  @Inject("params:from")
  fromStore: Store<T>;
  @Inject("params:to")
  toStore: Store<T>;

  /**
   * @override
   */
  find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    return this.fromStore.find(query);
  }

  /**
   * Check existence in the source store
   * @param uid - object UUID to check
   * @returns true if the object exists in fromStore
   */
  _exists(uid: string): Promise<boolean> {
    return this.fromStore._exists(uid);
  }

  /**
   * Delete the object from both stores (failures on fromStore are ignored)
   * @param uid - object UUID to delete
   * @param writeCondition - optional optimistic lock value
   * @param itemWriteConditionField - field name for the write condition
   */
  protected async _delete(
    uid: string,
    writeCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<void> {
    await Promise.all([
      this.toStore["_delete"](uid, writeCondition, itemWriteConditionField),
      this.fromStore["_delete"](uid, writeCondition, itemWriteConditionField).catch(_ => {}) // Ignore failure
    ]);
  }

  /**
   * Retrieve an object from the source store
   * @param uid - object UUID to fetch
   * @param raiseIfNotFound - throw NotFound if the object does not exist
   * @returns the model instance from fromStore
   */
  protected _get(uid: string, raiseIfNotFound?: boolean | undefined): Promise<T> {
    return this.fromStore["_get"](uid, raiseIfNotFound);
  }

  /**
   * Retrieve all objects from the source store
   * @param list - optional list of UUIDs to retrieve (all if omitted)
   * @returns array of model instances from fromStore
   */
  getAll(list?: string[] | undefined): Promise<T[]> {
    return this.fromStore.getAll(list);
  }

  /**
   * Update an object in both stores (toStore failures are ignored)
   * @param object - partial object data to update
   * @param uid - object UUID
   * @param itemWriteCondition - optional optimistic lock value
   * @param itemWriteConditionField - field name for the write condition
   * @returns the result from fromStore
   */
  protected async _update(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    return (
      await Promise.all([
        this.fromStore["_update"](object, uid, itemWriteCondition, itemWriteConditionField),
        this.toStore["_update"](object, uid, itemWriteCondition, itemWriteConditionField).catch(_ => {}) // Ignore failure
      ])
    )[0];
  }
  /**
   * Patch an object in both stores (toStore failures are ignored)
   * @param object - partial fields to patch
   * @param uid - object UUID
   * @param itemWriteCondition - optional optimistic lock value
   * @param itemWriteConditionField - field name for the write condition
   * @returns the result from fromStore
   */
  protected async _patch(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    return (
      await Promise.all([
        this.fromStore["_patch"](object, uid, itemWriteCondition, itemWriteConditionField),
        this.toStore["_patch"](object, uid, itemWriteCondition, itemWriteConditionField).catch(_ => {}) // Ignore failure
      ])
    )[0];
  }

  /**
   * Remove an attribute from an object in both stores (toStore failures are ignored)
   * @param uuid - object UUID
   * @param attribute - attribute name to remove
   * @param itemWriteCondition - optional optimistic lock value
   * @param itemWriteConditionField - field name for the write condition
   */
  protected async _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<void> {
    await Promise.all([
      this.fromStore["_removeAttribute"](uuid, attribute, itemWriteCondition, itemWriteConditionField),
      this.toStore["_removeAttribute"](uuid, attribute, itemWriteCondition, itemWriteConditionField).catch(_ => {}) // Ignore failure
    ]);
  }

  /**
   * Save a new object to both stores (toStore failures are ignored)
   * @param object - model instance to persist
   * @returns the result from fromStore
   */
  protected async _save(object: T): Promise<any> {
    return (
      await Promise.all([
        this.fromStore["_save"](object),
        this.toStore["_save"](object).catch(_ => {}) // Ignore failure
      ])
    )[0];
  }

  /**
   * Increment numeric attributes in both stores (toStore failures are ignored)
   * @param uid - object UUID
   * @param params - array of property/value pairs to increment
   * @param updateDate - timestamp to set as the update date
   * @returns the result from fromStore
   */
  protected async _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any> {
    return (
      await Promise.all([
        this.fromStore["_incrementAttributes"](uid, params, updateDate),
        this.toStore["_incrementAttributes"](uid, params, updateDate).catch(_ => {}) // Ignore failure
      ])
    )[0];
  }
  /**
   * Upsert an item in a collection property in both stores (toStore failures are ignored)
   * @param uid - object UUID
   * @param prop - collection property name
   * @param item - item to upsert into the collection
   * @param index - position to insert/update at
   * @param itemWriteCondition - value to match for conditional write
   * @param itemWriteConditionField - field name for the condition
   * @param updateDate - timestamp to set as the update date
   */
  protected async _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    await Promise.all([
      this.fromStore["_upsertItemToCollection"](
        uid,
        prop,
        item,
        index,
        itemWriteCondition,
        itemWriteConditionField,
        updateDate
      ),
      this.toStore["_upsertItemToCollection"](
        uid,
        prop,
        item,
        index,
        itemWriteCondition,
        itemWriteConditionField,
        updateDate
      ).catch(_ => {}) // Ignore failure
    ]);
  }
  /**
   * Delete an item from a collection property in both stores (toStore failures are ignored)
   * @param uid - object UUID
   * @param prop - collection property name
   * @param index - position to delete from
   * @param itemWriteCondition - value to match for conditional write
   * @param itemWriteConditionField - field name for the condition
   * @param updateDate - timestamp to set as the update date
   */
  protected async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    await Promise.all([
      this.fromStore["_deleteItemFromCollection"](
        uid,
        prop,
        index,
        itemWriteCondition,
        itemWriteConditionField,
        updateDate
      ),
      this.toStore["_deleteItemFromCollection"](
        uid,
        prop,
        index,
        itemWriteCondition,
        itemWriteConditionField,
        updateDate
      ).catch(_ => {}) // Ignore failure
    ]);
  }
  /**
   * Load and initialize migration store parameters
   * @param params - raw configuration values
   * @returns initialized MigrationStoreParameters
   */
  loadParameters(params: any): StoreParameters {
    return new MigrationStoreParameters(params, this);
  }

  /**
   * Migrate all objects from fromStore to toStore
   */
  async migrate() {
    this.log("INFO", "Ensuring migrate the store");
    await this.migration("migration", async item => {
      if (!(await this.toStore.exists(item.getUuid()))) {
        return async () => await this.toStore["_save"](item);
      }
    });
  }
}
