/**
 * Class properties in the order TypeScript 6 reports them.
 *
 * `webda.module.json` is committed, and several of its maps — `Reflection`,
 * `Relations`, `Actions` — are filled by iterating `type.getProperties()`, so
 * their key order is whatever order the TypeScript 6 checker returned. The
 * 7.1 checker returns the same *set* in a different order, so reproducing the
 * artefact byte for byte means reconstructing the 6.x order.
 *
 * TypeScript 6 resolves a class's members as its own symbol table — members
 * in declaration order, constructor parameter properties at the constructor's
 * position — followed by each base type's properties that are not already
 * present (`addInheritedMembers`), recursively. Symbol-keyed (late-bound)
 * members come after the early-bound ones. That is what is rebuilt here, and
 * the 7.1 property list is then sorted by it; anything the rebuild does not
 * know about keeps its 7.1 position at the end.
 */
import type { ClassDeclaration, Node } from "typescript/unstable/ast";
import { SyntaxKind } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import type { Symbol as TsSymbol, Type } from "typescript/unstable/sync";
import type { AnalysisContext } from "./plan.ts";

/** Modifiers that turn a constructor parameter into a property. */
const PARAMETER_PROPERTY_MODIFIERS = new Set<number>([
  SyntaxKind.PublicKeyword,
  SyntaxKind.PrivateKeyword,
  SyntaxKind.ProtectedKeyword,
  SyntaxKind.ReadonlyKeyword,
  SyntaxKind.OverrideKeyword
]);

/**
 * The property name a declaration binds, for an early-bound name.
 * @param name - the name node
 * @returns the name, or undefined for computed and private names
 */
function boundName(name: any): string | undefined {
  if (!name) return undefined;
  if (is.isIdentifier(name) || is.isStringLiteral(name) || is.isNumericLiteral(name)) return name.text;
  return undefined;
}

/**
 * Whether a node carries the `static` keyword.
 * @param node - the node
 * @returns true when static
 */
function isStatic(node: Node): boolean {
  return ((node as any).modifiers ?? []).some((modifier: Node) => modifier.kind === SyntaxKind.StaticKeyword);
}

/**
 * Early-bound instance member names of one class or interface declaration.
 * @param declaration - the declaration
 * @returns names in binding order
 */
function ownNames(declaration: Node): string[] {
  const names: string[] = [];
  for (const member of (declaration as any).members ?? []) {
    if (isStatic(member)) continue;
    if (member.kind === SyntaxKind.Constructor) {
      for (const parameter of member.parameters ?? []) {
        const modifiers = parameter.modifiers ?? [];
        if (!modifiers.some((modifier: Node) => PARAMETER_PROPERTY_MODIFIERS.has(modifier.kind))) continue;
        const name = boundName(parameter.name);
        if (name !== undefined) names.push(name);
      }
      continue;
    }
    const name = boundName(member.name);
    if (name !== undefined) names.push(name);
  }
  return names;
}

/**
 * Property names of a type in TypeScript 6 order.
 * @param ctx - analysis context
 * @param type - the type
 * @param depth - recursion guard
 * @returns names, first occurrence wins
 */
function orderedNames(ctx: AnalysisContext, type: Type | undefined, depth = 0): string[] {
  if (!type || depth > 64) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    out.push(name);
  };

  if (type.isIntersectionType?.()) {
    for (const member of (type as any).getTypes?.() ?? []) orderedNames(ctx, member, depth + 1).forEach(add);
    return out;
  }

  const symbol = type.getSymbol?.();
  let declared: Type | undefined;
  try {
    declared = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  } catch {
    declared = undefined;
  }
  if (!symbol || !declared?.isClassOrInterface?.()) {
    for (const property of ctx.checker.getPropertiesOfType(type)) add(property.name);
    return out;
  }

  for (const handle of symbol.declarations ?? []) {
    const declaration = handle.resolve(ctx.project);
    if (declaration && (is.isClassDeclaration(declaration) || is.isInterfaceDeclaration(declaration) || is.isClassExpression(declaration))) {
      ownNames(declaration).forEach(add);
    }
  }
  let bases: readonly Type[] = [];
  try {
    bases = ctx.checker.getBaseTypes(declared as any);
  } catch {
    bases = [];
  }
  for (const base of bases) orderedNames(ctx, base, depth + 1).forEach(add);
  return out;
}

/**
 * Sort a property list into TypeScript 6 order.
 * @param ctx - analysis context
 * @param type - the type the properties belong to
 * @param properties - the 7.1 property list
 * @returns the same symbols, reordered
 */
export function ts6PropertyOrder(ctx: AnalysisContext, type: Type, properties: readonly TsSymbol[]): TsSymbol[] {
  const rank = new Map<string, number>();
  orderedNames(ctx, type).forEach((name, index) => rank.set(name, index));
  const unknown = rank.size;
  return properties
    .map((property, index) => ({ property, index, rank: rank.get(property.name) ?? unknown }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.property);
}

/**
 * Properties of a class's instance type, inherited ones included, in the
 * order TypeScript 6's `type.getProperties()` returns them.
 * @param ctx - analysis context
 * @param cls - the class declaration
 * @returns the property symbols
 */
export function classPropertiesInTs6Order(ctx: AnalysisContext, cls: ClassDeclaration): TsSymbol[] {
  const symbol = cls.name ? ctx.checker.getSymbolAtLocation(cls.name) : undefined;
  const type = symbol ? ctx.checker.getDeclaredTypeOfSymbol(symbol) : undefined;
  if (!type) return [];
  return ts6PropertyOrder(ctx, type, ctx.checker.getPropertiesOfType(type));
}
