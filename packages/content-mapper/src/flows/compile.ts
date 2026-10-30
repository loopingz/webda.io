/**
 * Compile `.flow.ts` methods into workflow graphs.
 *
 * Each `async` method of a class extending `Workflow` is one flow `<Class>.<Method>`. Its body is walked
 * statement by statement and turned into the statements and expressions `@webda/workflow` runs (`./types.ts`).
 * Only a subset of TypeScript is accepted; everything else is a {@link FLOW_ERROR} diagnostic naming the construct,
 * which fails `webdac build` and shows in the editor.
 *
 * Statement ids are structural: `<method>/<kind>[<index in block>]`, with `then`/`else`, `body`/`catch`/`finally`
 * and `branch[<n>]` naming the blocks of a statement that has several, and `/<Operation>` appended to a task. A
 * `// @label <name>` comment directly above a statement replaces its id with `<method>/<name>`.
 */
import type { ClassDeclaration, MethodDeclaration, Node, SourceFile } from "typescript/unstable/ast";
import { NodeFlags, SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { SymbolFlags, type Symbol as TsSymbol } from "typescript/unstable/sync";
import type { AnalysisContext } from "../plan.ts";
import { generateActionInput } from "../schema/action.ts";
import {
  decoratorName,
  decoratorsOf,
  FLOW_SUFFIX,
  flowClassesOf,
  hasModifier,
  isFlowClass,
  operationServices,
  type OperationService
} from "./discovery.ts";
import {
  BUILTINS,
  capitalize,
  FLOW_ERROR,
  flowVersion,
  TASK_OPTION_TYPES,
  type BinaryOp,
  type CompiledFlow,
  type Expr,
  type FlowCron,
  type Stmt,
  type TaskOptions
} from "./types.ts";

/** A construct a flow cannot contain. */
export interface FlowCompileError {
  /** Absolute file name. */
  file: string;
  /** Offset in the authored file. */
  start: number;
  length: number;
  /** Always {@link FLOW_ERROR}. */
  code: number;
  message: string;
}

/** What {@link compileFlows} returns. */
export interface FlowCompileResult {
  /** Flows without errors, by id. */
  flows: Record<string, CompiledFlow>;
  errors: FlowCompileError[];
}

/** Variable receiving a branch or item result before it is returned. */
const RESULT = "$result";

/**
 * `undefined`: JSON has no undefined, so it is read as a member an empty object does not have
 */
export const UNDEFINED: Expr = { get: [{ obj: {} }, { lit: "undefined" }] };

/** What a `@label` name may be: it never contains the `/`, `[` or `@` of structural ids and task keys. */
const LABEL = /^[A-Za-z][A-Za-z0-9_-]*$/;

/** Operators of a flow expression, by token kind. */
const BINARY: Record<number, BinaryOp> = {
  [SyntaxKind.EqualsEqualsToken]: "==",
  [SyntaxKind.ExclamationEqualsToken]: "!=",
  [SyntaxKind.EqualsEqualsEqualsToken]: "===",
  [SyntaxKind.ExclamationEqualsEqualsToken]: "!==",
  [SyntaxKind.LessThanToken]: "<",
  [SyntaxKind.LessThanEqualsToken]: "<=",
  [SyntaxKind.GreaterThanToken]: ">",
  [SyntaxKind.GreaterThanEqualsToken]: ">=",
  [SyntaxKind.PlusToken]: "+",
  [SyntaxKind.MinusToken]: "-",
  [SyntaxKind.AsteriskToken]: "*",
  [SyntaxKind.SlashToken]: "/",
  [SyntaxKind.PercentToken]: "%",
  [SyntaxKind.AmpersandAmpersandToken]: "&&",
  [SyntaxKind.BarBarToken]: "||",
  [SyntaxKind.QuestionQuestionToken]: "??"
};

/** Replacements suggested for the usual non-deterministic calls. */
const SUGGESTIONS: Record<string, string> = {
  "Date.now": "use Date.Now()",
  "Math.random": "use Random.Number()",
  "crypto.randomUUID": "use Random.Uuid()",
  setTimeout: "use Sleep()"
};

/** Statements rejected as a whole, with how to name them. */
const STATEMENT_NAMES: Partial<Record<SyntaxKind, string>> = {
  [SyntaxKind.ForStatement]: "for (;;) loop: use for...of or while",
  [SyntaxKind.ForInStatement]: "for...in loop: use for...of",
  [SyntaxKind.DoStatement]: "do...while loop: use while",
  [SyntaxKind.SwitchStatement]: "switch statement: use if/else",
  [SyntaxKind.LabeledStatement]: "labelled statement",
  [SyntaxKind.BreakStatement]: "break statement",
  [SyntaxKind.ContinueStatement]: "continue statement",
  [SyntaxKind.Block]: "block statement",
  [SyntaxKind.FunctionDeclaration]: "function declaration",
  [SyntaxKind.ClassDeclaration]: "class declaration",
  [SyntaxKind.WithStatement]: "with statement",
  [SyntaxKind.DebuggerStatement]: "debugger statement"
};

/** Where a flow class or flow id is declared, to report a duplicate. */
interface Declared {
  file: string;
  node: Node;
  /** Whether the duplicate error was already reported at this place. */
  reported?: boolean;
}

/** Thrown to abandon a construct: the error is already recorded. */
class Reported extends Error {}

/**
 * Compile one flow method
 */
class MethodCompiler {
  /** Variables in scope, innermost last. */
  protected scopes: Set<string>[] = [];
  /** Labels used, to refuse duplicates. */
  protected labels = new Set<string>();
  /** Index of the first scope of each enclosing Workflow.Parallel body, innermost last. */
  protected boundaries: number[] = [];
  /** Catch variables: they hold the caught error, and only rethrowing them is allowed. */
  protected catchVars = new Set<string>();

  /**
   * @param ctx - analysis context
   * @param sf - the flow file
   * @param method - the method
   * @param services - the project's services
   * @param errors - accumulator
   */
  constructor(
    protected ctx: AnalysisContext,
    protected sf: SourceFile,
    protected method: MethodDeclaration,
    protected services: Map<string, OperationService | undefined>,
    protected errors: FlowCompileError[]
  ) {}

  /**
   * Method name, the root of every statement id
   * @returns the name
   */
  get name(): string {
    return (this.method.name as any).text;
  }

  /**
   * Record an error and abandon the construct
   * @param node - the offending node
   * @param message - what is wrong
   * @returns never
   */
  fail(node: Node, message: string): never {
    this.report(node, message);
    throw new Reported(message);
  }

  /**
   * Record an error
   * @param node - the offending node
   * @param message - what is wrong
   */
  report(node: Node, message: string): void {
    const start = (node as any).getStart();
    this.errors.push({ file: this.sf.fileName, start, length: node.end - start, code: FLOW_ERROR, message });
  }

  /**
   * Source text of a node
   * @param node - the node
   * @returns its text
   */
  text(node: Node): string {
    return this.ctx.textOf(this.sf, node);
  }

  /**
   * Compile the method body
   * @returns parameter names and statements, undefined when an error was reported
   */
  compile(): { params: string[]; body: Stmt[] } | undefined {
    const before = this.errors.length;
    if (!hasModifier(this.method, SyntaxKind.AsyncKeyword)) {
      this.report(this.method.name, `Flow method ${this.name} must be async`);
      return undefined;
    }
    const params: string[] = [];
    for (const parameter of this.method.parameters as unknown as any[]) {
      if (!is.isIdentifier(parameter.name) || parameter.dotDotDotToken) {
        this.report(parameter, "Flow parameters must be plain names: no destructuring or rest parameter");
        continue;
      }
      params.push(parameter.name.text);
    }
    if (!this.method.body) {
      this.report(this.method.name, `Flow method ${this.name} has no body`);
      return undefined;
    }
    this.scopes = [new Set(params)];
    const body = [...this.defaults(), ...this.block(this.method.body.statements as unknown as Node[], this.name)];
    return this.errors.length === before ? { params, body } : undefined;
  }

  /**
   * Default parameter values: \`if (x === undefined) x = <default>\`, as JavaScript applies them
   * @returns the statements, before the body
   */
  defaults(): Stmt[] {
    const out: Stmt[] = [];
    (this.method.parameters as unknown as any[]).forEach((parameter, index) => {
      if (!parameter.initializer || !is.isIdentifier(parameter.name)) return;
      const name = parameter.name.text;
      const self = `${this.name}/default[${index}]`;
      try {
        out.push({
          kind: "if",
          id: self,
          cond: { op: "===", args: [{ var: name }, UNDEFINED] },
          then: [{ kind: "assign", id: `${self}/then/assign[0]`, name, value: this.expr(parameter.initializer) }]
        });
      } catch (err) {
        if (!(err instanceof Reported)) throw err;
      }
    });
    return out;
  }

  /**
   * Declare a variable in the current scope
   *
   * The engine keeps one set of variables per flow (per branch copy): a declaration shadowing an enclosing one would
   * overwrite it, so it is refused. A name declared again in a sibling block is fine: every declaration assigns it.
   * @param node - the declaring node, for the error
   * @param name - the name
   */
  declare(node: Node, name: string): void {
    if (this.declared(name)) {
      this.fail(
        node,
        `${name} is already declared in an enclosing scope: flow variables share one scope, so declaring it again ` +
          `would overwrite it; rename it`
      );
    }
    if (name.startsWith("$")) this.fail(node, `${name}: flow variable names cannot start with $; rename it`);
    this.scopes[this.scopes.length - 1].add(name);
  }

  /**
   * Whether a name is a declared variable
   * @param name - the name
   * @returns true when in scope
   */
  declared(name: string): boolean {
    return this.scopeOf(name) >= 0;
  }

  /**
   * Run with a new scope
   * @param names - names declared in it from the start
   * @param fn - the work
   * @returns its result
   */
  scoped<T>(names: string[], fn: () => T): T {
    this.scopes.push(new Set(names));
    try {
      return fn();
    } finally {
      this.scopes.pop();
    }
  }

  /**
   * Compile a block of statements, in a new scope
   * @param statements - the statements
   * @param parent - id of the enclosing block
   * @param names - names declared in the block from the start
   * @returns the compiled statements
   */
  block(statements: Node[], parent: string, names: string[] = []): Stmt[] {
    return this.scoped(names, () => {
      const out: Stmt[] = [];
      statements.forEach((statement, index) => {
        try {
          const compiled = this.statement(statement, parent, index);
          if (compiled) out.push(compiled);
        } catch (err) {
          if (!(err instanceof Reported)) throw err;
        }
      });
      return out;
    });
  }

  /**
   * Statements of a branch: a block, or a single statement
   * @param node - the branch
   * @param parent - id of the branch
   * @returns the compiled statements
   */
  branch(node: Node, parent: string): Stmt[] {
    return this.block(is.isBlock(node) ? (node.statements as unknown as Node[]) : [node], parent);
  }

  /**
   * The `@label` of a statement, from the line comment directly above it
   * @param node - the statement
   * @returns the label
   */
  label(node: Node): string | undefined {
    const trivia = this.ctx.triviaOf(this.sf, node);
    const match = /\/\/[ \t]*@label\b([^\n]*)\n[ \t]*$/.exec(trivia);
    if (!match) return undefined;
    const label = match[1].trim();
    if (!LABEL.test(label)) {
      this.fail(
        node,
        `Invalid @label "${label}": a label is a letter followed by letters, digits, _ or -, unique in the flow`
      );
    }
    if (this.labels.has(label)) {
      this.fail(node, `Duplicate @label ${label} in flow method ${this.name}`);
    }
    this.labels.add(label);
    return label;
  }

  /**
   * Compile one statement
   * @param node - the statement
   * @param parent - id of the enclosing block
   * @param index - its index in the block
   * @returns the statement, undefined when it compiles to nothing
   */
  statement(node: any, parent: string, index: number): Stmt | undefined {
    const label = this.label(node);
    /**
     * Id of the statement
     * @param kind - its kind segment
     * @param operation - operation of a task
     * @returns the id
     */
    const id = (kind: string, operation?: string) =>
      label ? `${this.name}/${label}` : `${parent}/${kind}[${index}]${operation ? `/${operation}` : ""}`;

    if (is.isEmptyStatement(node)) return undefined;
    if (is.isVariableStatement(node)) {
      const list: any = node.declarationList;
      if (!(list.flags & (NodeFlags.Const | NodeFlags.Let)) || list.flags & NodeFlags.Using) {
        this.fail(node, "var declaration: use const or let");
      }
      if (list.declarations.length !== 1) this.fail(node, "Declare one name per const or let");
      const declaration = list.declarations[0];
      if (!is.isIdentifier(declaration.name)) {
        this.fail(declaration.name, "Destructuring: declare one name per const or let");
      }
      const name = declaration.name.text;
      this.declare(declaration.name, name);
      // A let without initializer is undefined each time it runs, in a loop too
      if (!declaration.initializer) return { kind: "assign", id: id("assign"), name, value: UNDEFINED };
      return this.assignment(name, declaration.initializer, id);
    }
    if (is.isExpressionStatement(node)) {
      const expression = this.unwrap(node.expression);
      if (is.isAwaitExpression(expression)) {
        return this.call(this.unwrap((expression as any).expression), id);
      }
      if (is.isBinaryExpression(expression)) {
        const operator = (expression as any).operatorToken.kind;
        if (operator === SyntaxKind.EqualsToken) {
          const target = this.unwrap((expression as any).left);
          if (!is.isIdentifier(target)) {
            this.fail(target, "Only an assignment to a declared variable is allowed, not to a member");
          }
          const name = (target as any).text;
          if (!this.declared(name)) this.fail(target, `Assignment to ${name}, which is not a variable of the flow`);
          if (this.catchVars.has(name)) {
            this.fail(expression, `${name} holds the caught error: declare another variable instead of assigning it`);
          }
          const boundary = this.boundaries[this.boundaries.length - 1];
          if (boundary !== undefined && this.scopeOf(name) < boundary) {
            this.fail(
              expression,
              `${name} is declared outside this Workflow.Parallel body: each item runs on a copy of the variables, ` +
                `so the assignment would be lost; return the value from the body instead`
            );
          }
          return this.assignment(name, (expression as any).right, id);
        }
        if (operator >= SyntaxKind.FirstCompoundAssignment && operator <= SyntaxKind.LastCompoundAssignment) {
          this.fail(
            expression,
            `Compound assignment ${this.text((expression as any).operatorToken)}: write x = x + ... instead`
          );
        }
      }
      if (is.isCallExpression(expression)) {
        if (this.isFlowCall(expression)) this.fail(expression, `${this.text(expression)} must be awaited`);
      }
      // Reported by expr, then refused
      this.expr(expression);
      return this.fail(expression, `Expression statement ${this.text(expression)}: only an awaited call is allowed`);
    }
    if (is.isIfStatement(node)) {
      const self = id("if");
      const cond = this.expr(node.expression);
      const then = this.branch(node.thenStatement, `${self}/then`);
      const stmt: Stmt = { kind: "if", id: self, cond, then };
      if (node.elseStatement) stmt.else = this.branch(node.elseStatement, `${self}/else`);
      return stmt;
    }
    if (is.isForOfStatement(node)) {
      const self = id("for");
      if ((node as any).awaitModifier) this.fail(node, "for await: use for...of");
      const initializer: any = node.initializer;
      const declaration = is.isVariableDeclarationList(initializer) ? initializer.declarations[0] : undefined;
      if (!declaration || !is.isIdentifier(declaration.name) || initializer.declarations.length !== 1) {
        this.fail(initializer, "for...of declares one const name: for (const item of items)");
      }
      const item = declaration.name.text;
      this.declare(declaration.name, item);
      this.scopes[this.scopes.length - 1].delete(item);
      const items = this.expr(node.expression);
      const body = this.block(
        is.isBlock(node.statement) ? (node.statement.statements as unknown as Node[]) : [node.statement],
        self,
        [item]
      );
      return { kind: "forOf", id: self, item, items, body };
    }
    if (is.isWhileStatement(node)) {
      const self = id("while");
      return { kind: "while", id: self, cond: this.expr(node.expression), body: this.branch(node.statement, self) };
    }
    if (is.isTryStatement(node)) {
      const self = id("try");
      const stmt: Stmt = { kind: "try", id: self, body: this.branch(node.tryBlock, `${self}/body`) };
      if (node.catchClause) {
        const binding: any = node.catchClause.variableDeclaration;
        if (binding && !is.isIdentifier(binding.name)) {
          this.fail(binding, "catch takes one name: catch (e)");
        }
        const names = binding ? [binding.name.text] : [];
        if (binding) {
          this.declare(binding.name, binding.name.text);
          this.scopes[this.scopes.length - 1].delete(binding.name.text);
          stmt.catchVar = binding.name.text;
          this.catchVars.add(binding.name.text);
        }
        stmt.catch = this.block(node.catchClause.block.statements as unknown as Node[], `${self}/catch`, names);
      }
      if (node.finallyBlock) stmt.finally = this.branch(node.finallyBlock, `${self}/finally`);
      return stmt;
    }
    if (is.isReturnStatement(node)) {
      const stmt: Stmt = { kind: "return", id: id("return") };
      if (node.expression) stmt.value = this.expr(node.expression);
      return stmt;
    }
    if (is.isThrowStatement(node)) {
      return { kind: "throw", id: id("throw"), value: this.thrown(node.expression) };
    }
    return this.fail(
      node,
      `${STATEMENT_NAMES[node.kind as SyntaxKind] ?? SyntaxKind[node.kind]} is not allowed in a flow`
    );
  }

  /**
   * The value of a throw: the catch variable, rethrown, or \`{ code, message }\` with string values
   *
   * The engine turns anything else into a FlowError, so the catch would not see what TypeScript says it throws.
   * @param node - the thrown expression
   * @returns the expression
   */
  thrown(node: any): Expr {
    const value = this.unwrap(node);
    const message =
      "throw takes { code, message } with string literal or template values, or rethrows the catch variable";
    if (is.isIdentifier(value)) {
      if (!this.catchVars.has(value.text)) this.fail(node, `${message}: ${value.text} is not a catch variable`);
      return this.expr(value);
    }
    if (!is.isObjectLiteralExpression(value)) this.fail(node, message);
    const keys: string[] = [];
    for (const property of (value as any).properties) {
      const key = is.isPropertyAssignment(property) ? this.propertyName(property.name) : undefined;
      const initializer = key && this.unwrap(property.initializer);
      if (
        (key !== "code" && key !== "message") ||
        !(
          is.isStringLiteral(initializer) ||
          is.isNoSubstitutionTemplateLiteral(initializer) ||
          is.isTemplateExpression(initializer)
        )
      ) {
        this.fail(property, message);
      }
      keys.push(key);
    }
    if (keys.length !== 2 || !keys.includes("code") || !keys.includes("message")) this.fail(node, message);
    return this.expr(value);
  }

  /**
   * Index of the scope declaring a name
   * @param name - the name
   * @returns the innermost scope index, -1 when undeclared
   */
  scopeOf(name: string): number {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) return i;
    }
    return -1;
  }

  /**
   * A declaration or assignment: a task when the value is an awaited call
   * @param name - the variable
   * @param value - the value expression
   * @param id - id of the statement
   * @returns the statement
   */
  assignment(name: string, value: any, id: (kind: string, operation?: string) => string): Stmt {
    const unwrapped = this.unwrap(value);
    if (is.isAwaitExpression(unwrapped)) {
      const stmt = this.call(this.unwrap((unwrapped as any).expression), id);
      stmt.assign = name;
      return stmt;
    }
    return { kind: "assign", id: id("assign"), name, value: this.expr(value) };
  }

  /**
   * Strip what only matters to the type checker: parentheses, `as`, `satisfies`, `!`
   * @param node - the expression, undefined for a missing argument
   * @returns the inner expression
   */
  unwrap(node: any): any {
    while (
      node &&
      (is.isParenthesizedExpression(node) ||
        is.isAsExpression(node) ||
        is.isSatisfiesExpression(node) ||
        is.isNonNullExpression(node) ||
        is.isTypeAssertion(node))
    ) {
      node = node.expression;
    }
    return node;
  }

  /**
   * `X.Y` of a callee
   * @param callee - the callee expression
   * @returns the object and member names
   */
  member(callee: any): { object: string; name: string } | undefined {
    if (is.isPropertyAccessExpression(callee) && is.isIdentifier(callee.expression) && is.isIdentifier(callee.name)) {
      return { object: (callee.expression as any).text, name: (callee.name as any).text };
    }
    return undefined;
  }

  /**
   * Whether a call is one a flow can await
   * @param call - the call
   * @returns true for an operation, a flow or a built-in
   */
  isFlowCall(call: any): boolean {
    const callee = this.unwrap(call.expression);
    if (is.isIdentifier(callee)) return callee.text === "Sleep";
    const member = this.member(callee);
    if (!member) return false;
    const { object, name } = member;
    return (
      (object === "Workflow" && ["Parallel", "Start", "Call"].includes(name)) ||
      (object === "Promise" && name === "all") ||
      (object === "Date" && name === "Now") ||
      (object === "Random" && ["Number", "Uuid"].includes(name)) ||
      (object === "Wait" && name === "ForEvent") ||
      !!this.flowClass(callee.expression) ||
      !!this.services.get(object)?.operations.has(name)
    );
  }

  /**
   * Symbol an identifier refers to, imports followed
   * @param node - the identifier
   * @returns the symbol
   */
  symbolOf(node: Node): TsSymbol | undefined {
    const symbol = this.ctx.checker.getSymbolAtLocation(node);
    if (symbol && symbol.flags & SymbolFlags.Alias) return this.ctx.checker.getAliasedSymbol(symbol);
    return symbol;
  }

  /**
   * The flow class an identifier refers to
   * @param node - the identifier
   * @returns the class declaration, undefined when it is not a flow class
   */
  flowClassOf(node: Node): ClassDeclaration | undefined {
    for (const handle of this.symbolOf(node)?.declarations ?? []) {
      const declaration: any = handle.resolve(this.ctx.project);
      if (declaration && is.isClassDeclaration(declaration) && isFlowClass(this.ctx, declaration as ClassDeclaration)) {
        return declaration as ClassDeclaration;
      }
    }
    return undefined;
  }

  /**
   * Name of the flow class an identifier refers to
   * @param node - the identifier
   * @returns the class name, undefined when it is not a flow class
   */
  flowClass(node: Node): string | undefined {
    const cls = this.flowClassOf(node);
    return cls && (cls.name as any).text;
  }

  /**
   * The method of a flow class a `FlowClass.Method` reference names
   * @param callee - the reference
   * @returns the flow id
   */
  flowReference(callee: any): string | undefined {
    const member = this.member(callee);
    const cls = member && this.flowClassOf(callee.expression);
    if (!member || !cls) return undefined;
    const found = (cls.members as unknown as any[]).some(
      (m: any) => is.isMethodDeclaration(m) && is.isIdentifier(m.name) && capitalize(m.name.text) === member.name
    );
    return found ? `${(cls.name as any).text}.${member.name}` : undefined;
  }

  /**
   * Compile an awaited call into a task, parallel or map statement
   * @param call - the call expression
   * @param id - id of the statement
   * @returns the statement
   */
  call(call: any, id: (kind: string, operation?: string) => string): Stmt & { assign?: string } {
    if (!is.isCallExpression(call)) {
      this.fail(call, `await of ${this.text(call)}: only a call to an operation, a flow or a built-in can be awaited`);
    }
    const callee = this.unwrap(call.expression);
    const args: any[] = [...call.arguments];
    const task = (operation: string, input: Expr, extra: Partial<Stmt> = {}): Stmt =>
      ({ kind: "task", id: id("task", operation), operation, input, ...extra }) as Stmt;
    const noArguments = (): Expr => {
      if (args.length) this.fail(call, `${this.text(callee)}() takes no argument`);
      return { obj: {} };
    };

    if (is.isIdentifier(callee) && callee.text === "Sleep") {
      if (args.length !== 1) this.fail(call, "Sleep takes one argument: a duration or { until }");
      const arg = this.unwrap(args[0]);
      return task(
        BUILTINS.Sleep,
        is.isObjectLiteralExpression(arg) ? this.expr(arg) : { obj: { duration: this.expr(arg) } }
      );
    }
    const member = this.member(callee);
    if (member) {
      const { object, name } = member;
      if (object === "Date" && name === "Now") return task(BUILTINS.DateNow, noArguments());
      if (object === "Random" && name === "Number") return task(BUILTINS.RandomNumber, noArguments());
      if (object === "Random" && name === "Uuid") return task(BUILTINS.RandomUuid, noArguments());
      if (object === "Wait" && name === "ForEvent") {
        const options = this.unwrap(args[1]);
        if (args.length !== 2 || !is.isObjectLiteralExpression(options)) {
          this.fail(call, "Wait.ForEvent takes the event name and an object literal: { key, timeout?, allow? }");
        }
        const input = this.expr(options) as { obj: Record<string, Expr> };
        return task(BUILTINS.WaitForEvent, { obj: { name: this.expr(args[0]), ...input.obj } });
      }
      if (object === "Workflow" && name === "Call") {
        const operation = this.unwrap(args[0]);
        if (!operation || !(is.isStringLiteral(operation) || is.isNoSubstitutionTemplateLiteral(operation))) {
          this.fail(call, "Workflow.Call takes the operation id as a string literal");
        }
        if (args.length > 3) this.fail(call, "Workflow.Call takes an operation id, an input and options");
        return task((operation as any).text, args[1] ? this.expr(args[1]) : { obj: {} }, this.optionsOf(args[2]));
      }
      if (object === "Workflow" && name === "Start") {
        const flow = args[0] && this.flowReference(this.unwrap(args[0]));
        if (!flow)
          this.fail(args[0] ?? call, "Workflow.Start takes a flow method, as OtherFlows.Method, and its input");
        if (args.length > 2) this.fail(call, "Workflow.Start takes a flow method and its input");
        return task(BUILTINS.Start, {
          obj: { flow: { lit: flow }, input: args[1] ? this.expr(args[1]) : { obj: {} } }
        });
      }
      if (object === "Workflow" && name === "Parallel") return this.map(call, args, id);
      if (object === "Promise" && name === "all") return this.parallel(call, args, id);

      const flow = this.flowReference(callee);
      if (flow) {
        if (args.length > 2) this.fail(call, `${flow} takes an input and options`);
        return task(flow, args[0] ? this.expr(args[0]) : { obj: {} }, this.optionsOf(args[1]));
      }
      const service = this.services.get(object);
      const operation = service?.operations.get(name);
      if (service && operation) {
        if (args.length > 2) this.fail(call, `${object}.${name} takes an input and options`);
        return task(`${object}.${name}`, args[0] ? this.expr(args[0]) : { obj: {} }, {
          ...this.optionsOf(args[1]),
          target: { class: service.className, method: operation.method }
        } as Partial<Stmt>);
      }
      const conflict = service?.conflicts.get(name);
      if (conflict) {
        this.fail(
          callee,
          `${object}.${name} is ambiguous: ${service!.className} has methods ${conflict.join(", ")} for the same ` +
            `operation id; rename one`
        );
      }
      if (service) this.fail(callee, `${object}.${name} is not an operation of ${service.className}`);
    }
    return this.forbiddenCall(call);
  }

  /**
   * Refuse a call to something that is not an operation, a flow or a built-in
   * @param call - the call
   * @returns never
   */
  forbiddenCall(call: any): never {
    const callee = this.text(this.unwrap(call.expression));
    const suggestion = SUGGESTIONS[callee];
    return this.fail(
      call,
      `${callee}() is not allowed in a flow: ` +
        (suggestion ?? "only operations, flows and built-ins can be called, or use Workflow.Call(operationId, input)")
    );
  }

  /**
   * Task options: an object literal of literals
   * @param node - the argument
   * @returns `{ options }`, empty when there is none
   */
  optionsOf(node: any): { options?: TaskOptions } {
    if (!node) return {};
    const literal = this.unwrap(node);
    if (!is.isObjectLiteralExpression(literal)) this.fail(node, "Task options must be an object literal of literals");
    const options: Record<string, any> = {};
    for (const property of (literal as any).properties) {
      const key = is.isPropertyAssignment(property) ? this.propertyName(property.name) : undefined;
      const type = key ? (TASK_OPTION_TYPES as Record<string, string>)[key] : undefined;
      if (!key || !type) {
        this.fail(property, `Unknown task option ${this.text(property)}: ${Object.keys(TASK_OPTION_TYPES).join(", ")}`);
      }
      const value = this.literal(property.initializer);
      if (typeof value !== type) this.fail(property.initializer, `Task option ${key} must be a ${type} literal`);
      options[key] = value;
    }
    return Object.keys(options).length ? { options } : {};
  }

  /**
   * Value of a literal: string, number, boolean, null, or an object or array of literals
   * @param node - the expression
   * @returns the value
   */
  literal(node: any): any {
    node = this.unwrap(node);
    if (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) return node.text;
    if (is.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === SyntaxKind.TrueKeyword) return true;
    if (node.kind === SyntaxKind.FalseKeyword) return false;
    if (node.kind === SyntaxKind.NullKeyword) return null;
    if (
      is.isPrefixUnaryExpression(node) &&
      node.operator === SyntaxKind.MinusToken &&
      is.isNumericLiteral(node.operand)
    ) {
      return -Number(node.operand.text);
    }
    if (is.isArrayLiteralExpression(node)) return node.elements.map((element: any) => this.literal(element));
    if (is.isObjectLiteralExpression(node)) {
      const value: Record<string, any> = {};
      for (const property of node.properties as unknown as any[]) {
        const key = is.isPropertyAssignment(property) ? this.propertyName(property.name) : undefined;
        if (key === undefined) this.fail(property, `${this.text(property)} must be a literal property`);
        value[key] = this.literal(property.initializer);
      }
      return value;
    }
    return this.fail(node, `${this.text(node)} must be a literal`);
  }

  /**
   * Name of an object literal property: an identifier, a string or numeric literal
   * @param name - the property name node
   * @returns the name, undefined for a computed name that is not a string literal
   */
  propertyName(name: any): string | undefined {
    if (is.isIdentifier(name) || is.isStringLiteral(name) || is.isNumericLiteral(name)) return name.text;
    if (is.isComputedPropertyName(name)) {
      const inner = this.unwrap(name.expression);
      if (is.isStringLiteral(inner) || is.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
    }
    return undefined;
  }

  /**
   * The statements of a branch made of a single call: the call, its result returned
   * @param call - the call
   * @param parent - id of the branch
   * @returns the statements
   */
  callBody(call: any, parent: string): Stmt[] {
    const inner = this.unwrap(call);
    const target = is.isAwaitExpression(inner) ? this.unwrap((inner as any).expression) : inner;
    const stmt = this.call(target, (kind, operation) => `${parent}/${kind}[0]${operation ? `/${operation}` : ""}`);
    stmt.assign = RESULT;
    return [stmt, { kind: "return", id: `${parent}/return[1]`, value: { var: RESULT } }];
  }

  /**
   * `Promise.all([calls])`: a parallel statement
   * @param call - the call
   * @param args - its arguments
   * @param id - id of the statement
   * @returns the statement
   */
  parallel(call: any, args: any[], id: (kind: string) => string): Stmt {
    const list = this.unwrap(args[0]);
    if (args.length !== 1 || !is.isArrayLiteralExpression(list)) {
      this.fail(call, "Promise.all takes an array literal of calls");
    }
    const self = id("parallel");
    const branches = (list as any).elements.map((element: any, index: number) =>
      this.callBody(element, `${self}/branch[${index}]`)
    );
    return { kind: "parallel", id: self, branches };
  }

  /**
   * `Workflow.Parallel(items, item => ..., { concurrency })`: a map statement
   * @param call - the call
   * @param args - its arguments
   * @param id - id of the statement
   * @returns the statement
   */
  map(call: any, args: any[], id: (kind: string) => string): Stmt {
    const fn = this.unwrap(args[1]);
    if (args.length < 2 || args.length > 3 || !is.isArrowFunction(fn)) {
      this.fail(call, "Workflow.Parallel takes the items, an arrow function and options");
    }
    const parameters: any[] = (fn as any).parameters;
    if (parameters.length !== 1 || !is.isIdentifier(parameters[0].name) || parameters[0].initializer) {
      this.fail(fn, "The Workflow.Parallel function takes one parameter, without default: the item");
    }
    const item = parameters[0].name.text;
    this.declare(parameters[0].name, item);
    this.scopes[this.scopes.length - 1].delete(item);
    const self = id("map");
    const items = this.expr(args[0]);
    // Each item runs on a copy of the variables: assignments to outer ones are refused
    this.boundaries.push(this.scopes.length);
    let body: Stmt[];
    try {
      body = is.isBlock((fn as any).body)
        ? this.block((fn as any).body.statements, self, [item])
        : this.scoped([item], () => this.callBody((fn as any).body, self));
    } finally {
      this.boundaries.pop();
    }
    const stmt: Stmt = { kind: "map", id: self, items, item, body };
    if (args[2]) {
      const options = this.literal(args[2]);
      for (const key of Object.keys(options)) {
        if (key !== "concurrency" || typeof options[key] !== "number") {
          this.fail(args[2], "Workflow.Parallel options are { concurrency: number }");
        }
      }
      if (options.concurrency !== undefined) stmt.concurrency = options.concurrency;
    }
    return stmt;
  }

  /**
   * Compile an expression
   * @param node - the expression
   * @returns the flow expression
   */
  expr(node: any): Expr {
    node = this.unwrap(node);
    if (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) return { lit: node.text };
    if (is.isNumericLiteral(node)) return { lit: Number(node.text) };
    if (node.kind === SyntaxKind.TrueKeyword) return { lit: true };
    if (node.kind === SyntaxKind.FalseKeyword) return { lit: false };
    if (node.kind === SyntaxKind.NullKeyword) return { lit: null };
    if (node.kind === SyntaxKind.ThisKeyword) this.fail(node, "this is not allowed in a flow");
    if (is.isIdentifier(node)) {
      const name = node.text;
      if (name === "undefined") this.fail(node, "undefined is not a JSON value: use null");
      if (!this.declared(name)) {
        this.fail(
          node,
          `${name} is not a variable of the flow: a closure over a module-level variable ${name} is not allowed`
        );
      }
      return { var: name };
    }
    if (is.isPropertyAccessExpression(node)) {
      return { get: [this.expr(node.expression), { lit: (node.name as any).text }] };
    }
    if (is.isElementAccessExpression(node)) {
      return { get: [this.expr(node.expression), this.expr(node.argumentExpression)] };
    }
    if (is.isBinaryExpression(node)) {
      const operator = (node as any).operatorToken.kind;
      const op = BINARY[operator];
      if (!op) {
        this.fail(node, `Operator ${this.text((node as any).operatorToken)} is not allowed in a flow expression`);
      }
      return { op, args: [this.expr((node as any).left), this.expr((node as any).right)] };
    }
    if (is.isPrefixUnaryExpression(node)) {
      if (node.operator === SyntaxKind.ExclamationToken) return { not: this.expr(node.operand) };
      if (node.operator === SyntaxKind.MinusToken) return { neg: this.expr(node.operand) };
      const operator =
        node.operator === SyntaxKind.PlusPlusToken
          ? "++"
          : node.operator === SyntaxKind.MinusMinusToken
            ? "--"
            : this.text(node).charAt(0);
      this.fail(node, `Operator ${operator} is not allowed in a flow`);
    }
    if (is.isPostfixUnaryExpression(node)) {
      this.fail(node, `Operator ${node.operator === SyntaxKind.PlusPlusToken ? "++" : "--"} is not allowed in a flow`);
    }
    if (is.isConditionalExpression(node)) {
      return { cond: [this.expr(node.condition), this.expr(node.whenTrue), this.expr(node.whenFalse)] };
    }
    if (is.isObjectLiteralExpression(node)) {
      const obj: Record<string, Expr> = {};
      for (const property of node.properties as unknown as any[]) {
        if (is.isSpreadAssignment(property)) this.fail(property, "Object spread is not allowed in a flow");
        if (is.isShorthandPropertyAssignment(property)) {
          obj[(property.name as any).text] = this.expr(property.name);
          continue;
        }
        const key = is.isPropertyAssignment(property) ? this.propertyName(property.name) : undefined;
        if (key === undefined) {
          this.fail(property, `${this.text(property)}: only name: value properties with literal keys are allowed`);
        }
        obj[key] = this.expr(property.initializer);
      }
      return { obj };
    }
    if (is.isArrayLiteralExpression(node)) {
      return {
        arr: (node.elements as unknown as any[]).map(element => {
          if (is.isSpreadElement(element)) this.fail(element, "Array spread is not allowed in a flow");
          if (is.isOmittedExpression(element)) this.fail(node, "Array holes are not allowed in a flow");
          return this.expr(element);
        })
      };
    }
    if (is.isTemplateExpression(node)) {
      const tpl: (string | Expr)[] = [];
      if (node.head.text) tpl.push(node.head.text);
      for (const span of node.templateSpans as unknown as any[]) {
        tpl.push(this.expr(span.expression));
        if (span.literal.text) tpl.push(span.literal.text);
      }
      return { tpl };
    }
    if (is.isAwaitExpression(node)) {
      this.fail(
        node,
        "await inside an expression is not allowed: await a call as a statement, or as the value of a const, let or assignment"
      );
    }
    if (is.isCallExpression(node)) {
      if (this.isFlowCall(node)) this.fail(node, `${this.text(node)} must be awaited, as a statement or a value`);
      this.forbiddenCall(node);
    }
    if (is.isNewExpression(node)) {
      const name = this.text(node.expression);
      this.fail(node, `new ${name}() is not allowed in a flow${name === "Date" ? ": use Date.Now()" : ""}`);
    }
    if (is.isArrowFunction(node) || is.isFunctionExpression(node)) {
      this.fail(
        node,
        `${is.isArrowFunction(node) ? "An arrow function" : "A function"} is only allowed as the function of Workflow.Parallel`
      );
    }
    return this.fail(node, `${SyntaxKind[node.kind]} is not allowed in a flow expression`);
  }
}

