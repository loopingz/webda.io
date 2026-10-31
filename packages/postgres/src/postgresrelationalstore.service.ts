import { Command, SecretString } from "@webda/core";
import type { ModelClass, RawTable } from "@webda/core";
import {
  AsyncMutex,
  RelationalStoreSupport,
  loadRelationalParameters,
  runTransaction,
  serializedClient
} from "@webda/sql";
import type { RelationalLayoutParameters, RelationalRepository, SQLClient, SchemaSyncMode } from "@webda/sql";
import type { RelationalSchemaPlan } from "@webda/sql-schema";
import pg, { ClientConfig, PoolConfig } from "pg";
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
   * Store JSON `number` fields as `NUMERIC` instead of `DOUBLE PRECISION`
   * @default false
   */
  numericAsDecimal?: boolean;

  /**
   * Version of the application recorded in the `Webda/SchemaVersion` registry
   * @default the version of package.json
   */
  appVersion?: string;
  /**
   * Elements whose blocking changes against a live version are accepted (`<table>`, `<table>.<column>`, `<model>`
   * or `<model>.<attribute>`): the `BLOCK` becomes a `WARN` and the version records it in `forced`
   * @default []
   */
  allowIncompatible?: string[];
  /**
   * Seconds between two heartbeats of the version in the registry, 0 for none
   * @default 60
   */
  versionHeartbeat?: number;
  /**
   * Seconds after its last heartbeat a version still counts as live
   * @default 600
   */
  versionTtl?: number;

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
   * A schema refused by the live versions or an unreachable registry stops the application
   * @override
   */
  async init(): Promise<this> {
    try {
      return await super.init();
    } catch (err) {
      throw this.relational.initError(err);
    }
  }

  /**
   * Stop the version heartbeat
   * @override
   */
  async stop(): Promise<void> {
    this.relational.stop();
    await super.stop();
  }

  /**
   * Bring the database to the plan (`schemaSync`), once at init: under the advisory lock, the live versions are read
   * from the registry and checked, the DDL runs, this version is registered
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
   * Delete every row of every table of the plan (tests)
   * @override
   */
  async __clean(): Promise<void> {
    for (const statement of this.relational.cleanStatements()) {
      await this.client.query(statement);
    }
  }

  /**
   * Print the relational schema plan, its DDL or the differences with the database
   * @param sql - print the `CREATE` statements of the whole plan
   * @param diff - connect and print the statements `alter` would run, then the differences it never resolves
   * @param json - print the plan as JSON
   * @returns 0, 1 when `diff` found differences the store cannot resolve
   */
  @Command("postgres schema show", {
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
  /**
   * Compare the plan with the live versions of the registry (CI: fail before deploy, not at startup)
   * @param against - compare with one version (identifier, application version or plan hash) instead of the live ones
   * @param forceIncompatible - downgrade every blocking change to a warning
   * @param json - print the changes as JSON
   * @returns 0, 1 when a change blocks, 2 when `against` matches no version
   */
  @Command("postgres schema check", {
    description: "Compare the schema plan with the live application versions",
    phase: "resolved"
  })
  async schemaCheck(
    /** @description Compare with one version (identifier, application version or plan hash) */
    against?: string,
    /** @description Downgrade every blocking change to a warning */
    forceIncompatible: boolean = false,
    /** @description Print the changes as JSON */
    json: boolean = false
  ): Promise<number> {
    return this.relational.checkCommand(against, forceIncompatible, json);
  }

  /**
   * Apply (or print) what no live version uses any more: drop the unused columns and tables, `SET NOT NULL` where
   * every live version requires the field and no row is null, validate the foreign keys. Never run by `init()`
   * @param dryRun - print the statements without running them
   * @returns 0
   */
  @Command("postgres schema contract", {
    description: "Drop what no live version uses, set NOT NULL where every live version requires it",
    phase: "resolved"
  })
  async schemaContract(
    /** @description Print the statements without running them */
    dryRun: boolean = false
  ): Promise<number> {
    return this.relational.contractCommand(dryRun, async () => {
      const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig | PoolConfig));
      await client.connect();
      return { client, close: () => client.end() };
    });
  }

  /**
   * Retire a version: it no longer counts for the compatibility checks and the contract phase
   * @param version - its identifier, application version or plan hash
   * @returns 0, 1 when no version matches
   */
  @Command("postgres schema retire", {
    description: "Retire an application version from the schema registry",
    phase: "resolved"
  })
  async schemaRetire(
    /** @description Identifier, application version or plan hash of the version */
    version: string
  ): Promise<number> {
    return this.relational.retireCommand(version);
  }

  /**
   * Copy a column into another one where the target is null (the expand step of a rename or a type change)
   * @param table - the table
   * @param from - the source column
   * @param to - the target column
   * @param batch - rows per statement
   * @returns 0
   */
  @Command("postgres schema backfill", {
    description: "Copy a column into another one, by batches",
    phase: "resolved"
  })
  async schemaBackfill(
    /** @description The table */
    table: string,
    /** @description The source column */
    from: string,
    /** @description The target column */
    to: string,
    /** @description Rows per statement */
    batch: number = 1000
  ): Promise<number> {
    return this.relational.backfillCommand(table, from, to, batch, async () => {
      const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig | PoolConfig));
      await client.connect();
      return { client, close: () => client.end() };
    });
  }
}

export default PostgresRelationalStore;
