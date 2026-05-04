

import type ts from "typescript";
import { dirname, relative } from "path";

/**
 * The single WEBDA_STORAGE slot key used to back the `parent` reference on a
 * Behavior instance. Must be referenced from BOTH the per-Behavior `parent`
 * getter and the per-model hydration assignment so they stay in sync.
 *
 * Namespaced enough that authors are very unlikely to declare a model field
 * with this name; the runtime hydration will skip it via the `toJSON` filter.
 */
export const BEHAVIOR_PARENT_KEY = "__parent__";

/**
 * Pre-computed Behavior metadata for a model class:
 *   `attribute` → `{ behaviorClassName, importSource? }`
 *
 * Built once per program by `computeBehaviorAttributes` and consumed by the
 * source transformer to emit `__hydrateBehaviors` method bodies.
 */
export interface BehaviorAttributeInfo {
  /** Runtime class name of the Behavior (e.g. "MFA"). */
  behaviorClassName: string;
  /** Module specifier to import the Behavior class from, or undefined when same-file. */
  importSource?: string;
  /**
   * True when the Behavior class extends `Array<...>` (or any built-in array
   * type). Drives a different hydration coercion shape — we must `push`
   * each element rather than `Object.assign`, otherwise `arr.length` stays
   * at 0 even when indexed slots are populated.
   */
  isArraySubclass?: boolean;
}

/**
 * Map: model className → attribute name → BehaviorAttributeInfo.
 * Same shape as `CoercibleFieldMap` but for Behavior-typed properties.
 */
export type BehaviorAttributeMap = Map<string, Map<string, BehaviorAttributeInfo>>;

/**
 * Pre-computed set of class names carrying the `@WebdaBehavior` JSDoc tag.
 * Used to drive the per-Behavior augmentation pass.
 */
export type BehaviorClassSet = Set<string>;

/**
 * Safely extract the text of a node, falling back to escapedText for synthetic nodes.
 * @param node - the AST node
 * @param sourceFile - optional source file context
 * @returns the node text
 */
function safeGetText(node: ts.Node, sourceFile?: ts.SourceFile): string {
  try {
    return sourceFile ? node.getText(sourceFile) : node.getText();
  } catch {
    if ("escapedText" in node && typeof node.escapedText === "string") {
      return node.escapedText as string;
    }
    return "";
  }
}

/**
 * Compute a module specifier to import a symbol from its declaring source file.
 * Returns a relative path (for project files) or the package name (for node_modules),
 * or undefined when the symbol lives in the same file as the importer.
 * @param declaringFile - the file declaring the symbol
 * @param currentFile - the file importing the symbol
 * @returns the module specifier, or undefined if same-file
 */
