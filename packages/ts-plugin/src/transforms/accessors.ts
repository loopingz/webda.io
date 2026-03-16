"use strict";

import type ts from "typescript";
import type { CoercionRegistry } from "../coercions";

/**
 * Resolved coercion info for a property field.
 */
export interface ResolvedCoercion {
  /** The widened setter type string (e.g. "string | number | Date" or "MFA | string") */
  setterType: string;
  /** How to coerce: "builtin" for Date etc., "set-method" for types with a set() method */
  coercionKind: "builtin" | "set-method";
  /** The original declared type name */
  typeName: string;
}

/**
 * Map of className → fieldName → coercion info.
 * Pre-computed from the program so both before and afterDeclarations transformers can use it.
 */
export type CoercibleFieldMap = Map<string, Map<string, ResolvedCoercion>>;

/**
 * Safely get the text of a node, falling back to escapedText for identifiers.
 * getText() can throw when node.getSourceFile() returns undefined (synthetic or
 * cross-file nodes resolved via the type checker).
 */
function safeGetText(node: ts.Node, sourceFile?: ts.SourceFile): string {
  try {
    return sourceFile ? node.getText(sourceFile) : node.getText();
  } catch {
    // Fallback for Identifier nodes
    if ("escapedText" in node && typeof node.escapedText === "string") {
      return node.escapedText;
    }
    return "";
  }
}

/**
 * Detect if a type has a `set` method and return its parameter type(s).
 * For example, if MFA has `set(secret: string)`, returns "string".
 */
function detectSetMethodType(
  checker: ts.TypeChecker,
  typeNode: ts.TypeNode
): string | undefined {
  try {
    const type = checker.getTypeFromTypeNode(typeNode);
    const setSymbol = type.getProperty("set");
    if (!setSymbol) return undefined;

    const setType = checker.getTypeOfSymbol(setSymbol);
    const signatures = setType.getCallSignatures();
    if (!signatures.length) return undefined;

    const params = signatures[0].getParameters();
    if (!params.length) return undefined;

    // Get all parameter types as a union
    const paramTypes = params.map(p => {
      const paramType = checker.getTypeOfSymbol(p);
      return checker.typeToString(paramType);
    });

    return paramTypes.join(" | ");
  } catch {
    return undefined;
  }
}

/**
 * Pre-compute all coercible fields for model classes in the program.
 * This scans all source files, finds model classes, and resolves coercion info
 * for each field (from static registry or `set` method detection).
 *
 * The result is shared between the `before` and `afterDeclarations` transformers.
 */
export function computeCoercibleFields(
  tsModule: typeof ts,
  program: ts.Program,
  coercions: CoercionRegistry,
  modelBases: Set<string>,
  accessorsForAll?: boolean
): CoercibleFieldMap {
  const checker = program.getTypeChecker();
  const result: CoercibleFieldMap = new Map();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    visitNode(sourceFile);
  }

  function visitNode(node: ts.Node) {
    if (tsModule.isClassDeclaration(node) && node.name) {
      if (accessorsForAll || isModelClass(tsModule, node, checker, modelBases) || hasAccessorsMarker(tsModule, node, checker)) {
        const fields = new Map<string, ResolvedCoercion>();
        const sourceFile = node.getSourceFile();

        for (const member of node.members) {
          if (!tsModule.isPropertyDeclaration(member)) continue;
          if (member.modifiers?.some(m => m.kind === tsModule.SyntaxKind.StaticKeyword)) continue;
          if (!member.type || !tsModule.isTypeReferenceNode(member.type)) continue;

          // Check no existing getter/setter
          const fieldName = safeGetText(member.name, sourceFile);
          const hasAccessor = node.members.some(
            m =>
              (tsModule.isGetAccessorDeclaration(m) || tsModule.isSetAccessorDeclaration(m)) &&
              safeGetText(m.name, sourceFile) === fieldName
          );
          if (hasAccessor) continue;

          const typeName = safeGetText(member.type.typeName, sourceFile);

          // Check static coercion registry first
          const rule = coercions[typeName];
          if (rule) {
            fields.set(fieldName, {
              setterType: rule.setterType,
              coercionKind: "builtin",
              typeName
            });
            continue;
          }

          // Check if the type has a `set` method
          const setParamType = detectSetMethodType(checker, member.type);
          if (setParamType) {
            fields.set(fieldName, {
              setterType: `${setParamType} | ${typeName}`,
              coercionKind: "set-method",
              typeName
            });
          }
        }

        if (fields.size > 0) {
          result.set(safeGetText(node.name, node.getSourceFile()), fields);
        }
      }
    }
    tsModule.forEachChild(node, visitNode);
  }

  return result;
}

