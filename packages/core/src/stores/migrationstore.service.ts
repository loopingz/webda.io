import { randomUUID } from "node:crypto";
import {
  AbstractRepository,
  EventRepository,
  WEBDA_PRIMARY_KEY,
  type AggregatedRow,
  type AggregationSpec,
  type CountOptions,
  type CountResult,
  type Helpers,
  type JSONed,
  type MetricSpec,
  type ModelClass,
  type NumericPropertyPaths,
  type PK,
  type PrimaryKeyType,
  type PropertyPaths,
  type PropertyPathType,
  type Repository
} from "@webda/models";
import * as WebdaQL from "@webda/ql";
import type { AggregationResult, QueryParameters } from "@webda/ql";
import type { ArrayElement } from "@webda/utils";
import { useModel, useModelId } from "../application/hooks.js";
import { InstanceCache } from "../cache/cache.js";
import { useCore, useModelMetadata } from "../core/hooks.js";
import * as WebdaError from "../errors/errors.js";
import { useOutput } from "../loggers/hooks.js";
import { useRegistry } from "../models/registry.model.js";
import { whenLeader } from "../services/cluster.service.js";
import { Command } from "../services/command.js";
import { Inject } from "../services/service.js";
import { DEFAULT_MIGRATION_BATCH, DEFAULT_MIGRATION_LEASE, MigrationAlreadyRunning } from "./migration.js";
import { Store, StoreParameters, type StoreEvents } from "./store.js";

/**
 * State of a store-to-store migration managed by {@link MigrationStore}
 */
export type MigrationStoreState = "PENDING" | "MIGRATING" | "VERIFYING" | "COMPLETED" | "FAILED";

/**
 * Per-model migration progress tracked by {@link MigrationStore}
 */
export interface ModelMigrationProgress {
  /** Model identifier (e.g. `Webda/User`) */
  model: string;
  /** Number of items scanned from the source store for this model */
  scanned: number;
  /** Number of items copied to the target store for this model */
  migrated: number;
  /** Number of items skipped because they were already present in target or deleted concurrently */
  skipped: number;
  /** Continuation token to resume pagination for this model */
  continuationToken?: string;
  /** Whether backfill has finished scanning all pages of this model */
  completed: boolean;
}

/**
 * Overall migration status persisted in the Registry and returned by {@link MigrationStore.getStatus}
 */
export interface MigrationStoreStatus {
  /** MigrationStore service name */
  store: string;
  /** Source store service name */
  source: string;
  /** Target store service name */
  target: string;
  /** Current migration state */
  state: MigrationStoreState;
  /** Model currently being backfilled or verified */
  currentModel?: string;
  /** Continuation token of the current model */
  continuationToken?: string;
  /** Total items scanned across all models */
  scanned: number;
  /** Total items copied to target across all models */
  migrated: number;
  /** Total items skipped across all models */
  skipped: number;
  /** Total items verified in target during the verification pass */
  verified: number;
  /** Per-model progress map keyed by model identifier */
  models: Record<string, ModelMigrationProgress>;
  /** Identifier of the runner holding or last holding the migration lease */
  owner?: string;
  /** Epoch ms until which the current runner lease is valid */
  leaseUntil?: number;
  /** Epoch ms when the migration started */
  startedAt?: number;
  /** Epoch ms when the status was last updated */
  updatedAt?: number;
  /** Epoch ms when the migration completed */
  completedAt?: number;
  /** Last error message if state is `FAILED` */
  error?: string;
}

/**
 * Options for {@link MigrationStore.runMigration}
 */
export interface RunMigrationOptions {
  /** Number of items per page during backfill and verification */
  batchSize?: number;
  /** Lease duration in ms */
  leaseDuration?: number;
  /** Whether to run the verification pass after backfill */
  verify?: boolean;
  /** Force re-running migration from the beginning even if already completed */
  force?: boolean;
}

/**
 * Events emitted by {@link MigrationStore}
 */
export type MigrationStoreEvents = StoreEvents & {
  "MigrationStore.Started": { store: string; source: string; target: string; status: MigrationStoreStatus };
  "MigrationStore.Progress": { store: string; status: MigrationStoreStatus };
  "MigrationStore.Completed": { store: string; source: string; target: string; status: MigrationStoreStatus };
  "MigrationStore.Failed": { store: string; error: Error; status: MigrationStoreStatus };
};

/**
 * Configuration parameters for {@link MigrationStore}
 */
export class MigrationStoreParameters extends StoreParameters {
  /**
   * Name of the original (source) Store service to migrate from
   */
  source: string;
  /**
   * Name of the destination (target) Store service to migrate to
   */
  target: string;
  /**
   * Number of items to read and copy per batch during background backfill
   *
   * @default 500
   */
  batchSize?: number;
  /**
   * Duration in ms of the distributed Registry lease held by the active migration runner
   *
   * @default 60000
   */
  leaseDuration?: number;
  /**
   * Automatically start or resume the migration in the background on `init()` when elected cluster leader
   *
   * @default true
   */
  autoStart?: boolean;
  /**
   * Run a verification pass comparing source items against target before marking the migration `COMPLETED`
   *
   * @default true
   */
  verify?: boolean;
  /**
   * Interval in ms after which non-leader instances refresh the migration status from the Registry
   *
   * @default 5000
   */
  statusRefreshInterval?: number;
  /**
   * Whether `models` was explicitly configured on the MigrationStore parameters
   * @internal
   */
  explicitModels?: boolean;

  /**
   * Load parameters and apply defaults
   * @param params - raw configuration object
   * @returns this for chaining
   */
  load(params: Record<string, unknown> = {}): this {
    this.explicitModels =
      Array.isArray(params.models) || typeof params.model === "string" || Array.isArray(params.additionalModels);
    super.load(params);
    this.batchSize = Math.max(1, Math.floor(Number(params.batchSize ?? DEFAULT_MIGRATION_BATCH)));
    this.leaseDuration = Math.max(100, Math.floor(Number(params.leaseDuration ?? DEFAULT_MIGRATION_LEASE)));
    this.autoStart ??= true;
    this.verify ??= true;
    this.statusRefreshInterval ??= 5000;
    return this;
  }
}

/**
 * Unwrap an `EventRepository` to access its inner `AbstractRepository` directly without re-emitting model events
 * @param repo - repository to unwrap
 * @returns the inner AbstractRepository
 */
