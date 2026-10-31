import { Command, SecretString, Store, WebdaError, useCore } from "@webda/core";
import type { ModelClass, RawTable } from "@webda/core";
import {
  AsyncMutex,
  RelationalStoreSupport,
  SQLStore,
  loadRelationalParameters,
  runTransaction,
  serializedClient
} from "@webda/sql";
import type {
  ImportReport,
  RelationalLayoutParameters,
  RelationalRepository,
  SQLClient,
  SchemaSyncMode
} from "@webda/sql";
import type { RelationalSchemaPlan } from "@webda/sql-schema";
import pg, { ClientConfig, PoolConfig } from "pg";
import { poolKey } from "./pgpool.js";
import { PostgresParameters, PostgresStore } from "./postgresstore.service.js";
import { PostgresRelationalDialect } from "./relational/dialect.js";

/**
 * Parameters of the relational store: those of {@link PostgresStore} plus the schema layout and lifecycle
 */
export class PostgresRelationalParameters extends PostgresParameters implements RelationalLayoutParameters {
  /**
   * What `init()` does with the database schema
   *
   * - `none`: nothing
   * - `create`: create the missing tables, with their indexes and foreign keys
   * - `alter`: `create`, plus add the missing columns, indexes and foreign keys of the existing tables (never drops,
   *   narrows or sets `NOT NULL`)
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
   * Create foreign key constraints between the tables of the store
   * @default true
   */
  foreignKeys?: boolean;
  /**
   * Also create a foreign key to the `uuid` column of the JSONB table of a model served by a `PostgresStore` (the
   * `Registry`) on the same server and database with a table per model; the JSONB table is created at `init()`
   * @default false
   */
  foreignKeysToJsonb?: boolean;
  /**
   * Store JSON `number` fields as `NUMERIC` instead of `DOUBLE PRECISION`
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
 * Store models in typed PostgreSQL tables: one column per field, primary and foreign keys, junction tables for the
 * link collections, indexes, generated from the model metadata by `@webda/sql-schema`
 *
 * The models are listed explicitly (`models`): the store never takes the fallback role of the `Registry`. The schema
 * is created or extended at `init()` (`schemaSync`), never destructively.
 *
 * @WebdaModda
 */
export class PostgresRelationalStore<
  K extends PostgresRelationalParameters = PostgresRelationalParameters
> extends PostgresStore<K> {
  protected readonly relational = new RelationalStoreSupport(this, this.dialect as PostgresRelationalDialect);
  /**
   * Serializes the statements and transactions of a single (not pooled) connection
   */
  protected readonly writeMutex = new AsyncMutex();

  /** @override */
  protected createDialect(): PostgresRelationalDialect {
    return new PostgresRelationalDialect();
  }

  /**
   * The Registry must accept any model: a typed schema cannot be the catch-all store
   * @override
   */
  resolve(): this {
    super.resolve();
    this.relational.refuseRegistry("Webda/PostgresStore (JSONB)");
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
   * The JSONB table of a model served by a `PostgresStore` on the same server and database, with a table per model
   * (`foreignKeysToJsonb`)
   * @param store - the store serving the model
   * @param model - the model
   * @returns the table, undefined when no foreign key can reference it
   */
  jsonTableOf(store: Store, model: ModelClass): string | undefined {
    if (!(store instanceof PostgresStore) || store instanceof PostgresRelationalStore) {
      return undefined;
    }
    const parameters = store.getParameters();
    if (parameters.table || poolKey(unwrapServer(parameters)) !== poolKey(unwrapServer(this.parameters))) {
      return undefined;
    }
    return store.resolveTable(model);
  }

  /**
   * Run statements on one connection: a connection of the pool, or the client
   * @param fn - the statements
   * @returns the function result
   */
  protected async withConnection<R>(fn: (client: SQLClient) => Promise<R>): Promise<R> {
    if (this.parameters.usePool) {
      const connection = await (this.client as pg.Pool).connect();
      try {
        return await fn(connection);
      } finally {
        connection.release();
      }
    }
    return fn(this.client);
  }

  /**
   * The client the repositories run their statements on: the connection of the transaction of the current async
   * chain (an operation with `transaction: "operation"`, `withTransaction`) when there is one, else the pool, or the
   * single client under the same lock as the transactions, so a plain write never lands inside another caller's
   * transaction
   * @returns the client, undefined while the store is not connected
   */
  protected statementClient(): SQLClient | undefined {
    const transaction = this.getTransactionClient();
    if (transaction) {
      return transaction;
    }
    const client = this.client;
    if (!client || this.parameters.usePool) {
      return client;
    }
    return serializedClient(client as SQLClient, this.writeMutex);
  }

  /**
   * Run statements in one transaction: the transaction of the current async chain when there is one, else one of
   * its own on a pooled connection, or serialized on the single client
   * @param fn - the statements
   * @returns the function result
   */
  transact<R>(fn: (tx: SQLClient) => Promise<R>): Promise<R> {
    const current = this.getTransactionClient();
    if (current) {
      return fn(current);
    }
    if (this.parameters.usePool) {
      return this.withConnection(connection => runTransaction(connection, fn));
    }
    return this.writeMutex.run(() => runTransaction(this.client, fn));
  }

  /**
   * Bring the database to the plan (`schemaSync`), once at init
   * @override
   */
  async checkTable(): Promise<void> {
    await this.withConnection(client => this.relational.sync(client));
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
   * Typed tables need no views
   * @override
   */
  async createViews(): Promise<void> {}

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
   * Promote models from a JSONB store: their rows are imported in the relational tables in one transaction, then
   * deleted from the source when `purge` is set. The models must already be listed in `models`, and their relational
   * table must not be the JSONB one (name one of them with `tables`)
   * @param source - the JSONB store holding the rows
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
      // A pool: the transaction of the async chain, joined by the repositories of the store. A single client: one
      // transaction on it, with repositories bound to it (the source reads on its own connection)
      transact: fn => (this.parameters.usePool ? this.withTransaction(() => fn()) : this.transact(fn)),
      repository: (model, tx) =>
        tx
          ? this.relational.createRepository(model, { client: () => tx, transact: fn => fn(tx) })
          : (this.getRepository(model) as any).repository
    });
  }

