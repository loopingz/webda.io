import { Counter, EventWithContext, Histogram, RegistryEntry } from "../core";
import { ConfigurationProvider, ModelMapLoaderImplementation, Throttler, WebdaError } from "../index";
import { Constructor, CoreModel, CoreModelDefinition, FilterKeys, ModelAction } from "../models/coremodel";
import { Route, Service, ServiceParameters } from "../services/service";
import { OperationContext, WebContext } from "../utils/context";
import { HttpMethodType } from "../utils/httpcontext";
import { WebdaQL } from "./webdaql/query";

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
   * Store emitting
   */
  store: Store;
  /**
   * Context of the operation
   */
  context?: OperationContext;
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
export interface EventStoreUpdate extends EventStoreUpdated {
  /**
   * Update content
   */
  update: any;
}
/**
 * Event called after update of an object
 */
export interface EventStoreUpdated extends EventStore {}
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
  /**
   * Context in which the query was run
   */
  context: OperationContext;
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
 * @deprecated Store should not be exposed directly anymore
 * You should use the DomainService instead
 */
export type StoreExposeParameters = {
  /**
   * URL endpoint to use to expose REST Resources API
   *
   * @default service.getName().toLowerCase()
   */
  url?: string;
  /**
   * You can restrict any part of the CRUD
   *
   * @default {}
   */
  restrict?: {
    /**
     * Do not expose the POST
     */
    create?: boolean;
    /**
     * Do not expose the PUT and PATCH
     */
    update?: boolean;
    /**
     * Do not expose the GET
     */
    get?: boolean;
    /**
     * Do not expose the DELETE
     */
    delete?: boolean;
    /**
     * Do not expose the query endpoint
     */
    query?: boolean;
  };

  /**
   * For confidentiality sometimes you might prefer to expose query through PUT
   * To avoid GET logging
   *
   * @default "GET"
   */
  queryMethod?: "PUT" | "GET";
};

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
   * async delete
   */
  asyncDelete: boolean;

  /**
   * Expose the service to an urls
   *
   * @deprecated will probably be removed in 4.0 in favor of Expose annotation
   */
  expose?: StoreExposeParameters;

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

  constructor(params: any, service: Service<any>) {
    super(params);
    this.model ??= "Webda/CoreModel";
    let expose = params.expose;
    if (typeof expose == "boolean") {
      expose = {};
      expose.url = "/" + service.getName().toLowerCase();
    } else if (typeof expose == "string") {
      expose = {
        url: expose
      };
    } else if (typeof expose == "object" && expose.url == undefined) {
      expose.url = "/" + service.getName().toLowerCase();
    }
    if (expose) {
      expose.restrict = expose.restrict || {};
      this.expose = expose;
      this.expose.queryMethod ??= "GET";
      this.url = expose.url;
    }
    if (params.map) {
      throw new Error("Deprecated map usage, use a MapperService");
    }
    if (params.index) {
      throw new Error("Deprecated index usage, use an AggregatorService");
    }
    this.strict ??= false;
    this.defaultModel ??= true;
    this.forceModel ??= false;
    this.slowQueryThreshold ??= 30000;
    this.modelAliases ??= {};
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
 * TODO Create the mapping documentation
 *
 * It use basic CRUD, and can expose those 4 to through HTTP
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
 * Mapping:
 *
 *
 * Parameters
 *
 *  map: { ... }
 *  expose: { // Enable the HTTP exposure
 *      url: '', // The url to expose to by default it is service name in lowercase ( users for example )
 *      restrict: {
 *	       create: true, // Don't expose the POST /users
 *         update: true, // Don't expose the PUT /users/{uuid}
 *         delete: true, // Don't expose the DELETE /users/{uuid}
 *         get: true // Don't expose the GET /users/{uuid}
 *      }
 *   }
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
    operations_total: Counter;
    slow_queries_total: Counter;
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
    this._cacheStore?.computeParameters();
    this.cacheStorePatchException();
    const recursive = (tree, depth) => {
      for (let i in tree) {
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
    if (this.getParameters().expose) {
      this.log("WARN", "Exposing a store is not recommended, use a DomainService instead to expose all your CoreModel");
    }
  }

  logSlowQuery(_query: string, _reason: string, _time: number) {
    // TODO Need to implement: https://github.com/loopingz/webda.io/issues/202
  }

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.operations_total = this.getMetric(Counter, {
      name: "store_operations_total",
      help: "Operations counter for this store",
      labelNames: ["operation"]
    });
    this.metrics.slow_queries_total = this.getMetric(Counter, {
      name: "store_slow_queries",
      help: "Number of slow queries encountered"
    });
    this.metrics.queries = this.getMetric(Histogram, {
      name: "store_queries",
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
   * @param uid
   * @param raiseIfNotFound
   * @returns
   */
  async _getFromCache(uid: string, raiseIfNotFound: boolean = false): Promise<T> {
    let res = await this._cacheStore?._get(uid);
    if (!res) {
      res = await this._get(uid, raiseIfNotFound);
    } else {
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

  /**
   * @override
   */
  getUrl(url: string, methods: HttpMethodType[]) {
    // If url is absolute
    if (url.startsWith("/")) {
      return url;
    }

    // Parent url to find here
    const expose = this.parameters.expose;
    if (
      !expose.url ||
      (url === "." && methods.includes("POST") && expose.restrict.create) ||
      (url === "./{uuid}" && methods.includes("DELETE") && expose.restrict.delete) ||
      (url === "./{uuid}" && methods.includes("PATCH") && expose.restrict.update) ||
      (url === "./{uuid}" && methods.includes("PUT") && expose.restrict.update) ||
      (url === "./{uuid}" && methods.includes("GET") && expose.restrict.get) ||
      (url === ".{?q}" && methods.includes("GET") && expose.restrict.query) ||
      (url === "." && methods.includes("PUT") && expose.restrict.query)
    ) {
      return undefined;
    }
    return super.getUrl(url, methods);
  }

  /**
   * @inheritdoc
   */
  initRoutes() {
    if (!this.parameters.expose) {
      return;
    }
    super.initRoutes();
    // We enforce ExposeParameters within the constructor
    const expose = this.parameters.expose;

    // Query endpoint
    if (!expose.restrict.query) {
      let requestBody;
      if (expose.queryMethod === "PUT") {
        requestBody = {
          content: {
            "application/json": {
              schema: {
                properties: {
                  q: {
                    type: "string"
                  }
                }
              }
            }
          }
        };
      }
      this.addRoute(expose.queryMethod === "GET" ? `.{?q}` : ".", [expose.queryMethod], this.httpQuery, {
        model: this._model.name,
        [expose.queryMethod.toLowerCase()]: {
          description: `Query on ${this._model.name} model with WebdaQL`,
          summary: "Query " + this._model.name,
          operationId: `query${this._model.name}`,
          requestBody,
          responses: {
            "200": {
              description: `Retrieve models ${this._model.name}`,
              content: {
                "application/json": {
                  schema: {
                    properties: {
                      contiuationToken: {
                        type: "string"
                      },
                      results: {
                        type: "array",
                        items: {
                          $ref: `#/components/schemas/${this._model.name}`
                        }
                      }
                    }
                  }
                }
              }
            },
            "400": {
              description: "Query is invalid"
            },
            "403": {
              description: "You don't have permissions"
            }
          }
        }
      });
    }

    // Model actions
    if (this._model && this._model.getActions) {
      let actions = this._model.getActions();
      Object.keys(actions).forEach(name => {
        let action: ModelAction = actions[name];
        if (!action.methods) {
          action.methods = ["PUT"];
        }
        let executer;
        if (action.global) {
          // By default will grab the object and then call the action
          if (!this._model[name]) {
            throw Error("Action static method " + name + " does not exist");
          }
          executer = this.httpGlobalAction;
          this.addRoute(`./${name}`, action.methods, executer, action.openapi);
        } else {
          // By default will grab the object and then call the action
          if (!this._model.prototype[name]) {
            throw Error("Action method " + name + " does not exist");
          }
          executer = this.httpAction;

          this.addRoute(`./{uuid}/${name}`, action.methods, executer, action.openapi);
        }
      });
    }
  }

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
    if (!this._cacheStore) {
      return;
    }
    const replacer = original => {
      return (...args) => {
        return original
          .bind(this._cacheStore, ...args)()
          .catch(err => {
            this.log("TRACE", `Ignoring cache exception ${this._name}: ${err.message}`);
          });
      };
    };
    for (let i of [
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
    if (object instanceof CoreModel) {
      object.__type ??= this.getWebda().getApplication().getModelFromInstance(object) || this._modelType;
    } else {
      object.__type ??= this._modelType;
    }

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
          object = this._model.factory(this._model, object);
        }
      } else {
        object = this._model.factory(this._model, object);
      }
    }
    if (!object.getUuid()) {
      object.setUuid(object.generateUid(object));
    }
    object.__store = this;
    for (let i in this._reverseMap) {
      object[this._reverseMap[i].property] ??= [];
      for (let j in object[this._reverseMap[i].property]) {
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
    let result = this.initModel(object);
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
  async incrementAttributes<FK extends FilterKeys<T, number>>(uid: string, info: { property: FK; value: number }[]) {
    let params = <{ property: string; value: number }[]>info.filter(i => i.value !== 0);
    // If value === 0 no need to update anything
    if (params.length === 0) {
      return;
    }
    let updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "increment" });
    await this._incrementAttributes(uid, params, updateDate);
    await this._cacheStore?._incrementAttributes(uid, params, updateDate);
    return this.emitSync("Store.PartialUpdated", {
      object_id: uid,
      store: this,
      updateDate,
      partial_update: {
        increments: params
      }
    });
  }

  /**
   * Helper function that call incrementAttributes
   * @param uid
   * @param prop
   * @param value
   * @returns
   */
  async incrementAttribute<FK extends FilterKeys<T, number>>(uid: string, prop: FK, value: number) {
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
  async upsertItemToCollection<FK extends FilterKeys<T, Array<any>>>(
    uid: string,
    prop: FK,
    item: any,
    index: number = undefined,
    itemWriteCondition: any = undefined,
    itemWriteConditionField: string = this._uuidField
  ) {
    let updateDate = new Date();
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
    await this._cacheStore?._upsertItemToCollection(
      uid,
      <string>prop,
      item,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );

    await this.emitSync("Store.PartialUpdated", {
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
  async deleteItemFromCollection<FK extends FilterKeys<T, Array<any>>>(
    uid: string,
    prop: FK,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string = this._uuidField
  ) {
    let updateDate = new Date();
    this.metrics.operations_total.inc({ operation: "collectionDelete" });
    await this._deleteItemFromCollection(
      uid,
      <string>prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
    await this._cacheStore?._deleteItemFromCollection(
      uid,
      <string>prop,
      index,
      itemWriteCondition,
      itemWriteConditionField,
      updateDate
    );
    await this.emitSync("Store.PartialUpdated", {
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
  }

  /**
   * Get all results without pagination
   *
   * This can be resource consuming
   *
   * @param query
   * @param context
   */
  async queryAll(query: string, context?: OperationContext): Promise<T[]> {
    const res: T[] = [];
    if (query.includes("OFFSET")) {
      throw new Error("Cannot contain an OFFSET for queryAll method");
    }
    let continuationToken;
    do {
      let q = query + (continuationToken !== undefined ? ` OFFSET "${continuationToken}"` : "");
      let page = await this.query(q, context);
      continuationToken = page.continuationToken;
      res.push(...page.results);
    } while (continuationToken);
    return res;
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
   */
  async query(query: string, context?: OperationContext): Promise<{ results: T[]; continuationToken?: string }> {
    let permissionQuery = this._model.getPermissionQuery(context);
    let partialPermission = true;
    let fullQuery;
    if (permissionQuery) {
      partialPermission = permissionQuery.partial;
      if (query.trim() !== "") {
        fullQuery = `(${permissionQuery.query}) AND ${query}`;
      } else {
        fullQuery = permissionQuery.query;
      }
    } else {
      fullQuery = query;
    }
    let queryValidator = new WebdaQL.QueryValidator(fullQuery);
    let offset = queryValidator.getOffset();
    const limit = queryValidator.getLimit();
    const parsedQuery = this.queryTypeUpdater(queryValidator.getQuery());
    parsedQuery.limit = limit;
    // __type is a special field to filter on the type of the object
    // Emit the default event
    await this.emitSync("Store.Query", {
      query,
      parsedQuery,
      store: this,
      context
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
    let [mainOffset, subOffset] = offset.split("_");
    let secondOffset = parseInt(subOffset || "0");
    let duration = Date.now();
    this.metrics.operations_total.inc({ operation: "query" });

    while (result.results.length < limit) {
      let tmpResults = await this.find({
        ...parsedQuery,
        continuationToken: mainOffset
      });
      // If no filter is returned assume it is by mistake and apply filtering
      if (tmpResults.filter === undefined) {
        tmpResults.filter = queryValidator.getExpression();
        this.log("WARN", `Store '${this.getName()}' postquery full filtering`);
      }
      let subOffsetCount = 0;
      for (let item of tmpResults.results) {
        item.setContext(context);
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
      results: result.results,
      context
    });
    return result;
  }

  /**
   * Expose query to http
   */
  async httpQuery(ctx: WebContext): Promise<void> {
    let query: string;
    if (ctx.getHttpContext().getMethod() === "GET") {
      query = ctx.getParameters().q;
    } else {
      query = (await ctx.getRequestBody()).q;
    }
    try {
      ctx.write(await this.query(query, ctx));
    } catch (err) {
      if (err instanceof SyntaxError) {
        this.log("INFO", "Query syntax error");
        throw new WebdaError.BadRequest("Query syntax error");
      }
      throw err;
    }
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
  async save(object, ctx: OperationContext = undefined): Promise<T> {
    if (object instanceof this._model && object._creationDate !== undefined && object._lastUpdate !== undefined) {
      if (ctx) {
        object.setContext(ctx);
      }
      return <T>await object.save();
    }
    return this.create(object, ctx);
  }

  /**
   *
   * @param object
   * @param ctx
   * @returns
   */
  async create(object, ctx: OperationContext = undefined) {
    object = this.initModel(object);

    // Dates should be store by the Store
    object._creationDate ??= new Date();
    object._lastUpdate = new Date();
    const ancestors = this.getWebda().getApplication().getModelHierarchy(object.__type).ancestors;
    object.__types = [object.__type, ...ancestors].filter(i => i !== "Webda/CoreModel" && i !== "CoreModel");

    if (ctx) {
      object.setContext(ctx);
    }
    await this.emitSync("Store.Save", {
      object: object,
      store: this,
      context: ctx
    });
    // Handle object auto listener
    await object._onSave();
    this.metrics.operations_total.inc({ operation: "save" });
    let res = await this._save(object);
    await this._cacheStore?._save(object);
    object = this.initModel(res);
    await this.emitSync("Store.Saved", {
      object: object,
      store: this,
      context: ctx
    });
    await object._onSaved();

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
  checkCollectionUpdateCondition<FK extends FilterKeys<T, Array<any>>, CK extends keyof T>(
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
    updates: Partial<T>,
    conditionField: CK,
    condition: any
  ): Promise<boolean> {
    try {
      await this._patch(updates, uuid, condition, <string>conditionField);
      await this._cacheStore?.patch({ uuid, ...updates });
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
  async simulateUpsertItemToCollection<FK extends FilterKeys<T, Array<any>>>(
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
    /** @ignore */
    let saved;
    let loaded;
    // Dont allow to update collections from map
    if (this._reverseMap != undefined && reverseMap) {
      for (let i in this._reverseMap) {
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
    let load = await this._getFromCache(object[this._uuidField], true);
    if (load.__type !== this._modelType && this.parameters.strict) {
      this.log(
        "WARN",
        `Object '${object[this._uuidField]}' was not created by this store ${load.__type}:${this._modelType}`
      );
      throw new StoreNotFoundError(object[this._uuidField], this.getName());
    }
    loaded = this.initModel(load);
    if (object instanceof CoreModel) {
      loaded.setContext(object.getContext());
    }
    if (partial) {
      await this.emitSync(`Store.PatchUpdate`, {
        object: loaded,
        store: this,
        update: object
      });
    } else {
      await this.emitSync(`Store.Update`, {
        object: loaded,
        store: this,
        update: object
      });
    }

    await loaded._onUpdate(object);
    let res: any;
    if (conditionField !== null) {
      conditionField ??= <CK>"_lastUpdate";
      conditionValue ??= load[conditionField];
    }
    if (partial) {
      this.metrics.operations_total.inc({ operation: "partialUpdate" });
      await this._patch(object, object[this._uuidField], conditionValue, <string>conditionField);
      await this._cacheStore?._patch(object, object[this._uuidField], load._lastUpdate, "_lastUpdate");
      res = object;
    } else {
      // Copy back the mappers
      for (let i in this._reverseMap) {
        object[this._reverseMap[i].property] = loaded[this._reverseMap[i].property];
      }
      object = this.initModel(object);
      this.metrics.operations_total.inc({ operation: "update" });
      res = await this._update(object, object[this._uuidField], conditionValue, <string>conditionField);
      await this._cacheStore?._update(object, object[this._uuidField], load._lastUpdate, "_lastUpdate");
    }
    // Return updated
    for (let i in res) {
      loaded[i] = res[i];
    }
    for (let i in object) {
      loaded[i] = object[i];
    }
    saved = this.initModel(loaded);
    if (partial) {
      await this.emitSync(`Store.PatchUpdated`, {
        object: saved,
        store: this
      });
    } else {
      await this.emitSync(`Store.Updated`, {
        object: saved,
        store: this
      });
    }

    await saved._onUpdated();
    return saved;
  }

  /**
   * Manage the store migration for __type case sensitivity
   */
  async v3Migration() {
    // Compute case for all object
    await this.recomputeTypeCase();
    // Compute all __types
    await this.recomputeTypes();
    // We do not move to short id as it is not compatible with v2
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
   * Recompute type case
   */
  async recomputeTypeCase() {
    this.log("INFO", "Ensuring __type is case sensitive from migration from v2.x");
    const app = this.getWebda().getApplication();
    // We need to be laxist for migration
    this.parameters.strict = false;
    await this.migration("typesCase", async item => {
      if (item.__type !== undefined) {
        if (!app.hasWebdaObject("models", item.__type, true) && app.hasWebdaObject("models", item.__type, false)) {
          const model = app.getWebdaObject("models", item.__type, false);
          const name = app.getModelName(model);
          if (model) {
            this.log("INFO", "Migrating type " + item.__type + " to " + name);
            return <Partial<T>>{
              __type: name
            };
          }
        }
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
      let __types = this.getWebda().getApplication().getModelTypes(item);
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
  async migration(name: string, patcher: (object: T) => Promise<Partial<T> | undefined>, batchSize: number = 500) {
    let status: RegistryEntry<{
      continuationToken?: string;
      count: number;
      updated: number;
      done: boolean;
    }> = await this.getWebda().getRegistry().get(`storeMigration.${this.getName()}.${name}`, undefined, {});
    status.count ??= 0;
    status.updated ??= 0;
    const worker = new Throttler(20);
    do {
      const res = await this.query(
        status.continuationToken ? `LIMIT ${batchSize} OFFSET "${status.continuationToken}"` : `LIMIT ${batchSize}`
      );
      status.count += res.results.length;
      for (let item of res.results) {
        let updated = await patcher(item);
        if (updated !== undefined) {
          status.updated++;
          worker.queue(async () => {
            await item.patch(updated, null);
          });
        }
      }
      this.log(
        "INFO",
        `storeMigration.${this.getName()}.${name}: Migrated ${status.count} items: ${status.updated} updated`
      );
      status.continuationToken = res.continuationToken;
      await worker.waitForCompletion();
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
    await this._cacheStore?._removeAttribute(
      uuid,
      <string>attribute,
      itemWriteCondition,
      <string>itemWriteConditionField
    );
    await this.emitSync("Store.PartialUpdated", {
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
   * Delete an object from the store without condition nor async
   * @param uid to delete
   * @returns
   */
  async forceDelete(uid: string): Promise<void> {
    return this.delete(uid, undefined, undefined, true);
  }

  /**
   * Delete an object
   *
   * @param {String} uuid to delete
   * @param {Boolean} delete sync even if asyncDelete is active
   * @return {Promise} the deletion promise
   */
  async delete<CK extends keyof T>(
    uid: string | T,
    writeCondition?: any,
    writeConditionField?: CK,
    sync: boolean = false
  ): Promise<void> {
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
    // Send preevent
    await this.emitSync("Store.Delete", {
      object: to_delete,
      store: this
    });
    await to_delete._onDelete();

    // If async we just tag the object as deleted
    if (this.parameters.asyncDelete && !sync) {
      this.metrics.operations_total.inc({ operation: "partialUpdate" });
      await this._patch(
        {
          __deleted: true
        },
        to_delete.getUuid()
      );
      await this._cacheStore?._patch(
        {
          __deleted: true
        },
        to_delete.getUuid()
      );
    } else {
      this.metrics.operations_total.inc({ operation: "delete" });
      // Delete from the DB for real
      await this._delete(to_delete.getUuid(), writeCondition, <string>writeConditionField);
      await this._cacheStore?._delete(to_delete.getUuid(), writeCondition, <string>writeConditionField);
    }

    // Send post event
    await this.emitSync("Store.Deleted", {
      object: to_delete,
      store: this
    });
    await to_delete._onDeleted();
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
    let object = await this._getFromCache(id);
    if (!object) {
      return undefined;
    }
    let result: { [key: string]: any } = {};
    for (let i in object) {
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
  async get(uid: string, ctx: OperationContext = undefined, defaultValue: any = undefined): Promise<T> {
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
    object.setContext(ctx);
    await this.emitSync("Store.Get", {
      object: object,
      store: this,
      context: ctx
    });
    await object._onGet();
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
    let patch: any = {};
    patch[property] = value;
    patch[this.getUuidField()] = uid;
    await this.patch(patch);
  }

  /**
   * @override
   */
  protected async simulateFind(query: WebdaQL.Query, uuids: string[]): Promise<StoreFindResult<T>> {
    let result: StoreFindResult<T> = {
      results: [],
      continuationToken: undefined,
      filter: true
    };
    let count = 0;
    let limit = query.limit;
    let offset = parseInt(query.continuationToken || "0");
    let originalOffset = offset;

    if (query.orderBy && query.orderBy.length) {
      offset = 0;
      // We need to retrieve everything to orderBy after
      limit = Number.MAX_SAFE_INTEGER;
    }
    // Need to transfert to Array
    for (let uuid of uuids) {
      count++;
      // Offset start
      if (offset >= count) {
        continue;
      }
      let obj = await this._getFromCache(uuid);
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
        for (let orderBy of query.orderBy) {
          let invert = orderBy.direction === "ASC" ? 1 : -1;
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
   * Handle POST
   * @param ctx
   */
  @Route(".", ["POST"], {
    post: {
      description: "The way to create a new ${modelName} model",
      summary: "Create a new ${modelName}",
      operationId: "create${modelName}",
      requestBody: {
        content: {
          "application/json": {
            schema: {
              $ref: "#/components/schemas/${modelName}"
            }
          }
        }
      },
      responses: {
        "200": {
          description: "Retrieve model",
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/${modelName}"
              }
            }
          }
        },
        "400": {
          description: "Object is invalid"
        },
        "403": {
          description: "You don't have permissions"
        },
        "409": {
          description: "Object already exists"
        }
      }
    }
  })
  async httpCreate(ctx: WebContext) {
    return this.operationCreate(ctx, this.parameters.model);
  }

  /**
   * Create a new object based on the context
   * @param ctx
   * @param model
   */
  async operationCreate(ctx: OperationContext, model: string) {
    let body = await ctx.getInput();
    const modelPrototype = this.getWebda().getApplication().getModel(model);
    let object = modelPrototype.factory(modelPrototype, body, ctx);
    object._creationDate = new Date();
    await object.checkAct(ctx, "create");
    try {
      await object.validate(ctx, body);
    } catch (err) {
      this.log("INFO", "Object is not valid", err);
      throw new WebdaError.BadRequest("Object is not valid");
    }
    if (object[this._uuidField] && (await this.exists(object[this._uuidField]))) {
      throw new WebdaError.Conflict("Object already exists");
    }
    await this.save(object, ctx);
    ctx.write(object);
    await this.emitSync("Store.WebCreate", {
      context: ctx,
      values: body,
      object: object,
      store: this
    });
  }

  /**
   * Handle obect action
   * @param ctx
   */
  async httpAction(ctx: WebContext) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    let object = await this.get(ctx.parameter("uuid"), ctx);
    if (object === undefined || object.__deleted) {
      throw new WebdaError.NotFound("Object not found or is deleted");
    }
    await object.checkAct(ctx, action);
    await this.emitSync("Store.Action", {
      action: action,
      object: object,
      store: this,
      context: ctx
    });
    const res = await object[action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      object: object,
      store: this,
      context: ctx,
      result: res
    });
  }

  /**
   * Handle collection action
   * @param ctx
   */
  async httpGlobalAction(ctx: WebContext, model: CoreModelDefinition = this._model) {
    let action = ctx.getHttpContext().getUrl().split("/").pop();
    await this.emitSync("Store.Action", {
      action: action,
      store: this,
      context: ctx,
      model
    });
    const res = await model[action](ctx);
    if (res) {
      ctx.write(res);
    }
    await this.emitSync("Store.Actioned", {
      action: action,
      store: this,
      context: ctx,
      result: res,
      model
    });
  }

  /**
   * Handle HTTP Update for an object
   *
   * @param ctx context of the request
   */
  @Route("./{uuid}", ["PUT", "PATCH"], {
    put: {
      description: "Update a ${modelName} if the permissions allow",
      summary: "Update a ${modelName}",
      operationId: "update${modelName}",
      schemas: {
        input: "${modelName}",
        output: "${modelName}"
      },
      responses: {
        "200": {},
        "400": {
          description: "Object is invalid"
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    },
    patch: {
      description: "Patch a ${modelName} if the permissions allow",
      summary: "Patch a ${modelName}",
      operationId: "partialUpdatet${modelName}",
      schemas: {
        input: "${modelName}"
      },
      responses: {
        "204": {
          description: ""
        },
        "400": {
          description: "Object is invalid"
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    }
  })
  async httpUpdate(ctx: WebContext) {
    const { uuid } = ctx.getParameters();
    const body = await ctx.getInput();
    body[this._uuidField] = uuid;
    let object = await this.get(uuid, ctx);
    if (!object || object.__deleted) throw new WebdaError.NotFound("Object not found or is deleted");
    await object.checkAct(ctx, "update");
    if (ctx.getHttpContext().getMethod() === "PATCH") {
      try {
        await object.validate(ctx, body, true);
      } catch (err) {
        this.log("INFO", "Object invalid", err, object);
        throw new WebdaError.BadRequest("Object is not valid");
      }
      let updateObject: any = new this._model();
      // Clean any default attributes from the model
      Object.keys(updateObject)
        .filter(i => i !== "__class")
        .forEach(i => {
          delete updateObject[i];
        });
      updateObject.setContext(ctx);
      updateObject.load(body);
      await this.patch(updateObject);
      object = undefined;
    } else {
      let updateObject: any = new this._model();
      updateObject.setContext(ctx);
      updateObject.load(body);
      // Copy back the _ attributes
      Object.keys(object)
        .filter(i => i.startsWith("_"))
        .forEach(i => {
          updateObject[i] = object[i];
        });
      try {
        await updateObject.validate(ctx, body);
      } catch (err) {
        this.log("INFO", "Object invalid", err);
        throw new WebdaError.BadRequest("Object is not valid");
      }

      // Add mappers back to
      object = await this.update(updateObject);
    }
    ctx.write(object);
    await this.emitSync("Store.WebUpdate", {
      context: ctx,
      updates: body,
      object: object,
      store: this,
      method: <"PATCH" | "PUT">ctx.getHttpContext().getMethod()
    });
  }

  /**
   * Handle GET on object
   *
   * @param ctx context of the request
   */
  @Route("./{uuid}", ["GET"], {
    get: {
      description: "Retrieve ${modelName} model if permissions allow",
      summary: "Retrieve a ${modelName}",
      operationId: "get${modelName}",
      schemas: {
        output: "${modelName}"
      },
      responses: {
        "200": {},
        "400": {
          description: "Object is invalid"
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    }
  })
  async httpGet(ctx: WebContext) {
    let uuid = ctx.parameter("uuid");
    let object = await this.get(uuid, ctx);
    await this.emitSync("Store.WebGetNotFound", {
      context: ctx,
      uuid,
      store: this
    });
    if (object === undefined || object.__deleted) {
      throw new WebdaError.NotFound("Object not found or is deleted");
    }
    await object.checkAct(ctx, "get");
    ctx.write(object);
    await this.emitSync("Store.WebGet", {
      context: ctx,
      object: object,
      store: this
    });
    ctx.write(object);
  }

  /**
   * Handle HTTP request
   *
   * @param ctx context of the request
   * @returns
   */
  @Route("./{uuid}", ["DELETE"], {
    delete: {
      operationId: "delete${modelName}",
      description: "Delete ${modelName} if the permissions allow",
      summary: "Delete a ${modelName}",
      responses: {
        "204": {
          description: ""
        },
        "403": {
          description: "You don't have permissions"
        },
        "404": {
          description: "Unknown object"
        }
      }
    }
  })
  async httpDelete(ctx: WebContext) {
    let uuid = ctx.parameter("uuid");
    let object = await this.get(uuid, ctx);
    if (!object || object.__deleted) throw new WebdaError.NotFound("Object not found or is deleted");
    await object.checkAct(ctx, "delete");
    // http://stackoverflow.com/questions/28684209/huge-delay-on-delete-requests-with-204-response-and-no-content-in-objectve-c#
    // IOS don't handle 204 with Content-Length != 0 it seems
    // Might still run into: Have trouble to handle the Content-Length on API Gateway so returning an empty object for now
    ctx.writeHead(204, { "Content-Length": "0" });
    await this.delete(uuid);
    await this.emitSync("Store.WebDelete", {
      context: ctx,
      object_id: uuid,
      store: this
    });
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
