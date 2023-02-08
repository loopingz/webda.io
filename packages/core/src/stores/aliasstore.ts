import { CoreModel } from "../models/coremodel";
import { Inject } from "../services/service";
import { WebContext } from "../utils/context";
import { Store, StoreEvents, StoreFindResult, StoreParameters } from "./store";
import { WebdaQL } from "./webdaql/query";

export class AbstractAliasStoreParameters extends StoreParameters {
  /**
   * Store to alias
   */
  targetStore: string;

  constructor(params: any, store: Store) {
    super(params, store);
    this.strict = true;
  }
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

  /**
   * @override
   */
  find(query: WebdaQL.Query): Promise<StoreFindResult<T>> {
    let expr = new WebdaQL.AndExpression([new WebdaQL.ComparisonExpression("=", "__type", this._modelType)]);
    // Will need to check for uuid query
    if (query.filter) {
      expr.children.push(query.filter);
    }
    query.filter = expr;
    return this._targetStore.find(query);
  }

  /**
   * @override
   */
  exists(uid: string): Promise<boolean> {
    return this._targetStore.exists(this.generateUuidFromPublicId(uid));
  }

  /**
   * @override
   */
  async getAll(list?: string[]): Promise<T[]> {
    if (list) {
      return this._targetStore.getAll(list.map(id => this.generateUuidFromPublicId(id)));
    } else {
      // Get all from find
      return this._targetStore.queryAll(`__type = '${this._modelType}'`);
    }
  }

  /**
   * @override
   */
  _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void> {
    // @ts-ignore
    return this._targetStore._removeAttribute(
      this.generateUuidFromPublicId(uuid),
      attribute,
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  /**
   * @override
   */
  _save(object: T): Promise<any> {
    // @ts-ignore
    return this._targetStore._save(object);
  }

  /**
   * @override
   */
  _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    // @ts-ignore
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

  /**
   * @override
   */
  abstract generateUuidFromPublicId(id: string): string;

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound?: boolean | undefined): Promise<T> {
    // @ts-ignore
    return this._targetStore._get(this.generateUuidFromPublicId(uid), raiseIfNotFound);
  }

  /**
   * @override
   */
  async _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string | undefined): Promise<void> {
    // @ts-ignore
    return this._targetStore._delete(this.generateUuidFromPublicId(uid), writeCondition, itemWriteConditionField);
  }

  /**
   * @override
   */
  async _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    // @ts-ignore
    return this._targetStore._deleteItemFromCollection(
      this.generateUuidFromPublicId(uid),
      prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
  }

  /**
   * @override
   */
  async _incrementAttributes(uid: string, ...args): Promise<any> {
    // @ts-ignore
    return this._targetStore._incrementAttributes(this.generateUuidFromPublicId(uid), ...args);
  }

  /**
   * @override
   */
  async _patch(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    // @ts-ignore
    return this._targetStore._patch(
      object,
      this.generateUuidFromPublicId(uid),
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  /**
   * @override
   */
  async _update(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string | undefined
  ): Promise<any> {
    // @ts-ignore
    return this._targetStore._update(
      object,
      this.generateUuidFromPublicId(uid),
      itemWriteCondition,
      itemWriteConditionField
    );
  }

  /**
   * @override
   */
  httpGet(ctx: WebContext<any, any>): Promise<void> {
    ctx.getParameters().id = this.generateUuidFromPublicId(ctx.getParameters().id);
    return super.httpGet(ctx);
  }

  /**
   * @override
   */
  httpAction(ctx: WebContext<any, any>): Promise<void> {
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
 * @WebdaModda
 */
export class AliasStore<
  T extends CoreModel = CoreModel,
  K extends AliasStoreParameters = AliasStoreParameters,
  E extends StoreEvents = StoreEvents
> extends AbstractAliasStore<T, K, E> {
  /**
   * @override
   */
  loadParameters(params: any): StoreParameters {
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
