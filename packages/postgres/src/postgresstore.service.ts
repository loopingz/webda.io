import { Command, SecretString, useApplication, useCore, useModelMetadata, WebdaError } from "@webda/core";
import type { MigratableStore, ModelClass } from "@webda/core";
import type { SQLDialect, SQLTransactionConnection } from "@webda/sql";
import { JSONSchema7 } from "json-schema";
import pg, { ClientConfig, PoolConfig } from "pg";
import { PostgresDialect } from "./dialect.js";
import { acquirePool, releasePool } from "./pgpool.js";
import { PostgresRepository, SQLStore, SQLStoreParameters } from "./sqlstore.js";

/*
 * Ideas:
 *  - Make views for each models to have a better query: https://dba.stackexchange.com/questions/151838/postgresql-json-column-to-view
 *        - CREATE VIEW my_view AS SELECT uuid,data->>'status' as status from table;
 *            - could auto resolve FK
 *  - Use STORED generated model to define FK: https://stackoverflow.com/questions/24489647/json-foreign-keys-in-postgresql
 *  - FKs should be defined based on relationship
 *  - Define colums dynamically based on the schema -> benchmark to see if it is useful
 *  - Allow to define indexes on fields
 */

/**
 * Isolation levels of a PostgreSQL transaction (READ UNCOMMITTED behaves as READ COMMITTED in PostgreSQL)
 */
export type PostgresIsolationLevel = "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE";

const ISOLATION_LEVELS: PostgresIsolationLevel[] = ["READ COMMITTED", "REPEATABLE READ", "SERIALIZABLE"];

/**
 *
 */
export class PostgresParameters extends SQLStoreParameters {
  /**
   * Use a shared pool of connections rather than a single client: required by `transaction: "operation"`
   * @default false
   */
  usePool?: boolean;
  /**
   * By default use environment variables
   *
   * Can be encrypted with `webda config encrypt`
   * @secret password,connectionString
   */
  postgresqlServer?: ClientConfig | PoolConfig;
  /**
   * View name prefix
   * @default ""
   * @pattern /^[a-zA-Z_][a-zA-Z0-9_]*$/
   * @example "app_"
   * @example "v_"
   * @example "view_"
   */
  viewPrefix?: string;
  /**
   * Regexp patterns of model identifiers to include when generating views
   *
   * @default [".*"]
   */
  views?: string[];
  /**
   * Isolation level of the transactions (`transaction: "operation"` and `withTransaction`)
   * @default "READ COMMITTED"
   */
  transactionIsolation?: PostgresIsolationLevel;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    this.usePool ??= false;
    this.transactionIsolation ??= "READ COMMITTED";
    this.viewPrefix ??= "";
    this.views ??= [".*"];
    return this;
  }
}

/**
 * Store data within PostgreSQL with JSONB
 *
 * The table should be created before with
 *
 * ```sql
 * CREATE TABLE IF NOT EXISTS ${tableName}
 * (
 *   uuid uuid NOT NULL,
 *   data jsonb,
 *   CONSTRAINT ${tableName}_pkey PRIMARY KEY (uuid)
 * );
 * ```
 *
 * @WebdaModda
 */
