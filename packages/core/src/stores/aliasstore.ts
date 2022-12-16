import { CoreModel } from "../models/coremodel";
import { Inject } from "../services/service";
import { Context } from "../utils/context";
import { Store, StoreEvents, StoreFindResult, StoreParameters } from "./store";
import { WebdaQL } from "./webdaql/query";

export class AbstractAliasStoreParameters extends StoreParameters {
  /**
   * Store to alias
   */
  targetStore: string;
}

/**
 * AliasStore allow to expose a Store as another route with another model
 * This is useful to store small collection in the registry
 *
 * The RegistryStore will default to a model, then specific models from the
 * target collection can be exposed via an endpoint like users
 *
 */
export abstract class AbstractAliasStore<
  T extends CoreModel,
  K extends AliasStoreParameters,
  E extends StoreEvents
> extends Store<T, K, E> {
  @Inject("params:targetStore")
  _targetStore: Store<T>;

  find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    // Will need to check for uuid query
    return this._targetStore.find(query);
  }

  exists(uid: string): Promise<boolean> {
    return this._targetStore.exists(this.generateUuidFromPublicId(uid));
  }

  async getAll(list?: string[]): Promise<T[]> {
    if (list) {
      return this._targetStore.getAll(list.map(id => this.generateUuidFromPublicId(id)));
    } else {
      // Get all from find
      return this._targetStore.queryAll(`__type = '${this._modelType}'`);
    }
  }

  _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void> {
    return this._targetStore._removeAttribute(
      this.generateUuidFromPublicId(uuid),
      attribute,
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  _save(object: T): Promise<any> {
    return this._targetStore.save(object);
  }

  _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    return this._targetStore._upsertItemToCollection(
      this.generateUuidFromPublicId(uid),
      prop,
      item,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
  }

  abstract generateUuidFromPublicId(id: string): string;

  async _get(uid: string, raiseIfNotFound?: boolean | undefined): Promise<T> {
    return this._targetStore._get(this.generateUuidFromPublicId(uid), raiseIfNotFound);
  }

  async _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string | undefined): Promise<void> {
    return this._targetStore._delete(this.generateUuidFromPublicId(uid), writeCondition, itemWriteConditionField);
  }

  async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    return this._targetStore._deleteItemFromCollection(
      this.generateUuidFromPublicId(uid),
      prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
  }

  async _incrementAttribute(uid: string, prop: string, value: number, updateDate: Date): Promise<any> {
    return this._targetStore._incrementAttribute(this.generateUuidFromPublicId(uid), prop, value, updateDate);
  }

  async _patch(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    return this._targetStore._patch(
      object,
      this.generateUuidFromPublicId(uid),
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  async _update(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    return this._targetStore._update(
      object,
      this.generateUuidFromPublicId(uid),
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  httpGet(ctx: Context<any, any>): Promise<void> {
    ctx.getParameters().id = this.generateUuidFromPublicId(ctx.getParameters().id);
    return super.httpGet(ctx);
  }

  httpAction(ctx: Context<any, any>): Promise<void> {
    ctx.getParameters().id = this.generateUuidFromPublicId(ctx.getParameters().id);
    return super.httpAction(ctx);
  }
}

export class AliasStoreParameters extends AbstractAliasStoreParameters {
  /**
   * Store to alias
   */
  idTemplate: string;
}
/**
 * AliasStore allow to expose a Store as another route with another model
 * This is useful to store small collection in the registry
 *
 * The RegistryStore will default to a model, then specific models from the
 * target collection can be exposed via an endpoint like users
 *
 */
export class AliasStore<
  T extends CoreModel,
  K extends AliasStoreParameters,
  E extends StoreEvents
> extends AbstractAliasStore<T, K, E> {
  /**
   * @override
   */
  loadParameters(params: any): StoreParameters {
    this.log("INFO", "Parameters", params);
    return new AliasStoreParameters(params, this);
  }

  /**
   * Use the idTemplate parameter to generate uuid
   * @override
   */
  generateUuidFromPublicId(id: string): string {
    return this.parameters.idTemplate.replace(/\{id\}/g, id);
  }
}
