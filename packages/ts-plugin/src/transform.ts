"use strict";

import type ts from "typescript";
import { DEFAULT_COERCIONS, CoercionRegistry } from "./coercions";
import { createAccessorTransformer, createDeclarationAccessorTransformer } from "./transforms/accessors";
import { createModuleGeneratorTransformer } from "./transforms/module-generator";

// Re-export for use by @webda/compiler and other consumers
export { createAccessorTransformer, createDeclarationAccessorTransformer, computeCoercibleFields } from "./transforms/accessors";
export type { CoercibleFieldMap, ResolvedCoercion } from "./transforms/accessors";
export { DEFAULT_COERCIONS } from "./coercions";
export type { CoercionRegistry } from "./coercions";
export { PerfTracker } from "./perf";
export type { PerfStats } from "./perf";

/**
 * Plugin configuration for the ts-patch transformer.
 *
 * Configured in tsconfig.json:
 * ```jsonc
 * {
 *   "compilerOptions": {
 *     "plugins": [
 *       {
 *         "name": "@webda/ts-plugin",
 *         "transform": "@webda/ts-plugin/transform",
 *         "modelBases": ["MyBaseModel"],
 *         "namespace": "MyApp",
 *         "coercions": {
 *           "Decimal": { "setterType": "string | number | Decimal" }
 *         },
 *         "generateModule": true
 *       }
 *     ]
 *   }
 * }
 * ```
 */
interface TransformConfig {
  modelBases?: string[];
  namespace?: string;
  coercions?: Record<string, { setterType: string }>;
  /** If true, generates webda.module.json after declarations are emitted. Default: true */
  generateModule?: boolean;
  /** If true, all classes with coercible properties get accessor treatment. Default: false */
  accessorsForAll?: boolean;
}

/**
 * ts-patch transformer entry point for the "before" phase.
 *
 * Transforms coercible field declarations (e.g. `createdAt: Date`) into
 * getter/setter pairs backed by WEBDA_STORAGE in the emitted JavaScript.
 *
 * @param program The TypeScript program
 * @param config Plugin configuration from tsconfig.json
 * @returns A transformer factory for source files
 */
export default function transformer(
  program: ts.Program,
  config: TransformConfig
): ts.TransformerFactory<ts.SourceFile> {
  // ts-patch injects the TypeScript module into the program
  const tsModule: typeof ts = (program as any).__tsModule ?? require("typescript");

  const coercions = buildCoercions(config);
  const modelBases = new Set(["Model", "UuidModel", ...(config.modelBases ?? [])]);

  return createAccessorTransformer(tsModule, program, coercions, modelBases, undefined, config.accessorsForAll);
}

/**
 * ts-patch transformer for the "afterDeclarations" phase.
 *
 * 1. Rewrites property declarations into asymmetric getter/setter pairs in .d.ts
 * 2. Generates webda.module.json with model metadata
 *
 * @param program The TypeScript program
 * @param config Plugin configuration from tsconfig.json
 * @returns A transformer factory for declaration files
 */
export function afterDeclarations(
  program: ts.Program,
  config: TransformConfig
): ts.TransformerFactory<ts.SourceFile | ts.Bundle> {
  const tsModule: typeof ts = (program as any).__tsModule ?? require("typescript");

  const coercions = buildCoercions(config);
  const modelBases = new Set(["Model", "UuidModel", ...(config.modelBases ?? [])]);
  const generateModule = config.generateModule !== false;

  const accessorTransformer = createDeclarationAccessorTransformer(tsModule, program, coercions, modelBases, undefined, config.accessorsForAll);

  if (!generateModule) {
    return accessorTransformer;
  }

  // Chain: first transform declarations, then generate module.json
  const moduleTransformer = createModuleGeneratorTransformer(tsModule, program, {
    namespace: config.namespace,
    modelBases: config.modelBases
  });

  // Compose both transformers
  return context => {
    const accessorFn = accessorTransformer(context);
    const moduleFn = moduleTransformer(context);
    let moduleGenerated = false;

    return node => {
      const result = accessorFn(node);

      // Only run module generation once
      if (!moduleGenerated) {
        moduleGenerated = true;
        moduleFn(result);
      }

      return result;
    };
  };
}

