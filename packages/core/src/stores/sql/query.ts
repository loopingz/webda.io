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
  OrLogicExpressionContext
} from "./WebdaQLParserParser";
import { WebdaQLParserVisitor } from "./WebdaQLParserVisitor";
import { ParseTree } from "antlr4ts/tree/ParseTree";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { AbstractParseTreeVisitor } from "antlr4ts/tree/AbstractParseTreeVisitor";
import { BaseModel } from "../../models/basemodel";

/**
 * Apply post filtering on results and re-apply pagination
 */
class Paginator {}

type value = boolean | string | number;

class FilterExpression {}

/**
 * Create Expression based on the parsed token
 *
 * Expression allow to optimize and split between Query and Filter
 */
class ExpressionBuilder extends AbstractParseTreeVisitor<Expression> implements WebdaQLParserVisitor<any> {
  /**
   * Default result for the override
   * @returns
   */
  protected defaultResult(): Expression {
    // An empty AND return true
    return new AndExpression([]);
  }

  /**
   * Return only AndExpression
   * @param ctx
   * @returns
   */
  visitWebdaql(ctx: WebdaqlContext) {
    if (ctx.childCount === 1) {
      // An empty AND return true
      return new AndExpression([]);
    }
    // Go down one level
    return this.visit(ctx.getChild(0));
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
    return new AndExpression(this.getComparison(ctx).map(c => this.visit(c)));
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
    return <value[]>(<unknown>ctx.children.filter((i, id) => id % 2).map(c => this.visit(c)));
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
    return new OrExpression(this.getComparison(ctx).map(c => this.visit(c)));
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
 * Represent the query expression or subset
 */
abstract class Expression {
  operator: string;

  constructor(operator: string) {
    this.operator = operator;
  }

  /**
   * Evaluate the expression for the target object
   * @param target to evaluate
   */
  abstract eval(target: BaseModel): boolean;
  /**
   * Return the representation of the expression
   * @param depth
   */
  abstract toString(depth?: number): string;
}

/**
 * Comparison expression
 */
class ComparisonExpression extends Expression {
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
  constructor(operator: "=" | "<=" | ">=" | "<" | ">" | "!=" | "LIKE" | "IN", attribute: string, value: value | any[]) {
    super(operator);
    this.value = value;
    this.attribute = attribute.split(".");
  }

  /**
   * Read the value from the object
   *
   * @param target
   * @returns
   */
  getAttributeValue(target: any): any {
    let res = target;
    for (let i = 0; res && i < this.attribute.length; i++) {
      res = res[this.attribute[i]];
    }
    return res;
  }

  /**
   * @override
   */
  eval(target: any): boolean {
    const left = this.getAttributeValue(target);
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
          return left.match(<string>this.value) !== undefined;
        }
        return false;
      case "IN":
        return (<value[]>this.value).includes(left);
    }
    return false;
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
   * @override
   */
  toString() {
    return `${this.attribute.join(".")} ${this.operator} ${this.toStringValue(this.value)}`;
  }
}

class QueryExpression {
  query() {}

  eval() {
    return true;
  }
}

/**
 * Abstract logic expression (AND|OR)
 *
 * Could add XOR in the future
 */
abstract class LogicalExpression extends Expression {
  /**
   * Contains the members of the logical expression
   */
  children: Expression[] = [];
  /**
   *
   * @param operator
   * @param children
   */
  constructor(operator: string, children: Expression[]) {
    super(operator);
    this.children = children;
  }

  /**
   * @override
   */
  toString(depth: number = 0) {
    if (depth && (this.operator === "AND" || this.operator === "OR")) {
      return "( " + this.children.map(c => c.toString(depth + 1)).join(` ${this.operator} `) + " )";
    }
    return this.children.map(c => c.toString(depth + 1)).join(` ${this.operator} `);
  }
}

/**
 * AND Expression implementation
 */
class AndExpression extends LogicalExpression {
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
class OrExpression extends LogicalExpression {
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
  protected expression: OrExpression | AndExpression;

  constructor(sql: string, optimizer?: ExpressionBuilder) {
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
        e: RecognitionException
      ) => {
        console.log("SyntaxError", msg);
        throw e;
      }
    });
    // Parse the input, where `compilationUnit` is whatever entry point you defined
    this.tree = parser.webdaql();
    this.expression = <OrExpression | AndExpression>(optimizer || new ExpressionBuilder()).visit(this.tree);
  }

  /**
   * Get the expression by itself
   * @returns
   */
  getExpression(): Expression {
    return this.expression;
  }

  /**
   * Verify if a target fit the expression
   * @param target
   * @returns
   */
  eval(target: any) {
    return this.expression.eval(target);
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