function resolveImportSource(
  declaringFile: ts.SourceFile,
  currentFile: ts.SourceFile
): string | undefined {
  if (declaringFile.fileName === currentFile.fileName) return undefined;
  const filePath = declaringFile.fileName;
  const nmIdx = filePath.lastIndexOf("node_modules/");
  if (nmIdx >= 0) {
    const afterNm = filePath.substring(nmIdx + "node_modules/".length);
    const parts = afterNm.split("/");
    if (parts[0].startsWith("@")) return parts[0] + "/" + parts[1];
    return parts[0];
  }
  const from = dirname(currentFile.fileName);
  let rel = relative(from, filePath).replace(/\\/g, "/").replace(/\.d\.ts$|\.ts$/, ".js");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

/**
 * Find the import source for `WEBDA_STORAGE` — either a relative path to a
 * project file that exports it, or `@webda/models` as a fallback.
 * Mirrors the helper in `accessors.ts`.
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @param currentFile - the file that needs the import
 * @returns the import specifier string
 */
function findStorageImportSource(
  tsModule: typeof ts,
  program: ts.Program,
  currentFile: ts.SourceFile
): string {
  for (const sf of program.getSourceFiles()) {
    if (sf.isDeclarationFile || sf === currentFile) continue;
    for (const stmt of sf.statements) {
      if (!tsModule.isVariableStatement(stmt)) continue;
      for (const decl of stmt.declarationList.declarations) {
        if (tsModule.isIdentifier(decl.name) && decl.name.text === "WEBDA_STORAGE") {
          const isExported = stmt.modifiers?.some(m => m.kind === tsModule.SyntaxKind.ExportKeyword);
          if (isExported) {
            const from = dirname(currentFile.fileName);
            let rel = relative(from, sf.fileName).replace(/\\/g, "/").replace(/\.d\.ts$|\.ts$/, ".js");
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
 * Check whether a class declaration carries a `/** @WebdaBehavior * /` JSDoc tag.
 * Same detection logic the compiler uses in `resolveBehaviorIdentifierFromType`.
 * @param tsModule - the TypeScript module
 * @param decl - the class declaration to inspect
 * @returns true when the JSDoc tag is present
 */
function hasWebdaBehaviorTag(tsModule: typeof ts, decl: ts.ClassDeclaration | ts.ClassExpression): boolean {
  const tags = tsModule.getJSDocTags(decl);
  return tags.some(tag => {
    const name = tag.tagName?.escapedText;
    return name === "WebdaBehavior" || (typeof name === "string" && name === "WebdaBehavior");
  });
}

/**
 * Detect whether a class declaration extends a built-in `Array<...>` type.
 * Walks the class's `extends` heritage clause; we don't try to follow
 * intermediate subclasses (a class that extends `MyBaseArray extends Array`
 * is not flagged), keeping detection conservative — the Array-subclass code
 * path is purely an optimization and false negatives just fall back to
 * `Object.assign`-style coercion.
 *
 * @param tsModule - the TypeScript module
 * @param decl - the class declaration to inspect
 * @returns true when the class directly extends `Array<...>`
 */
function extendsArray(tsModule: typeof ts, decl: ts.ClassDeclaration | ts.ClassExpression): boolean {
  const heritage = decl.heritageClauses;
  if (!heritage) return false;
  for (const clause of heritage) {
    if (clause.token !== tsModule.SyntaxKind.ExtendsKeyword) continue;
    for (const type of clause.types) {
      const expr = type.expression;
      if (tsModule.isIdentifier(expr) && expr.text === "Array") {
        return true;
      }
    }
  }
  return false;
}

/**
 * For the given property type reference, resolve the underlying class
 * declaration and return the runtime class name plus the import source —
 * but only if the resolved class carries a `@WebdaBehavior` JSDoc tag.
 *
 * Returns undefined for non-class types (Date, primitives) and for class
 * types that are not behaviors.
 *
 * @param tsModule - the TypeScript module
 * @param checker - the type checker
 * @param typeRef - the property's TypeReferenceNode
 * @param currentFile - the source file containing the property
 * @returns BehaviorAttributeInfo or undefined
 */
function resolveBehaviorClassFromType(
  tsModule: typeof ts,
  checker: ts.TypeChecker,
  typeRef: ts.TypeReferenceNode,
  currentFile: ts.SourceFile
): BehaviorAttributeInfo | undefined {
  const type = checker.getTypeAtLocation(typeRef.typeName);
  const symbol = type.getSymbol();
  const decl = symbol?.declarations?.find(d => tsModule.isClassDeclaration(d) || tsModule.isClassExpression(d)) as
    | ts.ClassDeclaration
    | ts.ClassExpression
    | undefined;
  if (!decl) return undefined;
  if (!hasWebdaBehaviorTag(tsModule, decl)) return undefined;
  if (!decl.name) return undefined;
  const behaviorClassName = safeGetText(decl.name, decl.getSourceFile());
  const importSource = resolveImportSource(decl.getSourceFile(), currentFile);
  const isArraySubclass = extendsArray(tsModule, decl);
  return { behaviorClassName, importSource, isArraySubclass };
}

/**
 * Pre-compute, for every class in the program:
 *   - which classes are themselves Behaviors (via JSDoc tag), and
 *   - which non-Behavior classes have one or more Behavior-typed properties.
 *
 * Both facts are computed in a single source-file walk so consumers can use
 * them without re-walking the AST.
 *
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @returns the precomputed maps
 */
export function computeBehaviorMetadata(
  tsModule: typeof ts,
  program: ts.Program
): { behaviorClasses: BehaviorClassSet; modelBehaviorAttributes: BehaviorAttributeMap } {
  const checker = program.getTypeChecker();
  const behaviorClasses: BehaviorClassSet = new Set();
  const modelBehaviorAttributes: BehaviorAttributeMap = new Map();

  for (const sourceFile of program.getSourceFiles()) {
    if (sourceFile.isDeclarationFile) continue;
    visit(sourceFile);
  }

  /**
   * Recursively walk the AST to record Behavior classes and Behavior-typed model attributes.
   * @param node - the AST node to visit
   */
  function visit(node: ts.Node) {
    if (tsModule.isClassDeclaration(node) && node.name) {
      const className = safeGetText(node.name, node.getSourceFile());

      // Identify Behavior classes.
      if (hasWebdaBehaviorTag(tsModule, node)) {
        behaviorClasses.add(className);
      } else {
        // Non-Behavior class: walk its properties to detect Behavior-typed ones.
        // We don't gate on "is this a model class" — any class with a
        // Behavior-typed property gains `__hydrateBehaviors`. The runtime
        // calls it conditionally so a non-model class with such a property
        // simply ignores the method.
        const attrs = new Map<string, BehaviorAttributeInfo>();
        for (const member of node.members) {
          if (!tsModule.isPropertyDeclaration(member)) continue;
          if (member.modifiers?.some(m => m.kind === tsModule.SyntaxKind.StaticKeyword)) continue;
          if (!member.type || !tsModule.isTypeReferenceNode(member.type)) continue;
          const fieldName = safeGetText(member.name, node.getSourceFile());
          const info = resolveBehaviorClassFromType(tsModule, checker, member.type, node.getSourceFile());
          if (info) attrs.set(fieldName, info);
        }
        if (attrs.size > 0) {
          modelBehaviorAttributes.set(className, attrs);
        }
      }
    }
    tsModule.forEachChild(node, visit);
  }

  return { behaviorClasses, modelBehaviorAttributes };
}

/**
 * Create the `parent` getter for a Behavior class:
 * ```js
 * get parent() {
 *   return this[WEBDA_STORAGE]["__parent__"];
 * }
 * ```
 * @param factory - the AST node factory
 * @returns the get-accessor declaration
 */
function createParentGetter(factory: ts.NodeFactory): ts.GetAccessorDeclaration {
  return factory.createGetAccessorDeclaration(
    undefined,
    factory.createIdentifier("parent"),
    [],
    undefined,
    factory.createBlock([
      factory.createReturnStatement(
        factory.createElementAccessExpression(
          factory.createElementAccessExpression(
            factory.createThis(),
            factory.createIdentifier("WEBDA_STORAGE")
          ),
          factory.createStringLiteral(BEHAVIOR_PARENT_KEY)
        )
      )
    ])
  );
}

/**
 * Create the WEBDA_STORAGE storage property: `[WEBDA_STORAGE] = {}`.
 * @param factory - the AST node factory
 * @returns the property declaration
 */
function createStorageProperty(factory: ts.NodeFactory): ts.PropertyDeclaration {
  return factory.createPropertyDeclaration(
    undefined,
    factory.createComputedPropertyName(factory.createIdentifier("WEBDA_STORAGE")),
    undefined,
    undefined,
    factory.createObjectLiteralExpression()
  );
}

/**
 * Create a Behavior-specific `toJSON()` method:
 * ```js
 * toJSON() {
 *   const result = {};
 *   for (const key of Object.keys(this)) {
 *     result[key] = this[key];
 *   }
 *   const storage = this[WEBDA_STORAGE];
 *   if (storage) {
 *     for (const key of Object.keys(storage)) {
 *       if (key !== "__parent__") result[key] = storage[key];
 *     }
 *   }
 *   return result;
 * }
 * ```
 * @param tsModule - the TypeScript module
 * @param factory - the AST node factory
 * @returns the method declaration
 */
function createBehaviorToJSON(tsModule: typeof ts, factory: ts.NodeFactory): ts.MethodDeclaration {
  const resultId = factory.createIdentifier("result");
  const storageId = factory.createIdentifier("storage");
  const keyId = factory.createIdentifier("key");

  // const result = {};
  const initResult = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration("result", undefined, undefined, factory.createObjectLiteralExpression())],
      tsModule.NodeFlags.Const
    )
  );

  // for (const key of Object.keys(this)) { result[key] = this[key]; }
  const copyOwnProps = factory.createForOfStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration("key")],
      tsModule.NodeFlags.Const
    ),
    factory.createCallExpression(
      factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "keys"),
      undefined,
      [factory.createThis()]
    ),
    factory.createBlock([
      factory.createExpressionStatement(
        factory.createAssignment(
          factory.createElementAccessExpression(resultId, keyId),
          factory.createElementAccessExpression(factory.createThis(), keyId)
        )
      )
    ])
  );

  // const storage = this[WEBDA_STORAGE];
  const initStorage = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [
        factory.createVariableDeclaration(
          "storage",
          undefined,
          undefined,
          factory.createElementAccessExpression(
            factory.createThis(),
            factory.createIdentifier("WEBDA_STORAGE")
          )
        )
      ],
      tsModule.NodeFlags.Const
    )
  );

  // if (storage) { for (const key of Object.keys(storage)) { if (key !== "__parent__") result[key] = storage[key]; } }
  const copyStorage = factory.createIfStatement(
    storageId,
    factory.createBlock([
      factory.createForOfStatement(
        undefined,
        factory.createVariableDeclarationList(
          [factory.createVariableDeclaration("key")],
          tsModule.NodeFlags.Const
        ),
        factory.createCallExpression(
          factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "keys"),
          undefined,
          [storageId]
        ),
        factory.createBlock([
          factory.createIfStatement(
            factory.createBinaryExpression(
              keyId,
              tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
              factory.createStringLiteral(BEHAVIOR_PARENT_KEY)
            ),
            factory.createBlock([
              factory.createExpressionStatement(
                factory.createAssignment(
                  factory.createElementAccessExpression(resultId, keyId),
                  factory.createElementAccessExpression(storageId, keyId)
                )
              )
            ])
          )
        ])
      )
    ])
  );

  // return result;
  const returnResult = factory.createReturnStatement(resultId);

  return factory.createMethodDeclaration(
    undefined,
    undefined,
    factory.createIdentifier("toJSON"),
    undefined,
    undefined,
    [],
    undefined,
    factory.createBlock([initResult, copyOwnProps, initStorage, copyStorage, returnResult], true)
  );
}

