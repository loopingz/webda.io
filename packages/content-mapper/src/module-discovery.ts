/**
 * Webda object discovery on the TypeScript 7 API.
 *
 * The first half of `@webda/compiler`'s module generator: find every model,
 * modda, bean and deployer in a project, work out which section it belongs to,
 * and compute the `Import` string recorded in `webda.module.json`.
 *
 * Schema generation is deliberately not here. It runs through `@webda/schema`,
 * which still builds its own language service, and that is a separate port. The
 * point of splitting is that everything in this file can be checked against the
 * committed `webda.module.json` byte for byte, which is stronger evidence than
 * a passing test.
 *
 * Classification follows `module.ts`: the base-type chain is walked and each
 * link is attributed to the npm package that declares it, so `Model` from
 * `@webda/models` is distinguished from any local class of the same name.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import * as is from "typescript/unstable/ast/is";
import type { AnalysisContext } from "./plan.ts";

/** Sections recorded in `webda.module.json`. */
export type Section = "models" | "moddas" | "deployers" | "beans";

/** Structural metadata recorded for a model. */
export interface ModelMetadata {
  /** Namespaced name, repeated as the entry's own identifier. */
  Identifier: string;
  /** Pluralised display name. */
  Plural: string;
  /** Namespaced ancestors, nearest first. */
  Ancestors: string[];
  /** Namespaced direct subclasses. */
  Subclasses: string[];
  /** Attributes forming the primary key. */
  PrimaryKey: string[];
}

/** One discovered Webda object. */
export interface DiscoveredObject {
  /** Namespaced name, as used for the section key. */
  name: string;
  /** Exported identifier. */
  exportName: string;
  /** Section it belongs to. */
  section: Section;
  /** `Import` value: output path without extension, then `:export`. */
  importTarget: string;
  /** File declaring it. */
  fileName: string;
  /** Name of the class as written, before any @Webda* tag renaming. */
  className: string;
  /** Names of the classes it derives from, nearest first. */
  baseNames: string[];
  /** Primary key attributes, when declared. */
  primaryKey: string[];
}

/** Discovery options. */
export interface DiscoveryOptions {
  /** Application root, used to relativise output paths. */
  appPath: string;
  /** Source root. */
  rootDir: string;
  /** Output root. */
  outDir: string;
  /** Namespace prefix applied to unqualified names. */
  namespace?: string;
}

/** Cache of directory to owning package name. */
const packageNameCache = new Map<string, string | undefined>();

/**
 * Name of the npm package that owns a file.
 *
 * Walks up to the nearest `package.json`, matching `getPackageFromType`.
 * @param fileName - file to attribute
 * @returns the package name, when one is found
 */
function packageOf(fileName: string): string | undefined {
  let folder = dirname(fileName);
  while (folder.length > 2) {
    if (packageNameCache.has(folder)) return packageNameCache.get(folder);
    const manifest = join(folder, "package.json");
    if (existsSync(manifest)) {
      let name: string | undefined;
      try {
        name = JSON.parse(readFileSync(manifest, "utf8")).name;
      } catch {
        name = undefined;
      }
      packageNameCache.set(folder, name);
      return name;
    }
    const parent = dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return undefined;
}

/**
 * The declared type of a class, and every type it derives from.
 *
 * Each base is re-resolved through its symbol: `getBaseTypes()` returns
 * instantiated references whose own bases are empty, so a generic link
 * otherwise terminates the walk.
 * @param ctx - analysis context
 * @param cls - the class declaration
 * @returns the type chain, nearest first
 */
function classTree(ctx: AnalysisContext, cls: any): any[] {
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (!declared) return [];

  const chain: any[] = [];
  const seen = new Set<string>();
  let current: any = declared;
  while (current && chain.length < 64) {
    chain.push(current);
    const currentSymbol = current.getSymbol?.() ?? current.symbol;
    const name = currentSymbol?.name;
    if (name) {
      // Keyed by declaration, not name: `class User extends User` (a local
      // model extending `@webda/core`'s) is ordinary, and a name-only guard
      // stops the walk before it reaches Model.
      const declaration = currentSymbol.valueDeclaration ?? currentSymbol.declarations?.[0];
      const owner = declaration?.resolve(ctx.project);
      const file = (owner as any)?.getSourceFile?.()?.fileName ?? (owner as any)?._sourceFile?.fileName ?? "";
      const key = `${name}@${file}`;
      if (seen.has(key)) break;
      seen.add(key);
    }
    const resolved = currentSymbol ? (ctx.checker.getDeclaredTypeOfSymbol(currentSymbol) ?? current) : current;
    current = (resolved.getBaseTypes?.() ?? current.getBaseTypes?.() ?? [])[0];
  }
  return chain;
}

/**
 * Whether a type chain contains a given class from a given package.
 * @param ctx - analysis context
 * @param chain - the type chain
 * @param packageName - owning npm package
 * @param symbolName - class name
 * @returns true on a match
 */
function chainExtends(ctx: AnalysisContext, chain: any[], packageName: string, symbolName: string): boolean {
  for (const type of chain) {
    const symbol = type.getSymbol?.() ?? type.symbol;
    if (symbol?.name !== symbolName) continue;
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    const node = declaration?.resolve(ctx.project);
    const owner = (node as any)?.getSourceFile?.() ?? (node as any)?._sourceFile;
    if (owner?.fileName && packageOf(owner.fileName) === packageName) return true;
  }
  return false;
}

/**
 * JSDoc tags on a node, by name.
 * @param ctx - analysis context
 * @param sf - containing file
 * @param node - the node
 * @returns tag name to value
 */
function tagsOf(ctx: AnalysisContext, sf: any, node: any): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const match of ctx.triviaOf(sf, node).matchAll(/@(Webda[A-Za-z]*)\s*([^\s*]*)/g)) {
    tags[match[1]] = match[2] ?? "";
  }
  return tags;
}