function unwrapRepository<T extends ModelClass>(repo: Repository<T>): AbstractRepository<T> {
  if (repo instanceof EventRepository) {
    return Reflect.get(repo, "repository") as AbstractRepository<T>;
  }
  return repo as unknown as AbstractRepository<T>;
}

/**
 * Dual-write, phase-switching repository backing {@link MigrationStore}.
 *
 * - While migration is in progress (`!store.isCompleted()`):
 *   - Reads and queries (`get`, `exists`, `query`, `iterate`, `count`, `aggregate`) execute against `source`.
 *   - Writes execute against `source` first (enforcing write conditions) and copy-on-write the full updated item
 *     (or delete) to `target`.
 * - Once migration is completed (`store.isCompleted()`):
 *   - Reads and queries execute against `target`.
 *   - Writes execute against `target` first (enforcing write conditions) and mirror to `source`.
 */
export class MigrationRepository<T extends ModelClass> extends AbstractRepository<T> {
  protected readonly modelId: string;

  /**
   * Create a MigrationRepository for a model
   * @param model - model class
   * @param pks - primary key field names
   * @param store - owning MigrationStore
   * @param separator - composite key separator
   */
  constructor(
    model: T,
    pks: (keyof InstanceType<T> & string)[],
    protected readonly store: MigrationStore,
    separator: string = "#"
  ) {
    super(model, pks, separator);
    this.modelId = useModelId(model) ?? model.name;
  }

  /**
   * Unwrapped repository from the source store
   * @returns source repository
   */
  protected get sourceRepo(): AbstractRepository<T> {
    return this.store.getSourceRepository(this.model);
  }

  /**
   * Unwrapped repository from the target store
   * @returns target repository
   */
  protected get targetRepo(): AbstractRepository<T> {
    return this.store.getTargetRepository(this.model);
  }

  /**
   * Active read/query repository based on migration completion state
   * @returns source repository until completed, target repository once completed
   */
  protected async activeReadRepo(): Promise<AbstractRepository<T>> {
    await this.store.ensureFreshStatus();
    return this.store.isCompleted() ? this.targetRepo : this.sourceRepo;
  }

  /**
   * Synchronize a full item snapshot into a mirror repository, replacing any existing entry so removed attributes
   * do not linger behind a shallow patch
   * @param repo - destination repository
   * @param pk - primary key of the item
   * @param full - full item snapshot
   */
  protected async syncFullItem(
    repo: AbstractRepository<T>,
    pk: PrimaryKeyType<InstanceType<T>>,
    full: Helpers<InstanceType<T>>
  ): Promise<void> {
    if (await repo.exists(pk)) {
      await repo.update(full);
    } else {
      await repo.create(full);
    }
  }

  /** @override */
  async get(primaryKey: PrimaryKeyType<InstanceType<T>>): Promise<Helpers<InstanceType<T>>> {
    const repo = await this.activeReadRepo();
    return repo.get(primaryKey);
  }

  /** @override */
  async exists(uuid: PrimaryKeyType<InstanceType<T>>): Promise<boolean> {
    const repo = await this.activeReadRepo();
    return repo.exists(uuid);
  }