/**
 * Creates a transformer that rewrites coercible field declarations into
 * getter/setter pairs backed by `this[WEBDA_STORAGE]`.
 *
 * Supports:
 * - Static coercions (Date → string | number | Date)
 * - Dynamic coercions (types with a `set` method → OriginalType | SetParamType)
 */
export function createAccessorTransformer(
  tsModule: typeof ts,
  program: ts.Program,
  coercions: CoercionRegistry,
  modelBases: Set<string>,
  coercibleFields?: CoercibleFieldMap,
  accessorsForAll?: boolean
): ts.TransformerFactory<ts.SourceFile> {
  const checker = program.getTypeChecker();
  const fields = coercibleFields ?? computeCoercibleFields(tsModule, program, coercions, modelBases, accessorsForAll);

  return context => {
    return sourceFile => {
      let needsStorageImport = false;

      // Check if WEBDA_STORAGE is already imported in this file
      const hasStorageImport = sourceFile.statements.some(stmt => {
        if (!tsModule.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) return false;
        if (!tsModule.isNamedImports(stmt.importClause.namedBindings)) return false;
        return stmt.importClause.namedBindings.elements.some(
          el => el.name.getText(sourceFile) === "WEBDA_STORAGE"
        );
      });

      const transformed = tsModule.visitNode(sourceFile, function visit(node: ts.Node): ts.Node {
        if (!tsModule.isClassDeclaration(node)) {
          return tsModule.visitEachChild(node, visit, context);
        }

        const classDecl = node;
        const className = classDecl.name ? safeGetText(classDecl.name, sourceFile) : "";
        const classFields = fields.get(className);
        if (!classFields || classFields.size === 0) {
          return tsModule.visitEachChild(node, visit, context);
        }

        const remainingMembers: ts.ClassElement[] = [];
        const fieldsToTransform: Array<{ name: string; coercion: ResolvedCoercion }> = [];

        for (const member of classDecl.members) {
          if (tsModule.isPropertyDeclaration(member) && member.type) {
            const fieldName = safeGetText(member.name, sourceFile);
            const coercion = classFields.get(fieldName);
            if (coercion) {
              fieldsToTransform.push({ name: fieldName, coercion });
              continue;
            }
          }
          remainingMembers.push(member);
        }

        if (fieldsToTransform.length === 0) {
          return tsModule.visitEachChild(node, visit, context);
        }

        const isModel = isModelClass(tsModule, classDecl, checker, modelBases);
        const newMembers: ts.ClassElement[] = [...remainingMembers];

        // For non-model classes with Accessors marker, inject WEBDA_STORAGE initialization
        if (!isModel) {
          needsStorageImport = true;
          const hasStorage = classDecl.members.some(
            m => tsModule.isPropertyDeclaration(m) && safeGetText(m.name, sourceFile) === "WEBDA_STORAGE"
          );
          if (!hasStorage) {
            // [WEBDA_STORAGE] = {};
            const storageProp = context.factory.createPropertyDeclaration(
              undefined,
              context.factory.createComputedPropertyName(
                context.factory.createIdentifier("WEBDA_STORAGE")
              ),
              undefined,
              undefined,
              context.factory.createObjectLiteralExpression()
            );
            newMembers.unshift(storageProp);
          }
        }

        for (const field of fieldsToTransform) {
          // Getter: get fieldName() { return this[WEBDA_STORAGE]["fieldName"]; }
          const getter = context.factory.createGetAccessorDeclaration(
            undefined,
            context.factory.createIdentifier(field.name),
            [],
            undefined,
            context.factory.createBlock([
              context.factory.createReturnStatement(
                context.factory.createElementAccessExpression(
                  context.factory.createElementAccessExpression(
                    context.factory.createThis(),
                    context.factory.createIdentifier("WEBDA_STORAGE")
                  ),
                  context.factory.createStringLiteral(field.name)
                )
              )
            ])
          );

          // Setter with coercion
          const valueParam = context.factory.createParameterDeclaration(
            undefined,
            undefined,
            context.factory.createIdentifier("value")
          );

          const setterBody = createSetterBody(tsModule, context.factory, field.name, field.coercion);

          const setter = context.factory.createSetAccessorDeclaration(
            undefined,
            context.factory.createIdentifier(field.name),
            [valueParam],
            context.factory.createBlock(setterBody)
          );

          newMembers.push(getter, setter);
        }

        return context.factory.updateClassDeclaration(
          classDecl,
          classDecl.modifiers,
          classDecl.name,
          classDecl.typeParameters,
          classDecl.heritageClauses,
          newMembers
        );
      }) as ts.SourceFile;

      // Inject WEBDA_STORAGE import if needed and not already present
      if (needsStorageImport && !hasStorageImport) {
        // Find the best import source by checking where WEBDA_STORAGE is exported
        const storageSource = findStorageImportSource(tsModule, program, sourceFile);

        const importDecl = context.factory.createImportDeclaration(
          undefined,
          context.factory.createImportClause(
            false,
            undefined,
            context.factory.createNamedImports([
              context.factory.createImportSpecifier(false, undefined, context.factory.createIdentifier("WEBDA_STORAGE"))
            ])
          ),
          context.factory.createStringLiteral(storageSource)
        );

        return context.factory.updateSourceFile(transformed, [importDecl, ...transformed.statements]);
      }

      return transformed;
    };
  };
}

