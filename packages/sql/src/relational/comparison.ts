import { WebdaError } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import type { ColumnType } from "@webda/sql-schema";
import { sqlString } from "../dialect.js";
import type { RelationalDialect } from "./dialect.js";

const TEXT_KINDS = new Set<ColumnType["kind"]>(["text", "varchar", "uuid"]);
const TIME_KINDS = new Set<ColumnType["kind"]>(["date", "timestamptz"]);
const NUMBER_KINDS = new Set<ColumnType["kind"]>(["bigint", "double", "decimal"]);

/**
 * Whether a value is a date or a date text an engine parses (`YYYY-MM-DD`, with or without a time): anything else
 * compared to a time column must match nothing, never raise
 * @param value - the compared value
 * @returns true for a date value
 */
export function isTimeValue(value: unknown): boolean {
  if (value instanceof Date) {
    return !Number.isNaN(value.getTime());
  }
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}

/**
 * Whether a WebdaQL value has the JavaScript type a column holds: strings and dates for the text kinds, dates and
 * date texts for the time kinds, numbers for the numeric kinds, booleans for `boolean`
 * @param value - the compared value
 * @param type - the column type
 * @returns true when the value can be compared natively
 */
export function valueMatchesType(value: unknown, type: ColumnType): boolean {
  if (TEXT_KINDS.has(type.kind)) {
    return typeof value === "string" || value instanceof Date;
  }
  if (TIME_KINDS.has(type.kind)) {
    return isTimeValue(value);
  }
  if (NUMBER_KINDS.has(type.kind)) {
    return typeof value === "number";
  }
  return type.kind === "boolean" && typeof value === "boolean";
}

/**
 * SQL literal of a value matching the column type
 * @param value - the value
 * @param type - the column type
 * @returns the literal
 */
export function columnLiteral(value: unknown, type: ColumnType): string {
  if (type.kind === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (NUMBER_KINDS.has(type.kind)) {
    return String(value);
  }
  return sqlString(value instanceof Date ? value.toISOString() : String(value));
}

/**
 * A WebdaQL comparison on a typed column
 *
 * Keeps the in-memory semantics of `ComparisonExpression.eval`:
 * - a value of the column type compares natively (`"n" < 2`, `"d" > '2024-01-01'`);
 * - `=` / `!=` with a value of another type compare the text of the column, so the loose `n = '1'` still matches and
 *   `n = 'abc'` never raises a cast error; `!=` is null-safe; a time column reads as its ISO text, so a text that is
 *   not a date (`_lastUpdate = 'abc'`) matches nothing instead of raising;
 * - an ordering comparison with a value of another type is `FALSE`, as comparing a number with a string is;
 * - `LIKE` works on the text of the column (the ISO text of a time column);
 * - `CONTAINS` is for JSON columns only.
 */
export class SQLColumnComparisonExpression extends WebdaQL.ComparisonExpression {
  /**
   * @param operator - the comparison operator
   * @param column - the quoted column
   * @param value - the compared value
   * @param type - the column type
   * @param dialect - the engine syntax
   */
  constructor(
    operator: WebdaQL.ComparisonOperator,
    column: string,
    value: any,
    protected readonly type: ColumnType,
    protected readonly dialect: RelationalDialect
  ) {
    super(operator, column, value);
  }

  /**
   * @returns the SQL condition
   */
  toString(): string {
    const column = this.attribute.join(".");
    if (WebdaQL.UNARY_COMPARISON_OPERATORS.includes(this.operator)) {
      return `${column} ${this.operator}`;
    }
    if (this.operator === "CONTAINS") {
      throw new WebdaError.BadRequest(`CONTAINS needs a JSON column: ${column} is ${this.type.kind}`);
    }
    if (this.operator === "LIKE") {
      return this.dialect.like(this.text(column), String(this.value));
    }
    if (valueMatchesType(this.value, this.type)) {
      const literal = columnLiteral(this.value, this.type);
      return this.operator === "!="
        ? this.dialect.distinctFrom(column, literal)
        : `${column} ${this.operator} ${literal}`;
    }
    if (this.operator === "=" || this.operator === "!=") {
      const text = this.text(column);
      const literal = sqlString(String(this.value));
      return this.operator === "=" ? `${text} = ${literal}` : this.dialect.distinctFrom(text, literal);
    }
    return "FALSE";
  }

  /**
   * @param column - the quoted column
   * @returns the column as the text the model holds: itself for a text kind, the ISO form of a time kind, a cast
   *   otherwise
   */
  protected text(column: string): string {
    if (TEXT_KINDS.has(this.type.kind)) {
      return column;
    }
    return TIME_KINDS.has(this.type.kind) ? this.dialect.timeText(column, this.type) : this.dialect.castText(column);
  }
}