/**
 * Build the per-attribute hydration block for a model's `__hydrateBehaviors`
 * method body.
 *
 * For non-Array Behavior classes, generates:
 * ```js
 * {
 *   let v = this.<attr>;
 *   if (rawData !== undefined && rawData !== null && rawData["<attr>"] !== undefined) {
 *     v = rawData["<attr>"];
 *   }
 *   if (!(v instanceof <Behavior>)) {
 *     const inst = new <Behavior>();
 *     if (v !== undefined && v !== null) Object.assign(inst, v);
 *     v = inst;
 *   }
 *   v[WEBDA_STORAGE] = v[WEBDA_STORAGE] || {};
 *   v[WEBDA_STORAGE]["__parent__"] = { instance: this, attribute: "<attr>" };
 *   this.<attr> = v;
 * }
 * ```
 *
 * For Array-subclass Behaviors (e.g. `BinariesImpl extends Array<...>`), the
 * coercion uses `inst.push(item)` instead of `Object.assign(inst, v)` because
 * `Object.assign` on an Array instance silently fails to update `length` when
 * indexed slots are copied — leaving you with `arr.length === 0` even though
 * `arr[0]` and `arr[1]` are set.
 *
 * @param tsModule - the TypeScript module
 * @param factory - the AST node factory
 * @param attribute - the model property name
 * @param info - the Behavior attribute info (className + array flag)
 * @returns a block statement
 */
