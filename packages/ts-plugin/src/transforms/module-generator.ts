

import type ts from "typescript";
import * as fs from "fs";
import * as path from "path";

/**
 * Model metadata extracted from the TypeScript AST at compile time.
 * Mirrors the structure in @webda/compiler's definition.ts.
 */
export interface ModelMetadata {
  Identifier: string;
  Import: string;
  Plural: string;
  Reflection: Record<string, { type: string; required: boolean }>;
  Relations: {
    parent?: { attribute: string; model: string };
    links?: Array<{ attribute: string; model: string; type: string }>;
    queries?: Array<{ attribute: string; model: string; targetAttribute: string }>;
    binaries?: Array<{ attribute: string; cardinality: string }>;
  };
  Ancestors: string[];
  Subclasses: string[];
  PrimaryKey: string[];
  Events: string[];
  Actions: Record<string, any>;
}

export interface ServiceMetadata {
  Import: string;
}

export interface WebdaModuleJson {
  $schema: string;
  models: Record<string, ModelMetadata>;
  moddas?: Record<string, ServiceMetadata>;
  beans?: Record<string, ServiceMetadata>;
  deployers?: Record<string, ServiceMetadata>;
  schemas: Record<string, any>;
}

/** JSDoc tags used by Webda to mark special classes */
const WEBDA_TAGS = {
  model: "WebdaModel",
  modda: "WebdaModda",
  bean: "Bean",
  deployer: "WebdaDeployer",
  ignore: "WebdaIgnore",
  schema: "WebdaSchema"
};

/** Known relation types and their generic parameter mapping */
const RELATION_TYPES: Record<string, string> = {
  ModelParent: "parent",
  ModelLink: "LINK",
  ModelLinksArray: "LINKS_ARRAY",
  ModelLinksSimpleArray: "LINKS_SIMPLE_ARRAY",
  ModelRefCustomMap: "LINKS_MAP",
  ModelsMapped: "map",
  ModelRelated: "query",
  ModelRef: "LINK",
  ModelRefWithCreate: "LINK"
};

/**
 * Creates a post-emit transformer that generates webda.module.json.
 *
 * This runs as an `afterDeclarations` transformer via ts-patch, which means
 * it executes after all .d.ts files have been emitted. It analyzes the
 * program's type information and writes the module metadata file.
 *
 * This is a scaffold that covers the core extraction logic. The full
 * @webda/compiler module.ts (1200+ lines) handles additional edge cases,
 * JSON schema generation, and metadata plugins — those can be migrated
 * incrementally.
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @param config - namespace and model base configuration
 * @param config.namespace - the module namespace
 * @param config.modelBases - additional model base class names
 * @returns the transformer factory
 */
export function createModuleGeneratorTransformer(
  tsModule: typeof ts,
  program: ts.Program,
  config: { namespace?: string; modelBases?: string[] }
): ts.TransformerFactory<ts.SourceFile | ts.Bundle> {
  const checker = program.getTypeChecker();
  const modelBases = new Set(["Model", "UuidModel", ...(config.modelBases ?? [])]);

  // Read package.json to determine namespace
  const rootDir = program.getCompilerOptions().rootDir ?? program.getCurrentDirectory();
  const packageJsonPath = findPackageJson(rootDir);
  let namespace = config.namespace ?? "Webda";
  if (packageJsonPath) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      if (pkg.webda?.namespace) {
        namespace = pkg.webda.namespace;
      } else if (pkg.name?.startsWith("@")) {
        const ns = pkg.name.split("/")[0].substring(1);
        namespace = ns.charAt(0).toUpperCase() + ns.slice(1);
      }
    } catch {
      // Use default namespace
    }
  }

  return context => {
    return node => {
      // Only run once (on the first source file or bundle)
      if (tsModule.isBundle(node)) return node;

      // Analyze the full program, not just this file
      const moduleJson = analyzeProgram(tsModule, program, checker, namespace, modelBases);

      // Write webda.module.json next to package.json
      const outDir = packageJsonPath ? path.dirname(packageJsonPath) : rootDir;
      const outputPath = path.join(outDir, "webda.module.json");
      fs.writeFileSync(outputPath, JSON.stringify(moduleJson, null, 2));

      // Return the node unchanged — we only emit the side-effect file
      return node;
    };
  };
}

/**
 * Analyze the full TypeScript program to extract Webda module metadata.
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @param checker - the type checker
 * @param namespace - the module namespace
 * @param modelBases - set of known model base class names
 * @returns the module metadata
 */