/**
 * Output path for a source file, without extension.
 *
 * Mirrors `ts.getOutputFileNames` for the common `rootDir`/`outDir` layout.
 * @param fileName - the source file
 * @param options - discovery options
 * @returns path relative to the application root
 */
function outputTarget(fileName: string, options: DiscoveryOptions): string {
  const fromRoot = relative(options.rootDir, fileName);
  return relative(options.appPath, join(options.outDir, fromRoot)).replace(/\.tsx?$/, "");
}

/**
 * The name a class is exported under, if any.
 *
 * Mirrors `getExportedName`: a `default` modifier records `"default"` rather
 * than the class name, and a class with no export modifier may still be
 * re-exported by a later `export { X }` — `webda.module.json` records the alias
 * in both cases, so the `Import` string is wrong without this.
 * @param ctx - analysis context
 * @param sf - containing file
 * @param cls - the class declaration
 * @returns the exported name, or undefined when not exported
 */
function exportedName(ctx: AnalysisContext, sf: any, cls: any): string | undefined {
  const className = cls.name?.text;
  if (!className) return undefined;

  const modifiers = cls.modifiers ?? [];
  // 95 === ExportKeyword, 90 === DefaultKeyword
  const hasExport = modifiers.some((modifier: any) => /^export$/.test(ctx.textOf(sf, modifier)));
  if (hasExport) {
    return modifiers.some((modifier: any) => /^default$/.test(ctx.textOf(sf, modifier))) ? "default" : className;
  }

  for (const statement of sf.statements) {
    if (!is.isExportDeclaration(statement)) continue;
    for (const element of (statement as any).exportClause?.elements ?? []) {
      const local = element.propertyName?.text ?? element.name?.text;
      if (local === className) return element.name?.text ?? className;
    }
  }
  return undefined;
}

/**
 * Discover every Webda object in the project.
 * @param ctx - analysis context
 * @param options - discovery options
 * @returns discovered objects, ordered by section then name
 */