  /** @override */
  async query(
    query: string,
    params?: QueryParameters
  ): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const repo = await this.activeReadRepo();
    return repo.query(query, params);
  }

  /** @override */
  async *iterate(query: string = "", params?: QueryParameters): AsyncGenerator<InstanceType<T>, void, unknown> {
    const repo = await this.activeReadRepo();
    for await (const item of repo.iterate(query, params)) {
      yield item;
    }
  }

  /** @override */
  async count(filter?: string, params?: QueryParameters, options?: CountOptions): Promise<CountResult> {
    const repo = await this.activeReadRepo();
    return repo.count(filter, params, options);
  }

  /** @override */
  async aggregate<
    const G extends readonly PropertyPaths<InstanceType<T>>[] = [],
    const M extends Record<string, MetricSpec<InstanceType<T>>> = Record<string, MetricSpec<InstanceType<T>>>
  >(
    spec: AggregationSpec<InstanceType<T>, G, M>,
    params?: QueryParameters
  ): Promise<AggregationResult<AggregatedRow<InstanceType<T>, G, M>>> {
    const repo = await this.activeReadRepo();
    return repo.aggregate(spec, params);
  }

  /** @override */
  async create(data: Helpers<InstanceType<T>>, save?: boolean): Promise<InstanceType<T>> {
    await this.store.ensureFreshStatus();
    if (this.store.isCompleted()) {
      const created = await this.targetRepo.create(data, save);
      await this.sourceRepo.upsert(created);
      return created;
    }
    const created = await this.sourceRepo.create(data, save);
    const keyStr = this.getPrimaryKey(created).toString();
    this.store.markKeyTouched(this.modelId, keyStr);
    await this.targetRepo.upsert(created);
    return created;
  }

  /** @override */
  async upsert(data: Helpers<InstanceType<T>>): Promise<InstanceType<T>> {
    await this.store.ensureFreshStatus();
    if (this.store.isCompleted()) {
      const upserted = await this.targetRepo.upsert(data);
      await this.sourceRepo.upsert(upserted);
      return upserted;
    }
    const upserted = await this.sourceRepo.upsert(data);
    const keyStr = this.getPrimaryKey(upserted).toString();
    this.store.markKeyTouched(this.modelId, keyStr);
    await this.targetRepo.upsert(upserted);
    return upserted;
  }

  /** @override */
  async update<K extends PropertyPaths<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K>
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(data);
    if (this.store.isCompleted()) {
      await this.targetRepo.update(data, conditionField, condition);
      const full = (await this.targetRepo.get(pk)) ?? data;
      await this.syncFullItem(this.sourceRepo, pk, full);
      return;
    }
    await this.sourceRepo.update(data, conditionField, condition);
    this.store.markKeyTouched(this.modelId, pk.toString());
    const full = (await this.sourceRepo.get(pk)) ?? data;
    await this.syncFullItem(this.targetRepo, pk, full);
  }

  /** @override */
  async patch<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<InstanceType<T>>,
    conditionField?: K | null,
    condition?: unknown
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(primaryKey);
    if (this.store.isCompleted()) {
      await this.targetRepo.patch(primaryKey, data, conditionField, condition);
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.syncFullItem(this.sourceRepo, pk, full);
        }
      } catch {
        // Item deleted concurrently
      }
      return;
    }
    await this.sourceRepo.patch(primaryKey, data, conditionField, condition);
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.syncFullItem(this.targetRepo, pk, full);
      }
    } catch {
      // Item deleted concurrently
    }
  }

  /** @override */
  async delete<K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K> | JSONed<PropertyPathType<InstanceType<T>, K>>
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const keyStr = this.getPrimaryKey(uuid).toString();
    if (this.store.isCompleted()) {
      await this.targetRepo.delete(uuid, conditionField, condition);
      await this.sourceRepo.delete(uuid);
      return;
    }
    await this.sourceRepo.delete(uuid, conditionField, condition);
    this.store.markKeyDeleted(this.modelId, keyStr);
    await this.targetRepo.delete(uuid);
  }

  /** @override */
  async incrementAttributes<K extends PropertyPaths<InstanceType<T>>, L extends NumericPropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    info: (L | { property: L; value?: number })[] | Record<L, number>,
    conditionField?: K | null,
    condition?: unknown
  ): Promise<void | Record<string, number>> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(primaryKey);
    if (this.store.isCompleted()) {
      const res = await this.targetRepo.incrementAttributes(primaryKey, info, conditionField, condition);
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.sourceRepo.upsert(full);
        }
      } catch {
        // Item deleted concurrently
      }
      return res;
    }
    const res = await this.sourceRepo.incrementAttributes(primaryKey, info, conditionField, condition);
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.targetRepo.upsert(full);
      }
    } catch {
      // Item deleted concurrently
    }
    return res;
  }

  /** @override */
  async setAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    attribute: K,
    value: PropertyPathType<InstanceType<T>, K>,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(primaryKey);
    if (this.store.isCompleted()) {
      await this.targetRepo.setAttribute(primaryKey, attribute, value, conditionField, condition);
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.sourceRepo.upsert(full);
        }
      } catch {
        // Item deleted concurrently
      }
      return;
    }
    await this.sourceRepo.setAttribute(primaryKey, attribute, value, conditionField, condition);
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.targetRepo.upsert(full);
      }
    } catch {
      // Item deleted concurrently
    }
  }

  /** @override */
  async removeAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(uuid);
    if (this.store.isCompleted()) {
      await this.targetRepo.removeAttribute(uuid, attribute, conditionField, condition);
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.syncFullItem(this.sourceRepo, pk, full);
        }
      } catch {
        // Item deleted concurrently
      }
      return;
    }
    await this.sourceRepo.removeAttribute(uuid, attribute, conditionField, condition);
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.syncFullItem(this.targetRepo, pk, full);
      }
    } catch {
      // Item deleted concurrently
    }
  }

  /** @override */
  async upsertItemToCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    item: ArrayElement<InstanceType<T>[K]> | JSONed<ArrayElement<InstanceType<T>[K]>>,
    index?: number,
    itemWriteConditionField?: ArrayElement<InstanceType<T>[K]> extends object ? L : never,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]> extends object
      ? (object & ArrayElement<InstanceType<T>[K]>)[L]
      : ArrayElement<InstanceType<T>[K]>
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(uuid);
    if (this.store.isCompleted()) {
      await this.targetRepo.upsertItemToCollection(
        uuid,
        collection,
        item,
        index,
        itemWriteConditionField,
        itemWriteCondition
      );
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.sourceRepo.upsert(full);
        }
      } catch {
        // Item deleted concurrently
      }
      return;
    }
    await this.sourceRepo.upsertItemToCollection(
      uuid,
      collection,
      item,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.targetRepo.upsert(full);
      }
    } catch {
      // Item deleted concurrently
    }
  }

  /** @override */
  async deleteItemFromCollection<
    K extends Extract<PropertyPaths<InstanceType<T>, any[]>, keyof InstanceType<T>>,
    L extends keyof ArrayElement<InstanceType<T>[K]>
  >(
    uuid: PrimaryKeyType<InstanceType<T>>,
    collection: K,
    index: number,
    itemWriteConditionField?: L,
    itemWriteCondition?: ArrayElement<InstanceType<T>[K]>[L]
  ): Promise<void> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(uuid);
    if (this.store.isCompleted()) {
      await this.targetRepo.deleteItemFromCollection(
        uuid,
        collection,
        index,
        itemWriteConditionField,
        itemWriteCondition
      );
      try {
        const full = await this.targetRepo.get(pk);
        if (full) {
          await this.sourceRepo.upsert(full);
        }
      } catch {
        // Item deleted concurrently
      }
      return;
    }
    await this.sourceRepo.deleteItemFromCollection(
      uuid,
      collection,
      index,
      itemWriteConditionField,
      itemWriteCondition
    );
    this.store.markKeyTouched(this.modelId, pk.toString());
    try {
      const full = await this.sourceRepo.get(pk);
      if (full) {
        await this.targetRepo.upsert(full);
      }
    } catch {
      // Item deleted concurrently
    }
  }
}

interface ActiveTransferLease {
  id: string;
  owner: string;
  leaseUntil: number;
  leaseDuration: number;
}

/**
 * Generic Store that migrates models from a `source` Store to a `target` Store while serving live traffic.
 *
 * Lifecycle:
 * 1. Configure `MigrationStore` with `source: "OldStore"` and `target: "NewStore"`.
 *    `MigrationStore` automatically claims the models of `source` and `target` (or the explicitly configured `models`).
 * 2. While migration is `PENDING`, `MIGRATING`, or `VERIFYING`:
 *    - All reads and queries (`get`, `exists`, `query`, `iterate`, `count`, `aggregate`) are served from `source`.
 *    - All writes are dual-written to `source` and `target` (using copy-on-write when updating/patching an item that
 *      has not yet been backfilled to `target`).
 *    - The cluster leader (via `whenLeader` + a conditional Registry lease) runs the resumable background backfill
 *      and verification pass.
 * 3. Once `state === "COMPLETED"`:
 *    - All reads and queries are served from `target` (and writes continue to mirror to `source`).
 *    - You can safely replace `MigrationStore` with `target` in your configuration.
 *
 * @category CoreServices
 * @WebdaModda
 */
export class MigrationStore<
  K extends MigrationStoreParameters = MigrationStoreParameters,
  E extends MigrationStoreEvents = MigrationStoreEvents
