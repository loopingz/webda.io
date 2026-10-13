import { Counter, Histogram } from "../metrics/metrics.js";
import * as WebdaError from "../errors/errors.js";

import {
  registerRepository,
  type AggregationOptions,
  type Model,
  type ModelClass,
  type PrimaryKey,
  type Repository
} from "@webda/models";
import { ServiceParameters } from "../services/serviceparameters.js";
import { Service } from "../services/service.js";
import * as WebdaQL from "@webda/ql";
import type { WebdaQLString } from "@webda/ql";
import { useApplication, useModel, useModelId } from "../application/hooks.js";
import { useLog, useOutput } from "../loggers/hooks.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import type { ModelMetadata } from "@webda/compiler";
import { InstanceCache } from "../cache/cache.js";
import { randomUUID } from "node:crypto";
import { classifyStoredType, UNREADABLE, UNTYPED } from "../application/model-types.js";
import { useRegistry } from "../models/registry.model.js";
import {
  DEFAULT_MIGRATION_BATCH,
  DEFAULT_TYPE_CHECK_ROWS,
  DEFAULT_MIGRATION_LEASE,
  emptyProgress,
  emptyTableReport,
  formatMigrationReport,
  incrementCount,
  MigrationAlreadyRunning,
  migrationTotals,
  scanRawRows,
  summarizeStoredTypes,
  MigrationUnsupported,
  toMigrationProgress,
  type MigrationContext,
  type MigrationLease,
  type MigrationOptions,
  type MigrationPatcher,
  type MigrationProgress,
  type MigrationReport,
  type RawPage,
  type RawPatch,
  type RawTable,
  type StoredTypeCounts,
  type TypeCheckSummary
} from "./migration.js";

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
 *
 * @internal — Store-internal type. App code queries via `Model.query()` / `useRepository(Model).query()`.
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
 *
 * @internal — Store-internal contract. App code uses `Repository<T>` from `@webda/models`.
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
 *
 * @internal — Store configuration schema. Authored in `webda.config`/deployment
 * files; not consumed by app code directly.
 */
export class StoreParameters extends ServiceParameters {
  /**
   * Models managed by this Store.
   *
   * @default ["Webda/RegistryEntry"]
   */
  models?: string[];

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
   * Slow query threshold
   *
   * @default 30000
   */
  slowQueryThreshold: number;
  /**
   * What to do when an aggregation on this store cannot run natively and must
   * stream every matching object through memory
   *
   * @default "warn"
   */
  aggregationFallback?: "allow" | "warn" | "deny";
  /**
   * Maximum number of groups an aggregation may produce without LIMIT (or in memory)
   *
   * @minimum 1
   * @default 10000
   */
  maxGroups?: number;
  /**
   * Startup check of the stored types: one WARN listing the legacy, untyped and unknown types found
   */
  typeCheck?: {
    /**
     * @default true
     */
    enabled?: boolean;
    /**
     * Rows scanned at most by stores without a native count; beyond, the counts are "at least"
     *
     * @default 10000
     */
    maxRows?: number;
  };
  /**
   * Disable default memory cache
   */
  noCache?: boolean;

