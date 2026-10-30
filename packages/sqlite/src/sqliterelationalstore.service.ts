import { Command } from "@webda/core";
import type { ModelClass, RawTable } from "@webda/core";
import { RelationalStoreSupport, loadRelationalParameters, runTransaction, serializedClient } from "@webda/sql";
import type { RelationalLayoutParameters, RelationalRepository, SQLClient, SchemaSyncMode } from "@webda/sql";
import type { RelationalSchemaPlan } from "@webda/sql-schema";
import { acquireDatabase, releaseDatabase } from "./dbregistry.js";
import { SQLiteRelationalDialect } from "./relational/dialect.js";
import { SQLiteStore, SQLiteStoreParameters } from "./sqlitestore.service.js";

/**
 * Parameters of the relational store: those of {@link SQLiteStore} plus the schema layout and lifecycle
 */
export class SQLiteRelationalParameters extends SQLiteStoreParameters implements RelationalLayoutParameters {
  /**
   * What `init()` does with the database schema
   *
   * - `none`: nothing
   * - `create`: create the missing tables, with their indexes and inline foreign keys
   * - `alter`: `create`, plus add the missing columns and indexes of the existing tables (SQLite cannot add a
   *   foreign key to an existing table: it is reported)
   * - `validate`: write nothing, fail when anything is missing or differs
   * @default "create"
   */
  schemaSync?: SchemaSyncMode;
  /**
   * `preserve` keeps the field names as column names (quoted camelCase), `snake_case` converts them
   * @default "preserve"
   */
  columnNaming?: "preserve" | "snake_case";
  /**
   * JSON column keeping the properties the model schema does not declare, `false` to refuse them
   * @default "_extra"
   */
  extraColumn?: string | false;
  /**
   * Declare the foreign key constraints between the tables of the store
   * @default true
   */
  foreignKeys?: boolean;
  /**
   * Declare JSON `number` fields as `DECIMAL` instead of `REAL`
   * @default false
   */
  numericAsDecimal?: boolean;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    loadRelationalParameters(this);
    return this;
  }
}

/**
 * Store models in typed SQLite tables: one column per field, primary and foreign keys (`PRAGMA foreign_keys` is
 * enabled on the database), junction tables for the link collections, indexes, generated from the model metadata by
 * `@webda/sql-schema`
 *
 * The models are listed explicitly (`models`): the store never takes the fallback role of the `Registry`. The schema
 * is created or extended at `init()` (`schemaSync`), never destructively.
 *
 * @WebdaModda
 */
export class SQLiteRelationalStore<
  K extends SQLiteRelationalParameters = SQLiteRelationalParameters
> extends SQLiteStore<K> {
  protected readonly relational = new RelationalStoreSupport(this, this.dialect as SQLiteRelationalDialect);

  /** @override */
  protected createDialect(): SQLiteRelationalDialect {
    return new SQLiteRelationalDialect();
  }

  /**
   * The Registry must accept any model: a typed schema cannot be the catch-all store
   * @override
   */
  resolve(): this {
    super.resolve();
    this.relational.refuseRegistry("Webda/SQLiteStore (JSON)");
    return this;
  }

  /**
   * The relational plan of the store, built once from the model metadata
   * @returns the plan
   */
  getSchemaPlan(): RelationalSchemaPlan {
    return this.relational.getSchemaPlan();
  }

  /**
   * Every statement of the single connection runs under the lock of the transactions
   * @returns the client, undefined while the store is not connected
   */
  protected statementClient(): SQLClient | undefined {
    return this.handle ? serializedClient(this.handle.client, this.handle.mutex) : undefined;
  }

  /**
   * Run statements in one transaction, serialized on the database handle
   * @param fn - the statements
   * @returns the function result
   */
  transact<R>(fn: (tx: SQLClient) => Promise<R>): Promise<R> {
    const handle = this.handle!;
    return handle.mutex.run(() => runTransaction(handle.client, fn));
  }

  /**
   * Enable the foreign keys of the database, then bring it to the plan (`schemaSync`), once at init
   * @override
   */
  async checkTable(): Promise<void> {
    const handle = this.handle!;
    await handle.mutex.run(async () => {
      // Ignored by SQLite while a transaction is open on the connection: run it under the lock
      handle.db.exec("PRAGMA foreign_keys = ON");
      return this.relational.sync(handle.client);
    });
  }

  /**
   * The DDL ran at init
   * @override
   */
  async ensureTable(): Promise<void> {}

  /** @override */
  resolveTable(model: ModelClass): string {
    return this.relational.resolveTable(model) ?? super.resolveTable(model);
  }

  /** @override */
  resolveTableModel(model: ModelClass): string | undefined {
    return this.relational.resolveTableModel(model) ?? super.resolveTableModel(model);
  }

  /** @override */
  protected createRepository<T extends ModelClass>(
    model: T,
    _table: string,
    _tableModel: string | undefined
  ): RelationalRepository<T> {
    return this.relational.createRepository(model, {
      client: () => this.statementClient(),
      transact: fn => this.transact(fn),
      prepare: () => this.ensureTable()
    });
  }

  /**
   * No Webda 3 JSON rows in a relational table
   * @override
   */
  getRawTables(): RawTable[] {
    return [];
  }

  /**
   * Delete every row of every table of the plan (tests)
   * @override
   */
  async __clean(): Promise<void> {
    for (const statement of this.relational.cleanStatements()) {
      await this.getClient()!.query(statement);
    }
  }

  /**
   * Print the relational schema plan, its DDL or the differences with the database
   * @param sql - print the `CREATE` statements of the whole plan
   * @param diff - open the database and print the statements `alter` would run, then the differences it never resolves
   * @param json - print the plan as JSON
   * @returns 0, 1 when `diff` found differences the store cannot resolve
   */
  @Command("sqlite schema", {
    description: "Print the relational schema plan, its DDL or the diff with the database",
    phase: "resolved"
  })
  async schema(
    /** @description Print the CREATE statements of the plan */
    sql: boolean = false,
    /** @description Open the database and print what schemaSync alter would run, and the drift it never resolves */
    diff: boolean = false,
    /** @description Print the plan as JSON */
    json: boolean = false
  ): Promise<number> {
    return this.relational.schemaCommand(sql, diff, json, async () => {
      const handle = await acquireDatabase(this.parameters, this.getName());
      return { client: handle.client, close: async () => releaseDatabase(handle) };
    });
  }
}

export default SQLiteRelationalStore;