function createHydrationBlock(
  tsModule: typeof ts,
  factory: ts.NodeFactory,
  attribute: string,
  info: BehaviorAttributeInfo
): ts.Statement {
  const behaviorClassName = info.behaviorClassName;
  const vId = factory.createIdentifier("v");
  const rawDataId = factory.createIdentifier("rawData");
  const instId = factory.createIdentifier("inst");
  const itemId = factory.createIdentifier("item");
  const behaviorId = factory.createIdentifier(behaviorClassName);
  const storageOnV = factory.createElementAccessExpression(vId, factory.createIdentifier("WEBDA_STORAGE"));
  const parentSlotOnV = factory.createElementAccessExpression(
    storageOnV,
    factory.createStringLiteral(BEHAVIOR_PARENT_KEY)
  );
  const thisAttr = factory.createPropertyAccessExpression(factory.createThis(), attribute);

  // let v = this.<attr>;
  const letV = factory.createVariableStatement(
    undefined,
    factory.createVariableDeclarationList(
      [factory.createVariableDeclaration("v", undefined, undefined, thisAttr)],
      tsModule.NodeFlags.Let
    )
  );

  // if (rawData !== undefined && rawData !== null && rawData["<attr>"] !== undefined) v = rawData["<attr>"];
  const rawAttr = factory.createElementAccessExpression(rawDataId, factory.createStringLiteral(attribute));
  const rawCheck = factory.createIfStatement(
    factory.createBinaryExpression(
      factory.createBinaryExpression(
        factory.createBinaryExpression(
          rawDataId,
          tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
          factory.createIdentifier("undefined")
        ),
        tsModule.SyntaxKind.AmpersandAmpersandToken,
        factory.createBinaryExpression(rawDataId, tsModule.SyntaxKind.ExclamationEqualsEqualsToken, factory.createNull())
      ),
      tsModule.SyntaxKind.AmpersandAmpersandToken,
      factory.createBinaryExpression(
        rawAttr,
        tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
        factory.createIdentifier("undefined")
      )
    ),
    factory.createBlock([
      factory.createExpressionStatement(factory.createAssignment(vId, rawAttr))
    ])
  );

  // Build the coercion body based on whether the Behavior extends Array.
  const innerCoercion: ts.Statement[] = info.isArraySubclass
    ? [
        // if (Array.isArray(v)) { for (const item of v) inst.push(item); }
        factory.createIfStatement(
          factory.createCallExpression(
            factory.createPropertyAccessExpression(factory.createIdentifier("Array"), "isArray"),
            undefined,
            [vId]
          ),
          factory.createBlock([
            factory.createForOfStatement(
              undefined,
              factory.createVariableDeclarationList(
                [factory.createVariableDeclaration("item")],
                tsModule.NodeFlags.Const
              ),
              vId,
              factory.createBlock([
                factory.createExpressionStatement(
                  factory.createCallExpression(
                    factory.createPropertyAccessExpression(instId, "push"),
                    undefined,
                    [itemId]
                  )
                )
              ])
            )
          ])
        )
      ]
    : [
        // if (v != null) Object.assign(inst, v);
        factory.createIfStatement(
          factory.createBinaryExpression(
            factory.createBinaryExpression(
              vId,
              tsModule.SyntaxKind.ExclamationEqualsEqualsToken,
              factory.createIdentifier("undefined")
            ),
            tsModule.SyntaxKind.AmpersandAmpersandToken,
            factory.createBinaryExpression(vId, tsModule.SyntaxKind.ExclamationEqualsEqualsToken, factory.createNull())
          ),
          factory.createBlock([
            factory.createExpressionStatement(
              factory.createCallExpression(
                factory.createPropertyAccessExpression(factory.createIdentifier("Object"), "assign"),
                undefined,
                [instId, vId]
              )
            )
          ])
        )
      ];

  // if (!(v instanceof Behavior)) { const inst = new Behavior(); <coerce>; v = inst; }
  const coerce = factory.createIfStatement(
    factory.createPrefixUnaryExpression(
      tsModule.SyntaxKind.ExclamationToken,
      factory.createParenthesizedExpression(
        factory.createBinaryExpression(vId, tsModule.SyntaxKind.InstanceOfKeyword, behaviorId)
      )
    ),
    factory.createBlock([
      factory.createVariableStatement(
        undefined,
        factory.createVariableDeclarationList(
          [
            factory.createVariableDeclaration(
              "inst",
              undefined,
              undefined,
              factory.createNewExpression(behaviorId, undefined, [])
            )
          ],
          tsModule.NodeFlags.Const
        )
      ),
      ...innerCoercion,
      factory.createExpressionStatement(factory.createAssignment(vId, instId))
    ])
  );

  // v[WEBDA_STORAGE] = v[WEBDA_STORAGE] || {};
  const ensureStorage = factory.createExpressionStatement(
    factory.createAssignment(
      storageOnV,
      factory.createBinaryExpression(
        storageOnV,
        tsModule.SyntaxKind.BarBarToken,
        factory.createObjectLiteralExpression()
      )
    )
  );

  // v[WEBDA_STORAGE]["__parent__"] = { instance: this, attribute: "<attr>" };
  const setParent = factory.createExpressionStatement(
    factory.createAssignment(
      parentSlotOnV,
      factory.createObjectLiteralExpression(
        [
          factory.createPropertyAssignment("instance", factory.createThis()),
          factory.createPropertyAssignment("attribute", factory.createStringLiteral(attribute))
        ],
        false
      )
    )
  );

  // this.<attr> = v;
  const writeBack = factory.createExpressionStatement(factory.createAssignment(thisAttr, vId));

  return factory.createBlock([letV, rawCheck, coerce, ensureStorage, setParent, writeBack], true);
}

