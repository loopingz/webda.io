import { Counter, Histogram } from "../metrics/metrics";
import * as WebdaError from "../errors/errors";

import { type Model, type ModelClass, type PrimaryKey, type Repository } from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters";
import { Service } from "../services/service";
import * as WebdaQL from "@webda/ql";
import { useApplication, useModelId } from "../application/hooks";
import { useLog } from "../loggers/hooks";
import { useCore } from "../core/hooks";
import { InstanceCache } from "../cache/cache";

export class StoreNotFoundError extends WebdaError.CodeError {
  constructor(uuid: PrimaryKey<any>, storeName: string) {
    super("STORE_NOTFOUND", `Item not found ${uuid} Store(${storeName})`);
  }
}

export class UpdateConditionFailError extends WebdaError.CodeError {
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
export interface StoreInterface {
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
  find(query: string): Promise<StoreFindResult<any>>;
  query(query: string): Promise<StoreFindResult<any>>;
  iterate(query: string): AsyncGenerator;
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

  load(params: any) {
    // REFACTOR >= 5
    if (params.expose) {
      throw new Error("Expose is not supported anymore, use DomainService instead");
    }
    // END_REFACTOR
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
   * Store the manager hierarchy with their depth
   */
  _modelsHierarchy: { [key: string]: number } = {};
  /**
   * Contains the current model type
   */
  _modelType: string;
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


  @InstanceCache()
  static computeStores() {
    // Gather all stores and register Repository
    const stores = Object.values(useCore().getServices()).filter(s => s instanceof Store);
    const models = Object.values(useApplication().getModels());
    const registry = useCore().getService<Store>("Registry");
    // Check each available models
    for (const model of models) {
      // Model can be null?
      if (!model) continue;
      if (!model.Metadata || !Array.isArray(model.Metadata.PrimaryKey)) {
        useLog("WARN", `${useModelId(model)} does not have Metadata or PrimaryKey defined`);
        continue;
      }
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
      model.registerRepository(currentStore.getRepository(model) as any);
      useLog("DEBUG", `${useModelId(model)} using store ${currentStore.getName()}`);
    }
  }

  /**
   * Retrieve the Model
   *
   * @throws Error if model is not found
   */
  computeParameters(): void {
    /*
    super.computeParameters();
    const app = useApplication();
    this._model = useModel(this.parameters.model);
    if (!this._model) {
      throw new Error(`Model not found: ${this.parameters.model}`);
    }
    this._modelMetadata = useModelMetadata(this._model);
    if (!this._modelMetadata) {
      throw new Error(`Model Metadata not found: ${this.parameters.model}`);
    }
    useLog("TRACE", "METADATA", this._modelMetadata);
    this._modelType = this._modelMetadata.Identifier;
    const recursive = (tree: ModelClass[], depth) => {
      for (const model of tree) {
        this._modelsHierarchy[this._modelMetadata.Identifier] ??= depth;
        this._modelsHierarchy[this._modelMetadata.Identifier] = Math.min(
          depth,
          this._modelsHierarchy[this._modelMetadata.Identifier]
        );
        recursive(this._modelMetadata.Subclasses, depth + 1);
      }
    };
    // Compute the hierarchy
    this._modelsHierarchy[this._modelMetadata.Identifier] = 0;
    // Strict Store only store their model
    if (!this.parameters.strict) {
      recursive(this._modelMetadata.Subclasses, 1);
    }
    // Add additional models
    if (this.parameters.additionalModels.length) {
      // Strict mode is to only allow one model per store
      if (this.parameters.strict) {
        this.log("ERROR", "Cannot add additional models in strict mode");
      } else {
        for (const modelType of this.parameters.additionalModels) {
          const model = useModel(modelType);
          this._modelsHierarchy[this._modelMetadata.Identifier] = 0;
          recursive(this._modelMetadata.Subclasses, 1);
        }
      }
    }
    */
  }

  logSlowQuery(_query: string, _reason: string, _time: number) {
    // TODO Need to implement: https://github.com/loopingz/webda.io/issues/202
  }

  /**
   * Initialize the store
   * @returns 
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
   * @returns
   */
  getModel(): ModelClass {
    return this._model;
  }

  /**
   * Return if a model is handled by the store
   * @param model
   * @return distance from the managed class -1 means not managed, 0 manage exactly this model, >0 manage an ancestor model
   *
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
