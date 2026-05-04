import type * as tsTypes from "typescript";
import { parse, QueryValidator } from "@webda/ql";

export interface QlValidatorOptions {
  onDiagnostic?: (d: tsTypes.Diagnostic) => void;
  throwOnError?: boolean;
}

/**
 * Aggregate error thrown by the qlvalidator transformer when one or more
 * WQL diagnostics are emitted and `throwOnError` is true (the default).
 */
export class WebdaQLAggregateError extends Error {
  readonly diagnostics: readonly tsTypes.Diagnostic[];
  /**
   * @param diagnostics - the collected WQL diagnostics
   */
  constructor(diagnostics: readonly tsTypes.Diagnostic[]) {
    super(
      `${diagnostics.length} WebdaQL validation error(s):\n` +
        diagnostics
          .map(d => {
            const text = typeof d.messageText === "string" ? d.messageText : d.messageText.messageText;
            const file = d.file?.fileName ?? "<unknown>";
            const pos =
              d.file && d.start !== undefined
                ? d.file.getLineAndCharacterOfPosition(d.start)
                : { line: 0, character: 0 };
            return `  ${file}:${pos.line + 1}:${pos.character + 1} WQL${d.code} ${text}`;
          })
          .join("\n")
    );
    this.name = "WebdaQLAggregateError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Create a TypeScript transformer factory that validates WebdaQL string literals
 * at compile time, emitting WQL9001 (unknown attribute) and WQL9002 (grammar error) diagnostics.
 * @param tsModule - the typescript module instance
 * @param program - the TypeScript program to type-check against
 * @param options - validator options (onDiagnostic callback, throwOnError flag)
 * @returns a TransformerFactory for SourceFile nodes
 */
export function createQlValidatorTransformer(
  tsModule: typeof tsTypes,
  program: tsTypes.Program,
  options: QlValidatorOptions = {}
): tsTypes.TransformerFactory<tsTypes.SourceFile> {
  const { onDiagnostic, throwOnError = true } = options;
  const checker = program.getTypeChecker();

  return context => sourceFile => {
    const collected: tsTypes.Diagnostic[] = [];
    const emit = (d: tsTypes.Diagnostic) => {
      collected.push(d);
      onDiagnostic?.(d);
    };

    const visit = (node: tsTypes.Node): tsTypes.Node => {
      if (tsModule.isCallExpression(node)) {
        validateCall(tsModule, checker, node, sourceFile, emit);
      }
      return tsModule.visitEachChild(node, visit, context);
    };

    const result = tsModule.visitNode(sourceFile, visit) as tsTypes.SourceFile;

    if (throwOnError && collected.length > 0) {
      throw new WebdaQLAggregateError(collected);
    }
    return result;
  };
}

/**
 * Inspect a call expression and validate any arguments whose parameter type
 * resolves to WebdaQLString<T>.
 * @param ts - the typescript module instance
 * @param checker - the TypeScript type checker
 * @param call - the call expression node to inspect
 * @param sourceFile - the source file containing the call
 * @param emit - callback to emit a diagnostic
 */
function validateCall(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  call: tsTypes.CallExpression,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  const signature = checker.getResolvedSignature(call);
  if (!signature) return;

  const params = signature.getParameters();
  for (let i = 0; i < call.arguments.length && i < params.length; i++) {
    const paramType = checker.getTypeOfSymbolAtLocation(params[i], call);
    const targetT = peelWebdaQLString(checker, paramType);
    if (!targetT) continue;

    validateArgument(ts, checker, call.arguments[i], targetT, sourceFile, emit);
  }
}

/**
 * Unwrap a WebdaQLString<T> branded type to its target type T.
 * Returns undefined when the type is not a WebdaQLString brand.
 * @param checker - the TypeScript type checker
 * @param type - the type to inspect
 * @returns the unwrapped target type, or undefined if not a WebdaQLString
 */
export function peelWebdaQLString(
  checker: tsTypes.TypeChecker,
  type: tsTypes.Type
): tsTypes.Type | undefined {
  if (type.aliasSymbol?.escapedName === "WebdaQLString" && type.aliasTypeArguments?.[0]) {
    return type.aliasTypeArguments[0];
  }
  if (type.isUnionOrIntersection()) {
    for (const t of type.types) {
      const peeled = peelWebdaQLString(checker, t);
      if (peeled) return peeled;
    }
  }
  const brandProp = type.getProperty("__webdaQL");
  if (brandProp) {
    const brandType = checker.getTypeOfSymbol(brandProp);
    return brandType;
  }
  return undefined;
}

/**
 * Validate a single call argument whose parameter is typed as WebdaQLString<T>.
 * Only string literals and no-substitution template literals are validated.
 * @param ts - the typescript module instance
 * @param checker - the TypeScript type checker
 * @param argument - the argument expression node
 * @param targetT - the target type T extracted from WebdaQLString<T>
 * @param sourceFile - the source file containing the argument
 * @param emit - callback to emit a diagnostic
 */
function validateArgument(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  argument: tsTypes.Expression,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    validateLiteral(ts, checker, argument.text, argument, targetT, sourceFile, emit);
  }
}

/**
 * Parse and validate the text of a WebdaQL string literal against the target type.
 * Emits WQL9002 on parse failure, WQL9001 on unknown attribute references.
 * @param ts - the typescript module instance
 * @param checker - the TypeScript type checker
 * @param source - the raw query string to validate
 * @param node - the AST node for diagnostic position reporting
 * @param targetT - the target type T that attributes are checked against
 * @param sourceFile - the source file for position information
 * @param emit - callback to emit a diagnostic
 */
function validateLiteral(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  source: string,
  node: tsTypes.Node,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  let parsed;
  try {
    new QueryValidator(source);
    parsed = parse(source);
  } catch (err) {
    emit(makeDiagnostic(sourceFile, node, 9002, `WebdaQL grammar: ${(err as Error).message}`));
    return;
  }

  for (const cmp of collectComparisons(parsed)) {
    const head = cmp.attribute[0];
    if (!head) continue;
    const propSymbol = targetT.getProperty(head);
    if (!propSymbol) {
      const candidates = targetT.getProperties().map(p => p.name);
      const suggestion = nearestNeighbour(head, candidates);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      emit(
        makeDiagnostic(sourceFile, node, 9001, `WebdaQL: attribute '${head}' does not exist on type.` + hint)
      );
    }
  }
}

/**
 * Walk the expression tree and collect all ComparisonExpression nodes.
 * NOTE: the top-level object from parse() is a Query, not an Expression —
 * we must descend into .filter first before walking children.
 * @param expr - the expression or Query object to walk
 * @returns flat array of all ComparisonExpression nodes found
 */
function collectComparisons(expr: any): any[] {
  if (!expr) return [];
  if (expr.filter) return collectComparisons(expr.filter);
  if (Array.isArray(expr.children)) return expr.children.flatMap(collectComparisons);
  if (expr.expression) return collectComparisons(expr.expression);
  if (Array.isArray(expr.attribute)) return [expr];
  return [];
}

/**
 * Find the nearest candidate string to the needle using Levenshtein distance.
 * Returns undefined when no candidate is within distance 2.
 * @param needle - the unknown attribute name to find a match for
 * @param candidates - the list of known attribute names on the target type
 * @returns the closest candidate, or undefined if none is close enough
 */
function nearestNeighbour(needle: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(needle, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Compute the Levenshtein edit distance between two strings.
 * @param a - first string
 * @param b - second string
 * @returns the minimum number of single-character edits to transform a into b
 */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

/**
 * Build a TypeScript Diagnostic object for a given source position.
 * @param sourceFile - the source file the node belongs to
 * @param node - the AST node whose span is reported
 * @param code - the WQL error code (e.g. 9001, 9002)
 * @param message - the human-readable error message
 * @returns a TypeScript Diagnostic object
 */
function makeDiagnostic(
  sourceFile: tsTypes.SourceFile,
  node: tsTypes.Node,
  code: number,
  message: string
): tsTypes.Diagnostic {
  return {
    file: sourceFile,
    start: node.getStart(sourceFile),
    length: node.getEnd() - node.getStart(sourceFile),
    category: 1,
    code,
    messageText: message,
    source: "webdaql"
  };
}
