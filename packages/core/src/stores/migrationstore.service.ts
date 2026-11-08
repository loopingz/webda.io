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
import { useModelId } from "../application/hooks.js";
import { InstanceCache } from "../cache/cache.js";
import { useModelMetadata } from "../core/hooks.js";
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
export function unwrapRepository<T extends ModelClass>(repo: Repository<T>): AbstractRepository<T> {
  return Reflect.get(repo, "repository") as AbstractRepository<T>;
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
    this.modelId = useModelId(model)!;
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

  /**
   * Execute a create/upsert write on the primary repository and mirror the resulting item to the secondary repository
   * @param write - write callback executed against the primary repository
   * @returns the created or upserted model instance
   */
  protected async mirrorWrite(
    write: (repo: AbstractRepository<T>) => Promise<InstanceType<T>>
  ): Promise<InstanceType<T>> {
    await this.store.ensureFreshStatus();
    if (this.store.isCompleted()) {
      const item = await write(this.targetRepo);
      await this.syncFullItem(this.sourceRepo, this.getPrimaryKey(item), item);
      return item;
    }
    const item = await write(this.sourceRepo);
    const pk = this.getPrimaryKey(item);
    this.store.markKeyTouched(this.modelId, pk.toString());
    await this.syncFullItem(this.targetRepo, pk, item);
    return item;
  }

  /**
   * Execute an in-place mutation on the primary repository and copy-on-write the full resulting item to the secondary repository
   * @param primaryKey - primary key of the mutated item
   * @param mutate - mutation callback executed against the primary repository
   * @returns result of the primary mutation
   */
  protected async mirrorMutation<R>(
    primaryKey: PrimaryKeyType<InstanceType<T>>,
    mutate: (repo: AbstractRepository<T>) => Promise<R>
  ): Promise<R> {
    await this.store.ensureFreshStatus();
    const pk = this.getPrimaryKey(primaryKey);
    if (this.store.isCompleted()) {
      const res = await mutate(this.targetRepo);
      await this.syncFullItem(this.sourceRepo, pk, await this.targetRepo.get(pk));
      return res;
    }
    const res = await mutate(this.sourceRepo);
    this.store.markKeyTouched(this.modelId, pk.toString());
    await this.syncFullItem(this.targetRepo, pk, await this.sourceRepo.get(pk));
    return res;
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
    return this.mirrorWrite(repo => repo.create(data, save));
  }

  /** @override */
  async update<K extends PropertyPaths<InstanceType<T>>>(
    data: Helpers<InstanceType<T>>,
    conditionField?: K | null,
    condition?: PropertyPathType<InstanceType<T>, K>
  ): Promise<void> {
    return this.mirrorMutation(this.getPrimaryKey(data), repo => repo.update(data, conditionField, condition));
  }

  /** @override */
  async patch<K extends PropertyPaths<InstanceType<T>>>(
    primaryKey: PK<InstanceType<T>, InstanceType<T>[typeof WEBDA_PRIMARY_KEY][number]>,
    data: Partial<InstanceType<T>>,
    conditionField?: K | null,
    condition?: unknown
  ): Promise<void> {
    return this.mirrorMutation(primaryKey, repo => repo.patch(primaryKey, data, conditionField, condition));
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
    return this.mirrorMutation(primaryKey, repo =>
      repo.incrementAttributes(primaryKey, info, conditionField, condition)
    );
  }

  /** @override */
  async removeAttribute<L extends PropertyPaths<InstanceType<T>>, K extends PropertyPaths<InstanceType<T>>>(
    uuid: PrimaryKeyType<InstanceType<T>>,
    attribute: K,
    conditionField?: L | null,
    condition?: PropertyPathType<InstanceType<T>, L> | JSONed<PropertyPathType<InstanceType<T>, L>>
  ): Promise<void> {
    return this.mirrorMutation(uuid, repo => repo.removeAttribute(uuid, attribute, conditionField, condition));
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
    return this.mirrorMutation(uuid, repo =>
      repo.upsertItemToCollection(uuid, collection, item, index, itemWriteConditionField, itemWriteCondition)
    );
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
    return this.mirrorMutation(uuid, repo =>
      repo.deleteItemFromCollection(uuid, collection, index, itemWriteConditionField, itemWriteCondition)
    );
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
      this.parameters.models = [
        ...new Set([
          ...(this.sourceStore.getParameters().models as string[]),
          ...(this.targetStore.getParameters().models as string[])
        ])
      ];
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
    const id = this.transferRegistryId();
    if (await useRegistry().exists(id)) {
      await useRegistry().delete(id);
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
    const pks = meta.PrimaryKey as (keyof InstanceType<T> & string)[];
    const separator = meta.PrimaryKeySeparator ?? "#";
    return new EventRepository<T>(model, pks, new MigrationRepository<T>(model, pks, this, separator), separator);
  }

  /**
   * Refresh the cached status from the Registry if `statusRefreshInterval` has elapsed
   */
  async ensureFreshStatus(): Promise<void> {
    if (this.isCompleted() || this.isRunningLocally) {
      return;
    }
    if (Date.now() - this.lastStatusRefresh >= this.parameters.statusRefreshInterval!) {
      await this.refreshStatus();
    }
  }

  /**
   * Force refreshing the migration status from the Registry
   * @returns the latest MigrationStoreStatus
   */
  async refreshStatus(): Promise<MigrationStoreStatus> {
    this.lastStatusRefresh = Date.now();
    const id = this.transferRegistryId();
    if (await useRegistry().exists(id)) {
      const entry = await useRegistry().get<Partial<MigrationStoreStatus>>(id);
      this.cachedStatus = this.toStatus(entry);
    }
    return structuredClone(this.cachedStatus);
  }

  /**
   * Return the current migration status (refreshed from Registry)
   * @returns the current MigrationStoreStatus
   */
  async getStatus(): Promise<MigrationStoreStatus> {
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
        const delay = Math.max(20, this.cachedStatus.leaseUntil! - Date.now() + 10);
        this.log("DEBUG", `Migration lease for ${this.getName()} held by another runner, retrying in ${delay}ms`);
        this.clearRetryTimer();
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          this.startLeaderMigration();
        }, delay);
        this.retryTimer.unref?.();
        return undefined;
      }
      this.log("ERROR", `Background store migration failed on ${this.getName()}: ${(err as Error).message}`);
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
      await this.backgroundPromise;
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
    const batchSize = Math.max(1, Math.floor(Number(options.batchSize ?? this.parameters.batchSize)));
    const leaseDuration = Math.max(100, Math.floor(Number(options.leaseDuration ?? this.parameters.leaseDuration)));
    const verify = options.verify ?? this.parameters.verify;
    const force = !!options.force;

    const lease = await this.acquireTransferLease(leaseDuration);
    this.isRunningLocally = true;
    this.abortRequested = false;

    try {
      if (this.cachedStatus.state === "COMPLETED" && !force) {
        await this.releaseTransferLease(lease, {});
        return structuredClone(this.cachedStatus);
      }

      const models = this.getModels();
      const now = Date.now();
      const isResuming =
        !force &&
        (this.cachedStatus.state === "MIGRATING" ||
          this.cachedStatus.state === "VERIFYING" ||
          this.cachedStatus.state === "FAILED") &&
        Object.keys(this.cachedStatus.models).length > 0;

      const modelProgressMap: Record<string, ModelMigrationProgress> = isResuming
        ? structuredClone(this.cachedStatus.models)
        : {};

      for (const model of models) {
        const modelId = useModelId(model)!;
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
        startedAt: isResuming ? this.cachedStatus.startedAt : now,
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
        const modelId = useModelId(model)!;
        const progress = modelProgressMap[modelId];
        if (progress.completed) {
          continue;
        }

        const sourceRepo = this.getSourceRepository(model);
        const targetRepo = this.getTargetRepository(model);
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

            // Skip items deleted concurrently, touched by live dual-writes, or already present in target
            if (
              this.isKeyDeleted(modelId, pkStr) ||
              this.isKeyTouched(modelId, pkStr) ||
              (!force && (await targetRepo.exists(pk)))
            ) {
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
          const modelId = useModelId(model)!;
          const sourceRepo = this.getSourceRepository(model);
          const targetRepo = this.getTargetRepository(model);
          let token: string | undefined;

          do {
            const queryStr = token ? `LIMIT ${batchSize} OFFSET ${WebdaQL.escapeValue(token)}` : `LIMIT ${batchSize}`;
            const page = await sourceRepo.query(queryStr);
            await this.renewTransferLease(lease);

            for (const item of page.results) {
              const pk = sourceRepo.getPrimaryKey(item);
              const pkStr = pk.toString();

              if (!(await targetRepo.exists(pk))) {
                throw new Error(
                  `Verification failed for ${modelId}: item '${pkStr}' missing in target store '${this.targetStore.getName()}'`
                );
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
      const errorMessage = (err as Error).message;
      await this.releaseTransferLease(lease, {
        state: "FAILED",
        error: errorMessage
      });

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
        batchSize: batch,
        force: action === "force"
      });
      useOutput(this.formatStatus(status));
      return 0;
    } catch (err) {
      this.log("ERROR", `Store migration ${this.getName()} failed: ${(err as Error).message}`);
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
    for (const modelProgress of Object.values(status.models)) {
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
      source: this.sourceStore.getName(),
      target: this.targetStore.getName(),
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
  protected toStatus(entry: Partial<MigrationStoreStatus>): MigrationStoreStatus {
    const initial = this.createInitialStatus();
    return {
      ...initial,
      ...entry,
      store: this.getName(),
      source: this.sourceStore.getName(),
      target: this.targetStore.getName(),
      models: structuredClone(entry.models!),
      leaseUntil: Number(entry.leaseUntil)
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
   * Acquire the Registry transfer lease
   * @param leaseDuration - lease duration in ms
   * @returns active lease handle
   */
  protected async acquireTransferLease(leaseDuration: number): Promise<ActiveTransferLease> {
    const id = this.transferRegistryId();
    const owner = randomUUID();
    const registry = useRegistry();
    if (!(await registry.exists(id))) {
      await registry.put(id, {
        ...this.createInitialStatus(),
        leaseUntil: 0
      });
    }

    const entry = await registry.get<Partial<MigrationStoreStatus>>(id);
    const currentLeaseUntil = Number(entry.leaseUntil);
    const now = Date.now();
    if (currentLeaseUntil > now) {
      throw new MigrationAlreadyRunning(id, entry.owner, currentLeaseUntil);
    }

    const leaseUntil = now + leaseDuration;
    await registry.patch(id, { leaseUntil, owner, updatedAt: now }, "leaseUntil", entry.leaseUntil);
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

    await useRegistry().patch(lease.id, nextStatus, "leaseUntil", lease.leaseUntil);
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

    await useRegistry().patch(lease.id, nextStatus, "leaseUntil", lease.leaseUntil);
    lease.leaseUntil = 0;
    this.cachedStatus = nextStatus;
    this.lastStatusRefresh = now;
  }
}