export class PostgresStore<K extends PostgresParameters = PostgresParameters>
  extends SQLStore<K>
  implements MigratableStore
{
  client: pg.Client | pg.Pool;
  /**
   * True when {@link client} is a shared pool acquired from the registry.
   * Tracked so {@link stop} only releases pools it took a refcount on.
   */
  protected ownsPool = false;

  /**
   * @override
   */
  protected createDialect(): SQLDialect {
    return new PostgresDialect();
  }

  /**
   * @override
   */
  protected createRepository<T extends ModelClass>(
    model: T,
    table: string,
    tableModel: string | undefined
  ): PostgresRepository<T> {
    const meta = useModelMetadata(model);
    const repo: PostgresRepository<T> = new PostgresRepository<T>(
      model,
      meta.PrimaryKey,
      () => this.client,
      table,
      meta.PrimaryKeySeparator,
      () => this.ensureTable(repo),
      tableModel,
      () => this.getTransactionClient()
    );
    return repo;
  }

  /**
   * A transaction needs a connection of its own: a single shared client cannot run concurrent transactions
   * @override
   */
  protected checkTransactionSupport(): void {
    if (!this.parameters.usePool) {
      throw new WebdaError.CodeError(
        "POSTGRES_TRANSACTION_REQUIRES_POOL",
        `PostgresStore ${this.getName()}: transactions need "usePool": true, a single client cannot hold concurrent transactions`
      );
    }
  }

  /**
   * Check a pool connection out and BEGIN on it
   * @override
   */
  protected async openTransaction(): Promise<SQLTransactionConnection> {
    this.checkTransactionSupport();
    const client = await (this.client as pg.Pool).connect();
    // The pool only listens to the errors of its idle clients: without a listener, a connection lost while checked out
    // (server restart, terminated backend) would crash the process. The pending statement fails with it anyway.
    const onError = (err: Error) => this.log("WARN", "Transaction connection lost", err.message);
    client.on("error", onError);
    const release = (error?: unknown) => {
      client.off("error", onError);
      // An error destroys the connection rather than giving a possibly broken one back to the pool
      client.release(error ? (error instanceof Error ? error : true) : undefined);
    };
    try {
      await client.query(`BEGIN ISOLATION LEVEL ${this.getIsolationLevel()}`);
    } catch (err) {
      release(err);
      throw err;
    }
    this.log("TRACE", "Transaction begun", this.getIsolationLevel());
    return {
      client,
      commit: async () => {
        await client.query("COMMIT");
      },
      rollback: async () => {
        await client.query("ROLLBACK");
      },
      release
    };
  }

  /**
   * @returns the isolation level of the transactions, checked: it is written in the BEGIN statement
   * @throws WebdaError.CodeError for an unknown level
   */
  protected getIsolationLevel(): PostgresIsolationLevel {
    const level = this.parameters.transactionIsolation ?? "READ COMMITTED";
    if (!ISOLATION_LEVELS.includes(level)) {
      throw new WebdaError.CodeError(
        "POSTGRES_INVALID_PARAMETER",
        `Invalid transactionIsolation ${level}: one of ${ISOLATION_LEVELS.join(", ")}`
      );
    }
    return level;
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    this.getIsolationLevel();
    if (this.parameters.transaction === "operation") {
      this.checkTransactionSupport();
    }
    if (this.parameters.usePool) {
      this.client = acquirePool(this.parameters.postgresqlServer as PoolConfig);
      this.ownsPool = true;
    } else {
      this.client = new pg.Client(SecretString.unwrap(this.parameters.postgresqlServer as ClientConfig));
      await this.client.connect();
    }
    await this.checkTable();
    await super.init();
    return this;
  }

  /**
   * @override
   */
  async stop(): Promise<void> {
    if (this.ownsPool) {
      this.ownsPool = false;
      await releasePool(this.parameters.postgresqlServer as PoolConfig);
    } else if (this.client && "end" in this.client) {
      await (this.client as pg.Client).end().catch(() => {
        /* already ended */
      });
    }
    this.client = undefined as any;
    await super.stop();
  }

  /**
   * Return the postgresql client
   * @returns the pg client or pool
   */
  getClient() {
    return this.client;
  }

  /**
   * Return the underlying PostgresRepository for each model this store manages,
   * unwrapping the EventRepository produced by {@link getRepository}.
   * @returns the per-model PostgresRepository instances
   */
  getRepositories(): PostgresRepository<any>[] {
    return super.getRepositories() as PostgresRepository<any>[];
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

  /**
   * Create views for each model that is stored in a PostgresStore.
   *
   * Creates one SQL VIEW per model (or model subclass) that maps the JSONB
   * `data` column to typed columns based on the model's stored JSON schema.
   */
  async createViews() {
    const app = useApplication();
    const models = app.getModels();
    const viewPatterns: RegExp[] = (this.parameters.views ?? [".*"]).map(p => new RegExp(p));

    const modelMatches = (identifier: string): boolean => viewPatterns.some(re => re.test(identifier));

    for (const model of Object.values(models) as ModelClass[]) {
      if (!model) continue;
      const meta = useModelMetadata(model);
      if (!meta || !meta.Identifier) continue;

      if (!modelMatches(meta.Identifier)) continue;

      // Find the PostgresStore responsible for this model
      const allServices = Object.values(useCore().getServices()).filter(
        s => s instanceof PostgresStore
      ) as PostgresStore[];
      const store = allServices.find(s => s.handleModel(model) >= 0);
      if (!store) continue;

      const schema = meta.Schemas?.Stored;
      if (!schema || !schema.properties) continue;

      const plural = meta.Plural || meta.Identifier.split("/").pop()!.toLowerCase() + "s";
      const viewName = `${this.parameters.viewPrefix}${plural}`;
      const fields = ["uuid"];

      for (const field of Object.keys(schema.properties)) {
        if (field === "uuid" || !field.match(/^[0-9a-zA-Z-_$]+$/)) {
          continue;
        }
        let cast = "";
        const type = (<JSONSchema7>schema.properties[field]).type;
        if (type === "number") {
          cast = "::bigint";
        } else if (type === "boolean") {
          cast = "::boolean";
        } else if (type === "string") {
          cast = "::text";
        } else if (type === "array") {
          cast = "::jsonb";
        } else if (type === "object") {
          cast = "::jsonb";
        }
        fields.push(`(data->>'${field}')${cast} as ${field}`);
      }

      let query = `CREATE OR REPLACE VIEW ${viewName} AS SELECT ${fields.join(",")} FROM ${store.resolveTable(model)}`;
      if (store.handleModel(model) > 0) {
        query += ` WHERE (data#>>'{__type}') = '${meta.ShortName || meta.Identifier}'`;
      }
      try {
        this.log("INFO", `Dropping view ${viewName}`);
        await store.getClient().query(`DROP VIEW IF EXISTS ${viewName}`);
        this.log("INFO", query);
        await store.getClient().query(query);
      } catch (err) {
        this.log("ERROR", err);
      }
    }
  }
}

export default PostgresStore;
