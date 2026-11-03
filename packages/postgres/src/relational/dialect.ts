import type {
  ContractStep,
  LiveSchema,
  OnlineStatements,
  RelationalDialect,
  SchemaStep,
  SQLClient,
  UniqueViolation
} from "@webda/sql";
import { sqlString } from "@webda/sql";
import { constraintName } from "@webda/sql-schema";
import type { ColumnPlan, ColumnType, ForeignKeyPlan, TablePlan } from "@webda/sql-schema";
import { PostgresDialect } from "../dialect.js";

/**
 * A row of `information_schema.columns`
 */
export interface LiveColumnRow {
  data_type: string;
  character_maximum_length: number | null;
}

const DDL_TYPES: { [kind in ColumnType["kind"]]: string } = {
  text: "TEXT",
  varchar: "VARCHAR",
  timestamptz: "TIMESTAMPTZ",
  date: "DATE",
  // Webda keys are free-form strings: a TEXT column accepts every UuidModel key and joins the JSON store's uuid column
  uuid: "TEXT",
  bigint: "BIGINT",
  double: "DOUBLE PRECISION",
  decimal: "NUMERIC",
  boolean: "BOOLEAN",
  json: "JSONB"
};

const LIVE_TYPES: { [dataType: string]: ColumnType } = {
  text: { kind: "text" },
  "timestamp with time zone": { kind: "timestamptz" },
  date: { kind: "date" },
  bigint: { kind: "bigint" },
  integer: { kind: "bigint" },
  smallint: { kind: "bigint" },
  "double precision": { kind: "double" },
  real: { kind: "double" },
  numeric: { kind: "decimal" },
  boolean: { kind: "boolean" },
  jsonb: { kind: "json" },
  json: { kind: "json" },
  uuid: { kind: "uuid" }
};

/**
 * PostgreSQL syntax of the relational layout: typed columns, `information_schema` introspection, advisory locks,
 * deferrable foreign keys, JSONB operations on a named column
 */
export class PostgresRelationalDialect extends PostgresDialect implements RelationalDialect {
  /** Foreign keys are added after the tables, deferrable */
  readonly inlineForeignKeys = false;

  /** @override */
  quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /** @override */
  columnType(type: ColumnType): string {
    return type.kind === "varchar" ? `VARCHAR(${type.length})` : DDL_TYPES[type.kind];
  }

  /**
   * @param row - a row of `information_schema.columns`
   * @returns the plan type of the column, undefined for an unknown type
   */
  liveType(row: LiveColumnRow): ColumnType | undefined {
    if (row.data_type === "character varying") {
      return row.character_maximum_length
        ? { kind: "varchar", length: row.character_maximum_length }
        : { kind: "text" };
    }
    return LIVE_TYPES[row.data_type];
  }

  /** @override */
  renderStep(step: SchemaStep): string[] {
    switch (step.kind) {
      case "createTable":
        return [this.createTableStatement(step.table)];
      case "addColumn":
        return [`ALTER TABLE ${this.quote(step.table)} ADD COLUMN IF NOT EXISTS ${this.columnDefinition(step.column)}`];
      case "createIndex": {
        const { name, table, columns, unique } = step.index;
        return [
          `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${this.quote(name)} ON ${this.quote(table)} (${this.columnList(columns)})`
        ];
      }
      case "addForeignKey":
        return [this.addForeignKeyStatement(step.foreignKey, false)];
    }
  }

  /**
   * The statements of a step on a table with rows and traffic: an index is built `CONCURRENTLY` after the DDL
   * transaction (and dropped when the build fails, `IF NOT EXISTS` would skip the invalid index next time), a foreign
   * key is added `NOT VALID` in the transaction and validated after it, so no `ACCESS EXCLUSIVE` lock outlives the
   * catalog update
   * @override
   */
  renderOnlineStep(step: SchemaStep): OnlineStatements {
    switch (step.kind) {
      case "createIndex": {
        const { name, table, columns, unique } = step.index;
        return {
          inside: [],
          after: [
            `CREATE ${unique ? "UNIQUE " : ""}INDEX CONCURRENTLY IF NOT EXISTS ${this.quote(name)} ON ${this.quote(table)} (${this.columnList(columns)})`
          ],
          onFailure: [`DROP INDEX IF EXISTS ${this.quote(name)}`]
        };
      }
      case "addForeignKey":
        return {
          inside: [this.addForeignKeyStatement(step.foreignKey, true)],
          after: [
            `ALTER TABLE ${this.quote(step.foreignKey.table)} VALIDATE CONSTRAINT ${this.quote(step.foreignKey.name)}`
          ]
        };
      default:
        return { inside: this.renderStep(step), after: [] };
    }
  }

