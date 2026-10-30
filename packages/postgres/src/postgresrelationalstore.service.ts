import { Command, SecretString, WebdaError, useApplication, useModelMetadata } from "@webda/core";
import type { ModelClass, RawTable } from "@webda/core";
import { AsyncMutex, RelationalRepository, RelationalSchemaManager, runTransaction } from "@webda/sql";
import type { SQLClient, SchemaSyncMode } from "@webda/sql";
import type { RelationalSchemaPlan, SchemaModelMetadata } from "@webda/sql-schema";
import pg, { ClientConfig, PoolConfig } from "pg";
import { PostgresParameters, PostgresStore } from "./postgresstore.service.js";
import { PostgresRelationalDialect } from "./relational/dialect.js";

/**
 * Parameters of the relational store: those of {@link PostgresStore} plus the schema layout and lifecycle
 */
export class PostgresRelationalParameters extends PostgresParameters {
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
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    if (this.table) {
      throw new WebdaError.CodeError(
        "RELATIONAL_SHARED_TABLE",
        "A relational store has one typed table per model: `table` is not supported, use `tables` for names"
      );
    }
    this.schemaSync ??= "create";
    this.columnNaming ??= "preserve";
    this.extraColumn ??= "_extra";
    this.foreignKeys ??= true;
    this.numericAsDecimal ??= false;
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
  protected readonly schemaManager: RelationalSchemaManager = new RelationalSchemaManager({
    name: this.getName(),
    dialect: this.dialect as PostgresRelationalDialect,
    layout: {
      tables: this.parameters.tables,
      columnNaming: this.parameters.columnNaming,
      extraColumn: this.parameters.extraColumn,
      foreignKeys: this.parameters.foreignKeys,
      numericAsDecimal: this.parameters.numericAsDecimal
    },
    log: (level, message) => this.log(level, message)
  });
  /**
   * Serializes the transactions of a single (not pooled) connection
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
    if (this.getName() === "Registry") {
      throw new WebdaError.CodeError(
        "RELATIONAL_STORE_AS_REGISTRY",
        "The Registry cannot be a Webda/PostgresRelationalStore: use Webda/PostgresStore (JSONB) or another schemaless store"
      );
    }
    return this;
  }

  /**
   * @returns the metadata of the models of the store, subclasses included
   */
  protected planModels(): SchemaModelMetadata[] {
    return Object.keys(this._modelsHierarchy ?? {}).map(id => useModelMetadata(id) as SchemaModelMetadata);
  }

  /**
   * The relational plan of the store, built once from the model metadata
   * @returns the plan
   */
  getSchemaPlan(): RelationalSchemaPlan {
    if (this.schemaManager.plan) {
      return this.schemaManager.plan;
    }
    const known = Object.values(useApplication().getModels())
      .map((model: any) => model?.Metadata as SchemaModelMetadata | undefined)
      .filter((meta): meta is SchemaModelMetadata => !!meta?.Identifier);
    return this.schemaManager.build(this.planModels(), known);
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
   * Run statements in one transaction: on its own pooled connection, or serialized on the single client
   * @param fn - the statements
   * @returns the function result
   */
  transact<R>(fn: (tx: SQLClient) => Promise<R>): Promise<R> {
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
    this.getSchemaPlan();
    await this.withConnection(client => this.schemaManager.sync(client, this.parameters.schemaSync!));
  }

  /**
   * The DDL ran at init
   * @override
   */
  async ensureTable(): Promise<void> {}

  /** @override */
  resolveTable(model: ModelClass): string {
    return this.getSchemaPlan().models[useModelMetadata(model)?.Identifier]?.table ?? super.resolveTable(model);
  }

  /** @override */
  resolveTableModel(model: ModelClass): string | undefined {
    const identifier = useModelMetadata(model)?.Identifier;
    return (identifier && this.schemaManager.tableOf(identifier)?.root) ?? super.resolveTableModel(model);
  }

  /** @override */
  protected createRepository<T extends ModelClass>(
    model: T,
    _table: string,
    _tableModel: string | undefined
  ): RelationalRepository<T> {
    const meta = useModelMetadata(model);
    const plan = this.getSchemaPlan();
    const table = this.schemaManager.tableOf(meta.Identifier);
    if (!table) {
      throw new WebdaError.CodeError(
        "MODEL_NOT_PLANNED",
        `${meta.Identifier} is not stored by ${this.getName()}: list it in the store models`
      );
    }
    return new RelationalRepository<T>(model, meta.PrimaryKey, {
      plan,
      table,
      client: () => this.client,
      transact: fn => this.transact(fn),
      dialect: this.dialect as PostgresRelationalDialect,
      separator: meta.PrimaryKeySeparator,
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
    const dialect = this.dialect as PostgresRelationalDialect;
    for (const table of [...this.getSchemaPlan().tables].reverse()) {
      await this.client.query(`DELETE FROM ${dialect.quote(table.name)}`);
    }
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
    const plan = this.getSchemaPlan();
    if (json) {
      console.log(JSON.stringify(plan, undefined, 2));
      return 0;
    }
    if (sql) {
      console.log(this.schemaManager.createStatements().join(";\n") + ";");
      return 0;
    }
    if (diff) {
      const client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig | PoolConfig));
      await client.connect();
      try {
        const result = await this.schemaManager.diff(client);
        for (const statement of result.statements) {
          console.log(`${statement};`);
        }
        for (const drift of result.drift) {
          console.log(`-- ${drift.message}`);
        }
        if (!result.statements.length && !result.drift.length) {
          console.log("-- database matches the plan");
        }
        return result.drift.length ? 1 : 0;
      } finally {
        await client.end();
      }
    }
    for (const table of plan.tables) {
      console.log(`${table.name}: ${table.columns.map(c => c.name).join(", ")}`);
    }
    return 0;
  }
}

export default PostgresRelationalStore;
