import { Counter, EventWithContext, Histogram, RegistryEntry } from "../core";
import {
  ConfigurationProvider,
  MemoryStore,
  ModelMapLoaderImplementation,
  RawModel,
  Throttler,
  WebdaError
} from "../index";
import { Constructor, CoreModel, CoreModelDefinition, FilterAttributes } from "../models/coremodel";
import { Service, ServiceParameters } from "../services/service";
import { GlobalContext, OperationContext } from "../utils/context";
import * as WebdaQL from "@webda/ql";

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
export interface EventStoreSave extends EventStore {}
/**
 * Event called after save of an object
 */
export interface EventStoreSaved extends EventStoreSave {}
/**
 * Event called before delete of an object
 */
export interface EventStoreDelete extends EventStore {}
/**
 * Event called after delete of an object
 */
export interface EventStoreDeleted extends EventStoreDelete {}
/**
 * Event called on retrieval of an object
 */
export interface EventStoreGet extends EventStore {}
/**
 * Event called before action on an object
 */
export interface EventStoreAction extends EventWithContext {
  /**
   * Name of the action
   */
  action: string;
  /**
   * Target object unless it is a global action
   */
  object?: CoreModel;
  /**
   * Model of the object if global action
   */
  model?: CoreModelDefinition;
  /**
   * Emitting store
   */
  store: Store;
}
/**
 * Event called after action on an object
 */
export interface EventStoreActioned extends EventStoreAction {
  /**
   * Result of the action
   */
  result: any;
}
/**
 * Event called before update of an object
 */
export interface EventStoreUpdate extends EventStore {
  /**
   * Update content
   */
  update: any;
}
/**
 * Event called after update of an object
 */