/**
 * Creates a declaration transformer that rewrites property declarations
 * into asymmetric getter/setter pairs in the .d.ts output.
 *
 * Uses the pre-computed CoercibleFieldMap so it doesn't need to introspect
 * types from declaration file nodes.
 */
export function createDeclarationAccessorTransformer(
  tsModule: typeof ts,
  program: ts.Program,
  coercions: CoercionRegistry,
  modelBases: Set<string>,
  coercibleFields?: CoercibleFieldMap,
  accessorsForAll?: boolean
): ts.TransformerFactory<ts.SourceFile | ts.Bundle> {
  const fields = coercibleFields ?? computeCoercibleFields(tsModule, program, coercions, modelBases, accessorsForAll);

  return context => {
    return node => {
      if (tsModule.isBundle(node)) return node;
      const sourceFile = node as ts.SourceFile;

      return tsModule.visitNode(sourceFile, function visit(n: ts.Node): ts.Node {
        if (!tsModule.isClassDeclaration(n)) {
          return tsModule.visitEachChild(n, visit, context);
        }

        const classDecl = n;
        const className = classDecl.name ? safeGetText(classDecl.name, sourceFile) : "";
        const classFields = fields.get(className);
        if (!classFields || classFields.size === 0) {
          return tsModule.visitEachChild(n, visit, context);
        }

        const fieldsToTransform: Array<{ name: string; coercion: ResolvedCoercion; typeNode: ts.TypeNode }> = [];
        const remainingMembers: ts.ClassElement[] = [];

        for (const member of classDecl.members) {
          if (
            tsModule.isPropertyDeclaration(member) &&
            member.type &&
            tsModule.isTypeReferenceNode(member.type)
          ) {
            const fieldName = safeGetText(member.name, sourceFile);
            const coercion = classFields.get(fieldName);

            if (coercion) {
              fieldsToTransform.push({
                name: fieldName,
                coercion,
                typeNode: member.type
              });
              continue;
            }
          }
          remainingMembers.push(member);
        }

        if (fieldsToTransform.length === 0) {
          return tsModule.visitEachChild(n, visit, context);
        }

        const newMembers: ts.ClassElement[] = [...remainingMembers];

        for (const field of fieldsToTransform) {
          // get fieldName(): OriginalType;
          const getter = context.factory.createGetAccessorDeclaration(
            undefined,
            context.factory.createIdentifier(field.name),
            [],
            field.typeNode,
            undefined // no body in .d.ts
          );

          // set fieldName(value: WidenedType);
          const setterType = createUnionTypeNode(tsModule, context.factory, field.coercion.setterType);
          const setter = context.factory.createSetAccessorDeclaration(
            undefined,
            context.factory.createIdentifier(field.name),
            [
              context.factory.createParameterDeclaration(
                undefined,
                undefined,
                context.factory.createIdentifier("value"),
                undefined,
                setterType
              )
            ],
            undefined // no body in .d.ts
          );

          newMembers.push(getter, setter);
        }

        return context.factory.updateClassDeclaration(
          classDecl,
          classDecl.modifiers,
          classDecl.name,
          classDecl.typeParameters,
          classDecl.heritageClauses,
          newMembers
        );
      }) as ts.SourceFile;
    };
  };
}