  /**
   * Load store parameters with defaults for models, strict mode and the startup type check
   * @param params - the service parameters
   * @returns the result
   */
  load(params: any) {
    // REFACTOR >= 5
    if (params.expose) {
      throw new Error("Expose is not supported anymore, use DomainService instead");
    }
    // END_REFACTOR
    super.load(params);

    // Deprecation mapping: model + additionalModels → models[]
    const hasModels = Array.isArray(params.models);
    const hasModel = typeof params.model === "string";
    // Presence check (not length) used for the conflict guard so that
    // `{ models: [...], additionalModels: [] }` is still detected as ambiguous.
    const hasAdditionalKey = Array.isArray(params.additionalModels);
    // Length check used for the deprecation branch: an empty additionalModels
    // alongside a bare `model` is unambiguous and should not warn on its own.
    const hasAdditional = hasAdditionalKey && params.additionalModels.length > 0;

    if (hasModels && (hasModel || hasAdditionalKey)) {
      throw new Error(
        "StoreParameters: `models` and `model`/`additionalModels` are mutually exclusive — ambiguous configuration"
      );
    }

    if (hasModels) {
      this.models = [...params.models];
    } else if (hasModel || hasAdditional) {
      useLog(
        "WARN",
        `StoreParameters: \`model\` and \`additionalModels\` are deprecated. Use \`models: [...]\` instead.`
      );
      this.models = [params.model ?? "Webda/RegistryEntry", ...(params.additionalModels ?? [])];
    } else {
      this.models = ["Webda/RegistryEntry"];
    }

    // When the caller passed `models[]` (or nothing at all), backfill the deprecated
    // fields from the canonical `models[]` so any code still reading `parameters.model`
    // or `parameters.additionalModels` keeps working. In the legacy-input branch
    // `super.load(params)` already set both via Object.assign, so the `??=` is a no-op.
    this.strict ??= false;
    this.slowQueryThreshold ??= 30000;
    this.typeCheck = { enabled: true, maxRows: 10000, ...(this.typeCheck ?? {}) };
    return this;
  }
}

/**
 * Aggregate `Store.*` event map.
 *
 * @internal — Store-internal type. App code listens on typed repository events
 * via `useRepository(Model).on("Created" | "Updated" | ...)`.
 */
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
 * @internal — Subclassed by store packages only. App code never references a
 * Store directly: use `useRepository(Model)` or static model methods
 * (`Model.create()`, `Model.query()`, `Model.ref()`).
 * @category CoreServices
 */
abstract class Store<K extends StoreParameters = StoreParameters, E extends StoreEvents = StoreEvents> extends Service<
  K,
  E
