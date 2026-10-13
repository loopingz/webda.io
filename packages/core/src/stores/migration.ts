import type { ModelClass } from "@webda/models";
import * as WebdaError from "../errors/errors.js";

/**
 * A row as the backend stores it, read without type filter nor hydration
 */
export interface RawRow {
  /**
   * Table (collection) holding the row: the store name for single-storage stores (Memory, File)
   */
  table: string;
  /**
   * Storage key of the row
   */
  key: string;
  /**
   * Stored data, `__type` as stored. Rows written by Webda 4 Memory and File stores are serializer envelopes
   * `{ $serializer, value, __type }`; Webda 3 rows are plain objects.
   */
  data: Record<string, any>;
  /**
   * Set when the stored value is not a JSON object: `data` is then empty and the row cannot be patched
   */
  unreadable?: boolean;
}

/**
 * Top-level fields to set on a raw row
 */
export type RawPatch = Record<string, any>;

/**
 * A page of raw rows
 */
export interface RawPage {
  /**
   * Rows of the page
   */
  rows: RawRow[];
  /**
   * Token of the next page, undefined on the last one
   */
  continuationToken?: string;
}

/**
 * A table managed by a store
 */
export interface RawTable {
  /**
   * Table name, as used in reports
   */
  name: string;
  /**
   * Model owning the untyped rows of the table (the first model of the store or of the table)
   */
  root?: ModelClass;
}

/**
 * The store has no raw access yet: it cannot run migrations
 */
export class MigrationUnsupported extends WebdaError.CodeError {
  /**
   * @param store - the store name
   */
  constructor(store: string) {
    super("MIGRATION_UNSUPPORTED", `Store ${store} has no raw access: it cannot run migrations`);
  }
}

/**
 * Parse a value of a key/value storage as a raw row
 * @param table - table name
 * @param key - storage key
 * @param value - stored JSON string (or object, for old persistence files)
 * @returns the row, flagged unreadable when the value is not a JSON object
 */
export function parseRawValue(table: string, key: string, value: unknown): RawRow {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return { table, key, data: { ...(value as Record<string, any>) } };
  }
  if (typeof value === "string") {
    try {
      const data = JSON.parse(value);
      if (data !== null && typeof data === "object" && !Array.isArray(data)) {
        return { table, key, data };
      }
    } catch {
      // Not JSON: reported as unreadable below
    }
  }
  return { table, key, data: {}, unreadable: true };
}

/**
 * Read a page of a key/value storage, in key order
 *
 * The token is the last key of the page, so rows added or removed meanwhile do not shift the next page.
 * @param map - the storage
 * @param table - table name of the rows
 * @param batchSize - rows per page
 * @param token - token of the previous page
 * @returns the page
 */
export function mapRawPage(map: Map<string, any>, table: string, batchSize: number, token?: string): RawPage {
  const keys = [...map.keys()].sort();
  let start = 0;
  if (token !== undefined) {
    start = keys.findIndex(key => key > token);
    if (start < 0) start = keys.length;
  }
  const slice = keys.slice(start, start + batchSize);
  const rows: RawRow[] = [];
  for (const key of slice) {
    const value = map.get(key);
    if (value !== undefined) rows.push(parseRawValue(table, key, value));
  }
  return {
    rows,
    continuationToken: start + batchSize < keys.length ? slice[slice.length - 1] : undefined
  };
}

/**
 * Set top-level fields of a row of a key/value storage
 * @param map - the storage
 * @param key - storage key
 * @param patch - fields to set
 */
export function mapRawPatch(map: Map<string, any>, key: string, patch: RawPatch): void {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`Raw row not found: ${key}`);
  }
  const row = parseRawValue("", key, value);
  if (row.unreadable) {
    throw new Error(`Raw row ${key} is not a JSON object: it cannot be patched`);
  }
  map.set(key, JSON.stringify({ ...row.data, ...patch }));
}
