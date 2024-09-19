import { ANTLRInputStream, CommonTokenStream } from "antlr4ts";
import { AbstractParseTreeVisitor } from "antlr4ts/tree";
import { CloudEvent } from "cloudevents";
import { FilterImplementation } from "./abstract";
import { CESQLParserLexer } from "./sql/CESQLParserLexer";
import {
  BinaryAdditiveExpressionContext,
  BinaryComparisonExpressionContext,
  BinaryLogicExpressionContext,
  BinaryMultiplicativeExpressionContext,
  BooleanLiteralContext,
  CESQLParserParser,
  CesqlContext,
  ExistsExpressionContext,
  FunctionInvocationExpressionContext,
  FunctionParameterListContext,
  IdentifierContext,
  InExpressionContext,
  IntegerLiteralContext,
  LikeExpressionContext,
  SetExpressionContext,
  StringLiteralContext,
  SubExpressionContext,
  UnaryLogicExpressionContext,
  UnaryNumericExpressionContext
} from "./sql/CESQLParserParser";
import { CESQLParserVisitor } from "./sql/CESQLParserVisitor";
import {
  ExactFilter,
  ExactFilterImplementation,
  PrefixFilter,
  PrefixFilterImplementation,
  SuffixFilter,
  SuffixFilterImplementation
} from "./string";

/**
 * Use of this MUST have a string value, representing a CloudEvents SQL Expression.
 * The filter result MUST be true if the result value of the expression, coerced to boolean,
 * equals to the TRUE boolean value, otherwise MUST be false if an error occurred while
 * evaluating the expression or if the result value, coerced to boolean, equals to the FALSE
 * boolean value.
 *
 * Implementations SHOULD reject subscriptions with invalid CloudEvents SQL expressions.
 */
export interface SqlFilter {
  sql: string;
}

/**
 * Function name defined by the specification
 */
type FunctionName =
  | "ABS"
  | "LENGTH"
  | "CONCAT"
  | "CONCAT_WS"
  | "LOWER"
  | "UPPER"
  | "LEFT"
  | "RIGHT"
  | "TRIM"
  | "BOOL"
  | "INT"
  | "SUBSTRING"
  | "STRING"
  | "IS_BOOL"
  | "IS_INT";

/**
 * Functions implementation
 */
