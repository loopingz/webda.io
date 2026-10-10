import { diff, merge3 } from "@webda/versioning";
import { refId, type Mutation, type SyncedObject, type SyncRef } from "../protocol/index.js";
import type { OfflineClient } from "./client.js";
import { rebase } from "./conflicts.js";
import { clone, deepEqual, type LocalRecord } from "./record.js";

const PUSH_BATCH = 100;
const PUSH_ROUNDS = 3;

/**
 * Push / pull / resync logic of an OfflineClient
 */
export class SyncEngine {
  /**
   * @param client - the client
   */
  constructor(protected client: OfflineClient) {}

  protected get storage() {
    return this.client.storage;
  }

  protected get transport() {
    return this.client.options.transport;
  }

  /**
   * @param record - a pending record
   * @returns its mutation
   */
  protected mutation(record: LocalRecord): Mutation {
    const base = { mutationId: record.pendingMutationId!, ref: record.ref, baseRev: record.baseRev };
    // Never confirmed by the server: always a create, whatever the local state
    if (record.base === null) return { ...base, op: "create", baseRev: 0, patch: record.current };
    if (record.state === "deleted") return { ...base, op: "delete" };
    return { ...base, op: "patch", patch: diff(record.base, record.current, this.client.options.versioning) };
  }

  /**
   * Push the pending records, re-pushing clean rebases up to PUSH_ROUNDS times
   */
  async push(): Promise<void> {
    for (let round = 0; round < PUSH_ROUNDS; round++) {
      const pending = (await this.storage.scanPending()).filter(r => r.state !== "conflict" && r.state !== "error");
      if (pending.length === 0) return;
      let again = false;
      for (let i = 0; i < pending.length; i += PUSH_BATCH) {
        const batch = pending.slice(i, i + PUSH_BATCH);
        // Persist the mutation ids before sending: a retry after a lost response reuses them
        for (const record of batch) {
          record.pendingMutationId ??= globalThis.crypto.randomUUID();
          record.sent = clone(record.current);
        }
        await this.storage.putRecords(batch);
        const res = await this.transport.push({ mutations: batch.map(r => this.mutation(r)) });
        for (const result of res.results) {
          const sent = batch.find(r => r.pendingMutationId === result.mutationId);
          if (!sent) continue;
          // Re-read: the app may have edited the record while the push was in flight
          const latest = (await this.storage.getRecord(sent.id)) ?? sent;
          if (await this.settle(latest, result)) again = true;
        }
      }
      if (!again) return;
    }
  }

  /**
   * Apply one push result
   * @param record - the latest local record
   * @param result - the server answer
   * @returns true when the record needs another push
   */
  protected async settle(record: LocalRecord, result: any): Promise<boolean> {
    const editedMeanwhile = !deepEqual(record.current, record.sent);
    if (result.status === "ok") {
      if (record.state === "deleted" && !editedMeanwhile) {
        await this.storage.deleteRecords([record.id]);
        return false;
      }
      const server = result.object ?? record.sent;
      let current = server;
      let state: LocalRecord["state"] = "synced";
      if (editedMeanwhile) {
        current = merge3(record.sent, record.current, server, this.client.options.versioning).merged;
        state = deepEqual(current, server) ? "synced" : "dirty";
      }
      await this.storage.putRecords([
        {
          ...record,
          base: server,
          baseRev: result.rev,
          current,
          state,
          pendingMutationId: undefined,
          sent: undefined,
          error: undefined
        }
      ]);
      if (!deepEqual(current, record.current))
        this.client.notify({ ref: record.ref, object: clone(current), origin: "remote" });
      return false;
    }
    if (result.status === "rejected") {
      await this.storage.putRecords([
        { ...record, state: "error", error: result.error, pendingMutationId: undefined, sent: undefined }
      ]);
      return false;
    }
    const rebased = await this.rebaseAndApply(record, result.object ?? null, result.rev);
    return (
      rebased !== null && (rebased.state === "dirty" || rebased.state === "created" || rebased.state === "deleted")
    );
  }

  /**
   * Apply one server object
   * @param synced - the server object
   * @param seen - ids collected during a resync
   */
  protected async upsert(synced: SyncedObject, seen?: Set<string>): Promise<void> {
    const id = refId(synced.ref);
    seen?.add(id);
    const record = await this.storage.getRecord(id);
    if (!record || record.state === "synced") {
      if (record && record.baseRev === synced.rev && deepEqual(record.current, synced.object)) return;
      await this.storage.putRecords([
        {
          id,
          ref: synced.ref,
          base: synced.object,
          baseRev: synced.rev,
          current: clone(synced.object),
          state: "synced"
        }
      ]);
      this.client.notify({ ref: synced.ref, object: clone(synced.object), origin: "remote" });
      return;
    }
    if (record.baseRev === synced.rev && deepEqual(record.base, synced.object)) return;
    await this.rebaseAndApply(record, synced.object, synced.rev);
  }

  /**
   * Rebase a record on a server value and store the outcome (strategy applied), removing it when rebase says so
   * @param record - the local record
   * @param theirs - the server value, null when deleted
   * @param theirsRev - the server revision
   * @returns the stored record, null when removed
   */
  protected async rebaseAndApply(
    record: LocalRecord,
    theirs: any | null,
    theirsRev: number
  ): Promise<LocalRecord | null> {
    const rebased = rebase(record, theirs, theirsRev, this.client.options.versioning);
    if (rebased === null) {
      await this.storage.deleteRecords([record.id]);
      this.client.notify({ ref: record.ref, object: null, origin: "remote" });
      return null;
    }
    return this.client.applyConflictStrategy(rebased);
  }

  /**
   * @param ref - evicted reference
   */
  protected async evict(ref: SyncRef): Promise<void> {
    const id = refId(ref);
    const record = await this.storage.getRecord(id);
    if (record?.state !== "synced") return;
    await this.storage.deleteRecords([id]);
    this.client.notify({ ref, object: null, origin: "remote" });
  }

  /**
   * Snapshot every scope, drop synced records no scope returned
   */
  protected async resync(): Promise<void> {
    const scopes = await this.client.getScopes();
    const seen = new Set<string>();
    for (const scope of scopes) {
      let continuationToken: string | undefined;
      do {
        const page = await this.transport.snapshot({ scope, continuationToken });
        for (const object of page.objects) await this.upsert(object, seen);
        continuationToken = page.continuationToken;
      } while (continuationToken);
    }
    for (const model of new Set(scopes.map(s => s.model))) {
      for (const record of await this.storage.scan(model)) {
        if (record.state === "synced" && !seen.has(record.id)) await this.evict(record.ref);
      }
    }
  }

  /**
   * Pull until the server has nothing more
   */
  async pull(): Promise<void> {
    const scopes = await this.client.getScopes();
    if (scopes.length === 0) return;
    let cursor = (await this.storage.getMeta<string>("cursor")) ?? null;
    for (let page = 0; page < 10000; page++) {
      const res = await this.transport.pull({ scopes, cursor });
      if (res.resync) {
        await this.resync();
        cursor = res.cursor;
        await this.storage.setMeta("cursor", cursor);
        continue;
      }
      for (const synced of res.upserts) await this.upsert(synced);
      for (const ref of res.evicts) await this.evict(ref);
      cursor = res.cursor;
      await this.storage.setMeta("cursor", cursor);
      if (!res.hasMore) return;
    }
  }
}