/**
 * Read the `@Cron` decorators of a flow method
 * @param ctx - analysis context
 * @param sf - the flow file
 * @param method - the method
 * @param errors - accumulator
 * @returns the crons, undefined when there is none
 */
function cronsOf(
  ctx: AnalysisContext,
  sf: SourceFile,
  method: MethodDeclaration,
  errors: FlowCompileError[]
): FlowCron[] | undefined {
  const crons: FlowCron[] = [];
  for (const decorator of decoratorsOf(method)) {
    if (decoratorName(decorator) !== "Cron") continue;
    const fail = (node: Node) => {
      const start = (node as any).getStart();
      errors.push({
        file: sf.fileName,
        start,
        length: node.end - start,
        code: FLOW_ERROR,
        message: "@Cron takes literals: a cron expression, a description and an input object"
      });
    };
    const call = decorator.expression;
    if (!is.isCallExpression(call)) {
      fail(decorator);
      continue;
    }
    const [expression, description, input] = (call as any).arguments as any[];
    const literalText = (node: any) =>
      node && (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) ? node.text : undefined;
    const cron = literalText(expression);
    if (cron === undefined || (description && literalText(description) === undefined)) {
      fail(call);
      continue;
    }
    const entry: FlowCron = { cron };
    if (description) entry.description = literalText(description);
    if (input) {
      try {
        // A literal reader needing no method context
        const value = new MethodCompiler(ctx, sf, method, new Map(), errors).literal(input);
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          fail(input);
          continue;
        }
        entry.input = value;
      } catch (err) {
        if (!(err instanceof Reported)) throw err;
        continue;
      }
    }
    crons.push(entry);
  }
  return crons.length ? crons : undefined;
}

