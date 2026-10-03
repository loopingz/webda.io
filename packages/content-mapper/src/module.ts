/**
 * The whole `webda.module.json`, generated on the TypeScript 7.1 API.
 *
 * A port of `@webda/compiler`'s `ModuleGenerator.generate()` and its metadata
 * plugins (`metadata/*.ts`). The target is byte identity with the artefact the
 * TypeScript 6 generator writes, so key order is reproduced as carefully as
 * the values: `beans`, `deployers`, `moddas` and `models` are key-sorted with
 * the default code-unit sort (`JSONUtils.sortObject`), every other map keeps
 * insertion order, and insertion order follows the TypeScript 6 program walk.
 *
 * Discovery, reflection and the schemas are not reimplemented here — they
 * come from `module-discovery.ts` and `schema/*.ts`. What this file adds is
 * the remaining metadata (Relations, Ancestors, Subclasses, Actions, Events,
 * PrimaryKey, Plural, behaviours, commands, capabilities, Configuration) and
 * the assembly.
 *
 * `sourceDigest` is deliberately absent: it hashes the project's sources and
 * is computed by the TypeScript 6 compiler, which owns the file on disk.
 */
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ClassDeclaration, MethodDeclaration, Node, SourceFile } from "typescript/unstable/ast";
import { getJSDocTags, getTextOfJSDocComment, SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { SymbolFlags } from "typescript/unstable/sync";
import type { Symbol as TsSymbol, Type } from "typescript/unstable/sync";
import {
  classTree,
  discoverWebdaObjects,
  exportedName,
  outputTarget,
  packageOf,
  reflectAttributes,
  type DiscoveredObject,
  type DiscoveryOptions,
  type ReflectedAttribute,
  type Section
} from "./module-discovery.ts";
import type { AnalysisContext } from "./plan.ts";
import { classPropertiesInTs6Order, ts6PropertyOrder } from "./property-order.ts";
import { generateModelSchemas } from "./schema/model.ts";
import { generateTopLevelSchemas } from "./schema/project.ts";
import { findParametersNode, generateServiceSchema } from "./schema/service.ts";
import type { JSONSchema7 } from "./schema/types.ts";

/** Value of `$schema` in every generated module. */
export const WEBDA_MODULE_SCHEMA = "https://webda.io/schemas/webda.module.v4.json";

/** One `@Command` argument. */
export interface CommandArgDefinition {
  type: "string" | "number" | "boolean";
  required?: boolean;
  default?: string | number | boolean;
  alias?: string;
  description?: string;
  deprecated?: string;
}

/** One `@Command` / `@BuildCommand`. */
export interface CommandDefinition {
  description: string;
  method: string;
  args: Record<string, CommandArgDefinition>;
  requires?: string[];
  phase?: "resolved" | "initialized";
}

/** A modda, bean or deployer entry. */
export interface ServiceEntry {
  Import: string;
  Schema: JSONSchema7;
  Configuration?: string;
  capabilities?: string[];
  commands?: Record<string, CommandDefinition>;
}

/** Relations recorded for a model, in TypeScript 6 insertion order. */
export interface ModuleRelations {
  parent?: { attribute: string; model?: string };
  links?: { attribute: string; model?: string; type: string }[];
  queries?: { attribute: string; model?: string; targetAttribute?: string }[];
  maps?: { attribute: string; cascadeDelete: boolean; model?: string; targetLink: string; targetAttributes: string[] }[];
  behaviors?: { attribute: string; behavior: string }[];
}

/** A model entry. */
export interface ModelEntry {
  Plural: string;
  Import: string;
  Relations: ModuleRelations;
  Ancestors: string[];
  Subclasses: string[];
  Reflection: Record<string, ReflectedAttribute>;
  Schemas: Record<string, JSONSchema7>;
  Actions: Record<string, Record<string, unknown>>;
  Events: string[];
  PrimaryKey: string[];
  Identifier: string;
}

/** A behaviour entry. */
export interface BehaviorEntry {
  Identifier: string;
  Import: string;
  Actions: Record<string, Record<string, unknown>>;
}

/** `webda.module.json`, without `sourceDigest`. */
export interface WebdaModuleJson {
  $schema: string;
  beans: Record<string, ServiceEntry>;
  deployers: Record<string, ServiceEntry>;
  moddas: Record<string, ServiceEntry>;
  models: Record<string, ModelEntry>;
  schemas: Record<string, JSONSchema7>;
  behaviors: Record<string, BehaviorEntry>;
  capabilities?: Record<string, string>;
}

/** A Webda class declared in a file that does not follow the naming convention. */
export interface NamingViolation {
  /** Absolute path of the offending source file. */
  fileName: string;
  /** Class that triggered the requirement. */
  className: string;
  /** Section it was classified into. */
  section: string;
  /** Suffix the file is required to carry. */
  expectedSuffix: string;
}

/** Options for {@link generateWebdaModule}. */
export interface ModuleOptions {
  /** Application root. */
  appPath: string;
  /** Source root; defaults to the tsconfig `rootDir`, else `<appPath>/src`. */
  rootDir?: string;
  /** Output root; defaults to the tsconfig `outDir`, else `<appPath>/lib`. */
  outDir?: string;
  /** Namespace prefix applied to unqualified names. */
  namespace?: string;
  /**
   * Top-level `capabilities`. Defaults to `webda.capabilities` from the
   * application's `package.json`.
   */
  capabilities?: Record<string, string>;
}

/** What {@link generateWebdaModule} returns. */
export interface ModuleResult {
  /** The module, ready to serialise. */
  module: WebdaModuleJson;
  /** Files the content mapper cannot claim; the caller decides how loud to be. */
  namingViolations: NamingViolation[];
  /**
   * Problems the TypeScript 6 generator would have thrown on — an unresolved
   * parent or query model, an unconvertible schema. Reported rather than
   * thrown so the rest of the module is still inspectable.
   */
  errors: string[];
}

/** Suffixes the content mapper is registered for. */
const MAPPED_SUFFIXES = [".model.ts", ".service.ts"];

/** Suffix suggested for a section when a file has none of {@link MAPPED_SUFFIXES}. */
const SECTION_SUFFIX: Record<string, string> = {
  models: ".model.ts",
  moddas: ".service.ts",
  beans: ".service.ts",
  deployers: ".service.ts"
};

/**
 * Plural of an English noun, as `@webda/compiler`'s `getPlural`.
 *
 * https://www.teflcourse.net/english-grammar-corner/changing-nouns-from-singular-to-plural/
 * @param name - the singular noun
 * @returns the pluralized form
 */
export function getPlural(name: string): string {
  const isVowel = (char: string) => "aeiouy".includes(char.toLowerCase());
  if (name.endsWith("y")) {
    if (isVowel(name.charAt(name.length - 2))) return name + "s";
    return name.substring(0, name.length - 1) + "ies";
  }
  if (name.endsWith("fe")) return name.substring(0, name.length - 2) + "ves";
  if (name.endsWith("f")) return name.substring(0, name.length - 1) + "ves";
  if (name.endsWith("on")) return name.substring(0, name.length - 2) + "a";
  if (name.endsWith("is")) return name.substring(0, name.length - 2) + "es";
  if (name.endsWith("man")) return name.substring(0, name.length - 3) + "men";
  if (
    name.endsWith("s") ||
    name.endsWith("ss") ||
    name.endsWith("sh") ||
    name.endsWith("ch") ||
    name.endsWith("x") ||
    name.endsWith("z") ||
    name.endsWith("o")
  ) {
    return name + "es";
  }
  return name + "s";
}

/**
 * `JSONUtils.sortObject`: keys in default (code unit) order, entries the
 * transformer maps to a falsy value dropped.
 * @param unordered - the map
 * @param transformer - value mapper
 * @returns the sorted map
 */
export function sortObject<T, U = T>(unordered: Record<string, T>, transformer: (value: T) => U = v => v as any) {
  const sorted: Record<string, U> = {};
  for (const key of Object.keys(unordered).sort()) {
    const value = transformer(unordered[key]);
    if (!value) continue;
    sorted[key] = value;
  }
  return sorted;
}

/**
 * Text of a node, as `Node.getText()`.
 * @param ctx - analysis context
 * @param node - the node
 * @returns the source text
 */
function text(ctx: AnalysisContext, node: Node): string {
  return ctx.textOf(sourceFileOf(node), node);
}

/**
 * The source file a node belongs to.
 * @param node - the node
 * @returns its file
 */
function sourceFileOf(node: Node): SourceFile {
  const direct = (node as any).getSourceFile?.() ?? (node as any)._sourceFile;
  if (direct) return direct;
  let current: Node | undefined = node;
  while (current && current.kind !== SyntaxKind.SourceFile) current = current.parent;
  return current as SourceFile;
}

/**
 * Decorators on a node, from its `modifiers`.
 * @param node - a class element or class
 * @returns the decorator nodes
 */
function decoratorsOf(node: Node): any[] {
  return ((node as any).modifiers ?? []).filter((modifier: Node) => modifier.kind === SyntaxKind.Decorator);
}

/**
 * Decorator name, for both `@Name` and `@Name()`, as `getDecoratorName`.
 * @param ctx - analysis context
 * @param decorator - the decorator
 * @returns the name, when the expression is an identifier or a call on one
 */
function decoratorName(ctx: AnalysisContext, decorator: any): string | undefined {
  const expression = decorator.expression;
  if (is.isCallExpression(expression) && is.isIdentifier((expression as any).expression)) {
    return text(ctx, (expression as any).expression);
  }
  if (is.isIdentifier(expression)) return text(ctx, expression);
  return undefined;
}

/**
 * Whether a method carries `@Action` or `@Operation`.
 * @param ctx - analysis context
 * @param method - the method
 * @returns true when decorated
 */
function hasOperationDecorator(ctx: AnalysisContext, method: Node): boolean {
  return decoratorsOf(method).some(decorator => {
    const name = decoratorName(ctx, decorator);
    return name === "Action" || name === "Operation";
  });
}

/**
 * Whether a node carries the `static` keyword.
 * @param node - the node
 * @returns true when static
 */
function isStaticMember(node: Node): boolean {
  return ((node as any).modifiers ?? []).some((modifier: Node) => modifier.kind === SyntaxKind.StaticKeyword);
}

/**
 * The first `@tagName` JSDoc tag on a node.
 * @param node - the declaration
 * @param tagName - tag to find
 * @returns the tag
 */
function findTag(node: Node, tagName: string): any {
  try {
    return getJSDocTags(node).find(tag => tag.tagName.text === tagName);
  } catch {
    return undefined;
  }
}

/**
 * `getTagsName`: every `Webda*` tag, valued by the first token of its payload
 * or the class name.
 * @param node - the declaration
 * @returns tag name to value
 */
function webdaTags(node: Node): Record<string, string> {
  const tags: Record<string, string> = {};
  let found: readonly any[] = [];
  try {
    found = getJSDocTags(node);
  } catch {
    found = [];
  }
  for (const tag of found) {
    const name: string = tag.tagName.text;
    if (name.startsWith("Webda")) {
      tags[name] =
        (getTextOfJSDocComment(tag.comment) ?? "").trim().replace("\n", " ").split(" ").shift() ||
        (node as any).name?.text;
    } else if (name.startsWith("Schema")) {
      tags[name] = (getTextOfJSDocComment(tag.comment) ?? "").trim();
    }
  }
  return tags;
}

/**
 * Follow an alias to its target.
 * @param ctx - analysis context
 * @param symbol - the symbol
 * @returns the resolved symbol
 */
function resolveAlias(ctx: AnalysisContext, symbol: TsSymbol | undefined): TsSymbol | undefined {
  if (!symbol) return symbol;
  if (!(symbol.flags & SymbolFlags.Alias)) return symbol;
  try {
    return ctx.checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

/**
 * Resolved declaration nodes of a symbol.
 * @param ctx - analysis context
 * @param symbol - the symbol
 * @returns the declarations
 */
function declarationsOf(ctx: AnalysisContext, symbol: TsSymbol | undefined): Node[] {
  const nodes: Node[] = [];
  for (const handle of symbol?.declarations ?? []) {
    const node = handle.resolve(ctx.project);
    if (node) nodes.push(node);
  }
  return nodes;
}

/**
 * Resolved value declaration of a symbol.
 * @param ctx - analysis context
 * @param symbol - the symbol
 * @returns the declaration
 */
function valueDeclarationOf(ctx: AnalysisContext, symbol: TsSymbol | undefined): Node | undefined {
  return symbol?.valueDeclaration?.resolve(ctx.project) ?? undefined;
}

/**
 * `propertyIsKeyedBySymbol`: whether a property is declared `[key]` with
 * `key` the named `unique symbol` exported by `packageName`.
 * @param ctx - analysis context
 * @param property - the property symbol
 * @param packageName - package declaring the key
 * @param symbolName - name of the key
 * @returns true on a match
 */
function propertyIsKeyedBySymbol(
  ctx: AnalysisContext,
  property: TsSymbol,
  packageName: string,
  symbolName: string
): boolean {
  // Cheap pre-filter: symbol-keyed members are named `__@<name>@<id>`.
  if (!property.name.startsWith(`__@${symbolName}@`)) return false;
  for (const declaration of declarationsOf(ctx, property)) {
    const name = (declaration as any).name;
    if (!name || !is.isComputedPropertyName(name)) continue;
    const key = resolveAlias(ctx, ctx.checker.getSymbolAtLocation((name as any).expression));
    if (!key || key.name !== symbolName) continue;
    const keyDeclaration = valueDeclarationOf(ctx, key);
    const file = keyDeclaration ? sourceFileOf(keyDeclaration)?.fileName : undefined;
    if (file && packageOf(file) === packageName) return true;
  }
  return false;
}

/**
 * Declared (instance) type of a class.
 * @param ctx - analysis context
 * @param cls - the class declaration
 * @returns the type
 */
function declaredTypeOf(ctx: AnalysisContext, cls: ClassDeclaration): Type | undefined {
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  return symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
}

/**
 * Properties of a class's instance type, inherited ones included.
 * @param ctx - analysis context
 * @param cls - the class declaration
 * @returns the property symbols
 */
function propertiesOf(ctx: AnalysisContext, cls: ClassDeclaration): readonly TsSymbol[] {
  return classPropertiesInTs6Order(ctx, cls);
}

/**
 * Names of the properties of a symbol-keyed member's type — the `Events` of
 * `[WEBDA_EVENTS]` or the declarative `Actions` of `[WEBDA_ACTIONS]`.
 * @param ctx - analysis context
 * @param property - the member
 * @returns property names in declaration order
 */
function memberTypeKeys(ctx: AnalysisContext, property: TsSymbol): string[] {
  const location = valueDeclarationOf(ctx, property);
  const type = location
    ? ctx.checker.getTypeOfSymbolAtLocation(property, location)
    : ctx.checker.getTypeOfSymbol(property);
  const keys: Record<string, true> = {};
  for (const member of ts6PropertyOrder(ctx, type, ctx.checker.getPropertiesOfType(type))) keys[member.name] = true;
  return Object.keys(keys);
}

/**
 * Read the string-literal options of an `@Action`/`@Operation` decorator.
 * @param ctx - analysis context
 * @param method - the method
 * @param onProperty - receives each `key: value` property assignment
 */
function forEachOperationOption(
  ctx: AnalysisContext,
  method: Node,
  onProperty: (key: string, initializer: any) => void
): void {
  const decorator = decoratorsOf(method).find(candidate => {
    const name = decoratorName(ctx, candidate);
    return name === "Action" || name === "Operation";
  });
  if (!decorator || !is.isCallExpression(decorator.expression)) return;
  const argument = (decorator.expression as any).arguments?.[0];
  if (!argument || !is.isObjectLiteralExpression(argument)) return;
  for (const property of (argument as any).properties) {
    if (!is.isPropertyAssignment(property) || !is.isIdentifier((property as any).name)) continue;
    onProperty((property as any).name.text, (property as any).initializer);
  }
}

/**
 * Decorated instance methods, via the type so inherited ones are included.
 * @param ctx - analysis context
 * @param cls - the class
 * @returns the method declarations, in property order
 */
function decoratedInstanceMethods(ctx: AnalysisContext, cls: ClassDeclaration): MethodDeclaration[] {
  const methods: MethodDeclaration[] = [];
  for (const property of propertiesOf(ctx, cls)) {
    const node = valueDeclarationOf(ctx, property);
    if (!node || node.kind !== SyntaxKind.MethodDeclaration) continue;
    if (hasOperationDecorator(ctx, node)) methods.push(node as MethodDeclaration);
  }
  return methods;
}

/**
 * Decorated static methods declared on the class itself.
 * @param ctx - analysis context
 * @param cls - the class
 * @returns the method declarations, in member order
 */
function decoratedStaticMethods(ctx: AnalysisContext, cls: ClassDeclaration): MethodDeclaration[] {
  return (cls.members ?? []).filter(
    (member): member is MethodDeclaration =>
      is.isMethodDeclaration(member) && isStaticMember(member) && hasOperationDecorator(ctx, member)
  );
}

/**
 * A model's `Actions`, as `ActionsMetadata`.
 * @param ctx - analysis context
 * @param cls - the model class
 * @returns action name to metadata
 */
export function buildModelActions(ctx: AnalysisContext, cls: ClassDeclaration): Record<string, Record<string, unknown>> {
  let actions: Record<string, Record<string, unknown>> = {};
  // Source 1: the declarative `[WEBDA_ACTIONS]` member.
  const declared = propertiesOf(ctx, cls).find(p => propertyIsKeyedBySymbol(ctx, p, "@webda/models", "WEBDA_ACTIONS"));
  if (declared) {
    actions = {};
    for (const key of memberTypeKeys(ctx, declared)) actions[key] = {};
  }

  // Source 2: decorated methods, instance then static.
  const processMethod = (method: MethodDeclaration) => {
    const meta: Record<string, unknown> = {};
    if (isStaticMember(method)) meta.global = true;
    forEachOperationOption(ctx, method, (key, initializer) => {
      if ((key === "description" || key === "summary") && is.isStringLiteral(initializer)) {
        meta[key] = initializer.text;
      }
    });
    actions[text(ctx, method.name)] = meta;
  };
  decoratedInstanceMethods(ctx, cls).forEach(processMethod);
  decoratedStaticMethods(ctx, cls).forEach(processMethod);
  return actions;
}

/**
 * A model's `Events`, as `EventsMetadata`.
 * @param ctx - analysis context
 * @param cls - the model class
 * @returns event names, or undefined when the model declares no events member
 */
export function buildModelEvents(ctx: AnalysisContext, cls: ClassDeclaration): string[] | undefined {
  const events = propertiesOf(ctx, cls).find(p => propertyIsKeyedBySymbol(ctx, p, "@webda/models", "WEBDA_EVENTS"));
  return events ? memberTypeKeys(ctx, events) : undefined;
}

/**
 * A model's `PrimaryKey`, as `PrimaryKeyMetadata`.
 *
 * Two forms: a `readonly ["a", "b"]` tuple annotation, and an
 * `= ["a", "b"] as const` initialiser. A `readonly X[]` annotation — the
 * abstract `keyof this` form — records nothing, even when an initialiser
 * follows it.
 * @param ctx - analysis context
 * @param cls - the model class
 * @returns key attributes, or undefined when the model has no key member
 */
export function buildModelPrimaryKey(ctx: AnalysisContext, cls: ClassDeclaration): string[] | undefined {
  const symbol = propertiesOf(ctx, cls).find(p =>
    propertyIsKeyedBySymbol(ctx, p, "@webda/models", "WEBDA_PRIMARY_KEY")
  );
  if (!symbol) return undefined;
  const keys: string[] = [];
  const declaration: any = valueDeclarationOf(ctx, symbol);
  if (!declaration) return keys;

  const typeNode = declaration.type;
  if (typeNode && is.isTypeOperatorNode(typeNode) && (typeNode as any).operator === SyntaxKind.ReadonlyKeyword) {
    const inner = (typeNode as any).type;
    if (is.isTupleTypeNode(inner)) {
      for (const element of (inner as any).elements) {
        if (is.isLiteralTypeNode(element)) keys.push(text(ctx, (element as any).literal).replace(/"/g, ""));
      }
      return keys;
    }
    if (is.isArrayTypeNode(inner)) return keys;
  }

  const initializer = declaration.initializer;
  if (initializer && is.isAsExpression(initializer)) {
    const array = (initializer as any).expression;
    if (is.isArrayLiteralExpression(array)) {
      for (const element of (array as any).elements) {
        if (is.isStringLiteral(element)) keys.push((element as any).text);
      }
    }
  }
  return keys;
}

/**
 * Leading comments of a parameter, one string per comment.
 * @param ctx - analysis context
 * @param param - the parameter
 * @returns comment texts
 */
function leadingComments(ctx: AnalysisContext, param: Node): string[] {
  const trivia = ctx.triviaOf(sourceFileOf(param), param);
  return trivia.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? [];
}

/**
 * One `@Command` argument, as `extractParamDefinition`.
 * @param ctx - analysis context
 * @param param - the parameter declaration
 * @returns the argument definition
 */
function commandArg(ctx: AnalysisContext, param: any): CommandArgDefinition {
  let type: CommandArgDefinition["type"] = "string";
  if (param.type) {
    const typeText = text(ctx, param.type).toLowerCase().trim();
    type = typeText === "number" ? "number" : typeText === "boolean" ? "boolean" : "string";
  }
  const def: CommandArgDefinition = { type };
  if (!param.initializer && !param.questionToken) def.required = true;
  const initializer = param.initializer;
  if (initializer) {
    if (is.isStringLiteral(initializer)) def.default = (initializer as any).text;
    else if (is.isNumericLiteral(initializer)) def.default = Number((initializer as any).text);
    else if (initializer.kind === SyntaxKind.TrueKeyword) def.default = true;
    else if (initializer.kind === SyntaxKind.FalseKeyword) def.default = false;
  }

  const docs: { alias?: string; description?: string; deprecated?: string } = {};
  for (const comment of leadingComments(ctx, param)) {
    const alias = comment.match(/@alias\s+(\S+)/);
    if (alias) docs.alias = alias[1];
    const description = comment.match(/@description\s+(.+?)(?:\n|$|\*\/)/);
    if (description)
      docs.description = description[1]
        .trim()
        .replace(/\s*\*\s*/g, " ")
        .trim();
    const deprecated = comment.match(/@deprecated\s*(.*?)(?:\n|$|\*\/)/);
    if (deprecated)
      docs.deprecated =
        deprecated[1]
          .trim()
          .replace(/\s*\*\s*/g, " ")
          .trim() || "";
  }
  if (docs.alias) def.alias = docs.alias;
  if (docs.description) def.description = docs.description;
  if (docs.deprecated !== undefined) def.deprecated = docs.deprecated;
  return def;
}

/**
 * A service's `commands`, as `CommandsMetadata`: every `@Command` or
 * `@BuildCommand` method declared on the class itself.
 * @param ctx - analysis context
 * @param cls - the service class
 * @returns command name to definition
 */
export function buildCommands(ctx: AnalysisContext, cls: ClassDeclaration): Record<string, CommandDefinition> {
  const commands: Record<string, CommandDefinition> = {};
  for (const member of cls.members ?? []) {
    if (!is.isMethodDeclaration(member)) continue;
    const decorator = decoratorsOf(member).find(candidate => {
      const name = decoratorName(ctx, candidate);
      return name === "Command" || name === "BuildCommand";
    });
    if (!decorator || !is.isCallExpression(decorator.expression)) continue;

    const isBuild = decoratorName(ctx, decorator) === "BuildCommand";
    const args = (decorator.expression as any).arguments ?? [];
    let commandName: string;
    let options: any;
    if (isBuild) {
      commandName = "build";
      options = args[0];
    } else {
      if (args.length === 0 || !is.isStringLiteral(args[0])) continue;
      commandName = args[0].text;
      options = args[1];
    }

    let description = "";
    let requires: string[] | undefined;
    let phase: CommandDefinition["phase"] = isBuild ? "resolved" : undefined;
    if (options && is.isObjectLiteralExpression(options)) {
      for (const property of (options as any).properties) {
        if (!is.isPropertyAssignment(property) || !is.isIdentifier((property as any).name)) continue;
        const key = (property as any).name.text;
        const initializer = (property as any).initializer;
        if (key === "description" && is.isStringLiteral(initializer)) {
          description = (initializer as any).text;
        } else if (key === "requires" && is.isArrayLiteralExpression(initializer)) {
          requires = (initializer as any).elements.filter((e: Node) => is.isStringLiteral(e)).map((e: any) => e.text);
        } else if (!isBuild && key === "phase" && is.isStringLiteral(initializer)) {
          const value = (initializer as any).text;
          if (value === "resolved" || value === "initialized") phase = value;
        }
      }
    }

    const methodArgs: Record<string, CommandArgDefinition> = {};
    for (const param of member.parameters) methodArgs[text(ctx, param.name)] = commandArg(ctx, param);

    commands[commandName] = { description, method: text(ctx, member.name), args: methodArgs, requires, phase };
  }
  return commands;
}

/**
 * A service's `capabilities`, as `CapabilitiesMetadata`: the
 * `@WebdaCapability` of every type named in the class's own heritage clauses.
 * @param ctx - analysis context
 * @param cls - the service class
 * @returns sorted capability names
 */
export function buildCapabilities(ctx: AnalysisContext, cls: ClassDeclaration): string[] {
  const capabilities: string[] = [];
  const type = declaredTypeOf(ctx, cls);
  const declarations = declarationsOf(ctx, type?.getSymbol());
  for (const declaration of declarations) {
    if (!is.isClassDeclaration(declaration)) continue;
    for (const clause of (declaration as any).heritageClauses ?? []) {
      for (const expression of clause.types) {
        const target = ctx.checker.getTypeAtLocation(expression);
        for (const targetDeclaration of declarationsOf(ctx, target?.getSymbol())) {
          const tag = findTag(targetDeclaration, "WebdaCapability");
          if (!tag) continue;
          const name = (getTextOfJSDocComment(tag.comment) ?? "").trim().split(" ").shift() || undefined;
          if (name && !capabilities.includes(name)) capabilities.push(name);
        }
      }
    }
  }
  return capabilities.sort();
}

/**
 * The Behavior identifier of a `@WebdaBehavior` class: the tag's first token,
 * else the namespaced class name.
 * @param cls - the class
 * @param namespace - project namespace
 * @returns the identifier, or undefined when the class is not a Behavior
 */
function behaviorIdentifier(cls: Node, namespace: string | undefined): string | undefined {
  const tag = findTag(cls, "WebdaBehavior");
  if (!tag) return undefined;
  const override = getTextOfJSDocComment(tag.comment)?.trim();
  if (override) {
    const first = override.split(/\s+/).shift();
    if (first) return first;
  }
  const className = (cls as any).name?.text ?? "";
  if (!className) return undefined;
  return completeNamespace(className, namespace);
}

/**
 * `WebdaProject.completeNamespace`.
 * @param name - a bare or qualified name
 * @param namespace - project namespace
 * @returns the qualified name
 */
function completeNamespace(name: string, namespace: string | undefined): string {
  if (name.includes("/")) return name;
  return `${namespace ?? "Webda"}/${name}`;
}

/**
 * A Behavior's `Actions`, as `BehaviorsMetadata`.
 * @param ctx - analysis context
 * @param cls - the Behavior class
 * @param identifier - its identifier, for error messages
 * @returns action name to metadata
 * @throws on a static action or `global: true`, both of which Behaviors forbid
 */
export function buildBehaviorActions(
  ctx: AnalysisContext,
  cls: ClassDeclaration,
  identifier: string
): Record<string, Record<string, unknown>> {
  const actions: Record<string, Record<string, unknown>> = {};
  const processMethod = (method: MethodDeclaration) => {
    const methodName = text(ctx, method.name);
    if (isStaticMember(method)) {
      throw new Error(`Behavior ${identifier}: static @Action methods are not allowed (method "${methodName}").`);
    }
    const meta: Record<string, unknown> = {};
    forEachOperationOption(ctx, method, (key, initializer) => {
      if (key === "global") {
        throw new Error(`Behavior ${identifier}: @Action({ global: true }) is not allowed (method "${methodName}").`);
      }
      if ((key === "description" || key === "summary") && is.isStringLiteral(initializer)) {
        meta[key] = initializer.text;
      }
      if (key === "rest" && is.isObjectLiteralExpression(initializer)) {
        const rest: Record<string, string> = {};
        for (const restProperty of initializer.properties) {
          if (
            is.isPropertyAssignment(restProperty) &&
            is.isIdentifier((restProperty as any).name) &&
            is.isStringLiteral((restProperty as any).initializer)
          ) {
            const restKey = (restProperty as any).name.text;
            if (restKey === "route" || restKey === "method") rest[restKey] = (restProperty as any).initializer.text;
          }
        }
        if (Object.keys(rest).length > 0) meta.rest = rest;
      }
    });
    actions[methodName] = meta;
  };
  decoratedInstanceMethods(ctx, cls).forEach(processMethod);
  decoratedStaticMethods(ctx, cls).forEach(processMethod);
  return actions;
}

/**
 * The Behavior identifier of an attribute's written type, when that type is a
 * `@WebdaBehavior` class — `resolveBehaviorIdentifierFromType`.
 * @param ctx - analysis context
 * @param typeRef - the attribute's type reference
 * @param namespace - project namespace
 * @returns the identifier
 */
function behaviorOfTypeReference(ctx: AnalysisContext, typeRef: any, namespace: string | undefined): string | undefined {
  if (!typeRef?.typeName) return undefined;
  // `getTypeAtLocation(typeName)` answers with a symbol-less type on 7.1; the
  // type of the reference itself carries the class symbol.
  let symbol: TsSymbol | undefined;
  try {
    symbol = ctx.checker.getTypeFromTypeNode(typeRef).getSymbol();
  } catch {
    symbol = undefined;
  }
  symbol ??= resolveAlias(ctx, ctx.checker.getSymbolAtLocation(typeRef.typeName));
  const declaration = declarationsOf(ctx, symbol).find(
    d => is.isClassDeclaration(d) || is.isClassExpression(d)
  );
  if (!declaration) return undefined;
  return behaviorIdentifier(declaration, namespace);
}

/**
 * Whether a property should be skipped entirely: `@NotEnumerable` (the bare
 * decorator only) or an `@ignore` JSDoc tag.
 * @param ctx - analysis context
 * @param member - the property declaration
 * @returns true to skip
 */
function isSkippedProperty(ctx: AnalysisContext, member: Node): boolean {
  for (const decorator of decoratorsOf(member)) {
    if (is.isIdentifier(decorator.expression) && decorator.expression.text === "NotEnumerable") return true;
  }
  return findTag(member, "ignore") !== undefined;
}

/** A local model, in TypeScript 6 program-walk order. */
interface ModelTarget {
  object: DiscoveredObject;
  declaration: ClassDeclaration;
  type: Type;
  tags: Record<string, string>;
}

/**
 * `processModels`: Relations, Ancestors and Subclasses for every local model,
 * plus the fields the plugins fill in later.
 * @param ctx - analysis context
 * @param models - local models, in program-walk order
 * @param namespace - project namespace
 * @param errors - accumulator for conditions TypeScript 6 throws on
 * @returns model entries, in walk order (sorted by the caller)
 */
function processModels(
  ctx: AnalysisContext,
  models: ModelTarget[],
  namespace: string | undefined,
  errors: string[]
): Record<string, ModelEntry> {
  const byTypeId = new Map<number, string>();
  for (const model of models) byTypeId.set(model.type.id, model.object.name);
  const modelOf = (typeNode: any): string | undefined => {
    if (!typeNode) return undefined;
    try {
      return byTypeId.get(ctx.checker.getTypeFromTypeNode(typeNode).id);
    } catch {
      return undefined;
    }
  };

  const entries: Record<string, ModelEntry> = {};
  for (const { object, declaration } of models) {
    const name = object.name;
    const sf = sourceFileOf(declaration);
    const relations: ModuleRelations = {};
    let hasProperty = false;

    for (const property of propertiesOf(ctx, declaration)) {
      const member: any = valueDeclarationOf(ctx, property);
      if (!member || !is.isPropertyDeclaration(member)) continue;
      hasProperty = true;
      if (isSkippedProperty(ctx, member)) continue;
      const typeNode = member.type;
      if (!typeNode || !is.isTypeReferenceNode(typeNode)) continue;

      const attribute = property.name;
      const typeArguments: any[] = (typeNode as any).typeArguments ?? [];
      const typeName = text(ctx, (typeNode as any).typeName);
      const addLink = (type: string) => {
        relations.links ??= [];
        relations.links.push({ attribute, model: modelOf(typeArguments[0]), type });
      };
      switch (typeName) {
        case "ModelParent": {
          const model = modelOf(typeArguments[0]);
          if (!model) errors.push(`Cannot find parent model ${text(ctx, typeArguments[0])} for ${name}.${attribute}`);
          relations.parent = { attribute, model };
          break;
        }
        case "ModelRelated": {
          relations.queries ??= [];
          const model = modelOf(typeArguments[0]);
          if (!model) errors.push(`Cannot find query model ${text(ctx, typeArguments[0])} for ${name}.${attribute}`);
          relations.queries.push({
            attribute,
            model,
            targetAttribute: typeArguments[1] ? text(ctx, typeArguments[1]).replace(/"/g, "") : undefined
          });
          break;
        }
        case "ModelsMapped": {
          relations.maps ??= [];
          const model = modelOf(typeArguments[0]);
          if (!model) errors.push(`Cannot find map model ${text(ctx, typeArguments[0])} for ${name}.${attribute}`);
          const map = {
            attribute,
            cascadeDelete: findTag(member, "CascadeDelete") !== undefined,
            model,
            targetLink: text(ctx, typeArguments[1]).replace(/"/g, ""),
            targetAttributes: text(ctx, typeArguments[2])
              .replace(/"/g, "")
              .split("|")
              .map(t => t.trim())
          };
          if (!map.targetAttributes.includes("uuid")) map.targetAttributes.push("uuid");
          relations.maps.push(map);
          break;
        }
        case "ModelLink":
          addLink("LINK");
          break;
        case "ModelLinksMap":
          addLink("LINKS_MAP");
          break;
        case "ModelLinksArray":
          addLink("LINKS_ARRAY");
          break;
        case "ModelLinksSimpleArray":
          addLink("LINKS_SIMPLE_ARRAY");
          break;
        default: {
          const behavior = behaviorOfTypeReference(ctx, typeNode, namespace);
          if (behavior) {
            relations.behaviors ??= [];
            relations.behaviors.push({ attribute, behavior });
          }
        }
      }
    }
    // TypeScript 6 records the entry from inside the property loop, so a model
    // with no property declarations at all has no entry.
    if (!hasProperty) continue;

    entries[name] = {
      Plural: "",
      Import: object.importTarget,
      Relations: relations,
      Ancestors: [],
      Subclasses: [],
      Reflection: reflectAttributes(ctx, sf, declaration),
      Schemas: {},
      Actions: {},
      Events: [],
      PrimaryKey: [],
      Identifier: name
    };
  }

  // Ancestors: the class tree mapped to local models, nearest first, without
  // the model itself and — as in TypeScript 6 — without `Webda/CoreModel`.
  for (const { object, declaration } of models) {
    const entry = entries[object.name];
    if (!entry) continue;
    entry.Ancestors = classTree(ctx, declaration)
      .map((type: Type) => byTypeId.get(declaredId(ctx, type)))
      .filter(
        (ancestor): ancestor is string =>
          ancestor !== undefined && ancestor !== "Webda/CoreModel" && ancestor !== object.name
      );
  }
  for (const name of Object.keys(entries)) {
    const ancestors = entries[name].Ancestors;
    if (ancestors.length) entries[ancestors[0]]?.Subclasses.push(name);
  }
  return entries;
}

/**
 * Id of the declared type behind a (possibly instantiated) type — what
 * TypeScript 6's `getClassTree` records, as it re-reads each base through
 * `getTypeAtLocation(valueDeclaration)`.
 * @param ctx - analysis context
 * @param type - the type
 * @returns the declared type's id
 */
function declaredId(ctx: AnalysisContext, type: Type): number {
  const symbol = type.getSymbol?.();
  if (!symbol) return type.id;
  try {
    return ctx.checker.getDeclaredTypeOfSymbol(symbol).id;
  } catch {
    return type.id;
  }
}

/**
 * Find a class declaration by file and written name.
 * @param ctx - analysis context
 * @param fileName - declaring file
 * @param className - class name
 * @returns the declaration
 */
function findClass(ctx: AnalysisContext, fileName: string, className: string): ClassDeclaration | undefined {
  const sf = ctx.program.getSourceFile(fileName);
  return sf?.statements.find(
    (statement): statement is ClassDeclaration => is.isClassDeclaration(statement) && statement.name?.text === className
  );
}

/**
 * `getJSTargetFile` without extension: the output path for a project file, or
 * `node_modules/<package>/<path>` for a dependency's declaration file.
 * @param fileName - the source file
 * @param options - discovery options
 * @returns the import path
 */
function jsTarget(fileName: string, options: DiscoveryOptions): string {
  if (!fileName.startsWith(options.appPath)) {
    let folder = fileName;
    let libPath = "node_modules/";
    for (;;) {
      const parent = join(folder, "..");
      if (parent === folder || parent.length <= 2) break;
      folder = parent;
      const manifest = join(folder, "package.json");
      if (!existsSync(manifest)) continue;
      const name = JSON.parse(readFileSync(manifest, "utf8")).name;
      if (name) {
        libPath += name + "/";
        break;
      }
    }
    return (libPath + relative(folder, fileName)).replace(/\.d\.ts$/, ".js").replace(/\.js$/, "");
  }
  return outputTarget(fileName, options);
}

/**
 * The `Configuration` of a service: where its parameters class is exported.
 * @param ctx - analysis context
 * @param declaration - the service class
 * @param base - parameters base type
 * @param options - discovery options
 * @returns `path:export`, or undefined when there is no parameters type
 * @throws when the parameters class is not exported
 */
function configurationOf(
  ctx: AnalysisContext,
  declaration: ClassDeclaration,
  base: string,
  options: DiscoveryOptions
): string | undefined {
  const node = findParametersNode(declaration, ctx.checker, ctx.project, base);
  if (!node) return undefined;
  const type = ctx.checker.getTypeAtLocation(node);
  const target: any = valueDeclarationOf(ctx, type.getSymbol());
  if (!target) throw new Error(`Cannot find the declaration of ${text(ctx, node)}`);
  const sf = sourceFileOf(target);
  const exportName = exportedName(ctx, sf, target);
  if (!exportName) {
    throw new Error(`Cannot find exported name for ${target.name?.text}, check that the class is exported`);
  }
  return `${jsTarget(sf.fileName, options)}:${exportName}`;
}

/**
 * Read the application's `package.json`.
 * @param appPath - application root
 * @returns the manifest, or an empty object
 */
function manifestOf(appPath: string): any {
  try {
    return JSON.parse(readFileSync(join(appPath, "package.json"), "utf8"));
  } catch {
    return {};
  }
}

/**
 * Generate the complete `webda.module.json` for a project, minus `sourceDigest`.
 * @param ctx - analysis context over the project
 * @param options - roots, namespace and capabilities
 * @returns the module, naming violations and errors
 */
export function generateWebdaModule(ctx: AnalysisContext, options: ModuleOptions): ModuleResult {
  const compilerOptions: any = (ctx.program as any).getCompilerOptions?.() ?? {};
  const discovery: DiscoveryOptions = {
    appPath: options.appPath,
    rootDir: options.rootDir ?? compilerOptions.rootDir ?? join(options.appPath, "src"),
    outDir: options.outDir ?? compilerOptions.outDir ?? join(options.appPath, "lib"),
    namespace: options.namespace
  };
  const namespace = options.namespace;
  const errors: string[] = [];

  // TypeScript 6 walks `program.getSourceFiles()` in program order; several
  // maps below keep that insertion order, so reproduce it.
  const fileOrder = new Map<string, number>();
  ctx.program.getSourceFileNames().forEach((fileName, index) => fileOrder.set(fileName, index));
  const walkOrder = (a: { fileName: string; pos: number }, b: { fileName: string; pos: number }) =>
    (fileOrder.get(a.fileName) ?? 0) - (fileOrder.get(b.fileName) ?? 0) || a.pos - b.pos;

  const classified = discoverWebdaObjects(ctx, { ...discovery, keepDuplicates: true })
    .map(object => ({ object, declaration: findClass(ctx, object.fileName, object.className) }))
    .filter((item): item is { object: DiscoveredObject; declaration: ClassDeclaration } => !!item.declaration)
    // A `@WebdaSchema` class is a top-level schema and nothing else: the
    // TypeScript 6 walk returns before classifying it.
    .filter(item => webdaTags(item.declaration).WebdaSchema === undefined)
    .sort((a, b) =>
      walkOrder(
        { fileName: a.object.fileName, pos: a.declaration.pos },
        { fileName: b.object.fileName, pos: b.declaration.pos }
      )
    );

  // Two classes can share a namespaced name. TypeScript 6 let the last class
  // in program order win silently, which registered one class while code
  // saved the other (`@webda/core` shipped two AuditEntry models). Keep that
  // choice so the module stays inspectable, but report it: the build fails.
  const slots = new Map<string, number>();
  const discovered: typeof classified = [];
  for (const item of classified) {
    const key = `${item.object.section}:${item.object.name}`;
    const slot = slots.get(key);
    if (slot === undefined) {
      slots.set(key, discovered.length);
      discovered.push(item);
    } else {
      const previous = discovered[slot].object;
      errors.push(
        `${item.object.name} is declared twice: ${previous.className} in ${previous.fileName} and ` +
          `${item.object.className} in ${item.object.fileName}; rename one`
      );
      discovered[slot] = item;
    }
  }

  // Naming guard, in walk order, one report per file — every classified
  // class counts, including a duplicate that loses its slot.
  const namingViolations: NamingViolation[] = [];
  for (const { object } of classified) {
    const expectedSuffix = SECTION_SUFFIX[object.section];
    if (!expectedSuffix) continue;
    if (MAPPED_SUFFIXES.some(suffix => object.fileName.endsWith(suffix))) continue;
    if (namingViolations.some(v => v.fileName === object.fileName)) continue;
    namingViolations.push({
      fileName: object.fileName,
      className: object.className,
      section: object.section,
      expectedSuffix
    });
  }

  const services: Record<Exclude<Section, "models">, Record<string, ServiceEntry>> = {
    beans: {},
    deployers: {},
    moddas: {}
  };
  const models: ModelTarget[] = [];
  for (const { object, declaration } of discovered) {
    if (object.section === "models") {
      const type = declaredTypeOf(ctx, declaration);
      if (type) models.push({ object, declaration, type, tags: webdaTags(declaration) });
      continue;
    }
    services[object.section][object.name] = { Import: object.importTarget, Schema: {} };
  }

  const module: WebdaModuleJson = {
    $schema: WEBDA_MODULE_SCHEMA,
    beans: sortObject(services.beans),
    deployers: sortObject(services.deployers),
    moddas: sortObject(services.moddas),
    models: sortObject(processModels(ctx, models, namespace, errors)),
    schemas: {},
    behaviors: {},
    capabilities: options.capabilities ?? manifestOf(options.appPath).webda?.capabilities
  };

  // Schemas and Configuration — `WebdaSchemaResults.generateSchemas`.
  for (const { object, declaration } of discovered) {
    if (object.section === "models") {
      const entry = module.models[object.name];
      if (!entry) continue;
      try {
        entry.Schemas = generateModelSchemas(declaration, { project: ctx.project, checker: ctx.checker }) as any;
      } catch (error) {
        errors.push(`${object.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }
    const entry = module[object.section][object.name];
    const base = object.section === "deployers" ? "DeployerResources" : "ServiceParameters";
    try {
      const schema = generateServiceSchema(declaration, {
        project: ctx.project,
        checker: ctx.checker,
        addOpenApi: object.section !== "deployers",
        parametersBase: object.section === "deployers" ? base : undefined,
        title: declaration.name?.text ?? object.className
      });
      if (schema) entry.Schema = schema;
    } catch (error) {
      errors.push(`${object.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      const configuration = configurationOf(ctx, declaration, base, discovery);
      if (configuration) entry.Configuration = configuration;
    } catch (error) {
      errors.push(`${object.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  try {
    Object.assign(module.schemas, generateTopLevelSchemas(ctx, discovery));
  } catch (error) {
    errors.push(`schemas: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Plugins, in the TypeScript 6 order: Actions, Behaviors, Capabilities,
  // Commands, Events, PrimaryKey, Plural.
  for (const { object, declaration } of models) {
    const entry = module.models[object.name];
    if (entry) entry.Actions = buildModelActions(ctx, declaration);
  }
  for (const { sf, declaration } of behaviorClasses(ctx)) {
    const identifier = behaviorIdentifier(declaration, namespace)!;
    const exportName = exportedName(ctx, sf, declaration)!;
    try {
      module.behaviors[identifier] = {
        Identifier: identifier,
        Import: `${outputTarget(sf.fileName, discovery)}:${exportName}`,
        Actions: buildBehaviorActions(ctx, declaration, identifier)
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  for (const { object, declaration } of discovered) {
    if (object.section !== "moddas" && object.section !== "beans") continue;
    const capabilities = buildCapabilities(ctx, declaration);
    if (capabilities.length > 0) module[object.section][object.name].capabilities = capabilities;
  }
  for (const { object, declaration } of discovered) {
    if (object.section !== "moddas" && object.section !== "beans") continue;
    const commands = buildCommands(ctx, declaration);
    if (Object.keys(commands).length > 0) module[object.section][object.name].commands = commands;
  }
  for (const { object, declaration, tags } of models) {
    const entry = module.models[object.name];
    if (!entry) continue;
    const events = buildModelEvents(ctx, declaration);
    if (events) entry.Events = events;
    const primaryKey = buildModelPrimaryKey(ctx, declaration);
    if (primaryKey) entry.PrimaryKey = primaryKey;
    entry.Plural = tags.WebdaPlural || getPlural(object.name.split("/").pop()!);
  }

  return { module, namingViolations, errors };
}

/**
 * Exported `@WebdaBehavior` classes of the project, in walk order.
 *
 * The same filter as `searchForWebdaObjects`' `allClasses` for root files:
 * not a spec, not `@WebdaSchema`, not `@WebdaIgnore`, exported.
 * @param ctx - analysis context
 * @returns the behaviour classes
 */
function behaviorClasses(ctx: AnalysisContext): { sf: SourceFile; declaration: ClassDeclaration }[] {
  const found: { sf: SourceFile; declaration: ClassDeclaration }[] = [];
  const own = new Set(ctx.sourceFiles.map(sf => sf.fileName));
  for (const fileName of ctx.program.getSourceFileNames()) {
    if (!own.has(fileName) || fileName.endsWith(".spec.ts")) continue;
    const sf = ctx.program.getSourceFile(fileName);
    if (!sf) continue;
    for (const statement of sf.statements) {
      const tags = webdaTags(statement);
      if (tags.WebdaSchema !== undefined) continue;
      if (!is.isClassDeclaration(statement) || !statement.name) continue;
      if (tags.WebdaIgnore !== undefined) continue;
      if (!findTag(statement, "WebdaBehavior")) continue;
      if (!exportedName(ctx, sf, statement)) continue;
      found.push({ sf, declaration: statement });
    }
  }
  return found;
}
