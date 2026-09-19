/**
 * Accessor generator — the typed replacement for `createAccessorTransformer`
 * and `createDeclarationAccessorTransformer`.
 *
 * Handles all three coercion kinds from
 * `packages/ts-plugin/src/transforms/accessors.ts`:
 *
 * | kind                   | trigger                                   | generated |
 * |------------------------|-------------------------------------------|-----------|
 * | `builtin`              | type name in the coercion registry (Date) | asymmetric accessor pair |
 * | `set-method`           | type has a `@WebdaAutoSetter` `set(...)`  | asymmetric accessor pair |
 * | `relation-initializer` | type resolves to `ModelRelated`           | readonly initializer |
 *
 * The first two emit *asymmetric accessors*, which are ordinary TypeScript, so
 * any compiler produces the right `.js` and `.d.ts` with no plugin.
 */
import { SymbolFlags } from "typescript/unstable/sync";
import * as is from "typescript/unstable/ast/is";
import { DEFAULT_COERCIONS } from "../coercions.ts";
import { classesOf, isStatic, memberName } from "../context.ts";
import type { AnalysisContext, Edit, FileEdits, Generator } from "../plan.ts";

/** Widened setter type + coercion expression for registry types. */
interface BuiltinRule {
  setterType: string;
  coerce: (v: string) => string;
}

/**
 * How to coerce each registry type at runtime.
 *
 * Which types coerce, and the widened setter type they accept, comes from
 * {@link DEFAULT_COERCIONS} so that this generator, `@webda/compiler` and the
 * language service cannot drift apart. Only the runtime coercion expression —
 * which is meaningless outside code generation — lives here.
 */
const COERCE_EXPRESSIONS: Record<string, (v: string) => string> = {
  Date: v => `new Date(${v} as string | number | Date)`
};

const BUILTINS: Record<string, BuiltinRule> = Object.fromEntries(
  Object.entries(DEFAULT_COERCIONS)
    .filter(([name]) => COERCE_EXPRESSIONS[name])
    .map(([name, rule]) => [name, { setterType: rule.setterType, coerce: COERCE_EXPRESSIONS[name] }])
);

/** Class names treated as model bases. */
const MODEL_BASES = new Set(["Model", "UuidModel", "CoreModel"]);

/**
 * Whether a class is a model, following the base chain through the checker.
 *
 * The direct `extends` clause is not enough. In `@webda/core`, `Ident extends
 * OwnerModel` and `SimpleUser extends User` are both models, several links away
 * from `UuidModel`; matching only the written base name silently skips them and
 * their fields are never coerced. The chain is walked with the checker so it also
 * crosses package boundaries into `@webda/models`.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @returns true when the class derives from a known model base
 */
function isModelClass(ctx: AnalysisContext, sf: any, cls: any): boolean {
  // Cheap syntactic hit first: most models name a known base directly.
  if (ctx.baseNames(sf, cls).some(b => MODEL_BASES.has(b))) return true;

  // `getTypeAtLocation` on a class declaration yields the static side, whose
  // base types are constructor types — the instance chain is what we need.
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (!declared) return false;

  const seen = new Set<unknown>();
  const queue: any[] = [declared];
  while (queue.length) {
    const type = queue.shift();
    if (!type) continue;

    const symbol = type.getSymbol?.() ?? type.symbol;
    const name = symbol?.name;
    if (name && MODEL_BASES.has(name)) return true;
    if (seen.has(name ?? type)) continue;
    seen.add(name ?? type);

    // Guard against pathological hierarchies rather than trusting the graph.
    if (seen.size > 64) return false;

    // `getBaseTypes()` hands back instantiated references whose own bases are
    // empty, so a generic link such as `AbstractOwnerModel<T> extends UuidModel`
    // terminates the walk. Re-resolving each base through its symbol gets the
    // declared type, which does carry the next link.
    const resolved = symbol ? (ctx.checker.getDeclaredTypeOfSymbol(symbol) ?? type) : type;
    for (const base of resolved.getBaseTypes?.() ?? type.getBaseTypes?.() ?? []) queue.push(base);
  }
  return false;
}

/** Runtime class name that needs an initializer rather than an accessor. */
const RELATION_CONTAINER = "ModelRelated";

/** Options for the accessor generator. */
export interface AccessorOptions {
  /** Treat every class as eligible, not just models. */
  accessorsForAll?: boolean;
  /** Module specifier providing `WEBDA_STORAGE`. */
  storageModule?: string;
}

