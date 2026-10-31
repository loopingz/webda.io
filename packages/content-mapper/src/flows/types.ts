/**
 * The workflow graph, as `@webda/workflow` defines it (`src/graph.ts`).
 *
 * Duplicated rather than imported: `@webda/workflow` builds with `webdac`, which runs this package, so depending on
 * it would be a cycle. The `@webda/workflow` spec `compiled.contract.spec.ts` compiles a flow with this package and
 * runs it through the real interpreter: it fails when the two drift.
 */
import { createHash } from "node:crypto";

/** Diagnostic code of every construct a flow cannot contain. */
export const FLOW_ERROR = 9101;

/** Binary operators of a flow expression. */
export type BinaryOp =
  "==" | "!=" | "===" | "!==" | "<" | "<=" | ">" | ">=" | "+" | "-" | "*" | "/" | "%" | "&&" | "||" | "??";

/** Every binary operator. */
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

/** A pure expression of a flow. */
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

/** Options of a task. */
export interface TaskOptions {
  retries?: number;
  backoff?: "fixed" | "exponential";
  delay?: string;
  timeout?: string;
  useSystem?: boolean;
}

/** The {@link TaskOptions} keys, with the JSON type of their value. */
export const TASK_OPTION_TYPES: Record<keyof TaskOptions, "number" | "string" | "boolean"> = {
  retries: "number",
  backoff: "string",
  delay: "string",
  timeout: "string",
  useSystem: "boolean"
};

/** {@link TaskOptions} as a type literal, for the injected declarations. */
export const TASK_OPTIONS_TYPE =
  '{ retries?: number; backoff?: "fixed" | "exponential"; delay?: string; timeout?: string; useSystem?: boolean }';

/** Statements of a flow. */
export type Stmt =
  | {
      kind: "task";
      id: string;
      operation: string;
      input: Expr;
      options?: TaskOptions;
      assign?: string;
      target?: OperationTarget;
    }
  | { kind: "assign"; id: string; name: string; value: Expr }
  | { kind: "if"; id: string; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { kind: "forOf"; id: string; item: string; items: Expr; body: Stmt[] }
  | { kind: "while"; id: string; cond: Expr; body: Stmt[] }
  | { kind: "try"; id: string; body: Stmt[]; catchVar?: string; catch?: Stmt[]; finally?: Stmt[] }
  | { kind: "parallel"; id: string; branches: Stmt[][]; assign?: string }
  | { kind: "map"; id: string; items: Expr; item: string; body: Stmt[]; concurrency?: number; assign?: string }
  | { kind: "return"; id: string; value?: Expr }
  | { kind: "throw"; id: string; value: Expr };

/**
 * The service method a typed call runs: the engine resolves it to the operation id of the configured service of
 * that class
 */
export interface OperationTarget {
  /** Service class name. */
  class: string;
  /** Method name, as declared. */
  method: string;
}

/** A `@Cron` of a flow method. */
export interface FlowCron {
  cron: string;
  description?: string;
  input?: Record<string, any>;
}

/** A compiled flow, as `webda.module.json` holds it under `flows`. */
export interface CompiledFlow {
  /** `<Class>.<Method>` */
  id: string;
  /** {@link flowVersion} */
  version: string;
  /** Parameter names, in order */
  params: string[];
  /** JSON schema of the input */
  input: object;
  body: Stmt[];
  source: "code";
  /** Launch schedules */
  crons?: FlowCron[];
}

/** Built-in operations, run by the engine. */
export const BUILTINS = {
  DateNow: "Date.Now",
  RandomNumber: "Random.Number",
  RandomUuid: "Random.Uuid",
  Sleep: "Workflow.Sleep",
  WaitForEvent: "Wait.ForEvent",
  Start: "Workflow.Start"
} as const;

/**
 * Copy a value with its object keys sorted, undefined values dropped
 * @param value - the value
 * @returns the sorted copy
 */
function sortKeys(value: any): any {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    const res: Record<string, any> = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined) res[key] = sortKeys(value[key]);
    }
    return res;
  }
  return value;
}

/**
 * Canonical JSON: object keys sorted, undefined values dropped
 * @param value - the value
 * @returns the JSON text
 */
export function canonicalJson(value: any): string {
  return JSON.stringify(sortKeys(value));
}

/**
 * Version of a flow: hex SHA-256 of the canonical JSON of its params, body and options
 * @param def - the flow
 * @param def.params - parameter names
 * @param def.body - statements
 * @param def.options - default task options
 * @returns the version
 */
export function flowVersion(def: { params: string[]; body: Stmt[]; options?: TaskOptions }): string {
  return createHash("sha256")
    .update(canonicalJson({ params: def.params, body: def.body, options: def.options }))
    .digest("hex");
}

/**
 * Capitalize a method name, as operation ids do
 * @param name - the method name
 * @returns the name with its first letter uppercased
 */
export function capitalize(name: string): string {
  return name.substring(0, 1).toUpperCase() + name.substring(1);
}
