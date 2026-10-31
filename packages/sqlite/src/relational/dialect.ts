import type { ContractStep, LiveSchema, RelationalDialect, SchemaStep, SQLClient } from "@webda/sql";
import { sqlString } from "@webda/sql";
import { constraintName } from "@webda/sql-schema";
import type { ColumnPlan, ColumnType, ForeignKeyPlan, TablePlan } from "@webda/sql-schema";
import { jsonPath, SQLiteDialect } from "../dialect.js";

/**
 * Declared type per plan column type: SQLite keeps the declared name, so `PRAGMA table_info` gives it back as is
 * (`uuid` is `TEXT`, compatible with `uuid` for the planner)
 */
const DDL_TYPES: { [kind in ColumnType["kind"]]: string } = {
  text: "TEXT",
  varchar: "VARCHAR",
  timestamptz: "TIMESTAMPTZ",
  date: "DATE",
  uuid: "TEXT",
  bigint: "BIGINT",
  double: "REAL",
  decimal: "DECIMAL",
  boolean: "BOOLEAN",
  json: "JSON"
};

const LIVE_TYPES: { [name: string]: ColumnType } = {
  TEXT: { kind: "text" },
  TIMESTAMPTZ: { kind: "timestamptz" },
  DATE: { kind: "date" },
  BIGINT: { kind: "bigint" },
  INTEGER: { kind: "bigint" },
  INT: { kind: "bigint" },
  REAL: { kind: "double" },
  DOUBLE: { kind: "double" },
  "DOUBLE PRECISION": { kind: "double" },
  FLOAT: { kind: "double" },
  DECIMAL: { kind: "decimal" },
  NUMERIC: { kind: "decimal" },
  BOOLEAN: { kind: "boolean" },
  JSON: { kind: "json" }
};

/**
 * SQLite syntax of the relational layout: declared column types, inline foreign keys (`DEFERRABLE INITIALLY
 * DEFERRED`, `PRAGMA foreign_keys` is set by the store), `PRAGMA` introspection, JSON1 operations on a named column.
 * One writer at a time: no schema lock.
 */
export class SQLiteRelationalDialect extends SQLiteDialect implements RelationalDialect {
  /** SQLite has no `ALTER TABLE ADD CONSTRAINT`: foreign keys live in `CREATE TABLE` */
  readonly inlineForeignKeys = true;

