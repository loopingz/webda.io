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
        fileName: sf.fileName
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
