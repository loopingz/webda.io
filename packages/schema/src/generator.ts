import ts from "typescript";
import path from "path";
import type { JSONSchema7, JSONSchema7TypeName } from "json-schema";

/**
 * Arguments passed through the schema-property pipeline.
 *
 * Each call to {@link SchemaGenerator.schemaProperty} receives (and may
 * transform via {@link GenerateSchemaOptions.transformer}) these values
 * before the type is inspected.
 */
export interface SchemaPropertyArguments {
  /** The TypeScript type being converted */
  type: ts.Type;
  /** The mutable JSON Schema definition being populated */
  definition: JSONSchema7;
  /** Schema path for the current property (e.g. `/MyType/name`) */
  path: string;
  /** The AST node associated with the property, if available */
  node?: ts.Node;
  /** Current recursion depth (0-based) */
  depth: number;
}

/**
 * Options accepted by the {@link SchemaGenerator} constructor and by
 * per-call methods like {@link SchemaGenerator.getSchemaFromType}.
 */
export interface GenerateSchemaOptions {
  /**
   * Path to the directory containing `tsconfig.json`, or an explicit path to
   * the tsconfig file itself. Defaults to `process.cwd()`.
   *
   * Mutually exclusive with {@link program}.
   */
  project?: string;
  /**
   * Restrict the type search to a specific source file. When omitted every
   * source file in the program is searched.
   */
  file?: string;
  /**
   * Maximum recursion depth when traversing nested types.
   * @default 10
   */
  maxDepth?: number;
  /**
   * When `true`, the top-level type is emitted as a `$ref` pointing into
   * `definitions` rather than being inlined at the schema root.
   * @default false
   */
  asRef?: boolean;
  /**
   * Optional logging callback invoked with diagnostic messages during
   * generation. Useful for debugging complex type resolution.
   */
  log?: (...args: any[]) => void;
  /**
   * An already-created TypeScript `Program` to reuse. When provided the
   * generator skips language-service creation.
   *
   * Mutually exclusive with {@link project}.
   */
  program?: ts.Program;
  /**
   * Strategy used to represent `Buffer` / `ArrayBuffer` types in JSON Schema.
   *
   * | Strategy | Schema |
   * |----------|--------|
   * | `"base64"` (default) | `{ type: "string", contentEncoding: "base64" }` |
   * | `"binary"` | `{ type: "string", format: "binary" }` |
   * | `"hex"` | `{ type: "string", contentEncoding: "hex", pattern: "..." }` |
   * | `"array"` | `{ type: "array", items: { type: "integer", minimum: 0, maximum: 255 } }` |
   *
   * @default "base64"
   */
  bufferStrategy?: "base64" | "binary" | "hex" | "array";
  /**
   * Custom mapper giving full control over how `Buffer` types are
   * represented. When provided, {@link bufferStrategy} is ignored.
   *
   * @param definition - The mutable JSON Schema definition to populate
   * @param ctx - Context containing the TypeScript type and schema path
   */
  mapBuffer?: (definition: JSONSchema7, ctx: { type: ts.Type; path: string }) => void;
  /**
   * By default boolean properties without an explicit initializer receive
   * `"default": false`. Set this to `true` to disable that behaviour.
   * @default false
   */
  disableBooleanDefaultToFalse?: boolean;
  /**
   * Controls accessor handling when generating schemas for classes.
   *
   * - `"input"` — getter-only properties are excluded (the schema
   *   represents what can be *sent* to the model).
   * - `"output"` — getter return types are included (the schema represents
   *   what the model *produces*).
   *
   * @default "input"
   */
  type?: "input" | "output";
  /**
   * Hook invoked for every property *before* type inspection. The callback
   * may modify any field of the {@link SchemaPropertyArguments} to alter
   * the type, definition, or depth seen by the core generator.
   *
   * @param options - The current property arguments
   * @returns The (possibly mutated) property arguments
   */
  transformer?: (options: SchemaPropertyArguments) => SchemaPropertyArguments;
}

/**
 * Check whether a TypeScript type's symbol carries the `Optional` flag.
 *
 * @param type - The type to inspect
 * @returns `true` when the underlying symbol is marked optional
 */
export function isOptional(type: ts.Type): boolean {
  const symbol = type.getSymbol();
  return !!symbol && (symbol.getFlags() & ts.SymbolFlags.Optional) !== 0;
}

/**
 * Mapping of JSDoc tag names to their treatment in the generated schema.
 *
 * - **dollarPrefixed** — tags emitted with a `$` prefix (e.g. `@id` → `$id`).
 * - **boolean** — tags whose mere presence sets the schema keyword to `true`.
 * - **string** — tags whose text is copied verbatim as a string value.
 * - **json** — tags whose text is parsed as JSON (with a string fallback).
 */
const Annotations = {
  dollarPrefixed: ["id", "comment", "ref"],
  boolean: ["deprecated", "readOnly", "writeOnly", "exclusiveMinimum", "exclusiveMaximum"],
  string: [
    "title",
    "description",
    "id",

    "format",
    "pattern",
    "ref",

    // New since draft-07:
    "comment",
    "contentMediaType",
    "contentEncoding",
    // Custom tag for if-then-else support.
    "discriminator",
    "markdownDescription",
    "deprecationMessage"
  ],
  json: [
    "minimum",
    "exclusiveMinimum",

    "maximum",
    "exclusiveMaximum",

    "multipleOf",

    "minLength",
    "maxLength",

    "minProperties",
    "maxProperties",

    "minItems",
    "maxItems",
    "uniqueItems",

    "propertyNames",
    "contains",
    "const",
    "examples",

    "default",

    "required",

    // New since draft-07:
    "if",
    "then",
    "else",
    "readOnly",
    "writeOnly",

    // New since draft 2019-09:
    "deprecated"
  ]
};

/**
 * Generates JSON Schema (Draft-07) definitions from TypeScript types.
 *
 * The generator creates a TypeScript language service (or reuses an existing
 * `ts.Program`), then walks the type graph to produce a JSON Schema object
 * for any named type, interface, class, enum, or type alias in the project.
 *
 * @example
 * ```ts
 * const gen = new SchemaGenerator({ project: "./tsconfig.json" });
 * const schema = gen.getSchemaForTypeName("User");
 * console.log(JSON.stringify(schema, null, 2));
 * ```
 */
export class SchemaGenerator {
  /** The TypeScript `Program` backing this generator */
  program: ts.Program;
  /** The type-checker used for all type queries */
  checker: ts.TypeChecker;
  /** The AST node currently targeted for schema generation */
  targetNode!: ts.Node | undefined;
  /** The symbol of the current target type (when available) */
  targetSymbol!: ts.Symbol | undefined;
  /** The TypeScript type currently being converted */
  targetType!: ts.Type;
  /** @internal */
  private static readonly defaultOptions = Object.freeze({
    maxDepth: 10,
    asRef: false,
    log: undefined as undefined | ((...args: any[]) => void),
    type: "input" as const,
    disableBooleanDefaultToFalse: false,
    bufferStrategy: "base64" as const,
    transformer: (options: SchemaPropertyArguments) => options
  });
  /** Effective options for the current generation run */
  currentOptions: Required<
    Pick<GenerateSchemaOptions, "maxDepth" | "asRef" | "type" | "disableBooleanDefaultToFalse" | "bufferStrategy">
  > &
    Partial<Pick<GenerateSchemaOptions, "mapBuffer" | "log" | "transformer">> = {
    maxDepth: 10,
    asRef: false,
    log: undefined,
    type: "input",
    disableBooleanDefaultToFalse: false,
    bufferStrategy: "base64"
  };
  /** Accumulated `definitions` map for the current generation run */
  currentDefinitions: { [key: string]: JSONSchema7 } = {};

  /**
   * Create a new generator.
   *
   * Exactly one of `options.project` or `options.program` may be provided.
   * If neither is given the current working directory is used to locate a
   * `tsconfig.json`.
   *
   * @param options - Generator configuration
   * @throws When both `project` and `program` are specified
   * @throws When no TypeScript `Program` can be created
   */
  constructor(private readonly options: GenerateSchemaOptions = {}) {
    if (options.program && options.project) {
      throw new Error("Cannot specify both program and project in SchemaGenerator options");
    }
    options.maxDepth ??= 10;
    options.project ??= options.program ? options.program.getCurrentDirectory() : process.cwd();
    if (options.project) {
      this.program = this.createLanguageService(this.options.project!).getProgram()!;
    } else {
      this.program = options.program!;
    }
    if (!this.program) throw new Error("Failed to create TypeScript Program");
    this.checker = this.program.getTypeChecker();
  }

  /**
   * Merge per-call options with the constructor-level defaults and store
   * the result in {@link currentOptions}.
   */
  private setOptions(opts: Partial<SchemaGenerator["currentOptions"]>) {
    const merged = {
      ...SchemaGenerator.defaultOptions,
      ...this.options,
      ...opts
    } as SchemaGenerator["currentOptions"];
    this.currentOptions = merged;
  }

