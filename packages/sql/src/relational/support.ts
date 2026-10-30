import { WebdaError, useApplication, useModelMetadata } from "@webda/core";
import type { ModelClass } from "@webda/core";
import type { RelationalSchemaPlan, SchemaModelMetadata } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import type { RelationalDialect, SchemaStep } from "./dialect.js";
import { RelationalSchemaManager } from "./manager.js";
import { RelationalRepository } from "./repository.js";
import type { SchemaSyncMode } from "./sync.js";
import type { AsyncMutex, Transact } from "./transaction.js";

/**
 * Parameters every relational store exposes on top of its engine parameters
 */
export interface RelationalLayoutParameters {
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
   * Store JSON `number` fields as decimals instead of doubles
   * @default false
   */
  numericAsDecimal?: boolean;
  /**
   * Per-model table name overrides: lowercase identifiers
   */
  tables?: { [modelIdentifier: string]: string };
  /**
   * One shared table (the JSON stores): refused by a relational store
   */
  table?: string;
}

/**
 * Defaults and checks of the relational parameters, called from the `load()` of the engine parameters
 * @param params - the parameters, after the engine `load()` (which sets `tables`)
 * @throws WebdaError.CodeError `RELATIONAL_SHARED_TABLE` when `table` is set, `RELATIONAL_TABLE_NAME` when an
 *   override is not a lowercase identifier
 */
export function loadRelationalParameters(params: RelationalLayoutParameters): void {
  if (params.table) {
    throw new WebdaError.CodeError(
      "RELATIONAL_SHARED_TABLE",
      "A relational store has one typed table per model: `table` is not supported, use `tables` for names"
    );
  }
  for (const [model, table] of Object.entries(params.tables!)) {
    // Written quoted in the relational statements and unquoted in the shared ones: only a plain identifier fits both
    if (!/^[a-z_][a-z0-9_]*$/.test(table)) {
      throw new WebdaError.CodeError(
        "RELATIONAL_TABLE_NAME",
        `Table name '${table}' for ${model} must be a lowercase identifier ([a-z_][a-z0-9_]*)`
      );
    }
  }
  params.schemaSync ??= "create";
  params.columnNaming ??= "preserve";
  params.extraColumn ??= "_extra";
  params.foreignKeys ??= true;
  params.numericAsDecimal ??= false;
}

/**
 * A client whose statements run one at a time under the mutex of the transactions: on a single connection a plain
 * write never lands inside another caller's transaction
 * @param client - the connection
 * @param mutex - the mutex the transactions take
 * @returns the serialized client
 */
export function serializedClient(client: SQLClient, mutex: AsyncMutex): SQLClient {
  return { query: (q, values) => mutex.run(() => client.query(q, values)) };
}

/**
 * What the support reads from the store
 */
export interface RelationalStoreHost {
  getName(): string;
  log(level: any, ...args: any[]): void;
  getParameters(): RelationalLayoutParameters;
  /**
   * The models of the store with their hierarchy depth, built at resolve time by `Store`
   */
  readonly _modelsHierarchy: { [identifier: string]: number };
}

/**
 * The engine-neutral behavior of a relational store, used by composition by each engine store: builds the plan from
 * the store models, syncs the schema at init, resolves tables, creates the repositories, prints the schema command
 */
export class RelationalStoreSupport {
  readonly manager: RelationalSchemaManager;

  /**
   * @param host - the store
   * @param dialect - its relational dialect
   */
  constructor(
    protected readonly host: RelationalStoreHost,
    readonly dialect: RelationalDialect
  ) {
    const parameters = host.getParameters();
    this.manager = new RelationalSchemaManager({
      name: host.getName(),
      dialect,
      layout: {
        tables: parameters.tables,
        columnNaming: parameters.columnNaming,
        extraColumn: parameters.extraColumn,
        foreignKeys: parameters.foreignKeys,
        numericAsDecimal: parameters.numericAsDecimal
      },
      log: (level, message) => host.log(level, message)
    });
  }

  /**
   * The Registry must accept any model: a typed schema cannot be the catch-all store
   * @param alternative - the JSON store of the engine, for the message
   * @throws WebdaError.CodeError `RELATIONAL_STORE_AS_REGISTRY`
   */
  refuseRegistry(alternative: string): void {
    if (this.host.getName() === "Registry") {
      throw new WebdaError.CodeError(
        "RELATIONAL_STORE_AS_REGISTRY",
        `The Registry cannot be a relational store: use ${alternative} or another schemaless store`
      );
    }
  }