> extends Store<K, E> {
  /** Injected source store */
  @Inject("params:source", undefined, true)
  sourceStore: Store;

  /** Injected target store */
  @Inject("params:target", undefined, true)
  targetStore: Store;

  /** Cached migration status */
  protected cachedStatus: MigrationStoreStatus;

  /** Timestamp when status was last refreshed from the Registry */
  protected lastStatusRefresh: number = 0;

  /** Whether a migration run is currently executing on this node */
  protected isRunningLocally: boolean = false;

  /** Signal to abort the current background migration loop when leadership is lost or service stops */
  protected abortRequested: boolean = false;

  /** Promise of the active background migration run on the leader */
  protected backgroundPromise?: Promise<MigrationStoreStatus | undefined>;

  /** Timer for retrying lease acquisition if a previous leader's lease has not expired yet */
  protected retryTimer?: ReturnType<typeof setTimeout>;

  /** Unregister callback returned by `whenLeader` */
  protected unregisterLeader?: () => void;

  /** Keys touched by live writes during active migration, keyed by model identifier */
  protected touchedKeys: Map<string, Set<string>> = new Map();

  /** Keys deleted by live writes during active migration, keyed by model identifier */
  protected deletedKeys: Map<string, Set<string>> = new Map();

  /**
   * Parameters class for MigrationStore
   */
  static Parameters = MigrationStoreParameters;

  /**
   * Validate `source` and `target` stores, inherit their models when not explicitly provided,
   * and claim model routing from both underlying stores.
   */
  computeParameters(): void {
    if (!(this.parameters instanceof MigrationStoreParameters)) {
      Reflect.set(this, "parameters", new MigrationStoreParameters().load(this.parameters));
    }
    if (!this.sourceStore || !(this.sourceStore instanceof Store)) {
      throw new WebdaError.FatalInitError(
        `MigrationStore ${this.getName()}: source '${this.parameters.source}' is not a valid Store`
      );
    }
    if (!this.targetStore || !(this.targetStore instanceof Store)) {
      throw new WebdaError.FatalInitError(
        `MigrationStore ${this.getName()}: target '${this.parameters.target}' is not a valid Store`
      );
    }
    if (
      this.sourceStore === this.targetStore ||
      this.sourceStore === (this as unknown as Store) ||
      this.targetStore === (this as unknown as Store)
    ) {
      throw new WebdaError.FatalInitError(
        `MigrationStore ${this.getName()}: source and target must be distinct stores`
      );
    }

    if (!this.parameters.explicitModels) {
      const sourceModels = this.sourceStore.getParameters().models ?? [];
      const targetModels = this.targetStore.getParameters().models ?? [];
      const combined = [...new Set([...sourceModels, ...targetModels])];
      const nonDefault = combined.filter(m => m !== "Webda/RegistryEntry");
      this.parameters.models = nonDefault.length > 0 ? nonDefault : combined;
    }

    super.computeParameters();

    this.sourceStore._migratedBy = this;
    this.targetStore._migratedBy = this;
    this.cachedStatus = this.createInitialStatus();
  }

  /**
   * Initialize the MigrationStore, load existing migration status from the Registry,
   * and register the leader background migration runner if `autoStart` is enabled.
   * @returns this for chaining
   */
  async init(): Promise<this> {
    await super.init();
    await this.refreshStatus();
    if (this.parameters.autoStart !== false && !this.isCompleted()) {
      this.unregisterLeader = whenLeader(
        () => {
          this.startLeaderMigration();
        },
        () => {
          this.stopLeaderMigration();
        }
      );
    }
    return this;
  }

  /**
   * Stop any background migration task and unregister from cluster leadership notifications
   */
  async stop(): Promise<void> {
    this.unregisterLeader?.();
    this.unregisterLeader = undefined;
    await this.stopLeaderMigration();
    await super.stop();
  }

  /**
   * Clean both source and target stores as well as migration state (for test mode only)
   */
  async ___cleanData(): Promise<void> {
    await this.stopLeaderMigration();
    await Promise.all([this.sourceStore.___cleanData(), this.targetStore.___cleanData()]);
    this.touchedKeys.clear();
    this.deletedKeys.clear();
    if (this.hasRegistry()) {
      const id = this.transferRegistryId();
      if (await useRegistry().exists(id)) {
        await useRegistry().delete(id);
      }
    }
    this.cachedStatus = this.createInitialStatus();
    this.lastStatusRefresh = Date.now();
  }

  /**
   * Whether the migration has finished backfilling and verifying all models
   * @returns true when state is `COMPLETED`
   */
  isCompleted(): boolean {
    return this.cachedStatus?.state === "COMPLETED";
  }

  /**
   * Record that a key was written via live dual-write so concurrent backfill pages never overwrite it with stale data
   * @param modelId - model identifier
   * @param key - serialized primary key
   */
  markKeyTouched(modelId: string, key: string): void {
    this.deletedKeys.get(modelId)?.delete(key);
    if (!this.isRunningLocally) {
      return;
    }
    let set = this.touchedKeys.get(modelId);
    if (!set) {
      set = new Set();
      this.touchedKeys.set(modelId, set);
    }
    set.add(key);
  }

  /**
   * Record that a key was deleted via live dual-write so concurrent backfill pages cannot resurrect it
   * @param modelId - model identifier
   * @param key - serialized primary key
   */
  markKeyDeleted(modelId: string, key: string): void {
    this.touchedKeys.get(modelId)?.delete(key);
    let set = this.deletedKeys.get(modelId);
    if (!set) {
      set = new Set();
      this.deletedKeys.set(modelId, set);
    }
    set.add(key);
  }

  /**
   * Check whether a key was deleted concurrently during migration
   * @param modelId - model identifier
   * @param key - serialized primary key
   * @returns true if deleted
   */
  isKeyDeleted(modelId: string, key: string): boolean {
    return this.deletedKeys.get(modelId)?.has(key) ?? false;
  }

  /**
   * Check whether a key was written by live traffic during the active migration run
   * @param modelId - model identifier
   * @param key - serialized primary key
   * @returns true if touched
   */
  isKeyTouched(modelId: string, key: string): boolean {
    return this.touchedKeys.get(modelId)?.has(key) ?? false;
  }

  /**
   * Get the unwrapped repository for a model on the `source` store
   * @param model - model class
   * @returns unwrapped source repository
   */
  getSourceRepository<T extends ModelClass>(model: T): AbstractRepository<T> {
    return unwrapRepository(this.sourceStore.getRepository(model));
  }

  /**
   * Get the unwrapped repository for a model on the `target` store
   * @param model - model class
   * @returns unwrapped target repository
   */
  getTargetRepository<T extends ModelClass>(model: T): AbstractRepository<T> {
    return unwrapRepository(this.targetStore.getRepository(model));
  }

  /**
   * Get the EventRepository-wrapped MigrationRepository for a model
   * @param model - model class
   * @returns repository routing operations through this MigrationStore
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const pks = (meta?.PrimaryKey ?? ["uuid"]) as (keyof InstanceType<T> & string)[];
    const separator = meta?.PrimaryKeySeparator ?? "#";
    return new EventRepository<T>(model, pks, new MigrationRepository<T>(model, pks, this, separator), separator);
  }

  /**
   * Refresh the cached status from the Registry if `statusRefreshInterval` has elapsed
   */
  async ensureFreshStatus(): Promise<void> {
    if (this.isCompleted() || this.isRunningLocally) {
      return;
    }
    const interval = this.parameters.statusRefreshInterval ?? 5000;
    if (Date.now() - this.lastStatusRefresh >= interval) {
      await this.refreshStatus();
    }
  }

  /**
   * Force refreshing the migration status from the Registry
   * @returns the latest MigrationStoreStatus
   */
  async refreshStatus(): Promise<MigrationStoreStatus> {
    this.lastStatusRefresh = Date.now();
    if (!this.hasRegistry()) {
      return structuredClone(this.cachedStatus);
    }
    const id = this.transferRegistryId();
    try {
      if (await useRegistry().exists(id)) {
        const entry = await useRegistry().get<Partial<MigrationStoreStatus>>(id);
        this.cachedStatus = this.toStatus(entry);
      }
    } catch (err) {
      this.log("WARN", `Failed to read migration status from Registry (${id}): ${(err as Error)?.message ?? err}`);
    }
    return structuredClone(this.cachedStatus);
  }

  /**
   * Return the current migration status (refreshed from Registry)
   * @returns the current MigrationStoreStatus
   */
  async getStatus(): Promise<MigrationStoreStatus> {
    if (this.isRunningLocally) {
      return structuredClone(this.cachedStatus);
    }
    return this.refreshStatus();
  }

  /**
   * Wait for any currently running background migration on this instance to finish
   * @returns the resulting MigrationStoreStatus
   */
  async waitForCompletion(): Promise<MigrationStoreStatus> {
    if (this.backgroundPromise) {
      await this.backgroundPromise;
    }
    return this.getStatus();
  }

  /**
   * Start the background migration loop when this node becomes the cluster leader
   */
  protected startLeaderMigration(): void {
    if (this.isCompleted() || this.isRunningLocally || this.backgroundPromise) {
      return;
    }
    this.abortRequested = false;
    this.backgroundPromise = this.executeLeaderMigration().finally(() => {
      this.backgroundPromise = undefined;
    });
  }

  /**
   * Execute migration on the leader, scheduling a retry if a previous leader's lease has not expired yet
   * @returns the migration status or undefined if aborted/deferred
   */
  protected async executeLeaderMigration(): Promise<MigrationStoreStatus | undefined> {
    try {
      return await this.runMigration();
    } catch (err) {
      if (err instanceof MigrationAlreadyRunning) {
        await this.refreshStatus();
        const delay = Math.max(50, (this.cachedStatus.leaseUntil ?? Date.now() + 250) - Date.now() + 25);
        this.log("DEBUG", `Migration lease for ${this.getName()} held by another runner, retrying in ${delay}ms`);
        if (!this.abortRequested) {
          this.clearRetryTimer();
          this.retryTimer = setTimeout(() => {
            this.retryTimer = undefined;
            if (!this.abortRequested && !this.isCompleted()) {
              this.startLeaderMigration();
            }
          }, delay);
          this.retryTimer.unref?.();
        }
        return undefined;
      }
      this.log("ERROR", `Background store migration failed on ${this.getName()}: ${(err as Error)?.message ?? err}`);
      return this.cachedStatus;
    }
  }

  /**
   * Stop any background migration loop running on this node (e.g. on leadership loss or service shutdown)
   */
  protected async stopLeaderMigration(): Promise<void> {
    this.abortRequested = true;
    this.clearRetryTimer();
    if (this.backgroundPromise) {
      try {
        await this.backgroundPromise;
      } catch {
        // Errors are already logged and reflected in status
      }
    }
  }

  /**
   * Clear any pending lease retry timer
   */
  protected clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
  }

  /**
   * Resolve the runtime model class of a deserialized item if it is a subclass with Webda Metadata
   * @param item - deserialized model instance
   * @param fallback - repository root model class
   * @returns resolved ModelClass
   */
  protected resolveRuntimeModel(item: unknown, fallback: ModelClass): ModelClass {
    if (item && typeof item === "object") {
      const ctor = (item as { constructor?: ModelClass }).constructor;
      if (typeof ctor === "function" && useModelMetadata(ctor)) {
        return ctor;
      }
    }
    return fallback;
  }

  /**
   * Run or resume the store-to-store migration from `source` to `target`.
   *
   * Acquires an exclusive, renewable lease in the Registry (`storeMigration.<name>.transfer`),
   * backfills all managed models page by page from `source` to `target` (resuming from the last saved
   * `continuationToken` if interrupted), optionally runs a verification pass, and marks the migration
   * `COMPLETED`.
   *
   * @param options - batch size, lease duration, verify flag, and force flag
   * @returns the resulting MigrationStoreStatus
   */
  async runMigration(options: RunMigrationOptions = {}): Promise<MigrationStoreStatus> {
    const batchSize = Math.max(
      1,
      Math.floor(Number(options.batchSize ?? this.parameters.batchSize ?? DEFAULT_MIGRATION_BATCH))
    );
    const leaseDuration = Math.max(
      100,
      Math.floor(Number(options.leaseDuration ?? this.parameters.leaseDuration ?? DEFAULT_MIGRATION_LEASE))
    );
    const verify = options.verify ?? this.parameters.verify ?? true;
    const force = !!options.force;

    const lease = await this.acquireTransferLease(leaseDuration);
    this.isRunningLocally = true;
    this.abortRequested = false;

    try {
      if (this.cachedStatus.state === "COMPLETED" && !force) {
        await this.releaseTransferLease(lease, {});
        return structuredClone(this.cachedStatus);
      }

      const models = this.getMigratedModels();
      const now = Date.now();
      const isResuming =
        !force &&
        (this.cachedStatus.state === "MIGRATING" ||
          this.cachedStatus.state === "VERIFYING" ||
          this.cachedStatus.state === "FAILED") &&
        Object.keys(this.cachedStatus.models ?? {}).length > 0;

      const modelProgressMap: Record<string, ModelMigrationProgress> = isResuming
        ? structuredClone(this.cachedStatus.models)
        : {};

      for (const model of models) {
        const modelId = useModelId(model) ?? model.name;
        modelProgressMap[modelId] ??= {
          model: modelId,
          scanned: 0,
          migrated: 0,
          skipped: 0,
          continuationToken: undefined,
          completed: false
        };
      }

      if (!isResuming) {
        this.touchedKeys.clear();
      }

      await this.saveTransferStatus(lease, {
        state: "MIGRATING",
        models: modelProgressMap,
        startedAt: isResuming ? (this.cachedStatus.startedAt ?? now) : now,
        completedAt: undefined,
        error: undefined,
        ...(isResuming ? {} : { scanned: 0, migrated: 0, skipped: 0, verified: 0 })
      });

      await this.emit("MigrationStore.Started", {
        store: this.getName(),
        source: this.sourceStore.getName(),
        target: this.targetStore.getName(),
        status: structuredClone(this.cachedStatus)
      });

      // Phase 1: Backfill each model page-by-page
      for (const model of models) {
        if (this.abortRequested) {
          await this.releaseTransferLease(lease, {});
          return structuredClone(this.cachedStatus);
        }

        const modelId = useModelId(model) ?? model.name;
        const progress = modelProgressMap[modelId];
        if (progress.completed && !force) {
          continue;
        }

        const sourceRepo = this.getSourceRepository(model);
        const defaultTargetRepo = this.getTargetRepository(model);
        let token = progress.continuationToken;

        do {
          if (this.abortRequested) {
            await this.releaseTransferLease(lease, {
              currentModel: modelId,
              continuationToken: token,
              models: modelProgressMap,
              ...this.computeTotals(modelProgressMap)
            });
            return structuredClone(this.cachedStatus);
          }

          const queryStr = token ? `LIMIT ${batchSize} OFFSET ${WebdaQL.escapeValue(token)}` : `LIMIT ${batchSize}`;
          const page = await sourceRepo.query(queryStr);

          // Renew lease before writing batch to target
          await this.renewTransferLease(lease);

          for (const item of page.results) {
            progress.scanned++;
            const pk = sourceRepo.getPrimaryKey(item);
            const pkStr = pk.toString();

            // Never resurrect an item that was deleted concurrently during backfill
            if (this.isKeyDeleted(modelId, pkStr)) {
              progress.skipped++;
              continue;
            }

            // Resolve the target repository for the item's runtime class (handles polymorphic subclasses)
            const runtimeModel = this.resolveRuntimeModel(item, model);
            const targetRepo = runtimeModel === model ? defaultTargetRepo : this.getTargetRepository(runtimeModel);

            // If a live dual-write already touched this key or it already exists in target (and not forced),
            // do not overwrite it with a potentially older page snapshot
            if (this.isKeyTouched(modelId, pkStr) || (!force && (await targetRepo.exists(pk)))) {
              progress.skipped++;
              continue;
            }

            // Double-check the item was not deleted from source while the batch was in flight
            if (this.isKeyDeleted(modelId, pkStr) || !(await sourceRepo.exists(pk))) {
              progress.skipped++;
              continue;
            }

            await targetRepo.upsert(item);
            progress.migrated++;
          }

          token = page.continuationToken;
          progress.continuationToken = token;
          if (!token) {
            progress.completed = true;
          }

          await this.saveTransferStatus(lease, {
            state: "MIGRATING",
            currentModel: modelId,
            continuationToken: token,
            models: modelProgressMap,
            ...this.computeTotals(modelProgressMap)
          });

          await this.emit("MigrationStore.Progress", {
            store: this.getName(),
            status: structuredClone(this.cachedStatus)
          });
        } while (token);
      }

      // Phase 2: Verification pass
      let verifiedCount = 0;
      if (verify) {
        await this.saveTransferStatus(lease, {
          state: "VERIFYING",
          currentModel: undefined,
          continuationToken: undefined
        });

        for (const model of models) {
          if (this.abortRequested) {
            await this.releaseTransferLease(lease, { verified: verifiedCount });
            return structuredClone(this.cachedStatus);
          }

          const modelId = useModelId(model) ?? model.name;
          const sourceRepo = this.getSourceRepository(model);
          const defaultTargetRepo = this.getTargetRepository(model);
          let token: string | undefined;

          do {
            if (this.abortRequested) {
              await this.releaseTransferLease(lease, { verified: verifiedCount });
              return structuredClone(this.cachedStatus);
            }

            const queryStr = token ? `LIMIT ${batchSize} OFFSET ${WebdaQL.escapeValue(token)}` : `LIMIT ${batchSize}`;
            const page = await sourceRepo.query(queryStr);
            await this.renewTransferLease(lease);

            for (const item of page.results) {
              const pk = sourceRepo.getPrimaryKey(item);
              const pkStr = pk.toString();
              if (this.isKeyDeleted(modelId, pkStr)) {
                continue;
              }
              const runtimeModel = this.resolveRuntimeModel(item, model);
              const targetRepo = runtimeModel === model ? defaultTargetRepo : this.getTargetRepository(runtimeModel);

              if (!(await targetRepo.exists(pk))) {
                // If still present in source, backfill the straggler and verify again
                if (await sourceRepo.exists(pk)) {
                  await targetRepo.upsert(item);
                  modelProgressMap[modelId].migrated++;
                } else {
                  continue;
                }
                if (!(await targetRepo.exists(pk))) {
                  throw new Error(
                    `Verification failed for ${modelId}: item '${pkStr}' missing in target store '${this.targetStore.getName()}'`
                  );
                }
              }
              verifiedCount++;
            }

            token = page.continuationToken;
          } while (token);
        }
      }

      // Phase 3: Mark COMPLETED and switch reads/queries to target
      const completedAt = Date.now();
      await this.releaseTransferLease(lease, {
        state: "COMPLETED",
        currentModel: undefined,
        continuationToken: undefined,
        models: modelProgressMap,
        ...this.computeTotals(modelProgressMap),
        verified: verifiedCount,
        completedAt,
        error: undefined
      });

      this.touchedKeys.clear();
      this.deletedKeys.clear();

      await this.emit("MigrationStore.Completed", {
        store: this.getName(),
        source: this.sourceStore.getName(),
        target: this.targetStore.getName(),
        status: structuredClone(this.cachedStatus)
      });

      this.log(
        "INFO",
        `Store migration ${this.getName()} (${this.sourceStore.getName()} -> ${this.targetStore.getName()}) completed: ` +
          `${this.cachedStatus.scanned} scanned, ${this.cachedStatus.migrated} migrated, ` +
          `${this.cachedStatus.skipped} skipped, ${this.cachedStatus.verified} verified`
      );

      return structuredClone(this.cachedStatus);
    } catch (err) {
      if (err instanceof MigrationAlreadyRunning) {
        throw err;
      }
      const errorMessage = (err as Error)?.message ?? String(err);
      await this.releaseTransferLease(lease, {
        state: "FAILED",
        error: errorMessage
      }).catch(releaseErr =>
        this.log("ERROR", `Migration ${this.getName()}: failed to release lease after error`, releaseErr)
      );

      await this.emit("MigrationStore.Failed", {
        store: this.getName(),
        error: err as Error,
        status: structuredClone(this.cachedStatus)
      });
      throw err;
    } finally {
      this.isRunningLocally = false;
    }
  }

  /**
   * CLI command to inspect migration status or execute/resume the store-to-store migration
   * @param action - `"status"` to print current status, `"run"` to execute/resume migration, `"force"` to restart migration
   * @param batch - batch size override
   * @returns exit code (0 on success, 1 on failure)
   */
  @Command("migrate-store", {
    description: "Inspect status or run store-to-store data migration",
    phase: "initialized"
  })
  async migrateStoreCommand(
    action: "status" | "run" | "force" = "run",
    batch: number = DEFAULT_MIGRATION_BATCH
  ): Promise<number> {
    if (action === "status") {
      const status = await this.getStatus();
      useOutput(this.formatStatus(status));
      return status.state === "FAILED" ? 1 : 0;
    }
    try {
      const status = await this.runMigration({
        batchSize: Number(batch) || this.parameters.batchSize || DEFAULT_MIGRATION_BATCH,
        force: action === "force"
      });
      useOutput(this.formatStatus(status));
      return status.state === "COMPLETED" ? 0 : 1;
    } catch (err) {
      this.log("ERROR", `Store migration ${this.getName()} failed: ${(err as Error)?.message ?? err}`);
      return 1;
    }
  }

  /**
   * Format a {@link MigrationStoreStatus} for human-readable CLI output
   * @param status - migration status
   * @returns formatted report string
   */
  formatStatus(status: MigrationStoreStatus = this.cachedStatus): string {
    const lines = [
      `MigrationStore ${status.store} (${status.source} -> ${status.target}): ${status.state}`,
      `  Totals: ${status.scanned} scanned, ${status.migrated} migrated, ${status.skipped} skipped, ${status.verified} verified`
    ];
    for (const modelProgress of Object.values(status.models ?? {})) {
      lines.push(
        `  - ${modelProgress.model}: ${modelProgress.scanned} scanned, ${modelProgress.migrated} migrated, ` +
          `${modelProgress.skipped} skipped (${modelProgress.completed ? "done" : `token=${modelProgress.continuationToken ?? "start"}`})`
      );
    }
    if (status.error) {
      lines.push(`  Error: ${status.error}`);
    }
    return lines.join("\n");
  }

  /**
   * Models to migrate: the models configured/inherited on this store, falling back to any models in `_modelsHierarchy`
   * @returns array of ModelClass to migrate
   */
  protected getMigratedModels(): ModelClass[] {
    if (this._models.length > 0) {
      return this._models;
    }
    const result: ModelClass[] = [];
    for (const id of Object.keys(this._modelsHierarchy)) {
      try {
        const model = useModel(id);
        if (model && !result.includes(model)) {
          result.push(model);
        }
      } catch {
        // Ignore unknown model
      }
    }
    return result;
  }

  /**
   * Compute aggregate scanned, migrated, and skipped totals across all models
   * @param models - per-model progress map
   * @returns totals object
   */
  protected computeTotals(models: Record<string, ModelMigrationProgress>): {
    scanned: number;
    migrated: number;
    skipped: number;
  } {
    let scanned = 0;
    let migrated = 0;
    let skipped = 0;
    for (const m of Object.values(models)) {
      scanned += m.scanned;
      migrated += m.migrated;
      skipped += m.skipped;
    }
    return { scanned, migrated, skipped };
  }

  /**
   * Create the initial `PENDING` status object
   * @returns initial MigrationStoreStatus
   */
  protected createInitialStatus(): MigrationStoreStatus {
    return {
      store: this.getName(),
      source: this.sourceStore?.getName?.() ?? this.parameters.source,
      target: this.targetStore?.getName?.() ?? this.parameters.target,
      state: "PENDING",
      scanned: 0,
      migrated: 0,
      skipped: 0,
      verified: 0,
      models: {}
    };
  }

  /**
   * Convert a raw Registry entry into a normalized {@link MigrationStoreStatus}
   * @param entry - raw Registry entry
   * @returns normalized status
   */
  protected toStatus(entry: Partial<MigrationStoreStatus> | undefined): MigrationStoreStatus {
    const initial = this.createInitialStatus();
    if (!entry || typeof entry !== "object") {
      return initial;
    }
    const validStates: MigrationStoreState[] = ["PENDING", "MIGRATING", "VERIFYING", "COMPLETED", "FAILED"];
    const state: MigrationStoreState = entry.state && validStates.includes(entry.state) ? entry.state : "PENDING";
    const models: Record<string, ModelMigrationProgress> = {};
    if (entry.models && typeof entry.models === "object") {
      for (const [key, val] of Object.entries(entry.models)) {
        if (val && typeof val === "object") {
          models[key] = {
            model: typeof val.model === "string" ? val.model : key,
            scanned: Number(val.scanned) || 0,
            migrated: Number(val.migrated) || 0,
            skipped: Number(val.skipped) || 0,
            continuationToken: typeof val.continuationToken === "string" ? val.continuationToken : undefined,
            completed: !!val.completed
          };
        }
      }
    }
    return {
      store: this.getName(),
      source: this.sourceStore?.getName?.() ?? this.parameters.source,
      target: this.targetStore?.getName?.() ?? this.parameters.target,
      state,
      currentModel: typeof entry.currentModel === "string" ? entry.currentModel : undefined,
      continuationToken: typeof entry.continuationToken === "string" ? entry.continuationToken : undefined,
      scanned: Number(entry.scanned) || 0,
      migrated: Number(entry.migrated) || 0,
      skipped: Number(entry.skipped) || 0,
      verified: Number(entry.verified) || 0,
      models,
      owner: typeof entry.owner === "string" ? entry.owner : undefined,
      leaseUntil: Number(entry.leaseUntil) || 0,
      startedAt: typeof entry.startedAt === "number" ? entry.startedAt : undefined,
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : undefined,
      completedAt: typeof entry.completedAt === "number" ? entry.completedAt : undefined,
      error: typeof entry.error === "string" ? entry.error : undefined
    };
  }

  /**
   * Registry entry ID used for persisting transfer progress and lease
   * @returns Registry entry ID
   */
  protected transferRegistryId(): string {
    return this.migrationId("transfer");
  }

  /**
   * Check whether the application Registry service is available and not migrated by this store itself
   * @returns true when the Registry can be used for persistence
   */
  protected hasRegistry(): boolean {
    try {
      const registry = useCore()?.getService<Store>("Registry");
      return (
        !!registry && registry !== (this as unknown as Store) && registry._migratedBy !== (this as unknown as Store)
      );
    } catch {
      return false;
    }
  }

  /**
   * Acquire the Registry transfer lease (or an in-memory lease when Registry is unavailable)
   * @param leaseDuration - lease duration in ms
   * @returns active lease handle
   */
  protected async acquireTransferLease(leaseDuration: number): Promise<ActiveTransferLease> {
    const id = this.transferRegistryId();
    const owner = randomUUID();
    if (!this.hasRegistry()) {
      if (this.isRunningLocally) {
        throw new MigrationAlreadyRunning(
          id,
          this.cachedStatus.owner,
          this.cachedStatus.leaseUntil ?? Date.now() + leaseDuration
        );
      }
      const leaseUntil = Date.now() + leaseDuration;
      this.cachedStatus = { ...this.cachedStatus, owner, leaseUntil, updatedAt: Date.now() };
      return { id, owner, leaseUntil, leaseDuration };
    }

    const registry = useRegistry();
    if (!(await registry.exists(id))) {
      try {
        await registry.put(id, {
          ...this.createInitialStatus(),
          leaseUntil: 0
        });
      } catch {
        // Another runner created it concurrently
      }
    }

    const entry = await registry.get<Partial<MigrationStoreStatus>>(id);
    const currentLeaseUntil = Number(entry?.leaseUntil ?? 0);
    const now = Date.now();
    if (currentLeaseUntil > now) {
      throw new MigrationAlreadyRunning(id, entry.owner, currentLeaseUntil);
    }

    const leaseUntil = now + leaseDuration;
    try {
      await registry.patch(id, { leaseUntil, owner, updatedAt: now }, "leaseUntil", entry.leaseUntil);
    } catch (err) {
      const competitor = await this.competingMigrationLease(id, entry.owner, currentLeaseUntil, owner);
      if (competitor) {
        throw new MigrationAlreadyRunning(id, competitor.owner, competitor.leaseUntil);
      }
      throw err;
    }

    this.cachedStatus = this.toStatus({ ...entry, leaseUntil, owner, updatedAt: now });
    this.lastStatusRefresh = now;
    return { id, owner, leaseUntil, leaseDuration };
  }

  /**
   * Save migration status and renew the active transfer lease
   * @param lease - active lease handle
   * @param update - partial status fields to update
   */
  protected async saveTransferStatus(lease: ActiveTransferLease, update: Partial<MigrationStoreStatus>): Promise<void> {
    const now = Date.now();
    const leaseUntil = Math.max(now + lease.leaseDuration, lease.leaseUntil + 1);
    const nextStatus: MigrationStoreStatus = {
      ...this.cachedStatus,
      ...update,
      updatedAt: now,
      leaseUntil,
      owner: lease.owner
    };

    if (this.hasRegistry()) {
      try {
        await useRegistry().patch(lease.id, nextStatus, "leaseUntil", lease.leaseUntil);
      } catch (err) {
        const competitor = await this.competingMigrationLease(lease.id, lease.owner, lease.leaseUntil, lease.owner);
        if (competitor) {
          throw new MigrationAlreadyRunning(lease.id, competitor.owner, competitor.leaseUntil);
        }
        throw err;
      }
    }

    lease.leaseUntil = leaseUntil;
    this.cachedStatus = nextStatus;
    this.lastStatusRefresh = now;
  }

  /**
   * Renew the active transfer lease without modifying progress fields
   * @param lease - active lease handle
   */
  protected async renewTransferLease(lease: ActiveTransferLease): Promise<void> {
    await this.saveTransferStatus(lease, {});
  }

  /**
   * Release the active transfer lease and persist final status fields
   * @param lease - active lease handle
   * @param update - partial status fields to save on release
   */
  protected async releaseTransferLease(
    lease: ActiveTransferLease,
    update: Partial<MigrationStoreStatus>
  ): Promise<void> {
    const now = Date.now();
    const nextStatus: MigrationStoreStatus = {
      ...this.cachedStatus,
      ...update,
      updatedAt: now,
      leaseUntil: 0,
      owner: lease.owner
    };

    if (this.hasRegistry()) {
      try {
        await useRegistry().patch(lease.id, nextStatus, "leaseUntil", lease.leaseUntil);
      } catch (err) {
        const competitor = await this.competingMigrationLease(lease.id, lease.owner, lease.leaseUntil, lease.owner);
        if (!competitor) {
          throw err;
        }
        this.log("WARN", `Migration ${lease.id}: lease lost before release, another runner owns the progress`);
        return;
      }
    }

    lease.leaseUntil = 0;
    this.cachedStatus = nextStatus;
    this.lastStatusRefresh = now;
  }
}
