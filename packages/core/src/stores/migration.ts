import { getTypeResolver, type ModelClass, type ModelTypeResolver } from "@webda/models";
import * as WebdaError from "../errors/errors.js";
import { classifyStoredType, UNTYPED } from "../application/model-types.js";

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

/**
 * Counters a patcher fills for the report
 */
export interface MigrationContext {
  /**
   * Count a rewritten value under `"<from> → <to>"`
   * @param from - the stored value
   * @param to - the new value
   */
  change(from: string, to: string): void;
  /**
   * Count a row left untouched because its value is unknown or ambiguous
   * @param type - the stored value
   */
  unknown(type: string): void;
}

/**
 * Compute the patch of a raw row: undefined when the row is already migrated
 */
export type MigrationPatcher = (
  row: RawRow,
  context: MigrationContext
) => Promise<RawPatch | undefined> | RawPatch | undefined;

/**
 * Options of a migration run
 */
export interface MigrationOptions {
  /**
   * Rows per page
   *
   * @default 500
   */
  batchSize?: number;
  /**
   * Run the patchers and count, write nothing: no row, no progress, no lease
   */
  dryRun?: boolean;
  /**
   * Lease duration in ms, renewed every page
   *
   * @default 300000
   */
  leaseDuration?: number;
}

/**
 * Report of one table
 */
export interface MigrationTableReport {
  /** Rows read */
  scanned: number;
  /** Rows patched (to patch, in a dry run) */
  updated: number;
  /** Count by `"<from> → <to>"` */
  byChange: Record<string, number>;
  /** Untouched rows by stored value */
  unknown: Record<string, number>;
}

/**
 * Report of a migration run
 */
export interface MigrationReport {
  /** Store name */
  store: string;
  /** Migration name */
  name: string;
  /** Report by table */
  tables: Record<string, MigrationTableReport>;
  /** The run continued an interrupted one */
  resumed: boolean;
  /** Nothing was written */
  dryRun: boolean;
}

/**
 * Progress of a migration, stored in the Registry entry `storeMigration.<store>.<name>`
 */
export interface MigrationProgress {
  /** Token of the next page of `table` */
  continuationToken?: string;
  /** Table of the last saved page */
  table?: string;
  /** Rows read */
  scanned: number;
  /** Rows patched */
  updated: number;
  /** Rows left untouched (unknown or ambiguous) */
  unknown: number;
  /** The last run finished */
  done: boolean;
  /** Start of the run, epoch ms */
  startedAt: number;
  /** Last save, epoch ms */
  updatedAt: number;
  /** End of the lease, epoch ms; 0 when free */
  leaseUntil: number;
  /** Runner holding the lease */
  owner?: string;
  /** Report so far by table, so a resumed run ends with the same totals */
  tables: Record<string, MigrationTableReport>;
}

/**
 * A lease held by a runner
 */
export interface MigrationLease {
  /** Registry entry */
  id: string;
  /** Runner id */
  owner: string;
  /** End of the lease, epoch ms, as stored */
  leaseUntil: number;
  /** Lease duration, ms */
  leaseDuration: number;
  /** Progress as stored */
  progress: MigrationProgress;
}

/**
 * Default rows per page
 */
export const DEFAULT_MIGRATION_BATCH = 500;
/**
 * Default lease duration: 5 minutes
 */
export const DEFAULT_MIGRATION_LEASE = 5 * 60 * 1000;

/**
 * Another runner holds the lease of the migration
 */
export class MigrationAlreadyRunning extends WebdaError.CodeError {
  /**
   * @param id - registry entry
   * @param owner - runner holding the lease
   * @param until - end of its lease, epoch ms
   */
  constructor(id: string, owner: string | undefined, until: number) {
    super(
      "MIGRATION_ALREADY_RUNNING",
      `Migration ${id} is already running (runner ${owner ?? "unknown"}, lease until ${new Date(until).toISOString()})`
    );
  }
}

/**
 * Increment a counter
 * @param counts - the counters
 * @param key - the counter
 * @param n - the increment
 */
export function incrementCount(counts: Record<string, number>, key: string, n: number = 1): void {
  counts[key] = (counts[key] ?? 0) + n;
}

/**
 * @returns an empty table report
 */
export function emptyTableReport(): MigrationTableReport {
  return { scanned: 0, updated: 0, byChange: {}, unknown: {} };
}

/**
 * @returns the progress of a fresh run (the keys set to undefined clear a previous run when saved)
 */
export function emptyProgress(): MigrationProgress {
  const now = Date.now();
  return {
    table: undefined,
    continuationToken: undefined,
    scanned: 0,
    updated: 0,
    unknown: 0,
    done: false,
    startedAt: now,
    updatedAt: now,
    leaseUntil: 0,
    owner: undefined,
    tables: {}
  };
}

/**
 * Read a Registry entry as a progress
 * @param entry - the entry
 * @returns the progress
 */
export function toMigrationProgress(entry: any): MigrationProgress {
  return {
    continuationToken: entry?.continuationToken,
    table: entry?.table,
    scanned: entry?.scanned ?? 0,
    updated: entry?.updated ?? 0,
    unknown: entry?.unknown ?? 0,
    done: !!entry?.done,
    startedAt: entry?.startedAt ?? 0,
    updatedAt: entry?.updatedAt ?? 0,
    leaseUntil: Number(entry?.leaseUntil ?? 0),
    owner: entry?.owner,
    tables: entry?.tables ?? {}
  };
}

/**
 * Totals of a report, for the progress entry
 * @param report - the report
 * @returns the totals and the tables
 */
