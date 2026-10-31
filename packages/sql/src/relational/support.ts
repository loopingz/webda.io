import { Store, WebdaError, useApplication, useModel, useModelMetadata } from "@webda/core";
import type { ModelClass } from "@webda/core";
import type { ReferencedTable, RelationalSchemaPlan, SchemaModelMetadata } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import type { SQLStore } from "../store.js";
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
   * Also create a foreign key to the key column of the JSON table of a model served by a JSON store of the same
   * engine (the `Registry`) on the same database with a table per model; the JSON table is created with the schema
   * @default false
   */
  foreignKeysToJsonb?: boolean;
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
  params.foreignKeysToJsonb ??= false;
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
  /**
   * The JSON table of a model served by a JSON store of the same engine on the same database, with a table per
   * model (`foreignKeysToJsonb`)
   * @param store - the store serving the model
   * @param model - the model
   * @returns the table name, undefined when no foreign key can reference it
   */
  jsonTableOf?(store: Store, model: ModelClass): string | undefined;
}

/**
 * What an import from a JSON store reports, per model
 */
export interface ImportReport {
  model: string;
  /**
   * Rows written in the relational table
   */
  imported: number;
  /**
   * Rows left alone: their key already exists in the relational table
   */
  skipped: number;
}

/**
 * The engine-neutral behavior of a relational store, used by composition by each engine store: builds the plan from
 * the store models, syncs the schema at init, resolves tables, creates the repositories, prints the schema command
 */
export class RelationalStoreSupport {
  readonly manager: RelationalSchemaManager;
  /**
   * The JSON tables the plan references (`foreignKeysToJsonb`), created before the DDL
   */
  protected referencedTables: { [identifier: string]: ReferencedTable } = {};

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
    this.referencedTables = this.jsonTables(known);
    return this.manager.build(models, known, this.referencedTables);
  }

  /**
   * The JSON tables a foreign key may reference: those of the models outside the store served by a JSON store of
   * the same engine on the same database (`foreignKeysToJsonb`), keyed by their `uuid` column
   * @param known - every application model
   * @returns the tables by model identifier
   */
  protected jsonTables(known: SchemaModelMetadata[]): { [identifier: string]: ReferencedTable } {
    const parameters = this.host.getParameters();
    const tables: { [identifier: string]: ReferencedTable } = {};
    // The parameters may not have gone through loadRelationalParameters (tests): the defaults of the plan apply
    if (parameters.foreignKeys === false || !parameters.foreignKeysToJsonb || !this.host.jsonTableOf) {
      return tables;
    }
    for (const meta of known) {
      if (meta.Identifier in this.host._modelsHierarchy) {
        continue;
      }
      const model = useModel(meta.Identifier);
      const store = Store.storeOf(model);
      const table = store ? this.host.jsonTableOf(store, model) : undefined;
      if (table) {
        tables[meta.Identifier] = { table, columns: ["uuid"] };
      }
    }
    return tables;
  }

  /**
   * Bring the database to the plan (`schemaSync`): the JSON tables it references are created first, with the DDL of
   * their store
   * @param client - a client whose statements run on one connection
   * @returns the applied steps
   */
  async sync(client: SQLClient): Promise<SchemaStep[]> {
    this.getSchemaPlan();
    const mode = this.host.getParameters().schemaSync ?? "create";
    if (mode === "create" || mode === "alter") {
      for (const table of new Set(Object.values(this.referencedTables).map(r => r.table))) {
        await client.query(this.dialect.createTable(table));
      }
    }
    return this.manager.sync(client, mode);
  }

  /**
   * Promote models from a JSON store (`importFromJsonb`): their rows are read through the JSON repository of the
   * source, written through the relational repositories in one transaction (the deferred foreign keys let the links
   * between imported rows point in any direction), and deleted from the source once committed when `purge` is set.
   * A row whose key is already in the relational table is skipped. The models must already be listed by the store.
   * @param source - the JSON store holding the rows
   * @param options - what to import
   * @param options.models - the model identifiers, every table root of the plan by default
   * @param options.purge - delete the imported rows from the source after the commit
   * @param options.transact - runs the import in one transaction of the store: either one the repositories of the
   *   store join (the async chain transaction of `withTransaction`), or one on a connection it hands over
   * @param options.repository - the relational repository of a model: the store's own (inside its event wrapper),
   *   or one bound to the handed-over connection
   * @returns one report per model
   * @throws WebdaError.CodeError `RELATIONAL_IMPORT_SOURCE` when the source is this store or a relational store,
   *   `MODEL_NOT_PLANNED` for a model the store does not list, `RELATIONAL_IMPORT_TABLE` when the JSON table of a
   *   model is the relational one (name it differently with `tables`)
   */
  async importFromJson(
    source: SQLStore<any>,
    options: {
      models?: string[];
      purge?: boolean;
      transact: <R>(fn: (tx?: SQLClient) => Promise<R>) => Promise<R>;
      repository: (model: ModelClass, tx?: SQLClient) => RelationalRepository<any>;
    }
  ): Promise<ImportReport[]> {
    if ((source as unknown) === this.host || (source as any).relational instanceof RelationalStoreSupport) {
      throw new WebdaError.CodeError(
        "RELATIONAL_IMPORT_SOURCE",
        `${source.getName()} is not a JSON store: import from the JSON store the models were served by`
      );
    }
    const plan = this.getSchemaPlan();
    const roots = plan.tables.filter(t => t.root).map(t => t.root!);
    const models = options.models?.length ? options.models : roots;
    const targets = models.map(identifier => {
      const model = useModel(identifier);
      const table = this.manager.tableOf(identifier);
      if (!table) {
        throw new WebdaError.CodeError(
          "MODEL_NOT_PLANNED",
          `${identifier} is not stored by ${this.host.getName()}: list it in the store models before importing`
        );
      }
      if (source.resolveTable(model) === table.name) {
        throw new WebdaError.CodeError(
          "RELATIONAL_IMPORT_TABLE",
          `${identifier} is stored by ${source.getName()} in ${table.name}, the relational table: name one of them differently (tables)`
        );
      }
      return { identifier, model, order: plan.tables.indexOf(table) };
    });
    // Referenced tables first: the import then reads naturally in the logs, the transaction allows any order
    targets.sort((a, b) => a.order - b.order);
    const reports: ImportReport[] = [];
    let last: RelationalRepository<any> | undefined;
    await options
      .transact(async tx => {
        for (const { identifier, model } of targets) {
          const report: ImportReport = { model: identifier, imported: 0, skipped: 0 };
          const target = (last = options.repository(model, tx));
          for await (const item of source.getRepository(model).iterate("")) {
            if (await target.exists(item)) {
              report.skipped++;
              continue;
            }
            await target.create(item);
            report.imported++;
          }
          this.host.log(
            "INFO",
            `${identifier}: ${report.imported} row(s) imported from ${source.getName()}, ${report.skipped} skipped`
          );
          reports.push(report);
        }
      })
      .catch(err => {
        // A deferred foreign key fails at COMMIT: mapped like the statement's
        throw last ? last.mapError("INSERT", err) : err;
      });
    if (options.purge) {
      for (const { identifier, model } of targets) {
        const deleted = await source.getRepository(model).deleteMany("DELETE");
        this.host.log("INFO", `${identifier}: ${deleted} row(s) deleted from ${source.getName()}`);
      }
    }
    return reports;
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