/**
 * Build the model class's `__hydrateBehaviors(rawData)` method.
 * Body is one hydration block per Behavior attribute.
 * @param tsModule - the TypeScript module
 * @param factory - the AST node factory
 * @param attrs - the model's Behavior attributes
 * @returns the method declaration
 */
function createHydrateBehaviorsMethod(
  tsModule: typeof ts,
  factory: ts.NodeFactory,
  attrs: Map<string, BehaviorAttributeInfo>
): ts.MethodDeclaration {
  const blocks: ts.Statement[] = [];
  for (const [attr, info] of attrs) {
    blocks.push(createHydrationBlock(tsModule, factory, attr, info));
  }

  return factory.createMethodDeclaration(
    [factory.createModifier(tsModule.SyntaxKind.ProtectedKeyword)],
    undefined,
    factory.createIdentifier("__hydrateBehaviors"),
    undefined,
    undefined,
    [
      factory.createParameterDeclaration(
        undefined,
        undefined,
        factory.createIdentifier("rawData"),
        factory.createToken(tsModule.SyntaxKind.QuestionToken),
        factory.createKeywordTypeNode(tsModule.SyntaxKind.AnyKeyword)
      )
    ],
    factory.createKeywordTypeNode(tsModule.SyntaxKind.VoidKeyword),
    factory.createBlock(blocks, true)
  );
}