export function discoverWebdaObjects(ctx: AnalysisContext, options: DiscoveryOptions): DiscoveredObject[] {
  const found: DiscoveredObject[] = [];

  for (const sf of ctx.sourceFiles) {
    if (sf.fileName.endsWith(".spec.ts")) continue;

    for (const statement of sf.statements) {
      if (!is.isClassDeclaration(statement)) continue;
      const cls: any = statement;
      if (!cls.name) continue;

      const chain = classTree(ctx, cls);
      if (!chain.length) continue;
      const tags = tagsOf(ctx, sf, cls);
      // Opt-out marker used by test fixtures and deliberately unregistered
      // classes; without it they surface as extra module entries.
      if (tags.WebdaIgnore !== undefined) continue;

      let section: Section | undefined;
      if (chainExtends(ctx, chain, "@webda/models", "Model")) {
        section = "models";
      } else if (tags.WebdaModda !== undefined) {
        if (!chainExtends(ctx, chain, "@webda/core", "Service")) continue;
        section = "moddas";
      } else if (tags.WebdaDeployer !== undefined) {
        if (!chainExtends(ctx, chain, "@webda/core", "AbstractDeployer")) continue;
        section = "deployers";
      } else if (chainExtends(ctx, chain, "@webda/core", "Service")) {
        // Beans are Services carrying the @Bean decorator.
        const decorated = cls.modifiers?.some(
          (modifier: any) => modifier.kind === 171 && /(^|\W)Bean(\W|$)/.test(ctx.textOf(sf, modifier))
        );
        if (!decorated) continue;
        section = "beans";
      } else {
        continue;
      }

      const exportName = exportedName(ctx, sf, cls);
      if (!exportName) continue;
      const tagName =
        tags[`Webda${section.slice(0, 1).toUpperCase()}${section.slice(1, section.length - 1)}`] || undefined;
      const bare = tagName && tagName.length ? tagName : cls.name.text;
      const name = bare.includes("/") ? bare : options.namespace ? `${options.namespace}/${bare}` : bare;

      found.push({
        name,
        exportName,
        section,
        importTarget: `${outputTarget(sf.fileName, options)}:${exportName}`,
        fileName: sf.fileName,
        className: cls.name.text,
        baseNames: chain.slice(1).map((type: any) => (type.getSymbol?.() ?? type.symbol)?.name).filter(Boolean),
        primaryKey: primaryKeyOfChain(ctx, sf, cls, chain)
      });
    }
  }

  found.sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));

  // Two classes can resolve to the same namespaced name — `@webda/core` has
  // AuditEntry in both models/ and services/. Keep the first in sorted order so
  // the result does not depend on program file ordering.
  const unique: DiscoveredObject[] = [];
  const claimed = new Set<string>();
  for (const object of found) {
    const key = `${object.section}:${object.name}`;
    if (claimed.has(key)) continue;
    claimed.add(key);
    unique.push(object);
  }
  return unique;
}

/**
 * Primary key attributes declared on a model.
 *
 * Recognises the two forms `@webda/core` uses: a `readonly ["uuid"]` type
 * annotation and an `= ["uuid"] as const` initialiser, both keyed by the
 * `WEBDA_PRIMARY_KEY` symbol.
 * @param ctx - analysis context
 * @param sf - containing file
 * @param cls - the class declaration
 * @returns key attribute names
 */
