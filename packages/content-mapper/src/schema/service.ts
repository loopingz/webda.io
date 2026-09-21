/**
 * Service parameter schemas — the `Schema` field of a modda, bean or deployer
 * entry in `webda.module.json`.
 *
 * This is the first third of stage 7 and the easiest: plain configuration
 * objects, no accessors, no model semantics, but it exercises the whole
 * pipeline. 1,589 of the corpus's 4,154 schema nodes come from here.
 *
 * The schema is generated from the **type argument** of the service's base
 * clause — the `X` in `class Store extends Service<StoreParameters>` — not
 * from the service class and not from `loadParameters`. That is what
 * `ModuleGenerator.getSchemaNode` does, and the committed artefact reflects
 * it.
 */
import type { Checker, Project, Symbol as TsSymbol, Type } from "typescript/unstable/sync";
import { SyntaxKind } from "typescript/unstable/ast";
import type { ClassDeclaration, Node, TypeNode } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { SchemaConverter } from "./converter.ts";
import type { JSONSchema7 } from "./types.ts";

/** What is needed to find and convert a service's parameters. */
export interface ServiceSchemaOptions {
  /** Project the checker belongs to. */
  project: Project;
  /** The resident checker. */
  checker: Checker;
  /**
   * Base type the parameters must derive from. `ServiceParameters` for moddas
   * and beans, `DeployerResources` for deployers.
   */
  parametersBase?: string;
  /**
   * Add the free-form `openapi` property. True for moddas and beans, false
   * for deployers — `WebdaSchemaResults.generateSchemas` gates it the same
   * way.
   */
  addOpenApi?: boolean;
  /** `title` for the document; the service class name, not the parameters class. */
  title?: string;
}

/**
 * Find the parameters type node on a service class.
 *
 * Two shapes are accepted, matching `getSchemaNode`:
 *
 * - `class S extends Service<SParameters>` — the type argument
 * - `class S<T extends SParameters> extends Service<T>` — the constraint
 *
 * The base chain is walked because a service commonly names its parameters on
 * an intermediate class rather than on itself.
 * @param declaration - the service class
 * @param checker - the checker resolving base types
 * @param project - project used to resolve declaration handles
 * @param base - name of the type the parameters must derive from
 * @returns the type node, or undefined when the class declares none
 */
export function findParametersNode(
  declaration: ClassDeclaration,
  checker: Checker,
  project: Project,
  base = "ServiceParameters"
): TypeNode | undefined {
  for (const cls of classChain(declaration, checker, project)) {
    for (const clause of cls.heritageClauses ?? []) {
      if (clause.token !== SyntaxKind.ExtendsKeyword) continue;
      for (const heritage of clause.types) {
        for (const argument of heritage.typeArguments ?? []) {
          if (derivesFrom(checker.getTypeFromTypeNode(argument), base, checker)) return argument;
        }
      }
    }
    for (const parameter of cls.typeParameters ?? []) {
      const constraint = parameter.constraint;
      if (constraint && derivesFrom(checker.getTypeFromTypeNode(constraint), base, checker)) return constraint;
    }
  }
  return undefined;
}

/**
 * Generate a service's `Schema` entry.
 * @param declaration - the service class
 * @param options - checker, project and post-processing switches
 * @returns the schema, or undefined when the service declares no parameters
 */
export function generateServiceSchema(
  declaration: ClassDeclaration,
  options: ServiceSchemaOptions
): JSONSchema7 | undefined {
  const node = findParametersNode(declaration, options.checker, options.project, options.parametersBase);
  if (!node) return undefined;

  const converter = new SchemaConverter({ project: options.project, checker: options.checker, mode: "input" });
  const schema = converter.fromNode(node);

  // Both of these are applied after the recursive key sort in the TypeScript 6
  // pipeline, so they land at the end of their objects. `webda.module.json` is
  // compared by value, not by key order, but the same order is kept here so a
  // textual diff of the artefact stays clean.
  if (options.addOpenApi) {
    schema.properties ??= {};
    schema.properties.openapi = { type: "object", additionalProperties: true };
  }
  if (options.title) schema.title = options.title;
  return schema;
}

/**
 * A class declaration and each class it derives from, nearest first.
 *
 * Keyed on declaration rather than name: `class Store extends Store` is
 * ordinary in Webda, and a name-keyed guard stops the walk one link short.
 * @param declaration - the starting class
 * @param checker - the checker resolving base types
 * @param project - project used to resolve declaration handles
 * @returns the class declarations in the chain
 */
function classChain(declaration: ClassDeclaration, checker: Checker, project: Project): ClassDeclaration[] {
  const chain: ClassDeclaration[] = [];
  const seen = new Set<Node>();
  let current: ClassDeclaration | undefined = declaration;

  while (current && !seen.has(current) && chain.length < 64) {
    seen.add(current);
    chain.push(current);

    const symbol: TsSymbol | undefined = current.name ? checker.getSymbolAtLocation(current.name) : undefined;
    const declared: Type | undefined = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : undefined;
    const baseType: Type | undefined = declared?.isClassOrInterface() ? checker.getBaseTypes(declared)[0] : undefined;
    current = baseType ? resolveClass(baseType, project) : undefined;
  }
  return chain;
}

/**
 * Whether a type is, or derives from, a named class.
 * @param type - the type to test
 * @param name - the base class name
 * @param checker - the checker resolving base types
 * @returns true on a match
 */
function derivesFrom(type: Type, name: string, checker: Checker): boolean {
  const seen = new Set<number>();
  const queue: Type[] = [type];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current.id)) continue;
    seen.add(current.id);

    const symbol = current.getSymbol();
    if (symbol?.name === name) return true;

    // `Service<StoreParameters<T>>` hands back an instantiated reference, and
    // an instantiated reference reports no base types of its own. Re-resolving
    // through the symbol reaches the generic target, which does — without this
    // a generic parameters class silently falls back to the base
    // `ServiceParameters` and emits the wrong schema.
    const declared: Type = symbol ? checker.getDeclaredTypeOfSymbol(symbol) : current;
    const walkable = declared.isClassOrInterface() ? declared : current;
    if (!walkable.isClassOrInterface()) continue;
    queue.push(...checker.getBaseTypes(walkable));
  }
  return false;
}

/**
 * The class declaration behind a type, if it has one.
 * @param type - the type
 * @param project - project used to resolve the declaration handle
 * @returns the class declaration
 */
function resolveClass(type: Type, project: Project): ClassDeclaration | undefined {
  const symbol = type.getSymbol();
  const node = symbol?.valueDeclaration?.resolve(project) ?? symbol?.declarations[0]?.resolve(project);
  return node && is.isClassDeclaration(node) ? node : undefined;
}
