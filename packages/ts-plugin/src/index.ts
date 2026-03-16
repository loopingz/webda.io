"use strict";

import type ts from "typescript";
import { CoercionRegistry, DEFAULT_COERCIONS } from "./coercions";
import { shouldTransformClass, getCoercibleProperties, CoercibleProperty } from "./analyzer";

/**
 * Plugin configuration from tsconfig.json:
 *
 * ```jsonc
 * {
 *   "compilerOptions": {
 *     "plugins": [
 *       {
 *         "name": "@webda/ts-plugin",
 *         // Optional: additional model base class names beyond Model/UuidModel
 *         "modelBases": ["MyBaseModel"],
 *         // Optional: additional coercion rules
 *         "coercions": {
 *           "Decimal": { "setterType": "string | number | Decimal" }
 *         }
 *       }
 *     ]
 *   }
 * }
 * ```
 */
interface PluginConfig {
  modelBases?: string[];
  coercions?: Record<string, { setterType: string }>;
  /** If true, all classes with coercible properties get accessor treatment (no marker needed). */
  accessorsForAll?: boolean;
}

function init(modules: { typescript: typeof ts }): ts.server.PluginModule {
  const tsModule = modules.typescript;

  function create(info: ts.server.PluginCreateInfo): ts.LanguageService {
    const config: PluginConfig = info.config ?? {};
    const log = (msg: string) => info.project.projectService.logger.info(`[@webda/ts-plugin] ${msg}`);

    log("Initializing plugin");

    // Build the coercion registry from defaults + user config
    const coercions: CoercionRegistry = { ...DEFAULT_COERCIONS };
    if (config.coercions) {
      for (const [typeName, rule] of Object.entries(config.coercions)) {
        coercions[typeName] = { setterType: rule.setterType };
      }
    }

    // Model base classes to recognize
    const modelBases = new Set(["Model", "UuidModel", ...(config.modelBases ?? [])]);
    const accessorsForAll = config.accessorsForAll ?? false;

    const proxy = createProxy(info.languageService);

    // Override getQuickInfoAtPosition to show widened setter types on hover
    proxy.getQuickInfoAtPosition = (fileName: string, position: number) => {
      const original = info.languageService.getQuickInfoAtPosition(fileName, position);
      if (!original) return original;

      const program = info.languageService.getProgram();
      if (!program) return original;

      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return original;

      const checker = program.getTypeChecker();
      const node = findNodeAtPosition(tsModule, sourceFile, position);
      if (!node) return original;

      // Only intercept property declarations on model classes
      const propInfo = getPropertyInfo(tsModule, node, checker);
      if (!propInfo) return original;

      const { classDecl, propName, propType } = propInfo;
      if (!shouldTransformClass(tsModule, classDecl, checker, modelBases, accessorsForAll)) return original;

      // Find the coercible property info (static registry + set method detection)
      const coercibleProps = getCoercibleProperties(tsModule, classDecl, checker, coercions);
      const coercible = coercibleProps.find(p => p.name === propName);
      if (!coercible) return original;

      const typeName = coercible.typeName;

      // Rewrite the display parts to show asymmetric accessor
      const displayParts: ts.SymbolDisplayPart[] = [
        { text: "(property) ", kind: "text" },
        { text: propName, kind: "propertyName" },
        { text: ": ", kind: "punctuation" },
        { text: typeName, kind: "keyword" },
        { text: "\n", kind: "lineBreak" },
        { text: `  get ${propName}(): ${typeName}`, kind: "text" },
        { text: "\n", kind: "lineBreak" },
        { text: `  set ${propName}(value: ${coercible.setterType})`, kind: "text" }
      ];

      return {
        ...original,
        displayParts
      };
    };

    // Override getCompletionEntryDetails to show setter type in completions
    proxy.getCompletionEntryDetails = (
      fileName: string,
      position: number,
      entryName: string,
      formatOptions: ts.FormatCodeOptions | ts.FormatCodeSettings | undefined,
      source: string | undefined,
      preferences: ts.UserPreferences | undefined,
      data: ts.CompletionEntryData | undefined
    ) => {
      const original = info.languageService.getCompletionEntryDetails(
        fileName,
        position,
        entryName,
        formatOptions,
        source,
        preferences,
        data
      );
      // Future: could augment completion details for coercible properties
      return original;
    };

    // Override getSemanticDiagnostics to suppress type errors on widened setter assignments
    proxy.getSemanticDiagnostics = (fileName: string) => {
      const diagnostics = info.languageService.getSemanticDiagnostics(fileName);
      const program = info.languageService.getProgram();
      if (!program) return diagnostics;

      const sourceFile = program.getSourceFile(fileName);
      if (!sourceFile) return diagnostics;

      const checker = program.getTypeChecker();

      return diagnostics.filter(diag => {
        // Only filter type assignment errors (TS2322: Type 'X' is not assignable to type 'Y')
        if (diag.code !== 2322) return true;
        if (diag.start === undefined) return true;

        const node = findNodeAtPosition(tsModule, sourceFile, diag.start);
        if (!node) return true;

        // Check if this is an assignment to a coercible property on a model
        const assignment = getAssignmentTarget(tsModule, node, checker);
        if (!assignment) return true;

        const { classDecl, propName, propType } = assignment;
        if (!shouldTransformClass(tsModule, classDecl, checker, modelBases, accessorsForAll)) return true;

        // Use getCoercibleProperties which handles both static registry and set method detection
        const coercibleProps = getCoercibleProperties(tsModule, classDecl, checker, coercions);
        const coercible = coercibleProps.find(p => p.name === propName);
        if (!coercible) return true;

        // Check if the assigned value's type is within the widened setter type
        const assignedNode = getAssignedValue(tsModule, node);
        if (!assignedNode) return true;

        const assignedType = checker.getTypeAtLocation(assignedNode);
        const assignedTypeName = checker.typeToString(assignedType);

        // Check if the assigned type is accepted by the setter
        // Split assigned type in case it's a union (e.g. "string | SecretString")
        const acceptedTypes = coercible.setterType.split("|").map(t => t.trim());
        const assignedParts = assignedTypeName.split("|").map(t => t.trim());
        if (assignedParts.every(part => acceptedTypes.some(t => isTypeAssignable(part, t)))) {
          log(`Suppressing TS2322 for ${propName}: ${assignedTypeName} is accepted by setter (${coercible.setterType})`);
          return false; // Suppress this diagnostic
        }

        return true;
      });
    };

    log("Plugin ready");
    return proxy;
  }

  return { create };
}

