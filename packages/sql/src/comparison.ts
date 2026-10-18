import * as WebdaQL from "@webda/ql";
import type { SQLDialect } from "./dialect.js";
import { sqlString } from "./dialect.js";

/**
 * Extends ComparisonExpression to emit SQL for JSON comparisons
 *
 * With the JSON path of the attribute (`jsonAttribute`), comparisons follow the in-memory semantics:
 * - a number or a boolean only matches a JSON number or boolean: a missing field, a null or another type never
 *   matches, and never raises a cast error;
 * - `!=` matches a missing field, a null or another type (null-safe inequality);
 * - strings compare the text of the value, so a number field equals its text (`n = '1'`), as the loose `==` does;
 * - `CONTAINS` only matches an array holding the value.
 */
export class SQLComparisonExpression extends WebdaQL.ComparisonExpression {
  /**
   * @param operator - the comparison operator
   * @param attribute - the SQL text of the attribute
   * @param value - the value
   * @param dialect - the engine syntax
   * @param jsonAttribute - the SQL JSON value of the attribute, for typed comparisons
   */
  constructor(
    operator: WebdaQL.ComparisonOperator,
    attribute: string,
    value: any,
    protected readonly dialect: SQLDialect,
    protected readonly jsonAttribute?: string
  ) {
    super(operator, attribute, value);
  }

  /**
   * @override
   * @param value - the value to stringify
   * @returns SQL-compatible literal
   */
  toStringValue(value: Parameters<WebdaQL.ComparisonExpression["toStringValue"]>[0]): string {
    if (typeof value === "string") {
      return sqlString(value);
    }
    return super.toStringValue(value);
  }

  /**
   * @override
   * @returns SQL attribute expression, typed when the value is a number or a boolean
   */
  toStringAttribute(): string {
    const text = this.attribute.join(".");
    if (this.jsonAttribute && (typeof this.value === "number" || typeof this.value === "boolean")) {
      return this.dialect.typedAttribute(text, this.jsonAttribute, typeof this.value as "number" | "boolean");
    }
    return text;
  }

  /**
   * @override
   * @returns the SQL condition
   */
  toString(): string {
    if (WebdaQL.UNARY_COMPARISON_OPERATORS.includes(this.operator)) {
      return `${this.attribute.join(".")} ${this.operator}`;
    }
    if (this.operator === "CONTAINS" && this.jsonAttribute) {
      return this.dialect.contains(this.jsonAttribute, this.value as string | number | boolean);
    }
    if (this.operator === "!=") {
      return this.dialect.distinctFrom(this.toStringAttribute(), this.toStringValue(this.value));
    }
    if (this.operator === "LIKE" && typeof this.value === "string") {
      return this.dialect.like(this.toStringAttribute(), this.value);
    }
    return super.toString();
  }
}
