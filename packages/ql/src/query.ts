import { CharStreams, CommonTokenStream, RecognitionException, Recognizer, Token } from "antlr4ts";
import { AbstractParseTreeVisitor, ParseTree, TerminalNode } from "antlr4ts/tree/index.js";
import { WebdaQLLexer } from "./WebdaQLLexer.js";
import {
  AndLogicExpressionContext,
  AssignmentContext,
  AtomExpressionContext,
  BinaryComparisonExpressionContext,
  BooleanLiteralContext,
  ContainsExpressionContext,
  CountAllItemContext,
  CountDistinctItemContext,
  DeleteStatementContext,
  ExpressionContext,
  FieldItemContext,
  FieldListContext,
  FilterQueryContext,
  InExpressionContext,
  IntegerLiteralContext,
  IsNotNullExpressionContext,
  IsNullExpressionContext,
  LikeExpressionContext,
  LimitExpressionContext,
  MetricItemContext,
  NumberLiteralContext,
  OffsetExpressionContext,
  OrLogicExpressionContext,
  OrderExpressionContext,
  OrderFieldExpressionContext,
  ParameterContext,
  SelectStatementContext,
  SetExpressionContext,
  StatementContext,
  StringLiteralContext,
  SubExpressionContext,
  UpdateStatementContext,
  WebdaQLParserParser,
  WebdaqlContext
} from "./WebdaQLParserParser.js";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor.js";
import {
  checkAlias,
  validateAggregation,
  type AggregateFunction,
  type AggregationQuery,
  type Metric
} from "./aggregation.js";
import { escapeValue, WebdaQLError } from "./webdaql-string.js";

/**
 * Primitive value types supported by WebdaQL expressions
 */
type value = boolean | string | number;

/**
 * Kind of statement a query is: a plain filter is an implicit `SELECT` of every field
 */
export type QueryType = "SELECT" | "DELETE" | "UPDATE";

/**
 * One `field = value` of an `UPDATE SET`
 */
export interface Assignment {
  /** Field path (dot-notation for nested attributes) */
  field: string;
  /** Value to assign */
  value: value;
}

/**
 * Strip the quotes of a WebdaQL string literal and unescape its contents.
 *
 * Processes the inner text (between outer quotes) with these rules, applied left-to-right:
 * - `\\` → `\` (escaped backslash)
 * - `\` followed by the literal's quote char → the quote char (backslash-escaped quote)
 * - the quote char doubled → one quote char (SQL-style doubled quote)
 * - any other `\x` → `\x` kept verbatim (so LIKE's `\%` and `\_` reach likeToRegex unchanged)
 *
 * @param literal - the literal including its surrounding quotes
 * @returns the literal value
 */
export function unescapeStringLiteral(literal: string): string {
  const quote = literal[0];
  const inner = literal.substring(1, literal.length - 1);
  let result = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\") {
      if (i + 1 < inner.length) {
        const next = inner[i + 1];
        if (next === "\\") {
          // \\ → \
          result += "\\";
          i++;
        } else if (next === quote) {
          // \' or \" → ' or "
          result += quote;
          i++;
        } else {
          // other \x → \x (kept verbatim, e.g., \%, \_, etc.)
          result += "\\";
        }
      } else {
        // trailing backslash
        result += "\\";
      }
    } else if (inner[i] === quote && i + 1 < inner.length && inner[i + 1] === quote) {
      // '' or "" → ' or "
      result += quote;
      i++;
    } else {
      result += inner[i];
    }
  }
  return result;
}

/**
 * Represents a single ORDER BY clause field with its sort direction
 */
export interface OrderBy {
  /** Field name (supports dot-notation for nested attributes) */
  field: string;
  /** Sort direction */
  direction: "ASC" | "DESC";
}

/**
 * Prepend a condition to an existing query string using AND logic
 *
 * Parses both strings, merges them, and reconstructs the combined query.
 * The statement head (`SELECT fields`, `DELETE`, `UPDATE SET ...`) and the ORDER BY, LIMIT, and OFFSET clauses
 * of the original query are preserved; the condition joins the WHERE part. Both sides keep their own grouping:
 * `a OR b` merged with `c OR d` is `( a OR b ) AND ( c OR d )`.
 *
 * @param query - existing query string (a plain filter or a statement, may include ORDER BY / LIMIT / OFFSET)
 * @param condition - condition to prepend (a plain filter: a statement is refused)
 * @returns merged query string
 * @throws {SyntaxError} if the condition is a statement, or adds ORDER BY / OFFSET to a DELETE or UPDATE
 *
 * @example
 * ```ts
 * PrependCondition("status = 'active' ORDER BY name LIMIT 10", "age > 18")
 * // => 'status = "active" AND age > 18 ORDER BY name LIMIT 10'
 * ```
 */
export function PrependCondition(query: string = "", condition?: string): string {
  return new QueryValidator(query).merge(condition).toString();
}
/**
 * ANTLR parse tree visitor that builds an optimized Expression AST from the parsed tokens
 *
 * Converts the ANTLR parse tree into a flat, evaluatable expression tree.
 * Automatically flattens nested AND/OR expressions of the same type to reduce depth.
 */
export class ExpressionBuilder extends AbstractParseTreeVisitor<Query> implements WebdaQLParserVisitor<any> {
  /**
   * Parsed LIMIT value, if present
   */
  limit: number;
  /**
   * Parsed OFFSET continuation token, if present
   */
  offset: string;
  /**
   * Parsed ORDER BY clauses, if present
   */
  orderBy: OrderBy[];

  /**
   * Default result when no expression is matched (empty AND, always true)
   * @returns an empty AND query
   */
  protected defaultResult(): Query {
    // An empty AND return true
    return {
      type: "SELECT",
      filter: new AndExpression([])
    };
  }

  /**
   * Get parsed OFFSET continuation token
   * @returns the offset token
   */
  getOffset(): string {
    return this.offset;
  }

  /**
   * Get parsed LIMIT value
   * @returns the limit value
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Visit a LIMIT clause and store the integer value
   * @param ctx - the limit expression context
   */
  visitLimitExpression(ctx: LimitExpressionContext) {
    this.limit = this.visit(ctx.getChild(1)) as unknown as number;
  }

  /**
   * Visit an OFFSET clause and store the string continuation token
   * @param ctx - the offset expression context
   */
  visitOffsetExpression(ctx: OffsetExpressionContext) {
    this.offset = this.visit(ctx.getChild(1)) as unknown as string;
  }

  /**
   * Visit a order field expression
   * @param ctx - the order field expression context
   * @returns the parsed OrderBy
   */
  visitOrderFieldExpression(ctx: OrderFieldExpressionContext): OrderBy {
    return {
      field: ctx.getChild(0).text,
      direction: ctx.childCount > 1 ? (ctx.getChild(1).text as any) : "ASC"
    };
  }

  /**
   * Read the order by values
   * @param ctx - the order expression context
   */
  visitOrderExpression(ctx: OrderExpressionContext): void {
    this.orderBy = ctx.children
      ?.filter(c => c instanceof OrderFieldExpressionContext)
      .map((c: OrderFieldExpressionContext) => this.visitOrderFieldExpression(c));
  }

