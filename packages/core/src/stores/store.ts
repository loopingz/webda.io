import { Counter, Histogram } from "../metrics/metrics.js";
import * as WebdaError from "../errors/errors.js";

import { registerRepository, type Model, type ModelClass, type PrimaryKey, type Repository } from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "../services/service.js";
import * as WebdaQL from "@webda/ql";
import type { WebdaQLString } from "@webda/ql";
import { useApplication, useModel, useModelId } from "../application/hooks.js";
import { useLog } from "../loggers/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import type { ModelMetadata } from "@webda/compiler";
import { InstanceCache } from "../cache/cache.js";

/** Error thrown when an item is not found in a store */
export class StoreNotFoundError extends WebdaError.CodeError {
  /** Create a new StoreNotFoundError
   * @param uuid - the item primary key
   * @param storeName - the store name
   */
  constructor(uuid: PrimaryKey<any>, storeName: string) {
    super("STORE_NOTFOUND", `Item not found ${uuid} Store(${storeName})`);
  }
}

/** Error thrown when a conditional update fails due to a version/condition mismatch */
export class UpdateConditionFailError extends WebdaError.CodeError {
  /** Create a new UpdateConditionFailError
   * @param uuid - the item primary key
   * @param conditionField - the condition field name
   * @param condition - the expected condition value
   */
  constructor(uuid: PrimaryKey<any>, conditionField: string, condition: string | Date) {
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
  object: Model;
  /**
   * Object id
   */
  object_id: PrimaryKey<any>;
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
  object_id: PrimaryKey<any>;
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
export interface EventStorePartialUpdated<T extends Model = Model> {
  /**
   * Object uuid
   */
  object_id: PrimaryKey<any>;
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
export interface StoreInterface<T = any> {
  create(uuid: PrimaryKey<any>, object: any): Promise<any>;
  get(uuid: PrimaryKey<any>): Promise<any>;
  update(uuid: PrimaryKey<any>, object: any): Promise<any>;
  delete(uuid: PrimaryKey<any>): Promise<void>;
  exists(uuid: PrimaryKey<any>): Promise<boolean>;
  setAttribute(uuid: PrimaryKey<any>, attribute: string, value: any): Promise<void>;
  removeAttribute(uuid: PrimaryKey<any>, attribute: string): Promise<void>;
  upsertItemToCollection(
    uuid: PrimaryKey<any>,
    collection: string,
    item: any,
    index?: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<void>;
  deleteItemFromCollection(
    uuid: PrimaryKey<any>,
    collection: string,
    index: number,
    itemWriteConditionField?: string,
    itemWriteCondition?: any
  ): Promise<void>;
  find(query: WebdaQLString<T>): Promise<StoreFindResult<any>>;
  query(query: WebdaQLString<T>): Promise<StoreFindResult<any>>;
  iterate(query: WebdaQLString<T>): AsyncGenerator;
  incrementAttributes(uuid: PrimaryKey<any>, info: { property: string; value?: number }[]): Promise<Date>;
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

  /**
   * True when `model` was explicitly provided in the raw configuration.
   * Stores that use the default model (RegistryEntry) without explicit
   * configuration will not claim any model hierarchy.
   * @internal
   */
  _modelExplicit?: boolean;

  /**
   * Load store parameters with defaults for model type, strict mode, and aliases
   * @param params - the service parameters
   * @returns the result
   */
  load(params: any) {
    // REFACTOR >= 5
    if (params.expose) {
      throw new Error("Expose is not supported anymore, use DomainService instead");
    }
    // END_REFACTOR
    this._modelExplicit = !!(params.model || (params.additionalModels && params.additionalModels.length > 0));
    super.load(params);
    this.model ??= "Webda/RegistryEntry";
    this.strict ??= false;
    this.defaultModel ??= true;
    this.forceModel ??= false;
    this.slowQueryThreshold ??= 30000;
    this.modelAliases ??= {};
    this.additionalModels ??= [];
    return this;
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
abstract class Store<K extends StoreParameters = StoreParameters, E extends StoreEvents = StoreEvents> extends Service<
  K,
  E
> {
  /**
   * Contains the current model
   */
  _model: ModelClass;
  /**
   * Contains the current model metadata
   */
  _modelMetadata: ModelMetadata;
  /**
   * Store the manager hierarchy with their depth
   */
  _modelsHierarchy: { [key: string]: number } = {};
  /**
   * Contains the current model type
   */
  _modelType: string;

  /**
   * Override the resolved model class for this store at runtime. Used by
   * the abstract `StoreTest` harness so test fixtures can substitute a
   * subclass with extra fields in place of the configured model. In
   * production this is a no-op the framework never calls.
   * @param model - the substitute model class
   */
  setModelDefinitionHelper(model: ModelClass): void {
    this._model = model;
  }
  /**
   * Add metrics counter
   * ' UNION SELECT name, tbl_name as email, "" as col1, "" as col2, "" as col3, "" as col4, "" as col5, "" as col6, "" as col7, "" as col8 FROM sqlite_master --
   * {"email":"' UNION SELECT name as profileImage, tbl_name as email, '' AS column3 FROM sqlite_master --","password":"we"}
   */
  declare metrics: {
    operations_total: Counter;
    slow_queries_total: Counter;
    queries: Histogram;
  };

  /**
   * Compute and register repositories for all known models based on available stores.
   *
   * Called from `Store.init()` so each store's init triggers a recompute.
   * Cannot be cached: the FIRST store to init (typically `Registry`) would
   * claim every model with its fallback repository, and subsequent
   * stores wouldn't get a chance to claim their configured models.
   * Re-running is idempotent — `registerRepository` overwrites map entries
   * in place, and the resolution loop is deterministic per current
   * service/model state.
   */
  static computeStores() {
    // Gather all stores and register Repository
    const stores = Object.values(useCore().getServices()).filter(s => s instanceof Store);
    const models = Object.values(useApplication().getModels());
    const registry = useCore().getService<Store>("Registry");
     
    console.log(`[computeStores] stores: ${stores.map(s => s.getName()).join(",")} models: ${models.length}`);
    // Check each available models
    for (const model of models) {
      // Model can be null?
      if (!model) {
         
        console.log(`[computeStores] skip null model`);
        continue;
      }
      if (!model.Metadata || !Array.isArray(model.Metadata.PrimaryKey)) {
         
        console.log(
          `[computeStores] SKIP ${(model as any).name}: Metadata=${!!model.Metadata} PrimaryKey=${JSON.stringify(model.Metadata?.PrimaryKey)}`
        );
        continue;
      }
       
      console.log(`[computeStores] iterate ${useModelId(model)} pk=${JSON.stringify(model.Metadata.PrimaryKey)}`);
      let currentValue = -1;
      let currentStore: Store = undefined;
      for (const store of stores) {
        const value = store.handleModel(model);
        if (value < 0 || (value > currentValue && currentValue !== -1)) {
          continue;
        }
        currentValue = value;
        currentStore = store;
      }
      if (!currentStore) {
        useLog("TRACE", `${useModelId(model)} fallback to Registry store`);
        currentStore = registry;
      }
      // Register the repository
      const repo = currentStore.getRepository(model) as any;
      registerRepository(model, repo);
       
      console.log(`[computeStores] register ${useModelId(model)} -> ${currentStore.getName()} (${repo?.constructor?.name})`);
    }
  }

  /**
   * Retrieve the Model and build the models hierarchy map.
   *
   * If the configured model cannot be found, or if no model was explicitly
   * configured (store uses the default RegistryEntry fallback), the hierarchy
   * stays empty and the store will not claim any model — preserving the
   * pre-migration fallback behaviour for test-only or misconfigured stores.
   */
  computeParameters(): void {
    super.computeParameters();

    // eslint-disable-next-line no-console
    console.log(
      `[computeParameters] ${this.getName?.()} _modelExplicit=${this.parameters._modelExplicit} model=${this.parameters.model}`
    );

    // Stores without an explicit model configuration (i.e. using the default
    // "Webda/RegistryEntry") should not participate in the model hierarchy to
    // avoid accidentally claiming RegistryEntry over the real Registry service.
    if (!this.parameters._modelExplicit) {
      // eslint-disable-next-line no-console
      console.log(`[computeParameters] ${this.getName?.()} bail: not explicit`);
      return;
    }

    // Guard: useModel throws on undefined and may return undefined/null for
    // unknown models. Catch both so test-only or misconfigured stores stay
    // harmless.
    try {
      this._model = useModel(this.parameters.model);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.log(`[computeParameters] ${this.getName?.()} useModel threw: ${(e as Error).message}`);
      this._model = undefined;
    }
    if (!this._model) {
      // eslint-disable-next-line no-console
      console.log(
        `[computeParameters] ${this.getName?.()} bail: model not found for ${this.parameters.model}`
      );
      return;
    }
    this._modelMetadata = useModelMetadata(this._model);
    if (!this._modelMetadata) {
      // eslint-disable-next-line no-console
      console.log(
        `[computeParameters] ${this.getName?.()} bail: metadata missing for ${this.parameters.model}`
      );
      return;
    }
    // eslint-disable-next-line no-console
    console.log(
      `[computeParameters] ${this.getName?.()} resolved model=${this.parameters.model} identifier=${this._modelMetadata.Identifier}`
    );
    useLog("TRACE", "METADATA", this._modelMetadata);
    this._modelType = this._modelMetadata.Identifier;

    // Recursively populate _modelsHierarchy for a model's subclass tree.
    // Each subclass identifier in meta.Subclasses is a string that we resolve
    // via useModel. We keep the minimum depth seen for each identifier.
    const recursive = (subclassIds: string[], depth: number) => {
      for (const id of subclassIds) {
        this._modelsHierarchy[id] = Math.min(depth, this._modelsHierarchy[id] ?? depth);
        let subModel: ModelClass | undefined;
        try {
          subModel = useModel(id);
        } catch {
          continue;
        }
        if (!subModel) continue;
        const subMeta = useModelMetadata(subModel);
        if (!subMeta) continue;
        recursive(subMeta.Subclasses ?? [], depth + 1);
      }
    };

    // Compute the hierarchy — reset first so re-resolve is idempotent
    this._modelsHierarchy = {};
    this._modelsHierarchy[this._modelMetadata.Identifier] = 0;
    // Strict Store only stores their exact model
    if (!this.parameters.strict) {
      recursive(this._modelMetadata.Subclasses ?? [], 1);
    }
    // Add additional models (each treated as depth-0 roots with their own subtree)
    if ((this.parameters.additionalModels ?? []).length) {
      if (this.parameters.strict) {
        useLog("ERROR", "Cannot add additional models in strict mode");
      } else {
        for (const modelType of this.parameters.additionalModels!) {
          let addModel: ModelClass | undefined;
          try {
            addModel = useModel(modelType);
          } catch {
            continue;
          }
          if (!addModel) continue;
          const addMeta = useModelMetadata(addModel);
          if (!addMeta) continue;
          this._modelsHierarchy[addMeta.Identifier] = 0;
          recursive(addMeta.Subclasses ?? [], 1);
        }
      }
    }
  }

  /**
   * Log a slow query (placeholder for future implementation)
   * @param _query - the query to execute
   * @param _reason - the reason
   * @param _time - the time
   */
  logSlowQuery(_query: string, _reason: string, _time: number) {
    // TODO Need to implement: https://github.com/loopingz/webda.io/issues/202
  }

  /**
   * Initialize the store
   * @returns this for chaining
   */
  async init(): Promise<this> {
    Store.computeStores();
    return super.init();
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
    // this.metrics.cache_invalidations = this.getMetric(Counter, {
    //   name: "cache_invalidations",
    //   help: "Number of cache invalidation encountered"
    // });
    // this.metrics.cache_hits = this.getMetric(Counter, {
    //   name: "cache_hits",
    //   help: "Number of cache hits"
    // });
    this.metrics.queries = this.getMetric(Histogram, {
      name: "queries",
      help: "Query duration"
    });
  }

  /**
   * Return Store current model
   * @returns the result
   */
  getModel(): ModelClass {
    return this._model;
  }

  /**
   * Return if a model is handled by the store
   * @param model - the model to use
   * @return distance from the managed class -1 means not managed, 0 manage exactly this model, >0 manage an ancestor model
   *
   * @returns the result number
   */
  handleModel(model: ModelClass | Model): number {
    const name = useModelId(model);
    return this._modelsHierarchy[name] ?? -1;
  }

  /**
   * Check that keys are valid
   * All keys of model stored in a Store must have the same type of primary key
   */
  checkKeys() {
    // TODO Implement
  }

  abstract getRepository<T extends ModelClass>(model: T): Repository<T>;
}

export { Store };
