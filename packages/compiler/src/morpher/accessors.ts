import { ClassDeclaration, SourceFile, SyntaxKind, TypeReferenceNode } from "ts-morph";

/**
 * Coercion rule: defines how to widen a setter type and transform the incoming value.
 */
interface CoercionRule {
  /** The wider type accepted by the setter (e.g. "string | number | Date" for Date fields). */
  setterType: string;
  /** Expression that coerces `valueVar` into the backing store type. */
  coerce: (valueVar: string) => string;
}

/**
 * Registry of TypeScript type names that require coercion.
 * Extend this map to support additional types.
 */
const COERCION_REGISTRY: Record<string, CoercionRule> = {
  Date: {
    setterType: "string | number | Date",
    coerce: v => `${v} !== undefined && ${v} !== null ? new Date(${v} as string | number | Date) : ${v} as any`
  }
};

/** Base model class names that qualify a class for accessor transformation. */
const KNOWN_MODEL_BASES = new Set(["Model", "UuidModel"]);

/**
 * Returns true if the class (directly or transitively) extends a known model base.
 * Works even when the base class is from an external package (resolved via heritage clause text).
 * @param cls - the class declaration to check
 * @returns true if extends a known model base
 */
function extendsModel(cls: ClassDeclaration): boolean {
  const visited = new Set<string>();
  let current: ClassDeclaration | undefined = cls;
  while (current) {
    const name = current.getName() ?? "";
    if (visited.has(name)) break;
    if (name) visited.add(name);

    const extendsClause = current.getHeritageClauseByKind(SyntaxKind.ExtendsKeyword);
    if (extendsClause) {
      for (const typeNode of extendsClause.getTypeNodes()) {
        // Strip generic parameters, e.g. "RepositoryStorageClassMixIn<...>" → "RepositoryStorageClassMixIn"
        const baseName = typeNode.getExpression().getText().split("<")[0].trim();
        if (KNOWN_MODEL_BASES.has(baseName)) return true;
      }
    }
    current = current.getBaseClass();
  }
  return false;
}

/**
 * Ensure WEBDA_STORAGE is imported in the source file.
 * Adds to an existing @webda/models or ./storable import, or inserts a new one.
 * @param sourceFile - the source file to update
 */
function ensureStorageImport(sourceFile: SourceFile) {
  const alreadyImported = sourceFile
    .getImportDeclarations()
    .some(d => d.getNamedImports().some(n => n.getName() === "WEBDA_STORAGE"));
  if (alreadyImported) return;

  const webdaImport = sourceFile
    .getImportDeclarations()
    .find(d => {
      const spec = d.getModuleSpecifierValue();
      return spec === "@webda/models" || spec.endsWith("/storable");
    });

  if (webdaImport) {
    webdaImport.addNamedImport("WEBDA_STORAGE");
  } else {
    sourceFile.insertImportDeclaration(0, {
      namedImports: ["WEBDA_STORAGE"],
      moduleSpecifier: "@webda/models"
    });
  }
}

/**
 * Transform class field declarations of coercible types (e.g. Date) into
 * enumerable getter/setter pairs backed by WEBDA_STORAGE.
 *
 * Before:
 *   createdAt: Date;
 *
 * After:
 *   get createdAt(): Date { return this[WEBDA_STORAGE]["createdAt"] as Date; }
 *   set createdAt(value: string | number | Date) { this[WEBDA_STORAGE]["createdAt"] = ...; }
 *   // + Object.defineProperty to make the getter enumerable on the prototype
 *
 * Applies to classes that (directly or transitively) extend Model or UuidModel.
 * Skips fields that already have a getter or setter defined.
 * @param sourceFile - the source file to transform
 */
export function transformAccessors(sourceFile: SourceFile) {
  const modelClasses = sourceFile.getClasses().filter(extendsModel);
  let needsStorageImport = false;

  for (const cls of modelClasses) {
    const toTransform: Array<{ name: string; type: string; rule: CoercionRule }> = [];

    for (const prop of cls.getProperties()) {
      if (prop.isStatic()) continue;
      // Skip if a getter or setter already exists for this name
      if (cls.getGetAccessor(prop.getName()) || cls.getSetAccessor(prop.getName())) continue;

      const typeNode = prop.getTypeNode();
      if (!typeNode || typeNode.getKind() !== SyntaxKind.TypeReference) continue;

      const typeName = (typeNode as TypeReferenceNode).getText();
      const rule = COERCION_REGISTRY[typeName];
      if (!rule) continue;

      toTransform.push({ name: prop.getName(), type: typeName, rule });
    }

    if (toTransform.length === 0) continue;
    needsStorageImport = true;

    // Remove original field declarations
    for (const { name } of toTransform) {
      cls.getProperty(name)?.remove();
    }

    // Add getter/setter pairs backed by WEBDA_STORAGE
    for (const { name, type, rule } of toTransform) {
      cls.addGetAccessor({
        name,
        returnType: type,
        statements: `return this[WEBDA_STORAGE][${JSON.stringify(name)}] as ${type};`
      });
      cls.addSetAccessor({
        name,
        parameters: [{ name: "value", type: rule.setterType }],
        statements: `this[WEBDA_STORAGE][${JSON.stringify(name)}] = ${rule.coerce("value")};`
      });
    }

    // Make the prototype getters enumerable so for..in traversal (used in toJSON) picks them up.
    // These Object.defineProperty calls run at module evaluation time.
    const className = cls.getName()!;
    const defineStatements = toTransform
      .map(
        ({ name }) =>
          `Object.defineProperty(${className}.prototype, ${JSON.stringify(name)}, { ...Object.getOwnPropertyDescriptor(${className}.prototype, ${JSON.stringify(name)}), enumerable: true });`
      )
      .join("\n");
    sourceFile.addStatements(defineStatements);
  }

  if (needsStorageImport) {
    ensureStorageImport(sourceFile);
  }
}
