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
import type { SourceFile } from "typescript/unstable/ast";
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
    // Keyed by declaration: a model may legitimately share its base's name,
    // e.g. sample-app's `User extends User` from `@webda/core`. Guarding on the
    // name alone stops the walk one link short and the class is never detected.
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    const owner = declaration?.resolve(ctx.project);
    const file = (owner as any)?.getSourceFile?.()?.fileName ?? (owner as any)?._sourceFile?.fileName ?? "";
    const key = name ? `${name}@${file}` : type;
    if (seen.has(key)) continue;
    seen.add(key);

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
  /** Argument for that constructor, when it requires one. */
  ctorArg?: string;
  /** Author's initialiser, relocated into the getter as a fallback. */
  defaultExpr?: string;
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
 * Whether a name reaches this file only through a type-only import.
 *
 * `import type { Team }` is erased at emit, so referencing `Team` as a value
 * produces TS1361. `Checker.resolveName` still resolves it — it answers about
 * the symbol, not about what survives emit — so the import form has to be
 * inspected directly.
 * @param sf - the file that will contain the generated reference
 * @param name - identifier to be used as a value
 * @returns true when the name is imported for types only
 */
function isTypeOnlyImport(sf: SourceFile, name: string): boolean {
  for (const statement of sf.statements) {
    if (!is.isImportDeclaration(statement)) continue;
    const clause: any = (statement as any).importClause;
    if (!clause) continue;
    const bindings = clause.namedBindings;
    if (!bindings?.elements) continue;
    for (const element of bindings.elements) {
      if (element.name?.text !== name) continue;
      if (clause.isTypeOnly || element.isTypeOnly) return true;
    }
  }
  return false;
}

/**
 * Whether every identifier a generated snippet references is usable here.
 *
 * The emit-time transformer erased types, so a printed type could name classes
 * the file never imported and nothing noticed. Generated *source* is checked,
 * so `set x(value: string | Classroom | ...)` is TS2304 when `Classroom` is not
 * in scope, and `new BinariesImpl()` is TS2304 when the file imports the public
 * alias instead of the implementation.
 *
 * Conservative on purpose: anything not clearly resolvable means the property
 * is skipped and keeps today's behaviour.
 * @param ctx - analysis context
 * @param sf - file the snippet will live in
 * @param snippet - generated text to check
 * @param location - node used for scope resolution
 * @returns true when every referenced name resolves
 */
function referencesResolve(ctx: AnalysisContext, sf: SourceFile, snippet: string, location: any): boolean {
  const skip = new Set([
    "string", "number", "boolean", "any", "unknown", "never", "void", "null", "undefined",
    "object", "symbol", "bigint", "this", "value", "readonly", "get", "set", "new", "return",
    "if", "else", "const", "instanceof", "true", "false", "Date", "Record", "Array", "Promise",
    // Injected by this generator, so not yet resolvable in the authored text.
    "WEBDA_STORAGE"
  ]);
  for (const match of snippet.matchAll(/\b[A-Z][\w$]*\b/g)) {
    const name = match[0];
    if (skip.has(name)) continue;
    // A type-only import is legitimate inside a type annotation, so the test is
    // simply whether the name means anything here at all. Value positions are
    // checked separately by the caller, where the distinction matters.
    const asValue = ctx.checker.resolveName(name, SymbolFlags.Value, location);
    const asType = ctx.checker.resolveName(name, SymbolFlags.Type, location);
    if (!asValue && !asType) return false;
  }
  return true;
}

/**
 * Smallest number of arguments the class's constructor accepts.
 * @param ctx - analysis context
 * @param className - runtime class name
 * @param location - node used for scope resolution
 * @returns the minimum arity, or undefined when it cannot be determined
 */
function requiredConstructorArity(ctx: AnalysisContext, className: string, location: any): number | undefined {
  if (!/^[A-Za-z_$][\w$]*$/.test(className)) return undefined;
  const symbol = ctx.checker.resolveName(className, SymbolFlags.Value, location);
  if (!symbol) return undefined;
  const ctorType = ctx.checker.getTypeOfSymbol(symbol);
  if (!ctorType) return undefined;
  // 1 === SignatureKind.Construct
  const arities = ctx.checker
    .getSignaturesOfType(ctorType, 1 as any)
    .map(sig => (sig as any).minArgumentCount ?? ((sig as any).parameters ?? []).length);
  return arities.length ? Math.min(...arities) : undefined;
}

/**
 * Resolve the runtime class to pass to a relation constructor.
 *
 * `ModelLink<T>` needs its target model at runtime (`new ModelLink(User)`).
 * When the property is declared on a generic class the written argument is a
 * type parameter, which does not exist at runtime — emitting it produces
 * `new ModelLink(T)` and a `ReferenceError` on first use. The type parameter's
 * default, then its constraint, is the most specific class that does exist,
 * which is the same fallback `morpher/loadparameters.ts` applies.
 *
 * Returns undefined when nothing usable is in scope as a *value*, so the caller
 * skips the property rather than generating a reference that cannot resolve.
 * @param ctx - analysis context
 * @param sf - file that will contain the generated reference
 * @param typeNode - the property's type node
 * @param location - node used for scope resolution
 * @param runtimeClass - relation class being constructed
 * @returns a class name safe to reference at runtime
 */
