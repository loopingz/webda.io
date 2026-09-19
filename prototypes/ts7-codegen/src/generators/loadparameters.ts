/**
 * `loadParameters` generator — the typed equivalent of
 * `packages/compiler/src/morpher/loadparameters.ts`.
 *
 * For every class extending `Service<T>` that does not already declare
 * `loadParameters`, generate:
 *
 * ```ts
 * protected loadParameters(data: any): T {
 *   return new T().load(data);
 * }
 * ```
 *
 * `T` is resolved the same way the morpher resolves it: the explicit type
 * argument on the `extends` clause, falling back to walking the base chain,
 * then to the type parameter's default or constraint.
 *
 * Unlike the morpher this writes nothing to disk — the method is injected into
 * the compiler's view of the file in pass 2.
 */
import { SymbolFlags, isTypeParameter } from "typescript/unstable/sync";
import { classesOf, memberName } from "../context.ts";
import type { AnalysisContext, Edit, FileEdits, Generator } from "../plan.ts";

/** Base class whose subclasses receive the generated method. */
const SERVICE_BASE = "Service";

/**
 * Resolve the parameters type for a service class.
 *
 * Mirrors `getTypeArgumentName`: prefer the explicit `extends Service<T>` type
 * argument; otherwise ask the checker for the base type's argument, which
 * covers `class A extends B` where `B extends Service<T>`.
 * @param ctx - analysis context
 * @param sf - containing source file
 * @param cls - the class declaration
 * @returns the parameters type name, if resolvable
 */
function parametersTypeName(ctx: AnalysisContext, sf: any, cls: any): string | undefined {
  for (const clause of cls.heritageClauses ?? []) {
    if (clause.token !== 95) continue; // ExtendsKeyword
    for (const t of clause.types) {
      const args = (t as any).typeArguments;
      if (!args?.length) continue;
      const written = ctx.textOf(sf, args[0]);

      // `class Svc<T> extends Service<T>` — `new T()` is not constructible.
      // Mirror the morpher: fall back to the type parameter's default, then to
      // its constraint. Without this, generic services emit TS2693.
      const argType = ctx.checker.getTypeFromTypeNode(args[0]);
      if (argType && isTypeParameter(argType)) {
        const dflt = ctx.checker.getDefaultFromTypeParameter(argType as any);
        if (dflt) return ctx.checker.typeToString(dflt);
        const constraint = ctx.checker.getConstraintOfTypeParameter(argType as any);
        if (constraint) return ctx.checker.typeToString(constraint);
        return undefined; // unconstrained generic: not safely constructible
      }
      return written;
    }
  }

  // No explicit argument — ask the checker for the instantiated base type.
  try {
    const symbol = ctx.checker.getSymbolAtLocation(cls.name);
    if (!symbol) return undefined;
    const declared = ctx.checker.getDeclaredTypeOfSymbol(symbol);
    const bases = ctx.checker.getBaseTypes?.(declared as any) ?? [];
    for (const base of bases) {
      const printed = ctx.checker.typeToString(base);
      const m = /^Service<\s*(.+?)\s*>$/.exec(printed);
      if (m) return m[1];
    }
  } catch {
    // Best-effort: an unresolvable base simply means we skip the class.
  }
  return undefined;
}

/**
 * Verify the resolved parameters type is actually usable in `new T().load(data)`
 * *at this location*: resolvable as a value, constructible with no arguments,
 * and exposing a `load` method.
 *
 * Without these checks the generator emits code that does not compile — on
 * `packages/core` it produced TS2304 (name not in scope), TS2554 (constructor
 * needs arguments) and TS2349 (no `load`). Skipping is always safe: the class
 * simply keeps today's behaviour.
 * @param ctx - analysis context
 * @param typeName - the resolved parameters type name
 * @param location - node used for scope resolution
 * @returns true when the generated call would be valid
 */
function isUsable(ctx: AnalysisContext, typeName: string, location: any): boolean {
  // A qualified or generic name is beyond what this PoC verifies.
  if (!/^[A-Za-z_$][\w$]*$/.test(typeName)) return false;

  const symbol = ctx.checker.resolveName(typeName, SymbolFlags.Value, location);
  if (!symbol) return false;

  const ctorType = ctx.checker.getTypeOfSymbol(symbol);
  if (!ctorType) return false;

  // 1 === SignatureKind.Construct
  const ctors = ctx.checker.getSignaturesOfType(ctorType, 1 as any);
  if (!ctors.length) return false;
  const zeroArgOk = ctors.some(sig => {
    const params = (sig as any).parameters ?? [];
    const minArgs = (sig as any).minArgumentCount ?? params.length;
    return minArgs === 0;
  });
  if (!zeroArgOk) return false;

  const instance = ctx.checker.getDeclaredTypeOfSymbol(symbol);
  return !!(instance && ctx.checker.getPropertyOfType(instance, "load"));
}

/**
 * Indentation to use for a generated member, inferred from the class body.
 * @param text - file text
 * @param cls - the class declaration
 * @returns leading whitespace
 */
function memberIndent(text: string, cls: any): string {
  const first = cls.members?.[0];
  if (!first) return "  ";
  const start = first.getStart?.() ?? first.pos;
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const prefix = text.slice(lineStart, start);
  return /^[ \t]*$/.test(prefix) ? prefix : "  ";
}

/**
 * Create the loadParameters generator.
 * @returns a generator
 */
export function loadParametersGenerator(): Generator {
  return {
    name: "loadParameters",
    analyze(ctx: AnalysisContext): FileEdits[] {
      const out: FileEdits[] = [];

      for (const sf of ctx.sourceFiles) {
        const edits: Edit[] = [];

        for (const cls of classesOf(sf)) {
          if (!ctx.baseNames(sf, cls).includes(SERVICE_BASE)) continue;

          // Respect a hand-written implementation.
          if (cls.members.some((m: any) => memberName(m) === "loadParameters")) continue;

          const paramsType = parametersTypeName(ctx, sf, cls);
          if (!paramsType) continue;
          if (!isUsable(ctx, paramsType, cls)) continue;

          const indent = memberIndent(sf.text, cls);
          const last = cls.members?.[cls.members.length - 1];
          const insertAt = last ? last.end : cls.end - 1;

          const text = [
            ``,
            ``,
            `${indent}/** Generated by @webda/codegen. */`,
            `${indent}protected loadParameters(data: any): ${paramsType} {`,
            `${indent}  return new ${paramsType}().load(data);`,
            `${indent}}`
          ].join("\n");

          edits.push({ start: insertAt, end: insertAt, text, source: "loadParameters" });
        }

        if (edits.length) out.push({ fileName: sf.fileName, edits });
      }

      return out;
    }
  };
}
