/**
 * @webda/ql-ts-plugin
 *
 * TypeScript language service plugin that validates WebdaQL query field names
 * against model types and provides autocompletion inside query strings.
 *
 * Detects calls to:
 *   - repo.query("...")      — repository query method
 *   - parse("...", ...)      — WebdaQL parse function
 *
 * Resolves the model type from the repository generic parameter and checks
 * that SELECT fields and UPDATE SET targets are valid property names.
 *
 * Setup in tsconfig.json:
 * {
 *   "compilerOptions": {
 *     "plugins": [{ "name": "@webda/ql-ts-plugin" }]
 *   }
 * }
 */

import type tslib from "typescript/lib/tsserverlibrary";
import { extractFields } from "./parser.js";

/** Target method names to intercept */
const QUERY_METHODS = new Set(["query", "iterate"]);
const PARSE_FUNCTIONS = new Set(["parse"]);

/** Custom diagnostic code */
const DIAG_CODE = 99001;

function init(modules: { typescript: typeof tslib }) {
  const ts = modules.typescript;

  function create(info: tslib.server.PluginCreateInfo): tslib.LanguageService {
    const langSvc = info.languageService;

    // ─── Helpers ───────────────────────────────────────────

    /**
     * Get the method name from a call expression
     */
    function getCallName(node: tslib.CallExpression): string | undefined {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        return expr.name.text;
      }
      if (ts.isIdentifier(expr)) {
        return expr.text;
      }
      return undefined;
    }

    /**
     * Recursively collect all property names from a type (top-level + nested with dot notation)
     */
    function collectPropertyPaths(checker: tslib.TypeChecker, type: tslib.Type, prefix: string = "", depth: number = 0): string[] {
      if (depth > 3) return []; // prevent infinite recursion
      const paths: string[] = [];
      for (const prop of type.getProperties()) {
        const name = prefix ? `${prefix}.${prop.name}` : prop.name;
        // Skip internal symbols
        if (prop.name.startsWith("__") || prop.name.startsWith("_webda")) continue;
        paths.push(name);
        // Recurse into object types for dot-notation support
        if (depth < 3) {
          const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration || prop.declarations![0]);
          // Only recurse into plain object types (not arrays, primitives, etc.)
          if (propType.getProperties().length > 0 && !(propType.flags & ts.TypeFlags.StringLike) && !checker.isArrayType(propType)) {
            paths.push(...collectPropertyPaths(checker, propType, name, depth + 1));
          }
        }
      }
      return paths;
    }

    /**
     * Resolve model field names from a repository.query() call.
     * Walks up: Repository<T> → InstanceType<T> → property names
     */
    function resolveFieldsFromRepoCall(checker: tslib.TypeChecker, node: tslib.CallExpression): string[] | undefined {
      const expr = node.expression;
      if (!ts.isPropertyAccessExpression(expr)) return undefined;

      const objType = checker.getTypeAtLocation(expr.expression);
      // Look for a generic type argument that represents the model
      // Repository<T> → we want to get the properties of InstanceType<T>

      // Strategy: find the return type of .get() on this object — that gives us Helpers<InstanceType<T>>
      const getMethod = objType.getProperty("get");
      if (!getMethod) return undefined;

      const getType = checker.getTypeOfSymbolAtLocation(getMethod, expr);
      const signatures = getType.getCallSignatures();
      if (!signatures.length) return undefined;

      let returnType = checker.getReturnTypeOfSignature(signatures[0]);
      // Unwrap Promise<T>
      if (returnType.symbol?.name === "Promise") {
        const typeArgs = (returnType as tslib.TypeReference).typeArguments;
        if (typeArgs?.length) returnType = typeArgs[0];
      }

      const props = collectPropertyPaths(checker, returnType);
      return props.length > 0 ? props : undefined;
    }

    /**
     * Resolve model fields from a parse() call with allowedFields param.
     * If the second argument is a type we can read, use that.
     * Otherwise, try to infer from context.
     */
    function resolveFieldsFromParseCall(checker: tslib.TypeChecker, node: tslib.CallExpression): string[] | undefined {
      // If there's a second argument (allowedFields), resolve its type
      if (node.arguments.length >= 2) {
        const arg = node.arguments[1];
        const type = checker.getTypeAtLocation(arg);
        // If it's a tuple of string literals, extract them
        if (checker.isArrayType(type)) {
          const typeArgs = (type as tslib.TypeReference).typeArguments;
          if (typeArgs?.length) {
            const elementType = typeArgs[0];
            if (elementType.isUnion()) {
              const fields = elementType.types
                .filter((t): t is tslib.StringLiteralType => !!(t.flags & ts.TypeFlags.StringLiteral))
                .map(t => t.value);
              if (fields.length > 0) return fields;
            }
            if (elementType.flags & ts.TypeFlags.StringLiteral) {
              return [(elementType as tslib.StringLiteralType).value];
            }
          }
        }
      }
      return undefined;
    }

    /**
     * Find the position of a field name within the query string for precise error highlighting
     */
    function findFieldPosition(query: string, field: string, startSearch: number = 0): number {
      // Find the field as a whole word
      const idx = query.indexOf(field, startSearch);
      if (idx === -1) return 0;
      return idx;
    }

    // ─── Diagnostics ──────────────────────────────────────

    const proxy: tslib.LanguageService = Object.create(null);

    proxy.getSemanticDiagnostics = (fileName: string): tslib.Diagnostic[] => {
      const prior = langSvc.getSemanticDiagnostics(fileName);
      const program = langSvc.getProgram();
      if (!program) return prior;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return prior;
      const checker = program.getTypeChecker();
      const extra: tslib.Diagnostic[] = [];

      function visit(node: tslib.Node) {
        if (ts.isCallExpression(node) && node.arguments.length >= 1) {
          const firstArg = node.arguments[0];
          if (!ts.isStringLiteral(firstArg) && !ts.isNoSubstitutionTemplateLiteral(firstArg)) {
            ts.forEachChild(node, visit);
            return;
          }

          const queryText = firstArg.text;
          const callName = getCallName(node);
          let allowedFields: string[] | undefined;

          if (callName && QUERY_METHODS.has(callName)) {
            allowedFields = resolveFieldsFromRepoCall(checker, node);
          } else if (callName && PARSE_FUNCTIONS.has(callName)) {
            allowedFields = resolveFieldsFromParseCall(checker, node);
          }

          if (allowedFields) {
            const parsed = extractFields(queryText);
            const allowedSet = new Set(allowedFields);

            const fieldsToCheck = [
              ...(parsed.fields || []).map(f => ({ field: f, kind: "field" as const })),
              ...(parsed.assignmentFields || []).map(f => ({ field: f, kind: "assignment" as const }))
            ];

            for (const { field, kind } of fieldsToCheck) {
              if (!allowedSet.has(field)) {
                const offset = findFieldPosition(queryText, field);
                const messageText =
                  kind === "assignment"
                    ? `Unknown assignment field "${field}" in UPDATE SET. Allowed: ${allowedFields.join(", ")}`
                    : `Unknown field "${field}" in SELECT. Allowed: ${allowedFields.join(", ")}`;

                extra.push({
                  file: sourceFile,
                  start: firstArg.getStart() + 1 + offset, // +1 for the opening quote
                  length: field.length,
                  messageText,
                  category: ts.DiagnosticCategory.Error,
                  code: DIAG_CODE
                });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
      return [...prior, ...extra];
    };

    // ─── Completions ──────────────────────────────────────

    proxy.getCompletionsAtPosition = (
      fileName: string,
      position: number,
      options: tslib.GetCompletionsAtPositionOptions | undefined
    ): tslib.WithMetadata<tslib.CompletionInfo> | undefined => {
      const prior = langSvc.getCompletionsAtPosition(fileName, position, options);
      const program = langSvc.getProgram();
      if (!program) return prior;
      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return prior;
      const checker = program.getTypeChecker();

      // Check if cursor is inside a string argument to query()/parse()
      const token = findTokenAtPosition(sourceFile, position);
      if (!token || (!ts.isStringLiteral(token) && !ts.isNoSubstitutionTemplateLiteral(token))) {
        return prior;
      }

      const callExpr = findParentCallExpression(token);
      if (!callExpr || callExpr.arguments[0] !== token) return prior;

      const callName = getCallName(callExpr);
      let allowedFields: string[] | undefined;

      if (callName && QUERY_METHODS.has(callName)) {
        allowedFields = resolveFieldsFromRepoCall(checker, callExpr);
      } else if (callName && PARSE_FUNCTIONS.has(callName)) {
        allowedFields = resolveFieldsFromParseCall(checker, callExpr);
      }

      if (!allowedFields) return prior;

      // Determine context: are we in a SELECT field list or UPDATE SET?
      const queryText = token.text;
      const cursorOffset = position - token.getStart() - 1; // -1 for opening quote
      const textBeforeCursor = queryText.substring(0, cursorOffset);

      // Offer field completions if cursor is in a field-list or SET position
      const upperBefore = textBeforeCursor.toUpperCase().trimStart();
      const isInFieldContext =
        upperBefore.startsWith("SELECT") ||
        upperBefore.includes("SET") ||
        isImplicitSelectContext(textBeforeCursor);

      if (!isInFieldContext) return prior;

      const fieldEntries: tslib.CompletionEntry[] = allowedFields.map(field => ({
        name: field,
        kind: ts.ScriptElementKind.memberVariableElement,
        sortText: "0" + field, // sort before other completions
        insertText: field
      }));

      if (prior) {
        return {
          ...prior,
          entries: [...fieldEntries, ...prior.entries]
        };
      }

      return {
        isGlobalCompletion: false,
        isMemberCompletion: false,
        isNewIdentifierLocation: false,
        entries: fieldEntries
      };
    };

    // ─── Utility ──────────────────────────────────────────

    function findTokenAtPosition(sourceFile: tslib.SourceFile, position: number): tslib.Node | undefined {
      function find(node: tslib.Node): tslib.Node | undefined {
        if (position >= node.getStart() && position <= node.getEnd()) {
          return ts.forEachChild(node, find) || node;
        }
        return undefined;
      }
      return find(sourceFile);
    }

    function findParentCallExpression(node: tslib.Node): tslib.CallExpression | undefined {
      let current = node.parent;
      while (current) {
        if (ts.isCallExpression(current)) return current;
        current = current.parent;
      }
      return undefined;
    }

    function isImplicitSelectContext(text: string): boolean {
      // If text contains a comma before any operator, we're in an implicit SELECT
      let inSingle = false;
      let inDouble = false;
      for (const ch of text) {
        if (ch === "'" && !inDouble) inSingle = !inSingle;
        else if (ch === '"' && !inSingle) inDouble = !inDouble;
        else if (!inSingle && !inDouble) {
          if (ch === ",") return true;
          if (ch === "=" || ch === "!" || ch === "<" || ch === ">") return false;
        }
      }
      // Also treat empty/identifier-only text as a potential field context
      return /^\s*[a-zA-Z_.]*\s*$/.test(text);
    }

    // ─── Proxy all other methods ──────────────────────────

    for (const k of Object.keys(langSvc) as (keyof tslib.LanguageService)[]) {
      if (!(k in proxy)) {
        const method = langSvc[k];
        if (typeof method === "function") {
          (proxy as any)[k] = (...args: any[]) => (method as Function).apply(langSvc, args);
        }
      }
    }

    return proxy;
  }

  return { create };
}

export default init;
