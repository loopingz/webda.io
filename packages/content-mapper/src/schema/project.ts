/**
 * The top-level `schemas` map of `webda.module.json`.
 *
 * Stage 7.3. Unlike service and model schemas, these entries record no
 * provenance — the key is all there is — so reproducing them means
 * reproducing the discovery as well as the conversion. Two kinds share the
 * map:
 *
 * - **`<Namespace>/<Name>`** for a type tagged `@WebdaSchema`. Discovered
 *   across the *whole program*, dependencies included, which is why
 *   `@webda/core`'s `BinaryFile` reappears in every application under that
 *   application's namespace.
 * - **`<Root>.<method>.input` / `.output`** for a method decorated `@Action`
 *   or `@Operation`, on a model, a modda, a bean or a `@WebdaBehavior`
 *   class. The root differs per kind and is not uniform — see
 *   {@link actionRoots}.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ClassDeclaration, MethodDeclaration, Node } from "typescript/unstable/ast";
import { ModifierFlags, SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { getJSDocTags, getTextOfJSDocComment } from "typescript/unstable/ast";
import type { AnalysisContext } from "../plan.ts";
import { discoverWebdaObjects } from "../module-discovery.ts";
import { generateActionInput, generateActionOutput } from "./action.ts";
import { SchemaConverter } from "./converter.ts";
import type { JSONSchema7 } from "./types.ts";

/** What is needed to build the whole map. */
export interface TopLevelSchemaOptions {
  /** Application root. */
  appPath: string;
  /** Source root; classes outside it belong to dependencies. */
  rootDir: string;
  /** Output root, for the discovery pass. */
  outDir: string;
  /** Namespace prefix applied to unqualified names. */
  namespace?: string;
}

/**
 * Build every top-level schema for a project.
 * @param ctx - analysis context, whose `sourceFiles` are the project's own
 * @param options - roots and namespace
 * @returns the `schemas` map
 */
export function generateTopLevelSchemas(
  ctx: AnalysisContext,
  options: TopLevelSchemaOptions
): Record<string, JSONSchema7> {
  const schemas: Record<string, JSONSchema7> = {};
  const converterOptions = { project: ctx.project, checker: ctx.checker };

  // `@WebdaSchema` types first, keyed in sorted order, then actions — the
  // order `WebdaSchemaResults.generateSchemas` flushes its two maps in.
  for (const [name, node] of [...declaredSchemas(ctx, options)].sort(([a], [b]) => a.localeCompare(b))) {
    const converter = new SchemaConverter(converterOptions);
    const schema = converter.fromNode(node);
    schema.title = nameOf(node) ?? name;
    schemas[name] = schema;
  }

  for (const [root, method] of actionRoots(ctx, options)) {
    const name = methodName(method);
    if (!name) continue;
    schemas[`${root}.${name}.input`] = generateActionInput(method, converterOptions);
    const output = generateActionOutput(method, converterOptions);
    // A method whose return type cannot be resolved contributes no entry at
    // all: `@webda/compiler` stores `undefined`, which `JSON.stringify` drops.
    if (output) schemas[`${root}.${name}.output`] = output;
  }

  return schemas;
}

/**
 * Every `@WebdaSchema`-tagged declaration in the program.
 *
 * Deliberately not limited to the project's own sources. The TypeScript 6
 * walk tests the tag before it tests whether the file is a root file, so a
 * tagged type in a dependency's `.d.ts` is re-emitted under the consuming
 * application's namespace. Restricting this to project sources would drop
 * `Webda/BinaryFile` from every downstream module.
 * @param ctx - analysis context
 * @param options - roots and namespace
 * @returns name to declaration
 */
function declaredSchemas(ctx: AnalysisContext, options: TopLevelSchemaOptions): Map<string, Node> {
  const found = new Map<string, Node>();

  for (const fileName of ctx.program.getSourceFileNames()) {
    if (fileName.endsWith(".spec.ts") || isDefaultLibrary(fileName)) continue;
    const sourceFile = ctx.program.getSourceFile(fileName);
    if (!sourceFile) continue;

    for (const statement of sourceFile.statements) {
      const tag = webdaTag(statement, "WebdaSchema");
      if (tag === undefined) continue;
      const bare = tag || nameOf(statement);
      if (!bare) continue;
      const name = bare.includes("/") ? bare : `${options.namespace ?? "Webda"}/${bare}`;
      if (!found.has(name)) found.set(name, statement);
    }
  }
  return found;
}

/**
 * Every decorated method, paired with the root its schema key uses.
 *
 * The root is not computed uniformly, and the inconsistency is observable in
 * the committed artefact rather than incidental:
 *
 * | source     | root                                          |
 * | ---------- | --------------------------------------------- |
 * | model      | the namespaced model name                     |
 * | modda/bean | the **raw class name**, unnamespaced          |
 * | behaviour  | the `@WebdaBehavior` payload, else namespaced |
 *
 * `.webda/operations.json` depends on the middle row: it recovers service
 * operations by matching `^([^.]+)\.` against the short class name, so a
 * namespaced key would not be found.
 * @param ctx - analysis context
 * @param options - roots and namespace
 * @returns root and method pairs, in discovery order
 */