export interface EventStoreUpdated extends EventStoreUpdate {
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
 * Event called before patch update of an object
 */
export interface EventStorePatchUpdate extends EventStoreUpdate {}
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
  store: Store<T>;
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
 * Event sent when a query on the store is emitted
 */
export interface EventStoreQuery {
  /**
   * Request sent
   */
  query: string;
  /**
   * Emitting store
   */
  store: Store;
  /**
   * The parsed query by our grammar
   */
  parsedQuery: WebdaQL.Query;
}
/**
 * Event sent when query is resolved
 */
export interface EventStoreQueried extends EventStoreQuery {
  /**
   * Results from the query
   */
  results: CoreModel[];
  /**
   * The next continuation token
   */
  continuationToken: string;
}

/**
 * Event sent when object is created via POST request
 */
export interface EventStoreWebCreate extends EventWithContext {
  /**
   * Properties for the object
   */
  values: any;
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Object id
   */
  object_id: string;
  /**
   * Emitting store
   */
  store: Store;
}

/**
 * Event sent when object is retrieved via GET request
 */
export interface EventStoreWebGet extends EventWithContext {
  /**
   * Emitting store
   */
  store: Store;
  /**
   * Target object
   */
  object: CoreModel;
}

/**
 * Event sent when object is retrieved via GET request
 */
export interface EventStoreWebGetNotFound extends EventWithContext {
  /**
   * Emitting store
   */
  store: Store;
  /**
   * Target object
   */
  uuid: string;
}

/**
 * Event sent when object is updated via PUT request
 */
export interface EventStoreWebUpdate extends EventWithContext {
  /**
   * Type of update
   */
  method: "PATCH" | "PUT";
  /**
   * Updates to do on the object
   */
  updates: any;
  /**
   * Target object
   */
  object: CoreModel;
  /**
   * Emitting store
   */
  store: Store;
}

/**
 * Event sent when object is deleted via DELETE request
 */
export interface EventStoreWebDelete extends EventWithContext {
  /**
   * Object uuid
   */
  object_id: string;
  /**
   * Emitting store
   */
  store: Store;
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
  "Store.Save": EventStoreSave;
  "Store.Saved": EventStoreSaved;
  "Store.PatchUpdate": EventStorePatchUpdate;
  "Store.PatchUpdated": EventStorePatchUpdated;
  "Store.Update": EventStoreUpdate;
  "Store.Updated": EventStoreUpdated;
  "Store.Delete": EventStoreDelete;
  "Store.Deleted": EventStoreDeleted;
  "Store.Get": EventStoreGet;
  "Store.Query": EventStoreQuery;
  "Store.Queried": EventStoreQueried;
  "Store.WebCreate": EventStoreWebCreate;
  "Store.Action": EventStoreAction;
  "Store.Actioned": EventStoreActioned;
  "Store.WebUpdate": EventStoreWebUpdate;
  "Store.WebGetNotFound": EventStoreWebGetNotFound;
  "Store.WebGet": EventStoreWebGet;
  "Store.WebDelete": EventStoreWebDelete;
};

/**
 * A mapping service allow to link two object together
 *
 * Therefore they need to handle the cascadeDelete
 */
export interface MappingService<T = any> {
  newModel(object: any): T;
}

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
abstract class Store<
    T extends CoreModel = CoreModel,
    K extends StoreParameters = StoreParameters,
    E extends StoreEvents = StoreEvents
  >
  extends Service<K, E>
  implements ConfigurationProvider, MappingService<T>
{
  /**
   * Cache store
   */
  _cacheStore: Store<T>;
  /**
   * Contain the reverse map
   */
  _reverseMap: { mapper: MappingService; property: string }[] = [];
  /**
   * Contains the current model
   */
  _model: CoreModelDefinition<T>;
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
  metrics: {
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
    const app = this.getWebda().getApplication();
    const p = this.parameters;
    this._model = app.getModel(p.model);
    this._modelType = this._model.getIdentifier();
    this._uuidField = this._model.getUuidField();
    if (!this.parameters.noCache) {
      this._cacheStore = new MemoryStore(this._webda, `_${this.getName()}_cache`, {
        model: this.parameters.model
      });
      this._cacheStore.computeParameters();
      this._cacheStore.initMetrics();
      this.cacheStorePatchException();
    }
    const recursive = (tree, depth) => {
      for (const i in tree) {
        this._modelsHierarchy[i] ??= depth;
        this._modelsHierarchy[i] = Math.min(depth, this._modelsHierarchy[i]);
        this._modelsHierarchy[app.completeNamespace(i)] = this._modelsHierarchy[i];
        recursive(app.getModelHierarchy(i).children, depth + 1);
      }
    };
    // Compute the hierarchy
    this._modelsHierarchy[this._model.getIdentifier(false)] = 0;
    this._modelsHierarchy[this._model.getIdentifier()] = 0;
    // Strict Store only store their model
    if (!this.parameters.strict) {
      recursive(this._model.getHierarchy().children, 1);
    }
    // Add additional models
    if (this.parameters.additionalModels.length) {
      // Strict mode is to only allow one model per store
      if (this.parameters.strict) {
        this.log("ERROR", "Cannot add additional models in strict mode");
      } else {
        for (const modelType of this.parameters.additionalModels) {
          const model = app.getModel(modelType);
          this._modelsHierarchy[model.getIdentifier(false)] = 0;
          this._modelsHierarchy[model.getIdentifier()] = 0;
          recursive(model.getHierarchy().children, 1);
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
  handleModel(model: Constructor<CoreModel> | CoreModel): number {
    const name = this.getWebda().getApplication().getModelName(model);
    return this._modelsHierarchy[name] ?? -1;
  }

  /**
   * Get From Cache or main
   * @param uuid
   * @param raiseIfNotFound
   * @returns
   */
  async _getFromCache(uuid: string, raiseIfNotFound: boolean = false): Promise<T> {
    let res = await this._cacheStore?._get(uuid);
    if (!res) {
      res = await this._get(uuid, raiseIfNotFound);
      if (res) {
        await this._cacheStore?._save(res);
      }
    } else {
      this.metrics.cache_hits.inc();
      res.__store = this;
    }
    return res;
  }

  /**
   * Get object from store
   * @param uid
   * @returns
   */
  async getObject(uid: string): Promise<T> {
    this.metrics.operations_total.inc({ operation: "get" });
    return this._getFromCache(uid);
  }

  static getOpenAPI() {}

  /**
   * OVerwrite the model
   * Used mainly in test
   */
  setModel(model: CoreModelDefinition<T>) {
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
            this.log("TRACE", `Ignoring cache exception ${this._name}: ${err.message}`);
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
   * Init a model from the current stored data
   *
   * Initial the reverse map as well
   *
   * @param object
   * @returns
   */
  protected initModel(object: any = {}): T {
    object.__type ??= this.getWebda().getApplication().getModelFromInstance(object) || this._modelType;
    // Make sure to send a model object
    if (!(object instanceof this._model)) {
      // Dynamic load type
      if (object.__type && !this.getParameters().forceModel) {
        try {
          const modelType = this.getWebda()
            .getApplication()
            .getModel(this.parameters.modelAliases[object.__type] || object.__type);
          object = new modelType().load(object, true);
        } catch (err) {
          if (!this.parameters.defaultModel) {
            throw new Error(`Unknown model ${object.__type} found for Store(${this.getName()})`);
          }
          object = this._model.factory(object);
        }
      } else {
        object = this._model.factory(object);
      }
    }
    if (!object.getUuid()) {
      object.setUuid(object.generateUid(object));
    }
    object.__store = this;
    for (const i in this._reverseMap) {
      object[this._reverseMap[i].property] ??= [];
      for (const j in object[this._reverseMap[i].property]) {
        if (object[this._reverseMap[i].property][j] instanceof ModelMapLoaderImplementation) {
          continue;
        }
        // Use Partial
        object[this._reverseMap[i].property][j] = this._reverseMap[i].mapper.newModel(
          object[this._reverseMap[i].property][j]
        );
        object[this._reverseMap[i].property][j].setContext(object.getContext());
      }
    }
    return object;
  }

  /**
   * Get a new model with this data preloaded
   * @param object
   * @returns
   */
  newModel(object: any = {}) {
    const result = this.initModel(object);
    Object.keys(object).forEach(k => result.__dirty.add(k));
    return result;
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
   */
  async incrementAttributes<FK extends FilterAttributes<T, number>>(
    uid: string,
    info: { property: FK; value: number }[]
  ) {
    const params = <{ property: string; value: number }[]>info.filter(i => i.value !== 0);
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
   * Helper function that call incrementAttributes
   * @param uid
   * @param prop
   * @param value
   * @returns
   */
  async incrementAttribute<FK extends FilterAttributes<T, number>>(uid: string, prop: FK, value: number) {
    return this.incrementAttributes(uid, [{ property: prop, value }]);
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
   */
  async upsertItemToCollection<FK extends FilterAttributes<T, Array<any>>>(
    uid: string,
    prop: FK,
    item: any,
    index: number = undefined,
    itemWriteCondition: any = undefined,
    itemWriteConditionField: string = this._uuidField
  ) {
    const updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "collectionUpsert" });
    await this._upsertItemToCollection(
      uid,
      <string>prop,
      item,
      index,
      itemWriteCondition,
      itemWriteConditionField,
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
   */
  async deleteItemFromCollection<FK extends FilterAttributes<T, Array<any>>>(
    uid: string,
    prop: FK,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string = this._uuidField
  ) {
    const updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "collectionDelete" });
    await this._deleteItemFromCollection(
      uid,
      <string>prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
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
   */
  async *iterate(query: string = ""): AsyncGenerator<T> {
    if (query.includes("OFFSET")) {
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

  // REFACTOR . >= 4
  /**
   * Query all the results
   *
   *
   * @param query
   * @param context
   * @returns
   * @deprecated use iterate instead
   */
  async queryAll(query: string): Promise<T[]> {
    const res = [];
    for await (const item of this.iterate(query)) {
      res.push(item);
    }
    return res;
  }
  // END_REFACTOR

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
   */
  async query(query: string): Promise<{ results: T[]; continuationToken?: string }> {
    let context = this._webda.getContext();
    if (context instanceof GlobalContext) {
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
    // Emit the default event
    await this.emitSync("Store.Query", {
      query,
      parsedQuery,
      store: this
    });
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
    await this.emitSync("Store.Queried", {
      query,
      parsedQuery: parsedQuery,
      store: this,
      continuationToken: result.continuationToken,
      results: result.results
    });
    return result;
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
      await this._cacheStore?._update((<EventStoreUpdated>data).update, (<EventStoreUpdated>data).object_id);
    } else if (event === "Store.PatchUpdated") {
      await this._cacheStore?._patch((<EventStoreUpdated>data).object, (<EventStoreUpdated>data).object_id);
    }
    await this.emitSync(event, data);
  }

  /**
   * Save an object
   *
   * @param {Object} Object to save
   * @param {String} Uuid to use, if not specified take the object.uuid or generate one if not found
   * @return {Promise} with saved object
   *
   * Might want to rename to create
   */
  async save(object): Promise<T> {
    if (object instanceof this._model && object._creationDate !== undefined && object._lastUpdate !== undefined) {
      return <T>await object.save();
    }
    return this.create(object);
  }

  /**
   *
   * @param object
   * @param ctx
   * @returns
   */
  async create(object) {
    object = this.initModel(object);

    // Dates should be store by the Store
    if (!object._creationDate) {
      object._creationDate = object._lastUpdate = new Date();
    } else {
      object._lastUpdate = new Date();
    }
    const ancestors = this.getWebda().getApplication().getModelHierarchy(object.__type).ancestors;
    object.__types = [object.__type, ...ancestors].filter(i => i !== "Webda/CoreModel" && i !== "CoreModel");

    // Handle object auto listener
    const evt = {
      object: object,
      object_id: object.getUuid(),
      store: this
    };
    await Promise.all([
      this.emitSync("Store.Save", evt),
      object?.__class.emitSync("Store.Save", evt),
      object._onSave()
    ]);

    this.metrics.operations_total.inc({ operation: "save" });
    const res = await this._save(object);
    await this._cacheStore?._save(object);
    object = this.initModel(res);
    const evtSaved = {
      object: object,
      object_id: object.getUuid(),
      store: this
    };
    await Promise.all([
      this.emitSync("Store.Saved", evtSaved),
      object?.__class.emitSync("Store.Saved", evtSaved),
      object._onSaved()
    ]);

    return object;
  }

  /**
   * Patch an object
   *
   * @param object
   * @param reverseMap
   * @returns
   */
  async patch<FK extends keyof T>(
    object: Partial<T>,
    reverseMap = true,
    conditionField?: FK | null,
    conditionValue?: any
  ): Promise<T | undefined> {
    return this.update(object, reverseMap, true, conditionField, conditionValue);
  }

  /**
   * Check if an UpdateCondition is met
   * @param model
   * @param conditionField
   * @param condition
   * @param uid
   */
  checkUpdateCondition<CK extends keyof T>(model: T, conditionField?: CK, condition?: any, uid?: string) {
    if (conditionField) {
      // Add toString to manage Date object
      if (model[conditionField].toString() !== condition.toString()) {
        throw new UpdateConditionFailError(uid ? uid : model.getUuid(), <string>conditionField, condition);
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
  checkCollectionUpdateCondition<FK extends FilterAttributes<T, Array<any>>, CK extends keyof T>(
    model: T,
    collection: FK,
    conditionField?: CK,
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
   */
  async conditionalPatch<CK extends keyof T>(
    uuid: string,
    updates: Partial<RawModel<T>>,
    conditionField: CK,
    condition: any
  ): Promise<boolean> {
    try {
      await this._patch(updates, uuid, condition, <string>conditionField);
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
  async simulateUpsertItemToCollection<FK extends FilterAttributes<T, Array<any>>>(
    model: T,
    prop: FK,
    item: any,
    updateDate: Date,
    index?: number,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ) {
    if (prop === "__proto__") {
      throw new Error("Cannot update __proto__: js/prototype-polluting-assignment");
    }
    this.checkCollectionUpdateCondition(model, prop, <keyof T>itemWriteConditionField, itemWriteCondition, index);
    if (index === undefined) {
      if (model[prop] === undefined) {
        (<any[]>model[prop]) = [item];
      } else {
        (<any[]>model[prop]).push(item);
      }
    } else {
      model[prop][index] = item;
    }
    model._lastUpdate = updateDate;
    await this._save(model);
  }

  /**
   * Update an object
   *
   * If no attribute can be updated then return undefined
   *
   * @param {Object} Object to save
   * @param {Boolean} reverseMap internal use only, for disable map resolution
   * @return {Promise} with saved object
   */
  async update<CK extends keyof T>(
    object: any,
    reverseMap = true,
    partial = false,
    conditionField?: CK | null,
    conditionValue?: any
  ): Promise<T | undefined> {
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
    const uuid = object.getUuid ? object.getUuid() : object[this._uuidField];
    const load = await this._getFromCache(uuid, true);
    if (load.__type !== this._modelType && this.parameters.strict) {
      this.log("WARN", `Object '${uuid}' was not created by this store ${load.__type}:${this._modelType}`);
      throw new StoreNotFoundError(uuid, this.getName());
    }
    const loaded = this.initModel(load);
    const update = object;
    const evt = {
      object: loaded,
      object_id: loaded.getUuid(),
      store: this,
      update
    };
    await Promise.all([
      this.emitSync(partial ? `Store.PatchUpdate` : `Store.Update`, evt),
      object?.__class?.emitSync(partial ? `Store.PatchUpdate` : `Store.Update`, evt),
      loaded._onUpdate(object)
    ]);

    let res: any;
    if (conditionField !== null) {
      conditionField ??= <CK>"_lastUpdate";
      conditionValue ??= load[conditionField];
    }
    if (partial) {
      this.metrics.operations_total.inc({ operation: "partialUpdate" });
      await this._patch(object, uuid, conditionValue, <string>conditionField);
      res = object;
    } else {
      // Copy back the mappers
      for (const i in this._reverseMap) {
        object[this._reverseMap[i].property] = loaded[this._reverseMap[i].property];
      }
      object = this.initModel(object);
      this.metrics.operations_total.inc({ operation: "update" });
      res = await this._update(object, uuid, conditionValue, <string>conditionField);
    }
    // Reinit save
    const saved = this.initModel({
      ...loaded,
      ...res
    });
    const evtUpdated = {
      object: saved,
      object_id: saved.getUuid(),
      store: this,
      update,
      previous: loaded
    };
    await Promise.all([
      this.emitStoreEvent(partial ? `Store.PatchUpdated` : `Store.Updated`, evtUpdated),
      saved?.__class.emitSync(partial ? `Store.PatchUpdated` : `Store.Updated`, evtUpdated),
      saved._onUpdated()
    ]);
    return saved;
  }

  /**
   *
   */
  async recomputeTypeShortId() {
    this.log("INFO", "Ensuring __type is using its short id form");
    const app = this.getWebda().getApplication();
    // We need to be laxist for migration
    this.parameters.strict = false;
    await this.migration("typesShortId", async item => {
      if (item.__type !== undefined && item.__type.includes("/")) {
        const model = app.getWebdaObject("models", item.__type);
        const name = app.getShortId(app.getModelName(model));
        if (name !== item.__type) {
          this.log("INFO", "Migrating type " + item.__type + " to " + name);
          return <Partial<T>>{
            __type: name
          };
        }
      }
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
        return <Partial<T>>{
          __type: this.parameters.modelAliases[item.__type]
        };
      }
    });
  }

  /**
   * Recompute the __types for all objects (storeMigration.Registry.typesCompute)
   */
  async recomputeTypes() {
    this.log("INFO", "Ensuring __types is correct from migration from v2.x");
    // Update __types for each __type will be more efficient
    await this.migration("typesCompute", async item => {
      const __types = this.getWebda().getApplication().getModelTypes(item);
      if (
        !item.__types ||
        item.__types.length !== __types.length ||
        !__types.every((element, index) => element === item.__types[index])
      ) {
        this.log(
          "INFO",
          "Migrating types " + JSON.stringify(item.__types) + " to " + JSON.stringify(__types),
          "for",
          item.__type,
          item.getUuid()
        );
        return <Partial<T>>{
          __types
        };
      }
    });
  }

  /**
   * Delete a migration
   * @param name
   */
  async cancelMigration(name: string) {
    await this.getWebda().getRegistry().delete(`storeMigration.${this.getName()}.${name}`);
  }

  /**
   * Get a migration
   * @param name
   */
  async getMigration(name: string) {
    return await this.getWebda().getRegistry().get(`storeMigration.${this.getName()}.${name}`);
  }

  /**
   * Add a migration mechanism to store
   * @param name
   * @param patcher
   */
  async migration(
    name: string,
    patcher: (object: T) => Promise<Partial<T> | (() => Promise<void>) | undefined>,
    batchSize: number = 500
  ) {
    const status: RegistryEntry<{
      continuationToken?: string;
      count: number;
      updated: number;
      done: boolean;
    }> = await this.getWebda().getRegistry().get(`storeMigration.${this.getName()}.${name}`, {});
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
            worker.queue(updated);
          } else {
            worker.queue(async () => {
              await item.patch(<Partial<T>>updated, null);
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
   */
  async removeAttribute<CK extends keyof T>(
    uuid: string,
    attribute: CK,
    itemWriteCondition?: any,
    itemWriteConditionField?: CK
  ) {
    this.metrics.operations_total.inc({ operation: "attributeDelete" });
    await this._removeAttribute(uuid, <string>attribute, itemWriteCondition, <string>itemWriteConditionField);
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
   */
  async delete<CK extends keyof T>(uid: string | T, writeCondition?: any, writeConditionField?: CK): Promise<void> {
    /** @ignore */
    let to_delete: T;
    // Allow full object or just its uuid
    if (typeof uid === "object") {
      to_delete = uid;
    } else {
      this.metrics.operations_total.inc({ operation: "get" });
      to_delete = await this._getFromCache(uid);
      if (to_delete === undefined) {
        return;
      }
      if (to_delete.__type !== this._modelType && this.parameters.strict) {
        this.log("WARN", `Object '${uid}' was not created by this store ${to_delete.__type}:${this._modelType}`);
        return;
      }
      to_delete = this.initModel(to_delete);
    }

    // Check condition as we have the object
    if (writeCondition) {
      if (to_delete[writeConditionField] !== writeCondition) {
        throw new UpdateConditionFailError(to_delete.getUuid(), <string>writeConditionField, writeCondition);
      }
    }
    const evt = {
      object: to_delete,
      object_id: to_delete.getUuid(),
      store: this
    };
    // Send preevent
    await Promise.all([
      this.emitSync("Store.Delete", evt),
      to_delete?.__class.emitSync("Store.Delete", evt),
      to_delete._onDelete()
    ]);

    this.metrics.operations_total.inc({ operation: "delete" });
    // Delete from the DB for real
    await this._delete(to_delete.getUuid(), writeCondition, <string>writeConditionField);
    await this._cacheStore?._delete(to_delete.getUuid(), writeCondition, <string>writeConditionField);

    // Send post event
    const evtDeleted = {
      object: to_delete,
      object_id: to_delete.getUuid(),
      store: this
    };
    await Promise.all([
      this.emitStoreEvent("Store.Deleted", evtDeleted),
      to_delete.__class.emitSync("Store.Deleted", evtDeleted),
      to_delete._onDeleted()
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
   * Upsert the uuid object
   * @param uuid
   * @param data
   */
  async put(uuid: string, data: Partial<T>): Promise<T> {
    if (await this.exists(uuid)) {
      return this.update({ ...data, uuid });
    }
    return this.save(data instanceof CoreModel ? data.setUuid(uuid) : { ...data, uuid });
  }

  /**
   * Get an object
   *
   * @param {String} uuid to get
   * @return {Promise} the object retrieved ( can be undefined if not found )
   */
  async get(uid: string, defaultValue: any = undefined): Promise<T> {
    /** @ignore */
    if (!uid) {
      return undefined;
    }
    this.metrics.operations_total.inc({ operation: "get" });
    let object = await this._getFromCache(uid);
    if (!object) {
      return defaultValue ? this.initModel(defaultValue).setUuid(uid) : undefined;
    }
    if (object.__type !== this._modelType && this.parameters.strict) {
      this.log("WARN", `Object '${uid}' was not created by this store ${object.__type}:${this._modelType}`);
      return undefined;
    }
    object = this.initModel(object);
    const evt = {
      object: object,
      object_id: object.getUuid(),
      store: this
    };
    await Promise.all([this.emitSync("Store.Get", evt), object.__class.emitSync("Store.Get", evt), object._onGet()]);
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
   */
  async setAttribute<CK extends keyof T>(uid: string, property: CK, value: any): Promise<void> {
    const patch: any = {};
    patch[property] = value;
    patch[this.getUuidField()] = uid;
    await this.patch(patch);
  }

  /**
   * @override
   */
  protected async simulateFind(query: WebdaQL.Query, uuids: string[]): Promise<StoreFindResult<T>> {
    const result: StoreFindResult<T> = {
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
   * Return the model uuid field
   */
  getUuidField(): string {
    return this._uuidField;
  }

  /**
   * Check if an object exists
   * @abstract
   * @params {String} uuid of the object or the object
   */
  async exists(uid: string | CoreModel): Promise<boolean> {
    if (typeof uid !== "string") {
      uid = uid.getUuid();
    }
    return this._exists(uid);
  }

  /**
   * Search within the store
   */
  abstract find(query: WebdaQL.Query): Promise<StoreFindResult<T>>;

  /**
   * Check if an object exists
   * @abstract
   */
  abstract _exists(uid: string): Promise<boolean>;

  /**
   * The underlying store should recheck writeCondition only if it does not require
   * another get()
   *
   * @param uid
   * @param writeCondition
   * @param itemWriteConditionField
   */
  protected abstract _delete(uid: string, writeCondition?: any, itemWriteConditionField?: string): Promise<void>;

  /**
   * Retrieve an element from the store
   *
   * @param uid to retrieve
   * @param raiseIfNotFound raise an StoreNotFound exception if not found
   */
  protected abstract _get(uid: string, raiseIfNotFound?: boolean): Promise<T>;

  /**
   * Get an object
   *
   * @param {Array} uuid to gets if undefined then retrieve the all table
   * @return {Promise} the objects retrieved ( can be [] if not found )
   */
  abstract getAll(list?: string[]): Promise<T[]>;

  protected abstract _update(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<any>;

  protected abstract _patch(
    object: any,
    uid: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<any>;

  protected abstract _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void>;

  /**
   * Save within the store
   * @param object
   */
  protected abstract _save(object: T): Promise<any>;

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
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any>;

  protected abstract _deleteItemFromCollection(
    uid: string,
    prop: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any>;
}

export { Store };
