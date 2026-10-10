/**
 * Wire types shared by the SyncService and the OfflineClient.
 *
 * This module has no runtime dependency: the server and the client both import it.
 */

/**
 * A sync scope: the objects of `model` matching the WebdaQL filter `query` (all of them when omitted)
 */
export interface SyncScope {
  model: string;
  query?: string;
}

/**
 * Reference to one object: model identifier and canonical key (see {@link serializeKey})
 */
export interface SyncRef {
  model: string;
  key: string;
}

/**
 * An object as sent by the server
 */
export interface SyncedObject {
  ref: SyncRef;
  rev: number;
  object: any;
}

export interface PullRequest {
  scopes: SyncScope[];
  cursor?: string | null;
  limit?: number;
}

export interface PullResponse {
  upserts: SyncedObject[];
  evicts: SyncRef[];
  cursor: string;
  hasMore: boolean;
  /**
   * The cursor is missing or older than the retention: snapshot every scope, then pull from `cursor`
   */
  resync?: boolean;
}

export interface SnapshotRequest {
  scope: SyncScope;
  continuationToken?: string;
}

export interface SnapshotResponse {
  objects: SyncedObject[];
  continuationToken?: string;
}

export interface Mutation {
  /**
   * Client-generated id, kept across retries so a replayed mutation is answered `ok`
   */
  mutationId: string;
  ref: SyncRef;
  /**
   * Revision the change was made on, 0 for a create
   */
  baseRev: number;
  op: "create" | "patch" | "delete";
  /**
   * The full object for "create", a `@webda/versioning` Delta for "patch"
   */
  patch?: any;
}

export interface PushRequest {
  mutations: Mutation[];
}

export type MutationResult =
  | { mutationId: string; status: "ok"; rev: number; object?: any }
  | { mutationId: string; status: "conflict"; rev: number; object: any | null }
  | { mutationId: string; status: "rejected"; error: { code: string; message: string } };

export interface PushResponse {
  results: MutationResult[];
}

export interface WatchRequest {
  scopes: SyncScope[];
  cursor?: string;
}

export interface WatchEvent {
  cursor: string;
}

/**
 * Canonical string of a primary key, identical to `serializeSubjectKey` in `@webda/core`:
 * a single-field key is its string value, a composite key the JSON array of its field values in `pkFields` order.
 * @param pkFields - the model primary key fields
 * @param key - a scalar key or an object holding the key fields
 * @returns the canonical key, or undefined when a field is missing
 */
export function serializeKey(pkFields: readonly string[], key: unknown): string | undefined {
  if (key === undefined || key === null) {
    return undefined;
  }
  if (pkFields.length <= 1) {
    const value = typeof key === "object" ? (key as any)[pkFields[0] ?? "uuid"] : key;
    return value === undefined || value === null ? undefined : String(value);
  }
  if (typeof key !== "object") {
    return undefined;
  }
  const values = pkFields.map(field => (key as any)[field]);
  if (values.some(value => value === undefined || value === null)) {
    return undefined;
  }
  return JSON.stringify(values.map(value => String(value)));
}

/**
 * Storage identifier of a reference
 * @param ref - the reference
 * @returns `<model>|<key>`
 */
export function refId(ref: SyncRef): string {
  return `${ref.model}|${ref.key}`;
}