/**
 * ts-patch hook for the "afterDiagnostics" phase.
 *
 * Filters out TS2322 errors on assignments to coercible properties on model classes,
 * where the assigned type is accepted by the widened setter (e.g. string assigned to Date field).
 *
 * This is what makes `tspc` stop reporting false type errors.
 * The LS plugin handles the same filtering for the IDE.
 */
export function afterDiagnostics(
  diagnostics: readonly ts.Diagnostic[],
  program: ts.Program,
  config: TransformConfig
): ts.Diagnostic[] {
  const tsModule: typeof ts = (program as any).__tsModule ?? require("typescript");
  const checker = program.getTypeChecker();
  const coercions = buildCoercions(config);
  const modelBases = new Set(["Model", "UuidModel", ...(config.modelBases ?? [])]);

  return diagnostics.filter(diag => {
    // Only filter TS2322: Type 'X' is not assignable to type 'Y'
    if (diag.code !== 2322) return true;
    if (diag.start === undefined || !diag.file) return true;

    const sourceFile = diag.file;
    const node = findNodeAtPosition(tsModule, sourceFile, diag.start);
    if (!node) return true;

    // Walk up to find the assignment expression
    const assignment = findAssignment(tsModule, node);
    if (!assignment) return true;

    const left = assignment.left;
    if (!tsModule.isPropertyAccessExpression(left)) return true;

    // Resolve the property symbol to its declaration
    const symbol = checker.getSymbolAtLocation(left.name);
    if (!symbol?.declarations?.length) return true;

    const propDecl = symbol.declarations[0];
    if (!tsModule.isPropertyDeclaration(propDecl)) return true;
    if (!propDecl.parent || !tsModule.isClassDeclaration(propDecl.parent)) return true;

    // Check if this class is a model
    if (!isModelClassCheck(tsModule, propDecl.parent, checker, modelBases)) return true;

    // Check if the property type is coercible
    const propType = checker.getTypeAtLocation(propDecl);
    const typeName = checker.typeToString(propType);
    const rule = coercions[typeName];
    if (!rule) return true;

    // Check if the assigned value's type is within the accepted setter types
    const assignedType = checker.getTypeAtLocation(assignment.right);
    const assignedTypeName = checker.typeToString(assignedType);
    const acceptedTypes = rule.setterType.split("|").map(t => t.trim());
    const assignedParts = assignedTypeName.split("|").map(t => t.trim());

    // Every part of the assigned union must be covered by the accepted types
    return !assignedParts.every(part => acceptedTypes.some(t => isTypeCompatible(part, t)));
  });
}

function findNodeAtPosition(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return tsModule.forEachChild(node, find) || node;
    }
    return undefined;
  }
  return find(sourceFile);
}

function findAssignment(tsModule: typeof ts, node: ts.Node): ts.BinaryExpression | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (tsModule.isBinaryExpression(current) && current.operatorToken.kind === tsModule.SyntaxKind.EqualsToken) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function isModelClassCheck(
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
    if (modelBases.has(name)) return true;

    if (!current.heritageClauses) break;
    let foundBase = false;
    for (const clause of current.heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseName = typeNode.expression.getText().split("<")[0].trim();
        if (modelBases.has(baseName)) return true;
        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol?.getDeclarations()) {
          for (const decl of baseSymbol.getDeclarations()!) {
            if (tsModule.isClassDeclaration(decl)) {
              current = decl;
              foundBase = true;
              break;
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

function isTypeCompatible(actual: string, accepted: string): boolean {
  if (actual === accepted) return true;
  if (accepted === "string" && actual.startsWith('"')) return true;
  if (accepted === "number" && /^\d+(\.\d+)?$/.test(actual)) return true;
  return false;
}

/**
 * Build the coercion registry from defaults + user config.
 */
function buildCoercions(config: TransformConfig): CoercionRegistry {
  const coercions: CoercionRegistry = { ...DEFAULT_COERCIONS };
  if (config.coercions) {
    for (const [typeName, rule] of Object.entries(config.coercions)) {
      coercions[typeName] = { setterType: rule.setterType };
    }
  }
  return coercions;
}
