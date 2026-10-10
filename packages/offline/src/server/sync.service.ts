import {
  Service,
  ServiceParameters,
  serializeSubjectKey,
  parseSubjectKey,
  useApplication,
  useModel,
  useModelMetadata,
  useRepository
} from "@webda/core";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { SyncChange } from "./syncchange.model.js";
import { parseDuration } from "./duration.js";
import { refId } from "../protocol/index.js";

/**
 * Parameters of the SyncService
 */
export class SyncServiceParameters extends ServiceParameters {
  /**
   * Models clients can sync; each must implement `Syncable`
   */
  models: string[];
  /**
   * How long change-log entries are kept; older cursors trigger a resync
   * @default "30d"
   */
  retention?: string;
  /**
   * Maximum scopes per request
   * @default 20
   */
  maxScopes?: number;
  /**
   * Maximum length of a scope query
   * @default 1024
   */
  maxQueryLength?: number;
  /**
   * Maximum entries, objects or mutations handled per request
   * @default 500
   */
  pageSize?: number;
  /**
   * Window re-read by the next pull, covering clock skew between servers
   * @default "5s"
   */
  overlap?: string;
  /**
   * Debounce of the watch hints, in milliseconds
   * @default 250
   */
  watchDebounce?: number;

  /**
   * @param params - the raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    this.models ??= [];
    this.retention ??= "30d";
    this.maxScopes ??= 20;
    this.maxQueryLength ??= 1024;
    this.pageSize ??= 500;
    this.overlap ??= "5s";
    this.watchDebounce ??= 250;
    return this;
  }
}

/**
 * Seq width: epoch milliseconds zero-padded to 15 digits
 */
const SEQ_WIDTH = 15;

/**
 * @WebdaModda SyncService
 *
 * Offline sync of models: maintains the `_rev` of the configured models, records every write in the
 * `SyncChange` log and exposes `Sync.Pull`, `Sync.Snapshot`, `Sync.Push` and `Sync.Watch`.
 */
export class SyncService extends Service<SyncServiceParameters> {
  /**
   * Emits "change" ({ model, key, seq }) when an entry is appended
   */
  protected changes = new EventEmitter();
  /**
   * Write payloads whose `_rev` was already set by the service
   */
  protected revved = new WeakSet<object>();
  /**
   * `_rev` increments the service issued itself (not logged again)
   */
  protected ownBumps = new WeakSet<object>();
  /**
   * refId → mutationId of the Sync.Push write in progress
   */
  protected mutationIds = new Map<string, string>();
  /**
   * Instance id used in seq
   */
  protected instanceId = randomUUID().substring(0, 8);
  protected lastMs = 0;
  protected counter = 0;
  /**
   * Remove the repository listeners
   */
  protected unsubscribers: (() => void)[] = [];
  /**
   * Models already warned about bulk operations
   */
  protected bulkWarned = new Set<string>();

  /**
   * Check the configured models, then hook their repositories
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    for (const id of this.parameters.models) {
      const model = useModel(id);
      if (!model) {
        throw new Error(`SyncService: unknown model ${id}`);
      }
      const schema: any = useApplication().getSchema(id);
      if (schema && !schema.properties?._rev) {
        throw new Error(`SyncService: model ${id} must declare _rev (implement Syncable)`);
      }
      this.hook(id, model);
    }
    return this;
  }

  /**
   * @returns nothing
   */
  async stop(): Promise<void> {
    for (const off of this.unsubscribers.splice(0)) off();
    this.changes.removeAllListeners();
    await super.stop();
  }

  /**
   * @param ms - epoch milliseconds
   * @returns the smallest seq of that millisecond
   */
  seqAt(ms: number): string {
    return String(Math.max(0, Math.floor(ms))).padStart(SEQ_WIDTH, "0");
  }

  /**
   * @returns a seq greater than every seq this process generated before
   */
  nextSeq(): string {
    const now = Date.now();
    if (now <= this.lastMs) {
      this.counter++;
    } else {
      this.lastMs = now;
      this.counter = 0;
    }
    return `${this.seqAt(this.lastMs)}-${String(this.counter).padStart(6, "0")}-${this.instanceId}`;
  }

  /**
   * @param modelId - the model identifier
   * @returns its primary key fields
   */
  protected pkFields(modelId: string): string[] {
    return useModelMetadata(useModel(modelId))?.PrimaryKey ?? ["uuid"];
  }

