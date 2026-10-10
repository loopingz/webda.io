import type { MergeResult, Resolution, VersioningConfig } from "@webda/versioning";
import { refId, serializeKey, type SyncRef, type SyncScope } from "../protocol/index.js";
import { Collection } from "./collection.js";
import { settleConflict, strategyResolutions } from "./conflicts.js";
import { Emitter } from "./emitter.js";
import { clone, type LocalRecord } from "./record.js";
import { SyncEngine } from "./sync.js";
import type { StorageAdapter } from "./storage/storage.js";
import type { Transport } from "./transport/transport.js";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";

export interface ChangeEvent {
  ref: SyncRef;
  object: any | null;
  origin: "local" | "remote";
}

export interface ConflictInfo {
  ref: SyncRef;
  /** Common ancestor, null when the object was created on both sides */
  ancestor: any | null;
  /** Local value, null for a local delete */
  ours: any | null;
  /** Server value, null when deleted on the server */
  theirs: any | null;
  result: MergeResult<any>;
}

export type ConflictStrategy =
  "manual" | "server-wins" | "client-wins" | ((info: ConflictInfo) => Promise<Map<string, Resolution> | "defer">);

export interface OfflineClientOptions {
  storage: StorageAdapter;
  transport: Transport;
  scopes: SyncScope[];
  /** @default "manual" */
  onConflict?: ConflictStrategy;
  /** Milliseconds between automatic syncs, 0 disables the timer @default 30000 */
  syncInterval?: number;
  /** Primary key fields per model @default ["uuid"] */
  primaryKeys?: Record<string, string[]>;
  /** `@webda/versioning` config (arrayId, string strategies) */
  versioning?: VersioningConfig;
  /** Retry backoff in milliseconds @default { base: 1000, max: 60000 } */
  retry?: { base: number; max: number };
}

/**
 * Offline-first replica of the SyncService scopes
 */
