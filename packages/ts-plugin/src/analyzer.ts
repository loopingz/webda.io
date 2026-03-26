

import type ts from "typescript";
import type { CoercionRegistry } from "./coercions";

/**
 * Detect if a type has a `set` method marked with `@WebdaAutoSetter` and return its parameter type(s) as a string.
 * For example, if MFA has `@WebdaAutoSetter set(secret: string)`, returns "string".
 * Returns undefined if the set method exists but lacks the JSDoc tag.
 */
function detectSetMethodType(checker: ts.TypeChecker, type: ts.Type): string | undefined {
  try {
    const setSymbol = type.getProperty("set");
    if (!setSymbol) return undefined;

    // Require @WebdaAutoSetter JSDoc tag on the set method declaration
    if (!hasWebdaAutoSetterTag(setSymbol)) return undefined;

    const setType = checker.getTypeOfSymbol(setSymbol);
    const signatures = setType.getCallSignatures();
    if (!signatures.length) return undefined;

    const params = signatures[0].getParameters();
    if (!params.length) return undefined;

    const paramTypes = params.map(p => checker.typeToString(checker.getTypeOfSymbol(p)));
    return paramTypes.join(" | ");
  } catch {
    return undefined;
  }
}

/**
 * Check if a symbol's declaration has a `@WebdaAutoSetter` JSDoc tag.
 */
function hasWebdaAutoSetterTag(symbol: ts.Symbol): boolean {
  const declarations = symbol.getDeclarations();
  if (!declarations?.length) return false;
  return declarations.some(decl => {
    const tags = (decl as any).jsDoc?.flatMap((doc: any) => doc.tags ?? []);
    return tags?.some((tag: any) => tag.tagName?.getText?.() === "WebdaAutoSetter" || tag.tagName?.escapedText === "WebdaAutoSetter");
  });
}

/**
 * A property on a model class that should have an asymmetric getter/setter.
 */
export interface CoercibleProperty {
  name: string;
  /** The declared type name (e.g. "Date") */
  typeName: string;
  /** The widened setter type (e.g. "string | number | Date") */
  setterType: string;
}

/**
 * Check if a class implements the `Accessors` marker interface.
 *
 * Looks for `implements Accessors` in the class heritage clauses.
 */
export function hasAccessorsMarker(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker
): boolean {
  const heritageClauses = classDecl.heritageClauses;
  if (!heritageClauses) return false;

  for (const clause of heritageClauses) {
    if (clause.token !== tsModule.SyntaxKind.ImplementsKeyword) continue;
    for (const typeNode of clause.types) {
      const exprText = typeNode.expression.getText();
      if (exprText === "Accessors") return true;
      // Also check via type checker for re-exported/aliased names
      const type = checker.getTypeAtLocation(typeNode);
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      if (symbol && symbol.getName() === "Accessors") return true;
    }
  }
  return false;
}

/**
 * Check if a class should have its properties transformed.
 * Returns true if it's a model class, implements the Accessors marker interface,
 * or `accessorsForAll` is enabled.
 */
export function shouldTransformClass(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  modelBases: Set<string>,
  accessorsForAll?: boolean
): boolean {
  return accessorsForAll ||
    isModelClass(tsModule, classDecl, checker, modelBases) ||
    hasAccessorsMarker(tsModule, classDecl, checker);
}

/**
 * Check if a class declaration (directly or transitively) extends one of the known model bases.
 *
 * Walks the heritage chain using the type checker to resolve base classes,
 * even when they come from external packages.
 */
export function isModelClass(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  modelBases: Set<string>
): boolean {
  const visited = new Set<string>();
  let current: ts.ClassDeclaration | undefined = classDecl;

  while (current) {
    const name = current.name?.getText() ?? "";
    if (name && visited.has(name)) break;
    if (name) visited.add(name);

    // Check if this class itself is a known base
    if (modelBases.has(name)) return true;

    // Walk heritage clauses
    const heritageClauses = current.heritageClauses;
    if (!heritageClauses) break;

    let foundBase = false;
    for (const clause of heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;

      for (const typeNode of clause.types) {
        const exprText = typeNode.expression.getText();
        // Strip generic parameters
        const baseName = exprText.split("<")[0].trim();

        if (modelBases.has(baseName)) return true;

        // Try to resolve the base class declaration via the type checker
        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol) {
          const declarations = baseSymbol.getDeclarations();
          if (declarations) {
            for (const decl of declarations) {
              if (tsModule.isClassDeclaration(decl)) {
                current = decl;
                foundBase = true;
                break;
              }
            }
          }
        }
        if (foundBase) break;
      }
      if (foundBase) break;
    }

    if (!foundBase) break;
  }

  return false;
}

/**
 * Get all properties of a class that should have widened setter types.
 *
 * Walks the class and its ancestors to find properties whose declared type
 * has an entry in the coercion registry.
 */
export function getCoercibleProperties(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  coercions: CoercionRegistry
): CoercibleProperty[] {
  const result: CoercibleProperty[] = [];
  const seen = new Set<string>();

  // Walk the class hierarchy bottom-up
  let current: ts.ClassDeclaration | undefined = classDecl;
  while (current) {
    for (const member of current.members) {
      if (!tsModule.isPropertyDeclaration(member)) continue;
      if (member.modifiers?.some(m => m.kind === tsModule.SyntaxKind.StaticKeyword)) continue;

      const name = member.name.getText();
      if (seen.has(name)) continue; // Subclass overrides take precedence
      seen.add(name);

      const propType = checker.getTypeAtLocation(member);
      const typeName = checker.typeToString(propType);
      const rule = coercions[typeName];
      if (rule) {
        result.push({ name, typeName, setterType: rule.setterType });
      } else {
        // Check if the type has a `set` method — derive setter type from its parameter
        const setMethodType = detectSetMethodType(checker, propType);
        if (setMethodType) {
          result.push({ name, typeName, setterType: `${setMethodType} | ${typeName}` });
        }
      }
    }

    // Move to parent class
    const heritageClauses = current.heritageClauses;
    if (!heritageClauses) break;

    let nextClass: ts.ClassDeclaration | undefined;
    for (const clause of heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol) {
          const declarations = baseSymbol.getDeclarations();
          if (declarations) {
            for (const decl of declarations) {
              if (tsModule.isClassDeclaration(decl)) {
                nextClass = decl;
                break;
              }
            }
          }
        }
        if (nextClass) break;
      }
      if (nextClass) break;
    }
    current = nextClass;
  }

  return result;
}
