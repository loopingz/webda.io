import { Counter, Histogram } from "../metrics/metrics";
import type { ConfigurationProvider } from "../services/configuration";
import * as WebdaError from "../errors/errors";
import { Throttler } from "../utils/throttler";

import type { CoreModel } from "../models/coremodel";
import type { RawModel, CoreModelDefinition } from "../application/iapplication";
import { Service } from "../services/service";
import * as WebdaQL from "@webda/ql";
import { runAsSystem, useContext } from "../contexts/execution";
import { ServiceParameters } from "../services/iservices";
import { MappingService } from "./istore";
import { useApplication, useModel, useModelId } from "../application/hook";
import { useRegistry } from "../models/registry";
import { useLog } from "../loggers/hooks";

export class StoreNotFoundError extends WebdaError.CodeError {
  constructor(uuid: string, storeName: string) {
    super("STORE_NOTFOUND", `Item not found ${uuid} Store(${storeName})`);
  }
}

export class UpdateConditionFailError extends WebdaError.CodeError {
  constructor(uuid: string, conditionField: string, condition: string | Date) {
    super(
      "STORE_UPDATE_CONDITION_FAILED",
      `UpdateCondition not met on ${uuid}.${conditionField} === ${
        condition instanceof Date ? condition.toISOString() : condition
      }`
    );
  }
}

interface EventStore {
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Object id
   */
  object_id: string;
  /**
   * Store emitting
   */
  store: Store;
}
/**
 * Event called before save of an object
 */
export interface EventStoreCreated extends EventStore {}

/**
 * Event called after delete of an object
 */
export interface EventStoreDeleted extends EventStore {}

/**
 * Event called after update of an object
 */
export interface EventStoreUpdated extends EventStore {
  /**
   * Update content
   */
  update: any;

  /**
   * Object uuid
   */
  object_id: string;
  /**
   * Object before update
   */
  previous: any;
}
/**
 * Event called after patch update of an object
 */
export interface EventStorePatchUpdated extends EventStoreUpdated {}
/**
 * Event called after partial update of an object
 */
export interface EventStorePartialUpdated<T extends CoreModel = CoreModel> {
  /**
   * Object uuid
   */
  object_id: string;
  /**
   * Emitting store
   */
  store: Store<any>;
  /**
   * Update date
   */
  updateDate?: Date;
  /**
   * Info on the update
   */
  partial_update: {
    /**
     * If incremental update
     */
    increments?: {
      /**
       * Increment value
       */
      value: number;
      /**
       * Property to increment
       */
      property: string;
    }[];
    /**
     * Add item to a collection
     */
    addItem?: {
      /**
       * Item to add
       */
      value: any;
      /**
       * Collection name
       */
      property: string;
      /**
       * Index to add
       */
      index: number;
    };
    /**
     * If this is a patch
     */
    patch?: any;
    /**
     * Delete an item from collection
     */
    deleteItem?: {
      /**
       * Collection name
       */
      property: string;
      /**
       * Index in the collection
       */
      index: number;
    };
    deleteAttribute?: string;
  };
}

/**
 * Represent a query result on the Store
 */
export interface StoreFindResult<T> {
  /**
   * Current result objects
   */
  results: T[];
  /**
   * Continuation Token if more results are available
   */
  continuationToken?: string;
  /**
   * Remaining filtering to do as current store cannot filter
   *
   * If `true`, no more filtering is required apart from permissions
   * If `filter === undefined`, a full postquery filtering will happen
   * Otherwise filter.eval while be used on every results
   */
  filter?: WebdaQL.Expression | true;
}

/**
 * A Store is low-level storage service
 *
 * It does not handle any business logic, only CRUD operations
 */