export class OfflineClient extends Emitter<{
  change: ChangeEvent;
  status: SyncStatus;
  conflict: ConflictInfo;
  error: unknown;
}> {
  readonly storage: StorageAdapter;
  readonly options: Required<Omit<OfflineClientOptions, "versioning">> & { versioning: VersioningConfig };
  protected collections = new Map<string, Collection<any>>();

  /**
   * @param options - client options
   */
  constructor(options: OfflineClientOptions) {
    super();
    this.options = {
      storage: options.storage,
      transport: options.transport,
      scopes: options.scopes,
      onConflict: options.onConflict ?? "manual",
      syncInterval: options.syncInterval ?? 30000,
      primaryKeys: options.primaryKeys ?? {},
      versioning: options.versioning ?? {},
      retry: options.retry ?? { base: 1000, max: 60000 }
    };
    this.storage = options.storage;
  }

  /**
   * @param model - model identifier
   * @returns its primary key fields
   */
  pkFields(model: string): string[] {
    return this.options.primaryKeys[model] ?? ["uuid"];
  }

  /**
   * @param model - model identifier
   * @param key - scalar key or object holding the key fields
   * @returns the canonical key
   */
  keyOf(model: string, key: unknown): string {
    const canonical = serializeKey(this.pkFields(model), key);
    if (canonical === undefined) {
      throw new Error(`Invalid key for ${model}: ${JSON.stringify(key)}`);
    }
    return canonical;
  }

  /**
   * @param model - model identifier
   * @returns the collection of that model
   */
  collection<T = any>(model: string): Collection<T> {
    if (!this.collections.has(model)) this.collections.set(model, new Collection<T>(this, model));
    return this.collections.get(model)!;
  }

  /**
   * Emit a change event (used by collections and the sync engine)
   * @param event - the change
   */
  notify(event: ChangeEvent): void {
    this.emit("change", event);
  }

  protected engine = new SyncEngine(this);
  protected running?: Promise<void>;
  protected again = false;

  /**
   * @returns the current scopes (persisted ones win over the constructor's)
   */
  async getScopes(): Promise<SyncScope[]> {
    return (await this.storage.getMeta<SyncScope[]>("scopes")) ?? this.options.scopes;
  }

  /**
   * Replace the scopes: the next sync resyncs every scope
   * @param scopes - the new scopes
   */
  async setScopes(scopes: SyncScope[]): Promise<void> {
    const kept = new Set(scopes.map(s => s.model));
    const previous = await this.getScopes();
    // Bump the epoch first: a running pull stops persisting its cursor
    await this.storage.setMeta("scopesEpoch", ((await this.storage.getMeta<number>("scopesEpoch")) ?? 0) + 1);
    await this.storage.setMeta("scopes", scopes);
    await this.storage.setMeta("cursor", undefined);
    // Synced records of models no scope covers any more are dropped, local changes are kept
    for (const model of new Set(previous.map(s => s.model))) {
      if (kept.has(model)) continue;
      for (const record of await this.storage.scan(model)) {
        if (record.state !== "synced") continue;
        await this.storage.deleteRecords([record.id]);
        this.notify({ ref: record.ref, object: null, origin: "remote" });
      }
    }
  }

  /**
   * Push then pull; concurrent calls share one run (and trigger one more if needed)
   * @returns the result
   */
  sync(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        do {
          this.again = false;
          await this.engine.push();
          await this.engine.pull();
        } while (this.again);
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }

  protected _status: SyncStatus = "idle";
  protected timer?: ReturnType<typeof setInterval>;
  protected retryTimer?: ReturnType<typeof setTimeout>;
  protected failures = 0;
  protected watchAbort?: AbortController;
  protected stopped = true;
  protected starting?: Promise<void>;
  protected generation = 0;
  protected onlineListener = () => void this.run();

  /**
   * @returns the current sync status
   */
  get status(): SyncStatus {
    return this._status;
  }

  /**
   * @param status - the new status
   */
  protected setStatus(status: SyncStatus): void {
    if (status === this._status) return;
    this._status = status;
    this.emit("status", status);
  }

  /**
   * Sync with status tracking and backoff; never throws
   */
  protected async run(): Promise<void> {
    clearTimeout(this.retryTimer);
    this.setStatus("syncing");
    try {
      await this.sync();
      this.failures = 0;
      this.setStatus("idle");
    } catch (err) {
      this.failures++;
      const status = (err as any)?.status;
      this.setStatus(status === undefined || status === 0 ? "offline" : "error");
      this.emit("error", err);
      if (this.stopped) return;
      const { base, max } = this.options.retry;
      this.retryTimer = setTimeout(() => void this.run(), Math.min(base * 2 ** (this.failures - 1), max));
    }
  }

  /**
   * Initial sync, then the timer, `online` events and watch hints; concurrent calls share one start
   * @returns the result
   */
  start(): Promise<void> {
    if (!this.starting) {
      this.stopped = false;
      this.starting = this.doStart(this.generation);
    }
    return this.starting;
  }

  /**
   * @param generation - start generation, stale once stop() was called
   */
  protected async doStart(generation: number): Promise<void> {
    await this.run();
    if (generation !== this.generation) return;
    if (this.options.syncInterval > 0) {
      this.timer = setInterval(() => void this.run(), this.options.syncInterval);
    }
    (globalThis as any).addEventListener?.("online", this.onlineListener);
    if (this.options.transport.watch) {
      this.watchAbort = new AbortController();
      void this.watchLoop(this.watchAbort.signal);
    }
  }

  /**
   * Pull on every watch hint (heartbeats excepted), reconnecting after a delay when the stream ends
   * @param signal - stops the loop
   */
  protected async watchLoop(signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      try {
        for await (const hint of this.options.transport.watch!({ scopes: await this.getScopes() }, signal)) {
          if (signal.aborted) return;
          // Heartbeats only keep the connection alive
          if (hint.heartbeat) continue;
          await this.run();
        }
      } catch {
        // Polling still keeps the replica correct
      }
      if (signal.aborted) return;
      await new Promise<void>(resolve => {
        const done = () => {
          clearTimeout(wait);
          signal.removeEventListener("abort", done);
          resolve();
        };
        const wait = setTimeout(done, this.options.retry.base);
        signal.addEventListener("abort", done);
      });
    }
  }

  /**
   * Stop the timers and the watch stream
   */
  stop(): void {
    this.stopped = true;
    this.generation++;
    this.starting = undefined;
    clearInterval(this.timer);
    clearTimeout(this.retryTimer);
    this.watchAbort?.abort();
    (globalThis as any).removeEventListener?.("online", this.onlineListener);
  }

  /**
   * @param record - a record in conflict state
   * @returns the conflict description
   */
  protected info(record: LocalRecord): ConflictInfo {
    return {
      ref: record.ref,
      ancestor: clone(record.conflict!.ancestor),
      ours: clone(record.current),
      theirs: clone(record.base),
      result: clone(record.conflict!.result)
    };
  }

  /**
   * Store a rebased record, applying the conflict strategy when it is in conflict
   * @param record - the rebased record, null to remove it
   * @returns the stored record, null when removed
   */
  async applyConflictStrategy(record: LocalRecord | null): Promise<LocalRecord | null> {
    return this.storeOutcome(record, await this.resolveStrategy(record));
  }

  /**
   * Run the conflict strategy on a rebased record without storing anything
   * @param record - the rebased record, null when it is to be removed
   * @param apply - false skips the strategy (conflict stays open and is announced)
   * @returns the record to store, null to remove it
   */
  async resolveStrategy(record: LocalRecord | null, apply: boolean = true): Promise<LocalRecord | null> {
    if (record?.state !== "conflict") return record;
    const info = this.info(record);
    const resolutions = apply ? await strategyResolutions(this.options.onConflict, info) : "defer";
    if (resolutions === "defer") {
      this.emit("conflict", info);
      return record;
    }
    return settleConflict(record, resolutions);
  }

  /**
   * Write the outcome of a rebase
   * @param record - the rebased record (identifies the stored one)
   * @param out - the record to store, null to remove
   * @returns the stored record, null when removed
   */
  async storeOutcome(record: LocalRecord | null, out: LocalRecord | null): Promise<LocalRecord | null> {
    if (out === null) {
      if (record) {
        await this.storage.deleteRecords([record.id]);
        this.notify({ ref: record.ref, object: null, origin: "remote" });
      }
      return null;
    }
    await this.storage.putRecords([out]);
    this.notify({ ref: out.ref, object: clone(out.current), origin: "remote" });
    return out;
  }

  /**
   * @returns the open conflicts
   */
  async conflicts(): Promise<ConflictInfo[]> {
    return (await this.storage.scanPending()).filter(r => r.state === "conflict").map(r => this.info(r));
  }

  /**
   * Resolve an open conflict; the record is pushed by the next sync
   * @param ref - the object
   * @param resolutions - path → resolution for every conflict ("" for a delete-modify on the whole object)
   */
  async resolve(ref: SyncRef, resolutions: Map<string, Resolution>): Promise<void> {
    const record = await this.storage.getRecord(refId(ref));
    if (record?.state !== "conflict") throw new Error(`No open conflict on ${refId(ref)}`);
    const settled = settleConflict(record, resolutions);
    if (settled === null) {
      await this.storage.deleteRecords([record.id]);
      this.notify({ ref, object: null, origin: "local" });
      return;
    }
    await this.storage.putRecords([settled]);
    this.notify({ ref, object: clone(settled.current), origin: "local" });
  }

  /**
   * Drop local changes of an object (error or conflict): back to the last server value
   * @param ref - the object
   */
  async discard(ref: SyncRef): Promise<void> {
    const record = await this.storage.getRecord(refId(ref));
    if (!record) return;
    if (record.base === null) {
      await this.storage.deleteRecords([record.id]);
      this.notify({ ref, object: null, origin: "local" });
      return;
    }
    await this.storage.putRecords([
      { id: record.id, ref, base: record.base, baseRev: record.baseRev, current: clone(record.base), state: "synced" }
    ]);
    this.notify({ ref, object: clone(record.base), origin: "local" });
  }
}