export function migrationTotals(report: MigrationReport): {
  scanned: number;
  updated: number;
  unknown: number;
  tables: Record<string, MigrationTableReport>;
} {
  let scanned = 0;
  let updated = 0;
  let unknown = 0;
  for (const table of Object.values(report.tables)) {
    scanned += table.scanned;
    updated += table.updated;
    unknown += Object.values(table.unknown).reduce((sum, n) => sum + n, 0);
  }
  return { scanned, updated, unknown, tables: report.tables };
}

/**
 * Entries of a record sorted by key, by UTF-16 code unit (the default sort order)
 * @param record - the record
 * @returns the entries
 */
function sortedEntries<V>(record: Record<string, V>): [string, V][] {
  return Object.keys(record)
    .sort()
    .map(key => [key, record[key]]);
}

/**
 * Human-readable report, one line per table and per change
 * @param report - the report
 * @param resolver - resolver telling unknown from ambiguous types
 * @returns the text
 */
export function formatMigrationReport(
  report: MigrationReport,
  resolver: ModelTypeResolver = getTypeResolver()
): string {
  const flags = [report.dryRun ? "dry run" : undefined, report.resumed ? "resumed" : undefined].filter(Boolean);
  const lines = [`Store ${report.store}: migration ${report.name}${flags.length ? ` (${flags.join(", ")})` : ""}`];
  for (const [table, tableReport] of Object.entries(report.tables)) {
    lines.push(
      `  ${table}: ${tableReport.scanned} scanned, ${tableReport.updated} ${report.dryRun ? "to update" : "updated"}`
    );
    for (const [change, n] of sortedEntries(tableReport.byChange)) {
      lines.push(`    ${change}: ${n}`);
    }
    for (const [type, n] of sortedEntries(tableReport.unknown)) {
      lines.push(`    ${resolver.resolve(type).status === "ambiguous" ? "ambiguous" : "unknown"} ${type}: ${n}`);
    }
  }
  return lines.join("\n");
}

/**
 * Read the rows of raw tables page by page, in table order, stopping after `maxRows` rows
 * @param pages - reads a page of a table (a store's `rawPages`)
 * @param tables - the tables to read
 * @param maxRows - the row limit
 * @param onRow - called for each row
 * @returns true when rows were left unread because of the limit
 */
export async function scanRawRows(
  pages: (table: string, batchSize: number, token?: string) => Promise<RawPage>,
  tables: RawTable[],
  maxRows: number,
  onRow: (row: RawRow) => void
): Promise<boolean> {
  let seen = 0;
  for (const [index, table] of tables.entries()) {
    let token: string | undefined;
    do {
      if (seen >= maxRows) return true;
      const page = await pages(table.name, Math.min(1000, maxRows - seen), token);
      for (const row of page.rows) {
        onRow(row);
        seen++;
      }
      token = page.continuationToken;
    } while (token);
    if (seen >= maxRows && index < tables.length - 1) return true;
  }
  return false;
}

/**
 * Default rows scanned by the startup type check of stores without a native count
 */
export const DEFAULT_TYPE_CHECK_ROWS = 10000;

/**
 * Count of rows by stored type, by table
 */
export interface StoredTypeCounts {
  /** Count by stored `__type` (`UNTYPED`, `UNREADABLE` included), by table */
  tables: Record<string, Record<string, number>>;
  /** The scan stopped at its row limit: counts are "at least" */
  truncated: boolean;
}

/**
 * Outcome of the startup type check
 */
export interface TypeCheckSummary {
  /** Rows with a legacy type */
  legacy: number;
  /** Untyped rows that would be stamped */
  untyped: number;
  /** Rows with an unknown, ambiguous or unreadable type */
  unknown: number;
  /** Counts are "at least" */
  truncated: boolean;
  /** WARN message, undefined when every row is current */
  message?: string;
}

/**
 * Summarize stored type counts into the startup WARN
 * @param store - store name
 * @param counts - the counts
 * @param roots - root model of each table
 * @param maxRows - the scan limit, for the message
 * @param resolver - the resolver
 * @returns the summary
 */
export function summarizeStoredTypes(
  store: string,
  counts: StoredTypeCounts,
  roots: Map<string, ModelClass | undefined>,
  maxRows: number,
  resolver: ModelTypeResolver = getTypeResolver()
): TypeCheckSummary {
  const summary: TypeCheckSummary = { legacy: 0, untyped: 0, unknown: 0, truncated: counts.truncated };
  const parts: string[] = [];
  for (const [table, types] of Object.entries(counts.tables)) {
    const entries: string[] = [];
    for (const [type, n] of sortedEntries(types)) {
      const kind = classifyStoredType(type === UNTYPED ? undefined : type, roots.get(table), resolver);
      if (kind.kind === "current" || (kind.kind === "untyped" && !kind.to)) continue;
      if (kind.kind === "legacy") {
        summary.legacy += n;
        entries.push(`'${type}' → ${kind.to}: ${n}`);
      } else if (kind.kind === "untyped") {
        summary.untyped += n;
        entries.push(`untyped → ${kind.to}: ${n}`);
      } else {
        summary.unknown += n;
        entries.push(`${kind.kind} '${type}': ${n}`);
      }
    }
    if (entries.length) parts.push(`${table} (${entries.join(", ")})`);
  }
  if (parts.length) {
    summary.message =
      `Store ${store} holds rows with legacy, untyped or unknown types: ${parts.join("; ")}` +
      `${counts.truncated ? ` — at least: the check stopped after ${maxRows} rows` : ""}. ` +
      "Run `webda migrate` to rewrite them.";
  }
  return summary;
}
