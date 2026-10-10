import type { MergeResult, Resolution, VersioningConfig } from "@webda/versioning";
import { serializeKey, type SyncRef, type SyncScope } from "../protocol/index.js";
import { Collection } from "./collection.js";
import { Emitter } from "./emitter.js";
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
      onConflict: "manual",
      syncInterval: 30000,
      primaryKeys: {},
      versioning: {},
      retry: { base: 1000, max: 60000 },
      ...options
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
}
