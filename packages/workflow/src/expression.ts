import { BINARY_OPS, type BinaryOp, type Expr } from "./graph.js";

/** Maximum length of a string produced by a flow expression */
export const MAX_EXPR_STRING_LENGTH = 1_048_576;
/** Object keys that must never be set on evaluated objects */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Read a member of a value: own properties only, so an expression never reaches a prototype
 * @param target - the object, array or string
 * @param key - the member name or index
 * @returns the member, undefined when the target is null/undefined or has no such own member
 */
function member(target: any, key: any): any {
  if (target === null || target === undefined) {
    return undefined;
  }
  const name = typeof key === "number" ? key : String(key);
  return Object.hasOwn(Object(target), name) ? target[name] : undefined;
}

/**
 * Apply a binary operator to evaluated operands (the short-circuit ones are handled by the caller)
 * @param op - the operator
 * @param a - left value
 * @param b - right value
 * @returns the result
 */
function binary(op: BinaryOp, a: any, b: any): any {
  switch (op) {
    case "==":
      return a == b;
    case "!=":
      return a != b;
    case "===":
      return a === b;
    case "!==":
      return a !== b;
    case "<":
      return a < b;
    case "<=":
      return a <= b;
    case ">":
      return a > b;
    case ">=":
      return a >= b;
    case "+": {
      if (typeof a === "string" || typeof b === "string") {
        const left = String(a);
        const right = String(b);
        if (left.length + right.length > MAX_EXPR_STRING_LENGTH) {
          throw new Error("Expression string length limit exceeded");
        }
        return left + right;
      }
      return a + b;
    }
    case "-":
      return a - b;
    case "*":
      return a * b;
    case "/":
      return a / b;
    case "%":
      return a % b;
  }
  throw new Error(`Invalid expression operator ${op}`);
}

/**
 * Evaluate a flow expression
 *
 * Pure: it reads `scope` and never changes it.
 * @param expr - the expression
 * @param scope - the variables
 * @returns the value
 * @throws Error on an invalid expression node
 */
export function evaluate(expr: Expr, scope: Record<string, any>): any {
  const e: any = expr;
  if (e === null || typeof e !== "object") {
    throw new Error(`Invalid expression ${JSON.stringify(e)}`);
  }
  if ("lit" in e) {
    return e.lit;
  }
  if ("var" in e) {
    return Object.hasOwn(scope, e.var) ? scope[e.var] : undefined;
  }
  if ("get" in e) {
    return member(evaluate(e.get[0], scope), evaluate(e.get[1], scope));
  }
  if ("op" in e) {
    const [left, right] = e.args;
    const a = evaluate(left, scope);
    switch (e.op as BinaryOp) {
      case "&&":
        return a ? evaluate(right, scope) : a;
      case "||":
        return a ? a : evaluate(right, scope);
      case "??":
        return a ?? evaluate(right, scope);
    }
    return binary(e.op, a, evaluate(right, scope));
  }
  if ("not" in e) {
    return !evaluate(e.not, scope);
  }
  if ("neg" in e) {
    return -evaluate(e.neg, scope);
  }
  if ("cond" in e) {
    return evaluate(e.cond[0], scope) ? evaluate(e.cond[1], scope) : evaluate(e.cond[2], scope);
  }
  if ("obj" in e) {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(e.obj as Record<string, Expr>)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Forbidden object key ${key}`);
      }
      Object.defineProperty(res, key, {
        value: evaluate(value, scope),
        enumerable: true,
        configurable: true,
        writable: true
      });
    }
    return res;
  }
  if ("arr" in e) {
    return (e.arr as Expr[]).map(item => evaluate(item, scope));
  }
  if ("tpl" in e) {
    let out = "";
    for (const part of e.tpl as (string | Expr)[]) {
      const piece = typeof part === "string" ? part : String(evaluate(part, scope));
      if (out.length + piece.length > MAX_EXPR_STRING_LENGTH) {
        throw new Error("Expression string length limit exceeded");
      }
      out += piece;
    }
    return out;
  }
  throw new Error(`Invalid expression ${JSON.stringify(e)}`);
}

/**
 * Whether a value is a plain object (not an array, not null)
 * @param value - the value
 * @returns true for an object
 */
function isObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate an expression tree, as received from an untrusted source (a stored workflow)
 * @param expr - the candidate expression
 * @param path - path of this node, `$` for the root
 * @returns the paths of the invalid nodes, empty when the expression is valid
 */
export function validateExpr(expr: unknown, path: string = "$"): string[] {
  if (!isObject(expr)) {
    return [path];
  }
  const keys = Object.keys(expr);
  const tuple = (key: string, length: number): string[] =>
    Array.isArray(expr[key]) && expr[key].length === length
      ? expr[key].flatMap((item: unknown, i: number) => validateExpr(item, `${path}.${key}[${i}]`))
      : [path];
  if (keys.length === 2 && keys.includes("op") && keys.includes("args")) {
    return BINARY_OPS.includes(expr.op) ? tuple("args", 2) : [path];
  }
  if (keys.length !== 1) {
    return [path];
  }
  const value = expr[keys[0]];
  switch (keys[0]) {
    case "lit":
      return [];
    case "var":
      return typeof value === "string" ? [] : [path];
    case "get":
      return tuple("get", 2);
    case "not":
    case "neg":
      return validateExpr(value, `${path}.${keys[0]}`);
    case "cond":
      return tuple("cond", 3);
    case "obj":
      return isObject(value)
        ? Object.entries(value).flatMap(([k, v]) =>
            FORBIDDEN_KEYS.has(k) ? [`${path}.obj.${k}`] : validateExpr(v, `${path}.obj.${k}`)
          )
        : [path];
    case "arr":
      return Array.isArray(value) ? value.flatMap((v, i) => validateExpr(v, `${path}.arr[${i}]`)) : [path];
    case "tpl":
      return Array.isArray(value)
        ? value.flatMap((v, i) =>
            typeof v === "string" ? [] : isObject(v) ? validateExpr(v, `${path}.tpl[${i}]`) : [`${path}.tpl[${i}]`]
          )
        : [path];
  }
  return [path];
}