function analyzeProgram(
  tsModule: typeof ts,
  program: ts.Program,
  checker: ts.TypeChecker,
  namespace: string,
  modelBases: Set<string>
): WebdaModuleJson {
  const result: WebdaModuleJson = {
    $schema: "https://webda.io/schemas/webda.module.v4.json",
    models: {},
    moddas: {},
    beans: {},
    deployers: {},
    schemas: {}
  };

  for (const sourceFile of program.getSourceFiles()) {
    // Skip declaration files and node_modules
    if (sourceFile.isDeclarationFile) continue;
    if (sourceFile.fileName.includes("node_modules")) continue;
    if (sourceFile.fileName.endsWith(".spec.ts") || sourceFile.fileName.endsWith(".test.ts")) continue;

    tsModule.forEachChild(sourceFile, node => {
      if (!tsModule.isClassDeclaration(node)) return;
      if (!node.name) return;

      const tags = getJsDocTags(tsModule, node);
      if (tags.has(WEBDA_TAGS.ignore)) return;

      // Check if exported
      const isExported = node.modifiers?.some(
        m => m.kind === tsModule.SyntaxKind.ExportKeyword || m.kind === tsModule.SyntaxKind.DefaultKeyword
      );
      if (!isExported) return;

      const className = node.name.getText();
      const identifier = `${namespace}/${className}`;

      // Determine the import path (relative to outDir)
      const outDir = program.getCompilerOptions().outDir ?? ".";
      const relativePath = path
        .relative(program.getCurrentDirectory(), sourceFile.fileName)
        .replace(/^src\//, "lib/")
        .replace(/\.ts$/, "");
      const exportedName = isDefaultExport(tsModule, node) ? "default" : className;
      const importPath = `${relativePath}:${exportedName}`;

      if (isModelClassDecl(tsModule, node, checker, modelBases)) {
        result.models[identifier] = extractModelMetadata(
          tsModule,
          node,
          checker,
          identifier,
          importPath,
          namespace,
          modelBases
        );
      }

      if (tags.has(WEBDA_TAGS.modda)) {
        result.moddas![identifier] = { Import: importPath };
      }
      if (tags.has(WEBDA_TAGS.bean)) {
        result.beans![identifier] = { Import: importPath };
      }
      if (tags.has(WEBDA_TAGS.deployer)) {
        result.deployers![identifier] = { Import: importPath };
      }
    });
  }

  return result;
}

/**
 * Extract model metadata from a class declaration.
 * @param tsModule - the TypeScript module
 * @param classDecl - the class declaration node
 * @param checker - the type checker
 * @param identifier - the namespaced model identifier
 * @param importPath - the module import path
 * @param namespace - the module namespace
 * @param modelBases - set of known model base class names
 * @returns the model metadata
 */
function extractModelMetadata(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker,
  identifier: string,
  importPath: string,
  namespace: string,
  modelBases: Set<string>
): ModelMetadata {
  const reflection: Record<string, { type: string; required: boolean }> = {};
  const relations: ModelMetadata["Relations"] = {};
  const ancestors: string[] = [];

  // Extract properties and their types
  for (const member of classDecl.members) {
    if (!tsModule.isPropertyDeclaration(member)) continue;
    if (member.modifiers?.some(m => m.kind === tsModule.SyntaxKind.StaticKeyword)) continue;

    const propName = member.name.getText();
    const propType = checker.getTypeAtLocation(member);
    const typeName = checker.typeToString(propType);

    // Check for relation types
    if (member.type && tsModule.isTypeReferenceNode(member.type)) {
      const refName = member.type.typeName.getText();
      const baseRefName = refName.split("<")[0];

      if (RELATION_TYPES[baseRefName]) {
        extractRelation(tsModule, member, checker, relations, baseRefName);
        continue; // Relations are metadata, not reflected as regular fields
      }
    }

    const isOptional = !!member.questionToken;
    reflection[propName] = {
      type: typeName,
      required: !isOptional
    };
  }

  // Walk ancestors
  let current: ts.ClassDeclaration | undefined = classDecl;
  while (current) {
    const heritageClauses = current.heritageClauses;
    if (!heritageClauses) break;

    let nextClass: ts.ClassDeclaration | undefined;
    for (const clause of heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseName = typeNode.expression.getText().split("<")[0].trim();
        if (modelBases.has(baseName)) break;

        ancestors.push(`${namespace}/${baseName}`);

        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol?.getDeclarations()) {
          for (const decl of baseSymbol.getDeclarations()!) {
            if (tsModule.isClassDeclaration(decl)) {
              nextClass = decl;
              break;
            }
          }
        }
        if (nextClass) break;
      }
      if (nextClass) break;
    }
    current = nextClass;
  }

  return {
    Identifier: identifier,
    Import: importPath,
    Plural: "",
    Reflection: reflection,
    Relations: relations,
    Ancestors: ancestors,
    Subclasses: [], // Populated in a second pass
    PrimaryKey: extractPrimaryKey(tsModule, classDecl, checker),
    Events: [],
    Actions: {}
  };
}

/**
 * Extract the primary key fields from a class or its ancestors.
 *
 * Looks for `[WEBDA_PRIMARY_KEY] = ["field1", "field2"] as const` property declarations,
 * walking up the inheritance chain until one is found.
 * @param tsModule - the TypeScript module
 * @param classDecl - the class declaration node
 * @param checker - the type checker
 * @returns array of primary key field names
 */
