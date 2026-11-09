/**
 * Wire types shared by the SyncService and the OfflineClient.
 *
 * This module has no runtime dependency: the server and the client both import it.
 */

/**
 * A sync scope: the objects of `model` matching the WebdaQL filter `query` (all of them when omitted)
 */
export interface SyncScope {
  /**
   * Model
   */
  model: string;
  /**
   * Query
   */
  query?: string;
}

/**
 * Reference to one object: model identifier and canonical key (see {@link serializeKey})
 */
export interface SyncRef {
  /**
   * Model
   */
  model: string;
  /**
   * Key
   */
  key: string;
}

/**
 * An object as sent by the server
 */
export interface SyncedObject {
  /**
   * Ref
   */
  ref: SyncRef;
  /**
   * Rev
   */
  rev: number;
  /**
   * Object
   */
  object: any;
}

/**
 * Pull request interface
 */
export interface PullRequest {
  /**
   * Scopes
   */
  scopes: SyncScope[];
  /** Cursor of the previous pull, absent for the first one */
  cursor?: string;
  /**
   * Limit
   */
  limit?: number;
}

/**
 * Pull response interface
 */
export interface PullResponse {
  /**
   * Upserts
   */
  upserts: SyncedObject[];
  /**
   * Evicts
   */
  evicts: SyncRef[];
  /**
   * Cursor
   */
  cursor: string;
  /**
   * Whether to has more
   */
  hasMore: boolean;
  /**
   * The cursor is missing or older than the retention: snapshot every scope, then pull from `cursor`
   */
  resync?: boolean;
}

/**
 * Snapshot request interface
 */
export interface SnapshotRequest {
  /**
   * Scope
   */
  scope: SyncScope;
  /**
   * Continuation token
   */
  continuationToken?: string;
}

/**
 * Snapshot response interface
 */
export interface SnapshotResponse {
  /**
   * Objects
   */
  objects: SyncedObject[];
  /**
   * Continuation token
   */
  continuationToken?: string;
}

/**
 * Mutation interface
 */
export interface Mutation {
  /**
   * Client-generated id, kept across retries so a replayed mutation is answered `ok`
   */
  mutationId: string;
  /**
   * Ref
   */
  ref: SyncRef;
  /**
   * Revision the change was made on, 0 for a create
   */
  baseRev: number;
  /**
   * Op
   */
  op: "create" | "patch" | "delete";
  /**
   * The full object for "create", a `@webda/versioning` Delta for "patch"
   */
  patch?: any;
}

/**
 * Push request interface
 */
export interface PushRequest {
  /**
   * Mutations
   */
  mutations: Mutation[];
}

/**
 * Mutation result type definition
 */
export type MutationResult =
  | { mutationId: string; status: "ok"; rev: number; object?: any }
  | { mutationId: string; status: "conflict"; rev: number; object: any | null }
  | { mutationId: string; status: "rejected"; error: { code: string; message: string } };

/**
 * Push response interface
 */
export interface PushResponse {
  /**
   * Results
   */
  results: MutationResult[];
}

/**
 * Watch request interface
 */
export interface WatchRequest {
  /**
   * Scopes
   */
  scopes: SyncScope[];
  /**
   * Cursor
   */
  cursor?: string;
}

/**
 * Watch event interface
 */
export interface WatchEvent {
  /**
   * Cursor
   */
  cursor: string;
  /**
   * Keep-alive of an idle watch: clients must not pull on it
   */
  heartbeat?: boolean;
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