  /**
   * Import the rows of models from a JSONB store (`importFromJsonb`)
   * @param models - comma-separated model identifiers, every table root of the plan by default
   * @param source - the JSONB store holding the rows
   * @param purge - delete the imported rows from the source once committed
   * @returns 0
   * @throws WebdaError.CodeError `RELATIONAL_IMPORT_SOURCE` when the source is not a `PostgresStore`
   */
  @Command("postgres import", {
    description: "Import the rows of models from a JSONB PostgresStore into the relational tables",
    phase: "initialized"
  })
  async import(
    /** @description Comma-separated model identifiers, every table root of the plan by default */
    models: string = "",
    /** @description The JSONB store holding the rows */
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
   * @param diff - connect and print the statements `alter` would run, then the differences it never resolves
   * @param json - print the plan as JSON
   * @returns 0, 1 when `diff` found differences the store cannot resolve
   */
  @Command("postgres schema", {
    description: "Print the relational schema plan, its DDL or the diff with the database",
    phase: "resolved"
  })
  async schema(
    /** @description Print the CREATE statements of the plan */
    sql: boolean = false,
    /** @description Connect and print what schemaSync alter would run, and the drift it never resolves */
    diff: boolean = false,
    /** @description Print the plan as JSON */
    json: boolean = false
  ): Promise<number> {
    return this.relational.schemaCommand(sql, diff, json, async () => {
      const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig | PoolConfig));
      await client.connect();
      return { client, close: () => client.end() };
    });
  }
}

/**
 * @param parameters - store parameters
 * @returns the server configuration, secrets unwrapped, as the pool registry keys it
 */
function unwrapServer(parameters: PostgresParameters): PoolConfig | undefined {
  return SecretString.unwrap(parameters.postgresqlServer as PoolConfig | undefined);
}

export default PostgresRelationalStore;