  /** @override */
  quote(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  /** @override */
  columnType(type: ColumnType): string {
    return type.kind === "varchar" ? `VARCHAR(${type.length})` : DDL_TYPES[type.kind];
  }

  /**
   * @param declared - the declared type of a column, as `PRAGMA table_info` gives it
   * @returns the plan type, undefined for an unknown declaration
   */
  liveType(declared: string): ColumnType | undefined {
    // `NAME`, `NAME(n)` or `NAME(p,s)`: parsed by hand (a regular expression over spaces is polynomial)
    const text = (declared ?? "").trim();
    const open = text.indexOf("(");
    const name = (open === -1 ? text : text.slice(0, open)).trim().toUpperCase();
    const inside =
      open === -1 ? "" : text.slice(open + 1, text.indexOf(")", open) === -1 ? undefined : text.indexOf(")", open));
    const length = /^\d+$/.test(inside) ? Number(inside) : undefined;
    if (!name) {
      return undefined;
    }
    if (name === "VARCHAR" || name === "CHARACTER VARYING") {
      return length ? { kind: "varchar", length } : { kind: "text" };
    }
    if (name.startsWith("CHAR") || name === "CLOB") {
      return { kind: "text" };
    }
    return LIVE_TYPES[name];
  }

  /** @override */
  renderStep(step: SchemaStep): string[] {
    switch (step.kind) {
      case "createTable":
        return [this.createTableStatement(step.table, step.foreignKeys)];
      case "addColumn":
        return [`ALTER TABLE ${this.quote(step.table)} ADD COLUMN ${this.columnDefinition(step.column)}`];
      case "createIndex": {
        const { name, table, columns, unique } = step.index;
        return [
          `CREATE ${unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${this.quote(name)} ON ${this.quote(table)} (${this.columnList(columns)})`
        ];
      }
      case "addForeignKey":
        // Never planned for this dialect (inlineForeignKeys): nothing to run
        return [];
    }
  }

  /**
   * SQLite drops columns and tables; it cannot set `NOT NULL` on an existing column (reported, not applied) and has
   * no constraint validation (foreign keys are declared inline)
   * @override
   */
  renderContractStep(step: ContractStep): string[] {
    switch (step.kind) {
      case "dropColumn":
        return [`ALTER TABLE ${this.quote(step.table)} DROP COLUMN ${this.quote(step.column)}`];
      case "dropTable":
        return [`DROP TABLE IF EXISTS ${this.quote(step.table)}`];
      default:
        return [];
    }
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
   * @returns its definition, always nullable
   */
  private columnDefinition(column: ColumnPlan): string {
    return `${this.quote(column.name)} ${this.columnType(column.type)}`;
  }

  /**
   * @param table - a table
   * @param foreignKeys - its foreign keys
   * @returns its `CREATE TABLE IF NOT EXISTS` statement: columns, primary key, enum checks and foreign keys
   */
  private createTableStatement(table: TablePlan, foreignKeys: ForeignKeyPlan[]): string {
    const parts = table.columns.map(c => this.columnDefinition(c));
    parts.push(`CONSTRAINT ${this.quote(`${table.name}_pkey`)} PRIMARY KEY (${this.columnList(table.primaryKey)})`);
    for (const column of table.columns) {
      if (column.enum?.length) {
        parts.push(
          `CONSTRAINT ${this.quote(constraintName("ck", table.name, [column.name]))} CHECK (${this.quote(column.name)} IN (${column.enum.map(sqlString).join(", ")}))`
        );
      }
    }
    for (const fk of foreignKeys) {
      parts.push(
        `CONSTRAINT ${this.quote(fk.name)} FOREIGN KEY (${this.columnList(fk.columns)}) REFERENCES ${this.quote(fk.references.table)} (${this.columnList(fk.references.columns)}) ON DELETE ${fk.onDelete} DEFERRABLE INITIALLY DEFERRED`
      );
    }
    return `CREATE TABLE IF NOT EXISTS ${this.quote(table.name)} (${parts.join(", ")})`;
  }

  /** @override */
  async describeSchema(client: SQLClient, tables: string[]): Promise<LiveSchema> {
    const live: LiveSchema = { tables: {} };
    for (const table of tables) {
      const columns = await client.query(`PRAGMA table_info(${this.quote(table)})`);
      if (!columns.rows.length) {
        continue;
      }
      const entry = {
        columns: {} as LiveSchema["tables"][string]["columns"],
        indexes: new Set<string>(),
        constraints: new Set<string>()
      };
      for (const row of columns.rows) {
        entry.columns[row.name] = { type: this.liveType(row.type), nullable: !row.notnull, raw: row.type };
      }
      for (const row of (await client.query(`PRAGMA index_list(${this.quote(table)})`)).rows) {
        entry.indexes.add(row.name);
      }
      // Foreign keys have no name in SQLite: named like the plan does, from the table and its columns
      const byId = new Map<number, { seq: number; from: string }[]>();
      for (const row of (await client.query(`PRAGMA foreign_key_list(${this.quote(table)})`)).rows) {
        byId.set(row.id, [...(byId.get(row.id) ?? []), { seq: row.seq, from: row.from }]);
      }
      for (const parts of byId.values()) {
        entry.constraints.add(
          constraintName(
            "fk",
            table,
            parts.sort((a, b) => a.seq - b.seq).map(p => p.from)
          )
        );
      }
      live.tables[table] = entry;
    }
    return live;
  }

  /**
   * One writer at a time: no lock needed
   * @override
   */
  schemaLock(_name: string): string | undefined {
    return undefined;
  }

  /** @override */
  castText(expr: string): string {
    return `CAST(${expr} AS TEXT)`;
  }

  /**
   * Booleans are stored as 0/1: rendered as JSON booleans for the aggregations
   * @override
   */
  toJson(expr: string, type: ColumnType): string {
    if (type.kind === "boolean") {
      return `CASE WHEN ${expr} IS NULL THEN NULL WHEN ${expr} THEN json('true') ELSE json('false') END`;
    }
    // json_quote(NULL) is the JSON null text: a SQL NULL must stay NULL for COUNT and the group keys
    return `CASE WHEN ${expr} IS NULL THEN NULL ELSE json_quote(${expr}) END`;
  }

  /**
   * @param path - validated segments
   * @returns the JSON path literal
   */
  private path(path: string[]): string {
    path.forEach(segment => this.checkKey(segment));
    return `'${jsonPath(path)}'`;
  }

  /**
   * Booleans read as `true` / `false`, everything else as its text; NULL for missing and JSON null
   * @override
   */
  columnJsonText(column: string, path: string[]): string {
    const p = this.path(path);
    const c = this.quote(column);
    return `(CASE json_type(${c}, ${p}) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST(${c} ->> ${p} AS TEXT) END)`;
  }

  /** @override */
  columnJsonValue(column: string, path: string[]): string {
    return `${this.quote(column)} -> ${this.path(path)}`;
  }

  /** @override */
  columnJsonValueOrNull(column: string, path: string[]): string {
    return `NULLIF(${this.columnJsonValue(column, path)}, 'null')`;
  }

  /** @override */
  columnJsonMerge(column: string, patch: Record<string, unknown>, args: unknown[]): string {
    const object = `COALESCE(${this.quote(column)}, '{}')`;
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      this.checkKey(key);
      args.push(JSON.stringify(value));
      pairs.push(`'$.${key}', json(?${args.length})`);
    }
    return pairs.length ? `json_set(${object}, ${pairs.join(", ")})` : object;
  }

  /** @override */
  columnJsonRemoveKey(column: string, param: number): string {
    return `json_remove(${this.quote(column)}, '$.' || ?${param})`;
  }

  /**
   * Every parent of the path is made an object when missing (an existing object or array is kept)
   * @override
   */
  columnJsonSetPath(column: string, path: string[], valueParam: number): string {
    const object = `COALESCE(${this.quote(column)}, '{}')`;
    const pairs: string[] = [];
    for (let i = 1; i < path.length; i++) {
      const parent = this.path(path.slice(0, i));
      pairs.push(
        `${parent}, json(COALESCE(CASE WHEN json_type(${object}, ${parent}) IN ('object', 'array') THEN ${object} -> ${parent} END, '{}'))`
      );
    }
    pairs.push(`${this.path(path)}, json(?${valueParam})`);
    return `json_set(${object}, ${pairs.join(", ")})`;
  }

  /** @override */
  columnJsonSetItem(column: string, itemParam: number, index: number | undefined): string {
    const array = `COALESCE(${this.quote(column)}, '[]')`;
    const append = `json_insert(${array}, '$[#]', json(?${itemParam}))`;
    if (index === undefined) {
      return append;
    }
    return `CASE WHEN json_array_length(${array}) > ${this.checkIndex(index)} THEN json_set(${array}, '$[${index}]', json(?${itemParam})) ELSE ${append} END`;
  }

  /** @override */
  columnJsonRemoveItem(column: string, index: number): string {
    return `json_remove(COALESCE(${this.quote(column)}, '[]'), '$[${this.checkIndex(index)}]')`;
  }

  /** @override */
  columnJsonItemCondition(column: string, index: number | undefined, field: string, valueParam: number): string {
    this.checkKey(field);
    if (index === undefined) {
      return `0 = ?${valueParam}`;
    }
    return `${this.quote(column)} ->> '$[${this.checkIndex(index)}].${field}' = ?${valueParam}`;
  }

  /**
   * SQLITE_CONSTRAINT_FOREIGNKEY (787); SQLite names no constraint
   * @override
   */
  isForeignKeyViolation(err: unknown): { constraint?: string } | undefined {
    const e = err as any;
    return typeof e === "object" && e !== null && e.code === "ERR_SQLITE_ERROR" && e.errcode === 787 ? {} : undefined;
  }
}
