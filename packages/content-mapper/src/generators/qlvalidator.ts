/**
 * WebdaQL generator — the typed replacement for
 * `@webda/ts-plugin/transforms/qlvalidator.ts`.
 *
 * Two jobs, and they use different output channels:
 *
 * - **Validation.** Arguments typed `WebdaQLString<T>` are parsed at compile
 *   time and reported through `FileEdits.diagnostics`, which the content mapper
 *   protocol carries in `TransformResult.diagnostics`. Positions refer to the
 *   authored file, so errors land on the query the developer wrote.
 * - **Rewrite.** A template literal is turned into an `escape(parts, values)`
 *   call so interpolated values cannot break out of the query.
 *
 * The original builds the rewrite with `ts.factory`, removed in TypeScript 7;
 * here it is text through the shared plan model.
 */
import type { SourceFile } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { AnalysisContext, Edit, FileEdits, GeneratedDiagnostic, Generator } from "../plan.ts";

/** Module providing the runtime `escape` helper. */
const QL_MODULE = "@webda/ql";

/** Unknown attribute referenced by a query. */
const WQL_UNKNOWN_ATTRIBUTE = 9001;
/** Query text does not parse. */
const WQL_GRAMMAR_ERROR = 9002;

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
 * Unwrap `WebdaQLString<T>` to `T`.
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
  if (aliasSymbol?.name === "WebdaQLString") {
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
 * Attribute paths referenced by a query, as written.
 *
 * Deliberately syntactic: the compile-time check only needs the head of each
 * comparison, and reusing the full query AST would tie this generator to the
 * parser's shape.
 * @param query - raw query text
 * @returns referenced attribute heads
 */
function referencedAttributes(query: string): string[] {
  const names = new Set<string>();
  for (const match of query.matchAll(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*(?:=|!=|<|>|<=|>=|IN|LIKE)/gi)) {
    const head = match[1].split(".")[0];
    if (!/^(AND|OR|NOT|TRUE|FALSE|IN|LIKE)$/i.test(head)) names.add(head);
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
              start: 0, end: 0,
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
          node.forEachChild?.((child: any) => {
            visit(child);
            return undefined;
          });
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
            inspectArgument(argument, target);
          });
        }

        /**
         * Validate a query argument, rewriting template literals.
         * @param argument - the argument expression
         * @param target - the type attributes are checked against
         */
        function inspectArgument(argument: any, target: any): void {
          if (is.isStringLiteral(argument) || is.isNoSubstitutionTemplateLiteral(argument)) {
            validateQuery(argument.text, argument, target);
            return;
          }

          if (is.isTemplateExpression(argument)) {
            // Static parts are validated with a placeholder standing in for each
            // interpolation, so a hole cannot hide an unknown attribute.
            const parts = [argument.head.text, ...argument.templateSpans.map((span: any) => span.literal.text)];
            validateQuery(parts.join("?"), argument, target);

            const values = argument.templateSpans
              .map((span: any) => ctx.textOf(sf, span.expression))
              .join(", ");
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
         */
        function validateQuery(query: string, node: any, target: any): void {
          const start = (node as any).getStart();
          const length = node.end - start;

          if (options.parse) {
            try {
              options.parse(query);
            } catch (error: any) {
              diagnostics.push({
                start, length,
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
              start, length,
              code: WQL_UNKNOWN_ATTRIBUTE,
              messageText:
                `Unknown attribute '${attribute}' in WebdaQL query` +
                (suggestion ? `. Did you mean '${suggestion}'?` : ".")
            });
          }
        }
      }

      return out;
    }
  };
}

/** Re-exported so hosts can label diagnostics consistently. */
export const WQL_CODES = { UNKNOWN_ATTRIBUTE: WQL_UNKNOWN_ATTRIBUTE, GRAMMAR_ERROR: WQL_GRAMMAR_ERROR };

export type { SourceFile };