function primaryKeyOf(ctx: AnalysisContext, sf: any, cls: any): string[] {
  for (const member of cls.members ?? []) {
    const name = (member as any).name;
    if (!name || !/WEBDA_PRIMARY_KEY/.test(ctx.textOf(sf, name))) continue;
    const text = ctx.textOf(sf, member);
    const keys = [...text.matchAll(/["']([A-Za-z_$][\w$]*)["']/g)].map(match => match[1]);
    if (keys.length) return keys;
  }
  return [];
}

/**
 * Primary key for a class, inherited when it declares none.
 *
 * `UuidModel` declares `["uuid"]` and every subclass inherits it, including
 * across package boundaries — a sample-app model inherits from `@webda/models`.
 * Looking only at the class's own members reports an empty key for all of them.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @param chain - the class's type chain, nearest first
 * @returns key attribute names
 */
function primaryKeyOfChain(ctx: AnalysisContext, sf: any, cls: any, chain: any[]): string[] {
  const own = primaryKeyOf(ctx, sf, cls);
  if (own.length) return own;

  for (const type of chain.slice(1)) {
    const symbol = type.getSymbol?.() ?? type.symbol;
    const declaration = symbol?.valueDeclaration ?? symbol?.declarations?.[0];
    const node = declaration?.resolve(ctx.project);
    if (!node) continue;
    const owner = (node as any).getSourceFile?.() ?? (node as any)._sourceFile;
    if (!owner) continue;
    const inherited = primaryKeyOf(ctx, owner, node);
    if (inherited.length) return inherited;
  }
  return [];
}

/**
 * Build the structural half of each model's `webda.module.json` entry.
 *
 * Ancestors and subclasses are resolved among the discovered models, so they
 * carry namespaced names rather than raw class names.
 * @param objects - discovered objects
 * @param plural - pluralisation function, supplied by the host
 * @returns metadata per model name
 */
export function buildModelMetadata(
  objects: DiscoveredObject[],
  plural: (name: string) => string
): Record<string, ModelMetadata> {
  const models = objects.filter(object => object.section === "models");
  const byClassName = new Map<string, DiscoveredObject>();
  for (const model of models) byClassName.set(model.className, model);

  const result: Record<string, ModelMetadata> = {};
  for (const model of models) {
    const ancestors: string[] = [];
    for (const base of model.baseNames) {
      const ancestor = byClassName.get(base);
      // Bases outside the discovered set — `Model` itself, or a class from a
      // dependency — are not module entries and are not recorded.
      if (ancestor && ancestor.name !== model.name) ancestors.push(ancestor.name);
    }

    result[model.name] = {
      Identifier: model.name,
      Plural: plural(model.name.split("/").pop() ?? model.name),
      Ancestors: ancestors,
      Subclasses: [],
      PrimaryKey: model.primaryKey
    };
  }

  // Subclasses are the inverse of the immediate ancestor relation.
  for (const model of models) {
    const immediate = model.baseNames.map(base => byClassName.get(base)).find(Boolean);
    if (immediate && immediate.name !== model.name) {
      result[immediate.name]?.Subclasses.push(model.name);
    }
  }
  for (const entry of Object.values(result)) entry.Subclasses.sort();

  return result;
}

/** One reflected attribute. */
export interface ReflectedAttribute {
  /** Type as written in the source. */
  type: string;
  /** Resolved type arguments, when the type is generic. */
  typeParameters?: string[];
}

/**
 * Reflect a model's attributes, as `webda.module.json` records them.
 *
 * The recorded type is the *written* text rather than a resolved type: an
 * inline object literal appears verbatim, comments and all. Generic types are
 * the exception — their arguments are resolved through the checker so a type
 * parameter is reported as its constraint.
 *
 * Properties keyed by a symbol, carrying `@ignore`, or marked not-enumerable
 * are excluded, matching the original.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @returns attribute name to reflected type
 */
export function reflectAttributes(ctx: AnalysisContext, sf: any, cls: any): Record<string, ReflectedAttribute> {
  const reflection: Record<string, ReflectedAttribute> = {};

  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (!declared) return reflection;

  // Properties of the *type*, so inherited attributes are included — `uuid`
  // comes from UuidModel and is recorded on every subclass.
  for (const property of (declared as any).getProperties?.() ?? []) {
    const name = property.name;
    // Symbol-keyed slots surface as `__@WEBDA_STORAGE@123`. Ordinary
    // double-underscore attributes such as `__password` are real and recorded.
    if (typeof name !== "string" || name.startsWith("__@")) continue;

    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const member = declaration?.resolve(ctx.project);
    if (!member || !is.isPropertyDeclaration(member)) continue;

    const owner = (member as any).getSourceFile?.() ?? (member as any)._sourceFile ?? sf;
    const nameNode = (member as any).name;
    if (nameNode && is.isComputedPropertyName(nameNode)) continue;

    if (/@ignore\b/.test(ctx.triviaOf(owner, member))) continue;
    if ((member as any).modifiers?.some((modifier: any) => /NotEnumerable/.test(ctx.textOf(owner, modifier)))) continue;

    const typeNode = (member as any).type;
    if (!typeNode) {
      reflection[name] = { type: "any" };
      continue;
    }

    const typeArguments = (typeNode as any).typeArguments;
    if (is.isTypeReferenceNode(typeNode) && typeArguments?.length) {
      reflection[name] = {
        type: ctx.textOf(owner, (typeNode as any).typeName),
        typeParameters: typeArguments.map((argument: any) => {
          const type = ctx.checker.getTypeAtLocation(argument);
          return ctx.checker.typeToString(constraintOf(ctx, type) ?? type);
        })
      };
      continue;
    }

    const text = ctx.textOf(owner, typeNode);
    reflection[name] = text.endsWith("[]")
      ? { type: "Array", typeParameters: [text.slice(0, -2)] }
      : { type: text };
  }

  return reflection;
}

/**
 * Constraint of a type parameter, or undefined for anything else.
 *
 * `getConstraintOfTypeParameter` throws when the type is not a parameter or has
 * no constraint, rather than returning undefined, so it has to be guarded.
 * @param ctx - analysis context
 * @param type - the type to inspect
 * @returns the constraint, when there is one
 */
function constraintOf(ctx: AnalysisContext, type: any): any {
  if (!type?.isTypeParameter?.()) return undefined;
  try {
    return (ctx.checker as any).getConstraintOfTypeParameter?.(type);
  } catch {
    return undefined;
  }
}

/** Relations recorded for a model. */
export interface ModelRelations {
  /** Owning model, from a `ModelParent<T>` attribute. */
  parent?: { attribute: string; model: string };
  /**
   * Outgoing links, from the `ModelLink*` family.
   *
   * `model` is absent when the target is a type parameter, as on a generic
   * base class — the link is still real and is recorded without it.
   */
  links?: { attribute: string; model?: string; type: string }[];
  /** Reverse lookups, from `ModelRelated<T, U, "attr">`. */
  queries?: { attribute: string; model: string; targetAttribute: string }[];
  /** Behaviour-typed attributes. */
  behaviors?: { attribute: string; behavior: string }[];
}

/** `ModelLink*` type names and the link kind each records. */
const LINK_KINDS: Record<string, string> = {
  ModelLink: "LINK",
  ModelLinksMap: "LINKS_MAP",
  ModelLinksArray: "LINKS_ARRAY",
  ModelLinksSimpleArray: "LINKS_SIMPLE_ARRAY"
};

/**
 * Build a model's `Relations` entry.
 *
 * Relation kinds are recognised by the written type name — `ModelParent`,
 * `ModelRelated`, the `ModelLink*` family — and the referenced model is
 * resolved to its namespaced identifier so the graph is expressed in module
 * terms rather than class names.
 * @param ctx - analysis context
 * @param sf - file declaring the class
 * @param cls - the class declaration
 * @param resolveModelId - maps a class name to its namespaced identifier
 * @returns the relations, omitting empty groups
 */
export function buildRelations(
  ctx: AnalysisContext,
  sf: any,
  cls: any,
  resolveModelId: (className: string) => string | undefined
): ModelRelations {
  const relations: ModelRelations = {};

  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (!declared) return relations;

  for (const property of (declared as any).getProperties?.() ?? []) {
    const attribute = property.name;
    if (typeof attribute !== "string" || attribute.startsWith("__@")) continue;

    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    const member = declaration?.resolve(ctx.project);
    if (!member || !is.isPropertyDeclaration(member)) continue;

    const owner = (member as any).getSourceFile?.() ?? (member as any)._sourceFile ?? sf;
    const typeNode = (member as any).type;
    if (!typeNode || !is.isTypeReferenceNode(typeNode)) continue;

    const typeName = ctx.textOf(owner, (typeNode as any).typeName);
    const typeArguments = (typeNode as any).typeArguments ?? [];
    if (!typeArguments.length) continue;

    const targetName = symbolNameOfTypeNode(ctx, typeArguments[0]);
    const model = targetName ? resolveModelId(targetName) : undefined;

    // `ModelLink<T>` on a generic base has no resolvable target. The relation
    // still exists and is recorded, simply without a `model` — dropping it
    // loses the link entirely.
    if (typeName === "ModelParent") {
      if (!model) continue;
      relations.parent = { attribute, model };
    } else if (typeName === "ModelRelated") {
      if (!model) continue;
      relations.queries ??= [];
      relations.queries.push({
        attribute,
        model,
        targetAttribute: ctx.textOf(owner, typeArguments[1]).replace(/"/g, "")
      });
    } else if (LINK_KINDS[typeName]) {
      relations.links ??= [];
      relations.links.push({
        attribute,
        ...(model ? { model } : {}),
        type: LINK_KINDS[typeName]
      });
    }
  }

  return relations;
}

/**
 * Class name a type node refers to.
 * @param ctx - analysis context
 * @param typeNode - the type node
 * @returns the referenced symbol's name
 */
function symbolNameOfTypeNode(ctx: AnalysisContext, typeNode: any): string | undefined {
  const type = ctx.checker.getTypeFromTypeNode(typeNode);
  const symbol = type?.getSymbol?.() ?? (type as any)?.symbol;
  const name = symbol?.name;
  if (name !== "default") return name;

  // `export default class Contact` has the symbol name "default"; the class
  // name is what the module graph is keyed by.
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
  const node = declaration?.resolve(ctx.project);
  return (node as any)?.name?.text ?? name;
}
