/**
 * WebdaQL generator — the typed replacement for
 * `@webda/ts-plugin/transforms/qlvalidator.ts`.
 *
 * Two jobs, and they use different output channels:
 *
 * - **Validation.** Arguments typed `WebdaQLString<T>` are parsed at compile
 *   time and reported through `FileEdits.diagnostics`, which the content mapper
 *   protocol carries in `TransformResult.diagnostics`. Positions refer to the
 *   authored file, so errors land on the query the developer wrote. A query on a
 *   sealed field (`SealedField`, an envelope the server cannot read) is a
 *   warning, in these arguments and in the static `getPermissionQuery` of the
 *   models; the build logs it without failing.
 * - **Rewrite.** A template literal is turned into an `escape(parts, values)`
 *   call so interpolated values cannot break out of the query.
 *
 * The original builds the rewrite with `ts.factory`, removed in TypeScript 7;
 * here it is text through the shared plan model.
 */
import type { SourceFile } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { AnalysisContext, Edit, FileEdits, GeneratedDiagnostic, Generator } from "../plan.ts";

/** Module providing the runtime `escape` helper. */
const QL_MODULE = "@webda/ql";

/** Unknown attribute referenced by a query. */
const WQL_UNKNOWN_ATTRIBUTE = 9001;
/** Query text does not parse. */
const WQL_GRAMMAR_ERROR = 9002;
/** A DELETE / UPDATE / SELECT field list where a filter query is expected. */
const WQL_STATEMENT_NOT_ALLOWED = 9003;
/** A sealed field (`@WebdaBehavior Webda/Sealed`) in a query: the server cannot filter, compare or index it. */
const WQL_SEALED_ATTRIBUTE = 9004;

/** Identifier of the `SealedField` behavior of `@webda/core`. */
const SEALED_BEHAVIOR = "Webda/Sealed";

/**
 * A statement head: DELETE, UPDATE or SELECT (keywords are uppercase only, so `delete = 1` is a filter)
 */
const STATEMENT_HEAD = /^\s*(DELETE|UPDATE|SELECT)(?=\s|$)(?!\s*(?:=|!=|<|>|IN\b|LIKE\b|CONTAINS\b|IS\b))/;

/**
 * The statement keyword a query starts with, if any: `UPDATE.x = 1` or `DELETE = 1` are filters on fields named
 * like a keyword
 * @param query - the query text
 * @returns DELETE, UPDATE or SELECT, undefined for a filter query
 */
export function statementHead(query: string): string | undefined {
  return STATEMENT_HEAD.exec(query)?.[1];
}

/** Options for the WebdaQL generator. */
export interface QlValidatorOptions {
  /**
   * Parse a query, throwing on a grammar error.
   *
   * Injected so the generator stays testable without pulling the ANTLR runtime
   * into every unit test. Defaults to `parse` from `@webda/ql`.
   */
  parse?: (query: string) => unknown;
  /** Module specifier providing `escape`. */
  qlModule?: string;
}

/**
 * Whether a branded query parameter takes statements: `WebdaQLStatement<T>` (as `deleteMany` / `updateMany`),
 * rather than the filter queries of `WebdaQLString<T>`
 * @param ctx - analysis context
 * @param type - the parameter type
 * @returns true for a statement parameter
 */
function isStatementParameter(ctx: AnalysisContext, type: any): boolean {
  if (!type) return false;
  const aliasSymbol = type.getAliasSymbol?.() ?? type.aliasSymbol;
  if (aliasSymbol?.name === "WebdaQLStatement") return true;
  if (type.isUnionOrIntersection?.()) {
    return (type.types ?? []).some((member: any) => isStatementParameter(ctx, member));
  }
  return !!ctx.checker.getPropertyOfType(type, "__webdaQLStatement");
}

/**
 * Unwrap `WebdaQLString<T>` or `WebdaQLStatement<T>` to `T`.
 *
 * The brand is an alias, so the alias arguments are checked first; a value that
 * has flowed through a union keeps the brand as a property, which is the
 * fallback.
 * @param ctx - analysis context
 * @param type - the parameter type to unwrap
 * @returns the target type, when the parameter is a branded query string
 */