/**
 * Create a proxy that delegates all LanguageService methods to the original.
 */
function createProxy(ls: ts.LanguageService): ts.LanguageService {
  const proxy = Object.create(null) as ts.LanguageService;
  for (const k of Object.keys(ls) as Array<keyof ts.LanguageService>) {
    const value = ls[k];
    // @ts-ignore - proxy delegation
    proxy[k] = typeof value === "function" ? (...args: any[]) => (value as Function).apply(ls, args) : value;
  }
  return proxy;
}

/**
 * Find the innermost node at a given position in the source file.
 */
function findNodeAtPosition(tsModule: typeof ts, sourceFile: ts.SourceFile, position: number): ts.Node | undefined {
  function find(node: ts.Node): ts.Node | undefined {
    if (position >= node.getStart(sourceFile) && position < node.getEnd()) {
      return tsModule.forEachChild(node, find) || node;
    }
    return undefined;
  }
  return find(sourceFile);
}

/**
 * If the node is a property declaration or property name in a class, return info about it.
 */
function getPropertyInfo(
  tsModule: typeof ts,
  node: ts.Node,
  checker: ts.TypeChecker
): { classDecl: ts.ClassDeclaration; propName: string; propType: ts.Type } | undefined {
  let propDecl: ts.PropertyDeclaration | undefined;

  if (tsModule.isPropertyDeclaration(node)) {
    propDecl = node;
  } else if (tsModule.isIdentifier(node) && node.parent && tsModule.isPropertyDeclaration(node.parent)) {
    propDecl = node.parent;
  }

  if (!propDecl) return undefined;
  if (!propDecl.parent || !tsModule.isClassDeclaration(propDecl.parent)) return undefined;
  if (propDecl.modifiers?.some(m => m.kind === tsModule.SyntaxKind.StaticKeyword)) return undefined;

  const propName = propDecl.name.getText();
  const propType = checker.getTypeAtLocation(propDecl);

  return { classDecl: propDecl.parent, propName, propType };
}

/**
 * If the node is part of an assignment expression targeting a property on a model instance,
 * return the class declaration, property name, and declared property type.
 */
function getAssignmentTarget(
  tsModule: typeof ts,
  node: ts.Node,
  checker: ts.TypeChecker
): { classDecl: ts.ClassDeclaration; propName: string; propType: ts.Type } | undefined {
  // Walk up to find the assignment expression
  let current = node;
  while (current && !tsModule.isBinaryExpression(current)) {
    current = current.parent;
  }
  if (!current || !tsModule.isBinaryExpression(current)) return undefined;
  if (current.operatorToken.kind !== tsModule.SyntaxKind.EqualsToken) return undefined;

  const left = current.left;
  if (!tsModule.isPropertyAccessExpression(left)) return undefined;

  const propName = left.name.getText();
  const symbol = checker.getSymbolAtLocation(left.name);
  if (!symbol) return undefined;

  // Find the property declaration
  const declarations = symbol.getDeclarations();
  if (!declarations || declarations.length === 0) return undefined;

  const propDecl = declarations[0];
  if (!tsModule.isPropertyDeclaration(propDecl)) return undefined;
  if (!propDecl.parent || !tsModule.isClassDeclaration(propDecl.parent)) return undefined;

  const propType = checker.getTypeAtLocation(propDecl);
  return { classDecl: propDecl.parent, propName, propType };
}

/**
 * Get the right-hand side of an assignment expression containing the given node.
 */
function getAssignedValue(tsModule: typeof ts, node: ts.Node): ts.Node | undefined {
  let current = node;
  while (current && !tsModule.isBinaryExpression(current)) {
    current = current.parent;
  }
  if (!current || !tsModule.isBinaryExpression(current)) return undefined;
  return current.right;
}

/**
 * Simple check if an actual type name is assignable to an accepted type name.
 * Handles basic cases like "string" assignable to "string", "Date" to "Date".
 */
function isTypeAssignable(actual: string, accepted: string): boolean {
  if (actual === accepted) return true;
  // Handle literal string types (e.g., '"2024-01-01"' is assignable to 'string')
  if (accepted === "string" && actual.startsWith('"')) return true;
  // Handle numeric literals
  if (accepted === "number" && /^\d+$/.test(actual)) return true;
  return false;
}

export = init;
