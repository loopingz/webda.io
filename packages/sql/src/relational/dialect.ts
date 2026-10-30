import type { ColumnPlan, ColumnType, ForeignKeyPlan, IndexPlan, TablePlan } from "@webda/sql-schema";
import type { SQLClient, SQLDialect } from "../dialect.js";

/**
 * One additive change bringing a database closer to a {@link RelationalSchemaPlan}
 */
export type SchemaStep =
  | { kind: "createTable"; table: TablePlan }
  | { kind: "addColumn"; table: string; column: ColumnPlan }
  | { kind: "createIndex"; index: IndexPlan }
  | { kind: "addForeignKey"; foreignKey: ForeignKeyPlan };

/**
 * A column as the database describes it
 */
export interface LiveColumn {
  /**
   * The engine type mapped back to a plan type, undefined when the dialect does not know the type
   */
  type?: ColumnType;
  nullable: boolean;
  /**
   * The engine type name, for messages
   */
  raw: string;
}

/**
 * A table as the database describes it
 */
export interface LiveTable {
  columns: { [name: string]: LiveColumn };
  /**
   * Names of the indexes of the table
   */
  indexes: Set<string>;
  /**
   * Names of the constraints of the table
   */
  constraints: Set<string>;
}

/**
 * The tables of a plan as the database describes them: a planned table absent from `tables` does not exist
 */
export interface LiveSchema {
  tables: { [name: string]: LiveTable };
}

/**
 * Engine syntax of the relational layout: typed columns from a plan, DDL, introspection and JSON operations on a
 * named JSON column. Column arguments are physical (unquoted) names, quoted by the dialect; paths are validated
 * segments.
 */
export interface RelationalDialect extends SQLDialect {
  /**
   * @param identifier - a table, column, index or constraint name
   * @returns the quoted identifier
   */
  quote(identifier: string): string;
  /**
   * @param type - a plan column type
   * @returns the DDL type
   */
  columnType(type: ColumnType): string;
  /**
   * @param step - a schema change
   * @returns the idempotent statements applying it
   */
  renderStep(step: SchemaStep): string[];
  /**
   * Describe the tables as the database holds them
   * @param client - the client
   * @param tables - the table names to describe
   * @returns the live schema, without the tables that do not exist
   */
  describeSchema(client: SQLClient, tables: string[]): Promise<LiveSchema>;
  /**
   * Statement serializing DDL across processes, run first inside the DDL transaction
   * @param name - the lock name (the store name)
   * @returns the statement, undefined when the engine needs none
   */
  schemaLock(name: string): string | undefined;
  /**
   * @param expr - a SQL expression
   * @returns the expression as text
   */
  castText(expr: string): string;
  /**
   * JSON value of a scalar column expression, for aggregations: a time column renders as its ISO 8601 UTC text
   * @param expr - a SQL expression
   * @param type - the column type
   * @returns the JSON value
   */
  toJson(expr: string, type: ColumnType): string;
  /**
   * SQL text of the value at a path of a JSON column, NULL for a missing key and a JSON null
   * @param column - the JSON column
   * @param path - the path inside the column, may be empty
   * @returns the expression
   */
  columnJsonText(column: string, path: string[]): string;
  /**
   * JSON value at a path of a JSON column
   * @param column - the JSON column
   * @param path - the path inside the column, may be empty
   * @returns the expression
   */
  columnJsonValue(column: string, path: string[]): string;
  /**
   * JSON value at a path of a JSON column, a JSON null folded into SQL NULL
   * @param column - the JSON column
   * @param path - the path inside the column, may be empty
   * @returns the expression
   */
  columnJsonValueOrNull(column: string, path: string[]): string;
  /**
   * The JSON column shallow-merged with the object bound at `param` (a NULL column counts as `{}`)
   * @param column - the JSON column
   * @param param - position of the bound JSON text
   * @returns the expression
   */
  columnJsonMerge(column: string, param: number): string;
  /**
   * The JSON column without the top-level key bound at `param`
   * @param column - the JSON column
   * @param param - position of the bound key
   * @returns the expression
   */
  columnJsonRemoveKey(column: string, param: number): string;
  /**
   * The JSON column with the value bound at `valueParam` set at the path bound at `pathParam` (parents created)
   * @param column - the JSON column
   * @param pathParam - position of the bound path (text array)
   * @param valueParam - position of the bound JSON text
   * @returns the expression
   */
  columnJsonSetPath(column: string, pathParam: number, valueParam: number): string;
  /**
   * The JSON array column with the item bound at `itemParam` appended (index undefined) or set at `index`
   * @param column - the JSON column
   * @param itemParam - position of the bound JSON text
   * @param index - the index, undefined to append
   * @returns the expression
   */
  columnJsonSetItem(column: string, itemParam: number, index: number | undefined): string;
  /**
   * The JSON array column without the item at `index`
   * @param column - the JSON column
   * @param index - the index
   * @returns the expression
   */
  columnJsonRemoveItem(column: string, index: number): string;
  /**
   * Condition: the field of the item at `index` of the JSON array column equals the parameter
   * @param column - the JSON column
   * @param index - the index
   * @param field - the item field
   * @param valueParam - position of the bound value
   * @returns the condition
   */
  columnJsonItemCondition(column: string, index: number | undefined, field: string, valueParam: number): string;
  /**
   * @param err - an error thrown by the client
   * @returns the violated constraint when the error is a foreign key violation, undefined otherwise
   */
  isForeignKeyViolation(err: unknown): { constraint?: string } | undefined;
}
