// CommonJS package: named imports are not available under native Node ESM
import expressionEval from "@casbin/expression-eval";
import { Util } from "casbin";

const { parse } = expressionEval;

/**
 * Invalid policy document or condition
 */
export class PolicyCompileError extends Error {}

/**
 * Functions a condition may call: Casbin built-ins plus `includes`, registered by the engine
 *
 * `regexMatch` is deliberately absent: a tenant-authored regex could block the event loop (ReDoS)
 */
export const CONDITION_FUNCTIONS: ReadonlySet<string> = new Set(["globMatch", "keyMatch", "ipMatch", "includes"]);

/**
 * Member names that could reach the prototype chain
 */
const FORBIDDEN_MEMBERS = new Set(["constructor", "__proto__", "prototype"]);

/**
 * Path of a member chain rooted at `r.ctx`
 * @param node - a jsep MemberExpression
 * @param escaped - true when the AST is the one casbin evaluates, where `r.ctx` was rewritten to `r_ctx`
 * @returns the segments after `r`, e.g. `r.ctx.input.status` gives ["ctx", "input", "status"]
 * @throws PolicyCompileError for a chain not rooted at `r.ctx`, a non-literal computed key or a forbidden member
 */
function memberPath(node: any, escaped: boolean): string[] {
  const path: string[] = [];
  let current = node;
  while (current.type === "MemberExpression") {
    let segment: string;
    if (!current.computed && current.property.type === "Identifier") {
      segment = current.property.name;
    } else if (
      current.computed &&
      current.property.type === "Literal" &&
      ["string", "number"].includes(typeof current.property.value)
    ) {
      segment = String(current.property.value);
    } else {
      throw new PolicyCompileError("Computed member access must use a literal key");
    }
    if (FORBIDDEN_MEMBERS.has(segment)) {
      throw new PolicyCompileError(`Access to '${segment}' is not allowed`);
    }
    path.unshift(segment);
    current = current.object;
  }
  if (escaped) {
    if (current.type !== "Identifier" || current.name !== "r_ctx") {
      throw new PolicyCompileError("Conditions may only read r.ctx");
    }
    return ["ctx", ...path];
  }
  if (current.type !== "Identifier" || current.name !== "r" || path[0] !== "ctx") {
    throw new PolicyCompileError("Conditions may only read r.ctx");
  }
  return path;
}

/**
 * Check a node against the allow-list, collecting the member paths it reads
 * @param node - the jsep node
 * @param paths - collected member paths
 * @param literals - collected literal values, in visit order
 * @param escaped - true when the AST is the one casbin evaluates
 */
function visit(node: any, paths: string[][], literals: unknown[], escaped: boolean): void {
  switch (node?.type) {
    case "Literal":
      literals.push(node.value);
      return;
    case "ArrayExpression":
      node.elements.forEach((element: any) => visit(element, paths, literals, escaped));
      return;
    case "MemberExpression":
      paths.push(memberPath(node, escaped));
      return;
    case "UnaryExpression":
      visit(node.argument, paths, literals, escaped);
      return;
    case "BinaryExpression":
    case "LogicalExpression":
      visit(node.left, paths, literals, escaped);
      visit(node.right, paths, literals, escaped);
      return;
    case "ConditionalExpression":
      visit(node.test, paths, literals, escaped);
      visit(node.consequent, paths, literals, escaped);
      visit(node.alternate, paths, literals, escaped);
      return;
    case "CallExpression":
      if (node.callee?.type !== "Identifier" || !CONDITION_FUNCTIONS.has(node.callee.name)) {
        throw new PolicyCompileError("Function call not allowed");
      }
      node.arguments.forEach((arg: any) => visit(arg, paths, literals, escaped));
      return;
    case "Identifier":
      throw new PolicyCompileError(`Unknown identifier '${node.name}'`);
    default:
      throw new PolicyCompileError(`Expression '${node?.type}' is not allowed`);
  }
}

/**
 * Parse with the parser casbin evaluates with
 * @param expression - the expression
 * @returns the AST
 * @throws PolicyCompileError on a syntax error
 */
function parseCondition(expression: string): any {
  try {
    return parse(expression);
  } catch (err) {
    throw new PolicyCompileError(`Invalid condition: ${err?.message ?? err}`);
  }
}

/**
 * Validate a condition against the allow-list
 *
 * The condition is validated twice: as written, and in the form node-casbin evaluates
 * (`escapeAssertion` rewrites `r.` to `r_` only after certain characters, and also inside string literals,
 * then replaceEval wraps the result in parentheses). The two must agree.
 * @param condition - the Casbin expression
 * @returns whether the condition reads the operation input (`r.ctx.input`)
 * @throws PolicyCompileError when the condition is invalid or not allowed
 */
export function analyzeCondition(condition: string): { readsInput: boolean } {
  const paths: string[][] = [];
  const literals: unknown[] = [];
  visit(parseCondition(condition), paths, literals, false);
  const escapedPaths: string[][] = [];
  const escapedLiterals: unknown[] = [];
  visit(parseCondition(`(${Util.escapeAssertion(condition)})`), escapedPaths, escapedLiterals, true);
  if (JSON.stringify(literals) !== JSON.stringify(escapedLiterals)) {
    throw new PolicyCompileError("Condition literals must not contain 'r.' or 'p.' sequences");
  }
  return { readsInput: paths.some(path => path[1] === "input") };
}