/**
 * Compile every flow of the `.flow.ts` files of the context
 * @param ctx - analysis context
 * @returns the flows without errors, by id, and the errors
 */
export function compileFlows(ctx: AnalysisContext): FlowCompileResult {
  const result: FlowCompileResult = { flows: {}, errors: [] };
  const files = ctx.sourceFiles.filter(sf => sf.fileName.endsWith(FLOW_SUFFIX));
  if (!files.length) return result;
  const services = operationServices(ctx);
  /**
   * Report a name declared twice, at both places: the first one keeps it, the second is left out
   * @param first - the first declaration
   * @param second - the duplicate
   * @param message - what is duplicated
   */
  const duplicate = (first: Declared, second: Declared, message: string) => {
    for (const place of first.reported ? [second] : [first, second]) {
      const start = (place.node as any).getStart();
      result.errors.push({ file: place.file, start, length: place.node.end - start, code: FLOW_ERROR, message });
    }
    first.reported = true;
  };
  const classes = new Map<string, Declared>();
  const ids = new Map<string, Declared>();
  for (const sf of files) {
    for (const cls of flowClassesOf(ctx, sf)) {
      const className = cls.name!.text;
      const declared: Declared = { file: sf.fileName, node: cls.name! };
      const previous = classes.get(className);
      if (previous) {
        duplicate(
          previous,
          declared,
          `Flow class ${className} is declared in ${previous.file} and ${sf.fileName}: flow ids would collide, rename one`
        );
        continue;
      }
      classes.set(className, declared);
      for (const member of cls.members as unknown as any[]) {
        const isMethod = is.isMethodDeclaration(member) && is.isIdentifier(member.name);
        if (
          !isMethod ||
          hasModifier(member, SyntaxKind.StaticKeyword) ||
          hasModifier(member, SyntaxKind.PrivateKeyword) ||
          hasModifier(member, SyntaxKind.ProtectedKeyword)
        ) {
          const start = member.getStart();
          result.errors.push({
            file: sf.fileName,
            start,
            length: member.end - start,
            code: FLOW_ERROR,
            message: `A flow class only holds public async instance methods, each one a flow: ${className} has ${ctx.textOf(sf, member).split("\n")[0]}`
          });
          continue;
        }
        const id = `${className}.${capitalize(member.name.text)}`;
        const first = ids.get(id);
        const place: Declared = { file: sf.fileName, node: member.name };
        if (first) {
          duplicate(first, place, `Flow id ${id} is declared twice in ${className}: rename one of the methods`);
          continue;
        }
        ids.set(id, place);
        const before = result.errors.length;
        const compiled = new MethodCompiler(ctx, sf, member, services, result.errors).compile();
        const crons = cronsOf(ctx, sf, member, result.errors);
        if (!compiled || result.errors.length !== before) continue;
        const flow: CompiledFlow = {
          id,
          version: flowVersion(compiled),
          params: compiled.params,
          input: generateActionInput(member, { project: ctx.project, checker: ctx.checker }),
          body: compiled.body,
          source: "code"
        };
        if (crons) flow.crons = crons;
        result.flows[id] = flow;
      }
    }
  }
  return result;
}

/**
 * An error as a build message: `<file>:<line>:<column> - error FLOW9101: <message>`
 * @param ctx - analysis context
 * @param error - the error
 * @returns the message
 */
export function formatFlowError(ctx: AnalysisContext, error: FlowCompileError): string {
  const text = ctx.program.getSourceFile(error.file)?.text ?? "";
  const before = text.slice(0, error.start).split("\n");
  return `${error.file}:${before.length}:${before[before.length - 1].length + 1} - error FLOW${error.code}: ${error.message}`;
}

export type { CompiledFlow };
