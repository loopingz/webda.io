import { createHash } from "node:crypto";

/**
 * Binary operators of a flow expression
 *
 * `&&`, `||` and `??` short-circuit, as in JavaScript.
 */
export type BinaryOp =
  "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%" | "&&" | "||" | "??";

/**
 * Every binary operator, to validate an expression
 */
export const BINARY_OPS: readonly BinaryOp[] = [
  "==",
  "!=",
  "===",
  "!==",
  "<",
  "<=",
  ">",
  ">=",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&&",
  "||",
  "??"
];

/**
 * A pure expression of a flow, JSON only: no `eval` ever runs it
 */
export type Expr =
  | { lit: any }
  | { var: string }
  | { get: [Expr, Expr] }
  | { op: BinaryOp; args: [Expr, Expr] }
  | { not: Expr }
  | { neg: Expr }
  | { cond: [Expr, Expr, Expr] }
  | { obj: Record<string, Expr> }
  | { arr: Expr[] }
  | { tpl: (string | Expr)[] };

/**
 * Options of a task, and defaults of a flow
 */
export interface TaskOptions {
  /**
   * Retries after the first attempt
   * @default 0
   */
  retries?: number;
  /**
   * Delay growth between attempts
   * @default "exponential"
   */
  backoff?: "fixed" | "exponential";
  /**
   * Delay before the first retry (Duration syntax)
   * @default "1s"
   */
  delay?: string;
  /**
   * Maximum duration of one attempt (Duration syntax)
   */
  timeout?: string;
  /**
   * Run the task as the system instead of the launcher
   */
  useSystem?: boolean;
}

/**
 * Run an operation (or a built-in)
 */
export interface TaskStmt {
  kind: "task";
  id: string;
  /**
   * Operation id, or a built-in (`Date.Now`, `Workflow.Sleep`...)
   */
  operation: string;
  input: Expr;
  options?: TaskOptions;
  /**
   * Variable receiving the task result
   */
  assign?: string;
}

/**
 * Assign a variable
 */
export interface AssignStmt {
  kind: "assign";
  id: string;
  name: string;
  value: Expr;
}

/**
 * Conditional
 */
export interface IfStmt {
  kind: "if";
  id: string;
  cond: Expr;
  then: Stmt[];
  else?: Stmt[];
}

/**
 * Loop over the items of an array
 */
export interface ForOfStmt {
  kind: "forOf";
  id: string;
  item: string;
  items: Expr;
  body: Stmt[];
}

/**
 * Loop while a condition holds
 */
export interface WhileStmt {
  kind: "while";
  id: string;
  cond: Expr;
  body: Stmt[];
}

/**
 * Catch the errors of a block
 */
export interface TryStmt {
  kind: "try";
  id: string;
  body: Stmt[];
  /**
   * Variable receiving the {@link FlowError}
   */
  catchVar?: string;
  catch?: Stmt[];
  finally?: Stmt[];
}

/**
 * Run branches concurrently
 */
export interface ParallelStmt {
  kind: "parallel";
  id: string;
  branches: Stmt[][];
  /**
   * Variable receiving the array of branch return values
   */
  assign?: string;
}

/**
 * Run a body for each item concurrently
 */
export interface MapStmt {
  kind: "map";
  id: string;
  items: Expr;
  item: string;
  body: Stmt[];
  /**
   * Maximum number of items running at once
   */
  concurrency?: number;
  /**
   * Variable receiving the array of item return values
   */
  assign?: string;
}

/**
 * End the flow (or the branch) with a value
 */
export interface ReturnStmt {
  kind: "return";
  id: string;
  value?: Expr;
}

/**
 * Throw a {@link FlowError} with code `FlowError`
 */
export interface ThrowStmt {
  kind: "throw";
  id: string;
  value: Expr;
}

/**
 * A statement of a flow, each one with a structural `id`
 */
export type Stmt =
  TaskStmt | AssignStmt | IfStmt | ForOfStmt | WhileStmt | TryStmt | ParallelStmt | MapStmt | ReturnStmt | ThrowStmt;

/**
 * Kinds of statement
 */
export type StmtKind = Stmt["kind"];

/**
 * A flow: its graph, input schema and defaults
 */
export interface FlowDefinition {
  /**
   * Operation id `<Class>.<Method>`
   */
  id: string;
  /**
   * {@link flowVersion} of the definition
   */
  version: string;
  /**
   * Names of the flow parameters, in order
   */
  params: string[];
  /**
   * JSON schema of the input
   */
  input: object;
  /**
   * JSON schema of the output
   */
  output?: object;
  body: Stmt[];
  /**
   * Default options of every task
   */
  options?: TaskOptions;
  source: "code" | "stored";
}

/**
 * A {@link FlowDefinition} as models and configuration hold it
 *
 * The statements are recursive: describing them in a JSON schema makes the schema generator explode, so they are
 * plain JSON there. {@link validateExpr} checks untrusted expressions.
 */
export interface FlowDefinitionData extends Omit<FlowDefinition, "body" | "version" | "source"> {
  /**
   * The statements ({@link Stmt}[])
   */
  body: any[];
  /**
   * {@link flowVersion} of the definition, computed when missing
   */
  version?: string;
  /**
   * Where the flow comes from
   * @default "code"
   */
  source?: "code" | "stored";
}

/**
 * An error, as seen by the flow: plain data
 */
export interface FlowError {
  code: string;
  message: string;
  operation: string;
}

/**
 * Outcome of a task
 */
export type JournalEntry = ({ result: any } | { error: FlowError }) & {
  /**
   * When the outcome was journaled (ms)
   */
  at?: number;
  /**
   * Instance revision that journaled it: the order of the outcomes
   */
  seq?: number;
};

/**
 * Outcome of each finished task, keyed by task key (`<statement id>@<iteration path>`)
 */
export type Journal = Record<string, JournalEntry>;

/**
 * Built-in operations, run by the engine
 */
export const BUILTINS = {
  DateNow: "Date.Now",
  RandomNumber: "Random.Number",
  RandomUuid: "Random.Uuid",
  Sleep: "Workflow.Sleep",
  WaitForEvent: "Wait.ForEvent",
  Start: "Workflow.Start"
} as const;

/**
 * Canonical JSON: object keys sorted, undefined values dropped
 * @param value - the value
 * @returns the JSON text
 */
export function canonicalJson(value: any): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * Copy a value with its object keys sorted
 * @param value - the value
 * @returns the sorted copy
 */
function sortKeys(value: any): any {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    const res: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) {
        res[key] = sortKeys(value[key]);
      }
    }
    return res;
  }
  return value;
}

/**
 * Version of a flow: hex SHA-256 of the canonical JSON of its params, body and options
 * @param def - the flow definition
 * @returns the version
 */
export function flowVersion(def: Pick<FlowDefinition, "params" | "body" | "options">): string {
  return createHash("sha256")
    .update(canonicalJson({ params: def.params, body: def.body, options: def.options }))
    .digest("hex");
}
