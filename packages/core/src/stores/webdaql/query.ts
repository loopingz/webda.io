import { WebdaQLLexer } from "./WebdaQLLexer";
import { ANTLRInputStream, CommonTokenStream, RecognitionException, Recognizer, Token } from "antlr4ts";
import {
  WebdaQLParserParser,
  WebdaqlContext,
  BinaryComparisonExpressionContext,
  BooleanLiteralContext,
  InExpressionContext,
  IntegerLiteralContext,
  SetExpressionContext,
  StringLiteralContext,
  SubExpressionContext,
  AndLogicExpressionContext,
  OrLogicExpressionContext,
  LimitExpressionContext,
  OffsetExpressionContext,
  LikeExpressionContext,
  OrderExpressionContext,
  OrderFieldExpressionContext
} from "./WebdaQLParserParser";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";

type value = boolean | string | number;

/**
 * Meta Query Language
 *
 *
 */
export namespace WebdaQL {
  export interface OrderBy {
    field: string;
    direction: "ASC" | "DESC";
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
      let value = <any[]>(<unknown>this.visit(right));
      return new ComparisonExpression("LIKE", left.text, value);
    }

    /**
     * Map the a IN ['b','c']
     */
    visitInExpression(ctx: InExpressionContext) {
      const [left, _, right] = ctx.children;
      let value = <any[]>(<unknown>this.visit(right));
      return new ComparisonExpression("IN", left.text, value);
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

  type ComparisonOperator = "=" | "<=" | ">=" | "<" | ">" | "!=" | "LIKE" | "IN";
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
          .replace(/\\([^\?\[\{\(])/g, "\\\\")
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
      return value.toString();
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
      for (let child of this.children) {
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
      for (let child of this.children) {
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

    constructor(sql: string) {
      this.lexer = new WebdaQLLexer(new ANTLRInputStream(sql));
      let tokenStream = new CommonTokenStream(this.lexer);
      let parser = new WebdaQLParserParser(tokenStream);
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
      this.builder = new ExpressionBuilder();
      this.query = <Query>this.builder.visit(this.tree);
    }

    /**
     * Get offset
     * @returns
     */
    getOffset(): string {
      return this.builder.getOffset() || "";
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
      return this.query;
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
}
