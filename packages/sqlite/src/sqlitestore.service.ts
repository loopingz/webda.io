import { Command, useOperationTransaction, WebdaError } from "@webda/core";
import type { MigratableStore } from "@webda/core";
import { SQLStore, SQLStoreParameters, serializedClient } from "@webda/sql";
import type { SQLClient, SQLDialect, SQLTransactionConnection, SQLTransactionState } from "@webda/sql";
import type { SQLiteConnectionParameters, SQLitePersistence } from "./connection.js";
import { acquireDatabase, releaseDatabase } from "./dbregistry.js";
import type { SQLiteHandle } from "./dbregistry.js";
import { SQLiteDialect } from "./dialect.js";

/**
 * Parameters of SQLiteStore: the SQLStore tables plus the shared SQLite connection parameters
 */
export class SQLiteStoreParameters extends SQLStoreParameters implements SQLiteConnectionParameters {
  /**
   * Omitted: in-memory database, lost on stop() (like MemoryStore without persistence)
   * Set: file database, every committed write is durable
   */
  persistence?: SQLitePersistence;
  /**
   * PRAGMA busy_timeout in ms
   * @default 5000
   */
  busyTimeout?: number;
  /**
   * Extra PRAGMAs run on open, e.g. { cache_size: -64000 }
   */
  pragmas?: Record<string, string | number>;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    this.busyTimeout ??= 5000;
    return this;
  }
}

/**
 * Store models as JSON documents inside a SQLite database (in memory, or in a file with `persistence.path`), using
 * Node's built-in node:sqlite (Node >= 22.13)
 *
 * `DatabaseSync` is synchronous: each statement blocks the event loop. Fits development, tests, CLI tools and small
 * single-node applications; use PostgresStore for heavy concurrent traffic.
 *
 * With `transaction: "operation"`, the services of a database share its single connection: an open transaction holds
 * it until the operation ends, the statements of the other async chains wait (transactions are serialized) and the
 * services of the same database used by the operation (another store, a SQLiteQueue) take part in its transaction.
 *
 * @WebdaModda
 */
export class SQLiteStore<K extends SQLiteStoreParameters = SQLiteStoreParameters>
  extends SQLStore<K>
  implements MigratableStore
{
  protected handle?: SQLiteHandle;

  /**
   * @override
   */
  protected createDialect(): SQLDialect {
    return new SQLiteDialect();
  }

  /**
   * @returns the client, undefined while the store is not initialized
   */
  getClient(): SQLClient | undefined {
    // Every statement of the handle goes through its mutex: a relational store transaction on the same database never
    // has another service's statement land inside it
    return this.handle ? serializedClient(this.handle.client, this.handle.mutex) : undefined;
  }

  /**
   * @returns the shared database handle, undefined while the store is not initialized
   */
  getHandle(): SQLiteHandle | undefined {
    return this.handle;
  }

  /**
   * One transaction per database: the stores sharing it share the transaction
   * @override
   */
  protected transactionKey(): string {
    return `sql.tx.sqlite:${this.handle?.key ?? this.getName()}`;
  }

  /**
   * Hold the shared connection for the transaction and BEGIN on it
   *
   * `BEGIN IMMEDIATE` takes the write lock at once (a deferred transaction upgrading later could fail with
   * SQLITE_BUSY against another process); a read-only database begins a deferred transaction.
   * @param state - the transaction state the connection is opened for
   * @override
   */
  protected async openTransaction(state: SQLTransactionState): Promise<SQLTransactionConnection> {
    const handle = this.handle;
    if (!handle) {
      throw new WebdaError.CodeError("SQLITE_NOT_INITIALIZED", `SQLiteStore ${this.getName()} is not initialized`);
    }
    const key = this.transactionKey();
    const release = await handle.client.acquireExclusive(() => useOperationTransaction()?.get(key) === state);
    try {
      handle.db.exec(handle.readOnly ? "BEGIN" : "BEGIN IMMEDIATE");
    } catch (err) {
      release();
      throw err;
    }
    return {
      client: handle.client,
      commit: async () => {
        handle.db.exec("COMMIT");
      },
      rollback: async () => {
        // A failed COMMIT may have ended the transaction already (isTransaction exists from Node 22.16)
        if ((handle.db as { isTransaction?: boolean }).isTransaction !== false) {
          handle.db.exec("ROLLBACK");
        }
      },
      release: () => {
        release();
        // Wake the readers that skipped the rows of the transaction (SQLitePubSub)
        handle.events.emit("released");
      }
    };
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    this.handle = await acquireDatabase(this.parameters, this.getName());
    await this.checkTable();
    await super.init();
    return this;
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    if (this.handle) {
      releaseDatabase(this.handle);
      this.handle = undefined;
    }
    await super.stop();
  }

  /**
   * Rewrite the Webda 3 types of the store to their Webda 4 identifiers
   * @param dryRun - only count the rows to migrate, write nothing
   * @param batch - rows per page
   * @param allowUnknown - exit with 0 even when rows keep an unknown or ambiguous type
   * @returns the exit code
   */
  @Command("migrate", {
    description: "Rewrite the Webda 3 types of the stores to their Webda 4 identifiers",
    phase: "initialized"
  })
  async migrate(
    /** @description Only count the rows to migrate, write nothing */
    dryRun: boolean = false,
    /** @description Rows per page */
    batch: number = 500,
    /** @description Exit with 0 even when rows keep an unknown or ambiguous type */
    allowUnknown: boolean = false
  ): Promise<number> {
    return this.migrateCommand(dryRun, batch, allowUnknown);
  }
}

export default SQLiteStore;