function peelWebdaQLString(ctx: AnalysisContext, type: any): any {
  if (!type) return undefined;

  const aliasSymbol = type.getAliasSymbol?.() ?? type.aliasSymbol;
  if (aliasSymbol?.name === "WebdaQLString" || aliasSymbol?.name === "WebdaQLStatement") {
    const args = type.getAliasTypeArguments?.() ?? type.aliasTypeArguments;
    if (args?.[0]) return args[0];
  }

  if (type.isUnionOrIntersection?.()) {
    for (const member of type.types ?? []) {
      const peeled = peelWebdaQLString(ctx, member);
      if (peeled) return peeled;
    }
  }

  const brand = ctx.checker.getPropertyOfType(type, "__webdaQL");
  return brand ? ctx.checker.getTypeOfSymbol(brand) : undefined;
}

/**
 * Attribute names queryable on a type.
 * @param ctx - analysis context
 * @param type - the target type
 * @returns property names
 */
function queryableAttributes(ctx: AnalysisContext, type: any): string[] {
  return (type?.getProperties?.() ?? [])
    .map((property: any) => property.name as string)
    .filter((name: string) => typeof name === "string" && !name.startsWith("__"));
}

/**
 * Attribute names of a type whose declared type is a `@WebdaBehavior Webda/Sealed` class (`SealedField<T>`): their
 * stored value is an opaque envelope, a query on them never matches.
 * @param ctx - analysis context
 * @param type - the target type
 * @returns property names
 */
function sealedAttributes(ctx: AnalysisContext, type: any): string[] {
  return type
    .getProperties()
    .filter((property: any) => {
      // A primitive type has no symbol
      const symbol = ctx.checker.getTypeOfSymbol(property).getSymbol();
      return symbol
        ?.getJsDocTags(ctx.checker)
        .some(
          (tag: any) => tag.name === "WebdaBehavior" && String(tag.text).trim().split(/\s+/)[0] === SEALED_BEHAVIOR
        );
    })
    .map((property: any) => property.name as string);
}

/**
 * Field list of a `SELECT f1, f2.g [WHERE ...]` statement: everything between `SELECT` and the first clause
 * keyword (keywords are uppercase only, so a lowercase `where` is a field)
 * @param query - raw query text
 * @returns the raw field list, or undefined when the query is not a SELECT statement
 */
