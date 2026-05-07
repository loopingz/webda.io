import { InstanceCache, useApplication, useCore, useModel, useModelMetadata } from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import { JSONSchema7 } from "json-schema";
import pg, { ClientConfig, PoolConfig } from "pg";
import { PostgresRepository, SQLStore, SQLStoreParameters } from "./sqlstore.js";
import { useLog } from "@webda/workout";

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
 *
 */
export class PostgresParameters extends SQLStoreParameters {
  /**
   * @default false
   */
  usePool?: boolean;
  /**
   * By default use environment variables
   */
  postgresqlServer?: ClientConfig | PoolConfig;
  /**
   * Auto create table if not exists
   * @default true
   */
  autoCreateTable?: boolean;
  /**
   * View name prefix
   */
  viewPrefix?: string;
  /**
   * Regexp patterns of model identifiers to include when generating views
   *
   * @default [".*"]
   */
  views?: string[];

  /**
   * Per-model table name overrides.
   * Maps a model identifier (e.g. "Webda/User") to a custom table name.
   * When not specified, defaults are: primary model → `table`, others → identifier lowercased with "/" → "_".
   */
  tables?: { [modelIdentifier: string]: string };

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    this.autoCreateTable ??= true;
    this.usePool ??= false;
    this.viewPrefix ??= "";
    this.views ??= [".*"];
    this.tables ??= {};
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
export class PostgresStore<K extends PostgresParameters = PostgresParameters> extends SQLStore<K> {
  client: pg.Client | pg.Pool;

  /**
   * @override
   */
  async init(): Promise<this> {
    if (this.parameters.usePool) {
      this.client = new pg.Pool(this.parameters.postgresqlServer);
    } else {
      this.client = new pg.Client(this.parameters.postgresqlServer);
      await this.client.connect();
    }
    await this.checkTable();
    await super.init();
    return this;
  }

  /**
   * Resolve the table name for a given model class.
   *
   * Resolution order:
   * 1. `parameters.tables[meta.Identifier]` — explicit per-model override
   * 2. Primary model (matching `_modelMetadata.Identifier`) → `parameters.table`
   * 3. Default — model identifier lowercased with "/" replaced by "_"
   *
   * @param model - the model class to resolve the table for
   * @returns the table name
   */
  resolveTable(model: ModelClass): string {
    const meta = useModelMetadata(model);
    if (!meta) {
      return this.parameters.table;
    }
    // Explicit per-model override
    if (this.parameters.tables?.[meta.Identifier]) {
      return this.parameters.tables[meta.Identifier];
    }
    // Primary model uses the configured table name
    if (this._modelMetadata && meta.Identifier === this._modelMetadata.Identifier) {
      return this.parameters.table;
    }
    // Default: identifier lowercased, "/" → "_"
    return meta.Identifier.toLowerCase().replace(/\//g, "_");
  }

  /**
   * Ensure all managed model tables exist (one per model in the hierarchy).
   * When `autoCreateTable` is false, this is a no-op.
   */
  async checkTable() {
    if (!this.parameters.autoCreateTable) {
      return;
    }
    // Collect the set of unique table names across all managed models
    const tables = new Set<string>();
    // Always include the primary configured table
    tables.add(this.parameters.table);
    // Also include tables for all models in the hierarchy
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      try {
        const model = useModel(modelId);
        if (model) {
          tables.add(this.resolveTable(model));
        }
      } catch {
        // Model may not be resolvable — skip
      }
    }
    for (const table of tables) {
      useLog("DEBUG", `CREATE TABLE IF NOT EXISTS ${table} (...)`);
      await this.client.query(
        `CREATE TABLE IF NOT EXISTS ${table} (uuid VARCHAR(255) NOT NULL, data jsonb, CONSTRAINT ${table}_pkey PRIMARY KEY (uuid))`
      );
    }
  }

  /**
   * Return the postgresql client
   * @returns the pg client or pool
   */
  getClient() {
    return this.client;
  }

  /**
   * Build and return a PostgresRepository for the given model, using the
   * per-model table name resolved by `resolveTable`.
   *
   * The result is cached per model class via `@InstanceCache`.
   * @param model - the model class
   * @returns a repository backed by this store's pg connection
   */
  @InstanceCache()
  getRepository<T extends ModelClass>(model: T): Repository<T> {
    const meta = useModelMetadata(model);
    const table = this.resolveTable(model);
    return new PostgresRepository<T>(model, meta.PrimaryKey, this.client as any, table) as Repository<T>;
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
      const allServices = Object.values(useCore().getServices()).filter(s => s instanceof PostgresStore) as PostgresStore[];
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

  /**
   * Delete all rows from all managed tables (used in tests).
   */
  async __clean(): Promise<void> {
    const tables = new Set<string>([this.parameters.table]);
    for (const modelId of Object.keys(this._modelsHierarchy ?? {})) {
      try {
        const model = useModel(modelId);
        if (model) {
          tables.add(this.resolveTable(model));
        }
      } catch {
        // skip unreachable models
      }
    }
    for (const table of tables) {
      await this.client.query(`DELETE FROM ${table}`);
    }
  }
}

export default PostgresStore;