const functions: { [key in FunctionName]: (...args: any[]) => any } = {
  ABS: (...args: number[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return Math.abs(args[0]);
  },
  LENGTH: (...args: string[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return (args[0] || "").length;
  },
  CONCAT: (...args: string[]) => {
    return args.join("");
  },
  CONCAT_WS: (...args: string[]) => {
    const merger = args.shift();
    return args.join(merger);
  },
  LOWER: (...args: string[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return (args[0] || "").toLowerCase();
  },
  UPPER: (...args: string[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return (args[0] || "").toUpperCase();
  },
  TRIM: (...args: string[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return (args[0] || "").trim();
  },
  LEFT: (...args: any[]) => {
    if (args.length !== 2) {
      throw new Error("Wrong arguments count");
    }
    return (args[0] || "").substr(0, args[1]);
  },
  RIGHT: (...args: any[]) => {
    if (args.length !== 2) {
      throw new Error("Wrong arguments count");
    }
    args[0] ??= "";
    return args[0].substr(args[0].length - args[1]);
  },
  SUBSTRING: (...args: any[]) => {
    if (args.length > 3 || args.length < 2) {
      throw new Error("Wrong arguments count");
    }
    return (args[0] || "").substring(args[1], args[2]);
  },
  INT: (...args: any[]) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    switch (typeof args[0]) {
      case "number":
        return args[0];
      case "string":
        const res = Number.parseInt(args[0]);
        if (!Number.isNaN(res)) {
          return res;
        }
    }
    return 0;
  },
  BOOL: (...args) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    if (typeof args[0] === "string") {
      return args[0].toLowerCase() === "true";
    } else if (typeof args[0] === "boolean") {
      return args[0];
    }
    return false;
  },
  STRING: (...args) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    if (typeof args[0] === "boolean") {
      return args[0].toString().toUpperCase();
    }
    return args[0].toString();
  },
  IS_BOOL: (...args) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return typeof args[0] === "boolean";
  },
  IS_INT: (...args) => {
    if (args.length > 1) {
      throw new Error("Too many arguments");
    }
    return typeof args[0] === "number";
  }
};

/**
 * Represent the query expression or subset
 */
export abstract class Expression {
  protected deps: Expression[] = [];
  constructor() {}

  /**
   * Evaluate the expression for the target object
   * @param target to evaluate
   */
  abstract eval(target: any): any;
  /**
   * Return the representation of the expression
   */
  abstract toString(): string;

  /**
   * Resolve the expression if possible
   *
   * If the expression only contains static values then it can be resolved
   * @returns
   */
  resolve(): Expression {
    if (this.deps.length && this.deps.every(d => d instanceof ValueExpression)) {
      return new ValueExpression(this.eval({}));
    }
    return this;
  }
}

/**
 * Represent an attribute expression
 */
export class AttributeExpression extends Expression {
  constructor(public readonly attribute: string) {
    super();
  }

  /**
   * @override
   */
  eval(target: any): any {
    return target[this.attribute];
  }

  /**
   * @override
   */
  toString(): string {
    return this.attribute;
  }
}

/**
 * Represent a function expression
 */
export class FunctionExpression extends Expression {
  public readonly args: Expression[];
  /**
   *
   * @param functionName to execute
   * @param args to call with the function
   */
  constructor(
    public readonly functionName: keyof typeof functions,
    ...args: Expression[]
  ) {
    super();
    if (!functions[functionName]) {
      throw new Error(`Unknown function: '${functionName}'`);
    }
    this.deps.push(...args);
    this.args = args;
  }

  /**
   * @override
   */
  eval(target: any) {
    return functions[this.functionName](...this.args.map(a => a.eval(target)));
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.functionName}(${this.args.map(a => a.toString()).join(",")})`;
  }
}

/**
 * Represent a unary logic expression
 */
export class UnaryLogicExpression extends Expression {
  /**
   * Invert the result of the child expression
   * @param child
   */
  constructor(public readonly child: Expression) {
    super();
    this.deps.push(child);
  }

  /**
   * @override
   */
  eval(target) {
    return !this.deps[0].eval(target);
  }

  /**
   * @override
   */
  toString(): string {
    return `NOT ${this.deps[0].toString()}`;
  }
}

/**
 * Represent a unary numeric expression
 */
export class UnaryNumericExpression extends Expression {
  /**
   * Negative the result of the child expression
   * @param child
   */
  constructor(public readonly child: Expression) {
    super();
    this.deps.push(child);
  }

  /**
   * @override
   */
  eval(target) {
    return -1 * this.child.eval(target);
  }

  /**
   * @override
   */
  toString(): string {
    return `-${this.child.toString()}`;
  }
}

/**
 * Represent a LIKE expression
 */
export class LikeExpression extends Expression {
  regexp: RegExp;
  /**
   *
   * @param left part of the expression
   * @param right part of the expression the regexp with % and _
   * @param invert if NOT LIKE is used
   */
  constructor(
    public readonly left: Expression,
    public readonly right: string,
    public readonly invert: boolean
  ) {
    super();
    this.deps.push(left);
    this.regexp = new RegExp(
      right
        .substring(1, right.length - 1)
        .replace(/([^\\])%/g, "$1.*")
        .replace(/([^\\])_/g, "$1.?")
    );
  }

  /**
   * @override
   */
  eval(target) {
    const res = this.regexp.exec(this.left.eval(target)) !== null;
    if (this.invert) {
      return !res;
    }
    return res;
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} ${this.invert ? "NOT " : ""}LIKE ${this.right}`;
  }
}

/**
 * Represent a EXISTS expression
 */
export class ExistsExpression extends Expression {
  /**
   *
   * @param property to check
   */
  constructor(public readonly property: string) {
    super();
  }

  /**
   * @override
   */
  eval(target) {
    return target[this.property] !== undefined;
  }

  /**
   * @override
   */
  toString(): string {
    return `EXISTS ${this.property}`;
  }
}

/**
 * Represent a IN expression
 */