/**
 * Create the setter body statements based on coercion kind.
 */
function createSetterBody(
  tsModule: typeof ts,
  factory: ts.NodeFactory,
  fieldName: string,
  coercion: ResolvedCoercion
): ts.Statement[] {
  const storageAccess = factory.createElementAccessExpression(
    factory.createElementAccessExpression(
      factory.createThis(),
      factory.createIdentifier("WEBDA_STORAGE")
    ),
    factory.createStringLiteral(fieldName)
  );

  if (coercion.coercionKind === "builtin") {
    // For Date: this[WEBDA_STORAGE]["field"] = value != null ? new Date(value) : value;
    const coerceExpr = createBuiltinCoercionExpression(tsModule, factory, coercion.typeName, "value");
    return [
      factory.createExpressionStatement(
        factory.createAssignment(storageAccess, coerceExpr)
      )
    ];
  }

  // For set-method types:
  // if (value instanceof TypeName) {
  //   this[WEBDA_STORAGE]["field"] = value;
  // } else if (value != null) {
  //   const inst = this[WEBDA_STORAGE]["field"] || new TypeName();
  //   inst.set(value);
  //   this[WEBDA_STORAGE]["field"] = inst;
  // } else {
  //   this[WEBDA_STORAGE]["field"] = value;
  // }
  const valueId = factory.createIdentifier("value");
  const typeId = factory.createIdentifier(coercion.typeName);

  return [
    factory.createIfStatement(
      // value instanceof TypeName
      factory.createBinaryExpression(
        valueId,
        tsModule.SyntaxKind.InstanceOfKeyword,
        typeId
      ),
      // then: assign directly
      factory.createBlock([
        factory.createExpressionStatement(
          factory.createAssignment(storageAccess, valueId)
        )
      ]),
      // else if value != null
      factory.createIfStatement(
        factory.createBinaryExpression(
          valueId,
          tsModule.SyntaxKind.ExclamationEqualsToken,
          factory.createNull()
        ),
        factory.createBlock([
          // const inst = this[WEBDA_STORAGE]["field"] || new TypeName();
          factory.createVariableStatement(
            undefined,
            factory.createVariableDeclarationList([
              factory.createVariableDeclaration(
                "inst",
                undefined,
                undefined,
                factory.createBinaryExpression(
                  factory.createElementAccessExpression(
                    factory.createElementAccessExpression(
                      factory.createThis(),
                      factory.createIdentifier("WEBDA_STORAGE")
                    ),
                    factory.createStringLiteral(fieldName)
                  ),
                  tsModule.SyntaxKind.BarBarToken,
                  factory.createNewExpression(typeId, undefined, [])
                )
              )
            ], tsModule.NodeFlags.Const)
          ),
          // inst.set(value);
          factory.createExpressionStatement(
            factory.createCallExpression(
              factory.createPropertyAccessExpression(
                factory.createIdentifier("inst"),
                "set"
              ),
              undefined,
              [valueId]
            )
          ),
          // this[WEBDA_STORAGE]["field"] = inst;
          factory.createExpressionStatement(
            factory.createAssignment(
              factory.createElementAccessExpression(
                factory.createElementAccessExpression(
                  factory.createThis(),
                  factory.createIdentifier("WEBDA_STORAGE")
                ),
                factory.createStringLiteral(fieldName)
              ),
              factory.createIdentifier("inst")
            )
          )
        ]),
        // else: assign null/undefined
        factory.createBlock([
          factory.createExpressionStatement(
            factory.createAssignment(storageAccess, valueId)
          )
        ])
      )
    )
  ];
}

/**
 * Create a builtin coercion expression (Date, etc.)
 */