  /**
   * Visit the root `webdaql` rule and build the complete Query: a statement or a plain filter query
   * @param ctx - the webdaql parse context
   * @returns the built Query
   */
  visitWebdaql(ctx: WebdaqlContext): Query {
    return ctx.statement() ? this.visitStatement(ctx.statement()) : this.visitFilterQuery(ctx.filterQuery());
  }

  /**
   * Visit a DELETE, UPDATE or SELECT statement
   * @param ctx - the statement context
   * @returns the built Query
   */
  visitStatement(ctx: StatementContext): Query {
    return this.visit(ctx.getChild(0));
  }

  /**
   * Visit a plain filter query: an implicit SELECT of every field
   *
   * Parses filter expression, ORDER BY, LIMIT, and OFFSET clauses.
   * Returns an empty AND expression (always true) when no filter is present.
   * @param ctx - the filter query context
   * @returns the built Query
   */
  visitFilterQuery(ctx: FilterQueryContext): Query {
    return this.buildQuery("SELECT", ctx.expression(), ctx);
  }

  /**
   * Visit `DELETE [WHERE ...] [LIMIT n]`
   * @param ctx - the DELETE statement context
   * @returns the built Query
   */
  visitDeleteStatement(ctx: DeleteStatementContext): Query {
    return this.buildQuery("DELETE", ctx.whereClause()?.expression(), ctx);
  }

  /**
   * Visit `UPDATE SET a = v, ... [WHERE ...] [LIMIT n]`
   * @param ctx - the UPDATE statement context
   * @returns the built Query
   */
  visitUpdateStatement(ctx: UpdateStatementContext): Query {
    return {
      ...this.buildQuery("UPDATE", ctx.whereClause()?.expression(), ctx),
      assignments: ctx
        .assignmentList()
        .assignment()
        .map(a => this.visitAssignment(a))
    };
  }

  /**
   * Visit a SELECT statement: a field list, or an aggregation when it has metrics or a GROUP BY
   * @param ctx - the select statement context
   * @returns the query
   */
  visitSelectStatement(ctx: SelectStatementContext): Query {
    const query: Query = { ...this.buildQuery("SELECT", ctx.whereClause()?.expression(), ctx) };
    const { fields, metrics } = this.visitFieldList(ctx.fieldList());
    query.fields = fields;
    const groupBy = ctx
      .groupByExpression()
      ?.identifier()
      .map(identifier => identifier.text);
    if (!Object.keys(metrics).length && groupBy === undefined) {
      return query;
    }
    if (query.continuationToken !== undefined) {
      throw new WebdaQLError("OFFSET is not supported with GROUP BY or aggregate functions");
    }
    const by = groupBy ?? [];
    if (fields.length !== by.length || fields.some(field => !by.includes(field))) {
      throw new WebdaQLError("With aggregate functions, the selected fields must be exactly the GROUP BY fields");
    }
    query.aggregation = validateAggregation({
      filter: query.filter,
      groupBy: by,
      metrics,
      orderBy: query.orderBy?.map(order => ({ key: order.field, direction: order.direction })),
      limit: query.limit
    });
    return query;
  }

  /**
   * Read one `field = value` of an UPDATE SET
   * @param ctx - the assignment context
   * @returns the assignment
   */
  visitAssignment(ctx: AssignmentContext): Assignment {
    return {
      field: ctx.identifier().text,
      value: this.visit(ctx.getChild(2)) as unknown as value
    };
  }

  /**
   * Read the field list of a SELECT: plain fields and aggregate metrics
   * @param ctx - the field list context
   * @returns the field paths and the metrics by alias
   */
  visitFieldList(ctx: FieldListContext): { fields: string[]; metrics: Record<string, Metric> } {
    const fields: string[] = [];
    const metrics: Record<string, Metric> = {};
    const add = (alias: string, metric: Metric) => {
      // Before assigning: a `__proto__` alias would otherwise change the prototype of `metrics`
      checkAlias(alias);
      if (Object.prototype.hasOwnProperty.call(metrics, alias)) {
        throw new WebdaQLError(`Duplicate metric alias '${alias}'`);
      }
      metrics[alias] = metric;
    };
    for (const item of ctx.selectItem()) {
      if (item instanceof FieldItemContext) {
        fields.push(item.identifier().text);
      } else if (item instanceof CountAllItemContext) {
        add(item.identifier().text, { fn: "COUNT" });
      } else if (item instanceof CountDistinctItemContext) {
        add(item.identifier(1).text, { fn: "COUNT_DISTINCT", field: item.identifier(0).text });
      } else if (item instanceof MetricItemContext) {
        add(item.identifier(1).text, {
          fn: item.getChild(0).text as AggregateFunction,
          field: item.identifier(0).text
        });
      }
    }
    return { fields, metrics };
  }

  /**
   * Visit a parenthesised expression: the inner expression
   * @param ctx - the sub expression context
   * @returns the inner expression
   */
  visitSubExpression(ctx: SubExpressionContext): Expression {
    return this.visit(ctx.expression()) as unknown as Expression;
  }

  /**
   * Build the Query of a statement or filter query: its condition and its ORDER BY, LIMIT and OFFSET clauses
   * @param type - the statement type
   * @param expression - the condition, if any
   * @param ctx - the statement context holding the optional clauses
   * @returns the Query
   */
  protected buildQuery(
    type: QueryType,
    expression: ExpressionContext | undefined,
    ctx: FilterQueryContext | DeleteStatementContext | UpdateStatementContext | SelectStatementContext
  ): Query {
    for (const clause of [
      "orderExpression" in ctx ? ctx.orderExpression() : undefined,
      ctx.limitExpression(),
      "offsetExpression" in ctx ? ctx.offsetExpression() : undefined
    ]) {
      if (clause) {
        this.visit(clause);
      }
    }
    return {
      type,
      filter: normalizeFilter(
        (expression ? (this.visit(expression) as unknown as Expression) : undefined) || new AndExpression([])
      ),
      limit: this.limit,
      continuationToken: this.offset,
      orderBy: this.orderBy
    };
  }

  /**
   * Recursively flatten nested logical expressions of the same type
   *
   * ANTLR produces right-recursive trees like `a AND (b AND (c AND d))`.
   * This method flattens them into `[a, b, c, d]` so a single LogicalExpression
   * holds all children at one level.
   *
   * @param ctx - an AND or OR logical expression context
   * @returns flat array of child parse tree nodes
   */
  getComparison(ctx: AndLogicExpressionContext | OrLogicExpressionContext): any[] {
    const res = [];
    // eslint-disable-next-line prefer-const
    let [left, _, right] = ctx.children;
    if (right instanceof SubExpressionContext) {
      right = right.getChild(1);
    }
    if (left instanceof SubExpressionContext) {
      left = left.getChild(1);
    }
    if (left instanceof ctx.constructor) {
      res.push(...this.getComparison(left as unknown as AndLogicExpressionContext | OrLogicExpressionContext));
    } else {
      res.push(left);
    }
    if (right instanceof ctx.constructor) {
      res.push(...this.getComparison(right as unknown as AndLogicExpressionContext | OrLogicExpressionContext));
    } else {
      res.push(right);
    }
    return res;
  }