/**
 * Source-file transformer that:
 *   1. Augments every `@WebdaBehavior`-tagged class with WEBDA_STORAGE init,
 *      a `parent` getter, and a Behavior-specific `toJSON` (unless author
 *      already defined any of them).
 *   2. Adds a `__hydrateBehaviors(rawData)` method to every class that has
 *      Behavior-typed properties, so the runtime can wire parent references
 *      at deserialization time without a metadata-driven loop.
 *
 * Idempotent: if the author has already defined `parent`, `toJSON`, or
 * `[WEBDA_STORAGE]`, the transformer leaves them in place. The transformer
 * never injects a `__hydrateBehaviors` for a class that already declares one.
 *
 * @param tsModule - the TypeScript module
 * @param program - the TypeScript program
 * @param precomputed - optional pre-computed metadata
 * @param precomputed.behaviorClasses - set of class names known to be Behaviors
 * @param precomputed.modelBehaviorAttributes - map of model class → attribute → BehaviorAttributeInfo
 * @param coercibleFields - shared coercible-field map from the accessors transformer's
 *   pre-pass; used to detect whether accessors will inject the
 *   `WEBDA_STORAGE` import for the same source file so we don't emit a
 *   duplicate (which would break ESM with `Identifier 'WEBDA_STORAGE'
 *   has already been declared`)
 * @returns the transformer factory for source files
 */
