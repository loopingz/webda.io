import { Counter, Histogram } from "../metrics/metrics.js";
import * as WebdaError from "../errors/errors.js";
import { type Model, type ModelClass, type PrimaryKey, type Repository } from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "../services/service.js";
import * as WebdaQL from "@webda/ql";
export declare class StoreNotFoundError extends WebdaError.CodeError {
    constructor(uuid: PrimaryKey<any>, storeName: string);
}
export declare class UpdateConditionFailError extends WebdaError.CodeError {
    constructor(uuid: PrimaryKey<any>, conditionField: string, condition: string | Date);
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
export interface EventStoreCreated extends EventStore {
}
/**
 * Event called after delete of an object
 */
export interface EventStoreDeleted extends EventStore {
}
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
export interface EventStorePatchUpdated extends EventStoreUpdated {
}
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
    upsertItemToCollection(uuid: PrimaryKey<any>, collection: string, item: any, index?: number, itemWriteConditionField?: string, itemWriteCondition?: any): Promise<void>;
    deleteItemFromCollection(uuid: PrimaryKey<any>, collection: string, index: number, itemWriteConditionField?: string, itemWriteCondition?: any): Promise<void>;
    find(query: string): Promise<StoreFindResult<any>>;
    query(query: string): Promise<StoreFindResult<any>>;
    iterate(query: string): AsyncGenerator;
    incrementAttributes(uuid: PrimaryKey<any>, info: {
        property: string;
        value?: number;
    }[]): Promise<Date>;
}
/**
 * Store parameter
 */
export declare class StoreParameters extends ServiceParameters {
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
    modelAliases?: {
        [key: string]: string;
    };
    /**
     * Disable default memory cache
     */
    noCache?: boolean;
    load(params: any): this;
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
declare abstract class Store<K extends StoreParameters = StoreParameters, E extends StoreEvents = StoreEvents> extends Service<K, E> {
    /**
     * Contains the current model
     */
    _model: ModelClass;
    /**
     * Store the manager hierarchy with their depth
     */
    _modelsHierarchy: {
        [key: string]: number;
    };
    /**
     * Contains the current model type
     */
    _modelType: string;
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
    static computeStores(): void;
    /**
     * Retrieve the Model
     *
     * @throws Error if model is not found
     */
    computeParameters(): void;
    logSlowQuery(_query: string, _reason: string, _time: number): void;
    /**
     * Initialize the store
     * @returns
     */
    init(): Promise<this>;
    /**
     * @override
     */
    initMetrics(): void;
    /**
     * Return Store current model
     * @returns
     */
    getModel(): ModelClass;
    /**
     * Return if a model is handled by the store
     * @param model
     * @return distance from the managed class -1 means not managed, 0 manage exactly this model, >0 manage an ancestor model
     *
     */
    handleModel(model: ModelClass | Model): number;
    /**
     * Check that keys are valid
     * All keys of model stored in a Store must have the same type of primary key
     */
    checkKeys(): void;
    abstract getRepository<T extends ModelClass>(model: T): Repository<T>;
}
export { Store };
//# sourceMappingURL=store.d.ts.map