export class InExpression extends Expression {
  staticContent: any[];
  /**
   *
   * @param left part of the expression
   * @param right part of the expression
   * @param invert if NOT IN
   */
  constructor(
    public readonly left: Expression,
    public readonly right: Expression[],
    public readonly invert: boolean = false
  ) {
    super();
    this.deps.push(left, ...right);
    this.staticContent = right.every(d => d instanceof ValueExpression) ? right.map(r => r.eval({})) : undefined;
  }

  /**
   * @override
   */
  eval(target: any) {
    const right = this.staticContent || this.right.map(r => r.eval(target));
    if (this.invert) {
      return !right.includes(this.left.eval(target));
    }
    return right.includes(this.left.eval(target));
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} ${this.invert ? "NOT " : ""}IN (${this.right.map(r => r.toString()).join(",")})`;
  }
}

/**
 * Represent a binary multiplicative expression
 */
export class BinaryMultiplicativeExpression extends Expression {
  /**
   *
   * @param left part of the expression
   * @param right part of the expression
   * @param operator
   */
  constructor(
    public readonly left: Expression,
    public readonly right: Expression,
    public readonly operator: "*" | "/" | "%"
  ) {
    super();
    this.deps.push(left, right);
  }

  /**
   * @override
   */
  eval(target: any) {
    switch (this.operator) {
      case "*":
        return this.left.eval(target) * this.right.eval(target);
      case "/":
        return this.left.eval(target) / this.right.eval(target);
      case "%":
        return this.left.eval(target) % this.right.eval(target);
    }
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
  }
}

/**
 * Represent a binary additive expression
 */
export class BinaryAdditiveExpression extends Expression {
  /**
   *
   * @param left part of the expression
   * @param right part of the expression
   * @param operator
   */
  constructor(
    public readonly left: Expression,
    public readonly right: Expression,
    public readonly operator: "+" | "-"
  ) {
    super();
    this.deps.push(left, right);
  }

  /**
   * @override
   */
  eval(target: any) {
    return this.left.eval(target) + this.right.eval(target) * (this.operator === "+" ? 1 : -1);
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} + ${this.right.toString()}`;
  }
}

/**
 * Represent a binary comparison expression
 */
export class BinaryComparisonExpression extends Expression {
  /**
   *
   * @param left part of the expression
   * @param right part of the expression
   * @param operator to use
   */
  constructor(
    public readonly left: Expression,
    public readonly right: Expression,
    public readonly operator: ">" | "<" | ">=" | "<=" | "!=" | "="
  ) {
    super();
    this.deps.push(left, right);
  }

  /**
   * @override
   */
  eval(target: any) {
    switch (this.operator) {
      case ">":
        return this.left.eval(target) > this.right.eval(target);
      case "<":
        return this.left.eval(target) < this.right.eval(target);
      case ">=":
        return this.left.eval(target) >= this.right.eval(target);
      case "<=":
        return this.left.eval(target) <= this.right.eval(target);
      case "!=":
        return this.left.eval(target) != this.right.eval(target);
      case "=":
        return this.left.eval(target) == this.right.eval(target);
    }
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
  }
}

/**
 * Represent a binary logic expression
 */
export class BinaryLogicExpression extends Expression {
  /**
   *
   * @param left part of the expression
   * @param right part of the expression
   * @param operator to use
   */
  constructor(
    public readonly left: Expression,
    public readonly right: Expression,
    public readonly operator: "AND" | "OR" | "XOR"
  ) {
    super();
    this.deps.push(left, right);
  }

  /**
   * @override
   */
  eval(target: any) {
    switch (this.operator) {
      case "OR":
        return this.left.eval(target) || this.right.eval(target);
      case "XOR":
        return this.left.eval(target) ? !this.right.eval(target) : this.right.eval(target);
      case "AND":
        return this.left.eval(target) && this.right.eval(target);
    }
  }

  /**
   * @override
   */
  toString(): string {
    return `${this.left.toString()} ${this.operator} ${this.right.toString()}`;
  }
}

/**
 * Represent a value expression
 */
export class ValueExpression extends Expression {
  /**
   * Value represented by the expression
   * @param value
   */
  constructor(public readonly value: any) {
    super();
  }

  /**
   * @override
   */
  eval(target: any) {
    return this.value;
  }