  /** Emit a diagnostic message via the configured log callback (no-op when absent). */
  private log(...args: any[]): void {
    this.currentOptions.log?.(...args);
  }

  /**
   * Join two schema path segments, ensuring exactly one `/` separator.
   *
   * @param base - The parent path (e.g. `/MyType`)
   * @param segment - The child segment (e.g. `name`)
   * @returns The joined path (e.g. `/MyType/name`)
   */
  private joinSchemaPath(base: string, segment: string): string {
    if (!base || base === "/") return `/${segment}`;
    const b = base.replace(/\/+$/, "");
    const s = segment.replace(/^\/+/, "");
    return `${b}/${s}`;
  }

  /**
   * Return the value type of a string index signature (`{ [key: string]: T }`),
   * or `undefined` if the type does not have one.
   */
  private hasStringIndex(type: ts.Type): ts.Type | undefined {
    return this.checker.getIndexTypeOfType(type, ts.IndexKind.String) || undefined;
  }

  /** Return `true` when the type is an anonymous object literal type. */
  private isAnonymousObject(type: ts.Type): boolean {
    const anyT = type as any;
    return !!(anyT.flags & ts.TypeFlags.Object) && !!(anyT.objectFlags & ts.ObjectFlags.Anonymous);
  }

  /**
   * Determine whether a property key is a `Symbol` (ES symbol) rather than a
   * string or number. Symbol-keyed properties are not representable in JSON
   * Schema and are skipped during generation.
   *
   * @param decl - The property declaration node (may be `undefined` for synthesised properties)
   * @param sym - The property symbol
   */
  private isSymbolKey(decl: ts.Declaration | undefined, sym: ts.Symbol): boolean {
    let isSymbol = false;
    if (decl && (ts.isPropertyDeclaration(decl) || ts.isPropertySignature(decl) || ts.isMethodDeclaration(decl))) {
      const nameNode = (decl as ts.NamedDeclaration).name;
      if (nameNode && ts.isComputedPropertyName(nameNode)) {
        const keyType = this.checker.getTypeAtLocation(nameNode.expression);
        const keyFlags = keyType.flags;
        isSymbol = (keyFlags & ts.TypeFlags.ESSymbol) !== 0 || (keyFlags & ts.TypeFlags.UniqueESSymbol) !== 0;
      }
    }
    if (!isSymbol) {
      const escaped = (sym as any).escapedName as string | undefined;
      if (typeof escaped === "string" && escaped.startsWith("__@")) {
        isSymbol = true;
      }
    }
    return isSymbol;
  }