> {
  /** All model classes managed by this store. Index 0 is the legacy "primary" model. */
  _models: ModelClass[] = [];
  /** Metadata for each model in `_models`, keyed by Identifier. */
  _modelMetadatas: Map<string, ModelMetadata> = new Map();
  /** Store the manager hierarchy with their depth */
  _modelsHierarchy: { [key: string]: number } = {};

  /**
   * Override the resolved model class for this store at runtime. Used by
   * the abstract `StoreTest` harness so test fixtures can substitute a
   * subclass with extra fields in place of the configured model. In
   * production this is a no-op the framework never calls.
   * @param model - the substitute model class
   */
  setModelDefinitionHelper(model: ModelClass): void {
    this._models[0] = model;
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
      const repository = currentStore.getRepository(model);
      // Optional: repositories of third-party stores may predate aggregation
      repository.configureAggregation?.(currentStore.getAggregationOptions());
      registerRepository(model, repository as any);
      useLog("DEBUG", `${useModelId(model)} using store ${currentStore.getName()}`);
    }
  }

  /**
   * Retrieve the Models and build the models hierarchy map.
   *
   * Walks `parameters.models[]` (the canonical flat list introduced in Task 1).
   * If the list is empty or contains only the default "Webda/RegistryEntry"
   * fallback, the hierarchy stays empty and the store will not claim any model
   * — preserving the pre-migration fallback behaviour for test-only or
   * misconfigured stores.
   */
  computeParameters(): void {
    super.computeParameters();

    const ids = this.parameters.models ?? [];
    // Empty / default RegistryEntry → leave hierarchy empty (preserves test-only / fallback behaviour).
    const isOnlyDefault = ids.length === 1 && ids[0] === "Webda/RegistryEntry";
    if (ids.length === 0 || isOnlyDefault) {
      return;
    }

    this._models = [];
    this._modelMetadatas = new Map();
    this._modelsHierarchy = {};

    // Subclasses in ModelMetadata are resolved to ModelClass objects at runtime
    // (see Application.setModelMetadata). Accept both string IDs and ModelClass
    // references so the hierarchy is keyed by string identifier throughout.
    const recursive = (subclasses: (string | ModelClass)[], depth: number) => {
      for (const entry of subclasses) {
        let subModel: ModelClass | undefined;
        let subId: string | undefined;
        if (typeof entry === "string") {
          subId = entry;
          try {
            subModel = useModel(entry);
          } catch {
            continue;
          }
        } else {
          subModel = entry as ModelClass;
          subId = useModelId(subModel);
        }
        if (!subId || !subModel) continue;
        this._modelsHierarchy[subId] = Math.min(depth, this._modelsHierarchy[subId] ?? depth);
        const subMeta = useModelMetadata(subModel);
        if (!subMeta) continue;
        recursive(subMeta.Subclasses ?? [], depth + 1);
      }
    };

    for (const id of ids) {
      let model: ModelClass | undefined;
      try {
        model = useModel(id);
      } catch {
        model = undefined;
      }
      if (!model) {
        useLog("TRACE", `Store ${this.getName?.() ?? "unknown"}: model not found: ${id}`);
        continue;
      }
      const meta = useModelMetadata(model);
      if (!meta) {
        useLog("WARN", `Store ${this.getName?.() ?? "unknown"}: model metadata not found for ${id}`);
        continue;
      }
      this._models.push(model);
      this._modelMetadatas.set(meta.Identifier, meta);
      this._modelsHierarchy[meta.Identifier] = 0;
      if (!this.parameters.strict) {
        recursive(meta.Subclasses ?? [], 1);
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
    await super.init();
    try {
      await this.checkStoredTypes();
    } catch (err) {
      // The check informs, it never fails startup
      this.log("WARN", `Cannot check the stored types of ${this.getName()}: ${err?.message ?? err}`);
    }
    return this;
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
   * All models managed by this store.
   * @returns the array of model classes managed by this store
   */
  getModels(): ModelClass[] {
    return this._models;
  }

  /**
   * Tables of this store for raw access, each with the model owning its untyped rows
   *
   * Stores without raw access return undefined: `webda migrate` and the startup type check skip them.
   * @returns the tables, or undefined when the store has no raw access
   */
  getRawTables(): RawTable[] | undefined {
    return undefined;
  }

  /**
   * Read a page of raw rows of a table: no type filter, no hydration
   * @param _table - table name, from {@link getRawTables}
   * @param _batchSize - rows per page
   * @param _token - token of the previous page
   * @returns the page
   */
  async rawPages(_table: string, _batchSize: number, _token?: string): Promise<RawPage> {
    throw new MigrationUnsupported(this.getName());
  }

  /**
   * Set top-level fields of a raw row: no type filter, no hydration, no event
   * @param _table - table name, from {@link getRawTables}
   * @param _key - storage key of the row
   * @param _patch - fields to set
   */
  async rawPatch(_table: string, _key: string, _patch: RawPatch): Promise<void> {
    throw new MigrationUnsupported(this.getName());
  }

  /**
   * Model owning the untyped rows of a single-table store: the first model of `models`
   * @returns the model, undefined when unknown
   */
  protected getTableRoot(): ModelClass | undefined {
    if (this._models[0]) return this._models[0];
    const identifier = this.parameters?.models?.[0];
    if (!identifier) return undefined;
    try {
      return useModel(identifier);
    } catch {
      return undefined;
    }
  }

  /**
   * Refuse a table that is not the single table of this store
   * @param table - the requested table
   */
  protected checkSingleTable(table: string): void {
    if (table !== this.getName()) {
      throw new Error(`Unknown table ${table} in store ${this.getName()}`);
    }
  }

  /**
   * @param name - migration name
   * @returns the Registry entry of the migration
   */
  protected migrationId(name: string): string {
    return `storeMigration.${this.getName()}.${name}`;
  }

  /**
   * @param name - migration name
   * @returns the stored progress, undefined when the migration never ran
   */
  async getMigrationProgress(name: string): Promise<MigrationProgress | undefined> {
    const id = this.migrationId(name);
    if (!(await useRegistry().exists(id))) {
      return undefined;
    }
    return toMigrationProgress(await useRegistry().get(id));
  }

  /**
   * Forget the progress of a migration: the next run starts over
   * @param name - migration name
   */
  async deleteMigrationProgress(name: string): Promise<void> {
    const id = this.migrationId(name);
    if (await useRegistry().exists(id)) {
      await useRegistry().delete(id);
    }
  }

  /**
   * Take the lease of a migration: free, or expired (a crashed runner)
   * @param name - migration name
   * @param leaseDuration - lease duration in ms
   * @returns the lease
   * @throws MigrationAlreadyRunning when another runner holds a live lease
   */
  protected async acquireMigrationLease(
    name: string,
    leaseDuration: number = DEFAULT_MIGRATION_LEASE
  ): Promise<MigrationLease> {
    const registry = useRegistry();
    const id = this.migrationId(name);
    const owner = randomUUID();
    if (!(await registry.exists(id))) {
      try {
        await (registry as any).create({ uuid: id, ...emptyProgress() });
      } catch {
        // Another runner created it first: the conditional patch below decides
      }
    }
    const entry: any = await registry.get(id);
    const current = Number(entry.leaseUntil ?? 0);
    const now = Date.now();
    if (current > now) {
      throw new MigrationAlreadyRunning(id, entry.owner, current);
    }
    const leaseUntil = now + leaseDuration;
    try {
      await registry.patch(id, { leaseUntil, owner }, "leaseUntil", entry.leaseUntil);
    } catch {
      const latest: any = await registry.get(id);
      throw new MigrationAlreadyRunning(id, latest.owner, Number(latest.leaseUntil ?? 0));
    }
    return { id, owner, leaseUntil, leaseDuration, progress: toMigrationProgress(entry) };
  }

  /**
   * Save the progress and renew the lease, conditionally on the lease this runner holds
   * @param lease - the lease
   * @param update - progress fields to set
   * @throws MigrationAlreadyRunning when the lease was taken over
   */
  protected async saveMigrationProgress(lease: MigrationLease, update: Partial<MigrationProgress>): Promise<void> {
    // Always a new value: a runner that lost its lease fails the condition
    const leaseUntil = Math.max(Date.now() + lease.leaseDuration, lease.leaseUntil + 1);
    const progress: MigrationProgress = {
      ...lease.progress,
      ...update,
      updatedAt: Date.now(),
      leaseUntil,
      owner: lease.owner
    };
    try {
      await useRegistry().patch(lease.id, progress, "leaseUntil", lease.leaseUntil);
    } catch {
      const latest: any = await useRegistry().get(lease.id);
      throw new MigrationAlreadyRunning(lease.id, latest.owner, Number(latest.leaseUntil ?? 0));
    }
    lease.leaseUntil = leaseUntil;
    lease.progress = progress;
  }

  /**
   * Renew the lease before writing a page
   * @param lease - the lease
   */
  protected async renewMigrationLease(lease: MigrationLease): Promise<void> {
    await this.saveMigrationProgress(lease, {});
  }

  /**
   * Release the lease, saving the last progress; a lease lost meanwhile is left to its new owner
   * @param lease - the lease
   * @param update - progress fields to set
   */
  protected async releaseMigrationLease(lease: MigrationLease, update: Partial<MigrationProgress> = {}): Promise<void> {
    const progress: MigrationProgress = {
      ...lease.progress,
      ...update,
      updatedAt: Date.now(),
      leaseUntil: 0,
      owner: lease.owner
    };
    try {
      await useRegistry().patch(lease.id, progress, "leaseUntil", lease.leaseUntil);
      lease.progress = progress;
      lease.leaseUntil = 0;
    } catch {
      this.log("WARN", `Migration ${lease.id}: lease lost before release, the other runner owns the progress`);
    }
  }

  /**
   * Run a migration on every raw row of every table of the store, the rows the type filter excludes included
   *
   * Resumable: the progress is saved in the Registry after each page and an interrupted run continues from it.
   * Exclusive: a lease (renewed every page) makes a second runner fail fast with {@link MigrationAlreadyRunning}.
   * Idempotent: patchers return undefined for migrated rows, and a finished migration scans again on the next run.
   * @param name - migration name
   * @param patcher - computes the patch of a row
   * @param options - batch size, dry run, lease duration
   * @returns the report
   */
  async migration(name: string, patcher: MigrationPatcher, options: MigrationOptions = {}): Promise<MigrationReport> {
    const tables = this.getRawTables();
    if (!tables) {
      throw new MigrationUnsupported(this.getName());
    }
    const batchSize =
      Math.max(1, Math.floor(Number(options.batchSize ?? DEFAULT_MIGRATION_BATCH))) || DEFAULT_MIGRATION_BATCH;
    const dryRun = !!options.dryRun;
    const report: MigrationReport = { store: this.getName(), name, tables: {}, resumed: false, dryRun };
    const lease = dryRun ? undefined : await this.acquireMigrationLease(name, options.leaseDuration);
    let resumeTable: string | undefined;
    let resumeToken: string | undefined;
    if (lease) {
      const previous = lease.progress;
      if (!previous.done && previous.table !== undefined && tables.some(table => table.name === previous.table)) {
        report.resumed = true;
        report.tables = structuredClone(previous.tables);
        resumeTable = previous.table;
        resumeToken = previous.continuationToken;
      } else {
        lease.progress = emptyProgress();
      }
    }
    try {
      let reached = resumeTable === undefined;
      for (const table of tables) {
        let token: string | undefined;
        if (!reached) {
          if (table.name !== resumeTable) continue;
          reached = true;
          // Progress is saved after each page: no token means this table was finished
          if (resumeToken === undefined) continue;
          token = resumeToken;
        }
        const tableReport = (report.tables[table.name] ??= emptyTableReport());
        const context: MigrationContext = {
          change: (from, to) => incrementCount(tableReport.byChange, `${from} → ${to}`),
          unknown: type => incrementCount(tableReport.unknown, type)
        };
        do {
          const page = await this.rawPages(table.name, batchSize, token);
          const patches: { key: string; patch: RawPatch }[] = [];
          for (const row of page.rows) {
            tableReport.scanned++;
            const patch = await patcher(row, context);
            if (patch !== undefined) {
              tableReport.updated++;
              patches.push({ key: row.key, patch });
            }
          }
          if (lease && patches.length) {
            // A runner that lost its lease stops here, before writing
            await this.renewMigrationLease(lease);
            for (const { key, patch } of patches) {
              await this.rawPatch(table.name, key, patch);
            }
          }
          token = page.continuationToken;
          if (lease) {
            await this.saveMigrationProgress(lease, {
              table: table.name,
              continuationToken: token,
              ...migrationTotals(report)
            });
          }
        } while (token);
      }
    } catch (err) {
      if (lease) await this.releaseMigrationLease(lease);
      throw err;
    }
    if (lease) await this.releaseMigrationLease(lease, { done: true, ...migrationTotals(report) });
    const totals = migrationTotals(report);
    this.log(
      "INFO",
      `Migration ${name}${dryRun ? " (dry run)" : ""}: ${totals.scanned} rows scanned, ${totals.updated} ${
        dryRun ? "to update" : "updated"
      }, ${totals.unknown} left untouched`
    );
    return report;
  }

  /**
   * Patcher of the built-in `types` migration: untyped rows get the table root identifier, legacy types their
   * current identifier; unknown, ambiguous and unreadable rows are counted and left as they are
   * @returns the patcher
   */
  protected typesPatcher(): MigrationPatcher {
    const roots = new Map((this.getRawTables() ?? []).map(table => [table.name, table.root]));
    return (row, context) => {
      if (row.unreadable) {
        context.unknown(UNREADABLE);
        return undefined;
      }
      const type = classifyStoredType(row.data.__type, roots.get(row.table));
      switch (type.kind) {
        case "legacy":
        case "untyped":
          if (!type.to) return undefined;
          context.change(type.from, type.to);
          return { __type: type.to };
        case "unknown":
        case "ambiguous":
          context.unknown(type.from);
          return undefined;
        default:
          return undefined;
      }
    };
  }

  /**
   * Rewrite the Webda 3 types of every row to the current identifiers (the built-in `types` migration)
   *
   * Stores with a native bulk update override this method and return the same report.
   * @param options - batch size, dry run, lease duration
   * @returns the report
   */
  async migrateTypes(options: MigrationOptions = {}): Promise<MigrationReport> {
    return this.migration("types", this.typesPatcher(), options);
  }

  /**
   * Count the rows by stored `__type`, scanning at most `maxRows` rows
   *
   * Stores able to `GROUP BY` override it with an exact count.
   * @param maxRows - scan limit
   * @returns the counts
   */
  async countStoredTypes(maxRows: number): Promise<StoredTypeCounts> {
    const tables = this.getRawTables() ?? [];
    const result: StoredTypeCounts = { tables: {}, truncated: false };
    for (const table of tables) result.tables[table.name] = {};
    result.truncated = await scanRawRows(
      (table, size, token) => this.rawPages(table, size, token),
      tables,
      maxRows,
      row => {
        const key = row.unreadable
          ? UNREADABLE
          : typeof row.data.__type === "string" && row.data.__type !== ""
            ? row.data.__type
            : UNTYPED;
        incrementCount(result.tables[row.table], key);
      }
    );
    return result;
  }

  /**
   * Startup type check: one WARN when rows hold legacy, untyped or unknown types
   * @returns the summary, undefined when disabled or the store has no raw access
   */
  async checkStoredTypes(): Promise<TypeCheckSummary | undefined> {
    const tables = this.getRawTables();
    const options = this.parameters.typeCheck;
    if (!tables || options?.enabled === false) {
      return undefined;
    }
    const maxRows = options?.maxRows ?? DEFAULT_TYPE_CHECK_ROWS;
    const counts = await this.countStoredTypes(maxRows);
    const summary = summarizeStoredTypes(
      this.getName(),
      counts,
      new Map(tables.map(table => [table.name, table.root])),
      maxRows
    );
    if (summary.message) {
      this.log("WARN", summary.message);
    }
    return summary;
  }

  /**
   * Body of the `migrate` command of the stores: run the `types` migration and print its report
   *
   * Stores declare `@Command("migrate", { phase: "initialized" }) migrate(dryRun = false, batch = 500,
   * allowUnknown = false)` calling this method: composable commands pass their arguments by position.
   * @param dryRun - count, write nothing
   * @param batch - rows per page
   * @param allowUnknown - exit with 0 even when rows keep an unknown or ambiguous type
   * @returns the exit code
   */
  async migrateCommand(
    dryRun: boolean = false,
    batch: number = DEFAULT_MIGRATION_BATCH,
    allowUnknown: boolean = false
  ): Promise<number> {
    if (!this.getRawTables()) {
      this.log("WARN", `Store ${this.getName()} cannot run migrations yet: skipped`);
      return 0;
    }
    const report = await this.migrateTypes({ dryRun: !!dryRun, batchSize: Number(batch) || DEFAULT_MIGRATION_BATCH });
    useOutput(formatMigrationReport(report));
    const unknown = migrationTotals(report).unknown;
    if (unknown > 0 && !allowUnknown) {
      this.log(
        "ERROR",
        `${unknown} rows of ${this.getName()} keep an unknown or ambiguous type: declare a @WebdaAlias on the ` +
          "model they belong to, or pass --allow-unknown"
      );
      return 1;
    }
    return 0;
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

  /**
   * Aggregation options applied to the repositories of this store
   * @returns the options; undefined values keep the repository defaults
   */
  getAggregationOptions(): Partial<AggregationOptions> {
    return {
      fallback: this.parameters.aggregationFallback,
      maxGroups: this.parameters.maxGroups,
      warn: message => useLog("WARN", message)
    };
  }
}

export { Store };