  /**
   * @override
   */
  toString(): string {
    if (typeof this.value === "string") {
      return `"${this.value}"`;
    } else if (typeof this.value === "boolean") {
      return this.value.toString().toUpperCase();
    }
    return this.value.toString();
  }
}

/**
 * Create Expression based on the parsed token
 *
 * Expression allow to optimize and split between Query and Filter
 */
export class CESQLExpressionBuilder extends AbstractParseTreeVisitor<Expression> implements CESQLParserVisitor<any> {
  /**
   * By default accepting it
   * @returns
   */
  protected defaultResult() {
    return new ValueExpression(true);
  }

  /**
   * @override
   */
  visitCesql(ctx: CesqlContext): Expression {
    return this.visit(ctx.children[0]);
  }

  /**
   * @override
   */
  visitFunctionInvocationExpression(ctx: FunctionInvocationExpressionContext): Expression {
    const args = [];
    for (let i = 1; i < ctx.childCount; i += 2) {
      args.push(...(<Expression[]>(<any>this.visit(ctx.children[i]))));
    }
    return new FunctionExpression(<any>ctx.children[0].text, ...args).resolve();
  }

  /**
   * @override
   */
  visitUnaryLogicExpression(ctx: UnaryLogicExpressionContext): Expression {
    return new UnaryLogicExpression(this.getChildrenResults(ctx)[1]).resolve();
  }

  /**
   * @override
   */
  visitUnaryNumericExpression(ctx: UnaryNumericExpressionContext): Expression {
    return new UnaryNumericExpression(this.getChildrenResults(ctx)[1]).resolve();
  }

  /**
   * @override
   */
  visitLikeExpression(ctx: LikeExpressionContext): Expression {
    const [left, regexp] = [this.visit(ctx.children[0]), ctx.children[ctx.children.length - 1].text];
    return new LikeExpression(left, regexp, ctx.childCount === 4).resolve();
  }

  /**
   * @override
   */
  visitExistsExpression(ctx: ExistsExpressionContext): Expression {
    const results = this.getChildrenResults(ctx);
    return new ExistsExpression(results[1]).resolve();
  }

  /**
   * @override
   */
  visitInExpression(ctx: InExpressionContext): Expression {
    const results = this.getChildrenResults(ctx);
    if (ctx.childCount === 4) {
      return new InExpression(results[0], results[3], true).resolve();
    }
    return new InExpression(results[0], results[2]).resolve();
  }

  /**
   * @override
   */
  visitBinaryMultiplicativeExpression(ctx: BinaryMultiplicativeExpressionContext): Expression {
    const [left, op, right] = [this.visit(ctx.children[0]), ctx.children[1].text, this.visit(ctx.children[2])];
    /* istanbul ignore next */
    if (!["*", "/", "%"].includes(op)) {
      throw new Error("Not implemented");
    }
    return new BinaryMultiplicativeExpression(left, right, <"*" | "/" | "%">op).resolve();
  }

  /**
   * @override
   */
  visitBinaryAdditiveExpression(ctx: BinaryAdditiveExpressionContext): Expression {
    const [left, op, right] = [this.visit(ctx.children[0]), ctx.children[1].text, this.visit(ctx.children[2])];
    /* istanbul ignore next */
    if (!["+", "-"].includes(op)) {
      throw new Error("Not implemented");
    }
    return new BinaryAdditiveExpression(left, right, <"+" | "-">op).resolve();
  }

  /**
   * Retrieve the children results
   * @param ctx
   * @returns
   */
  getChildrenResults(ctx: any) {
    return ctx.children.map((c: any) => this.visit(c));
  }

  /**
   *
   * @param ctx
   * @returns
   */
  visitBinaryComparisonExpression(ctx: BinaryComparisonExpressionContext): Expression {
    const [left, op, right] = [this.visit(ctx.children[0]), ctx.children[1].text, this.visit(ctx.children[2])];
    /* istanbul ignore next */
    if (!["<", ">", "<=", ">=", "!=", "="].includes(op)) {
      throw new Error("Not implemented");
    }
    return new BinaryComparisonExpression(left, right, op as any).resolve();
  }