function runtimeTypeArgument(
  ctx: AnalysisContext,
  sf: SourceFile,
  typeNode: any,
  location: any,
  runtimeClass: string
): string | undefined {
  // Only the single-argument shape is understood. `ModelRelated<Ident, User,
  // "_user">` needs three, and guessing the rest produces TS2554; leave those
  // to keep today's behaviour instead of emitting code that will not compile.
  if (requiredConstructorArity(ctx, runtimeClass, location) !== 1) return undefined;

  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  if (!type) return undefined;

  let arg = (ctx.checker as any).getTypeArguments?.(type)?.[0];
  if (arg?.isTypeParameter?.()) {
    arg =
      (ctx.checker as any).getDefaultFromTypeParameter?.(arg) ??
      (ctx.checker as any).getConstraintOfTypeParameter?.(arg) ??
      undefined;
  }
  if (!arg) return undefined;

  const name = (arg.getSymbol?.() ?? arg.symbol)?.name;
  if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) return undefined;

  // A type-only import is erased, so the name must survive to runtime.
  if (isTypeOnlyImport(sf, name)) return undefined;
  return ctx.checker.resolveName(name, SymbolFlags.Value, location) ? name : undefined;
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
    return `readonly ${r.name}: ${r.typeText} = new ${r.runtimeClass}(${r.ctorArg ?? ""});`;
  }

  const lines: string[] = [];
  lines.push(`get ${r.name}(): ${r.typeText} {`);
  lines.push(r.defaultExpr === undefined ? `${i}  return ${slot};` : `${i}  return ${slot} ?? ${r.defaultExpr};`);
  lines.push(`${i}}`);
  lines.push(`${i}set ${r.name}(value: ${r.setterType}) {`);

  if (r.kind === "builtin") {
    lines.push(`${i}  ${slot} = value !== undefined && value !== null ? ${r.coerce!("value")} : value;`);
  } else {
    lines.push(`${i}  if (value instanceof ${r.runtimeClass}) {`);
    lines.push(`${i}    ${slot} = value;`);
    lines.push(`${i}    return;`);
    lines.push(`${i}  }`);
    lines.push(`${i}  const current: ${r.typeText} = ${slot} ?? new ${r.runtimeClass}(${r.ctorArg ?? ""});`);
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
            // An initialiser is preserved by moving it into the getter as a
            // fallback. The observable trade-off is that an explicit
            // `undefined` now reads back as the default.
            const initializer = (m as any).initializer;
            const defaultExpr = initializer ? ctx.textOf(sf, initializer) : undefined;

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
                defaultExpr,
                start, end: m.end, indent
              };
            } else {
              const runtimeClass = resolveRuntimeClass(ctx, m.type);
              if (runtimeClass === RELATION_CONTAINER) {
                // An author-written initialiser wins for a readonly field.
                if (defaultExpr !== undefined) continue;
                let ctorArg: string | undefined;
                if (!zeroArgConstructible(ctx, runtimeClass, m)) {
                  ctorArg = runtimeTypeArgument(ctx, sf, m.type, m, runtimeClass);
                  if (!ctorArg) continue;
                }
                resolved = {
                  name, typeText, kind: "relation-initializer",
                  runtimeClass, ctorArg, start, end: m.end, indent
                };
              } else {
                const param = autoSetterParamType(ctx, m.type);
                if (param && runtimeClass) {
                  let ctorArg: string | undefined;
                  if (!zeroArgConstructible(ctx, runtimeClass, m)) {
                    ctorArg = runtimeTypeArgument(ctx, sf, m.type, m, runtimeClass);
                    if (!ctorArg) continue;
                  }
                  resolved = {
                    name, typeText, kind: "set-method",
                    setterType: `${param} | ${typeText}`,
                    runtimeClass, ctorArg, defaultExpr,
                    start, end: m.end, indent
                  };
                }
              }
            }

            if (!resolved) continue;
            const rendered = render(resolved);
            // Everything the generated members mention must exist here...
            if (!referencesResolve(ctx, sf, rendered, m)) continue;
            // ...and the runtime class is used with `new` and `instanceof`, so
            // it must survive emit rather than merely be known to the checker.
            if (
              resolved.runtimeClass &&
              (isTypeOnlyImport(sf, resolved.runtimeClass) ||
                !ctx.checker.resolveName(resolved.runtimeClass, SymbolFlags.Value, m))
            ) {
              continue;
            }
            if (resolved.kind !== "relation-initializer") needsStorage = true;
            edits.push({ start, end: m.end, text: rendered, source: "accessors" });
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