  /**
   * Get the AndExpression, regrouping all the parameters
   *
   * By default the parser is doing a AND (b AND (c AND d)) creating 3 depth expressions
   * This visitor simplify to a AND b AND c AND d with only one Expression
   * @param ctx - the AND logic expression context
   * @returns the flattened AndExpression
   */
  visitAndLogicExpression(ctx: AndLogicExpressionContext): Expression {
    return foldLogical(
      "AND",
      this.getComparison(ctx).map(c => this.visit(c) as unknown as Expression)
    );
  }

  /**
   * Implement the BinaryComparison with all methods managed
   * @param ctx - the binary comparison context
   * @returns the comparison expression
   */
  visitBinaryComparisonExpression(ctx: BinaryComparisonExpressionContext) {
    const [left, op, right] = ctx.children;
    // @ts-ignore
    return new ComparisonExpression(op.text, left.text, this.visit(right));
  }

  /**
   * Visit each value of the [..., ..., ...] set
   * @param ctx - the set expression context
   * @returns the array of values
   */
  visitSetExpression(ctx: SetExpressionContext): value[] {
    return ctx.children.filter((_i, id) => id % 2).map(c => this.visit(c)) as unknown as value[];
  }

  /**
   * Visit a LIKE expression (e.g. `field LIKE '%pattern_'`)
   * @param ctx - the LIKE expression context
   * @returns the comparison expression
   */
  visitLikeExpression(ctx: LikeExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new ComparisonExpression("LIKE", left.text, value);
  }

  /**
   * Map the a IN ['b','c']
   * @param ctx - the IN expression context
   * @returns the comparison expression
   */
  visitInExpression(ctx: InExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new ComparisonExpression("IN", left.text, value);
  }

  /**
   * Map the a CONTAINS 'b'
   * @param ctx - the CONTAINS expression context
   * @returns the comparison expression
   */
  visitContainsExpression(ctx: ContainsExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new ComparisonExpression("CONTAINS", left.text, value);
  }

  /**
   * Map the a IS NULL
   * @param ctx - the IS NULL expression context
   * @returns the comparison expression
   */
  visitIsNullExpression(ctx: IsNullExpressionContext) {
    return new ComparisonExpression("IS NULL", ctx.getChild(0).text, null);
  }

  /**
   * Map the a IS NOT NULL
   * @param ctx - the IS NOT NULL expression context
   * @returns the comparison expression
   */
  visitIsNotNullExpression(ctx: IsNotNullExpressionContext) {
    return new ComparisonExpression("IS NOT NULL", ctx.getChild(0).text, null);
  }

  /**
   * Get the OrExpression, regrouping all the parameters
   *
   * By default the parser is doing a OR (b OR (c OR d)) creating 3 depth expressions
   * This visitor simplify to a OR b OR c OR d with only one Expression
   * @param ctx - the OR logic expression context
   * @returns the flattened OrExpression
   */
  visitOrLogicExpression(ctx: OrLogicExpressionContext): Expression {
    return foldLogical(
      "OR",
      this.getComparison(ctx).map(c => this.visit(c) as unknown as Expression)
    );
  }

  /**
   * A bare atom used as an expression: only `TRUE` / `FALSE` are valid
   * @param ctx - the atom expression context
   * @returns the constant expression
   * @throws {SyntaxError} for identifiers, numbers and strings
   */
  visitAtomExpression(ctx: AtomExpressionContext): Expression {
    const value = this.visit(ctx.getChild(0));
    if (typeof value === "boolean") {
      return new BooleanExpression(value);
    }
    throw new SyntaxError(`Expected an expression, got '${ctx.text}'`);
  }

  /**
   * Read a string literal, stripping the surrounding single or double quotes
   * @param ctx - the string literal context
   * @returns the unquoted string value
   */
  visitStringLiteral(ctx: StringLiteralContext): string {
    return unescapeStringLiteral(ctx.text);
  }

  /**
   * Read the boolean literal
   * @param ctx - the boolean literal context
   * @returns the boolean value
   */
  visitBooleanLiteral(ctx: BooleanLiteralContext): boolean {
    return "TRUE" === ctx.text;
  }

  /**
   * Read the number literal
   * @param ctx - the integer literal context
   * @returns the parsed integer value
   */
  visitIntegerLiteral(ctx: IntegerLiteralContext): number {
    return parseInt(ctx.text);
  }

  /**
   * Read a signed or decimal number literal
   * @param ctx - the number literal context
   * @returns the parsed number
   */
  visitNumberLiteral(ctx: NumberLiteralContext): number {
    return parseFloat(ctx.text);
  }

  /**
   * A `?` or `:name` placeholder reaching evaluation was never bound
   * @param ctx - the parameter context
   * @throws {WebdaQLError} always: use `bind()` or pass the parameters to `query()`
   */
  visitParameter(ctx: ParameterContext): never {
    throw new WebdaQLError(
      `Unbound parameter '${ctx.text}' in WebdaQL query: pass its value with the query parameters`
    );
  }
}

/**
 * Represent a full Query
 */
export interface Query {
  /**
   * Filtering part of the expression
   */
  filter: Expression;
  /**
   * Limit value
   */
  limit?: number;
  /**
   * Offset value
   */
  continuationToken?: string;
  /**
   * Order by clause
   */
  orderBy?: OrderBy[];
  /**
   * Statement type: `SELECT` for a plain filter query (an implicit SELECT of every field) and an explicit SELECT
   */
  type: QueryType;
  /**
   * Field list of an explicit `SELECT f1, f2`; undefined means every field
   */
  fields?: string[];
  /**
   * Assignments of an `UPDATE SET`
   */
  assignments?: Assignment[];
  /**
   * Aggregation of a `SELECT … GROUP BY` or a SELECT with aggregate functions
   */
  aggregation?: AggregationQuery;
  /**
   * Get the string representation of the query
   */
  toString(): string;
}

/**
 * Represent the query expression or subset
 */
export abstract class Expression<T = string> {
  operator: T;

  /** Create a new Expression.
   * @param operator - the expression operator
   */
  constructor(operator: T) {
    this.operator = operator;
  }

  /**
   * Evaluate the expression for the target object
   * @param target to evaluate
   */
  abstract eval(target: any): boolean;
  /**
   * Return the representation of the expression
   * @param depth
   */
  abstract toString(depth?: number): string;
}

/**
 * All supported comparison operators
 *
 * - `=` / `!=` use loose equality (`==` / `!=`)
 * - `<`, `<=`, `>`, `>=` use standard JS comparison
 * - `LIKE` uses SQL-style pattern matching (`%` = any chars, `_` = single char)
 * - `IN` checks membership in a set (`field IN ['a', 'b']`)
 * - `CONTAINS` checks if an array field contains a value (`field CONTAINS 'a'`)
 * - `IS NULL` matches a missing, `undefined` or `null` field (`field IS NULL`)
 * - `IS NOT NULL` matches any other value (`field IS NOT NULL`)
 */
export type ComparisonOperator =
  "=" | "<=" | ">=" | "<" | ">" | "!=" | "LIKE" | "IN" | "CONTAINS" | "IS NULL" | "IS NOT NULL";

/**
 * Comparison operators that take no value
 */
export const UNARY_COMPARISON_OPERATORS: readonly ComparisonOperator[] = ["IS NULL", "IS NOT NULL"];

/**
 * A leaf expression comparing an object attribute against a literal value
 *
 * Supports dot-notation for nested attribute access (e.g. `user.profile.name`).
 *
 * @typeParam T - the specific comparison operator type
 */
