// CommonJS package: named imports are not available under native Node ESM
import expressionEval from "@casbin/expression-eval";

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
 * @returns the segments after `r`, e.g. `r.ctx.input.status` gives ["ctx", "input", "status"]
 * @throws PolicyCompileError for a chain not rooted at `r.ctx`, a non-literal computed key or a forbidden member
 */
function memberPath(node: any): string[] {
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
  if (current.type !== "Identifier" || current.name !== "r" || path[0] !== "ctx") {
    throw new PolicyCompileError("Conditions may only read r.ctx");
  }
  return path;
}

/**
 * Check a node against the allow-list, collecting the member paths it reads
 * @param node - the jsep node
 * @param paths - collected member paths
 */
function visit(node: any, paths: string[][]): void {
  switch (node?.type) {
    case "Literal":
      return;
    case "ArrayExpression":
      node.elements.forEach((element: any) => visit(element, paths));
      return;
    case "MemberExpression":
      paths.push(memberPath(node));
      return;
    case "UnaryExpression":
      visit(node.argument, paths);
      return;
    case "BinaryExpression":
    case "LogicalExpression":
      visit(node.left, paths);
      visit(node.right, paths);
      return;
    case "ConditionalExpression":
      visit(node.test, paths);
      visit(node.consequent, paths);
      visit(node.alternate, paths);
      return;
    case "CallExpression":
      if (node.callee?.type !== "Identifier" || !CONDITION_FUNCTIONS.has(node.callee.name)) {
        throw new PolicyCompileError("Function call not allowed");
      }
      node.arguments.forEach((arg: any) => visit(arg, paths));
      return;
    case "Identifier":
      throw new PolicyCompileError(`Unknown identifier '${node.name}'`);
    default:
      throw new PolicyCompileError(`Expression '${node?.type}' is not allowed`);
  }
}

/**
 * Validate a condition against the allow-list
 * @param condition - the Casbin expression
 * @returns whether the condition reads the operation input (`r.ctx.input`)
 * @throws PolicyCompileError when the condition is invalid or not allowed
 */
export function analyzeCondition(condition: string): { readsInput: boolean } {
  let ast: any;
  try {
    ast = parse(condition);
  } catch (err) {
    throw new PolicyCompileError(`Invalid condition: ${err?.message ?? err}`);
  }
  const paths: string[][] = [];
  visit(ast, paths);
  return { readsInput: paths.some(path => path[1] === "input") };
}