/** A property resolved to a coercion. */
interface Resolved {
  name: string;
  /** Declared (read) type, as written. */
  typeText: string;
  kind: "builtin" | "set-method" | "relation-initializer";
  /** Widened setter type, for accessor kinds. */
  setterType?: string;
  /** Coercion body for `builtin`. */
  coerce?: (v: string) => string;
  /** Runtime constructor name, for `set-method` / `relation-initializer`. */
  runtimeClass?: string;
  start: number;
  end: number;
  indent: string;
}

/**
 * Follow a type to the class that actually implements it, so aliases like
 * `ManyToOne<T>` resolve to `ModelLink` and `OneToMany<T>` to `ModelRelated`.
 * @param ctx - analysis context
 * @param typeNode - the property's type node
 * @returns the resolved class name, if any
 */
function resolveRuntimeClass(ctx: AnalysisContext, typeNode: any): string | undefined {
  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  if (!type) return undefined;
  const symbol = (type as any).getSymbol?.() ?? (type as any).symbol;
  const name = symbol?.name;
  if (name && name !== "__type") return name;
  // Fall back to the printed type, taking the head of `Foo<Bar>`.
  const printed = ctx.checker.typeToString(type);
  const head = /^([A-Za-z_$][\w$]*)/.exec(printed)?.[1];
  return head;
}

/**
 * Find a `set` method tagged `@WebdaAutoSetter` on the property's type and
 * return its parameter type as a string.
 * @param ctx - analysis context
 * @param typeNode - the property's type node
 * @returns the widened parameter type, if the tag is present
 */
function autoSetterParamType(ctx: AnalysisContext, typeNode: any): string | undefined {
  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  if (!type) return undefined;

  const setSymbol = ctx.checker.getPropertyOfType(type, "set");
  if (!setSymbol) return undefined;

  const decl = setSymbol.valueDeclaration ?? setSymbol.declarations?.[0];
  const node = decl?.resolve(ctx.project);
  if (!node) return undefined;
  const owner = (node as any).getSourceFile?.() ?? (node as any)._sourceFile;
  if (!owner || !/@WebdaAutoSetter\b/.test(ctx.triviaOf(owner, node))) return undefined;

  const setType = ctx.checker.getTypeOfSymbol(setSymbol);
  if (!setType) return undefined;
  // 0 === SignatureKind.Call
  const sigs = ctx.checker.getSignaturesOfType(setType, 0 as any);
  if (!sigs.length) return undefined;
  const param = ctx.checker.getParameterType(sigs[0], 0);
  return param ? ctx.checker.typeToString(param) : undefined;
}

/**
 * Whether `new <className>()` is valid at this location.
 *
 * The real `ModelLink<T>` takes a required `ModelClass<T>` argument
 * (`packages/models/src/relations.ts:58`), so the naive `?? new ModelLink()`
 * fallback produces TS2554. The production transform resolves the type argument
 * and emits `new ModelLink(Target)`; until that is implemented here, skip the
 * property rather than generate code that does not compile.
 * @param ctx - analysis context
 * @param className - runtime class name
 * @param location - node used for scope resolution
 * @returns true when constructible with no arguments
 */
function zeroArgConstructible(ctx: AnalysisContext, className: string, location: any): boolean {
  if (!/^[A-Za-z_$][\w$]*$/.test(className)) return false;
  const symbol = ctx.checker.resolveName(className, SymbolFlags.Value, location);
  if (!symbol) return false;
  const ctorType = ctx.checker.getTypeOfSymbol(symbol);
  if (!ctorType) return false;
  // 1 === SignatureKind.Construct
  const ctors = ctx.checker.getSignaturesOfType(ctorType, 1 as any);
  return ctors.some(sig => {
    const params = (sig as any).parameters ?? [];
    const minArgs = (sig as any).minArgumentCount ?? params.length;
    return minArgs === 0;
  });
}

/**
 * Indentation of the line containing an offset.
 * @param text - file text
 * @param offset - offset within the line
 * @returns leading whitespace
 */
function indentAt(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const prefix = text.slice(lineStart, offset);
  return /^[ \t]*$/.test(prefix) ? prefix : "  ";
}

/**
 * Render the generated members for one resolved property.
 * @param r - the resolved coercion
 * @returns generated TypeScript source
 */
