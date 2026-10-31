import { useApplication, WebdaError } from "@webda/core";
import { AsyncMutex } from "@webda/sql";
import { EventEmitter } from "node:events";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { loadSQLite, SQLiteClient } from "./connection.js";
import type { SQLiteConnectionParameters, SQLitePersistence } from "./connection.js";

/** One open database shared by the services using the same key */
export interface SQLiteHandle {
  key: string;
  db: DatabaseSync;
  client: SQLiteClient;
  /**
   * In-process notifications: `changed(table)` after a write by a service of this process
   */
  events: EventEmitter;
  /**
   * Serializes the transactions (and, for the relational stores, every statement) of the single connection
   */
  mutex: AsyncMutex;
  refCount: number;
  /**
   * Resolved file path, undefined in memory
   */
  path?: string;
  /**
   * Opened read-only
   */
  readOnly: boolean;
}

const registry = new Map<string, SQLiteHandle>();
const PRAGMA_NAME = /^[A-Za-z_]+$/;
const PRAGMA_VALUE = /^-?[A-Za-z0-9_]+$/;
const SYNCHRONOUS = ["OFF", "NORMAL", "FULL", "EXTRA"];

/**
 * Resolve a database path against the application directory (the working directory without an application)
 * @param path - the configured path
 * @returns the absolute path
 */
export function resolvePath(path: string): string {
  try {
    return useApplication().getPath(path);
  } catch {
    return resolve(path);
  }
}

/**
 * Registry key: an explicit database name, else the file path, else the service name in memory
 * @param params - the connection parameters
 * @param serviceName - the service name
 * @returns the key
 */
export function databaseKey(params: SQLiteConnectionParameters, serviceName: string): string {
  if (params.database?.name) return `name:${params.database.name}`;
  if (params.persistence?.path) return `file:${resolvePath(params.persistence.path)}`;
  return `memory:${serviceName}`;
}

/**
 * MemoryStore persistence options node:sqlite cannot honor: fail rather than pretend
 * @param persistence - the persistence block
 */
export function checkPersistence(persistence?: SQLitePersistence): void {
  for (const option of ["key", "cipher", "compressionLevel"]) {
    if (persistence && (persistence as any)[option] !== undefined) {
      throw new WebdaError.CodeError(
        "SQLITE_UNSUPPORTED_PERSISTENCE",
        `SQLite persistence does not support '${option}': node:sqlite has no encryption or compression`
      );
    }
  }
}

/**
 * Acquire (open or share) the database of the parameters; release it with releaseDatabase
 * @param params - the connection parameters
 * @param serviceName - the service name (default key in memory)
 * @returns the handle
 */
export async function acquireDatabase(params: SQLiteConnectionParameters, serviceName: string): Promise<SQLiteHandle> {
  checkPersistence(params.persistence);
  // Loaded before the lookup: everything after it is synchronous, so two concurrent acquires never both open
  const { DatabaseSync } = await loadSQLite();
  const key = databaseKey(params, serviceName);
  const path = params.persistence?.path ? resolvePath(params.persistence.path) : undefined;
  const readOnly = params.persistence?.readOnly ?? false;
  const existing = registry.get(key);
  if (existing) {
    if (existing.path !== path || existing.readOnly !== readOnly) {
      throw new WebdaError.CodeError(
        "SQLITE_CONFLICTING_DATABASE",
        `Database '${key}' is already open ${existing.path ? `on ${existing.path}` : "in memory"}${existing.readOnly ? " (read-only)" : ""}: ${serviceName} asks for ${path ?? "memory"}${readOnly ? " (read-only)" : ""}`
      );
    }
    existing.refCount++;
    return existing;
  }
  let db: DatabaseSync;
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    db = new DatabaseSync(path, { readOnly });
    if (!readOnly) {
      const wal = params.persistence!.wal !== false;
      const synchronous = params.persistence!.synchronous ?? (wal ? "NORMAL" : "FULL");
      if (!SYNCHRONOUS.includes(synchronous)) {
        db.close();
        throw new WebdaError.CodeError("SQLITE_INVALID_PARAMETER", `Invalid synchronous mode ${synchronous}`);
      }
      if (wal) db.exec("PRAGMA journal_mode = WAL");
      db.exec(`PRAGMA synchronous = ${synchronous}`);
    }
  } else {
    db = new DatabaseSync(":memory:");
  }
  db.exec(`PRAGMA busy_timeout = ${Math.max(0, Math.floor(Number(params.busyTimeout ?? 5000)))}`);
  for (const [name, value] of Object.entries(params.pragmas ?? {})) {
    if (!PRAGMA_NAME.test(name) || !PRAGMA_VALUE.test(String(value))) {
      db.close();
      throw new WebdaError.CodeError("SQLITE_INVALID_PARAMETER", `Invalid pragma ${name}=${value}`);
    }
    db.exec(`PRAGMA ${name} = ${value}`);
  }
  const handle: SQLiteHandle = {
    key,
    db,
    client: new SQLiteClient(db),
    events: new EventEmitter(),
    mutex: new AsyncMutex(),
    refCount: 1,
    path,
    readOnly
  };
  registry.set(key, handle);
  return handle;
}

/**
 * Release a handle: the database closes at the last release; unknown handles are ignored
 * @param handle - the handle
 */
export function releaseDatabase(handle: SQLiteHandle): void {
  const entry = registry.get(handle.key);
  if (!entry || entry !== handle) return;
  entry.refCount--;
  if (entry.refCount > 0) return;
  registry.delete(handle.key);
  handle.events.removeAllListeners();
  try {
    handle.db.close();
  } catch {
    /* already closed */
  }
}

/**
 * Test-only: close and forget every database
 */
export function __resetDatabases(): void {
  for (const handle of registry.values()) {
    handle.events.removeAllListeners();
    try {
      handle.db.close();
    } catch {
      /* already closed */
    }
  }
  registry.clear();
}