function extractPrimaryKey(
  tsModule: typeof ts,
  classDecl: ts.ClassDeclaration,
  checker: ts.TypeChecker
): string[] {
  let current: ts.ClassDeclaration | undefined = classDecl;
  const visited = new Set<string>();

  while (current) {
    const name = current.name?.getText() ?? "";
    if (name && visited.has(name)) break;
    if (name) visited.add(name);

    for (const member of current.members) {
      if (!tsModule.isPropertyDeclaration(member)) continue;

      // Look for computed property name: [WEBDA_PRIMARY_KEY]
      if (!tsModule.isComputedPropertyName(member.name)) continue;
      const expr = member.name.expression;
      if (!tsModule.isIdentifier(expr)) continue;
      if (expr.text !== "WEBDA_PRIMARY_KEY") continue;

      // Extract string values from the initializer array literal
      if (!member.initializer) continue;

      // Handle `["uuid"] as const` — the initializer might be an AsExpression wrapping an ArrayLiteral
      let arrayLiteral: ts.ArrayLiteralExpression | undefined;
      if (tsModule.isArrayLiteralExpression(member.initializer)) {
        arrayLiteral = member.initializer;
      } else if (tsModule.isAsExpression(member.initializer) && tsModule.isArrayLiteralExpression(member.initializer.expression)) {
        arrayLiteral = member.initializer.expression;
      }

      if (!arrayLiteral) continue;

      const keys: string[] = [];
      for (const el of arrayLiteral.elements) {
        if (tsModule.isStringLiteral(el)) {
          keys.push(el.text);
        }
      }
      if (keys.length > 0) return keys;
    }

    // Walk to parent class
    if (!current.heritageClauses) break;
    let nextClass: ts.ClassDeclaration | undefined;
    for (const clause of current.heritageClauses) {
      if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
      for (const typeNode of clause.types) {
        const baseType = checker.getTypeAtLocation(typeNode);
        const baseSymbol = baseType.getSymbol();
        if (baseSymbol?.getDeclarations()) {
          for (const decl of baseSymbol.getDeclarations()!) {
            if (tsModule.isClassDeclaration(decl)) {
              nextClass = decl;
              break;
            }
          }
        }
        if (nextClass) break;
      }
      if (nextClass) break;
    }
    current = nextClass;
  }

  return [];
}

/**
 * Extract relation metadata from a property with a relation type.
 * @param tsModule - the TypeScript module
 * @param member - the property declaration node
 * @param checker - the type checker
 * @param relations - the relations object to populate
 * @param relationType - the relation type identifier
 */
function extractRelation(
  tsModule: typeof ts,
  member: ts.PropertyDeclaration,
  checker: ts.TypeChecker,
  relations: ModelMetadata["Relations"],
  relationType: string
) {
  if (!member.type || !tsModule.isTypeReferenceNode(member.type)) return;

  const typeArgs = member.type.typeArguments;
  if (!typeArgs || typeArgs.length === 0) return;

  const targetType = checker.typeToString(checker.getTypeAtLocation(typeArgs[0]));
  const propName = member.name.getText();

  const mappedType = RELATION_TYPES[relationType];

  if (mappedType === "parent") {
    relations.parent = { attribute: propName, model: targetType };
  } else if (mappedType === "query") {
    relations.queries ??= [];
    const targetAttr = typeArgs.length > 1 ? checker.typeToString(checker.getTypeAtLocation(typeArgs[1])) : propName;
    relations.queries.push({ attribute: propName, model: targetType, targetAttribute: targetAttr });
  } else {
    relations.links ??= [];
    relations.links.push({ attribute: propName, model: targetType, type: mappedType });
  }
}

/**
 * Check if a class extends a known model base.
 * @param tsModule - the TypeScript module
 * @param classDecl - the class declaration node
 * @param checker - the type checker
 * @param modelBases - set of known model base class names
 * @returns true if the class is a model class
 */
function isModelClassDecl(
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

/**
 * Get JSDoc tags from a node.
 * @param tsModule - the TypeScript module
 * @param node - the AST node
 * @returns a set of tag names
 */
function getJsDocTags(tsModule: typeof ts, node: ts.Node): Set<string> {
  const tags = new Set<string>();
  const jsDocs = tsModule.getJSDocTags(node);
  for (const tag of jsDocs) {
    tags.add(tag.tagName.getText());
  }
  return tags;
}

/**
 * Check if a class has a default export.
 * @param tsModule - the TypeScript module
 * @param node - the class declaration node
 * @returns true if it is the default export
 */
function isDefaultExport(tsModule: typeof ts, node: ts.ClassDeclaration): boolean {
  return !!node.modifiers?.some(m => m.kind === tsModule.SyntaxKind.DefaultKeyword);
}

/**
 * Walk up directories to find package.json.
 * @param startDir - the starting directory
 * @returns the path to package.json, or undefined
 */
function findPackageJson(startDir: string): string | undefined {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return undefined;
}
