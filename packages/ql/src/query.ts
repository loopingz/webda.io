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

type value = boolean | string | number;

/**
 * Meta Query Language
 *
 *
 */

export interface OrderBy {
  field: string;
  direction: "ASC" | "DESC";
}

export function PrependCondition(query: string = "", condition?: string): string {
  return new QueryValidator(query).merge(condition).toString();
}
/**
 * Create Expression based on the parsed token
 *
 * Expression allow to optimize and split between Query and Filter
 */
export class ExpressionBuilder extends AbstractParseTreeVisitor<Query> implements WebdaQLParserVisitor<any> {
  /**
   * Contain the parsed limit
   */
  limit: number;
  /**
   * Contain the parsed offset
   */
  offset: string;
  orderBy: OrderBy[];

  /**
   * Default result for the override
   * @returns
   */
  protected defaultResult(): Query {
    // An empty AND return true
    return {
      filter: new AndExpression([])
    };
  }

  /**
   * Get offset
   * @returns
   */
  getOffset(): string {
    return this.offset;
  }

  /**
   * Get limit
   * @returns
   */
  getLimit(): number {
    return this.limit;
  }

  /**
   * Read the limit
   * @param ctx
   */
  visitLimitExpression(ctx: LimitExpressionContext) {
    this.limit = this.visitIntegerLiteral(<IntegerLiteralContext>ctx.getChild(1));
  }

  /**
   * Read the offset if provided
   * @param ctx
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
   * Return only AndExpression
   * @param ctx
   * @returns
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
   * Simplify Logic expression and regroup them
   * @param ctx
   * @returns
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
   * a LIKE "%A?"
   * @param ctx
   * @returns
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
   * Read the string literal (removing the simple or double bracket)
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

export type ComparisonOperator = "=" | "<=" | ">=" | "<" | ">" | "!=" | "LIKE" | "IN" | "CONTAINS";
/**
 * Comparison expression
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
   *
   * @param operator of the expression
   * @param attribute of the object to read
   * @param value
   */
  constructor(operator: T, attribute: string, value: value | any[]) {
    super(operator);
    this.value = value;
    this.attribute = attribute.split(".");
  }

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
   * Read the value from the object
   *
   * @param target
   * @returns
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
   * Return a string represantation of a value
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
 * Abstract logic expression (AND|OR)
 *
 * Could add XOR in the future
 */
export abstract class LogicalExpression<T> extends Expression<T> {
  /**
   * Contains the members of the logical expression
   */
  children: Expression[] = [];
  /**
   *
   * @param operator
   * @param children
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
 * AND Expression implementation
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
 * OR Expression implementation
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
 *
 */
export class QueryValidator {
  protected lexer: WebdaQLLexer;
  protected tree: WebdaqlContext;
  protected query: Query;
  protected builder: ExpressionBuilder;

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
   * Get offset
   * @returns
   */
  getOffset(): string {
    return this.builder.getOffset() || "";
  }

  hasCondition() {
    const filter = this.query.filter;
    const isAnd = filter instanceof AndExpression;
    if (isAnd) {
      return filter.children.length > 0;
    }
    return true;
  }

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
   * Get limit
   * @returns
   */
  getLimit(): number {
    return this.builder.getLimit() || 1000;
  }

  /**
   * Get the expression by itself
   * @returns
   */
  getExpression(): Expression {
    return this.query.filter;
  }

  /**
   * Retrieve parsed query
   * @returns
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
 * For now reuse same parser
 */
export class SetterValidator extends QueryValidator {
  constructor(sql: string) {
    super(sql);
    // Do one empty run to raise any issue with disallowed expression
    this.eval({});
  }

  eval(target: any): boolean {
    if (this.query.filter) {
      this.assign(target, this.query.filter);
    }
    return true;
  }

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

export class PartialValidator extends QueryValidator {
  builder: PartialExpressionBuilder;

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

export class PartialComparisonExpression<
  T extends ComparisonOperator = ComparisonOperator
> extends ComparisonExpression<T> {
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

export class PartialExpressionBuilder extends ExpressionBuilder {
  /**
   * Enforce the partial mode
   */
  partial: boolean;
  /**
   * If eval was called in partial mode
   */
  partialMatch: boolean;

  setPartial(partial: boolean) {
    this.partial = partial;
  }

  setPartialMatch(partial: boolean) {
    this.partialMatch = partial;
  }
  /**
   * a LIKE "%A?"
   * @param ctx
   * @returns
   */
  visitLikeExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new PartialComparisonExpression(this, "LIKE", left.text, value);
  }

  /**
   * Implement the BinaryComparison with all methods managed
   */
  visitBinaryComparisonExpression(ctx: any) {
    const [left, op, right] = ctx.children;
    // @ts-ignore
    return new PartialComparisonExpression(this, op.text, left.text, this.visit(right));
  }

  /**
   * Map the a IN ['b','c']
   */
  visitInExpression(ctx: any) {
    const [left, _, right] = ctx.children;
    const value = <any[]>(<unknown>this.visit(right));
    return new PartialComparisonExpression(this, "IN", left.text, value);
  }

  /**
   * Map the a CONTAINS 'b'
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
