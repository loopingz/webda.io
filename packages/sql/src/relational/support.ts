import { Store, WebdaError, useApplication, useCore, useModelMetadata } from "@webda/core";
import type { ModelClass } from "@webda/core";
import { blockingChanges } from "@webda/sql-schema";
import type { LiveSchemaPlan, RelationalSchemaPlan, SchemaChange, SchemaModelMetadata } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import { describeContractStep } from "./contract.js";
import type { RelationalDialect, SchemaStep } from "./dialect.js";
import { RelationalSchemaManager } from "./manager.js";
import { RelationalRepository } from "./repository.js";
import type { SchemaVersion } from "./schemaversion.model.js";
import type { SchemaSyncMode } from "./sync.js";
import type { AsyncMutex, Transact } from "./transaction.js";
import {
  SCHEMA_VERSION_MODEL,
  SchemaIncompatibleError,
  SchemaRegistryError,
  SchemaVersionRegistry,
  describeChange
} from "./versions.js";

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
  params.allowIncompatible ??= [];
  params.versionHeartbeat ??= 60;
  params.versionTtl ??= 600;
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
   * The versions of the store in the `Registry`
   */
  readonly versions: SchemaVersionRegistry;
  /**
   * The steps the last `sync` applied
   */
  appliedSteps: SchemaStep[] = [];
  /**
   * The changes the last check found against the live versions
   */
  changes: SchemaChange[] = [];
  /**
   * The entry of this version in the registry, once registered
   */
  version?: SchemaVersion;
  protected heartbeat?: NodeJS.Timeout;

  /**
   * @param host - the store
   * @param dialect - its relational dialect
   */
  constructor(
    protected readonly host: RelationalStoreHost,
    readonly dialect: RelationalDialect
  ) {
    const parameters = host.getParameters();
    // The registry defaults, for a store whose parameters did not go through loadRelationalParameters
    parameters.allowIncompatible ??= [];
    parameters.versionHeartbeat ??= 60;
    parameters.versionTtl ??= 600;
    const log = (level: "WARN" | "INFO" | "DEBUG", message: string) => host.log(level, message);
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
      log
    });
    this.versions = new SchemaVersionRegistry({
      store: host.getName(),
      ttl: parameters.versionTtl! * 1000,
      log
    });
  }

  /**
   * The Registry must accept any model: a typed schema cannot be the catch-all store. The store depends on the
   * Registry (its version registry), so the Registry is initialized first
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
    useCore().getService("Registry");
  }

  /**
   * The version of the application this store records
   * @returns the version
   */
  appVersion(): string {
    return SchemaVersionRegistry.appVersion(this.host.getParameters().appVersion);
  }

  /**
   * Read the live versions of the registry and compare the plan with theirs
   * @returns the plans of the live versions
   * @throws SchemaIncompatibleError when a change blocks
   * @throws SchemaRegistryError when the registry cannot be read: `init` fails closed
   */
  async checkVersions(): Promise<LiveSchemaPlan[]> {
    const plan = this.getSchemaPlan();
    if (this.versions.isInMemory()) {
      this.host.log(
        "WARN",
        `${this.host.getName()}: the Registry is in memory, the schema versions of other processes are invisible: multi-version checks are limited to this process`
      );
    }
    const { live, changes } = await this.versions.check(plan, this.host.getParameters().allowIncompatible);
    this.changes = changes;
    return live.map(v => ({ version: v.appVersion, plan: v.plan }));
  }

  /**
   * Record this version as live and start its heartbeat
   * @throws SchemaRegistryError when the registry cannot be written
   */
  async registerVersion(): Promise<void> {
    const forced = [
      ...new Set(
        this.changes
          .filter(c => c.forced)
          .map(c =>
            c.table ? [c.table, c.column].filter(Boolean).join(".") : [c.model, c.attribute].filter(Boolean).join(".")
          )
      )
    ];
    this.version = await this.versions.register(this.appVersion(), this.getSchemaPlan(), forced);
    this.host.log(
      "INFO",
      `${this.host.getName()}: version ${this.version.appVersion} (${this.version.planHash.slice(0, 12)}) registered`
    );
    const seconds = this.host.getParameters().versionHeartbeat!;
    this.stop();
    if (seconds > 0) {
      this.heartbeat = setInterval(() => {
        this.versions
          .heartbeat(this.version!)
          .catch(err => this.host.log("WARN", `${this.host.getName()}: heartbeat failed: ${err.message}`));
      }, seconds * 1000);
      this.heartbeat.unref();
    }
  }

  /**
   * Stop the heartbeat
   */
  stop(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = undefined;
    }
  }

  /**
   * The error `init` fails with: a schema refused by the live versions or an unreachable registry stops the
   * application (`FatalInitError`), anything else is returned as is
   * @param err - the error of `init`
   * @returns the error to throw
   */
  initError(err: unknown): unknown {
    if (err instanceof SchemaIncompatibleError || err instanceof SchemaRegistryError) {
      return new WebdaError.FatalInitError(err.message, { cause: err });
    }
    return err;
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
    if (this.host._modelsHierarchy[SCHEMA_VERSION_MODEL] !== undefined) {
      throw new WebdaError.CodeError(
        "RELATIONAL_SCHEMA_VERSION_MODEL",
        `${SCHEMA_VERSION_MODEL} is the version registry of the relational stores: it stays in a schemaless store`
      );
    }
    const models = Object.keys(this.host._modelsHierarchy).map(id => useModelMetadata(id) as SchemaModelMetadata);
    const known = Object.values(useApplication().getModels())
      .map((model: any) => model?.Metadata as SchemaModelMetadata | undefined)
      .filter((meta): meta is SchemaModelMetadata => !!meta?.Identifier);
    return this.manager.build(models, known);
  }

  /**
   * Bring the database to the plan (`schemaSync`) under the version registry: lock, read the live versions, check,
   * DDL, register this version, unlock. A store whose registry may share the connection (SQLite) runs
   * {@link checkVersions} and {@link registerVersion} itself, around the lock, and gives the live plans here
   * @param client - a client whose statements run on one connection
   * @param live - the plans of the live versions when the store checked them already
   * @returns the applied steps
   */
  async sync(client: SQLClient, live?: LiveSchemaPlan[]): Promise<SchemaStep[]> {
    this.getSchemaPlan();
    this.appliedSteps = await this.manager.sync(
      client,
      this.host.getParameters().schemaSync!,
      live ? { live } : { check: () => this.checkVersions(), register: () => this.registerVersion() }
    );
    return this.appliedSteps;
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
   * @param diff - connect and print the statements `alter` would run, then the differences it never resolves (the
   *   columns of the live versions are not differences)
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
      await this.readyRegistry();
      const live = (await this.versions.live()).map(v => ({ version: v.appVersion, plan: v.plan }));
      const { client, close } = await connect();
      try {
        const result = await this.manager.diff(client, live);
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

  /**
   * The registry, readable from a `resolved` command: the repositories are computed and the `Registry` store is
   * initialized when it is not running yet
   */
  protected async readyRegistry(): Promise<void> {
    Store.computeStores();
    const registry = useCore().getService<Store>("Registry");
    if (registry.getState() !== "running") {
      await registry.init();
    }
  }

  /**
   * The `schema check` command: compare the plan with the live versions (or one version) and print the changes
   * @param against - an identifier, application version or plan hash to compare with, instead of the live versions
   * @param forceIncompatible - downgrade every blocking change to a warning
   * @param json - print the changes as JSON
   * @returns 0, 1 when a change blocks, 2 when `against` matches no version
   */
  async checkCommand(against: string | undefined, forceIncompatible: boolean, json: boolean): Promise<number> {
    await this.readyRegistry();
    const plan = this.getSchemaPlan();
    const versions = against ? await this.versions.find(against) : await this.versions.live();
    if (against && !versions.length) {
      console.log(`-- no version matches ${against}`);
      return 2;
    }
    const allowed = this.host.getParameters().allowIncompatible!;
    let changes = this.versions.compare(plan, versions, allowed);
    if (forceIncompatible) {
      changes = changes.map(c => (c.category === "BLOCK" ? { ...c, category: "WARN", forced: true } : c));
    }
    if (json) {
      console.log(
        JSON.stringify({ appVersion: this.appVersion(), live: versions.map(v => v.uuid), changes }, undefined, 2)
      );
    } else {
      console.log(
        `-- ${this.host.getName()} ${this.appVersion()} against ${versions.length ? versions.map(v => `${v.appVersion} (${v.planHash.slice(0, 12)}, ${v.status})`).join(", ") : "no live version"}`
      );
      for (const change of changes) {
        console.log(describeChange(change));
      }
      if (!changes.length) {
        console.log("-- no change");
      }
    }
    return blockingChanges(changes).length ? 1 : 0;
  }

  /**
   * The `schema contract` command: what no live version uses any more, printed or applied
   * @param dryRun - print the statements without running them
   * @param connect - opens a connection
   * @returns 0
   */
  async contractCommand(
    dryRun: boolean,
    connect: () => Promise<{ client: SQLClient; close: () => Promise<void> }>
  ): Promise<number> {
    await this.readyRegistry();
    const plan = this.getSchemaPlan();
    const all = await this.versions.all();
    const live: LiveSchemaPlan[] = [{ version: this.appVersion(), plan }];
    const retired: RelationalSchemaPlan[] = [];
    for (const version of all) {
      if (version.isLive(this.versions.options.ttl)) {
        live.push({ version: version.appVersion, plan: version.plan });
      } else {
        retired.push(version.plan);
      }
    }
    const { client, close } = await connect();
    try {
      const steps = await this.manager.contract(client, live, retired);
      console.log(
        `-- live: ${[...new Set(live.map(l => l.version))].join(", ")}; retired or expired: ${retired.length} version(s)`
      );
      if (!steps.length) {
        console.log("-- nothing to contract");
        return 0;
      }
      if (dryRun) {
        for (const { step, statements } of steps) {
          console.log(`-- ${describeContractStep(step)}`);
          for (const statement of statements) {
            console.log(`${statement};`);
          }
          if (!statements.length) {
            console.log(`-- not supported by this engine`);
          }
        }
        return 0;
      }
      const applied = await this.manager.applyContract(client, steps);
      console.log(`-- applied ${applied.length} of ${steps.length} step(s)`);
      return 0;
    } finally {
      await close();
    }
  }

  /**
   * The `schema retire` command: mark a version retired
   * @param version - an identifier, application version or plan hash
   * @returns 0, 1 when no version matches
   */
  async retireCommand(version: string): Promise<number> {
    await this.readyRegistry();
    const retired = await this.versions.retire(version);
    for (const v of retired) {
      console.log(`retired ${v.uuid}`);
    }
    if (!retired.length) {
      console.log(`-- no version matches ${version}`);
      return 1;
    }
    return 0;
  }

  /**
   * The `schema backfill` command: copy a column into another one
   * @param table - the table
   * @param from - the source column
   * @param to - the target column
   * @param batch - rows per statement
   * @param connect - opens a connection
   * @returns 0
   */
  async backfillCommand(
    table: string,
    from: string,
    to: string,
    batch: number,
    connect: () => Promise<{ client: SQLClient; close: () => Promise<void> }>
  ): Promise<number> {
    this.getSchemaPlan();
    const { client, close } = await connect();
    try {
      const rows = await this.manager.backfill(client, table, from, to, batch);
      console.log(`-- ${rows} row(s) of ${table}.${to} filled from ${from}`);
      return 0;
    } finally {
      await close();
    }
  }
}
