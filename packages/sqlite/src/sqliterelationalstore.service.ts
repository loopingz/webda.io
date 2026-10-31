import { Command, Store, WebdaError, useCore } from "@webda/core";
import type { ModelClass, RawTable } from "@webda/core";
import { RelationalStoreSupport, SQLStore, loadRelationalParameters, runTransaction } from "@webda/sql";
import type {
  ImportReport,
  RelationalLayoutParameters,
  RelationalRepository,
  SQLClient,
  SchemaSyncMode
} from "@webda/sql";
import type { RelationalSchemaPlan } from "@webda/sql-schema";
import { acquireDatabase, databaseKey, releaseDatabase } from "./dbregistry.js";
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
   * Also declare a foreign key to the `uuid` column of the JSON table of a model served by a `SQLiteStore` (the
   * `Registry`) on the same database with a table per model; the JSON table is created at `init()`
   * @default false
   */
  foreignKeysToJsonb?: boolean;
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
   * The JSON table of a model served by a `SQLiteStore` on the same database, with a table per model
   * (`foreignKeysToJsonb`)
   * @param store - the store serving the model
   * @param model - the model
   * @returns the table, undefined when no foreign key can reference it
   */
  jsonTableOf(store: Store, model: ModelClass): string | undefined {
    if (!(store instanceof SQLiteStore) || store instanceof SQLiteRelationalStore) {
      return undefined;
    }
    const parameters = store.getParameters();
    if (parameters.table || databaseKey(parameters, store.getName()) !== databaseKey(this.parameters, this.getName())) {
      return undefined;
    }
    return store.resolveTable(model);
  }

  /**
   * Run statements in one transaction: the transaction of the current async chain (an operation with
   * `transaction: "operation"`, `withTransaction`) when there is one, else a transaction of its own, serialized on
   * the database handle
   * @param fn - the statements
   * @returns the function result
   */
  transact<R>(fn: (tx: SQLClient) => Promise<R>): Promise<R> {
    const current = this.getTransactionClient();
    if (current) {
      return fn(current);
    }
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
      // The connection of the transaction of the current async chain, else the single connection under the lock
      client: () => this.getClient(),
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
   * Delete every row of every table of the plan (tests), in one transaction: the deferred foreign keys of a cycle
   * are checked once every row is gone
   * @override
   */
  async __clean(): Promise<void> {
    await this.transact(async tx => {
      for (const statement of this.relational.cleanStatements()) {
        await tx.query(statement);
      }
    });
  }

  /**
   * Promote models from a JSON store: their rows are imported in the relational tables in one transaction, then
   * deleted from the source when `purge` is set. The models must already be listed in `models`, and their relational
   * table must not be the JSON one (name one of them with `tables`)
   * @param source - the JSON store holding the rows
   * @param options - the models (every table root by default) and whether to purge the source
   * @param options.models - the model identifiers
   * @param options.purge - delete the imported rows from the source after the commit
   * @returns one report per model
   */
  async importFromJsonb(
    source: SQLStore<any>,
    options: { models?: string[]; purge?: boolean } = {}
  ): Promise<ImportReport[]> {
    return this.relational.importFromJson(source, {
      ...options,
      // The transaction of the async chain: the source, on the same database handle, reads inside it
      transact: fn => this.withTransaction(() => fn()),
      repository: model => (this.getRepository(model) as any).repository
    });
  }

  /**
   * Import the rows of models from a JSON store (`importFromJsonb`)
   * @param models - comma-separated model identifiers, every table root of the plan by default
   * @param source - the JSON store holding the rows
   * @param purge - delete the imported rows from the source once committed
   * @returns 0
   * @throws WebdaError.CodeError `RELATIONAL_IMPORT_SOURCE` when the source is not a `SQLiteStore`
   */
  @Command("sqlite import", {
    description: "Import the rows of models from a JSON SQLiteStore into the relational tables",
    phase: "initialized"
  })
  async import(
    /** @description Comma-separated model identifiers, every table root of the plan by default */
    models: string = "",
    /** @description The JSON store holding the rows */
    source: string = "Registry",
    /** @description Delete the imported rows from the source once committed */
    purge: boolean = false
  ): Promise<number> {
    const store = useCore().getService(source);
    if (!(store instanceof SQLStore)) {
      throw new WebdaError.CodeError("RELATIONAL_IMPORT_SOURCE", `${source} is not a SQL store`);
    }
    const reports = await this.importFromJsonb(store, {
      models: models
        .split(",")
        .map(m => m.trim())
        .filter(Boolean),
      purge
    });
    for (const report of reports) {
      console.log(`${report.model}: ${report.imported} imported, ${report.skipped} skipped`);
    }
    return 0;
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