function render(r: Resolved): string {
  const slot = `this[WEBDA_STORAGE][${JSON.stringify(r.name)}]`;
  const i = r.indent;

  if (r.kind === "relation-initializer") {
    // Not assignable, so no accessor pair — just a readonly initialised field.
    return `readonly ${r.name}: ${r.typeText} = new ${r.runtimeClass}();`;
  }

  const lines: string[] = [];
  lines.push(`get ${r.name}(): ${r.typeText} {`);
  lines.push(`${i}  return ${slot};`);
  lines.push(`${i}}`);
  lines.push(`${i}set ${r.name}(value: ${r.setterType}) {`);

  if (r.kind === "builtin") {
    lines.push(`${i}  ${slot} = value !== undefined && value !== null ? ${r.coerce!("value")} : value;`);
  } else {
    lines.push(`${i}  if (value instanceof ${r.runtimeClass}) {`);
    lines.push(`${i}    ${slot} = value;`);
    lines.push(`${i}    return;`);
    lines.push(`${i}  }`);
    lines.push(`${i}  const current: ${r.typeText} = ${slot} ?? new ${r.runtimeClass}();`);
    lines.push(`${i}  current.set(value as any);`);
    lines.push(`${i}  ${slot} = current;`);
  }

  lines.push(`${i}}`);
  return lines.join("\n");
}

/**
 * Create the accessor generator.
 * @param options - generator options
 * @returns a generator
 */
export function accessorsGenerator(options: AccessorOptions = {}): Generator {
  const storageModule = options.storageModule ?? "@webda/models";

  return {
    name: "accessors",
    analyze(ctx: AnalysisContext): FileEdits[] {
      const out: FileEdits[] = [];

      for (const sf of ctx.sourceFiles) {
        const edits: Edit[] = [];
        let needsStorage = false;

        for (const cls of classesOf(sf)) {
          const eligible = options.accessorsForAll || isModelClass(ctx, sf, cls);
          if (!eligible) continue;

          // Never clobber an explicitly written accessor.
          const existing = new Set<string>();
          for (const m of cls.members) {
            if (is.isGetAccessorDeclaration(m) || is.isSetAccessorDeclaration(m)) {
              const n = memberName(m);
              if (n) existing.add(n);
            }
          }

          for (const m of cls.members) {
            if (!is.isPropertyDeclaration(m) || isStatic(m)) continue;
            const name = memberName(m);
            if (!name || existing.has(name)) continue;
            if (!m.type) continue;
            // An initialiser means the author already controls construction.
            if ((m as any).initializer) continue;

            const typeText = ctx.textOf(sf, m.type);
            const start = (m as any).getStart();
            const indent = indentAt(sf.text, start);
            const head = /^([A-Za-z_$][\w$]*)/.exec(typeText)?.[1] ?? typeText;

            let resolved: Resolved | undefined;

            const builtin = BUILTINS[head];
            if (builtin) {
              resolved = {
                name, typeText, kind: "builtin",
                setterType: builtin.setterType, coerce: builtin.coerce,
                start, end: m.end, indent
              };
            } else {
              const runtimeClass = resolveRuntimeClass(ctx, m.type);
              if (runtimeClass === RELATION_CONTAINER) {
                if (!zeroArgConstructible(ctx, runtimeClass, m)) continue;
                resolved = {
                  name, typeText, kind: "relation-initializer",
                  runtimeClass, start, end: m.end, indent
                };
              } else {
                const param = autoSetterParamType(ctx, m.type);
                if (param && runtimeClass) {
                  if (!zeroArgConstructible(ctx, runtimeClass, m)) continue;
                  resolved = {
                    name, typeText, kind: "set-method",
                    setterType: `${param} | ${typeText}`,
                    runtimeClass, start, end: m.end, indent
                  };
                }
              }
            }

            if (!resolved) continue;
            if (resolved.kind !== "relation-initializer") needsStorage = true;
            edits.push({ start, end: m.end, text: render(resolved), source: "accessors" });
          }
        }

        if (edits.length) {
          if (needsStorage && !new RegExp(`\\bWEBDA_STORAGE\\b`).test(sf.text)) {
            edits.push({
              start: 0, end: 0,
              text: `import { WEBDA_STORAGE } from ${JSON.stringify(storageModule)};\n`,
              source: "accessors"
            });
          }
          out.push({ fileName: sf.fileName, edits });
        }
      }

      return out;
    }
  };
}