  /**
   * Normalize a definition key so that inline/synthesised type strings
   * (e.g. `{ foo: string }`) are replaced with a path-derived key.
   *
   * @param rawKey - The raw type string
   * @param path - The current schema path used as a fallback key
   */
  private normalizeDefinitionKey(rawKey: string, path: string): string {
    if (rawKey.startsWith("{") || rawKey.endsWith('">')) {
      return path.substring(1).replace(/\//g, "$");
    }
    return rawKey;
  }

  /**
   * Register a schema in {@link currentDefinitions} and replace `target`
   * in-place with a `$ref` pointing to it.
   *
   * @param defKeyRaw - The raw definition key (type name or type string)
   * @param source - The fully-populated schema to store
   * @param target - The mutable object to rewrite as a `$ref`
   * @param pathForKey - When provided, used to normalize inline type keys
   */
  private ensureRef(defKeyRaw: string, source: JSONSchema7, target: JSONSchema7, pathForKey?: string) {
    const key = pathForKey ? this.normalizeDefinitionKey(defKeyRaw, pathForKey) : defKeyRaw;
    this.currentDefinitions[key] = { ...source };
    Object.keys(target).forEach(k => delete (target as any)[k]);
    (target as any).$ref = `#/definitions/${this.getDefinitionKey(key)}`;
  }

  /**
   * Collect all public, non-method, non-symbol properties from a type and
   * build the `properties` / `required` / `additionalProperties` portion
   * of an `object` JSON Schema.
   *
   * Handles accessor awareness (`input`/`output`), question-token optionality,
   * union-with-`undefined` optionality, initializer-derived defaults, and
   * automatic `default: false` for boolean properties.
   *
   * @param type - The TypeScript type to inspect
   * @param path - The current schema path (used for nested recursion)
   * @returns An object wrapping the constructed JSON Schema
   */
  private collectObjectShape(type: ts.Type, path: string): { schema: JSONSchema7 } {
    const schema: JSONSchema7 & Record<string, any> = { type: "object" };
    const stringIndexType = this.hasStringIndex(type);
    if (stringIndexType) {
      const indexSchema: JSONSchema7 = {};
      const indexPath = this.joinSchemaPath(path, "[key: string]");
      this.schemaProperty(stringIndexType, indexSchema, indexPath, undefined, (path.match(/\//g) || []).length + 1);
      schema.additionalProperties = indexSchema;
    } else {
      schema.additionalProperties = false;
    }

    for (const prop of this.checker.getPropertiesOfType(type)) {
      const decl: ts.Declaration | undefined = (prop.valueDeclaration || prop.declarations?.[0]) as
        | ts.Declaration
        | undefined;

      const isSymbolKey = this.isSymbolKey(decl, prop);
      if (isSymbolKey) continue;

      const locationNode = decl || this.targetNode;
      if (!locationNode) continue;

      const flags = decl ? ts.getCombinedModifierFlags(decl as ts.Declaration) : 0;
      const isPrivate = (flags & ts.ModifierFlags.Private) !== 0;
      const isProtected = (flags & ts.ModifierFlags.Protected) !== 0;
      if (isPrivate || isProtected) continue;

      if (
        decl &&
        (ts.isMethodDeclaration(decl as ts.Node) ||
          ts.isMethodSignature(decl as ts.Node) ||
          ts.isFunctionTypeNode(decl as ts.Node))
      ) {
        this.log(`Skipping method property ${prop.name} at ${path}`);
        continue;
      }

      let setterParamType: ts.Type | undefined;
      if (decl && ts.isGetAccessor(decl as ts.GetAccessorDeclaration)) {
        if (this.currentOptions.type === "input") {
          const setterDecl = prop.getDeclarations()?.find(d => ts.isSetAccessor(d as ts.SetAccessorDeclaration));
          if (!setterDecl) {
            this.log(`Skipping getter-only property ${prop.name} at ${path} for input schema`);
            continue;
          }
          setterParamType = this.checker.getTypeAtLocation((setterDecl as ts.SetAccessorDeclaration).parameters[0]);
        }
      }

      const propType = setterParamType || this.checker.getTypeOfSymbolAtLocation(prop, locationNode);
      const propSchema: JSONSchema7 & Record<string, any> = {};
      const propPath = this.joinSchemaPath(path, prop.name);
      const propResult = this.schemaProperty(
        propType,
        propSchema,
        propPath,
        locationNode,
        (path.match(/\//g) || []).length + 1
      );
      this.processJsDoc(propSchema, prop);
      if (propResult.decision === "skip" || propSchema["SchemaIgnore"] === true) {
        continue;
      }
      const hasQuestionToken = decl ? (decl as any).questionToken !== undefined : false;
      const unionHasUndefined =
        (prop.valueDeclaration as ts.TypeAliasDeclaration)?.type?.kind === ts.SyntaxKind.UnionType &&
        ((prop.valueDeclaration as ts.TypeAliasDeclaration).type as ts.UnionTypeNode).types.some(
          (t: ts.TypeNode) => t.kind === ts.SyntaxKind.UndefinedKeyword
        );
      if (hasQuestionToken || unionHasUndefined) {
        propResult.optional = true;
      }
      schema.properties ??= {};
      if (propSchema.hasOwnProperty("param")) delete propSchema.param;
      schema.properties[prop.name] = propSchema;

      const declInitializer = (decl as any)?.initializer as ts.Expression | undefined;
      if (declInitializer && decl && !ts.isPropertyAssignment(decl as ts.Node)) {
        // Only treat declaration initializers as default/optional sources;
        // object literal property assignments are value mappings, not defaults.
        propResult.optional = true;
        const literal = this.tryGetNonNumericEnumLiteral(declInitializer);
        if (literal && literal.const !== undefined) {
          propSchema.default = literal.const;
        }
      }
      if (
        propSchema.type === "boolean" &&
        !this.currentOptions.disableBooleanDefaultToFalse &&
        propSchema.default === undefined
      ) {
        propSchema.default = false;
      }
      const isOptional = (prop.getFlags() & ts.SymbolFlags.Optional) !== 0;
      if (!propResult.optional && !isOptional && propSchema.default === undefined) {
        schema.required ??= [];
        schema.required.push(prop.name);
      }
    }
    if (schema.required) schema.required.sort();
    return { schema };
  }

  /**
   * Return the TypeScript `Program` backing this generator.
   *
   * Useful when callers need to query the type-checker or source files
   * outside of schema generation.
   */
  getProgram(): ts.Program {
    return this.program;
  }

  /**
   * Create a TypeScript language service rooted at the given project.
   *
   * If `projectPath` is a directory, the method looks for a `tsconfig.json`
   * inside it. If it is a file path, it is used directly.
   *
   * @param projectPath - Directory or explicit tsconfig file path
   * @returns The created language service
   * @throws When `tsconfig.json` cannot be found or parsed
   */
  createLanguageService(projectPath: string) {
    let configFilePath = projectPath;
    const sys = ts.sys;

    if (sys.directoryExists(projectPath)) {
      // If a directory, assume tsconfig.json inside
      const found = ts.findConfigFile(projectPath, sys.fileExists, "tsconfig.json");
      if (!found) {
        throw new Error(`Could not find tsconfig.json in directory: ${projectPath}`);
      }
      configFilePath = found; // now guaranteed string
    }

    const configFile = ts.readConfigFile(configFilePath, sys.readFile);
    if (configFile.error) {
      throw new Error(
        ts.formatDiagnosticsWithColorAndContext([configFile.error], {
          getCurrentDirectory: sys.getCurrentDirectory,
          getCanonicalFileName: f => f,
          getNewLine: () => sys.newLine
        })
      );
    }

    const parseConfigHost: ts.ParseConfigHost = {
      useCaseSensitiveFileNames: sys.useCaseSensitiveFileNames,
      fileExists: sys.fileExists,
      readDirectory: sys.readDirectory,
      readFile: sys.readFile
    };

    const parsed = ts.parseJsonConfigFileContent(configFile.config, parseConfigHost, sys.getCurrentDirectory());
    const files = new Map<string, { version: number; text: string }>();

    function ensureFile(fileName: string) {
      if (!files.has(fileName)) {
        const text = sys.readFile(fileName) || "";
        files.set(fileName, { version: 0, text });
      }
    }

    parsed.fileNames.forEach(ensureFile);

    const servicesHost: ts.LanguageServiceHost = {
      getScriptFileNames: () => Array.from(files.keys()),
      getScriptVersion: fileName => files.get(fileName)?.version.toString() || "0",
      getScriptSnapshot: fileName => {
        ensureFile(fileName);
        const file = files.get(fileName);
        if (!file) return undefined;
        return ts.ScriptSnapshot.fromString(file.text);
      },
      getCurrentDirectory: () => sys.getCurrentDirectory(),
      getCompilationSettings: () => parsed.options,
      getDefaultLibFileName: options => ts.getDefaultLibFilePath(options),
      fileExists: sys.fileExists,
      readFile: sys.readFile,
      readDirectory: sys.readDirectory
    };

    return ts.createLanguageService(servicesHost, ts.createDocumentRegistry());
  }

  /**
   * Determine whether the tuple element at `index` is optional.
   *
   * Uses the internal `elementFlags` / `minLength` properties of the
   * TypeScript tuple target when available, falling back to a
   * `minLength`-based heuristic for older TS versions.
   *
   * @param tupleType - The tuple type reference
   * @param index - Zero-based element index
   */
  isOptionalTupleElement(tupleType: ts.Type, index: number): boolean {
    // TupleTypeReference so we can access typeArguments & target
    const tupleRef = tupleType as ts.TupleTypeReference;
    const target = tupleRef.target as any; // internal fields

    // internal API: elementFlags + minLength
    const elementFlags: number[] = target.elementFlags ?? [];
    const minLength: number = target.minLength ?? elementFlags.length;

    // If TS version exposes ElementFlags, you can use those:
    const tsAny = ts as any;
    const ElementFlags = tsAny.ElementFlags || {
      Optional: 1 << 1 // fallback values if needed
    };

    // Prefer using elementFlags when present
    if (elementFlags.length > 0) {
      return (elementFlags[index] & ElementFlags.Optional) !== 0;
    }

    // Fallback: indices >= minLength are optional
    return index >= minLength;
  }

  /**
   * Extract JSDoc comments and tags from a symbol and merge them into the
   * given JSON Schema definition.
   *
   * Tag handling follows the {@link Annotations} classification:
   * - **string** tags are copied verbatim.
   * - **boolean** tags set the keyword to `true`.
   * - **dollar-prefixed** tags are emitted with a `$` prefix.
   * - All other tags are JSON-parsed (or kept as strings on parse failure);
   *   repeated tags are collected into an array.
   *
   * @param definition - The mutable JSON Schema object to enrich
   * @param prop - The TypeScript symbol whose JSDoc to read (no-op when `undefined`)
   */
  processJsDoc(definition: JSONSchema7, prop?: ts.Symbol) {
    if (!prop) return;
    const jsDoc = this.getJsDocForSymbol(prop, this.checker);
    if (jsDoc.comment) {
      (definition as any)["description"] = jsDoc.comment;
    }
    jsDoc.tags
      ?.filter(t => Annotations.string.includes(t.name))
      .forEach(t => {
        // Process comment tags if needed
        (definition as any)[Annotations.dollarPrefixed.includes(t.name) ? "$" + t.name : t.name] = t.text;
      });
    jsDoc.tags
      .filter(t => Annotations.boolean.includes(t.name))
      .forEach(t => {
        (definition as any)[t.name] = true;
      });
    jsDoc.tags
      ?.filter(t => !Annotations.boolean.includes(t.name) && !Annotations.string.includes(t.name))
      .forEach(t => {
        let value;
        try {
          value = JSON.parse(t.text);
        } catch {
          value = t.text;
          if (value === "") {
            value = true;
          }
        }
        // Process comment tags if needed
        if ((definition as any)[t.name] && !Array.isArray((definition as any)[t.name])) {
          (definition as any)[t.name] = [(definition as any)[t.name]];
          (definition as any)[t.name].push(value);
        } else if (Array.isArray((definition as any)[t.name])) {
          // Already an array add more value
          (definition as any)[t.name].push(value);
        } else {
          // First time seen
          (definition as any)[t.name] = value;
        }
      });
  }

  /**
   * URI-encode a type name so it can be used as a JSON Schema
   * `definitions` key and referenced via `$ref`.
   *
   * @param typeName - The raw type name (may contain generic brackets, etc.)
   * @returns The encoded key safe for use in a JSON pointer
   */
  getDefinitionKey(typeName: string): string {
    return encodeURIComponent(typeName);
  }
  /**
   * Convert a TypeScript class or interface into a JSON Schema `object`
   * definition and register it in {@link currentDefinitions}, replacing
   * `definition` in-place with a `$ref`.
   *
   * For alias-based utility types (e.g. `Partial<T>`, `Pick<T, K>`) the
   * apparent structural type is preferred so that concrete properties can
   * be enumerated. When the target is an anonymous object at the schema
   * root the schema is inlined rather than creating an empty definition.
   *
   * @param type - The TypeScript type representing the class or interface
   * @param definition - Mutable schema object; will be rewritten to a `$ref`
   * @param path - Current schema path (e.g. `/MyType/prop`)
   * @param propTypeString - Human-readable type string used as the definition key
   */
  processClassOrInterface(type: ts.Type, definition: JSONSchema7, path: string, propTypeString: string) {
    if (path.endsWith("/constructor")) {
      return;
    }
    this.log(`Processing class/interface at ${path}: ${propTypeString}`);
    // For alias-based utility/mapped types (e.g., Partial<T>, Pick<T, K>, JSON-like wrappers),
    // prefer the apparent structural type so we can enumerate concrete properties.
    const tAny = type as any;
    let structuralType: ts.Type = type;
    try {
      if (tAny.aliasSymbol || tAny.aliasTypeArguments) {
        const apparent = this.checker.getApparentType(type);
        const originalStr = this.checker.typeToString(type);
        const apparentStr = this.checker.typeToString(apparent);
        const origProps = this.checker.getPropertiesOfType(type).length;
        const appProps = this.checker.getPropertiesOfType(apparent).length;
        if (apparent && apparentStr !== originalStr && appProps >= origProps) {
          this.log(`Using apparent structural type at ${path}: ${apparentStr}`);
          structuralType = apparent;
        }
      }
    } catch {
      // Fallback quietly on any TS internal differences
      structuralType = type;
    }
    const shape = this.collectObjectShape(structuralType, path);
    // Merge any JSDoc/annotations already captured into the structural schema
    const source: JSONSchema7 = { ...(shape.schema as any), ...(definition as any) };
    // At the root path, inline the schema instead of creating an empty "" definition key
    // This avoids generating a definitions entry with an empty key when the top-level type
    // is anonymous (e.g., "{ ... }"), and makes the schema root the actual object.
    if (path === "/" && (propTypeString.trim().startsWith("{") || this.isAnonymousObject(structuralType))) {
      Object.keys(definition).forEach(k => delete (definition as any)[k]);
      Object.assign(definition as any, source as any);
      return;
    }
    // Otherwise, register the definition and replace with a $ref
    this.ensureRef(propTypeString, source, definition, path);
  }

  /**
   * Apply the configured buffer serialization strategy to `definition`.
   *
   * If a custom {@link GenerateSchemaOptions.mapBuffer} callback was provided
   * it takes precedence; otherwise the {@link GenerateSchemaOptions.bufferStrategy}
   * is used.
   *
   * @param definition - The mutable schema to populate
   * @param ctx - Context with the TypeScript type and schema path
   */
  defineBufferMapping(definition: JSONSchema7, ctx: { type: ts.Type; path: string }) {
    if (this.options.mapBuffer) {
      this.options.mapBuffer(definition, ctx);
      return;
    }
    const strategy = this.options.bufferStrategy || "base64";
    switch (strategy) {
      case "base64":
        definition.type = "string";
        definition.contentEncoding = "base64";
        definition.contentMediaType = "application/octet-stream";
        break;
      case "binary":
        definition.type = "string";
        definition.format = "binary";
        break;
      case "hex":
        definition.type = "string";
        definition.contentEncoding = "hex";
        definition.pattern = "^(?:[0-9a-fA-F]{2})*$";
        definition.contentMediaType = "application/octet-stream";
        break;
      case "array":
        definition.type = "array";
        definition.items = {
          type: "integer",
          minimum: 0,
          maximum: 255
        };
        break;
      default:
        throw new Error(`Unknown buffer strategy: ${strategy}`);
    }
  }

  /**
   * Attempt to extract a non-numeric literal value from an initializer
   * expression (after peeling parentheses and type assertions).
   *
   * Returns the JSON Schema type name and constant value for `true`, `false`,
   * `null`, or a string literal. Returns `undefined` for numeric or
   * unrecognised expressions.
   *
   * @param expr - The initializer expression to inspect
   */
  tryGetNonNumericEnumLiteral(
    expr: ts.Expression
  ): { type: JSONSchema7TypeName; const: boolean | null | string } | undefined {
    // TS 4.8+: this removes casts, parens, etc.
    // skipOuterExpressions was introduced in newer TS - access it via any to avoid typing issue
    const inner = (ts as any).skipOuterExpressions
      ? (ts as any).skipOuterExpressions(expr)
      : this.skipOuterExpressionsManual(expr);

    switch (inner.kind) {
      case ts.SyntaxKind.TrueKeyword:
        return { type: "boolean", const: true };
      case ts.SyntaxKind.FalseKeyword:
        return { type: "boolean", const: false };
      case ts.SyntaxKind.NullKeyword:
        return { type: "null", const: null };
      case ts.SyntaxKind.StringLiteral:
        return { type: "string", const: (inner as ts.StringLiteral).text };
      default:
        return undefined;
    }
  }

  /**
   * Manually peel parenthesised expressions, `as` casts, and type assertions
   * to reach the inner expression.
   *
   * Used as a fallback when `ts.skipOuterExpressions` is not available in
   * the bundled TypeScript version.
   *
   * @param expr - The expression to unwrap
   * @returns The innermost non-wrapper expression
   */
  skipOuterExpressionsManual(expr: ts.Expression): ts.Expression {
    while (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
      expr = (expr as ts.ParenthesizedExpression | ts.AsExpression | ts.TypeAssertion).expression;
    }
    return expr;
  }

  /**
   * Convert a callable type's parameter list into a `NamedParameters<typeof fn>`
   * JSON Schema object definition and register it in {@link currentDefinitions}.
   *
   * Each parameter becomes a property; optionality is derived from `?` tokens,
   * initializers, or the recursive schema result.
   *
   * @param sigs - The call signatures of the function type
   * @param definition - Mutable schema to populate (rewritten to a `$ref`)
   * @param callName - Display name for the function (used in the definition key)
   * @param path - Current schema path
   * @returns The definition key under which the schema was registered
   */
  processCallableType(sigs: readonly ts.Signature[], definition: JSONSchema7, callName: string, path: string): string {
    definition.type = "object";
    definition.additionalProperties = false;
    this.log(`Processing callable type at ${path}: ${callName}`);
    // getCallSignatures works on function types, not declarations

    definition.properties = {};
    definition.required = [];
    sigs.forEach(sig => {
      sig.getParameters().forEach(param => {
        const paramDecl = param.valueDeclaration as ts.ParameterDeclaration;
        const paramType = this.checker.getTypeOfSymbolAtLocation(param, sig.declaration!);
        const paramSchema: JSONSchema7 = {};
        const paramPath = this.joinSchemaPath(path, `parameter:${param.getName()}`);
        const paramResult = this.schemaProperty(
          paramType,
          paramSchema,
          paramPath,
          paramDecl,
          (path.match(/\//g) || []).length + 1
        );
        this.processJsDoc(paramSchema, param);
        definition.properties![param.getName()] = paramSchema;
        // Check if parameter is optional
        // A parameter is optional if it has a question token or if its type includes undefined or if it has an initializer
        const hasQuestion = !!paramDecl.questionToken;
        const hasInitializer = !!paramDecl.initializer;

        const isOptional = hasQuestion || hasInitializer || paramResult.optional;

        if (!isOptional) {
          definition.required!.push(param.getName());
        }
      });
    });
    if (definition.required.length === 0) {
      delete definition.required;
    } else {
      definition.required.sort();
    }
    if (definition.properties && Object.keys(definition.properties || {}).length === 0) {
      delete definition.properties;
    }

    const defKey = `NamedParameters<typeof ${callName}>`;
    this.ensureRef(defKey, definition, definition);
    return defKey;
  }

  /**
   * Retrieve the initializer expression for a type, first checking the
   * provided AST node and then falling back to the type's symbol declaration.
   *
   * @param type - The TypeScript type whose initializer to look for
   * @param node - An optional AST node that may carry an initializer
   * @returns The initializer expression, or `undefined` when none exists
   */
  getInitializerForType(type: ts.Type, node?: ts.Node): ts.Expression | undefined {
    // Prefer the node if it’s a declaration with an initializer
    if (node) {
      if (
        ts.isPropertyDeclaration(node) ||
        ts.isPropertySignature(node) || // interfaces (no inits, but harmless)
        ts.isPropertyAssignment(node) || // object literals
        ts.isParameter(node) ||
        ts.isVariableDeclaration(node)
      ) {
        return (node as any).initializer ?? undefined;
      }
    }

    const symbol = type.getSymbol();
    if (!symbol) return undefined;

    const decl =
      (symbol.valueDeclaration as ts.Declaration | undefined) ?? (symbol.declarations && symbol.declarations[0]);

    if (
      decl &&
      (ts.isPropertyDeclaration(decl) ||
        ts.isPropertySignature(decl) ||
        ts.isParameter(decl) ||
        ts.isVariableDeclaration(decl))
    ) {
      return (decl as any).initializer ?? undefined;
    }

    return undefined;
  }

  /**
   * Core recursive engine: populate a JSON Schema definition for a single
   * TypeScript type.
   *
   * Handles primitives, literals, unions, intersections, arrays, tuples,
   * classes/interfaces, callables, mapped types, conditional types, generics,
   * and special types (`Date`, `RegExp`, `Buffer`). The
   * {@link GenerateSchemaOptions.transformer} hook is invoked before type
   * inspection so callers can redirect or annotate the schema.
   *
   * @param type - The TypeScript type to convert
   * @param definition - Mutable JSON Schema object to populate
   * @param path - Schema path for diagnostics and definition keys
   * @param node - The AST node associated with the property (may be `undefined`)
   * @param depth - Current recursion depth; generation stops at {@link GenerateSchemaOptions.maxDepth}
   * @returns An object indicating optionality and whether the property should
   *          be kept, renamed, or skipped in the parent schema
   */
  schemaProperty(
    type: ts.Type,
    definition: JSONSchema7,
    path: string,
    node?: ts.Node,
    depth: number = 0
  ): { optional: boolean; decision: "keep" | "rename" | "skip"; to?: string } {
    const propTypeString = this.checker.typeToString(type);
    const indent = " ".repeat(depth);
    if (depth > this.currentOptions.maxDepth) {
      return { optional: false, decision: "keep" };
    }
    this.log(
      `${indent}Processing property at ${path}: ${propTypeString} (${type.flags}) ${this.isArrayLike(type) ? "[array]" : "NOT ARRAY"}`
    );
    ({ type, definition, path, node, depth } = this.currentOptions.transformer!({
      type,
      definition,
      path,
      node,
      depth
    }));
    // Capture JSDoc from multiple sources to merge annotations:
    // - the property/type symbol
    // - the alias symbol for primitive aliases (e.g., type ServiceName = string)
    // - the symbol at the declaration node
    const aliasSym: ts.Symbol | undefined = (type as any).aliasSymbol || undefined;
    const nodeSym: ts.Symbol | undefined =
      node && (this.checker.getSymbolAtLocation as any)
        ? (this.checker.getSymbolAtLocation(node as ts.Node) as ts.Symbol | undefined)
        : undefined;
    // Process in order: base type symbol, alias symbol, node symbol (closest override last)
    this.processJsDoc(definition, type.getSymbol?.());
    if (aliasSym) this.processJsDoc(definition, aliasSym);
    if (nodeSym) this.processJsDoc(definition, nodeSym);

    // If this string comes from a type alias reference (e.g., ServiceName = string),
    // merge JSDoc from the alias declaration symbol as well.
    if (node && ts.isPropertySignature(node) && node.type && ts.isTypeReferenceNode(node.type)) {
      // We could add a blocker for inheritence
      const typeNameNode = node.type.typeName;
      const aliasSymbol = this.checker.getSymbolAtLocation(typeNameNode as ts.Node);
      if (aliasSymbol) {
        this.log(`${indent}Merging JSDoc from alias ${typeNameNode.getText()} at ${path}`);
        const def: any = {};
        this.processJsDoc(def, aliasSymbol);
        this.log(`${indent}Merging JSDoc got ${JSON.stringify(def)}`);
        if (def["schemaInherits"]) {
          Object.keys(def).forEach((key: string) => {
            if (key === "schemaInherits") {
              return;
            }
            // @ts-ignore
            definition[key] ??= def[key];
          });
        }
      }
    }

    const result: { optional: boolean; decision: "keep" | "rename" | "skip"; to?: string } = {
      optional: false,
      decision: "keep"
    };
    const f = type.flags;
    // Implementation to fill in schema for a single property
    if (f & ts.TypeFlags.StringLiteral) {
      definition.type = "string";
      definition.const = (type as ts.StringLiteralType).value;
    } else if (f & ts.TypeFlags.String) {
      definition.type = "string";
      // Check if string has a initializer with constant value
      // Reuse existing helper for literal-like initializers
      const initExpr = this.getInitializerForType(type, node);
      this.log(`${indent}Checking initializer for string type at ${path} ${initExpr?.getText()}`);
      if (initExpr) {
        const literalInfo = this.tryGetNonNumericEnumLiteral(initExpr);
        if (literalInfo && literalInfo.type === "string") {
          // Decide whether this is a const or default in your schema
          (definition as any).default = literalInfo.const;
          // or: (definition as any).default = literalInfo.const;
        }
      }
    } else if (f & ts.TypeFlags.NumberLiteral) {
      definition.type = "number";
      definition.const = (type as ts.NumberLiteralType).value;
    } else if (f & ts.TypeFlags.BigIntLiteral) {
      definition.type = "number";
    } else if (propTypeString === "Function") {
      return { optional: false, decision: "skip" }; // skip function types
    } else if (f & ts.TypeFlags.NumberLike) {
      definition.type = "number";
    } else if (f & ts.TypeFlags.BooleanLiteral) {
      definition.type = "boolean";
      definition.const = (type as any).intrinsicName === "true";
    } else if (f & ts.TypeFlags.BooleanLike) {
      definition.type = "boolean";
    } else if (f & ts.TypeFlags.BigIntLike) {
      definition.type = "integer";
    } else if (f & ts.TypeFlags.Null) {
      definition.type = "null";
    } else if (f & ts.TypeFlags.Undefined || f & ts.TypeFlags.Void) {
      definition.not = {}; // JSON Schema uses 'null' type
      return { optional: true, decision: "keep" };
    } else if (f & ts.TypeFlags.Never) {
      definition.not = {}; // matches nothing
    } else if (this.isBufferType(type, propTypeString)) {
      this.applyBufferMapping(definition, type, path);
    } else if (propTypeString === "RegExp" || (type.getSymbol() && type.getSymbol()!.getName() === "RegExp")) {
      // Represent RegExp objects as strings with a custom format. JSON Schema draft-07 does not
      // define a standard format for regex objects, but downstream consumers can interpret
      // `format: "regex"` appropriately. The actual pattern value of a literal /foo/ is not
      // available from the type alone here.
      definition.type = "string";
      (definition as any).format = "regex";
    } else if (propTypeString === "Date" || (type.getSymbol() && type.getSymbol()!.getName() === "Date")) {
      // Represent Date objects as strings with a custom format. JSON Schema draft-07 does not
      // define a standard format for date objects, but downstream consumers can interpret
      // `format: "date-time"` appropriately. The actual value of a Date is not
      // available from the type alone here.
      definition.type = "string";
      this.processJsDoc(definition, type.getSymbol());
      delete definition.description; // remove description added from type symbol
      if (!(definition as any).format) {
        (definition as any).format = "date-time";
      }
    } else if (f & ts.TypeFlags.Any || f & ts.TypeFlags.Unknown) {
      // Type might be defined by its initializer
      if (node) {
        if (ts.isVariableDeclaration(node)) {
          const initializer = node.initializer;
          if (initializer) {
            const initType = this.checker.getTypeAtLocation(initializer);
            this.log(
              `${indent}Type is any/unknown at ${path}, trying initializer type: ${this.checker.typeToString(initType)}`
            );
            return this.schemaProperty(initType, definition, path, node, depth + 1);
          }
        } else if (ts.isFunctionDeclaration(node)) {
          definition.additionalProperties = false;
          definition.type = "object";
          // getCallSignatures works on function types, not declarations
          const sigs = this.checker.getSignaturesOfType(this.checker.getTypeAtLocation(node), ts.SignatureKind.Call);
          result.decision = "rename";
          result.to = this.processCallableType(sigs, definition, this.getFunctionName(node), path);
          return result;
        }
      }
      // leave type open
      this.log(`${indent}Type is any/unknown at ${path}, leaving schema open`);
    } else if (type.isClassOrInterface()) {
      this.processClassOrInterface(type, definition, path, propTypeString);
    } else if (type.isUnion()) {
      // Handle union types
      definition.anyOf = [];
      let lastValue: number = -1;
      const unionDecl = type.getSymbol()?.valueDeclaration;
      const isEnum = unionDecl ? ts.isEnumDeclaration(unionDecl) : false;
      let i = 0;
      for (const subType of type.types) {
        i++;
        // If undefined is part of the union, mark as optional
        if (subType.flags & ts.TypeFlags.Undefined) {
          result.optional = true;
          continue; // skip adding undefined to anyOf
        }
        const subSchema: JSONSchema7 = {};
        const subPath = `${path}#${i}`;
        const subNode =
          subType.getSymbol()?.valueDeclaration || subType.getSymbol()?.declarations?.[0] || this.targetNode;
        const subResult = this.schemaProperty(subType, subSchema, subPath, subNode, depth + 1);
        if (subResult.decision === "skip") {
          continue; // skip this branch
        }

        const decl = subType.getSymbol()?.valueDeclaration || subType.getSymbol()?.declarations?.[0];
        const initializer = (decl as any)?.initializer as ts.Expression | undefined;

        if (initializer) {
          // Try to get a constant value
          const constant = initializer ? this.checker.getConstantValue(decl as any) : undefined;
          if (constant !== undefined) {
            this.log(`${indent}Union branch at ${subPath} has constant value: ${constant}`);
            subSchema.const = constant;
            if (isEnum) {
              if (typeof constant === "number") {
                lastValue = constant;
              } else {
                lastValue = -2;
              }
            }
            // Remove type if it matches the const type
          } else {
            if (isEnum) {
              lastValue = -2; // disable auto-increment from now on
            }

            // Optional: try to detect boolean/null literal
            const literal = this.tryGetNonNumericEnumLiteral(initializer);
            if (literal !== undefined) {
              subSchema.const = literal.const;
              subSchema.type = literal.type;
            }
          }
        } else if (isEnum && lastValue !== -2) {
          lastValue = (lastValue ?? 0) + 1;
          subSchema.const = lastValue;
        }
        this.log(`${indent}Union branch at ${subPath}: ${subResult.optional ? "optional" : "required"}`);
        definition.anyOf.push(subSchema);
      }
      this.log(`${indent}Union (${isEnum}) at ${path} has ${JSON.stringify(definition.anyOf)} branches`);
      // Deduplicate identical schemas in anyOf
      if (definition.anyOf) {
        const seen = new Set<string>();
        const unique: JSONSchema7[] = [];
        for (const sch of definition.anyOf as JSONSchema7[]) {
          const key = JSON.stringify(sch);
          if (!seen.has(key)) {
            seen.add(key);
            unique.push(sch);
          }
        }
        (definition as any).anyOf = unique;
      }
      // definition.anyOf can contain boolean false entries (per JSONSchema7Definition) so narrow it first
      if (definition.anyOf) {
        (definition.anyOf as JSONSchema7[])
          .filter(s => (s as any).type === "null")
          .forEach(s => {
            (s as any).const = null;
          });
      }
      if (definition.anyOf && definition.anyOf.length === 0) {
        delete definition.anyOf;
      } else if (definition.anyOf && definition.anyOf.length === 1) {
        Object.assign(definition, (definition.anyOf as any[])[0]);
        delete definition.anyOf;
      } else if (
        definition.anyOf &&
        (definition.anyOf as any[]).filter((s: any) => s.const !== undefined).length ===
          (definition.anyOf as any[]).length
      ) {
        definition.enum = (definition.anyOf as any[]).map((s: any) => s.const).filter(v => v !== undefined);
        definition.type = [...new Set((definition.anyOf as any[]).map((s: any) => s.type))];
        if (definition.type.length === 1) {
          definition.type = definition.type[0];
        }
        delete definition.anyOf;
        // Only call enumOptimizer when enum is defined as an array
        if ((definition as any).enum && Array.isArray((definition as any).enum)) {
          this.enumOptimizer(definition as any);
        }
      }
      // If only "type" in anyOf entries, merge into single type array
      else if (
        definition.anyOf &&
        (definition.anyOf as any[]).every((s: any) => Object.keys(s).length === 1 && s.type !== undefined)
      ) {
        definition.type = (definition.anyOf as any[]).map(s => (s as any).type);
        delete (definition as any).anyOf;
      }
      if (definition.anyOf) {
        if (
          (definition.anyOf as any[]).find(s => (s as any).type === "boolean" && (s as any).const === true) &&
          (definition.anyOf as any[]).find(s => (s as any).type === "boolean" && (s as any).const === false)
        ) {
          // Simplify true|false to boolean
          (definition as any).anyOf = (definition.anyOf as any[]).filter((s: any) => !((s as any).type === "boolean"));
          if ((definition as any).anyOf.length === 0) {
            delete (definition as any).anyOf;
            definition.type = "boolean";
          } else {
            (definition as any).anyOf.push({ type: "boolean" });
          }
        }
        // Simplify anyOf with only type entries
        if (
          (definition as any).anyOf &&
          (definition as any).anyOf.every((s: any) => Object.keys(s).length === 1 && (s as any).type)
        ) {
          definition.type = (definition.anyOf as any[]).map(s => (s as any).type);
          delete (definition as any).anyOf;
        }
      }
      return result;
    } else if (type.isIntersection()) {
      // Handle intersection types: attempt to merge object/interface constituents
      this.log(`${indent}Processing intersection at ${path}: ${propTypeString}`);
      const mergedProperties: Record<string, JSONSchema7> = {};
      const mergedRequired: Set<string> = new Set();
      let additionalPropsFalse = true; // default to false if all constituents disallow extras
      let canFullyMerge = true;
      const subSchemas: JSONSchema7[] = [];
      let idx = 0;
      for (const subType of (type as ts.UnionOrIntersectionType).types) {
        idx++;
        const subSchema: JSONSchema7 = {};
        const subPath = `${path}&${idx}`;
        // For interfaces/classes or anonymous object types with properties, inline their properties
        if (subType.isClassOrInterface() || this.checker.getPropertiesOfType(subType).length > 0) {
          const shape = this.collectObjectShape(subType, subPath);
          Object.assign(subSchema, shape.schema);
          if (shape.schema.additionalProperties !== false) {
            additionalPropsFalse = false;
          }
        } else {
          // Non-object constituent; cannot fully merge
          const subNode =
            subType.getSymbol()?.valueDeclaration || subType.getSymbol()?.declarations?.[0] || this.targetNode;
          const subResult = this.schemaProperty(subType, subSchema, subPath, subNode, depth + 1);
          if (subResult.decision === "skip") {
            continue; // skip this branch
          }
          canFullyMerge = false;
        }
        subSchemas.push(subSchema);
        // Assess whether we can merge this sub-schema
        const effective = subSchema;
        if (effective.type === "object" && effective.properties) {
          Object.entries(effective.properties).forEach(([k, v]) => {
            if (!mergedProperties[k]) mergedProperties[k] = v as JSONSchema7;
          });
          if (effective.required) effective.required.forEach(r => mergedRequired.add(r));
          if (effective.additionalProperties !== false) {
            additionalPropsFalse = false;
          }
        } else {
          canFullyMerge = false;
        }
      }
      if (canFullyMerge) {
        definition.type = "object";
        definition.properties = mergedProperties;
        if (mergedRequired.size > 0) definition.required = Array.from(mergedRequired).sort();
        definition.additionalProperties = additionalPropsFalse ? false : undefined;
      } else {
        // Provide allOf representation when full merge isn't possible
        definition.allOf = subSchemas;
      }
      return result;
    } else if (this.isArrayLike(type)) {
      definition.type = "array";
      // Check if readonly array
      if (this.checker.isTupleType(type)) {
        const items: JSONSchema7[] = [];

        const tupleType = type as ts.TupleType;
        // Peel off the underlying target that holds tuple metadata
        const target = (tupleType as any).target ?? tupleType;
        // elementFlags tells you which elements are rest/optional/etc.
        const elementFlags = (target as any).elementFlags as readonly ts.ElementFlags[] | undefined;

        // Does the tuple end with a ...rest element?
        const hasRestAtEnd = !!elementFlags && (elementFlags[elementFlags.length - 1] & ts.ElementFlags.Rest) !== 0;

        const elementTypes = this.checker.getTypeArguments(tupleType as ts.TypeReference);
        definition.minItems = elementTypes.length;
        elementTypes.forEach((elType, index) => {
          const itemSchema: JSONSchema7 = {};
          const elNode =
            elType.getSymbol()?.valueDeclaration || elType.getSymbol()?.declarations?.[0] || this.targetNode;
          const subResult = this.schemaProperty(elType, itemSchema, `${path}[${index}]`, elNode, depth + 1);
          if (subResult.decision === "skip") {
            definition.minItems!--;
            return; // skip this branch
          }
          if (this.isOptionalTupleElement(tupleType, index)) {
            definition.minItems!--;
          }
          items.push(itemSchema);
        });
        // For tuple types we can either express items as an array (positional schemas) or, when homogeneous,
        // collapse to a single schema object (the previous behaviour expected by several fixtures).
        const homogeneous =
          items.length > 0 &&
          items.every(i => {
            const ref = items[0] as any;
            const cur = i as any;
            // Compare basic shape: type + const + enum + format etc (excluding description/title ordering noise)
            const comparableKeys = [
              "type",
              "const",
              "enum",
              "format",
              "pattern",
              "minimum",
              "maximum",
              "minLength",
              "maxLength"
            ];
            return (
              comparableKeys.every(k => JSON.stringify(ref[k]) === JSON.stringify(cur[k])) &&
              Object.keys(cur).filter(k => comparableKeys.includes(k)).length ===
                Object.keys(ref).filter(k => comparableKeys.includes(k)).length
            );
          });
        definition.items = homogeneous ? items[0] : items;
        if (!hasRestAtEnd) {
          definition.maxItems = elementTypes.length;
        } else {
          definition.minItems!--;
        }
        if (target.readonly) {
          // If every tuple element is a literal with const, represent entire tuple as a const array
          const constValues = items.map(i => (i as any).const).filter(v => v !== undefined);
          if (constValues.length === items.length) {
            (definition as any).const = constValues;
          }
          delete definition.items;
          delete definition.minItems;
          delete definition.maxItems;
        }
      } else {
        const elementType = this.getArrayElementType(type);
        if (!elementType) {
          this.log(`${indent}Could not determine array element type at ${path}, leaving items open`);
          return result;
        }
        // mark readonly (readonly T[], ReadonlyArray<T>, readonly [..] tuple)
        definition.items = {};
        const elNode =
          elementType.getSymbol()?.valueDeclaration || elementType.getSymbol()?.declarations?.[0] || this.targetNode;
        const subResult = this.schemaProperty(
          elementType,
          definition.items as JSONSchema7,
          path + "[]",
          elNode,
          depth + 1
        );
        if (subResult.decision === "skip") {
          delete definition.items;
        }
      }
    } else if (type.isTypeParameter()) {
      this.log(`${indent}Type parameter encountered at ${path}, treating as any`);
    } else if ((type as any).flags & ts.TypeFlags.Object && (type as any).objectFlags & ts.ObjectFlags.Reference) {
      // Try to resolve generic type references
      this.processClassOrInterface(type, definition, path, propTypeString);
    } else if ((type as any).flags & ts.TypeFlags.Object && (type as any).objectFlags & ts.ObjectFlags.Anonymous) {
      this.log(`${indent}Anonymous type at ${path}: ${propTypeString} (${(type as any).flags})`);
      definition.type = "object";
      // Get the parameters
      const callSignatures = (type as any).getCallSignatures ? (type as any).getCallSignatures() : [];

      if (callSignatures.length > 0) {
        result.decision = "rename";
        result.to = this.processCallableType(callSignatures, definition, this.getFunctionName(node), path);
        this.log(`${indent}Processed callable anonymous type at ${path}: ${propTypeString} (${(type as any).flags})`);
      } else {
        this.processClassOrInterface(type, definition, path, propTypeString);
        this.log(`${indent}Unhandled anonymous object type at ${path}: ${propTypeString} (${(type as any).flags})`);
      }
    } else if ((type as any).flags & ts.TypeFlags.Object) {
      // Detect Mapped Types
      const symbol = (type as any).getSymbol ? (type as any).getSymbol() : undefined;
      if (symbol && symbol.flags & ts.SymbolFlags.TypeLiteral) {
        this.processClassOrInterface(type, definition, path, propTypeString);
      } else {
        this.log(`${indent}Unhandled object type at ${path}: ${propTypeString} (${(type as any).flags})`);
      }
    } else if (
      propTypeString === "object" ||
      ((ts as any).TypeFlags?.NonPrimitive && f & (ts as any).TypeFlags.NonPrimitive) ||
      f & (ts as any).TypeFlags.NonPrimitive // for older TS where TypeFlags is just a value
    ) {
      definition.type = "object";
    } else if (f & ts.TypeFlags.UniqueESSymbol || f & ts.TypeFlags.ESSymbol) {
      // Handle Symbol type
      this.log(`${indent}Symbol type at ${path}, treating as string`);
      // Tell to delete property
      return {
        decision: "skip",
        optional: true
      };
    } else {
      const apparentType = this.checker.getApparentType(type);
      if (apparentType !== type) {
        this.log(`${indent}Trying apparent type at ${path}: ${this.checker.typeToString(apparentType)}`);
        return this.schemaProperty(apparentType, definition, path, node, depth + 1);
      } else {
        this.log(`${indent}Unhandled type at ${path}: ${propTypeString} (${(type as any).flags})`);
      }
    }
    // Add more type handling as needed
    return result;
  }

  /**
   * Return `true` when the type represents `Buffer`, `ArrayBuffer`, or a
   * `Uint8Array`-based buffer variant **and** a buffer mapping strategy is
   * configured.
   *
   * @param type - The TypeScript type to check
   * @param typeString - The stringified type name (used for heuristic matching)
   */
  private isBufferType(type: ts.Type, typeString: string): boolean {
    const symbol = type.getSymbol();
    if (!symbol) return false;
    const name = symbol.getName();
    // Only treat as special Buffer type if user requested a mapping strategy or custom mapper
    const mappingEnabled = !!this.currentOptions.bufferStrategy || !!this.currentOptions.mapBuffer;
    if (!mappingEnabled) return false;
    if (name === "Buffer" || typeString === "Buffer") return true;
    // Treat ArrayBuffer same as Buffer for serialization strategy to avoid noisy definitions
    if (name === "ArrayBuffer" || typeString === "ArrayBuffer") return true;
    // In some TS libs Buffer may appear as global interface extending Uint8Array
    // Additional heuristic: has properties from Uint8Array and at least write/read methods
    if (name === "Uint8Array" && /Buffer/.test(typeString)) return true;
    return false;
  }

  /**
   * Apply the configured buffer serialization strategy to `definition`.
   *
   * Delegates to the custom {@link GenerateSchemaOptions.mapBuffer} callback
   * when provided; otherwise maps the type according to
   * {@link GenerateSchemaOptions.bufferStrategy}.
   *
   * @param definition - The mutable schema to populate
   * @param type - The TypeScript buffer type
   * @param path - Current schema path (for diagnostics and custom callbacks)
   */
  private applyBufferMapping(definition: JSONSchema7 & Record<string, any>, type: ts.Type, path: string): void {
    this.log(`Applying Buffer mapping at ${path}`);
    if (this.options.mapBuffer) {
      this.options.mapBuffer(definition, { type, path });
      return;
    }
    const strategy = this.options.bufferStrategy || "base64";
    switch (strategy) {
      case "array":
        definition.type = "array";
        definition.items = { type: "integer", minimum: 0, maximum: 255 };
        break;
      case "binary":
        definition.type = "string";
        definition.format = "binary"; // widely used (e.g. OpenAPI) though not official draft-07
        definition.contentMediaType = "application/octet-stream";
        break;
      case "hex":
        definition.type = "string";
        definition.contentEncoding = "hex";
        definition.pattern = "^[0-9a-fA-F]+$";
        definition.contentMediaType = "application/octet-stream";
        break;
      case "base64":
      default:
        definition.type = "string";
        definition.contentEncoding = "base64";
        definition.contentMediaType = "application/octet-stream";
        break;
    }
  }

  /**
   * Deduplicate enum values and simplify trivial cases.
   *
   * A boolean enum of `[true, false]` is collapsed to `type: "boolean"`
   * with the `enum` keyword removed entirely.
   *
   * @param definition - The mutable schema containing an `enum` array
   */
  enumOptimizer(definition: { enum: (any | undefined)[]; type?: JSONSchema7TypeName }): void {
    // Ensure unique enum values
    definition.enum = Array.from(new Set(definition.enum));
    // Implementation to optimize enums in currentDefinitions
    if (definition.enum.length === 2 && definition.type === "boolean") {
      // Simplify [true, false] to boolean type
      // delete may complain about non-optional properties; cast to any for runtime delete
      delete (definition as any).enum;
    }
  }

  /**
   * Derive a human-readable function name from an AST node by walking up
   * through variable declarations, function declarations, property
   * declarations, and method declarations.
   *
   * Falls back to `"AnonymousFunction"` when no name can be determined.
   *
   * @param node - The AST node to inspect
   */
  getFunctionName(node?: ts.Node): string {
    if (!node) return "AnonymousFunction";
    if (ts.isVariableDeclaration(node) && node.name) {
      return node.name.getText();
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.getText();
    } else if (ts.isPropertyDeclaration(node) && node.name) {
      return node.name.getText();
    } else if (ts.isMethodDeclaration(node) && node.name) {
      return node.name.getText();
    } else if (node && node.parent) {
      return this.getFunctionName(node.parent);
    }
    return "AnonymousFunction";
  }

  /**
   * Generate a complete JSON Schema (Draft-07) from a TypeScript type object.
   *
   * The schema is built from scratch (definitions are reset), and all
   * referenced sub-types are collected into `definitions`. When
   * {@link GenerateSchemaOptions.asRef} is `false` (the default) the
   * top-level definition is inlined at the schema root.
   *
   * @param type - The TypeScript type to convert
   * @param options - Per-call option overrides
   * @returns A self-contained JSON Schema document
   */
  getSchemaFromType(type: ts.Type, options: Partial<SchemaGenerator["currentOptions"]> = {}): JSONSchema7 {
    this.setOptions(options);
    this.currentDefinitions = {};
    const result: JSONSchema7 = { $schema: "http://json-schema.org/draft-07/schema#" };
    this.targetType = type;
    const typeName = this.checker.typeToString(type);
    const defSchema: JSONSchema7 = {};
    this.log(`Generating schema for type "${typeName}"`);
    const res = this.schemaProperty(this.targetType, defSchema, "/", this.targetNode, 0);
    // Allow rename, unless it is a type `type X = ...;` declaration
    if (res.decision === "rename" && this.targetNode && this.targetNode.kind !== ts.SyntaxKind.TypeAliasDeclaration) {
      this.log(`Renaming type from "${typeName}" to "${res.to}" ${ts.SyntaxKind[this.targetNode.kind]}`);
    }
    result.$ref = `#/definitions/${this.getDefinitionKey(typeName)}`;
    result.definitions = { ...this.currentDefinitions };
    result.definitions[typeName] = defSchema;
    if (!this.currentOptions.asRef && result.$ref) {
      // Inline definitions
      const defKey = decodeURIComponent(result.$ref.replace("#/definitions/", ""));
      Object.assign(result, result.definitions![defKey]);
      if (result.definitions && result.$ref) {
        delete (result.definitions as any)[defKey];
      }
      if (Object.keys(result.definitions || {}).length === 0) {
        delete result.definitions;
      }
      delete result.$ref;
    }
    // Sort keys alphabetically recursively
    return this.sortKeys(result);
  }

  /**
   * Generate a complete JSON Schema (Draft-07) from one or more AST nodes.
   *
   * Each node is expected to be a class, interface, type alias, function, or
   * enum declaration. The first node's type becomes the root `$ref`; all
   * subsequent nodes contribute additional definitions.
   *
   * @param nodes - Declaration nodes to process
   * @param options - Per-call option overrides
   * @returns A self-contained JSON Schema document
   */
  getSchemaFromNodes(nodes: ts.Node[], options: Partial<SchemaGenerator["currentOptions"]> = {}): JSONSchema7 {
    this.setOptions(options);
    this.currentDefinitions = {};
    const result: JSONSchema7 = { $schema: "http://json-schema.org/draft-07/schema#" };
    // Implementation to create schema from nodes
    nodes.forEach(node => {
      this.log(
        `Processing target node: ${(node as any).name ? (node as any).name.getText() : "Unknown"} (${ts.SyntaxKind[node.kind]})`
      );
      this.targetNode = node as ts.InterfaceDeclaration | ts.ClassDeclaration | ts.TypeAliasDeclaration;
      const nodeN = node as ts.NamedDeclaration;
      this.targetType = this.checker.getTypeAtLocation(node);
      let typeName = nodeN.name ? nodeN.name.getText() : this.checker.typeToString(this.targetType);
      const defSchema: JSONSchema7 = {};
      this.log(`Generating schema for type "${typeName}"`);
      const res = this.schemaProperty(this.targetType, defSchema, "/", this.targetNode, 0);
      // Allow rename, unless it is a type `type X = ...;` declaration
      if (res.decision === "rename" && this.targetNode.kind !== ts.SyntaxKind.TypeAliasDeclaration) {
        this.log(`Renaming type from "${typeName}" to "${res.to}" ${ts.SyntaxKind[this.targetNode.kind]}`);
        typeName = res.to!;
      }
      result.$ref ??= `#/definitions/${this.getDefinitionKey(typeName)}`;
      result.definitions = { ...this.currentDefinitions };
      result.definitions[typeName] ??= defSchema;
    });
    if (!this.currentOptions.asRef && result.$ref) {
      // Inline definitions
      const defKey = decodeURIComponent(result.$ref.replace("#/definitions/", ""));
      Object.assign(result, result.definitions![defKey]);
      if (result.definitions && result.$ref) {
        delete (result.definitions as any)[defKey];
      }
      if (Object.keys(result.definitions || {}).length === 0) {
        delete result.definitions;
      }
      delete result.$ref;
    }
    // Sort keys alphabetically recursively
    return this.sortKeys(result);
  }

  /**
   * High-level convenience method: look up a type by name (and optionally
   * restrict the search to a single file), then generate its JSON Schema.
   *
   * @param typeName - The name of the type, interface, class, or enum to find
   * @param file - Optional file path to restrict the search
   * @param options - Per-call option overrides
   * @returns A self-contained JSON Schema document
   * @throws When the type cannot be found in the program
   */
  getSchemaForTypeName(
    typeName: string,
    file?: string,
    options: Partial<SchemaGenerator["currentOptions"]> = {}
  ): JSONSchema7 {
    this.targetNode = this.find(typeName, file)!;
    if (!this.targetNode) {
      throw new Error(`Type "${typeName}" not found${file ? ` in file "${file}"` : ""}`);
    }
    options.log?.(`Found target node for type "${typeName}": ${ts.SyntaxKind[this.targetNode.kind]}`);
    return this.getSchemaFromNodes([this.targetNode], options);
  }

  /**
   * Recursively sort all object keys alphabetically to produce
   * deterministic, diff-friendly JSON Schema output.
   *
   * Arrays are traversed but their order is preserved.
   *
   * @param obj - The value to sort (objects are cloned, primitives pass through)
   * @returns A deep copy with sorted keys
   */
  sortKeys(obj: any): any {
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const sorted: any = {};
      Object.keys(obj)
        .sort()
        .forEach(key => {
          sorted[key] = this.sortKeys(obj[key]);
        });
      return sorted;
    } else if (Array.isArray(obj)) {
      return obj.map(item => this.sortKeys(item));
    }
    return obj;
  }

  /**
   * Walk the program's source files to locate the first declaration node
   * matching `typeName`.
   *
   * Searches class, interface, type alias, function, variable, and enum
   * declarations. When `filePath` is provided only that file is scanned.
   *
   * @param typeName - The identifier name to search for
   * @param filePath - Optional absolute path to restrict the search to one file
   * @returns The matching declaration node, or `undefined` if not found
   */
  find(typeName: string, filePath?: string): ts.Node | undefined {
    let targetNode: ts.Node | undefined;
    // Implementation to find the target declaration
    const findTarget = (node: ts.Node) => {
      if (targetNode) return; // already found, skip further work
      // Narrow to named declarations we care about
      const nodeNameText = (node as any).name ? (node as any).name.text : "<anonymous>";
      this.log(`Visiting node: ${nodeNameText} (${ts.SyntaxKind[node.kind]})`);
      if (
        ts.isClassDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isVariableDeclaration(node) ||
        ts.isEnumDeclaration(node)
      ) {
        const nodeName = node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
        // optional: check exported only
        // const isExported = (ts.getCombinedModifierFlags(node as ts.Declaration) & ts.ModifierFlags.Export) !== 0;

        if (nodeName === typeName) {
          targetNode = node;
          return;
        }
      }
      // Recurse into children
      ts.forEachChild(node, findTarget);
    };
    this.program.getSourceFiles().forEach(file => {
      if (filePath && path.resolve(file.fileName) !== path.resolve(filePath)) {
        return;
      }
      ts.forEachChild(file, findTarget);
    });
    return targetNode;
  }

  /**
   * Resolve the element type of an array-like type.
   *
   * Tries, in order:
   * 1. Numeric index signature (`T[]`, `Array<T>`, tuples)
   * 2. Type arguments of `Array` / `ReadonlyArray` type references
   * 3. Symbol-name heuristic for aliased array types
   *
   * @param type - The array-like TypeScript type
   * @returns The element type, or `undefined` when it cannot be determined
   */
  getArrayElementType(type: ts.Type): ts.Type | undefined {
    // Primary: numeric index signature (works for T[], Array<T>, tuples)
    const byIndex = this.checker.getIndexTypeOfType(type, ts.IndexKind.Number);
    if (byIndex) return byIndex;

    // Fallback 1: explicit Array/ReadonlyArray type reference with type arguments
    if (type.flags & ts.TypeFlags.Object && (type as any).objectFlags & ts.ObjectFlags.Reference) {
      try {
        const ref = type as ts.TypeReference;
        const args = this.checker.getTypeArguments(ref);
        if (args && args.length > 0) return args[0];
      } catch (_) {
        // ignore and try other strategies
      }
      const refAny: any = type as any;
      const target: any = refAny.target ?? refAny;
      const targArgs: ts.Type[] | undefined = target?.typeArguments;
      if (targArgs && targArgs.length > 0) return targArgs[0];
    }

    // Fallback 2: check symbol name for Array/ReadonlyArray and attempt to read typeParameters
    const sym = (type as any).symbol || (type as any).aliasSymbol;
    const name: string | undefined = sym?.escapedName ?? sym?.name;
    if (name === "Array" || name === "ReadonlyArray") {
      try {
        const ref = type as ts.TypeReference;
        const args = this.checker.getTypeArguments(ref);
        if (args && args.length > 0) return args[0];
      } catch (_) {}
    }

    return undefined;
  }

  /**
   * Determine whether a type should be represented as a JSON Schema `array`.
   *
   * Uses `checker.isArrayLikeType()` when available, then falls back to
   * checking for a numeric index signature and finally inspects the type
   * reference target symbol name for `Array` / `ReadonlyArray`.
   *
   * @param type - The TypeScript type to test
   */
  private isArrayLike(type: ts.Type): boolean {
    // Prefer the checker’s own detection when available
    try {
      if (this.checker.isArrayLikeType(type)) return true;
    } catch (_) {
      // Older TS versions may not have stable behavior; fall through
    }
    const anyChecker: any = this.checker as any;
    if (typeof anyChecker.isArrayType === "function" && anyChecker.isArrayType(type)) return true;

    // Numeric index signature implies array-like (covers Array<T>, T[], ReadonlyArray<T>, tuples)
    if (this.checker.getIndexTypeOfType(type, ts.IndexKind.Number)) return true;

    // Extra guard: explicit reference to Array/ReadonlyArray
    if (type.flags & ts.TypeFlags.Object && (type as any).objectFlags & ts.ObjectFlags.Reference) {
      const ref = type as ts.TypeReference;
      const target: any = (ref as any).target ?? ref;
      const sym = target?.symbol ?? (type as any).symbol;
      const name: string | undefined = sym?.escapedName ?? sym?.name;
      if (name === "Array" || name === "ReadonlyArray") return true;
    }
    return false;
  }

  /**
   * Extract the JSDoc comment text and all JSDoc tags from a symbol.
   *
   * @param prop - The symbol whose documentation to read
   * @param checker - The type-checker used for resolving display parts
   * @returns An object with a `comment` string and a `tags` array of
   *          `{ name, text }` pairs
   */
  getJsDocForSymbol(prop: ts.Symbol, checker: ts.TypeChecker) {
    const comment = ts.displayPartsToString(prop.getDocumentationComment(checker));

    const tags = prop.getJsDocTags().map(tag => ({ name: tag.name, text: ts.displayPartsToString(tag.text ?? []) }));

    return { comment, tags };
  }
}
