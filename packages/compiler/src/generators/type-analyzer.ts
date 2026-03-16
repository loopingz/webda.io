import ts from "typescript";
import { existsSync } from "node:fs";
import { dirname, join } from "path";
import { FileUtils } from "@webda/utils";

/**
 * TypeScript type analysis utilities
 * Provides methods for analyzing types, hierarchies, and packages
 */
export class TypeAnalyzer {
  constructor(private typeChecker: ts.TypeChecker) {}

  /**
   * Get the class hierarchy for a type
   */
  getClassTree(type: ts.Type): ts.Type[] {
    const res = [type];
    let current = type;

    while (current.getBaseTypes()) {
      current = current.getBaseTypes()![0];
      if (!current || !current.symbol) {
        break;
      }

      if (current.symbol.valueDeclaration) {
        current = this.typeChecker.getTypeAtLocation(current.symbol.valueDeclaration);
        res.push(current);
      } else {
        break;
      }
    }

    return res;
  }

  /**
   * Check if a type extends a certain base type (packageName/symbolName)
   */
  extends(types: ts.Type[], packageName: string, symbolName: string): boolean {
    for (const type of types) {
      if (type.symbol?.name === symbolName && this.getPackageFromType(type) === packageName) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the package name for a type
   */
  getPackageFromType(type: ts.Type): string | undefined {
    const fileName = type.symbol.getDeclarations()?.[0]?.getSourceFile()?.fileName;
    if (!fileName) {
      return undefined;
    }

    let folder = dirname(fileName);
    // if / or C:
    while (folder.length > 2) {
      const pkg = join(folder, "package.json");
      if (existsSync(pkg)) {
        return FileUtils.load(pkg).name;
      }
      folder = dirname(folder);
    }
    return undefined;
  }

  /**
   * Get a schema node for a typed parameter
   * Looks for ServiceParameters or other generic type in class hierarchy
   */
  getSchemaNode(
    classTree: ts.Type[],
    typeName: string = "ServiceParameters",
    packageName: string = "@webda/core"
  ): ts.Node | undefined {
    let schemaNode: ts.Node | undefined;

    classTree.some(type => {
      const res = (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).heritageClauses?.some(t => {
        return t.types?.some(subtype => {
          return subtype.typeArguments?.some(arg => {
            if (this.extends(this.getClassTree(this.typeChecker.getTypeFromTypeNode(arg)), packageName, typeName)) {
              schemaNode = arg;
              return true;
            }
          });
        });
      });

      if (res) {
        return true;
      }

      return (<ts.ClassDeclaration>(<unknown>type.symbol.valueDeclaration)).typeParameters?.some(t => {
        // @ts-ignore
        const paramType = ts.getEffectiveConstraintOfTypeParameter(t);
        if (this.extends(this.getClassTree(this.typeChecker.getTypeFromTypeNode(paramType)), packageName, typeName)) {
          schemaNode = t.constraint;
          return true;
        }
      });
    });

    return schemaNode;
  }

  /**
   * Resolve symbol aliases
   */
  resolveAliases(sym: ts.Symbol | undefined): ts.Symbol | undefined {
    if (!sym) return sym;
    return sym.flags & ts.SymbolFlags.Alias ? this.typeChecker.getAliasedSymbol(sym) : sym;
  }

  /**
   * Check if a property is keyed by a specific symbol
   */
  propertyIsKeyedBySymbol(propSym: ts.Symbol, packageName: string, symbolName: string): boolean {
    for (const d of propSym.getDeclarations() ?? []) {
      const name = (d as ts.NamedDeclaration).name;
      if (name && ts.isComputedPropertyName(name)) {
        const keyExprSym = this.resolveAliases(this.typeChecker.getSymbolAtLocation(name.expression));
        if (
          keyExprSym &&
          keyExprSym.getName() === symbolName &&
          this.getPackageFromType(this.typeChecker.getTypeAtLocation(keyExprSym.valueDeclaration!)) === packageName
        ) {
          return true;
        }
      }
    }
    return false;
  }
}