  /** @override */
  renderContractStep(step: ContractStep): string[] {
    switch (step.kind) {
      case "dropColumn":
        return [`ALTER TABLE ${this.quote(step.table)} DROP COLUMN IF EXISTS ${this.quote(step.column)}`];
      case "dropTable":
        return [`DROP TABLE IF EXISTS ${this.quote(step.table)}`];
      case "setNotNull":
        return [`ALTER TABLE ${this.quote(step.table)} ALTER COLUMN ${this.quote(step.column)} SET NOT NULL`];
      case "validateForeignKey":
        return [`ALTER TABLE ${this.quote(step.table)} VALIDATE CONSTRAINT ${this.quote(step.constraint)}`];
    }
  }

  /**
   * @param foreignKey - a foreign key
   * @param notValid - add it `NOT VALID` (the existing rows are checked by `VALIDATE CONSTRAINT`)
   * @returns the idempotent `ADD CONSTRAINT` statement
   */
  private addForeignKeyStatement(foreignKey: ForeignKeyPlan, notValid: boolean): string {
    const { name, table, columns, references, onDelete } = foreignKey;
    return (
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid ` +
      `JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname = ${sqlString(table)} ` +
      `AND con.conname = ${sqlString(name)}) THEN ` +
      `ALTER TABLE ${this.quote(table)} ADD CONSTRAINT ${this.quote(name)} FOREIGN KEY (${this.columnList(columns)}) ` +
      `REFERENCES ${this.quote(references.table)} (${this.columnList(references.columns)}) ` +
      `ON DELETE ${onDelete} DEFERRABLE INITIALLY DEFERRED${notValid ? " NOT VALID" : ""}; END IF; END $$`
    );
  }

  /**
   * @param columns - column names
   * @returns the quoted, comma-separated list
   */
  private columnList(columns: string[]): string {
    return columns.map(c => this.quote(c)).join(", ");
  }

  /**
   * @param column - a column
   * @returns its definition, always nullable (`NOT NULL` belongs to the contract phase)
   */
  private columnDefinition(column: ColumnPlan): string {
    return `${this.quote(column.name)} ${this.columnType(column.type)}`;
  }

  /**
   * @param table - a table
   * @returns its `CREATE TABLE IF NOT EXISTS` statement: columns, primary key and enum checks
   */
  private createTableStatement(table: TablePlan): string {
    const parts = table.columns.map(c => this.columnDefinition(c));
    parts.push(`CONSTRAINT ${this.quote(`${table.name}_pkey`)} PRIMARY KEY (${this.columnList(table.primaryKey)})`);
    for (const column of table.columns) {
      if (column.enum?.length) {
        parts.push(
          `CONSTRAINT ${this.quote(constraintName("ck", table.name, [column.name]))} CHECK (${this.quote(column.name)} IN (${column.enum.map(sqlString).join(", ")}))`
        );
      }
    }
    return `CREATE TABLE IF NOT EXISTS ${this.quote(table.name)} (${parts.join(", ")})`;
  }

  /** @override */
  async describeSchema(client: SQLClient, tables: string[]): Promise<LiveSchema> {
    const live: LiveSchema = { tables: {} };
    if (!tables.length) {
      return live;
    }
    const columns = await client.query(
      `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable FROM information_schema.columns ` +
        `WHERE table_schema = current_schema() AND table_name = ANY($1) ORDER BY table_name, ordinal_position`,
      [tables]
    );
    for (const row of columns.rows) {
      const table = (live.tables[row.table_name] ??= { columns: {}, indexes: new Set(), constraints: new Set() });
      table.columns[row.column_name] = {
        type: this.liveType(row),
        nullable: row.is_nullable === "YES",
        raw: row.character_maximum_length ? `${row.data_type}(${row.character_maximum_length})` : row.data_type
      };
    }
    const indexes = await client.query(
      `SELECT tablename, indexname FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ANY($1)`,
      [tables]
    );
    for (const row of indexes.rows) {
      live.tables[row.tablename]?.indexes.add(row.indexname);
    }
    const constraints = await client.query(
      `SELECT c.relname AS tablename, con.conname, con.convalidated FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid ` +
        `JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = current_schema() AND c.relname = ANY($1)`,
      [tables]
    );
    for (const row of constraints.rows) {
      const table = live.tables[row.tablename];
      table?.constraints.add(row.conname);
      if (table && !row.convalidated) {
        (table.unvalidated ??= new Set()).add(row.conname);
      }
    }
    return live;
  }

  /** @override */
  schemaLock(name: string): string {
    return `SELECT pg_advisory_xact_lock(hashtext(${sqlString(name)}))`;
  }

  /** @override */
  castText(expr: string): string {
    return `CAST(${expr} AS TEXT)`;
  }

  /** @override */
  timeText(expr: string, type: ColumnType): string {
    return type.kind === "date"
      ? `to_char(${expr}, 'YYYY-MM-DD')`
      : `to_char(${expr} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
  }

  /** @override */
  toJson(expr: string, type: ColumnType): string {
    if (type.kind === "timestamptz") {
      return `to_jsonb(${this.timeText(expr, type)})`;
    }
    return `to_jsonb(${expr})`;
  }

  /** @override */
  columnJsonText(column: string, path: string[]): string {
    return `${this.quote(column)}#>>'{${this.checkPath(path).join(",")}}'`;
  }

  /** @override */
  columnJsonValue(column: string, path: string[]): string {
    return `${this.quote(column)}#>'{${this.checkPath(path).join(",")}}'`;
  }

  /** @override */
  columnJsonValueOrNull(column: string, path: string[]): string {
    return `NULLIF(${this.columnJsonValue(column, path)}, 'null'::jsonb)`;
  }

  /** @override */
  columnJsonMerge(column: string, patch: Record<string, unknown>, args: unknown[]): string {
    args.push(JSON.stringify(patch));
    return `COALESCE(${this.quote(column)}, '{}'::jsonb) || $${args.length}::jsonb`;
  }

  /** @override */
  columnJsonRemoveKey(column: string, param: number): string {
    return `${this.quote(column)} - $${param}`;
  }

  /**
   * Nested `jsonb_set`: every parent of the path is made an object when missing (an existing object or array is kept)
   * @override
   */
  columnJsonSetPath(column: string, path: string[], valueParam: number): string {
    this.checkPath(path);
    let json = `COALESCE(${this.quote(column)}, '{}'::jsonb)`;
    for (let i = 1; i < path.length; i++) {
      const parent = `'{${path.slice(0, i).join(",")}}'`;
      json = `jsonb_set(${json}, ${parent}, CASE WHEN jsonb_typeof(${json} #> ${parent}) IN ('object', 'array') THEN ${json} #> ${parent} ELSE '{}'::jsonb END, true)`;
    }
    return `jsonb_set(${json}, '{${path.join(",")}}', $${valueParam}::jsonb, true)`;
  }

  /** @override */
  columnJsonSetItem(column: string, itemParam: number, index: number | undefined): string {
    const array = `COALESCE(${this.quote(column)}, '[]'::jsonb)`;
    return index === undefined
      ? `${array} || jsonb_build_array($${itemParam}::jsonb)`
      : `jsonb_set(${array}, '{${this.checkIndex(index)}}', $${itemParam}::jsonb)`;
  }

  /** @override */
  columnJsonRemoveItem(column: string, index: number): string {
    return `COALESCE(${this.quote(column)} - ${this.checkIndex(index)}, '[]'::jsonb)`;
  }

  /** @override */
  columnJsonItemCondition(column: string, index: number, field: string, valueParam: number): string {
    this.checkKey(field);
    return `${this.quote(column)}#>>'{${this.checkIndex(index)},${field}}' = $${valueParam}`;
  }

  /**
   * foreign_key_violation
   * @override
   */
  isForeignKeyViolation(err: unknown): { constraint?: string } | undefined {
    if (typeof err === "object" && err !== null && (err as any).code === "23503") {
      return { constraint: (err as any).constraint };
    }
    return undefined;
  }

  /**
   * unique_violation: the primary key constraints are named `<table>_pkey`
   * @override
   */
  uniqueViolation(err: unknown): UniqueViolation | undefined {
    if (!this.isUniqueViolation(err)) {
      return undefined;
    }
    const { table, constraint } = err as { table?: string; constraint?: string };
    return { table, constraint, primaryKey: constraint === `${table}_pkey` };
  }
}
