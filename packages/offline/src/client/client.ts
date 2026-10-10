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
    await this.storage.setMeta("scopes", scopes);
    await this.storage.setMeta("cursor", undefined);
  }

  /**
   * Push then pull; concurrent calls share one run (and trigger one more if needed)
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
    let out = record;
    if (record?.state === "conflict") {
      const info = this.info(record);
      const resolutions = await strategyResolutions(this.options.onConflict, info);
      if (resolutions === "defer") {
        this.emit("conflict", info);
      } else {
        out = settleConflict(record, resolutions);
      }
    }
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