  /**
   * @override
   */
  visitBinaryLogicExpression(ctx: BinaryLogicExpressionContext): Expression {
    const [left, op, right] = [this.visit(ctx.children[0]), ctx.children[1].text, this.visit(ctx.children[2])];
    /* istanbul ignore next */
    if (!["AND", "OR", "XOR"].includes(op)) {
      throw new Error("Not implemented");
    }
    return new BinaryLogicExpression(left, right, <"AND" | "OR" | "XOR">op).resolve();
  }

  /**
   * @override
   */
  visitSubExpression(ctx: SubExpressionContext): Expression {
    return this.visit(ctx.children[1]);
  }

  /**
   * @override
   */
  visitIdentifier(ctx: IdentifierContext): any {
    return new AttributeExpression(ctx.text);
  }

  /**
   * @override
   */
  visitBooleanLiteral(ctx: BooleanLiteralContext): Expression {
    return new ValueExpression(ctx.text === "TRUE");
  }

  /**
   * @override
   */
  visitStringLiteral(ctx: StringLiteralContext): Expression {
    // Remove quotes
    return new ValueExpression(ctx.text.substr(1, ctx.text.length - 2));
  }

  /**
   * @override
   */
  visitIntegerLiteral(ctx: IntegerLiteralContext): Expression {
    return new ValueExpression(Number(ctx.text));
  }

  /**
   * @override
   */
  visitFunctionParameterList(ctx: FunctionParameterListContext): Expression[] {
    // Only take the odd part LBRACKET exp1 COMMA exp2 RBRACKET
    return this.getChildrenResults(ctx).filter((_: any, i: number) => i % 2);
  }

  /**
   * @override
   */
  visitSetExpression(ctx: SetExpressionContext): any[] {
    // Only take the odd part LBRACKET exp1 COMMA exp2 RBRACKET
    return this.getChildrenResults(ctx)
      .filter((_: any, i: number) => i % 2)
      .map(e => e.resolve());
  }
}

/**
 * SQL Filter implementation
 */
export class SqlFilterImplementation extends FilterImplementation<SqlFilter> {
  lexer: CESQLParserLexer;
  tree: any;
  query: Expression;
  /**
   *
   * @param definition {sql: "CESQL Expression"}
   */
  constructor(definition: SqlFilter) {
    super(definition);
    this.lexer = new CESQLParserLexer(new ANTLRInputStream(definition.sql));
    const tokenStream = new CommonTokenStream(this.lexer);
    const parser = new CESQLParserParser(tokenStream);

    // Parse the input, where `compilationUnit` is whatever entry point you defined
    this.tree = parser.cesql();
    this.query = new CESQLExpressionBuilder().visit(this.tree);
    // Display query post optimization
    // console.log("SQL", definition.sql, " => ", this.query.toString());
  }

  /**
   * Check if a cloudevent match the filter
   * @param event
   * @returns
   */
  match(event: CloudEvent): boolean {
    return this.query.eval(event);
  }

  /**
   * Some filter can be optimized into a simpler form
   *
   * Samples:
   *  LEFT(a, 3) = "foo" => prefix: {a: "foo"}
   *  RIGHT(a, 3) = "foo" => suffix: {a: "foo"}
   *  a = "foo" => exact: {a: "foo"}
   *
   * @returns
   */
  optimize(): FilterImplementation<ExactFilter | PrefixFilter | SuffixFilter | SqlFilter> {
    if (
      this.query instanceof BinaryComparisonExpression &&
      this.query.operator === "=" &&
      this.query.right instanceof ValueExpression
    ) {
      if (this.query.left instanceof AttributeExpression) {
        return new ExactFilterImplementation({
          exact: {
            [this.query.left.attribute]: this.query.right.value
          }
        });
      } else if (
        this.query.left instanceof FunctionExpression &&
        this.query.left.args[0] instanceof AttributeExpression
      ) {
        if (this.query.left.functionName === "LEFT") {
          return new PrefixFilterImplementation({
            prefix: {
              [this.query.left.args[0].attribute]: this.query.right.value
            }
          });
        } else if (this.query.left.functionName === "RIGHT") {
          return new SuffixFilterImplementation({
            suffix: {
              [this.query.left.args[0].attribute]: this.query.right.value
            }
          });
        }
      }
    }
    return this;
  }
}
