import { Command } from "@webda/core";
import type { MigratableStore } from "@webda/core";
import { SQLStore, SQLStoreParameters } from "@webda/sql";
import type { SQLClient, SQLDialect } from "@webda/sql";
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
    return this.handle?.client;
  }

  /**
   * @returns the shared database handle, undefined while the store is not initialized
   */
  getHandle(): SQLiteHandle | undefined {
    return this.handle;
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
