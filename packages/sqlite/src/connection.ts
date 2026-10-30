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
 *
 * The connection is shared by every service of the database: while a transaction holds it (see
 * {@link acquireExclusive}), the statements of the other async chains wait for its end instead of running inside it.
 */
export class SQLiteClient implements SQLClient {
  protected statements = new Map<string, StatementSync>();
  /**
   * The transaction holding the connection: `isOwner` tells whether the current async chain runs in it
   */
  protected exclusive?: { isOwner: () => boolean; released: Promise<void> };

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
   * SELECT / WITH / PRAGMA statements run with all(), the others with run(); the method is async to honor SQLClient
   *
   * The statement kind is read from its first keyword only: a value inlined in a WHERE clause can never change it.
   * Use {@link rows} for a write statement with a RETURNING clause.
   * @param sql - the statement
   * @param values - the parameters
   * @returns the rows, or the number of changed rows
   */
  async query(sql: string, values: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    // Checked again in the continuation that runs the statement: no other transaction can begin in between
    while (this.exclusive && !this.exclusive.isOwner()) {
      await this.exclusive.released;
    }
    if (/^\s*(SELECT|WITH|PRAGMA|EXPLAIN)\b/i.test(sql)) {
      const rows = await this.rows(sql, values);
      return { rows, rowCount: rows.length };
    }
    return {
      rows: [],
      rowCount: Number(this.run(sql, () => this.statement(sql).run(...values.map(bindable))).changes)
    };
  }

  /**
   * Run a statement returning rows, a write with a RETURNING clause included
   * @param sql - the statement
   * @param values - the parameters
   * @returns the rows
   */
  async rows(sql: string, values: any[] = []): Promise<any[]> {
    // Checked again in the continuation that runs the statement: no other transaction can begin in between
    while (this.exclusive && !this.exclusive.isOwner()) {
      await this.exclusive.released;
    }
    return this.run(sql, () => this.statement(sql).all(...values.map(bindable)));
  }

  /**
   * @returns true while a transaction holds the connection: reads on it may see uncommitted rows
   */
  isHeld(): boolean {
    return this.exclusive !== undefined;
  }

  /**
   * Hold the connection for a transaction: once the transactions of the other async chains ended, the statements of
   * the chains `isOwner` does not recognize wait until the returned release function is called
   * @param isOwner - whether the current async chain runs in the transaction
   * @returns the release function, to call once the transaction is committed or rolled back
   */
  async acquireExclusive(isOwner: () => boolean): Promise<() => void> {
    // Taken in the continuation that saw it free: two waiting transactions never both take it
    while (this.exclusive) {
      await this.exclusive.released;
    }
    let release!: () => void;
    const released = new Promise<void>(resolve => (release = resolve));
    const exclusive = { isOwner, released };
    this.exclusive = exclusive;
    return () => {
      if (this.exclusive === exclusive) {
        this.exclusive = undefined;
      }
      release();
    };
  }

  /**
   * Run a statement, translating the engine errors
   * @param sql - the statement
   * @param execute - the execution
   * @returns the execution result
   */
  protected run<R>(sql: string, execute: () => R): R {
    try {
      return execute();
    } catch (err: any) {
      if (err?.code === "ERR_SQLITE_ERROR" && err.errcode === READONLY) {
        throw new WebdaError.CodeError("SQLITE_READONLY", err.message);
      }
      throw err;
    }
  }
}