function createBuiltinCoercionExpression(
  tsModule: typeof ts,
  factory: ts.NodeFactory,
  typeName: string,
  valueVar: string
): ts.Expression {
  const valueId = factory.createIdentifier(valueVar);

  switch (typeName) {
    case "Date":
      // value !== undefined && value !== null ? new Date(value) : value
      return factory.createConditionalExpression(
        factory.createBinaryExpression(
          factory.createBinaryExpression(
            valueId,
            tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
            factory.createIdentifier("undefined")
          ),
          tsModule.SyntaxKind.AmpersandAmpersandToken,
          factory.createBinaryExpression(
            factory.createIdentifier(valueVar),
            tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
            factory.createNull()
          )
        ),
        factory.createToken(tsModule.SyntaxKind.QuestionToken),
        factory.createNewExpression(factory.createIdentifier("Date"), undefined, [
          factory.createIdentifier(valueVar)
        ]),
        factory.createToken(tsModule.SyntaxKind.ColonToken),
        factory.createIdentifier(valueVar)
      );
    default:
      return valueId;
  }
}

/**
 * Find the best import source for WEBDA_STORAGE.
 *
 * Checks if WEBDA_STORAGE is exported from a source file in the same project (relative import)
 * or falls back to "@webda/models".
 */
function findStorageImportSource(
  tsModule: typeof ts,
  program: ts.Program,
  currentFile: ts.SourceFile
): string {
  const checker = program.getTypeChecker();

  // Look for WEBDA_STORAGE in the program's source files
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf === currentFile) continue;
    for (const stmt of sf.statements) {
      if (!tsModule.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (tsModule.isIdentifier(decl.name) && decl.name.text === "WEBDA_STORAGE") {
          // Check if it's exported
          const isExported = stmt.modifiers?.some(m => m.kind === tsModule.SyntaxKind.ExportKeyword);
          if (isExported) {
            // Compute relative path
            const { dirname, relative, basename } = require("path") as typeof import("path");
            const from = dirname(currentFile.fileName);
            let rel = relative(from, sf.fileName)
              .replace(/\\/g, "/")
              .replace(/\.ts$/, ".js");
            if (!rel.startsWith(".")) rel = "./" + rel;
            return rel;
          }
        }
      }
    }
  }

  return "@webda/models";
}

/**
 * Check if a class implements the `Accessors` marker interface.
 */
function hasAccessorsMarker(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker
): boolean {
  const heritageClauses = classDecl.heritageClauses;
  if (!heritageClauses) return false;

  for (const clause of heritageClauses) {
    if (clause.token !== tsModule.SyntaxKind.ImplementsKeyword) continue;
    for (const typeNode of clause.types) {
      const exprText = safeGetText(typeNode.expression);
      if (exprText === "Accessors") return true;
      const type = checker.getTypeAtLocation(typeNode);
      const symbol = type.getSymbol() ?? type.aliasSymbol;
      if (symbol && symbol.getName() === "Accessors") return true;
    }
  }
  return false;
}

/**
 * Walk the class hierarchy via the type checker to find model bases.
 */
function isModelClass(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  modelBases: Set<string>
): boolean {
  const visited = new Set<string>();
  let current: ts.ClassDeclaration | undefined = classDecl;

  while (current) {
    const name = current.name ? safeGetText(current.name) : "";
    if (name && visited.has(name)) break;
    if (name) visited.add(name);
    if (modelBases.has(name)) return true;

    const heritageClauses = current.heritageClauses;
    if (!heritageClauses) break;

    let foundBase = false;
    for (const clause of heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseName = safeGetText(typeNode.expression).split("<")[0].trim();
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

/**
 * Parse a setter type string like "string | number | Date" into a ts.UnionTypeNode.
 */
function createUnionTypeNode(tsModule: typeof ts, factory: ts.NodeFactory, setterType: string): ts.TypeNode {
  const types = setterType.split("|").map(t => t.trim());
  const typeNodes = types.map(t => {
    switch (t) {
      case "string":
        return factory.createKeywordTypeNode(tsModule.SyntaxKind.StringKeyword);
      case "number":
        return factory.createKeywordTypeNode(tsModule.SyntaxKind.NumberKeyword);
      case "boolean":
        return factory.createKeywordTypeNode(tsModule.SyntaxKind.BooleanKeyword);
      default:
        return factory.createTypeReferenceNode(t);
    }
  });
  return types.length === 1 ? typeNodes[0] : factory.createUnionTypeNode(typeNodes);
}
