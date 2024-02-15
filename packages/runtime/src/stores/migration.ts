import { CoreModel, Inject, Store, StoreFindResult, StoreParameters } from "@webda/core";
import * as WebdaQL from "@webda/ql";

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
   *
   * @param uid
   */
  _exists(uid: string): Promise<boolean> {
    return this.fromStore._exists(uid);
  }

  /**
   * Delete on both
   * @param uid
   * @param writeCondition
   * @param itemWriteConditionField
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

  protected _get(uid: string, raiseIfNotFound?: boolean | undefined): Promise<T> {
    return this.fromStore["_get"](uid, raiseIfNotFound);
  }

  getAll(list?: string[] | undefined): Promise<T[]> {
    return this.fromStore.getAll(list);
  }

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

  protected async _save(object: T): Promise<any> {
    return (
      await Promise.all([
        this.fromStore["_save"](object),
        this.toStore["_save"](object).catch(_ => {}) // Ignore failure
      ])
    )[0];
  }

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
   *
   * @param params
   * @returns
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
