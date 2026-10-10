import { CoreModel } from "@webda/core";

/**
 * One write to a synced object, read by `Sync.Pull`
 *
 * Internal: never exposed through the DomainService operations
 * @WebdaModel
 * @WebdaPlural SyncChanges
 */
export class SyncChange extends CoreModel {
  /**
   * Sortable sequence: zero-padded epoch ms, per-process counter, instance id
   */
  seq: string;
  /**
   * Model identifier, e.g. `MyApp/Task`
   */
  subjectModel: string;
  /**
   * Canonical primary key (`serializeSubjectKey`)
   */
  subjectKey: string;
  /**
   * Revision after the write, when known
   */
  rev?: number;
  /**
   * Kind of write
   */
  op: "upsert" | "delete";
  /**
   * Mutation of a `Sync.Push` that made the write
   */
  mutationId?: string;
  /**
   * Time of the write
   */
  timestamp: Date;

  /**
   * The change log is never reachable by clients
   * @returns the refusal reason
   */
  static canAct(): string {
    return "SyncChange is internal";
  }
}
