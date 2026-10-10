import { patch as applyDelta } from "@webda/versioning";
import { QueryValidator } from "@webda/ql";
import type {
  MutationResult,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SnapshotRequest,
  SnapshotResponse,
  SyncRef
} from "../protocol/index.js";
import type { Transport } from "./transport/transport.js";

/**
 * In-memory stand-in for the SyncService used by the client tests: one model key space, a change log
 * whose cursor is the log index, revision checks like the real server
 */
export class FakeServer implements Transport {
  objects = new Map<string, { ref: SyncRef; rev: number; object: any }>();
  log: string[] = [];
  received: PushRequest[] = [];
  applied = new Set<string>();
  pullCalls = 0;
  /** Cursors below this index are "too old" */
  horizon = 0;
  protected failure?: Error;

  /**
   * Make the next call fail
   * @param error - the error to throw
   */
  failNext(error: Error): void {
    this.failure = error;
  }

  protected check(): void {
    const failure = this.failure;
    this.failure = undefined;
    if (failure) throw failure;
  }

  /**
   * Write as another client / server code would
   * @param model - model
   * @param key - key
   * @param object - the new value, null deletes
   */
  serverWrite(model: string, key: string, object: any | null): void {
    const id = `${model}|${key}`;
    const current = this.objects.get(id);
    if (object === null) this.objects.delete(id);
    else this.objects.set(id, { ref: { model, key }, rev: (current?.rev ?? 0) + 1, object: structuredClone(object) });
    this.log.push(id);
  }

  async pull(req: PullRequest): Promise<PullResponse> {
    this.check();
    this.pullCalls++;
    const cursor = req.cursor === undefined || req.cursor === null ? -1 : Number(req.cursor);
    if (cursor < this.horizon)
      return { upserts: [], evicts: [], cursor: String(this.log.length), hasMore: false, resync: true };
    const ids = [...new Set(this.log.slice(cursor))];
    const upserts = [];
    const evicts = [];
    for (const id of ids) {
      const entry = this.objects.get(id);
      const model = id.split("|")[0];
      const scope = req.scopes.find(s => s.model === model);
      if (entry && scope && new QueryValidator(scope.query ?? "").eval(entry.object))
        upserts.push(structuredClone(entry));
      else evicts.push({ model, key: id.substring(model.length + 1) });
    }
    return { upserts, evicts, cursor: String(this.log.length), hasMore: false };
  }

  async snapshot(req: SnapshotRequest): Promise<SnapshotResponse> {
    this.check();
    const validator = new QueryValidator(req.scope.query ?? "");
    return {
      objects: [...this.objects.values()]
        .filter(e => e.ref.model === req.scope.model && validator.eval(e.object))
        .map(e => structuredClone(e))
    };
  }

  async push(req: PushRequest): Promise<PushResponse> {
    this.check();
    this.received.push(structuredClone(req));
    const results: MutationResult[] = req.mutations.map(m => {
      const id = `${m.ref.model}|${m.ref.key}`;
      const current = this.objects.get(id);
      if (this.applied.has(m.mutationId)) {
        return { mutationId: m.mutationId, status: "ok", rev: current?.rev ?? 0, object: current?.object };
      }
      const conflict = (): MutationResult => ({
        mutationId: m.mutationId,
        status: "conflict",
        rev: current?.rev ?? 0,
        object: current ? structuredClone(current.object) : null
      });
      if (m.op === "create") {
        if (current) return conflict();
        this.serverWrite(m.ref.model, m.ref.key, m.patch);
      } else if (m.op === "patch") {
        if (!current || current.rev !== m.baseRev) return conflict();
        this.serverWrite(m.ref.model, m.ref.key, applyDelta(current.object, m.patch));
      } else {
        if (!current) return { mutationId: m.mutationId, status: "ok", rev: 0 };
        if (current.rev !== m.baseRev) return conflict();
        this.serverWrite(m.ref.model, m.ref.key, null);
        this.applied.add(m.mutationId);
        return { mutationId: m.mutationId, status: "ok", rev: 0 };
      }
      this.applied.add(m.mutationId);
      const saved = this.objects.get(id)!;
      return { mutationId: m.mutationId, status: "ok", rev: saved.rev, object: structuredClone(saved.object) };
    });
    return { results };
  }
}