export interface StoreInterface {
  create(uuid: string, object: any): Promise<any>;
  get(uuid: string): Promise<any>;
  update(uuid: string, object: any): Promise<any>;
  delete(uuid: string): Promise<void>;
  exists(uuid: string): Promise<boolean>;
  setAttribute(uuid: string, attribute: string, value: any): Promise<void>;
  removeAttribute(uuid: string, attribute: string): Promise<void>;
  upsertItemToCollection(
    uuid: string,
    collection: string,
    item: any,
    index?: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<void>;
  deleteItemFromCollection(
    uuid: string,
    collection: string,
    index: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<void>;
  find(query: string): Promise<StoreFindResult<any>>;
  query(query: string): Promise<StoreFindResult<any>>;
  iterate(query: string): AsyncGenerator;
  incrementAttributes(uuid: string, info: { property: string; value?: number }[]): Promise<Date>;
}

/**
 * Store parameter
 */
export class StoreParameters extends ServiceParameters {
  /**
   * Webda model to use within the Store
   *
   * @default "Webda/CoreModel"
   */
  model?: string;
  /**
   * Additional models
   *
   * Allow this store to manage other models
   *
   * @default []
   */
  additionalModels?: string[];

  /**
   * Allow to load object that does not have the type data
   *
   * If set to true, then the Store will only managed the defined _model and no
   * model extending this one
   *
   * @default false
   */
  strict?: boolean;
  /**
   * When __type model not found, use the model
   * If strict is setup this parameter is not used
   *
   * @default true
   */
  defaultModel?: boolean;
  /**
   * If set, Store will ignore the __type
   *
   * @default false
   */
  forceModel?: boolean;
  /**
   * Slow query threshold
   *
   * @default 30000
   */
  slowQueryThreshold: number;
  /**
   * Model Aliases to allow easier rename of Model
   */
  modelAliases?: { [key: string]: string };
  /**
   * Disable default memory cache
   */
  noCache?: boolean;

  constructor(params: any, service: Service<any>) {
    super(params);
    this.model ??= "Webda/CoreModel";
    this.strict ??= false;
    this.defaultModel ??= true;
    this.forceModel ??= false;
    this.slowQueryThreshold ??= 30000;
    this.modelAliases ??= {};
    this.additionalModels ??= [];
    // REFACTOR >= 5
    if (params.expose) {
      throw new Error("Expose is not supported anymore, use DomainService instead");
    }
    // END_REFACTOR
  }
}

export type StoreEvents = {
  "Store.PartialUpdated": EventStorePartialUpdated;
  "Store.Created": EventStoreCreated;
  "Store.PatchUpdated": EventStorePatchUpdated;
  "Store.Updated": EventStoreUpdated;
  "Store.Deleted": EventStoreDeleted;
};

/**
 * This class handle NoSQL storage and mapping (duplication) between NoSQL object
 *
 * It emits events :
 *   Store.Save: Before saving the object
 *   Store.Saved: After saving the object
 *   Store.Update: Before updating the object
 *   Store.Updated: After updating the object
 *   Store.Delete: Before deleting the object
 *   Store.Deleted: After deleting the object
 *   Store.Get: When getting the object
 *   Store.Action: When an action will be done on an object
 *   Store.Actioned: When an action has been done on an object
 *
 * @category CoreServices
 */
abstract class Store<K extends StoreParameters = StoreParameters, E extends StoreEvents = StoreEvents>
  extends Service<K, E>
  implements ConfigurationProvider
{
  /**
   * Cache store
   */
  _cacheStore: Store;
  /**
   * Contain the reverse map
   */
  _reverseMap: { mapper: MappingService; property: string }[] = [];
  /**
   * Contains the current model
   */
  _model: CoreModelDefinition;
  /**
   * Store teh manager hierarchy with their depth
   */
  _modelsHierarchy: { [key: string]: number } = {};
  /**
   * Contains the current model type
   */
  _modelType: string;
  /**
   * Contain the model uuid field
   */
  protected _uuidField: string = "uuid";
  /**
   * Add metrics counter
   * ' UNION SELECT name, tbl_name as email, "" as col1, "" as col2, "" as col3, "" as col4, "" as col5, "" as col6, "" as col7, "" as col8 FROM sqlite_master --
   * {"email":"' UNION SELECT name as profileImage, tbl_name as email, '' AS column3 FROM sqlite_master --","password":"we"}
   */
  declare metrics: {
    cache_invalidations: Counter;
    operations_total: Counter;
    slow_queries_total: Counter;
    cache_hits: Counter;
    queries: Histogram;
  };

  /**
   * Load the parameters for a service
   */
  abstract loadParameters(params: any): StoreParameters;

  /**
   * Retrieve the Model
   *
   * @throws Error if model is not found
   */
  computeParameters(): void {
    super.computeParameters();
    const app = useApplication();
    const p = this.parameters;
    this._model = useModel(p.model);
    this._modelType = this._model.Metadata.Identifier;
    this._uuidField = this._model.getUuidField();
    if (!this.parameters.noCache) {
      this._cacheStore = <Store>new (app.getModda("Webda/MemoryStore"))(`_${this.getName()}_cache`, <StoreParameters>{
        model: this.parameters.model
      });
      this._cacheStore.computeParameters();
      this._cacheStore.initMetrics();
      this.cacheStorePatchException();
    }
    const recursive = (tree: CoreModelDefinition[], depth) => {
      for (const model of tree) {
        this._modelsHierarchy[model.Metadata.Identifier] ??= depth;
        this._modelsHierarchy[model.Metadata.Identifier] = Math.min(
          depth,
          this._modelsHierarchy[model.Metadata.Identifier]
        );
        recursive(model.Metadata.Subclasses, depth + 1);
      }
    };
    // Compute the hierarchy
    this._modelsHierarchy[this._model.Metadata.Identifier] = 0;
    // Strict Store only store their model
    if (!this.parameters.strict) {
      recursive(this._model.Metadata.Subclasses, 1);
    }
    // Add additional models
    if (this.parameters.additionalModels.length) {
      // Strict mode is to only allow one model per store
      if (this.parameters.strict) {
        this.log("ERROR", "Cannot add additional models in strict mode");
      } else {
        for (const modelType of this.parameters.additionalModels) {
          const model = useModel(modelType);
          this._modelsHierarchy[model.Metadata.Identifier] = 0;
          recursive(model.Metadata.Subclasses, 1);
        }
      }
    }
  }

  logSlowQuery(_query: string, _reason: string, _time: number) {
    // TODO Need to implement: https://github.com/loopingz/webda.io/issues/202
  }

  /**
   * Invalidate a cache entry
   * @param uid
   */
  async invalidateCache(uid: string): Promise<void> {
    if (this._cacheStore) {
      this.metrics.cache_invalidations.inc();
      await this._cacheStore.delete(uid);
    }
  }

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.operations_total = this.getMetric(Counter, {
      name: "operations_total",
      help: "Operations counter for this store",
      labelNames: ["operation"]
    });
    this.metrics.slow_queries_total = this.getMetric(Counter, {
      name: "slow_queries",
      help: "Number of slow queries encountered"
    });
    this.metrics.cache_invalidations = this.getMetric(Counter, {
      name: "cache_invalidations",
      help: "Number of cache invalidation encountered"
    });
    this.metrics.cache_hits = this.getMetric(Counter, {
      name: "cache_hits",
      help: "Number of cache hits"
    });
    this.metrics.queries = this.getMetric(Histogram, {
      name: "queries",
      help: "Query duration"
    });
  }

  /**
   * Return Store current model
   * @returns
   */
  getModel(): CoreModelDefinition {
    return this._model;
  }

  /**
   * Return if a model is handled by the store
   * @param model
   * @return distance from the managed class -1 means not managed, 0 manage exactly this model, >0 manage an ancestor model
   *
   */
  handleModel(model: CoreModelDefinition | CoreModel): number {
    const name = useModelId(model, true);
    return this._modelsHierarchy[name] ?? -1;
  }

  /**
   * Get From Cache or main
   * @param uuid
   * @param raiseIfNotFound
   * @returns
   */
  async _getFromCache(uuid: string, raiseIfNotFound: boolean = false): Promise<any> {
    let res = await this._cacheStore?._get(uuid);
    if (!res) {
      res = await this._get(uuid, raiseIfNotFound);
      if (res) {
        await this._cacheStore?._create(uuid, res);
      }
    } else {
      this.metrics.cache_hits.inc();
    }
    return res;
  }

  /**
   * Get object from store
   * @param uid
   * @returns
   */
  async getObject(uid: string): Promise<any> {
    this.metrics.operations_total.inc({ operation: "get" });
    return this._getFromCache(uid);
  }

  static getOpenAPI() {}

  /**
   * OVerwrite the model
   * Used mainly in test
   */
  setModel(model: CoreModelDefinition) {
    this._model = model;
    this._cacheStore?.setModel(model);
    this.parameters.strict = false;
  }

  /**
   * We should ignore exception from the store
   */
  cacheStorePatchException() {
    const replacer = original => {
      return (...args) => {
        return original
          .bind(this._cacheStore, ...args)()
          .catch(err => {
            this.log("TRACE", `Ignoring cache exception ${this.name}: ${err.message}`);
          });
      };
    };
    for (const i of [
      "_get",
      "_patch",
      "_update",
      "_delete",
      "_incrementAttributes",
      "_upsertItemToCollection",
      "_deleteItemFromCollection",
      "_removeAttribute"
    ]) {
      this._cacheStore[i] = replacer(this._cacheStore[i]);
    }
  }

  /**
   * Add reverse map information
   *
   * @param prop
   * @param cascade
   * @param store
   */
  addReverseMap(prop: string, store: MappingService) {
    this._reverseMap.push({
      property: prop,
      mapper: store
    });
  }

  /**
   * Increment attributes of an object
   *
   * @param uid
   * @param info
   * @returns
   * @deprecated
   */
  async incrementAttributes(uid: string, info: { property: string; value?: number }[]) {
    const params = <{ property: string; value: number }[]>info
      .map(i => {
        i.value ??= 1;
        return i;
      })
      .filter(i => i.value !== 0);
    // If value === 0 no need to update anything
    if (params.length === 0) {
      return;
    }
    const updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "increment" });
    await this._incrementAttributes(uid, params, updateDate);
    const evt = {
      object_id: uid,
      store: this,
      updateDate,
      partial_update: {
        increments: params
      }
    };
    await this.emitStoreEvent("Store.PartialUpdated", evt);
    return updateDate;
  }

  /**
   * Add or update an item to an array in the model
   *
   * @param uid of the model
   * @param prop of the model to add in
   * @param item to add in the array
   * @param index if specified update item in this index
   * @param itemWriteCondition value of the condition to test (in case of update)
   * @param itemWriteConditionField field to read the condition from (in case of update)
   * @deprecated
   */
  async upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number = undefined,
    itemWriteConditionField: string = this._uuidField,
    itemWriteCondition: any = undefined
  ) {
    const updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "collectionUpsert" });
    await this._upsertItemToCollection(
      uid,
      <string>prop,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition,
      updateDate
    );
    await this.emitStoreEvent("Store.PartialUpdated", {
      object_id: uid,
      store: this,
      updateDate,
      partial_update: {
        addItem: {
          value: item,
          property: <string>prop,
          index: index
        }
      }
    });
    return updateDate;
  }

  /**
   * Remove an item from an array in the model
   *
   * @param uid of the model
   * @param prop of the model to remove from
   * @param index of the item to remove in the array
   * @param itemWriteCondition value of the condition
   * @param itemWriteConditionField field to read the condition from
   * @deprecated
   */
  async deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteConditionField: string = this._uuidField,
    itemWriteCondition?: any
  ) {
    const updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "collectionDelete" });
    await this._deleteItemFromCollection(
      uid,
      <string>prop,
      index,
      itemWriteConditionField,
      itemWriteCondition,
      updateDate
    );
    await this.emitStoreEvent("Store.PartialUpdated", {
      object_id: uid,
      store: this,
      updateDate,
      partial_update: {
        deleteItem: {
          property: <string>prop,
          index: index
        }
      }
    });
    return updateDate;
  }

  /**
   * Iterate through the results
   *
   * This can be resource consuming
   *
   * @param query
   * @param context
   * @deprecated
   */
  async *iterate(query: string = ""): AsyncGenerator {
    if (query.match(/OFFSET +["'][^'"]*["'] *$/)) {
      throw new Error("Cannot contain an OFFSET for iterate method");
    }
    let continuationToken;
    do {
      const q = query + (continuationToken !== undefined ? ` OFFSET "${continuationToken}"` : "");
      const page = await this.query(q);
      for (const item of page.results) {
        yield item;
      }
      continuationToken = page.continuationToken;
    } while (continuationToken);
  }

  /**
   * Check that __type Comparison is only used with = and CONTAINS
   * If CONTAINS is used, move __type to __types
   * If __type = store._model, remove it
   */
  queryTypeUpdater(query: WebdaQL.Query): WebdaQL.Query {
    return query;
  }
  /**
   * Query store with WebdaQL
   * @param query
   * @param context to apply permission
   * @deprecated
   */
  async query(query: string): Promise<{ results: any[]; continuationToken?: string }> {
    let context = useContext();
    if (context.isGlobalContext()) {
      context = undefined;
    }
    const permissionQuery = context ? this._model.getPermissionQuery(context) : null;
    let partialPermission = true;
    let fullQuery = query;
    if (permissionQuery) {
      partialPermission = permissionQuery.partial;
      fullQuery = WebdaQL.PrependCondition(query, permissionQuery.query);
    }
    const queryValidator = new WebdaQL.QueryValidator(fullQuery);
    const offset = queryValidator.getOffset();
    const limit = queryValidator.getLimit();
    const parsedQuery = this.queryTypeUpdater(queryValidator.getQuery());
    parsedQuery.limit = limit;
    // __type is a special field to filter on the type of the object
    const result = {
      results: [],
      continuationToken: undefined
    };
    /*
      Offset are split in two with _

      MainOffset is the database offset, retrieving a page from the database
      SubOffset is the offset within the page

      As we filter through the page, for additional filters or permissions, the page cut
      by database does not endup being our final page cut, so we need a page offset to 
      abstract this completely
     */
    // eslint-disable-next-line prefer-const
    let [mainOffset, subOffset] = offset.split("_");
    let secondOffset = parseInt(subOffset || "0");
    let duration = Date.now();
    this.metrics.operations_total.inc({ operation: "query" });
    while (result.results.length < limit) {
      const tmpResults = await this.find({
        ...parsedQuery,
        continuationToken: mainOffset
      });
      // If no filter is returned assume it is by mistake and apply filtering
      if (tmpResults.filter === undefined) {
        tmpResults.filter = queryValidator.getExpression();
        this.log("WARN", `Store '${this.getName()}' postquery full filtering`);
      }
      let subOffsetCount = 0;
      for (const item of tmpResults.results) {
        // Because of dynamic filter and permission we need to suboffset the pagination
        subOffsetCount++;
        if (subOffsetCount <= secondOffset) {
          continue;
        }
        if (tmpResults.filter !== true && !tmpResults.filter.eval(item)) {
          continue;
        }
        if (context && partialPermission && (await item.canAct(context, "get")) !== true) {
          continue;
        }

        result.results.push(item);
        if (result.results.length >= limit) {
          if (subOffsetCount === tmpResults.results.length) {
            result.continuationToken = tmpResults.continuationToken;
          } else {
            result.continuationToken = `${mainOffset}_${subOffsetCount}`;
          }
          break;
        }
      }
      // Update both offset
      mainOffset = tmpResults.continuationToken;
      // Fresh new query so we do not need to skip
      secondOffset = 0;
      if (mainOffset === undefined || result.results.length >= limit) {
        break;
      }
    }
    duration = Date.now() - duration;
    this.metrics.queries.observe(duration / 1000);
    if (duration > this.parameters.slowQueryThreshold) {
      this.logSlowQuery(query, "", duration);
      this.metrics.slow_queries_total.inc();
    }
    return result;
  }

  /**
   * Set a core model definition
   * @param model
   */
  protected setCoreModelDefinitionHelper(model: CoreModelDefinition) {
    // We are cheating and bypassing the protected method
    model["Store"] = {
      get: this._get.bind(this),
      create: this._create.bind(this),
      update: this._update.bind(this),
      delete: this._delete.bind(this),
      patch: this._patch.bind(this),
      exists: this._exists.bind(this),
      query: this.query.bind(this),
      incrementAttributes: this._incrementAttributes.bind(this),
      upsertItemToCollection: this._upsertItemToCollection.bind(this),
      deleteItemFromCollection: this._deleteItemFromCollection.bind(this),
      removeAttribute: this._removeAttribute.bind(this)
    };
  }

  /**
   * Handle StoreEvent and update cache based on it
   * Then emit the event, it allows the cache to be updated
   * before listeners are called
   *
   * @param event
   * @param data
   */
  async emitStoreEvent<Key extends keyof StoreEvents>(
    event: Key,
    data: E[Key] & { emitterId?: string }
  ): Promise<void> {
    if (event === "Store.Deleted") {
      await this._cacheStore?._delete((<EventStoreDeleted>data).object_id);
    } else if (event === "Store.PartialUpdated") {
      const partialEvent = <EventStorePartialUpdated>data;
      if (partialEvent.partial_update.increments) {
        await this._cacheStore?._incrementAttributes(
          partialEvent.object_id,
          partialEvent.partial_update.increments,
          partialEvent.updateDate
        );
      } else if (partialEvent.partial_update.deleteAttribute) {
        await this._cacheStore?._removeAttribute(
          partialEvent.object_id,
          partialEvent.partial_update.deleteAttribute,
          "_lastUpdate",
          partialEvent.updateDate
        );
      } else if (partialEvent.partial_update.addItem) {
        await this._cacheStore?._upsertItemToCollection(
          partialEvent.object_id,
          partialEvent.partial_update.addItem.property,
          partialEvent.partial_update.addItem.value,
          partialEvent.partial_update.addItem.index,
          undefined,
          undefined,
          partialEvent.updateDate
        );
      } else if (partialEvent.partial_update.deleteItem) {
        await this._cacheStore?._deleteItemFromCollection(
          partialEvent.object_id,
          partialEvent.partial_update.deleteItem.property,
          partialEvent.partial_update.deleteItem.index,
          undefined,
          undefined,
          partialEvent.updateDate
        );
      } else if (partialEvent.partial_update.patch) {
        await this._cacheStore?._patch(partialEvent.partial_update.patch, partialEvent.object_id);
      } else {
        await this.invalidateCache(partialEvent.object_id);
      }
    } else if (event === "Store.Updated") {
      await this._cacheStore?._update((<EventStoreUpdated>data).object_id, (<EventStoreUpdated>data).update);
    } else if (event === "Store.PatchUpdated") {
      await this._cacheStore?._patch((<EventStoreUpdated>data).object_id, (<EventStoreUpdated>data).object);
    }
    await this.emit(event, data);
  }

  /**
   *
   * @param object
   * @param ctx
   * @returns
   * @deprecated
   */
  async create(uuid: string, object: any) {
    // Dates should be store by the Store
    if (!object._creationDate) {
      object._creationDate = object._lastUpdate = new Date();
    } else {
      object._lastUpdate = new Date();
    }
    object.__type = object.__class.getIdentifier();
    // TODO Get ancestors
    const ancestors = [];
    object.__types = [object.__type, ...ancestors].filter(i => i !== "Webda/CoreModel" && i !== "CoreModel");
    // Handle object auto listener
    this.metrics.operations_total.inc({ operation: "save" });
    object = await Promise.all([this._create(uuid, object), this._cacheStore?._create(uuid, object)]);
    const evtSaved = {
      object: object,
      object_id: uuid,
      store: this
    };
    await Promise.all([this.emit("Store.Created", evtSaved)]);

    return object;
  }

  /**
   * Patch an object
   *
   * @param object
   * @param reverseMap
   * @returns
   * @deprecated
   */
  async patch(
    uuid: string,
    object: Partial<any>,
    reverseMap = true,
    conditionField?: string | null,
    conditionValue?: any
  ): Promise<any | undefined> {
    return this.update(uuid, object, reverseMap, true, conditionField, conditionValue);
  }

  /**
   * Check if an UpdateCondition is met
   * @param model
   * @param conditionField
   * @param condition
   * @param uid
   */
  protected checkUpdateCondition(uid: string, model: any, conditionField?: string, condition?: any) {
    if (conditionField) {
      // Add toString to manage Date object
      if (model[conditionField]?.toString() !== condition?.toString()) {
        throw new UpdateConditionFailError(uid, <string>conditionField, condition);
      }
    }
  }

  /**
   * Check if an UpdateCondition is met
   * @param model
   * @param conditionField
   * @param condition
   * @param uid
   */
  protected checkCollectionUpdateCondition(
    model: any,
    collection: string,
    conditionField?: string,
    condition?: any,
    index?: number
  ) {
    // No index so addition to collection
    if (index === null) {
      // The condition must be length of the collection
      if (!model[collection] || (<any[]>model[collection]).length !== condition) {
        throw new UpdateConditionFailError(model.getUuid(), <string>collection, condition);
      }
    } else if (condition && model[collection][index][conditionField] !== condition) {
      throw new UpdateConditionFailError(
        model.getUuid(),
        `${<string>collection}[${index}].${<string>conditionField}`,
        condition
      );
    }
  }

  /**
   * Update conditionally
   * @param uuid
   * @param updates
   * @param conditionField
   * @param condition
   * @deprecated
   */
  async conditionalPatch(
    uuid: string,
    updates: Partial<RawModel<any>>,
    conditionField: string,
    condition: any
  ): Promise<boolean> {
    try {
      await this._patch(uuid, updates, condition, <string>conditionField);
      // CoreModel should also emit this one but cannot do within this context
      await this.emitStoreEvent("Store.PartialUpdated", {
        object_id: uuid,
        partial_update: {
          patch: updates
        },
        store: this
      });
      return true;
    } catch (err) {
      if (err instanceof UpdateConditionFailError) {
        return false;
      }
      throw err;
    }
  }

  /**
   *
   * @param model
   * @param prop
   * @param item
   * @param index
   * @param itemWriteCondition
   * @param itemWriteConditionField
   * @param updateDate
   */
  protected async simulateUpsertItemToCollection(
    uuid: string,
    model: any,
    prop: string,
    item: any,
    updateDate: Date,
    index?: number,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ) {
    if (prop === "__proto__") {
      throw new Error("Cannot update __proto__: js/prototype-polluting-assignment");
    }
    this.checkCollectionUpdateCondition(model, prop, itemWriteConditionField, itemWriteCondition, index);
    if (index === undefined) {
      if (model[prop] === undefined) {
        (<any[]>model[prop]) = [item];
      } else {
        (<any[]>model[prop]).push(item);
      }
    } else {
      model[prop][index] = item;
    }
    await this._patch(uuid, {
      [prop]: model[prop],
      _lastUpdate: updateDate
    });
  }

  /**
   * Update an object
   *
   * If no attribute can be updated then return undefined
   *
   * @param {Object} Object to save
   * @param {Boolean} reverseMap internal use only, for disable map resolution
   * @return {Promise} with saved object
   * @deprecated
   */
  async update(
    uuid: string,
    object: any,
    reverseMap = true,
    partial = false,
    conditionField?: string | null,
    conditionValue?: any
  ): Promise<any | undefined> {
    // Dont allow to update collections from map
    if (this._reverseMap != undefined && reverseMap) {
      for (const i in this._reverseMap) {
        if (object[this._reverseMap[i].property] != undefined) {
          delete object[this._reverseMap[i].property];
        }
      }
    }
    if (Object.keys(object).length < 2) {
      return undefined;
    }

    object._lastUpdate = new Date();
    this.metrics.operations_total.inc({ operation: "get" });
    const loaded = await this._getFromCache(uuid, true);
    if (loaded.__type !== this._modelType && this.parameters.strict) {
      this.log("WARN", `Object '${uuid}' was not created by this store ${loaded.__type}:${this._modelType}`);
      throw new StoreNotFoundError(uuid, this.getName());
    }
    const update = object;
    const evt = {
      object: loaded,
      object_id: uuid,
      store: this,
      update
    };

    let res: any;
    if (conditionField !== null) {
      conditionField ??= "_lastUpdate";
      conditionValue ??= loaded[conditionField];
    }
    if (partial) {
      this.metrics.operations_total.inc({ operation: "partialUpdate" });
      useLog("INFO", "PATCH - Store", uuid, object, conditionField, conditionValue);
      await this._patch(object, uuid, <string>conditionField, conditionValue);
      res = object;
    } else {
      // Copy back the mappers
      for (const i in this._reverseMap) {
        object[this._reverseMap[i].property] = loaded[this._reverseMap[i].property];
      }
      this.metrics.operations_total.inc({ operation: "update" });
      res = await this._update(object, uuid, conditionValue, <string>conditionField);
    }
    // Reinit save
    const saved = {
      ...loaded,
      ...res
    };
    const evtUpdated = {
      object: saved,
      object_id: uuid,
      store: this,
      update,
      previous: loaded
    };
    await Promise.all([this.emitStoreEvent(partial ? `Store.PatchUpdated` : `Store.Updated`, evtUpdated)]);
    return saved;
  }

  /**
   *
   */
  async recomputeTypeLongId() {
    this.log("INFO", "Ensuring __type is using its long id form");
    const app = useApplication();
    // We need to be laxist for migration
    this.parameters.strict = false;
    await this.migration("typesLongId", async item => {
      if (item.__type !== undefined && !item.__type.includes("/")) {
        const model = app.getModelDefinition(item.__type);
        const name = app.getModelId(model, true);
        if (name !== item.__type) {
          this.log("INFO", "Migrating type " + item.__type + " to " + name);
          return <Partial<any>>{
            __type: name
          };
        }
      }
    });
  }

  /**
   * Return the object to be serialized without the __store
   *
   * @param stringify
   * @returns
   */
  toStoredJSON(obj: CoreModel, stringify = false): any | string {
    return runAsSystem(() => {
      if (stringify) {
        return JSON.stringify(obj);
      }
      return { ...obj };
    });
  }

  /**
   * Ensure model aliases are not used in this store
   *
   * So alias can be cleaned
   */
  async cleanModelAliases() {
    this.log("INFO", "Ensuring __type is not using any aliases");
    // We need to be laxist for migration
    this.parameters.strict = false;
    await this.migration("cleanAliases", async item => {
      if (this.parameters.modelAliases[item.__type]) {
        this.log("INFO", "Migrating type " + item.__type + " to " + this.parameters.modelAliases[item.__type]);
        return <Partial<any>>{
          __type: this.parameters.modelAliases[item.__type]
        };
      }
    });
  }

  /**
   * Delete a migration
   * @param name
   */
  async cancelMigration(name: string) {
    await useRegistry().delete(`storeMigration.${this.getName()}.${name}`);
  }

  /**
   * Get a migration
   * @param name
   */
  async getMigration(name: string) {
    return await useRegistry().get(`storeMigration.${this.getName()}.${name}`);
  }

  /**
   * Add a migration mechanism to store
   * @param name
   * @param patcher
   */
  async migration(
    name: string,
    patcher: (object: any) => Promise<Partial<any> | (() => Promise<void>) | undefined>,
    batchSize: number = 500
  ) {
    const status = await useRegistry().get<{
      continuationToken?: string;
      count: number;
      updated: number;
      done: boolean;
    }>(`storeMigration.${this.getName()}.${name}`);
    status.count ??= 0;
    status.updated ??= 0;
    const worker = new Throttler(20);
    do {
      const res = await this.query(
        status.continuationToken ? `LIMIT ${batchSize} OFFSET "${status.continuationToken}"` : `LIMIT ${batchSize}`
      );
      status.count += res.results.length;
      for (const item of res.results) {
        const updated = await patcher(item);
        if (updated !== undefined) {
          status.updated++;
          if (typeof updated === "function") {
            worker.queue(<() => Promise<any>>updated);
          } else {
            worker.queue(async () => {
              await item.patch(<Partial<any>>updated, null);
            });
          }
        }
      }
      this.log(
        "INFO",
        `storeMigration.${this.getName()}.${name}: Migrated ${status.count} items: ${status.updated} updated`
      );
      status.continuationToken = res.continuationToken;
      await worker.wait();
      await status.save();
    } while (status.continuationToken);
  }

  /**
   * Remove an attribute from an object
   *
   * @param uuid
   * @param attribute
   * @returns
   * @deprecated
   */
  async removeAttribute(uuid: string, attribute: string, itemWriteConditionField?: string, itemWriteCondition?: any) {
    this.metrics.operations_total.inc({ operation: "attributeDelete" });
    await this._removeAttribute(uuid, <string>attribute, <string>itemWriteConditionField, itemWriteCondition);
    await this.emitStoreEvent("Store.PartialUpdated", {
      object_id: uuid,
      partial_update: {
        deleteAttribute: <string>attribute
      },
      store: this
    });
  }

  /**
   * Cascade delete a related object
   *
   * @param obj
   * @param uuid
   * @returns
   */
  async cascadeDelete(obj: CoreModel, _uuid: string): Promise<any> {
    // We dont need uuid but Binary store will need it
    return this.delete(obj.getUuid());
  }

  /**
   * Delete an object
   *
   * @param {String} uuid to delete
   * @return {Promise} the deletion promise
   * @deprecated
   */
  async delete(uid: string, writeCondition?: any, writeConditionField?: string): Promise<void> {
    // Allow full object or just its uuid
    this.metrics.operations_total.inc({ operation: "get" });
    const to_delete = await this._getFromCache(uid);
    if (to_delete === undefined) {
      return;
    }
    if (to_delete.__type !== this._modelType && this.parameters.strict) {
      this.log("WARN", `Object '${uid}' was not created by this store ${to_delete.__type}:${this._modelType}`);
      return;
    }

    // Check condition as we have the object
    if (writeCondition) {
      if (to_delete[writeConditionField] !== writeCondition) {
        throw new UpdateConditionFailError(uid, <string>writeConditionField, writeCondition);
      }
    }
    this.metrics.operations_total.inc({ operation: "delete" });
    // Delete from the DB for real
    await this._delete(uid, writeCondition, <string>writeConditionField);
    // Send post event
    const evtDeleted = {
      object: to_delete,
      object_id: uid,
      store: this
    };
    await Promise.all([
      this.emitStoreEvent("Store.Deleted", evtDeleted),
      this._cacheStore?._delete(uid, writeCondition, <string>writeConditionField)
    ]);
  }

  /**
   * By default we cannot know if the store will trigger or not
   *
   * @param id
   * @param callback
   */
  canTriggerConfiguration(_id: string, _callback: () => void) {
    return false;
  }

  /**
   * Provide a way to store configuration in store
   * @param {string} id
   * @returns {Promise<Map<string, any>>}
   */
  async getConfiguration(id: string): Promise<{ [key: string]: any }> {
    this.metrics.operations_total.inc({ operation: "get" });
    const object = await this._getFromCache(id);
    if (!object) {
      return undefined;
    }
    const result: { [key: string]: any } = {};
    for (const i in object) {
      if (i === this._uuidField || i === "_lastUpdate" || i.startsWith("_")) {
        continue;
      }
      result[i] = object[i];
    }
    return result;
  }

  /**
   * Get an object
   *
   * @param {String} uuid to get
   * @return {Promise} the object retrieved ( can be undefined if not found )
   * @deprecated
   */
  async get(uid: string): Promise<any> {
    this.metrics.operations_total.inc({ operation: "get" });
    const object = await this._getFromCache(uid);
    if (!object) {
      return undefined;
    }
    if (object.__type !== this._modelType && this.parameters.strict) {
      this.log("WARN", `Object '${uid}' was not created by this store ${object.__type}:${this._modelType}`);
      return undefined;
    }
    return object;
  }

  /**
   * Set one attribute in an object
   *
   * this is an helper function that calls patch
   *
   * @param uid of the object
   * @param property to update1
   * @param value new value
   * @returns
   * @deprecated
   */
  async setAttribute(uid: string, property: string, value: any): Promise<void> {
    const patch: any = {};
    patch[property] = value;
    await this.patch(uid, patch);
  }

  /**
   * @override
   */
  protected async simulateFind(query: WebdaQL.Query, uuids: string[]): Promise<StoreFindResult<any>> {
    const result: StoreFindResult<any> = {
      results: [],
      continuationToken: undefined,
      filter: true
    };
    let count = 0;
    let limit = query.limit;
    let offset = parseInt(query.continuationToken || "0");
    const originalOffset = offset;

    if (query.orderBy && query.orderBy.length) {
      offset = 0;
      // We need to retrieve everything to orderBy after
      limit = Number.MAX_SAFE_INTEGER;
    }
    // Need to transfert to Array
    for (const uuid of uuids) {
      count++;
      // Offset start
      if (offset >= count) {
        continue;
      }
      const obj = await this._getFromCache(uuid);
      if (obj && query.filter.eval(obj)) {
        result.results.push(obj);
        if (result.results.length >= limit) {
          result.continuationToken = count.toString();
          return result;
        }
      }
    }

    // Order by
    if (query.orderBy && query.orderBy.length) {
      // Sorting the results
      result.results.sort((a, b) => {
        let valA, valB;
        for (const orderBy of query.orderBy) {
          const invert = orderBy.direction === "ASC" ? 1 : -1;
          valA = WebdaQL.ComparisonExpression.getAttributeValue(a, orderBy.field.split("."));
          valB = WebdaQL.ComparisonExpression.getAttributeValue(b, orderBy.field.split("."));
          if (valA === valB) {
            continue;
          }
          if (typeof valA === "string") {
            return valA.localeCompare(valB) * invert;
          }
          return (valA < valB ? -1 : 1) * invert;
        }
        return -1;
      });
      result.results = result.results.slice(originalOffset, query.limit + originalOffset);
      if (result.results.length >= query.limit) {
        result.continuationToken = (query.limit + originalOffset).toString();
      }
    }

    return result;
  }

  getOpenApiReplacements() {
    return {
      modelName: this._model.name
    };
  }

  /**
   * Check if an object exists
   * @abstract
   * @params {String} uuid of the object or the object
   * @deprecated
   */
  async exists(uuid: string): Promise<boolean> {
    return this._exists(uuid);
  }

  /**
   * Search within the store
   */
  abstract find(query: WebdaQL.Query): Promise<StoreFindResult<any>>;

  /**
   * Check if an object exists
   * @abstract
   */
  abstract _exists(uuid: string): Promise<boolean>;

  /**
   * The underlying store should recheck writeCondition only if it does not require
   * another get()
   *
   * @param uuid
   * @param writeCondition
   * @param itemWriteConditionField
   */
  protected abstract _delete(uuid: string, writeCondition?: any, itemWriteConditionField?: string): Promise<void>;

  /**
   * Retrieve an element from the store
   *
   * @param uuid to retrieve
   * @param raiseIfNotFound raise an StoreNotFound exception if not found
   */
  protected abstract _get(uuid: string, raiseIfNotFound?: boolean): Promise<any>;

  /**
   * Get an object
   *
   * @param {Array} uuid to gets if undefined then retrieve the all table
   * @return {Promise} the objects retrieved ( can be [] if not found )
   */
  abstract getAll(list?: string[]): Promise<any[]>;

  protected abstract _update(
    uid: string,
    object: any,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<any>;

  protected abstract _patch(
    uid: string,
    object: any,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<any>;

  protected abstract _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<void>;

  /**
   * Save within the store
   * @param object
   */
  protected abstract _create(uid: string, object: any): Promise<any>;

  /**
   * Increment the attribute
   * @param uid
   * @param prop
   * @param value
   * @param updateDate
   */
  protected abstract _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any>;

  protected abstract _upsertItemToCollection(
    uid: string,
    prop: string,
    item: any,
    index: number,
    itemWriteConditionField: string,
    itemWriteCondition: any,
    updateDate: Date
  ): Promise<any>;

  protected abstract _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteConditionField: string,
    itemWriteCondition: any,
    updateDate: Date
  ): Promise<any>;
}

export { Store };