  /**
   * Load an object by canonical key
   * @param modelId - the model identifier
   * @param key - the canonical key
   * @returns the object, undefined when missing
   */
  protected async load(modelId: string, key: string): Promise<any | undefined> {
    const pk = parseSubjectKey(this.pkFields(modelId), key);
    if (pk === undefined) return undefined;
    try {
      return (await (useModel(modelId) as any).ref(pk).get()) ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Log writes the repository events cannot see (bulk updateMany/deleteMany)
   * @param modelId - the model identifier
   * @param keys - primary keys (scalars or key objects)
   */
  async touch(modelId: string, keys: unknown[]): Promise<void> {
    const fields = this.pkFields(modelId);
    for (const key of keys) {
      const canonical = serializeSubjectKey(fields, key);
      if (canonical === undefined) continue;
      const object = await this.load(modelId, canonical);
      await this.append(modelId, canonical, object ? "upsert" : "delete", object?._rev);
    }
  }

  /**
   * Append a change-log entry and notify the watchers
   * @param modelId - the model identifier
   * @param key - the canonical key
   * @param op - the kind of write
   * @param rev - the revision after the write, when known
   */
  protected async append(modelId: string, key: string, op: "upsert" | "delete", rev?: number): Promise<void> {
    const id = refId({ model: modelId, key });
    const mutationId = this.mutationIds.get(id);
    this.mutationIds.delete(id);
    const seq = this.nextSeq();
    await SyncChange.create({
      seq,
      subjectModel: modelId,
      subjectKey: key,
      rev,
      op,
      mutationId,
      timestamp: new Date()
    } as any);
    this.changes.emit("change", { model: modelId, key, seq });
  }

  /**
   * Run an after-event step without ever throwing into the caller's committed write
   * @param modelId - the model identifier
   * @param key - the canonical key
   * @param step - the step to run
   */
  protected async safely(modelId: string, key: string, step: () => Promise<void>): Promise<void> {
    try {
      await step();
    } catch (err) {
      this.log("ERROR", `SyncService: change-log entry lost for ${modelId} ${key}`, err);
    }
  }

  /**
   * Maintain `_rev` and log every write of a synced model
   * @param modelId - the model identifier
   * @param model - the model class
   */
  protected hook(modelId: string, model: any): void {
    const repo: any = useRepository(model);
    const fields = this.pkFields(modelId);
    const keyOf = (pk: unknown) => serializeSubjectKey(fields, pk);
    const currentRev = async (pk: unknown) => {
      try {
        return (await repo.get(pk))?._rev ?? 0;
      } catch {
        return 0;
      }
    };
    const listeners: Record<string, (evt: any) => Promise<void>> = {
      Create: async ({ object }) => {
        if (!this.revved.has(object)) object._rev = 1;
      },
      Update: async ({ object_id, object }) => {
        if (!this.revved.has(object)) object._rev = (await currentRev(object_id)) + 1;
      },
      Patch: async ({ object_id, object }) => {
        if (!this.revved.has(object)) object._rev = (await currentRev(object_id)) + 1;
      },
      PartialUpdate: async ({ partial_update }) => {
        const increments = partial_update?.increments;
        if (!increments || this.ownBumps.has(increments) || this.revved.has(increments)) return;
        if (Array.isArray(increments)) increments.push({ property: "_rev", value: 1 });
        else increments._rev = 1;
        this.revved.add(increments);
      },
      Created: ({ object_id, object }) =>
        this.safely(modelId, keyOf(object_id), () => this.append(modelId, keyOf(object_id), "upsert", object?._rev)),
      Updated: ({ object_id, object }) =>
        this.safely(modelId, keyOf(object_id), () => this.append(modelId, keyOf(object_id), "upsert", object?._rev)),
      Patched: ({ object_id, object }) =>
        this.safely(modelId, keyOf(object_id), () => this.append(modelId, keyOf(object_id), "upsert", object?._rev)),
      PartialUpdated: async ({ object_id, partial_update }) => {
        if (this.ownBumps.has(partial_update?.increments)) return;
        await this.safely(modelId, keyOf(object_id), async () => {
          if (!partial_update?.increments) {
            const bump = [{ property: "_rev", value: 1 }];
            this.ownBumps.add(bump);
            await repo.incrementAttributes(object_id, bump);
          }
          await this.append(modelId, keyOf(object_id), "upsert");
        });
      },
      Deleted: ({ object_id }) =>
        this.safely(modelId, keyOf(object_id), () => this.append(modelId, keyOf(object_id), "delete"))
    };
    for (const [event, listener] of Object.entries(listeners)) {
      repo.on(event, listener);
      this.unsubscribers.push(() => repo.off(event, listener));
    }
    for (const method of ["deleteMany", "updateMany"]) {
      const original = repo[method];
      if (typeof original !== "function") continue;
      repo[method] = async (...args: any[]) => {
        if (!this.bulkWarned.has(modelId)) {
          this.bulkWarned.add(modelId);
          this.log("WARN", `${method} on synced model ${modelId} is not logged: call SyncService.touch() or clients only see it after a resync`);
        }
        return original.apply(repo, args);
      };
      this.unsubscribers.push(() => (repo[method] = original));
    }
  }
}