function actionRoots(ctx: AnalysisContext, options: TopLevelSchemaOptions): [string, MethodDeclaration][] {
  const pairs: [string, MethodDeclaration][] = [];
  const discovered = discoverWebdaObjects(ctx, options);

  const classFor = (fileName: string, className: string): ClassDeclaration | undefined => {
    const sourceFile = ctx.program.getSourceFile(fileName);
    return sourceFile?.statements.find(
      (statement): statement is ClassDeclaration =>
        is.isClassDeclaration(statement) && statement.name?.text === className
    );
  };

  for (const object of discovered) {
    if (object.section !== "models") continue;
    const declaration = classFor(object.fileName, object.className);
    if (!declaration) continue;
    // Instance methods come from the type, so inherited actions count;
    // statics are not on the instance type and are read off the class.
    for (const method of instanceActions(ctx, declaration)) pairs.push([object.name, method]);
    for (const method of staticActions(declaration)) pairs.push([object.name, method]);
  }

  for (const object of discovered) {
    if (object.section !== "moddas" && object.section !== "beans") continue;
    const declaration = classFor(object.fileName, object.className);
    if (!declaration) continue;
    for (const method of instanceActions(ctx, declaration)) pairs.push([object.className, method]);
  }

  // Behaviours, from the project's own sources only — a dependency already
  // emitted the schemas for the behaviours it owns.
  for (const sourceFile of ctx.sourceFiles) {
    if (sourceFile.fileName.endsWith(".spec.ts")) continue;
    for (const statement of sourceFile.statements) {
      if (!is.isClassDeclaration(statement) || !statement.name) continue;
      const tag = webdaTag(statement, "WebdaBehavior");
      if (tag === undefined) continue;
      const bare = tag || statement.name.text;
      const root = bare.includes("/") ? bare : `${options.namespace ?? "Webda"}/${bare}`;
      for (const method of instanceActions(ctx, statement)) pairs.push([root, method]);
    }
  }

  return pairs;
}

/**
 * Decorated instance methods of a class, including inherited ones.
 * @param ctx - analysis context
 * @param declaration - the class
 * @returns the method declarations
 */
function instanceActions(ctx: AnalysisContext, declaration: ClassDeclaration): MethodDeclaration[] {
  const type = ctx.checker.getTypeAtLocation(declaration);
  const methods: MethodDeclaration[] = [];
  for (const property of ctx.checker.getPropertiesOfType(type)) {
    const node = property.valueDeclaration?.resolve(ctx.project);
    if (!node || !is.isMethodDeclaration(node)) continue;
    if (hasActionDecorator(node)) methods.push(node);
  }
  return methods;
}

/**
 * Decorated static methods declared on a class.
 * @param declaration - the class
 * @returns the method declarations
 */
function staticActions(declaration: ClassDeclaration): MethodDeclaration[] {
  return declaration.members.filter(
    (member): member is MethodDeclaration =>
      is.isMethodDeclaration(member) &&
      (member.modifierFlags & ModifierFlags.Static) !== 0 &&
      hasActionDecorator(member)
  );
}

/**
 * Whether a method carries `@Action` or `@Operation`.
 *
 * Both the bare and the called form count. `@Route` does not, despite what
 * `exploreServices`'s own documentation says.
 * @param method - the method declaration
 * @returns true when decorated
 */
function hasActionDecorator(method: MethodDeclaration): boolean {
  for (const modifier of method.modifiers ?? []) {
    if (modifier.kind !== SyntaxKind.Decorator) continue;
    const expression = (modifier as { expression?: Node }).expression;
    if (!expression) continue;
    const identifier = is.isCallExpression(expression) ? expression.expression : expression;
    const name = (identifier as { text?: string }).text;
    if (name === "Action" || name === "Operation") return true;
  }
  return false;
}

/**
 * The payload of a `Webda*` JSDoc tag, or undefined when the tag is absent.
 *
 * An empty string means "present with no payload", which the callers treat
 * as "fall back to the declaration name" — so the two cases have to stay
 * distinguishable.
 * @param node - the declaration
 * @param tagName - the tag to look for
 * @returns the first token of the payload, `""`, or undefined
 */
function webdaTag(node: Node, tagName: string): string | undefined {
  for (const tag of getJSDocTags(node)) {
    if (tag.tagName.text !== tagName) continue;
    const text = getTextOfJSDocComment(tag.comment)?.trim() ?? "";
    return text.replace("\n", " ").split(" ")[0] ?? "";
  }
  return undefined;
}

/**
 * The declared name of a node, when it has one.
 * @param node - the declaration
 * @returns the name
 */
function nameOf(node: Node): string | undefined {
  return (node as { name?: { text?: string } }).name?.text;
}

/**
 * A method's name as written.
 * @param method - the method declaration
 * @returns the name, or undefined for a computed one
 */
function methodName(method: MethodDeclaration): string | undefined {
  return (method.name as { text?: string }).text;
}

/**
 * Whether a file is part of the TypeScript standard library.
 * @param fileName - absolute path
 * @returns true for `lib.*.d.ts` shipped with the compiler
 */
function isDefaultLibrary(fileName: string): boolean {
  return /[\\/]lib\.[a-z0-9.]+\.d\.ts$/.test(fileName);
}

/**
 * Read a project's namespace the way `WebdaProject` does.
 * @param appPath - application root
 * @returns the namespace, when one applies
 */
export function namespaceOf(appPath: string): string | undefined {
  let folder = appPath;
  while (folder.length > 2) {
    const manifestPath = join(folder, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.webda?.namespace) return manifest.webda.namespace;
      if (!manifest.name?.startsWith("@")) return undefined;
      const scope = manifest.name.split("/")[0].slice(1);
      return scope.charAt(0).toUpperCase() + scope.slice(1);
    }
    const parent = dirname(folder);
    if (parent === folder) break;
    folder = parent;
  }
  return undefined;
}