export class ComparisonExpression<T extends ComparisonOperator = ComparisonOperator> extends Expression<T> {
  /**
   * Right side of the comparison
   */
  value: value | value[];
  /**
   * Attribute to read from the object (split by .)
   */
  attribute: string[];
  /**
   * @param operator - comparison operator
   * @param attribute - dot-notation path to the object property (e.g. `"user.name"`)
   * @param value - literal value or array of values (for IN operator) to compare against
   */
  constructor(operator: T, attribute: string, value: value | any[]) {
    super(operator);
    this.value = value;
    this.attribute = attribute.split(".");
  }

  /**
   * Convert a SQL LIKE pattern to a JavaScript RegExp
   *
   * - `%` matches zero or more characters
   * - `_` matches exactly one character
   * - `\%` and `\_` are literal percent/underscore
   * - Common regex metacharacters are escaped
   *
   * @param like - SQL LIKE pattern string
   * @returns compiled RegExp
   */
  static likeToRegex(like: string): RegExp {
    return new RegExp(
      like
        // Prevent common regexp chars
        .replace(/\?/g, "\\?")
        .replace(/\[/g, "\\[")
        .replace(/\{/g, "\\{")
        .replace(/\(/g, "\\(")
        // Update % and _ to match regex version
        .replace(/([^\\])_/g, "$1.{1}")
        .replace(/^_/g, ".{1}")
        .replace(/\\_/g, "_")
        .replace(/([^\\])%/g, "$1.*")
        .replace(/^%/g, ".*")
        .replace(/\\%/g, "%")
        // Replace backslash aswell
        .replace(/\\([^?[{(])/g, "\\\\")
    );
  }

  /**
   * Traverse an object using a dot-notation attribute path
   *
   * @param target - object to read from
   * @param attribute - path segments (e.g. `["user", "profile", "name"]`)
   * @returns the resolved value, or `undefined` if any segment is missing
   */
  static getAttributeValue(target: any, attribute: string[]): any {
    let res = target;
    for (let i = 0; res && i < attribute.length; i++) {
      res = res[attribute[i]];
    }
    return res;
  }

  /**
   * Set the value of the attribute based on the assignment
   *
   * If used as a Set expression
   * @param target - the object to assign to
   */
  setAttributeValue(target: any) {
    // Avoid alteration of prototype for security reason
    if (this.attribute.includes("__proto__")) {
      return;
    }
    if (this.operator === "=") {
      let res = target;
      for (let i = 0; res && i < this.attribute.length - 1; i++) {
        res[this.attribute[i]] ??= {};
        res = res[this.attribute[i]];
      }
      res[this.attribute[this.attribute.length - 1]] = this.value;
    }
  }
  /**
   * @override
   */
  eval(target: any): boolean {
    const left = ComparisonExpression.getAttributeValue(target, this.attribute);
    switch (this.operator) {
      case "=":
        // ignore strong type on purpose
        return left == this.value;
      case "<=":
        return left <= this.value;
      case ">=":
        return left >= this.value;
      case "<":
        return left < this.value;
      case ">":
        return left > this.value;
      case "!=":
        return left != this.value;
      case "LIKE":
        if (left === undefined || left === null) {
          return false;
        }
        if (typeof left === "string") {
          // Grammar definie value as stringLiteral
          return left.match(ComparisonExpression.likeToRegex(this.value as string)) !== null;
        }
        return left.toString().match(ComparisonExpression.likeToRegex(this.value as string)) !== null;
      case "IN":
        return (this.value as value[]).includes(left);
      case "CONTAINS":
        if (Array.isArray(left)) {
          return left.includes(this.value);
        }
        return false;
      case "IS NULL":
        return left === undefined || left === null;
      case "IS NOT NULL":
        return left !== undefined && left !== null;
    }
  }

  /**
   * Serialize a value to its WebdaQL string representation
   *
   * Strings are double-quoted, booleans are uppercased, arrays are bracket-wrapped.
   * @param value - the value to serialize
   * @returns the serialized string
   */
  toStringValue(value: value | value[]): string {
    if (Array.isArray(value)) {
      return `[${value.map(v => this.toStringValue(v)).join(", ")}]`;
    }
    switch (typeof value) {
      case "string":
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '""')}"`;
      case "boolean":
        return value.toString().toUpperCase();
    }
    return value?.toString();
  }

  /**
   * Allow subclass to create different display
   * @returns the attribute string
   */
  toStringAttribute() {
    return this.attribute.join(".");
  }

  /**
   * Allow subclass to create different display
   * @returns the operator string
   */
  toStringOperator() {
    return this.operator;
  }

  /**
   * @override
   */
  toString() {
    if (UNARY_COMPARISON_OPERATORS.includes(this.operator)) {
      return `${this.toStringAttribute()} ${this.toStringOperator()}`;
    }
    return `${this.toStringAttribute()} ${this.toStringOperator()} ${this.toStringValue(this.value)}`;
  }
}

/**
 * Abstract base for logical expressions that combine child expressions (AND / OR)
 *
 * @typeParam T - the literal operator type (`"AND"` or `"OR"`)
 */
export abstract class LogicalExpression<T> extends Expression<T> {
  /**
   * Child expressions combined by this logical operator
   */
  children: Expression[] = [];

  /**
   * @param operator - logical operator
   * @param children - child expressions to combine
   */
  constructor(operator: T, children: Expression[]) {
    super(operator);
    this.children = children;
  }

  /**
   * @override
   */
  toString(depth: number = 0) {
    if (depth) {
      return "( " + this.children.map(c => c.toString(depth + 1)).join(` ${this.operator} `) + " )";
    }
    return this.children.map(c => c.toString(depth + 1)).join(` ${this.operator} `);
  }
}

/**
 * Logical AND expression — evaluates to `true` only if all children are `true`
 *
 * Uses short-circuit evaluation: returns `false` as soon as any child fails.
 * An empty AND (no children) evaluates to `true`.
 */
export class AndExpression extends LogicalExpression<"AND"> {
  /**
   * @param children Expressions to use for AND
   */
  constructor(children: Expression[]) {
    super("AND", children);
  }

  /**
   * @override
   */
  eval(target: any): boolean {
    for (const child of this.children) {
      if (!child.eval(target)) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Logical OR expression — evaluates to `true` if any child is `true`
 *
 * Uses short-circuit evaluation: returns `true` as soon as any child passes.
 * An empty OR (no children) evaluates to `true`.
 */
export class OrExpression extends LogicalExpression<"OR"> {
  /**
   * @param children Expressions to use for OR
   */
  constructor(children: Expression[]) {
    super("OR", children);
  }

  /**
   * @override
   */
  eval(target: any): boolean {
    for (const child of this.children) {
      if (child.eval(target)) {
        return true;
      }
    }
    return this.children.length === 0;
  }
}

/**
 * Constant expression from a `TRUE` / `FALSE` literal
 *
 * Constants are folded while the tree is built (see `foldLogical`), so this only
 * remains when the whole filter is `FALSE`; a filter that is entirely `TRUE` is
 * the match-everything `AndExpression([])`.
 */
export class BooleanExpression extends Expression<"TRUE" | "FALSE"> {
  /**
   * The constant value
   */
  value: boolean;

  /**
   * @param value - the constant value
   */
  constructor(value: boolean) {
    super(value ? "TRUE" : "FALSE");
    this.value = value;
  }

  /**
   * @override
   */
  eval(_target: any): boolean {
    return this.value;
  }

  /**
   * @override
   */
  toString(): string {
    return this.operator;
  }
}

/**
 * Build an AND / OR expression, folding `TRUE` / `FALSE` constants away
 *
 * AND drops TRUE and is FALSE as soon as one child is FALSE; OR drops FALSE and is
 * TRUE as soon as one child is TRUE. A constant only remains when every child was one.
 * @param operator - the logical operator
 * @param children - the visited child expressions
 * @returns the folded expression
 */
function foldLogical(operator: "AND" | "OR", children: Expression[]): Expression {
  // The constant that decides the whole expression: FALSE for AND, TRUE for OR
  const decisive = operator === "OR";
  const kept: Expression[] = [];
  for (const child of children) {
    if (child instanceof BooleanExpression) {
      if (child.value === decisive) {
        return child;
      }
      continue;
    }
    kept.push(child);
  }
  if (kept.length === 0) {
    return new BooleanExpression(!decisive);
  }
  return operator === "AND" ? new AndExpression(kept) : new OrExpression(kept);
}

/**
 * Turn a filter that is entirely `TRUE` into the match-everything expression
 * @param filter - the top-level filter
 * @returns the filter stores understand
 */
function normalizeFilter(filter: Expression): Expression {
  return filter instanceof BooleanExpression && filter.value ? new AndExpression([]) : filter;
}

/**
 * Error listener turning lexer and parser errors into exceptions
 *
 * Without it, ANTLR logs the error and recovers: an unknown character was dropped,
 * so `x = #1` was evaluated as `x = 1`.
 *
 * @param sql - the query, for the error message
 * @returns the error listener
 */
function throwingErrorListener(sql: string) {
  return {
    syntaxError: (
      _recognizer: Recognizer<any, any>,
      _offendingSymbol: any,
      _line: number,
      _charPositionInLine: number,
      msg: string,
      _e: RecognitionException | undefined
    ) => {
      throw new SyntaxError(`${msg} (Query: ${sql})`);
    }
  };
}

/**
 * Create a lexer and a parser for a query, both throwing on errors
 * @param sql - the query string
 * @returns the lexer and the parser
 */
function createParser(sql: string): { lexer: WebdaQLLexer; parser: WebdaQLParserParser } {
  const lexer = new WebdaQLLexer(CharStreams.fromString(sql || ""));
  lexer.removeErrorListeners();
  lexer.addErrorListener(throwingErrorListener(sql));
  const parser = new WebdaQLParserParser(new CommonTokenStream(lexer));
  parser.removeErrorListeners();
  parser.addErrorListener(throwingErrorListener(sql));
  return { lexer, parser };
}

/**
 * Check a query against the WebdaQL grammar without evaluating it
 *
 * Unlike {@link QueryValidator}, unbound `?` / `:name` parameters are accepted, so a
 * query can be checked before its parameters are bound.
 *
 * @param query - the query string
 * @throws {SyntaxError} if the query does not follow the grammar
 */
export function validateSyntax(query: string): void {
  createParser(query).parser.webdaql();
}

/**
 * Parses a WebdaQL query string and provides evaluation, merging, and serialization
 *
 * This is the main entry point for working with WebdaQL queries. It handles:
 * - Parsing query strings via ANTLR into an expression AST
 * - Evaluating objects against the parsed filter
 * - Merging multiple queries together
 * - Serializing back to a query string
 *
 * @example
 * ```ts
 * const validator = new QueryValidator("status = 'active' AND age > 18 LIMIT 50");
 * validator.eval({ status: "active", age: 25 }); // true
 * validator.getLimit(); // 50
 * ```
 */
export class QueryValidator {
  protected lexer: WebdaQLLexer;
  protected tree: WebdaqlContext;
  protected query: Query;
  protected builder: ExpressionBuilder;

  /**
   * Parse a WebdaQL query string
   *
   * @param sql - the query string to parse
   * @param builder - expression builder to use (override for custom expression types)
   * @throws {SyntaxError} if the query string is malformed
   */
  constructor(
    protected sql: string,
    builder: ExpressionBuilder = new ExpressionBuilder()
  ) {
    const { lexer, parser } = createParser(sql);
    this.lexer = lexer;
    // Parse the input, where `compilationUnit` is whatever entry point you defined
    this.tree = parser.webdaql();
    this.builder = builder;
    this.query = this.builder.visit(this.tree);
  }

  /**
   * Get parsed OFFSET continuation token, or empty string if none
   * @returns the offset token
   */
  getOffset(): string {
    return this.builder.getOffset() || "";
  }

  /**
   * Check whether the query has a non-empty filter condition
   *
   * An empty AND expression (no children) is considered to have no condition.
   * @returns true if there is a filter condition
   */
  hasCondition() {
    const filter = this.query.filter;
    const isAnd = filter instanceof AndExpression;
    if (isAnd) {
      return filter.children.length > 0;
    }
    return true;
  }

  /**
   * Reconstruct the query string from the parsed AST
   *
   * Includes filter, ORDER BY, LIMIT, and OFFSET clauses.
   * @returns the reconstructed query string
   */
  toString() {
    return stringifyQuery(this.query);
  }

  /**
   * Merge another query string into this query
   *
   * Filter expressions are combined using the specified logical operator.
   * LIMIT, OFFSET, and ORDER BY from the merged query override existing values.
   *
   * @param query - query string to merge in
   * @param type - logical operator to combine filters (`"AND"` or `"OR"`)
   * @returns `this` for chaining
   */
  merge(query: string, type: "OR" | "AND" = "AND"): this {
    const adds = new QueryValidator(query);
    if (adds.query.type !== "SELECT" || adds.query.fields) {
      throw new SyntaxError(`Only a filter can be merged into a query, not a statement (Query: ${query})`);
    }
    if (
      (this.query.type === "DELETE" || this.query.type === "UPDATE") &&
      (adds.query.orderBy || adds.query.continuationToken)
    ) {
      throw new SyntaxError(`${this.query.type} statements take no ORDER BY or OFFSET (Query: ${query})`);
    }
    // Add additional conditions
    if (adds.hasCondition()) {
      if (
        (this.query.filter instanceof AndExpression && type === "AND") ||
        (this.query.filter instanceof OrExpression && type === "OR")
      ) {
        this.query.filter.children.push(adds.query.filter);
      } else {
        this.query.filter = new (type === "AND" ? AndExpression : OrExpression)([this.query.filter, adds.query.filter]);
      }
    }
    // Set the limit if overriden
    if (adds.query.limit !== undefined) {
      this.query.limit = adds.query.limit;
    }
    // Set the offset if overriden
    if (adds.query.continuationToken) {
      this.query.continuationToken = adds.query.continuationToken;
    }
    // Add the order by if overriden
    if (adds.query.orderBy) {
      const fields = adds.query.orderBy.map(o => o.field);
      this.query.orderBy ??= [];
      // Remove the fields that are already in the query
      this.query.orderBy = [...adds.query.orderBy, ...this.query.orderBy.filter(o => !fields.includes(o.field))];
    }
    return this;
  }

  /**
   * Get parsed LIMIT value, defaulting to 1000
   * @returns the limit value
   */
  getLimit(): number {
    return this.builder.getLimit() || 1000;
  }

  /**
   * Get the filter expression (without LIMIT / OFFSET / ORDER BY)
   * @returns the filter expression
   */
  getExpression(): Expression {
    return this.query.filter;
  }

  /**
   * Retrieve the full parsed query including filter, limit, offset, and orderBy
   * @returns the full query object
   */
  getQuery(): Query {
    const query: Query = { ...this.query };
    // Print the current state of the query, so a caller changing its LIMIT or OFFSET prints the new values
    query.toString = () => stringifyQuery(query);
    return query;
  }

  /**
   * Verify if a target fit the expression
   * @param target - the object to evaluate
   * @returns true if the target matches
   */
  eval(target: any) {
    return this.query.filter.eval(target);
  }

  /**
   * Display parse tree back as query
   * @param tree - the parse tree to display
   * @returns the query string representation
   */
  displayTree(tree: ParseTree = this.tree): string {
    let res = "";
    for (let i = 0; i < tree.childCount; i++) {
      const child = tree.getChild(i);
      if (child instanceof TerminalNode) {
        if (child.text === "<EOF>") {
          continue;
        }
        res += child.text.trim() + " ";
      } else {
        res += this.displayTree(child).trim() + " ";
      }
    }
    return res;
  }
}

/**
 * A query validator that operates in assignment mode
 *
 * Instead of filtering objects, it assigns values to object properties.
 * Only supports `=` (assignment) combined with `AND`. No comparisons, OR, or other operators.
 *
 * Protects against prototype pollution by ignoring `__proto__` attributes.
 *
 * @example
 * ```ts
 * const target: any = {};
 * new SetterValidator('name = "John" AND age = 30').eval(target);
 * // target = { name: "John", age: 30 }
 * ```
 *
 * @throws {SyntaxError} if non-assignment operators or OR expressions are used
 */
export class SetterValidator extends QueryValidator {
  /**
   * @param sql - assignment expression (e.g. `'field = "value" AND other = 10'`)
   * @throws {SyntaxError} if the expression contains non-assignment operators
   */
  constructor(sql: string) {
    super(sql);
    // Do one empty run to raise any issue with disallowed expression
    this.eval({});
  }

  /**
   * Apply the assignments to the target object
   *
   * @param target - object to assign values to (mutated in place)
   * @returns always `true`
   */
  eval(target: any): boolean {
    if (this.query.filter) {
      this.assign(target, this.query.filter);
    }
    return true;
  }

  /**
   * Recursively walk the expression tree and apply assignments
   *
   * @param target - object to assign values to
   * @param expression - must be an AndExpression or a `=` ComparisonExpression
   * @throws {SyntaxError} if any non-assignment expression is encountered
   */
  assign(target: any, expression: Expression) {
    if (expression instanceof AndExpression) {
      expression.children.forEach(c => this.assign(target, c));
    } else if (expression instanceof ComparisonExpression && (expression as ComparisonExpression).operator === "=") {
      expression.setAttributeValue(target);
    } else {
      throw new SyntaxError(`Set Expression can only contain And and assignment expression '='`);
    }
  }
}

/**
 * A query validator that supports partial object matching
 *
 * In partial mode, comparisons against `undefined` attributes evaluate to `true`
 * (the missing field is ignored). This is useful for PATCH operations where only
 * a subset of fields is provided.
 *
 * @example
 * ```ts
 * const v = new PartialValidator("name = 'John' AND age > 18");
 * v.eval({ name: "John" });        // true (age is undefined, skipped)
 * v.wasPartialMatch();             // true
 * v.eval({ name: "John" }, false); // false (strict mode, age required)
 * ```
 */
export class PartialValidator extends QueryValidator {
  declare builder: PartialExpressionBuilder;

  /**
   * @param query - WebdaQL query string
   * @param builder - partial expression builder (override for customization)
   */
  constructor(query: string, builder: PartialExpressionBuilder = new PartialExpressionBuilder()) {
    super(query, builder);
  }

  /**
   * Eval the query
   * @param target - the object to evaluate
   * @param partial - whether to use partial matching
   * @returns true if the target matches
   */
  eval(target: any, partial: boolean = true): boolean {
    this.builder.setPartial(partial);
    this.builder.setPartialMatch(false);
    return this.query.filter.eval(target);
  }

  /**
   * Return if the result ignored some fields
   * @returns true if some fields were skipped
   */
  wasPartialMatch(): boolean {
    return this.builder.partialMatch;
  }
}

/**
 * A comparison expression that treats `undefined` attributes as a match in partial mode
 *
 * When the builder is in partial mode and the target attribute is `undefined`,
 * evaluation returns `true` and flags the result as a partial match.
 *
 * @typeParam T - the specific comparison operator type
 */
export class PartialComparisonExpression<
  T extends ComparisonOperator = ComparisonOperator
> extends ComparisonExpression<T> {
  /**
   * @param builder - the partial expression builder (used to read partial mode flag)
   * @param op - comparison operator
   * @param attribute - dot-notation attribute path
   * @param value - value to compare against
   */
  constructor(
    protected builder: PartialExpressionBuilder,
    op: T,
    attribute: string,
    value: any
  ) {
    super(op, attribute, value);
  }

  /**
   * Override the eval to check if the attribute is present
   * if not and we are in partial mode, return true
   *
   * @param target - the object to evaluate
   * @returns true if the target matches
   */
  eval(target: any): boolean {
    if (this.builder.partial) {
      const left = ComparisonExpression.getAttributeValue(target, this.attribute);
      if (left === undefined) {
        this.builder.setPartialMatch(true);
        return true;
      }
    }
    return super.eval(target);
  }
}

/**
 * Expression builder that creates {@link PartialComparisonExpression} nodes
 * instead of regular {@link ComparisonExpression} nodes
 *
 * Used by {@link PartialValidator} to support partial object matching.
 */
export class PartialExpressionBuilder extends ExpressionBuilder {
  /**
   * Whether partial mode is active (undefined attributes treated as matching)
   */
  partial: boolean;
  /**
   * Set to `true` during evaluation if any attribute was undefined and skipped
   */
  partialMatch: boolean;

  /**
   * Enable or disable partial evaluation mode
   * @param partial - whether to enable partial mode
   */
  setPartial(partial: boolean) {
    this.partial = partial;
  }

  /**
   * Set the partial match flag (reset before each evaluation)
   * @param partial - the partial match flag value
   */
  setPartialMatch(partial: boolean) {
    this.partialMatch = partial;
  }

  /**
   * Visit a LIKE expression, returning a PartialComparisonExpression
   * @param ctx - the LIKE expression context
   * @returns the partial comparison expression
   */
  visitLikeExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new PartialComparisonExpression(this, "LIKE", left.text, value);
  }

  /**
   * Visit a binary comparison, returning a PartialComparisonExpression
   * @param ctx - the binary comparison context
   * @returns the partial comparison expression
   */
  visitBinaryComparisonExpression(ctx: any) {
    const [left, op, right] = ctx.children;
    // @ts-ignore
    return new PartialComparisonExpression(this, op.text, left.text, this.visit(right));
  }

  /**
   * Visit an IN expression, returning a PartialComparisonExpression
   * @param ctx - the IN expression context
   * @returns the partial comparison expression
   */
  visitInExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new PartialComparisonExpression(this, "IN", left.text, value);
  }

  /**
   * Visit a CONTAINS expression, returning a PartialComparisonExpression
   * @param ctx - the CONTAINS expression context
   * @returns the partial comparison expression
   */
  visitContainsExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = this.visit(right) as unknown as any[];
    return new PartialComparisonExpression(this, "CONTAINS", left.text, value);
  }

  /**
   * Visit an IS NULL expression, returning a PartialComparisonExpression
   * @param ctx - the IS NULL expression context
   * @returns the partial comparison expression
   */
  visitIsNullExpression(ctx: any) {
    return new PartialComparisonExpression(this, "IS NULL", ctx.getChild(0).text, null);
  }

  /**
   * Visit an IS NOT NULL expression, returning a PartialComparisonExpression
   * @param ctx - the IS NOT NULL expression context
   * @returns the partial comparison expression
   */
  visitIsNotNullExpression(ctx: any) {
    return new PartialComparisonExpression(this, "IS NOT NULL", ctx.getChild(0).text, null);
  }
}

/**
 * Remove artifact from sanitize-html inside query
 * @param query - the query string to unsanitize
 * @returns the cleaned query string
 */
export function unsanitize(query: string): string {
  return query.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Print a query in its canonical form, which parses back to the same query
 *
 * - plain filter: `<filter> [ORDER BY ...] [LIMIT n] [OFFSET "token"]`
 * - `SELECT f1, f2 [WHERE <filter>] [ORDER BY ...] [LIMIT n] [OFFSET "token"]`
 * - `DELETE [WHERE <filter>] [LIMIT n]`
 * - `UPDATE SET a = v, ... [WHERE <filter>] [LIMIT n]`
 *
 * @param query - the query
 * @returns the query string
 */
export function stringifyQuery(query: Omit<Query, "toString">): string {
  const filter = query.filter.toString();
  let head = "";
  if (query.type === "DELETE") {
    head = "DELETE";
  } else if (query.type === "UPDATE") {
    head = `UPDATE SET ${(query.assignments ?? []).map(a => new ComparisonExpression("=", a.field, a.value).toString()).join(", ")}`;
  } else if (query.aggregation) {
    const metrics = Object.entries(query.aggregation.metrics).map(([alias, metric]) => {
      if (metric.fn === "COUNT_DISTINCT") {
        return `COUNT(DISTINCT ${metric.field}) AS ${alias}`;
      }
      return `${metric.fn}(${metric.field ?? "*"}) AS ${alias}`;
    });
    head = `SELECT ${[...query.aggregation.groupBy, ...metrics].join(", ")}`;
  } else if (query.fields) {
    head = `SELECT ${query.fields.join(", ")}`;
  }
  let res = head ? `${head}${filter ? ` WHERE ${filter}` : ""}` : filter;
  if (query.aggregation?.groupBy.length) {
    res += ` GROUP BY ${query.aggregation.groupBy.join(", ")}`;
  }
  if (query.orderBy?.length) {
    res += ` ORDER BY ${query.orderBy.map(o => `${o.field} ${o.direction}`).join(", ")}`;
  }
  if (query.limit !== undefined) {
    res += ` LIMIT ${query.limit}`;
  }
  if (query.continuationToken) {
    res += ` OFFSET ${ComparisonExpression.prototype.toStringValue(query.continuationToken)}`;
  }
  return res.trim();
}

/**
 * One segment of a field path, as the grammar's identifiers allow it: letters, digits and `_`
 */
const FIELD_SEGMENT = /^[A-Za-z0-9_]+$/;

/**
 * Check a field path of a query object
 * @param field - the path, as a string or its segments
 * @returns the dotted path
 * @throws {WebdaQLError} when a segment is empty or holds anything but letters, digits and `_`
 */
function checkFieldPath(field: unknown): string {
  // Copy first: what is checked is what is printed, whatever the object does on later reads
  const segments = Array.isArray(field) ? snapshot(field) : typeof field === "string" ? field.split(".") : undefined;
  if (!segments?.length || segments.some(segment => typeof segment !== "string" || !FIELD_SEGMENT.test(segment))) {
    throw new WebdaQLError("Invalid field path in WebdaQL query");
  }
  return segments.join(".");
}

/**
 * Copy an array of a query object into a plain array, reading each element once
 * @param value - the array
 * @returns the copy
 */
function snapshot<V>(value: readonly V[]): V[] {
  const length = value.length;
  const copy: V[] = [];
  for (let i = 0; i < length; i++) {
    copy.push(value[i]);
  }
  return copy;
}

/**
 * Print a single value of a query object
 * @param value - the value
 * @returns its WebdaQL literal
 * @throws {WebdaQLError} for anything but a string, a finite number or a boolean
 */
function checkScalar(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
    throw new WebdaQLError(`Invalid value in WebdaQL query: ${typeof value}`);
  }
  return escapeValue(value);
}

/**
 * Print an expression of a query object from its data only (never its own toString); every property and array is
 * read once, so what is checked is what is printed
 * @param expression - the expression
 * @param nested - whether the expression is inside a logical expression
 * @returns the WebdaQL text
 * @throws {WebdaQLError} for an expression the grammar cannot produce
 */
function printExpression(expression: unknown, nested: boolean): string {
  if (expression instanceof BooleanExpression) {
    const value = expression.value;
    if (typeof value === "boolean") {
      return value ? "TRUE" : "FALSE";
    }
    throw new WebdaQLError("Invalid expression in WebdaQL query");
  }
  if (expression instanceof AndExpression || expression instanceof OrExpression) {
    const operator = expression instanceof AndExpression ? "AND" : "OR";
    const children = expression.children;
    if (!Array.isArray(children)) {
      throw new WebdaQLError("Invalid expression in WebdaQL query");
    }
    const copy = snapshot(children);
    if (copy.length === 0) {
      // An empty AND or OR matches everything
      return nested ? "TRUE" : "";
    }
    const text = copy.map(child => printExpression(child, true)).join(` ${operator} `);
    return nested ? `( ${text} )` : text;
  }
  if (expression instanceof ComparisonExpression) {
    const attribute = checkFieldPath(expression.attribute);
    const operator: unknown = expression.operator;
    const value: unknown = expression.value;
    if (typeof operator !== "string") {
      throw new WebdaQLError("Invalid operator in WebdaQL query");
    }
    if (UNARY_COMPARISON_OPERATORS.includes(operator as ComparisonOperator)) {
      return `${attribute} ${operator}`;
    }
    if (operator === "IN") {
      const values = Array.isArray(value) ? snapshot(value) : undefined;
      if (!values?.length) {
        throw new WebdaQLError("Invalid IN values in WebdaQL query");
      }
      return `${attribute} IN [${values.map(checkScalar).join(", ")}]`;
    }
    if (!["=", "!=", "<", "<=", ">", ">=", "LIKE", "CONTAINS"].includes(operator)) {
      throw new WebdaQLError(`Invalid operator in WebdaQL query: ${JSON.stringify(operator)}`);
    }
    if ((operator === "LIKE" || operator === "CONTAINS") && typeof value !== "string") {
      throw new WebdaQLError(`${operator} takes a string in WebdaQL query`);
    }
    return `${attribute} ${operator} ${checkScalar(value)}`;
  }
  throw new WebdaQLError("Invalid expression in WebdaQL query");
}

/**
 * Normalize a query object built or changed by code: every part is checked against what the grammar allows, the
 * query is printed from its data and parsed again
 *
 * Use it before handing a `Query` object received from a caller to a backend: field paths (letters, digits, `_`),
 * operators, values (strings, finite numbers, booleans), LIMIT (non-negative integer) and OFFSET (string) are
 * checked, and the result only holds expressions built by the parser.
 *
 * @param query - the query object
 * @returns the same query, as parsed from its canonical text
 * @throws {WebdaQLError} when a part of the query cannot be written in WebdaQL
 */
export function normalizeQuery(query: Partial<Query>): Query {
  if (!query || typeof query !== "object") {
    throw new WebdaQLError("Invalid WebdaQL query object");
  }
  const type: unknown = query.type ?? "SELECT";
  if (typeof type !== "string" || !["SELECT", "DELETE", "UPDATE"].includes(type)) {
    throw new WebdaQLError(`Invalid statement type in WebdaQL query: ${JSON.stringify(type)}`);
  }
  if (query.aggregation !== undefined) {
    throw new WebdaQLError("Aggregation queries cannot be normalized: use toAggregationQuery");
  }
  const filterObject: unknown = query.filter;
  const filter = printExpression(filterObject ?? new AndExpression([]), false);
  let head = "";
  if (type === "DELETE") {
    head = "DELETE";
  } else if (type === "UPDATE") {
    const assignments = Array.isArray(query.assignments) ? snapshot(query.assignments) : [];
    if (assignments.length === 0) {
      throw new WebdaQLError("UPDATE needs at least one SET assignment");
    }
    head = `UPDATE SET ${assignments
      .map(a => {
        const field = a?.field;
        const value = a?.value;
        return `${checkFieldPath(field)} = ${checkScalar(value)}`;
      })
      .join(", ")}`;
  } else if (query.fields !== undefined) {
    const fields = Array.isArray(query.fields) ? snapshot(query.fields) : [];
    if (fields.length === 0) {
      throw new WebdaQLError("Invalid SELECT field list in WebdaQL query");
    }
    head = `SELECT ${fields.map(checkFieldPath).join(", ")}`;
  }
  let res = head ? `${head}${filter ? ` WHERE ${filter}` : ""}` : filter;
  const orderBy: unknown = query.orderBy;
  if (orderBy !== undefined) {
    if (!Array.isArray(orderBy)) {
      throw new WebdaQLError("Invalid ORDER BY in WebdaQL query");
    }
    const orders = snapshot(orderBy);
    if (orders.length) {
      res += ` ORDER BY ${orders
        .map(o => {
          const field = o?.field;
          const direction = o?.direction;
          if (direction !== "ASC" && direction !== "DESC") {
            throw new WebdaQLError("Invalid ORDER BY direction in WebdaQL query");
          }
          return `${checkFieldPath(field)} ${direction}`;
        })
        .join(", ")}`;
    }
  }
  const limit: unknown = query.limit;
  if (limit !== undefined) {
    if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 0) {
      throw new WebdaQLError("Invalid LIMIT in WebdaQL query");
    }
    res += ` LIMIT ${limit}`;
  }
  const token: unknown = query.continuationToken;
  if (token !== undefined && token !== null) {
    if (typeof token !== "string") {
      throw new WebdaQLError("Invalid OFFSET in WebdaQL query");
    }
    if (token) {
      res += ` OFFSET ${escapeValue(token)}`;
    }
  }
  try {
    return parse(res.trim());
  } catch (err) {
    throw new WebdaQLError(`Invalid WebdaQL query object: ${(err as Error).message}`);
  }
}

/**
 * Whether a field path is allowed: listed itself, or nested in a listed field (`address.city` with `address`)
 * @param field - the field path
 * @param allowed - the allowed field paths
 * @returns true when allowed
 */
function isAllowedField(field: string, allowed: Set<string>): boolean {
  const segments = field.split(".");
  for (let i = 1; i <= segments.length; i++) {
    if (allowed.has(segments.slice(0, i).join("."))) {
      return true;
    }
  }
  return false;
}

/**
 * Validate the SELECT fields and the UPDATE SET targets of a query against the allowed fields
 *
 * A dotted path is allowed when it is listed, or when one of its parents is (`profile.email` is allowed by
 * `profile` or by `profile.email`). Filter attributes are not checked.
 *
 * @param query - parsed query to validate
 * @param allowedFields - allowed field paths (dot-notation)
 * @throws {SyntaxError} if a field or an assignment target is not allowed
 */
export function validateQueryFields(
  query: Pick<Query, "fields" | "assignments" | "aggregation">,
  allowedFields: string[]
): void {
  const allowed = new Set(allowedFields);
  for (const field of query.fields ?? []) {
    if (!isAllowedField(field, allowed)) {
      throw new SyntaxError(`Unknown field "${field}". Allowed fields: ${allowedFields.join(", ")}`);
    }
  }
  for (const { field } of query.assignments ?? []) {
    if (!isAllowedField(field, allowed)) {
      throw new SyntaxError(`Unknown assignment field "${field}". Allowed fields: ${allowedFields.join(", ")}`);
    }
  }
  for (const [alias, metric] of Object.entries(query.aggregation?.metrics ?? {})) {
    if (metric.field !== undefined && !isAllowedField(metric.field, allowed)) {
      throw new SyntaxError(
        `Unknown field "${metric.field}" in "${alias}". Allowed fields: ${allowedFields.join(", ")}`
      );
    }
  }
}

/**
 * Refuse anything but a plain filter query: DELETE, UPDATE and SELECT with a field list
 *
 * Used where a query only selects objects, such as the Query operations exposed to clients. A query built by hand
 * without `type` is a filter.
 *
 * @param query - the parsed query
 * @throws {WebdaQLError} for a DELETE or UPDATE statement, or a SELECT field list
 */
export function assertFilterQuery(query: Partial<Pick<Query, "type" | "fields">>): void {
  if (query.type !== undefined && query.type !== "SELECT") {
    throw new WebdaQLError(`${query.type} statements are not accepted here: only a filter query is`);
  }
  if (query.fields !== undefined) {
    throw new WebdaQLError("SELECT field lists are not accepted here: only a filter query is");
  }
}

/**
 * Parse a query string into a Query object
 *
 * Accepts a plain filter query (an implicit SELECT of every field) or a statement:
 * - `SELECT f1, f2 [WHERE <condition>] [ORDER BY ...] [LIMIT n] [OFFSET token]`
 * - `DELETE [WHERE <condition>] [LIMIT n]`
 * - `UPDATE SET a = v, b = v [WHERE <condition>] [LIMIT n]`
 *
 * Keywords are uppercase only: `select`, `delete`, `set`... remain field names.
 *
 * @param query - the query string to parse
 * @param allowedFields - when given, SELECT fields and UPDATE SET targets must be in this list
 *   (see {@link validateQueryFields})
 * @returns the parsed Query object
 * @throws {SyntaxError} on a grammar error or a field outside `allowedFields`
 */
export function parse(query: string, allowedFields?: string[]): Query {
  const result = new QueryValidator(query).getQuery();
  if (allowedFields) {
    validateQueryFields(result, allowedFields);
  }
  return result;
}
