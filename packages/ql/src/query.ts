import { CharStreams, CommonTokenStream, RecognitionException, Recognizer, Token } from "antlr4ts";
import { AbstractParseTreeVisitor, ParseTree, TerminalNode } from "antlr4ts/tree/index.js";
import { WebdaQLLexer } from "./WebdaQLLexer";
import {
  AndLogicExpressionContext,
  BinaryComparisonExpressionContext,
  BooleanLiteralContext,
  ContainsExpressionContext,
  InExpressionContext,
  IntegerLiteralContext,
  LikeExpressionContext,
  LimitExpressionContext,
  OffsetExpressionContext,
  OrLogicExpressionContext,
  OrderExpressionContext,
  OrderFieldExpressionContext,
  SetExpressionContext,
  StringLiteralContext,
  SubExpressionContext,
  WebdaQLParserParser,
  WebdaqlContext
} from "./WebdaQLParserParser";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor";

/**
 * Primitive value types supported by WebdaQL expressions
 */
type value = boolean | string | number;

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
 * ORDER BY, LIMIT, and OFFSET clauses from the original query are preserved.
 *
 * @param query - existing query string (may include ORDER BY / LIMIT / OFFSET)
 * @param condition - condition to prepend (filter expression only)
 * @returns merged query string
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
   */
  protected defaultResult(): Query {
    // An empty AND return true
    return {
      filter: new AndExpression([])
    };
  }

  /**
   * Get parsed OFFSET continuation token
   */
  getOffset(): string {
    return this.offset;
  }

  /**
   * Get parsed LIMIT value
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Visit a LIMIT clause and store the integer value
   */
  visitLimitExpression(ctx: LimitExpressionContext) {
    this.limit = this.visitIntegerLiteral(<IntegerLiteralContext>ctx.getChild(1));
  }

  /**
   * Visit an OFFSET clause and store the string continuation token
   */
  visitOffsetExpression(ctx: OffsetExpressionContext) {
    this.offset = this.visitStringLiteral(<StringLiteralContext>ctx.getChild(1));
  }

  /**
   * Visit a order field expression
   */
  visitOrderFieldExpression(ctx: OrderFieldExpressionContext): OrderBy {
    return {
      field: ctx.getChild(0).text,
      direction: ctx.childCount > 1 ? <any>ctx.getChild(1).text : "ASC"
    };
  }

  /**
   * Read the order by values
   */
  visitOrderExpression(ctx: OrderExpressionContext): void {
    this.orderBy = ctx.children
      ?.filter(c => c instanceof OrderFieldExpressionContext)
      .map((c: OrderFieldExpressionContext) => this.visitOrderFieldExpression(c));
  }

  /**
   * Visit the root `webdaql` rule and build the complete Query
   *
   * Parses filter expression, ORDER BY, LIMIT, and OFFSET clauses.
   * Returns an empty AND expression (always true) when no filter is present.
   */
  visitWebdaql(ctx: WebdaqlContext): Query {
    if (ctx.childCount === 1) {
      // An empty AND return true
      return {
        filter: new AndExpression([])
      };
    }

    // To parse offset and limit and order by
    for (let i = 1; i < ctx.childCount - 1; i++) {
      this.visit(ctx.getChild(i));
    }
    // If the first element is a sub expression, it means we have a filter
    if (ctx.getChild(0) instanceof SubExpressionContext) {
      return {
        filter: <Expression>(<unknown>this.visit(ctx.getChild(0).getChild(1))) || new AndExpression([]),
        limit: this.limit,
        continuationToken: this.offset,
        orderBy: this.orderBy
      };
    }
    // Go down one level - if expression empty it means no expression were provided
    return {
      filter: <Expression>(<unknown>this.visit(ctx.getChild(0))) || new AndExpression([]),
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
      res.push(...this.getComparison(<AndLogicExpressionContext | OrLogicExpressionContext>(<unknown>left)));
    } else {
      res.push(left);
    }
    if (right instanceof ctx.constructor) {
      res.push(...this.getComparison(<AndLogicExpressionContext | OrLogicExpressionContext>(<unknown>right)));
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
   */
  visitAndLogicExpression(ctx: AndLogicExpressionContext): AndExpression {
    return new AndExpression(this.getComparison(ctx).map(c => <Expression>(<unknown>this.visit(c))));
  }

  /**
   * Implement the BinaryComparison with all methods managed
   */
  visitBinaryComparisonExpression(ctx: BinaryComparisonExpressionContext) {
    const [left, op, right] = ctx.children;
    // @ts-ignore
    return new ComparisonExpression(op.text, left.text, this.visit(right));
  }

  /**
   * Visit each value of the [..., ..., ...] set
   */
  visitSetExpression(ctx: SetExpressionContext): value[] {
    return <value[]>(<unknown>ctx.children.filter((_i, id) => id % 2).map(c => this.visit(c)));
  }

  /**
   * Visit a LIKE expression (e.g. `field LIKE '%pattern_'`)
   */
  visitLikeExpression(ctx: LikeExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new ComparisonExpression("LIKE", left.text, value);
  }

  /**
   * Map the a IN ['b','c']
   */
  visitInExpression(ctx: InExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new ComparisonExpression("IN", left.text, value);
  }

  /**
   * Map the a CONTAINS 'b'
   */
  visitContainsExpression(ctx: ContainsExpressionContext) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new ComparisonExpression("CONTAINS", left.text, value);
  }

  /**
   * Get the OrExpression, regrouping all the parameters
   *
   * By default the parser is doing a OR (b OR (c OR d)) creating 3 depth expressions
   * This visitor simplify to a OR b OR c OR d with only one Expression
   */
  visitOrLogicExpression(ctx: OrLogicExpressionContext) {
    return new OrExpression(this.getComparison(ctx).map(c => <Expression>(<unknown>this.visit(c))));
  }

  /**
   * Read a string literal, stripping the surrounding single or double quotes
   */
  visitStringLiteral(ctx: StringLiteralContext): string {
    return ctx.text.substring(1, ctx.text.length - 1);
  }

  /**
   * Read the boolean literal
   */
  visitBooleanLiteral(ctx: BooleanLiteralContext): boolean {
    return "TRUE" === ctx.text;
  }

  /**
   * Read the number literal
   */
  visitIntegerLiteral(ctx: IntegerLiteralContext): number {
    return parseInt(ctx.text);
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
   * Get the string representation of the query
   */
  toString(): string;
}

/**
 * Represent the query expression or subset
 */
export abstract class Expression<T = string> {
  operator: T;

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
 */
export type ComparisonOperator = "=" | "<=" | ">=" | "<" | ">" | "!=" | "LIKE" | "IN" | "CONTAINS";

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
   * @param target
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
        if (typeof left === "string") {
          // Grammar definie value as stringLiteral
          return left.match(ComparisonExpression.likeToRegex(<string>this.value)) !== null;
        }
        return left.toString().match(ComparisonExpression.likeToRegex(<string>this.value)) !== null;
      case "IN":
        return (<value[]>this.value).includes(left);
      case "CONTAINS":
        if (Array.isArray(left)) {
          return left.includes(this.value);
        }
        return false;
    }
  }

  /**
   * Serialize a value to its WebdaQL string representation
   *
   * Strings are double-quoted, booleans are uppercased, arrays are bracket-wrapped.
   */
  toStringValue(value: value | value[]): string {
    if (Array.isArray(value)) {
      return `[${value.map(v => this.toStringValue(v)).join(", ")}]`;
    }
    switch (typeof value) {
      case "string":
        return `"${value}"`;
      case "boolean":
        return value.toString().toUpperCase();
    }
    return value?.toString();
  }

  /**
   * Allow subclass to create different display
   */
  toStringAttribute() {
    return this.attribute.join(".");
  }

  /**
   * Allow subclass to create different display
   */
  toStringOperator() {
    return this.operator;
  }

  /**
   * @override
   */
  toString() {
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
    this.lexer = new WebdaQLLexer(CharStreams.fromString(sql || ""));
    const tokenStream = new CommonTokenStream(this.lexer);
    const parser = new WebdaQLParserParser(tokenStream);
    parser.removeErrorListeners();
    parser.addErrorListener({
      syntaxError: (
        _recognizer: Recognizer<Token, any>,
        _offendingSymbol: Token,
        _line: number,
        _charPositionInLine: number,
        msg: string,
        _e: RecognitionException
      ) => {
        throw new SyntaxError(`${msg} (Query: ${sql})`);
      }
    });
    // Parse the input, where `compilationUnit` is whatever entry point you defined
    this.tree = parser.webdaql();
    this.builder = builder;
    this.query = this.builder.visit(this.tree);
  }

  /**
   * Get parsed OFFSET continuation token, or empty string if none
   */
  getOffset(): string {
    return this.builder.getOffset() || "";
  }

  /**
   * Check whether the query has a non-empty filter condition
   *
   * An empty AND expression (no children) is considered to have no condition.
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
   */
  toString() {
    let res = this.query.filter.toString();
    if (this.query.orderBy) {
      res += ` ORDER BY ${this.query.orderBy.map(o => `${o.field} ${o.direction}`).join(", ")}`;
    }
    if (this.query.limit) {
      res += ` LIMIT ${this.query.limit}`;
    }
    if (this.query.continuationToken) {
      res += ` OFFSET "${this.query.continuationToken}"`;
    }
    return res.trim();
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
    if (adds.query.limit) {
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
   */
  getLimit(): number {
    return this.builder.getLimit() || 1000;
  }

  /**
   * Get the filter expression (without LIMIT / OFFSET / ORDER BY)
   */
  getExpression(): Expression {
    return this.query.filter;
  }

  /**
   * Retrieve the full parsed query including filter, limit, offset, and orderBy
   */
  getQuery(): Query {
    return {
      ...this.query,
      // Use displayTree to get the truely executed query
      toString: () => this.displayTree()
    };
  }

  /**
   * Verify if a target fit the expression
   * @param target
   * @returns
   */
  eval(target: any) {
    return this.query.filter.eval(target);
  }

  /**
   * Display parse tree back as query
   * @param tree
   * @returns
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
    } else if (expression instanceof ComparisonExpression && (<ComparisonExpression>expression).operator === "=") {
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
  builder: PartialExpressionBuilder;

  /**
   * @param query - WebdaQL query string
   * @param builder - partial expression builder (override for customization)
   */
  constructor(query: string, builder: PartialExpressionBuilder = new PartialExpressionBuilder()) {
    super(query, builder);
  }

  /**
   * Eval the query
   * @param target
   * @param partial
   * @returns
   */
  eval(target: any, partial: boolean = true): boolean {
    this.builder.setPartial(partial);
    this.builder.setPartialMatch(false);
    return this.query.filter.eval(target);
  }

  /**
   * Return if the result ignored some fields
   * @returns
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
   * @param target
   * @returns
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
   */
  setPartial(partial: boolean) {
    this.partial = partial;
  }

  /**
   * Set the partial match flag (reset before each evaluation)
   */
  setPartialMatch(partial: boolean) {
    this.partialMatch = partial;
  }

  /**
   * Visit a LIKE expression, returning a PartialComparisonExpression
   */
  visitLikeExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new PartialComparisonExpression(this, "LIKE", left.text, value);
  }

  /**
   * Visit a binary comparison, returning a PartialComparisonExpression
   */
  visitBinaryComparisonExpression(ctx: any) {
    const [left, op, right] = ctx.children;
    // @ts-ignore
    return new PartialComparisonExpression(this, op.text, left.text, this.visit(right));
  }

  /**
   * Visit an IN expression, returning a PartialComparisonExpression
   */
  visitInExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new PartialComparisonExpression(this, "IN", left.text, value);
  }

  /**
   * Visit a CONTAINS expression, returning a PartialComparisonExpression
   */
  visitContainsExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new PartialComparisonExpression(this, "CONTAINS", left.text, value);
  }
}

/**
 * Remove artifact from sanitize-html inside query
 * @param query
 * @returns
 */
export function unsanitize(query: string): string {
  return query.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

/**
 * Parse a query string into a Query object
 * @param query
 * @returns
 */
export function parse(query: string): Query {
  return new QueryValidator(query).getQuery();
}