function selectFields(query: string): string | undefined {
  // Two linear scans instead of one lazy pattern, which backtracks quadratically on long runs of spaces
  const head = /^\s*SELECT\s/.exec(query);
  if (!head) return undefined;
  const rest = query.slice(head[0].length);
  const end = rest.search(/\s(?:WHERE|ORDER BY|LIMIT|OFFSET)\b/);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

/**
 * Attribute paths referenced by a query, as written.
 *
 * Deliberately syntactic: the compile-time check only needs the head of each
 * comparison, and reusing the full query AST would tie this generator to the
 * parser's shape. Statements are covered too: the fields of a `SELECT` list, and
 * the targets of an `UPDATE SET` (written `field = value`, like a comparison).
 * @param query - raw query text
 * @returns referenced attribute heads
 */
export function referencedAttributes(query: string): string[] {
  const names = new Set<string>();
  const identifier = /[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/g;
  const comparison = /^(?:=|!=|<|>|IN|LIKE)/i;
  const nullComparison = /^IS\s+(?:NOT\s+)?NULL\b/i;
  for (const match of query.matchAll(identifier)) {
    const end = match.index! + match[0].length;
    let cursor = end;
    while (cursor < query.length && /\s/.test(query[cursor])) cursor++;
    const suffix = query.slice(cursor);
    if (!comparison.test(suffix) && !(cursor > end && nullComparison.test(suffix))) continue;
    const head = match[0].split(".")[0];
    if (!/^(AND|OR|NOT|TRUE|FALSE|IN|LIKE|IS|NULL)$/i.test(head)) names.add(head);
  }
  for (const field of selectFields(query)?.split(",") ?? []) {
    const head = field.trim().split(".")[0];
    if (head) names.add(head);
  }
  return [...names];
}

/**
 * Closest candidate by edit distance, for "did you mean".
 * @param needle - the unknown name
 * @param candidates - known attribute names
 * @returns the nearest candidate, when one is close enough
 */
function nearestNeighbour(needle: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  // Matches the original's cutoff: within two edits, otherwise the suggestion
  // is noise. A transposition such as `titel` for `title` costs two.
  let bestDistance = 3;
  for (const candidate of candidates) {
    const distance = levenshtein(needle, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

/**
 * Levenshtein distance between two strings.
 * @param a - first string
 * @param b - second string
 * @returns the edit distance
 */
function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/**
 * Create the WebdaQL generator.
 * @param options - generator options
 * @returns a generator
 */
export function qlValidatorGenerator(options: QlValidatorOptions = {}): Generator {
  const qlModule = options.qlModule ?? QL_MODULE;

  return {
    name: "qlvalidator",
    analyze(ctx: AnalysisContext): FileEdits[] {
      const out: FileEdits[] = [];

      for (const sf of ctx.sourceFiles) {
        const edits: Edit[] = [];
        const diagnostics: GeneratedDiagnostic[] = [];
        let needsEscape = false;

        visit(sf);

        if (edits.length || diagnostics.length) {
          if (needsEscape && !new RegExp(`\\bescape\\b`).test(sf.text)) {
            edits.push({
              start: 0,
              end: 0,
              text: `import { escape } from ${JSON.stringify(qlModule)};\n`,
              source: "qlvalidator"
            });
          }
          out.push({ fileName: sf.fileName, edits, diagnostics });
        }

        /**
         * Walk the file for calls whose parameter is a branded query string.
         *
         * `Node.forEachChild` is a method on the node in TypeScript 7. Walking
         * own properties instead follows `parent` back-references and recurses
         * until the stack overflows.
         * @param node - current node
         */
        function visit(node: any): void {
          if (is.isCallExpression(node)) inspectCall(node);
          if (is.isClassDeclaration(node)) inspectPermissionQueries(node);
          node.forEachChild?.((child: any) => {
            visit(child);
            return undefined;
          });
        }

        /**
         * Check the sealed fields of a model against the queries of its static `getPermissionQuery`: every string
         * literal written under a `query:` property of its body (the first argument of a `bind(...)` included) is
         * read as a filter on the model; a query built elsewhere is not followed. A permission query is not a
         * branded parameter, so only the sealed warning applies.
         * @param cls - the class declaration
         */
        function inspectPermissionQueries(cls: any): void {
          const method = cls.members.find(
            (member: any) =>
              is.isMethodDeclaration(member) &&
              (member.name as any).text === "getPermissionQuery" &&
              (member.modifiers ?? []).some((modifier: any) => modifier.kind === SyntaxKind.StaticKeyword)
          );
          // An anonymous class (`export default class`) is not a model
          const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
          if (!method?.body || !symbol) return;
          const target = ctx.checker.getDeclaredTypeOfSymbol(symbol);
          const sealed = sealedAttributes(ctx, target);
          if (!sealed.length) return;
          const literals = (node: any): void => {
            if (is.isStringLiteral(node) || is.isNoSubstitutionTemplateLiteral(node)) {
              warnSealed(node.text, node, sealed);
            } else if (is.isTemplateExpression(node)) {
              warnSealed(
                [node.head.text, ...node.templateSpans.map((span: any) => span.literal.text)].join("?"),
                node,
                sealed
              );
            }
            node.forEachChild((child: any) => {
              literals(child);
              return undefined;
            });
          };
          const queries = (node: any): void => {
            if (is.isPropertyAssignment(node) && (node.name as any).text === "query") {
              literals(node.initializer);
              return;
            }
            node.forEachChild((child: any) => {
              queries(child);
              return undefined;
            });
          };
          queries(method.body);
        }

        /**
         * Warn on every sealed attribute a query references
         * @param query - query text
         * @param node - node used for diagnostic position
         * @param sealed - sealed attribute names of the target
         */
        function warnSealed(query: string, node: any, sealed: string[]): void {
          const start = (node as any).getStart();
          for (const attribute of referencedAttributes(query)) {
            if (!sealed.includes(attribute)) continue;
            diagnostics.push({
              start,
              length: node.end - start,
              code: WQL_SEALED_ATTRIBUTE,
              severity: "warning",
              messageText:
                `Attribute '${attribute}' is a sealed field: the server stores an envelope it cannot read, ` +
                "so the query never matches it (sealed values cannot be filtered, compared or indexed)"
            });
          }
        }

        /**
         * Validate and possibly rewrite one call's arguments.
         * @param call - the call expression
         */
        function inspectCall(call: any): void {
          const signature = ctx.checker.getResolvedSignature?.(call);
          if (!signature) return;

          // `Signature.parameters` is a list of raw handles; `getParameterType`
          // is the supported way to read a parameter's type.
          call.arguments?.forEach((argument: any, index: number) => {
            const parameterType = ctx.checker.getParameterType(signature, index);
            const target = peelWebdaQLString(ctx, parameterType);
            if (!target) return;
            inspectArgument(argument, target, isStatementParameter(ctx, parameterType));
          });
        }

        /**
         * Validate a query argument, rewriting template literals.
         * @param argument - the argument expression
         * @param target - the type attributes are checked against
         * @param statement - whether the parameter takes statements
         */
        function inspectArgument(argument: any, target: any, statement: boolean): void {
          if (is.isStringLiteral(argument) || is.isNoSubstitutionTemplateLiteral(argument)) {
            validateQuery(argument.text, argument, target, statement);
            return;
          }

          if (is.isTemplateExpression(argument)) {
            // Static parts are validated with a placeholder standing in for each
            // interpolation, so a hole cannot hide an unknown attribute.
            const parts = [argument.head.text, ...argument.templateSpans.map((span: any) => span.literal.text)];
            validateQuery(parts.join("?"), argument, target, statement);

            const values = argument.templateSpans.map((span: any) => ctx.textOf(sf, span.expression)).join(", ");
            const partsLiteral = parts.map(part => JSON.stringify(part)).join(", ");
            edits.push({
              start: (argument as any).getStart(),
              end: argument.end,
              text: `escape([${partsLiteral}], [${values}])`,
              source: "qlvalidator"
            });
            needsEscape = true;
          }
        }

        /**
         * Parse a query and check its attributes against the target type.
         * @param query - query text
         * @param node - node used for diagnostic position
         * @param target - the type attributes are checked against
         * @param statement - whether the parameter takes statements
         */
        function validateQuery(query: string, node: any, target: any, statement: boolean): void {
          const start = (node as any).getStart();
          const length = node.end - start;

          const head = statementHead(query);
          if (head && !statement) {
            diagnostics.push({
              start,
              length,
              code: WQL_STATEMENT_NOT_ALLOWED,
              messageText:
                head === "SELECT"
                  ? "WebdaQL SELECT field lists are not accepted here: pass a filter query"
                  : `WebdaQL ${head} statements are not accepted here: use deleteMany / updateMany`
            });
          }

          if (options.parse) {
            try {
              options.parse(query);
            } catch (error: any) {
              diagnostics.push({
                start,
                length,
                code: WQL_GRAMMAR_ERROR,
                messageText: `WebdaQL grammar error: ${String(error?.message ?? error)}`
              });
              return;
            }
          }

          const known = queryableAttributes(ctx, target);
          if (!known.length) return;
          for (const attribute of referencedAttributes(query)) {
            if (known.includes(attribute)) continue;
            const suggestion = nearestNeighbour(attribute, known);
            diagnostics.push({
              start,
              length,
              code: WQL_UNKNOWN_ATTRIBUTE,
              messageText:
                `Unknown attribute '${attribute}' in WebdaQL query` +
                (suggestion ? `. Did you mean '${suggestion}'?` : ".")
            });
          }
          warnSealed(query, node, sealedAttributes(ctx, target));
        }
      }

      return out;
    }
  };
}

/** Re-exported so hosts can label diagnostics consistently. */
export const WQL_CODES = {
  UNKNOWN_ATTRIBUTE: WQL_UNKNOWN_ATTRIBUTE,
  GRAMMAR_ERROR: WQL_GRAMMAR_ERROR,
  STATEMENT_NOT_ALLOWED: WQL_STATEMENT_NOT_ALLOWED,
  SEALED_ATTRIBUTE: WQL_SEALED_ATTRIBUTE
};

export type { SourceFile };
