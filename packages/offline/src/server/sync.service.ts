import {
  Operation,
  OperationContext,
  Service,
  ServiceParameters,
  WebdaError,
  assertFilterOnly,
  checkModelPermission,
  assertNoPrivateFields,
  serializeSubjectKey,
  parseSubjectKey,
  useApplication,
  useModel,
  useContext,
  useModelMetadata,
  useRepository,
  sanitizeModelInput,
  validateModelSchema
} from "@webda/core";
import { patch as applyDelta } from "@webda/versioning";
import { escape, QueryValidator } from "@webda/ql";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { SyncChange } from "./syncchange.model.js";
import { parseDuration } from "./duration.js";
import { refId } from "../protocol/index.js";
import type {
  Mutation,
  MutationResult,
  PullResponse,
  PushResponse,
  SnapshotResponse,
  SyncedObject,
  SyncRef,
  SyncScope,
  WatchEvent
} from "../protocol/index.js";

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
   * Interval of the heartbeats yielded by an idle Sync.Watch, in milliseconds (0 disables them).
   * They let the transport notice a closed client and release the watcher.
   * @default 25000
   */
  watchKeepAlive?: number;

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
    this.watchKeepAlive ??= 25000;
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
  protected changes = new EventEmitter().setMaxListeners(0);
  /**
   * Write payloads whose `_rev` was already set by the service
   */
  protected revved = new WeakSet<object>();
  /**
   * `_rev` increments the service issued itself (not logged again)
   */
  protected ownBumps = new WeakSet<object>();
  /**
   * The Sync.Push write in progress: only the events it raises carry its mutationId
   */
  protected pushContext = new AsyncLocalStorage<{ id: string; mutationId: string }>();
  /**
   * Instance id used in seq
   */
  protected instanceId = randomUUID().substring(0, 8);
  protected lastMs = 0;
  protected counter = 0;
  /**
   * Hourly retention pruning
   */
  protected pruneTimer?: NodeJS.Timeout;
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
    await this.prune();
    this.pruneTimer = setInterval(() => this.prune().catch(err => this.log("ERROR", "Prune failed", err)), 3600000);
    this.pruneTimer.unref?.();
    return this;
  }

  /**
   * @returns nothing
   */
  async stop(): Promise<void> {
    clearInterval(this.pruneTimer);
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
    const store = this.pushContext.getStore();
    const mutationId = store?.id === id ? store.mutationId : undefined;
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
          this.log(
            "WARN",
            `${method} on synced model ${modelId} is not logged: call SyncService.touch() or clients only see it after a resync`
          );
        }
        return original.apply(repo, args);
      };
      this.unsubscribers.push(() => (repo[method] = original));
    }
  }

  /**
   * Cursors below this seq may have missed pruned entries
   */
  protected horizon: string = "";

  /**
   * Delete the entries older than the retention and move the horizon
   */
  protected async prune(): Promise<void> {
    const cutoff = this.seqAt(Date.now() - parseDuration(this.parameters.retention));
    await (useRepository(SyncChange) as any).deleteMany(escape(["DELETE WHERE seq < ", ""], [cutoff]));
    this.horizon = cutoff;
  }

  /**
   * Validate client scopes
   * @param scopes - the scopes
   * @returns the scopes with their compiled filter
   */
  protected validateScopes(scopes: SyncScope[]): { model: string; query: string; validator: QueryValidator }[] {
    if (!Array.isArray(scopes) || scopes.length === 0) {
      throw new WebdaError.BadRequest("At least one scope is required");
    }
    if (scopes.length > this.parameters.maxScopes) {
      throw new WebdaError.BadRequest(`At most ${this.parameters.maxScopes} scopes are accepted`);
    }
    return scopes.map(scope => {
      if (!scope || !this.parameters.models.includes(scope.model)) {
        throw new WebdaError.BadRequest(`Model ${scope?.model} is not synced`);
      }
      const query = scope.query ?? "";
      if (typeof query !== "string" || query.length > this.parameters.maxQueryLength) {
        throw new WebdaError.BadRequest("Scope query is too long");
      }
      let validator: QueryValidator;
      try {
        validator = new QueryValidator(query);
      } catch {
        throw new WebdaError.BadRequest("Query syntax error");
      }
      assertFilterOnly(validator);
      assertNoPrivateFields(validator);
      const parsed: any = validator.getQuery();
      if (parsed.limit !== undefined || parsed.offset || parsed.orderBy?.length) {
        throw new WebdaError.BadRequest("Scope query cannot contain LIMIT, OFFSET or ORDER BY");
      }
      return { model: scope.model, query, validator };
    });
  }

  /**
   * @param object - the object
   * @param modelId - the model it is reached through
   * @returns true when the current caller may read it
   */
  protected async canRead(object: any, modelId: string): Promise<boolean> {
    try {
      await checkModelPermission(object, useContext<OperationContext>(), "get", useModel(modelId));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * @param modelId - the model identifier
   * @param object - the object
   * @returns the object as sent to clients
   */
  protected toSynced(modelId: string, object: any): SyncedObject {
    return {
      ref: { model: modelId, key: serializeSubjectKey(this.pkFields(modelId), object) },
      rev: object._rev ?? 0,
      object: typeof object.toDTO === "function" ? object.toDTO() : object
    };
  }

  /**
   * Changes of the scoped objects since `cursor`
   * @param scopes - the sync scopes
   * @param cursor - the cursor of the previous pull, null for the first one
   * @param limit - page size (capped by pageSize)
   * @returns the page of changes
   */
  @Operation({
    id: "Sync.Pull",
    input: "SyncService.pull.input",
    output: "SyncService.pull.output",
    rest: { method: "post", path: "sync/pull" }
  })
  async pull(scopes: SyncScope[], cursor?: string | null, limit?: number): Promise<PullResponse> {
    const validated = this.validateScopes(scopes);
    // Bare millisecond: sorts before every seq of it, so a resync cursor never skips a write of the current ms
    const settle = this.seqAt(Date.now() - parseDuration(this.parameters.overlap));
    if (!cursor || cursor < this.horizon) {
      return { upserts: [], evicts: [], cursor: settle, hasMore: false, resync: true };
    }
    const pageSize = Math.min(
      Math.max(Math.floor(Number(limit)) || this.parameters.pageSize, 1),
      this.parameters.pageSize
    );
    const models = [...new Set(validated.map(s => s.model))];
    const filter = escape(
      ["subjectModel IN [", ...models.slice(1).map(() => ", "), "] AND seq > ", ` ORDER BY seq ASC LIMIT ${pageSize}`],
      [...models, cursor]
    );
    const entries: SyncChange[] = (await SyncChange.query(filter as any)).results;
    const latest = new Map<string, SyncChange>();
    for (const entry of entries) {
      latest.set(refId({ model: entry.subjectModel, key: entry.subjectKey }), entry);
    }
    const upserts: SyncedObject[] = [];
    const evicts: SyncRef[] = [];
    for (const entry of latest.values()) {
      const ref = { model: entry.subjectModel, key: entry.subjectKey };
      const object = await this.load(ref.model, ref.key);
      if (!object) {
        evicts.push(ref);
        continue;
      }
      const synced = this.toSynced(ref.model, object);
      const inScope = validated.some(s => s.model === ref.model && s.validator.eval(synced.object));
      if (inScope && (await this.canRead(object, ref.model))) {
        upserts.push(synced);
      } else {
        evicts.push(ref);
      }
    }
    const hasMore = entries.length === pageSize;
    const last = entries[entries.length - 1]?.seq ?? cursor;
    // Last page: re-read the overlap window next time; a full page always moves forward
    const next = hasMore || last < settle ? last : settle;
    return { upserts, evicts, cursor: next, hasMore };
  }

  /**
   * Every object of a scope, paged: used by clients to resync
   * @param scope - the scope
   * @param continuationToken - token of the previous page
   * @returns the page of objects
   */
  @Operation({
    id: "Sync.Snapshot",
    input: "SyncService.snapshot.input",
    output: "SyncService.snapshot.output",
    rest: { method: "post", path: "sync/snapshot" }
  })
  async snapshot(scope: SyncScope, continuationToken?: string): Promise<SnapshotResponse> {
    const [valid] = this.validateScopes([scope]);
    let query = `${valid.query} LIMIT ${this.parameters.pageSize}`;
    if (continuationToken) {
      query += escape([" OFFSET ", ""], [continuationToken]);
    }
    // Not queryModelWithPermissions: it drops the token when its scan budget finds no readable row
    const res = await (useModel(valid.model) as any).query(query);
    const objects: SyncedObject[] = [];
    for (const object of res.results) {
      if (await this.canRead(object, valid.model)) objects.push(this.toSynced(valid.model, object));
    }
    return {
      objects,
      continuationToken: res.continuationToken || undefined
    };
  }

  /**
   * Apply client mutations, each on its own, in order
   * @param mutations - the mutations
   * @returns one result per mutation
   */
  @Operation({
    id: "Sync.Push",
    input: "SyncService.push.input",
    output: "SyncService.push.output",
    rest: { method: "post", path: "sync/push" }
  })
  async push(mutations: Mutation[]): Promise<PushResponse> {
    if (!Array.isArray(mutations)) {
      throw new WebdaError.BadRequest("mutations must be an array");
    }
    if (mutations.length > this.parameters.pageSize) {
      throw new WebdaError.BadRequest(`At most ${this.parameters.pageSize} mutations are accepted`);
    }
    const results: MutationResult[] = [];
    for (const mutation of mutations) {
      results.push(await this.applyMutation(mutation));
    }
    return { results };
  }

  /**
   * @param mutationId - the mutation
   * @param code - error code
   * @param message - error message
   * @returns a rejected result
   */
  protected rejected(mutationId: string, code: string, message: string): MutationResult {
    return { mutationId, status: "rejected", error: { code, message } };
  }

  /**
   * @param mutationId - the mutation
   * @param modelId - the model
   * @param object - the current server object, undefined when deleted
   * @returns a conflict result
   */
  protected conflict(mutationId: string, modelId: string, object?: any): MutationResult {
    if (!object) return { mutationId, status: "conflict", rev: 0, object: null };
    const synced = this.toSynced(modelId, object);
    return { mutationId, status: "conflict", rev: synced.rev, object: synced.object };
  }

  /**
   * @param mutationId - the mutation
   * @returns the result for an object the caller cannot read: indistinguishable from a missing one
   */
  protected hidden(mutationId: string): MutationResult {
    return this.rejected(mutationId, "NOT_FOUND", "Object not found");
  }

  /**
   * A conflict that never carries an object the caller cannot read
   * @param mutationId - the mutation
   * @param modelId - the model
   * @param object - the current server object, undefined when deleted
   * @returns the conflict, or a NOT_FOUND rejection
   */
  protected async guardedConflict(mutationId: string, modelId: string, object?: any): Promise<MutationResult> {
    if (object && !(await this.canRead(object, modelId))) return this.hidden(mutationId);
    return this.conflict(mutationId, modelId, object);
  }

  /**
   * @param mutationId - the mutation
   * @param modelId - the model
   * @param existing - the object already stored under the key
   * @returns a conflict when readable, KEY_IN_USE otherwise (no content)
   */
  protected async keyInUse(mutationId: string, modelId: string, existing: any): Promise<MutationResult> {
    return (await this.canRead(existing, modelId))
      ? this.conflict(mutationId, modelId, existing)
      : this.rejected(mutationId, "KEY_IN_USE", "Key already in use");
  }

  /**
   * Validate a candidate object against the model schema
   * @param modelId - the model
   * @param candidate - the full object
   * @returns undefined when valid, the error message otherwise
   */
  protected invalid(modelId: string, candidate: any): string | undefined {
    try {
      const res: any = validateModelSchema(modelId, candidate);
      return res === true || res === null || res === undefined ? undefined : String(res?.message ?? res);
    } catch (err) {
      return (err as Error).message;
    }
  }

  /**
   * Apply one mutation
   * @param m - the mutation
   * @returns its result
   */
  protected async applyMutation(m: Mutation): Promise<MutationResult> {
    const mutationId = typeof m?.mutationId === "string" ? m.mutationId : "";
    if (!mutationId || !m.ref || typeof m.ref.key !== "string") {
      return this.rejected(mutationId, "INVALID", "mutationId and ref are required");
    }
    const modelId = m.ref.model;
    if (!this.parameters.models.includes(modelId)) {
      return this.rejected(mutationId, "NOT_SYNCED", `Model ${modelId} is not synced`);
    }
    const model: any = useModel(modelId);
    const fields = this.pkFields(modelId);
    const pk = parseSubjectKey(fields, m.ref.key);
    if (pk === undefined) {
      return this.rejected(mutationId, "INVALID_KEY", "Invalid key");
    }
    const context = useContext<OperationContext>();
    const id = refId(m.ref);
    const keyFields = typeof pk === "object" ? pk : { [fields[0] ?? "uuid"]: pk };
    try {
      // Replay of a mutation already applied (lost response)
      const done = (await SyncChange.query(escape(["mutationId = ", " LIMIT 1"], [mutationId]))).results[0];
      if (done && done.subjectModel === modelId && done.subjectKey === m.ref.key) {
        const object = await this.load(modelId, m.ref.key);
        if (!object) return { mutationId, status: "ok", rev: 0 };
        if (!(await this.canRead(object, modelId))) return this.hidden(mutationId);
        return { mutationId, status: "ok", rev: object._rev ?? 0, object: this.toSynced(modelId, object).object };
      }
      const current = await this.load(modelId, m.ref.key);
      if (m.op === "create") {
        if (current) return this.keyInUse(mutationId, modelId, current);
        const input = { ...sanitizeModelInput(model, m.patch ?? {}), ...keyFields };
        const candidate = new model();
        candidate["load"](input);
        await checkModelPermission(candidate, context, "create", model);
        const error = this.invalid(modelId, { ...input, _rev: 1 });
        if (error) return this.rejected(mutationId, "VALIDATION", error);
        try {
          await this.pushContext.run({ id, mutationId }, () => model.create(input));
        } catch (err) {
          const existing = await this.load(modelId, m.ref.key);
          if (existing) return this.keyInUse(mutationId, modelId, existing);
          throw err;
        }
      } else if (m.op === "patch" || m.op === "delete") {
        if (!current) {
          return m.op === "delete" ? { mutationId, status: "ok", rev: 0 } : this.conflict(mutationId, modelId);
        }
        await checkModelPermission(current, context, m.op === "patch" ? "update" : "delete", model);
        if ((current._rev ?? 0) !== m.baseRev) {
          return this.guardedConflict(mutationId, modelId, current);
        }
        if (m.op === "delete") {
          try {
            await this.pushContext.run({ id, mutationId }, () =>
              useRepository(model).delete(pk as any, "_rev" as any, current._rev)
            );
          } catch (err) {
            const reloaded = await this.load(modelId, m.ref.key);
            if (!reloaded) return { mutationId, status: "ok", rev: 0 };
            if ((reloaded._rev ?? 0) !== m.baseRev) return this.guardedConflict(mutationId, modelId, reloaded);
            throw err;
          }
          return { mutationId, status: "ok", rev: 0 };
        }
        const before = this.toSynced(modelId, current).object;
        const after = applyDelta(before, m.patch);
        // Server-managed attributes keep their stored value; client-writable ones come from `after`
        const writable = sanitizeModelInput(model, after);
        const writableBefore = sanitizeModelInput(model, before);
        const managed = Object.fromEntries(Object.entries(before).filter(([key]) => !(key in writableBefore)));
        const data: any = { ...managed, ...writable, ...keyFields, _rev: m.baseRev + 1 };
        const error = this.invalid(modelId, data);
        if (error) {
          return this.rejected(mutationId, "VALIDATION", error);
        }
        this.revved.add(data);
        try {
          // patch, not update: MemoryRepository.update rebuilds the row with `new Model(data)`, which drops every field
          // for models whose constructor ignores its argument. Removed attributes are cleared explicitly.
          const removed = Object.fromEntries(
            Object.keys(writableBefore)
              .filter(key => !(key in data))
              .map(key => [key, undefined])
          );
          await this.pushContext.run({ id, mutationId }, () =>
            useRepository(model).patch(pk as any, { ...removed, ...data }, "_rev" as any, current._rev)
          );
        } catch (err) {
          const reloaded = await this.load(modelId, m.ref.key);
          if ((reloaded?._rev ?? 0) !== m.baseRev) return this.guardedConflict(mutationId, modelId, reloaded);
          throw err;
        }
      } else {
        return this.rejected(mutationId, "INVALID", `Unknown op ${(m as any).op}`);
      }
      const saved = await this.load(modelId, m.ref.key);
      return { mutationId, status: "ok", rev: saved?._rev ?? 0, object: saved && this.toSynced(modelId, saved).object };
    } catch (err) {
      if (err instanceof WebdaError.NotFound) return this.rejected(mutationId, "NOT_FOUND", "Object not found");
      if (err instanceof WebdaError.Forbidden) return this.rejected(mutationId, "FORBIDDEN", err.message);
      this.log("ERROR", "Sync.Push mutation failed", err);
      return this.rejected(mutationId, "INTERNAL", "Internal error");
    }
  }

  /**
   * Stream of hints telling the client to pull: only a cursor, never object data
   * @param scopes - the sync scopes
   * @param _cursor - the client cursor (reserved)
   * @returns the hints
   */
  @Operation({
    id: "Sync.Watch",
    input: "SyncService.watch.input",
    output: "SyncService.watch.output",
    rest: { method: "post", path: "sync/watch" }
  })
  async *watch(scopes: SyncScope[], _cursor?: string): AsyncGenerator<WatchEvent> {
    const models = new Set(this.validateScopes(scopes).map(s => s.model));
    let pending: string | undefined;
    let last: string | undefined;
    let wake: (() => void) | undefined;
    let timer: NodeJS.Timeout | undefined;
    const listener = (evt: { model: string; seq: string }) => {
      if (!models.has(evt.model)) return;
      pending = evt.seq;
      wake?.();
    };
    this.changes.on("change", listener);
    try {
      while (true) {
        if (!pending) {
          const keepAlive = this.parameters.watchKeepAlive;
          const beat = await new Promise<boolean>(resolve => {
            wake = () => resolve(false);
            if (keepAlive > 0) {
              timer = setTimeout(() => resolve(true), keepAlive);
              timer.unref?.();
            }
          });
          clearTimeout(timer);
          wake = undefined;
          if (beat) {
            yield { cursor: last ?? this.seqAt(Date.now() - parseDuration(this.parameters.overlap)), heartbeat: true };
            continue;
          }
        }
        await new Promise(resolve => setTimeout(resolve, this.parameters.watchDebounce));
        const cursor = pending;
        pending = undefined;
        last = cursor;
        yield { cursor };
      }
    } finally {
      clearTimeout(timer);
      this.changes.off("change", listener);
    }
  }
}
