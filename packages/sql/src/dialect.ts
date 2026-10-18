/** Database connection metadata */
export interface SQLDatabase {
  name: string;
}

/** Minimal SQL client interface compatible with pg.Client, pg.Pool and SQLiteClient */
export interface SQLClient {
  query: (q: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
}

/** Typed result wrapper for SQL queries */
export interface SQLResult<T> {
  rows: T[];
  rowCount: number;
}

/** JSON value types a dialect can test for */
export type JSONType = "number" | "string" | "boolean" | "array" | "object";

/**
 * Quote a string as a SQL literal: single quotes are doubled so a value can never close the literal. Backslashes
 * stay literal: with `standard_conforming_strings` (PostgreSQL default) and in SQLite, `\\` is not an escape
 * character in '...' strings; only LIKE gives it a meaning.
 * @param value - the string
 * @returns the SQL literal
 */
export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Engine syntax for the "one JSON document per row" model of SQLRepository: a `uuid` key column and a `data` JSON
 * column. Paths handed to a dialect are validated (`[A-Za-z0-9_]+` segments) and safe to interpolate.
 *
 * Methods taking `args` push the parameters they bind and refer to them by `args.length`: the caller appends its own
 * parameters afterwards.
 */
export interface SQLDialect {
  /** Clause ordering text in code unit order: `COLLATE "C"` / `COLLATE BINARY` */
  readonly binaryCollation: string;
  /**
   * Positional placeholder of the i-th (1-based) parameter: `$1` / `?1`
   * @param i - the parameter position
   * @returns the placeholder
   */
  placeholder(i: number): string;
  /**
   * The i-th parameter, a JSON text, as a JSON value: `$1::jsonb` / `json(?1)`
   * @param i - the parameter position
   * @returns the expression
   */
  jsonParam(i: number): string;
  /**
   * SQL text of the value at a path, NULL for a missing field and a JSON null
   * @param path - validated segments
   * @returns the expression
   */
  jsonText(path: string[]): string;
  /**
   * JSON value at a path
   * @param path - validated segments
   * @returns the expression
   */
  jsonValue(path: string[]): string;
  /**
   * JSON value at a path, a JSON null folded into SQL NULL (aggregations)
   * @param path - validated segments
   * @returns the expression
   */
  jsonValueOrNull(path: string[]): string;
  /**
   * SQL text of a top-level key: `data->>'k'`
   * @param key - the key
   * @returns the expression
   */
  keyText(key: string): string;
  /**
   * Condition: the JSON value has the type
   * @param json - a JSON value expression
   * @param type - the type
   * @returns the condition
   */
  isType(json: string, type: JSONType): string;
  /**
   * Comparable number of a JSON value known to be a number
   * @param json - a JSON value expression
   * @returns the expression
   */
  asNumber(json: string): string;
  /**
   * Text of a JSON value known to be a string
   * @param json - a JSON value expression
   * @returns the expression
   */
  asString(json: string): string;
  /**
   * Attribute of a typed comparison: the number or boolean, NULL when the field has another type
   * @param text - the text expression of the attribute
   * @param json - the JSON value expression of the attribute
   * @param type - the type of the compared value
   * @returns the expression
   */
  typedAttribute(text: string, json: string, type: "number" | "boolean"): string;
  /**
   * Null-safe `!=`: `IS DISTINCT FROM` / `IS NOT`
   * @param left - left operand
   * @param right - right operand
   * @returns the condition
   */
  distinctFrom(left: string, right: string): string;
  /**
   * Condition: the JSON value is an array holding the value (a literal, inlined)
   * @param json - a JSON value expression
   * @param value - the value
   * @returns the condition
   */
  contains(json: string, value: string | number | boolean): string;
  /**
   * Case-sensitive LIKE condition on the text (`%` / `_`, `\%` / `\_` literal)
   * @param text - the text expression
   * @param pattern - the LIKE pattern
   * @returns the condition
   */
  like(text: string, pattern: string): string;
  /**
   * `CREATE TABLE IF NOT EXISTS` statement of a document table
   * @param table - the table name
   * @returns the statement
   */
  createTable(table: string): string;
  /**
   * Whether the error is a primary key / unique violation on insert
   * @param err - the error
   * @returns true for a unique violation
   */
  isUniqueViolation(err: unknown): boolean;
  /**
   * Condition: the row has a `__type` key
   * @returns the condition
   */
  hasStoredType(): string;
  /**
   * The stored type of the row, rewritten through the legacy type map bound at `mapParam` (JSON text)
   * @param mapParam - position of the bound map parameter
   * @returns the expression
   */
  keptType(mapParam: number): string;
  /**
   * The JSON value with `__type` set to the type expression
   * @param json - a JSON value expression
   * @param type - the type expression
   * @returns the expression
   */
  withStoredType(json: string, type: string): string;
  /**
   * The JSON value shallow-merged with the patch (top-level keys replaced); binds what it needs
   * @param json - a JSON value expression
   * @param patch - the patch
   * @param args - the statement parameters
   * @returns the expression
   */
  shallowMerge(json: string, patch: Record<string, any>, args: any[]): string;
  /**
   * `data` without the top-level attribute; binds what it needs
   * @param attribute - the attribute
   * @param args - the statement parameters
   * @returns the expression
   */
  removeKey(attribute: string, args: any[]): string;
  /**
   * `data` with the counters incremented and `_lastUpdate` set to the ISO date; binds the increments
   * @param entries - the counters
   * @param updateDate - ISO date
   * @param args - the statement parameters
   * @returns the expression
   */
  increment(entries: { property: string; value: number }[], updateDate: string, args: any[]): string;
  /**
   * `data` with the item bound at `itemParam` appended to (index undefined) or set at `index` of the top-level array,
   * `_lastUpdate` set
   * @param attr - the array attribute
   * @param itemParam - position of the bound item (JSON text)
   * @param index - the index, undefined to append
   * @param updateDate - ISO date
   * @returns the expression
   */
  setCollectionItem(attr: string, itemParam: number, index: number | undefined, updateDate: string): string;
  /**
   * `data` with the item at `index` removed from the top-level array, `_lastUpdate` set
   * @param attr - the array attribute
   * @param index - the index
   * @param updateDate - ISO date
   * @returns the expression
   */
  removeCollectionItem(attr: string, index: number, updateDate: string): string;
  /**
   * Condition: the field of the item at `index` of the top-level array equals the parameter
   * @param attr - the array attribute
   * @param index - the index
   * @param field - the item field
   * @param valueParam - position of the bound value
   * @returns the condition
   */
  collectionItemCondition(attr: string, index: number | undefined, field: string, valueParam: number): string;
  /**
   * `data` with the UPDATE SET assignments applied: missing parents created, existing arrays indexed; binds values
   * @param table - the table name
   * @param assignments - the SET assignments
   * @param args - the statement parameters
   * @returns the expression
   */
  bulkAssign(table: string, assignments: { field: string; value: any }[], args: any[]): string;
  /**
   * Statement stamping `__type` = parameter 1 on the untyped rows of the table
   * @param table - the table name
   * @returns the statement
   */
  backfillTypes(table: string): string;
  /**
   * Statement returning `type`, `n` per stored type (parameter 1 = unreadable label, 2 = untyped label)
   * @param table - the table name
   * @returns the statement
   */
  countStoredTypes(table: string): string;
  /**
   * Condition: the `data` column is a JSON object
   * @returns the condition
   */
  isObjectRow(): string;
  /**
   * Decode a JSON column of a result row: the object (pg parses jsonb), parsed text otherwise
   * @param value - the column value
   * @returns the decoded value
   */
  decode(value: any): any;
}
