import { WebdaError } from "@webda/core";
import type { SQLClient, SQLDatabase } from "@webda/sql";
import type { DatabaseSync, SQLInputValue, StatementSync } from "node:sqlite";

/** Same name and role as MemoryStoreParameters.persistence */
export interface SQLitePersistence {
  /**
   * Database file; relative paths resolve against the application directory
   */
  path: string;
  /**
   * PRAGMA journal_mode=WAL (concurrent readers across processes)
   * @default true
   */
  wal?: boolean;
  /**
   * PRAGMA synchronous
   * @default "NORMAL" with WAL, "FULL" otherwise
   */
  synchronous?: "OFF" | "NORMAL" | "FULL" | "EXTRA";
  /**
   * Open the file read-only: writes are rejected with a WebdaError
   * @default false
   */
  readOnly?: boolean;
}

/** Connection parameters shared by SQLiteStore, SQLiteQueue and SQLitePubSub */
export interface SQLiteConnectionParameters {
  /**
   * Omitted: in-memory database, lost on stop() (like MemoryStore without persistence)
   * Set: file database, every committed write is durable
   */
  persistence?: SQLitePersistence;
  /**
   * Services giving the same database name share one handle: one file, or one in-memory database inside the
   * process (e.g. store + queue + pubsub in a test)
   * @default { name: <service name> } in memory, { name: <resolved path> } with persistence
   */
  database?: SQLDatabase;
  /**
   * PRAGMA busy_timeout in ms
   * @default 5000
   */
  busyTimeout?: number;
  /**
   * Extra PRAGMAs run on open, e.g. { cache_size: -64000 }
   */
  pragmas?: Record<string, string | number>;
}

type SQLiteModule = typeof import("node:sqlite");
const defaultLoader = (): Promise<SQLiteModule> => import("node:sqlite");
let loader: () => Promise<SQLiteModule> = defaultLoader;

/**
 * Test-only: replace the node:sqlite loader
 * @param custom - the loader, undefined restores the default
 */
export function __setSQLiteLoader(custom?: () => Promise<SQLiteModule>): void {
  loader = custom ?? defaultLoader;
}

/**
 * Load node:sqlite lazily: importing @webda/sqlite never warns or fails, using it on an old Node does, clearly
 * @returns the module
 */
export async function loadSQLite(): Promise<SQLiteModule> {
  try {
    return await loader();
  } catch (err) {
    throw new WebdaError.CodeError(
      "SQLITE_UNAVAILABLE",
      `SQLite services require Node >= 22.13 (node:sqlite): ${(err as Error).message}`
    );
  }
}

/**
 * A value node:sqlite can bind: booleans as 1/0, dates as ISO text, objects as JSON text, undefined as NULL
 * @param value - the value
 * @returns the bindable value
 */
export function bindable(value: any): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && !(value instanceof Uint8Array)) return JSON.stringify(value);
  return value;
}

/** SQLITE_READONLY */
const READONLY = 8;

/**
 * Adapter of a DatabaseSync to the SQLClient interface, with a bounded prepared statement cache
 */
export class SQLiteClient implements SQLClient {
  protected statements = new Map<string, StatementSync>();

  /**
   * @param db - the open database
   * @param cacheSize - max prepared statements kept
   */
  constructor(
    public readonly db: DatabaseSync,
    protected readonly cacheSize: number = 256
  ) {}

  /**
   * @param sql - the statement
   * @returns the prepared statement, cached
   */
  protected statement(sql: string): StatementSync {
    let stmt = this.statements.get(sql);
    if (stmt) return stmt;
    stmt = this.db.prepare(sql);
    if (this.statements.size >= this.cacheSize) {
      this.statements.delete(this.statements.keys().next().value!);
    }
    this.statements.set(sql, stmt);
    return stmt;
  }

  /**
   * Statements returning rows run with all(), the others with run(); the method is async to honor SQLClient
   * @param sql - the statement
   * @param values - the parameters
   * @returns the rows, or the number of changed rows
   */
  async query(sql: string, values: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    const params = values.map(bindable);
    try {
      const stmt = this.statement(sql);
      if (/^\s*(SELECT|WITH|PRAGMA)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) {
        const rows = stmt.all(...params);
        return { rows, rowCount: rows.length };
      }
      return { rows: [], rowCount: Number(stmt.run(...params).changes) };
    } catch (err: any) {
      if (err?.code === "ERR_SQLITE_ERROR" && err.errcode === READONLY) {
        throw new WebdaError.CodeError("SQLITE_READONLY", err.message);
      }
      throw err;
    }
  }
}