  /**
   * The relational plan of the store, built once from the metadata of its models (subclasses included); every
   * application model is known so references to other stores get a column without foreign key
   * @returns the plan
   */
  getSchemaPlan(): RelationalSchemaPlan {
    if (this.manager.plan) {
      return this.manager.plan;
    }
    const models = Object.keys(this.host._modelsHierarchy).map(id => useModelMetadata(id) as SchemaModelMetadata);
    const known = Object.values(useApplication().getModels())
      .map((model: any) => model?.Metadata as SchemaModelMetadata | undefined)
      .filter((meta): meta is SchemaModelMetadata => !!meta?.Identifier);
    return this.manager.build(models, known);
  }

  /**
   * Bring the database to the plan (`schemaSync`)
   * @param client - a client whose statements run on one connection
   * @returns the applied steps
   */
  async sync(client: SQLClient): Promise<SchemaStep[]> {
    this.getSchemaPlan();
    return this.manager.sync(client, this.host.getParameters().schemaSync!);
  }

  /**
   * @param model - a model class
   * @returns its table, undefined when the model is not in the plan
   */
  resolveTable(model: ModelClass): string | undefined {
    return this.getSchemaPlan().models[useModelMetadata(model)?.Identifier]?.table;
  }

  /**
   * @param model - a model class
   * @returns the model its table was declared for, undefined when the model is not in the plan
   */
  resolveTableModel(model: ModelClass): string | undefined {
    return this.manager.tableOf(useModelMetadata(model).Identifier)?.root;
  }

  /**
   * @param model - a model class
   * @param options - the connection of the store
   * @param options.client - the client, or a function returning the store's current one
   * @param options.transact - runs statements in one transaction on one connection
   * @param options.prepare - awaited before every statement
   * @returns the repository
   * @throws WebdaError.CodeError `MODEL_NOT_PLANNED` when the model is not stored by this store
   */
  createRepository<T extends ModelClass>(
    model: T,
    options: { client: () => SQLClient | undefined; transact: Transact; prepare?: () => Promise<void> }
  ): RelationalRepository<T> {
    const meta = useModelMetadata(model);
    const plan = this.getSchemaPlan();
    const table = this.manager.tableOf(meta.Identifier);
    if (!table) {
      throw new WebdaError.CodeError(
        "MODEL_NOT_PLANNED",
        `${meta.Identifier} is not stored by ${this.host.getName()}: list it in the store models`
      );
    }
    return new RelationalRepository<T>(model, meta.PrimaryKey, {
      plan,
      table,
      client: options.client,
      transact: options.transact,
      dialect: this.dialect,
      separator: meta.PrimaryKeySeparator,
      prepare: options.prepare
    });
  }

  /**
   * @returns the statements emptying every table of the plan, junctions and referencing tables first
   */
  cleanStatements(): string[] {
    return [...this.getSchemaPlan().tables].reverse().map(table => `DELETE FROM ${this.dialect.quote(table.name)}`);
  }

  /**
   * The `schema` command: print the plan, its DDL or the differences with the database
   * @param sql - print the `CREATE` statements of the whole plan
   * @param diff - connect and print the statements `alter` would run, then the differences it never resolves
   * @param json - print the plan as JSON
   * @param connect - opens a connection for `diff`
   * @returns 0, 1 when `diff` found differences the store cannot resolve
   */
  async schemaCommand(
    sql: boolean,
    diff: boolean,
    json: boolean,
    connect: () => Promise<{ client: SQLClient; close: () => Promise<void> }>
  ): Promise<number> {
    const plan = this.getSchemaPlan();
    if (json) {
      console.log(JSON.stringify(plan, undefined, 2));
      return 0;
    }
    if (sql) {
      console.log(this.manager.createStatements().join(";\n") + ";");
      return 0;
    }
    if (diff) {
      const { client, close } = await connect();
      try {
        const result = await this.manager.diff(client);
        for (const statement of result.statements) {
          console.log(`${statement};`);
        }
        for (const d of result.drift) {
          console.log(`-- ${d.message}`);
        }
        if (!result.statements.length && !result.drift.length) {
          console.log("-- database matches the plan");
        }
        return result.drift.length ? 1 : 0;
      } finally {
        await close();
      }
    }
    for (const table of plan.tables) {
      console.log(`${table.name}: ${table.columns.map(c => c.name).join(", ")}`);
    }
    return 0;
  }
}