export function createBehaviorTransformer(
  tsModule: typeof ts,
  program: ts.Program,
  precomputed?: { behaviorClasses: BehaviorClassSet; modelBehaviorAttributes: BehaviorAttributeMap },
  /**
   * Coercible-field map produced by the accessors transformer's pre-pass.
   * When a class in the current source has coercible fields, the accessors
   * transformer will already inject `import { WEBDA_STORAGE } from "@webda/models"`
   * into that file. Sibling `before:` transformers in TypeScript see the
   * unmodified source, so we use this signal to skip our own duplicate
   * injection — duplicate imports of the same name break ESM with
   * `Identifier 'WEBDA_STORAGE' has already been declared`.
   */
  coercibleFields?: Map<string, unknown>
): ts.TransformerFactory<ts.SourceFile> {
  const meta = precomputed ?? computeBehaviorMetadata(tsModule, program);
  const { behaviorClasses, modelBehaviorAttributes } = meta;

  return context => {
    return sourceFile => {
      let needsStorageImport = false;
      // Track value imports we need to add: typeName → importSource (relative or package).
      const neededTypeImports = new Map<string, string>();

      // Inventory of imports already present (skipping type-only) so we don't
      // duplicate WEBDA_STORAGE / Behavior class names.
      const existingValueImports = new Set<string>();
      let hasStorageImport = false;
      for (const stmt of sourceFile.statements) {
        if (!tsModule.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
        if (stmt.importClause.isTypeOnly) continue;
        if (!tsModule.isNamedImports(stmt.importClause.namedBindings)) continue;
        for (const el of stmt.importClause.namedBindings.elements) {
          if (el.isTypeOnly) continue;
          const name = safeGetText(el.name, sourceFile);
          existingValueImports.add(name);
          if (name === "WEBDA_STORAGE") hasStorageImport = true;
        }
      }

      const transformed = tsModule.visitNode(sourceFile, function visit(node: ts.Node): ts.Node {
        if (!tsModule.isClassDeclaration(node) || !node.name) {
          return tsModule.visitEachChild(node, visit, context);
        }

        const className = safeGetText(node.name, sourceFile);
        const isBehavior = behaviorClasses.has(className);
        const behaviorAttrs = modelBehaviorAttributes.get(className);

        if (!isBehavior && !behaviorAttrs) {
          return tsModule.visitEachChild(node, visit, context);
        }

        // Detect existing members so we stay idempotent.
        const hasParent = node.members.some(m => {
          if (tsModule.isGetAccessorDeclaration(m) || tsModule.isSetAccessorDeclaration(m) || tsModule.isPropertyDeclaration(m) || tsModule.isMethodDeclaration(m)) {
            return safeGetText(m.name, sourceFile) === "parent";
          }
          return false;
        });
        const hasToJSON = node.members.some(
          m => tsModule.isMethodDeclaration(m) && tsModule.isIdentifier(m.name) && m.name.text === "toJSON"
        );
        const hasStorageProp = node.members.some(m => {
          if (!tsModule.isPropertyDeclaration(m)) return false;
          const name = m.name;
          // Computed property name with WEBDA_STORAGE identifier
          if (tsModule.isComputedPropertyName(name)) {
            const expr = name.expression;
            return tsModule.isIdentifier(expr) && expr.text === "WEBDA_STORAGE";
          }
          return safeGetText(name, sourceFile) === "WEBDA_STORAGE";
        });
        const hasHydrate = node.members.some(
          m =>
            tsModule.isMethodDeclaration(m) &&
            tsModule.isIdentifier(m.name) &&
            m.name.text === "__hydrateBehaviors"
        );

        const newMembers: ts.ClassElement[] = [...node.members];

        if (isBehavior) {
          if (!hasStorageProp) {
            newMembers.unshift(createStorageProperty(context.factory));
            needsStorageImport = true;
          }
          if (!hasParent) {
            newMembers.push(createParentGetter(context.factory));
            needsStorageImport = true;
          }
          if (!hasToJSON) {
            newMembers.push(createBehaviorToJSON(tsModule, context.factory));
            needsStorageImport = true;
          }
        }

        if (behaviorAttrs && !hasHydrate) {
          newMembers.push(createHydrateBehaviorsMethod(tsModule, context.factory, behaviorAttrs));
          needsStorageImport = true;
          // Track Behavior class imports so we can inject runtime imports below.
          for (const info of behaviorAttrs.values()) {
            if (info.importSource) {
              neededTypeImports.set(info.behaviorClassName, info.importSource);
            }
          }
        }

        if (newMembers.length === node.members.length) {
          return tsModule.visitEachChild(node, visit, context);
        }

        return context.factory.updateClassDeclaration(
          node,
          node.modifiers,
          node.name,
          node.typeParameters,
          node.heritageClauses,
          newMembers
        );
      }) as ts.SourceFile;

      const newImports: ts.ImportDeclaration[] = [];

      // The accessors transformer (a sibling in the same `before:` array) will
      // also inject `import { WEBDA_STORAGE } from "@webda/models"` for any
      // file containing a class with coercible fields. TypeScript runs
      // `before:` transformers on the original source in parallel, so we
      // can't see accessors' added import via `transformed.statements`.
      // If any class in this source appears in the shared coercible-field
      // map, accessors will add the import — we must skip ours to avoid
      // a fatal `Identifier 'WEBDA_STORAGE' has already been declared` ESM
      // error at module load.
      let accessorsWillAddImport = false;
      if (coercibleFields) {
        for (const stmt of sourceFile.statements) {
          if (!tsModule.isClassDeclaration(stmt) || !stmt.name) continue;
          if (coercibleFields.has(safeGetText(stmt.name, sourceFile))) {
            accessorsWillAddImport = true;
            break;
          }
        }
      }

      if (needsStorageImport && !hasStorageImport && !accessorsWillAddImport) {
        const storageSource = findStorageImportSource(tsModule, program, sourceFile);
        newImports.push(
          context.factory.createImportDeclaration(
            undefined,
            context.factory.createImportClause(
              false,
              undefined,
              context.factory.createNamedImports([
                context.factory.createImportSpecifier(
                  false,
                  undefined,
                  context.factory.createIdentifier("WEBDA_STORAGE")
                )
              ])
            ),
            context.factory.createStringLiteral(storageSource)
          )
        );
      }

      // Re-inject Behavior class imports — TypeScript's import elision drops
      // names that only appear in type positions, but our generated `new MFA()`
      // uses them as values. Same trick `accessors` plays for set-method types.
      let finalSource = transformed;
      if (neededTypeImports.size > 0) {
        const injectedNames = new Set(neededTypeImports.keys());

        // Strip the soon-to-be-injected names from existing import declarations
        // so we don't end up with two bindings under the same name.
        const updatedStatements = finalSource.statements
          .map(stmt => {
            if (!tsModule.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) return stmt;
            if (stmt.importClause.isTypeOnly) return stmt;
            if (!tsModule.isNamedImports(stmt.importClause.namedBindings)) return stmt;
            const elements = stmt.importClause.namedBindings.elements;
            const hasConflict = elements.some(
              el => !el.isTypeOnly && injectedNames.has(safeGetText(el.name, sourceFile))
            );
            if (!hasConflict) return stmt;
            const checker = program.getTypeChecker();
            const remaining = elements.filter(el => {
              if (injectedNames.has(safeGetText(el.name, sourceFile))) return false;
              if (el.isTypeOnly) return false;
              // Drop type-only re-exports (e.g. `Binaries` is a type alias for
              // `BinariesImpl<T>`) — TypeScript would normally erase these,
              // but rewriting the import statement defeats its built-in
              // elision. Keep only names that have a value at runtime.
              // `getSymbolAtLocation` on an import specifier returns the
              // LOCAL alias symbol; resolve through the alias to the actual
              // exported symbol before checking its flags.
              const localSym = checker.getSymbolAtLocation(el.name);
              if (!localSym) return true; // can't determine — keep to be safe
              const targetSym =
                (localSym.flags & tsModule.SymbolFlags.Alias) !== 0
                  ? checker.getAliasedSymbol(localSym)
                  : localSym;
              if ((targetSym.flags & tsModule.SymbolFlags.Value) === 0) {
                return false;
              }
              return true;
            });
            if (remaining.length === 0 && !stmt.importClause.name) return undefined;
            return context.factory.updateImportDeclaration(
              stmt,
              stmt.modifiers,
              context.factory.updateImportClause(
                stmt.importClause,
                stmt.importClause.isTypeOnly,
                stmt.importClause.name,
                context.factory.createNamedImports(remaining)
              ),
              stmt.moduleSpecifier,
              stmt.attributes
            );
          })
          .filter((s): s is ts.Statement => s !== undefined);

        finalSource = context.factory.updateSourceFile(finalSource, updatedStatements);

        const bySource = new Map<string, string[]>();
        for (const [typeName, source] of neededTypeImports) {
          const list = bySource.get(source) ?? [];
          list.push(typeName);
          bySource.set(source, list);
        }
        for (const [source, names] of bySource) {
          if (names.length === 0) continue;
          newImports.push(
            context.factory.createImportDeclaration(
              undefined,
              context.factory.createImportClause(
                false,
                undefined,
                context.factory.createNamedImports(
                  names.map(n =>
                    context.factory.createImportSpecifier(false, undefined, context.factory.createIdentifier(n))
                  )
                )
              ),
              context.factory.createStringLiteral(source)
            )
          );
        }
      }

      if (newImports.length > 0) {
        return context.factory.updateSourceFile(finalSource, [...newImports, ...finalSource.statements]);
      }
      return finalSource;
    };
  };
}
