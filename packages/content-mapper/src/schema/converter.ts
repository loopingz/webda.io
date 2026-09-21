/**
 * A purpose-built TypeScript type -> JSON Schema converter on the 7.1 checker.
 *
 * This is stage 7 of the TypeScript 7 migration. Two alternatives were
 * rejected on evidence (see `docs/contribute/TypeScript 7 Content Mappers.md`,
 * "Stage 7 plan"): porting `@webda/schema`'s 2,200 lines, which target the
 * vega corpus and blacklist fixtures they cannot match; and adopting
 * `ts-json-schema-generator-go`, which today emits no accessor-backed
 * properties at all.
 *
 * What makes a purpose-built converter tractable is how narrow the committed
 * corpus is: 4,154 schema nodes using twelve keywords, no `oneOf`, no
 * conditionals. Webda service parameters and models are ordinary object
 * shapes, not arbitrary TypeScript.
 *
 * **The converter throws on any type it cannot convert.** There is no
 * best-effort path — see {@link SchemaConversionError}.
 *
 * ### Fidelity
 *
 * The target is byte-identical output against the committed
 * `webda.module.json`, verified by `tools/schema-diff.mjs`. That makes this a
 * behavioural reimplementation, not a redesign: where `@webda/schema` does
 * something odd and the oddity reached the committed artefact, it is
 * reproduced and commented rather than corrected. Changing any of it is a
 * separate, visible commit.
 */
import { IndexKind, ObjectFlags, SignatureKind, SymbolFlags, TypeFlags } from "typescript/unstable/sync";
import type {
  Checker,
  LiteralType,
  Project,
  Symbol as TsSymbol,
  TupleTypeReference,
  Type,
  TypeReference,
  UnionOrIntersectionType
} from "typescript/unstable/sync";
import { ModifierFlags, SyntaxKind } from "typescript/unstable/ast";
import type { Expression, Node } from "typescript/unstable/ast";
import * as is from "typescript/unstable/ast/is";
import { applyDocs } from "./annotations.ts";
import { SchemaConversionError, type JSONSchema7 } from "./types.ts";

/** JSON Schema dialect every generated document declares. */
const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

/**
 * Which side of an accessor pair a schema describes.
 *
 * Service parameters only ever use `input`. The DTO modes exist for stage 7.2
 * (model schemas) and are declared here so the property filter has one
 * definition rather than two.
 */
export type SchemaMode = "input" | "output" | "dto-in" | "dto-out";

/** How a `Buffer`-like type is represented. */
export type BufferStrategy = "base64" | "binary" | "hex" | "array";

/** Converter construction options. */
export interface ConverterOptions {
  /** Project the checker belongs to, needed to resolve node handles. */
  project: Project;
  /** The resident checker. */
  checker: Checker;
  /** Recursion limit; beyond it a property is left unconstrained. */
  maxDepth?: number;
  /** Accessor handling. */
  mode?: SchemaMode;
  /** Suppress the automatic `default: false` on booleans. */
  disableBooleanDefaultToFalse?: boolean;
  /** Representation for `Buffer` / `ArrayBuffer`. */
  bufferStrategy?: BufferStrategy;
}

/** What converting one property told the parent object. */
interface PropertyOutcome {
  /** The property may be absent, so it is kept out of `required`. */
  optional: boolean;
  /** `skip` removes the property from the parent entirely. */
  decision: "keep" | "skip";
}

const KEEP: PropertyOutcome = { optional: false, decision: "keep" };
const SKIP: PropertyOutcome = { optional: false, decision: "skip" };

/**
 * Converts TypeScript types into JSON Schema draft-07 documents.
 *
 * One instance may serve many conversions; `definitions` are reset per
 * document.
 */
export class SchemaConverter {
  private readonly project: Project;
  private readonly checker: Checker;
  private readonly maxDepth: number;
  private readonly mode: SchemaMode;
  private readonly booleanDefaultFalse: boolean;
  private readonly bufferStrategy: BufferStrategy;

  /** Sub-schemas hoisted out of the current document. */
  private definitions: Record<string, JSONSchema7> = {};
  /** Fallback resolution context when a property has no declaration. */
  private targetNode: Node | undefined;

  /**
   * @param options - project, checker and conversion settings
   */
  constructor(options: ConverterOptions) {
    this.project = options.project;
    this.checker = options.checker;
    this.maxDepth = options.maxDepth ?? 10;
    this.mode = options.mode ?? "input";
    this.booleanDefaultFalse = !options.disableBooleanDefaultToFalse;
    this.bufferStrategy = options.bufferStrategy ?? "base64";
  }

  // ---------------------------------------------------------------- entry --

  /**
   * Convert the type at a node into a complete schema document.
   *
   * Mirrors `SchemaGenerator.getSchemaFromNodes` with a single node, which is
   * how `@webda/compiler` always calls it.
   * @param node - a declaration or type node
   * @returns a self-contained draft-07 document
   */
  fromNode(node: Node): JSONSchema7 {
    const type = this.checker.getTypeAtLocation(node);
    return this.document(type, this.declaredName(node) ?? this.checker.typeToString(type), node);
  }

  /**
   * Convert a type into a complete schema document.
   *
   * Mirrors `SchemaGenerator.getSchemaFromType`.
   * @param type - the type to convert
   * @param contextNode - resolution context for properties without declarations
   * @returns a self-contained draft-07 document
   */
  fromType(type: Type, contextNode?: Node): JSONSchema7 {
    return this.document(type, this.checker.typeToString(type), contextNode);
  }

  /**
   * Build one document: convert, hoist, inline the root, sort.
   * @param type - the type to convert
   * @param typeName - key the root definition is registered under
   * @param node - resolution context
   * @returns the finished document
   */
  private document(type: Type, typeName: string, node: Node | undefined): JSONSchema7 {
    this.definitions = {};
    this.targetNode = node;

    const root: JSONSchema7 = {};
    this.property(type, root, "/", node, 0);

    const result: JSONSchema7 = { $schema: DRAFT_07, $ref: `#/definitions/${encodeURIComponent(typeName)}` };
    result.definitions = { ...this.definitions };
    result.definitions[typeName] ??= root;

    this.inlineRootRef(result);
    return sortKeys(result);
  }

  /**
   * Follow the root `$ref` into the document body.
   *
   * A definition can itself be a bare `$ref` — an anonymous object registered
   * under a union-branch path, for instance — so the chain is followed to the
   * end and every consumed definition removed.
   * @param result - the document to flatten, mutated in place
   */
  private inlineRootRef(result: JSONSchema7): void {
    while (result.$ref && result.definitions) {
      const key = decodeURIComponent(result.$ref.replace("#/definitions/", ""));
      const target = result.definitions[key];
      if (!target) break;
      delete result.$ref;
      delete result.definitions[key];
      Object.assign(result, target);
    }
    if (result.definitions && Object.keys(result.definitions).length === 0) delete result.definitions;
  }

  // ------------------------------------------------------------ dispatch --

  /**
   * Convert one type into `definition`, in place.
   *
   * The branch order matters and is taken from `@webda/schema`: literals
   * before their widened forms, `Date` and `RegExp` before the generic
   * class/interface handling, arrays after unions. The final `else` throws.
   * @param type - the type to convert
   * @param definition - schema to populate
   * @param path - schema path, used for definition keys and error messages
   * @param node - declaration the type came from, when there is one
   * @param depth - recursion depth
   * @returns whether the parent should keep the property, and its optionality
   */
  private property(
    type: Type,
    definition: JSONSchema7,
    path: string,
    node: Node | undefined,
    depth: number
  ): PropertyOutcome {
    if (depth > this.maxDepth) return KEEP;

    const typeName = this.checker.typeToString(type);

    // JSDoc from three sources, nearest last so it wins: the type's own
    // symbol, the alias it was reached through, and the declaration node.
    applyDocs(definition, type.getSymbol(), this.checker, this.project);
    const aliasSymbol = type.getAliasSymbol();
    if (aliasSymbol) applyDocs(definition, aliasSymbol, this.checker, this.project);
    if (node) applyDocs(definition, this.checker.getSymbolAtLocation(node), this.checker, this.project);
    this.inheritAliasDocs(definition, node);

    // Checked before the shape dispatch so it also covers array-typed
    // attributes whose element class carries the marker — `Binaries<T>`
    // extends `Array`, so the class branch below never sees it.
    if (path !== "/" && this.mode === "dto-in") {
      const context = node ?? this.targetNode;
      if (this.hasReadOnlyTag(type)) return SKIP;
      if (context && this.resolveFromDto(type, context) === "skip") return SKIP;
    }

    const flags = type.flags;

    if (flags & TypeFlags.StringLiteral) {
      definition.type = "string";
      definition.const = (type as LiteralType).value;
      return KEEP;
    }
    if (flags & TypeFlags.String) {
      definition.type = "string";
      const literal = literalOf(this.initializerFor(type, node));
      if (literal?.type === "string") definition.default = literal.const;
      return KEEP;
    }
    // A template literal (`` `pre-${string}` ``) or a string mapping
    // (`Uppercase<T>`) constrains a string in a way draft-07 cannot express
    // without deriving a regex. `type: "string"` would accept values the type
    // rejects, and `isArrayLike` below would otherwise class them as arrays —
    // `string` carries a numeric index signature — which is worse still.
    if (flags & (TypeFlags.TemplateLiteral | TypeFlags.StringMapping)) {
      throw new SchemaConversionError(
        "a template literal or mapped string type has no JSON Schema form; widen it to `string` or add a `@pattern`",
        path,
        typeName
      );
    }
    if (flags & TypeFlags.NumberLiteral) {
      definition.type = "number";
      definition.const = (type as LiteralType).value;
      return KEEP;
    }
    if (flags & TypeFlags.BigIntLiteral) {
      definition.type = "number";
      return KEEP;
    }
    // `Function` is matched by name because the checker models it as an
    // interface, so the class/interface branch would otherwise emit an object.
    if (typeName === "Function") return SKIP;
    if (flags & TypeFlags.NumberLike) {
      definition.type = "number";
      return KEEP;
    }
    if (flags & TypeFlags.BooleanLiteral) {
      definition.type = "boolean";
      // 7.1 carries the value on the literal type; 6.x only exposed
      // `intrinsicName`, which is empty here and would read as `false`.
      definition.const = (type as LiteralType).value === true;
      return KEEP;
    }
    if (flags & TypeFlags.BooleanLike) {
      definition.type = "boolean";
      return KEEP;
    }
    if (flags & TypeFlags.BigIntLike) {
      definition.type = "integer";
      return KEEP;
    }
    if (flags & TypeFlags.Null) {
      definition.type = "null";
      return KEEP;
    }
    if (flags & (TypeFlags.Undefined | TypeFlags.Void)) {
      definition.not = {};
      return { optional: true, decision: "keep" };
    }
    if (flags & TypeFlags.Never) {
      definition.not = {};
      return KEEP;
    }
    if (this.isBuffer(type, typeName)) {
      this.applyBuffer(definition);
      return KEEP;
    }
    if (typeName === "RegExp" || type.getSymbol()?.name === "RegExp") {
      // draft-07 has no regex-object format; `format: "regex"` is the
      // convention downstream consumers already read.
      definition.type = "string";
      definition.format = "regex";
      return KEEP;
    }
    if (typeName === "Date" || type.getSymbol()?.name === "Date") {
      definition.type = "string";
      // lib.es5.d.ts documents the `Date` interface itself; that text is not a
      // description of the property, so it is dropped again.
      applyDocs(definition, type.getSymbol(), this.checker, this.project);
      delete definition.description;
      definition.format ??= "date-time";
      return KEEP;
    }
    if (flags & (TypeFlags.Any | TypeFlags.Unknown)) {
      // Deliberately unconstrained: `any` permits anything, and saying so is
      // accurate rather than best-effort.
      return KEEP;
    }
    if (type.isClassOrInterface()) return this.objectLike(type, definition, path, typeName, node, depth);
    if (type.isUnionType()) return this.union(type, definition, path, node, depth);
    if (type.isIntersectionType()) return this.intersection(type, definition, path, depth);
    if (this.isArrayLike(type)) return this.array(type, definition, path, depth);
    if (type.isTypeParameter()) {
      // An unresolved type parameter constrains nothing at this point.
      return KEEP;
    }

    const objectFlags = objectFlagsOf(type);
    if (objectFlags & ObjectFlags.Reference) return this.objectLike(type, definition, path, typeName, node, depth);
    if (objectFlags & ObjectFlags.Anonymous) {
      if (type.getCallSignatures().length > 0) {
        // A callable is not serialisable. At the root the caller asked for a
        // function's schema, which service parameters never do.
        if (depth > 0) return SKIP;
        throw new SchemaConversionError("cannot convert a callable type at the schema root", path, typeName);
      }
      return this.objectLike(type, definition, path, typeName, node, depth);
    }
    if (objectFlags && (type.getSymbol()?.flags ?? 0) & SymbolFlags.TypeLiteral) {
      return this.objectLike(type, definition, path, typeName, node, depth);
    }
    if (flags & TypeFlags.NonPrimitive) {
      definition.type = "object";
      return KEEP;
    }
    if (flags & (TypeFlags.ESSymbol | TypeFlags.UniqueESSymbol)) {
      // Symbols have no JSON representation, so the property cannot exist in
      // the schema at all.
      return SKIP;
    }

    const apparent = this.checker.getApparentType(type);
    if (apparent.id !== type.id) return this.property(apparent, definition, path, node, depth + 1);

    throw new SchemaConversionError("no JSON Schema representation for this type", path, typeName);
  }

  /**
   * Merge annotations from a type alias tagged `@schemaInherits`.
   *
   * `type Email = string` with `@format email` on the alias only reaches the
   * property when the alias opts in, otherwise every use of a documented alias
   * would inherit its prose.
   * @param definition - schema to enrich
   * @param node - the property declaration
   */
  private inheritAliasDocs(definition: JSONSchema7, node: Node | undefined): void {
    if (!node || !is.isPropertySignatureDeclaration(node)) return;
    const typeNode = node.type;
    if (!typeNode || !is.isTypeReferenceNode(typeNode)) return;
    const aliasSymbol = this.checker.getSymbolAtLocation(typeNode.typeName);
    if (!aliasSymbol) return;

    const inherited: JSONSchema7 = {};
    applyDocs(inherited, aliasSymbol, this.checker, this.project);
    if (!inherited.schemaInherits) return;
    for (const [key, value] of Object.entries(inherited)) {
      if (key === "schemaInherits") continue;
      (definition as Record<string, unknown>)[key] ??= value;
    }
  }

  // -------------------------------------------------------------- objects --

  /**
   * Convert a class, interface, anonymous object or generic reference.
   *
   * The shape is registered in `definitions` and the caller's slot replaced
   * with a `$ref`, except at the document root where an anonymous object is
   * inlined instead — otherwise the root would sit behind a definition keyed
   * by its own stringified shape.
   * @param type - the object-like type
   * @param definition - schema slot to populate
   * @param path - schema path
   * @param typeName - stringified type, used as the definition key
   * @param node - declaration context
   * @param depth - recursion depth
   * @returns keep or skip
   */
  private objectLike(
    type: Type,
    definition: JSONSchema7,
    path: string,
    typeName: string,
    node: Node | undefined,
    depth: number
  ): PropertyOutcome {
    // A nested class states its own serialised form, and that beats its
    // structural shape. Which method is consulted depends on the direction
    // the schema describes.
    if (path !== "/") {
      const context = node ?? this.targetNode;

      if (this.mode === "dto-in" && context) {
        // A class tagged `@readOnly`, or one whose `fromDto` takes `never`,
        // is never user-supplied — the attribute leaves the Input schema.
        if (this.hasReadOnlyTag(type)) return SKIP;
        const accepted = this.resolveFromDto(type, context);
        if (accepted === "skip") return SKIP;
        if (accepted) {
          this.property(accepted, definition, path, node, depth + 1);
          return KEEP;
        }
      }

      if (this.mode === "dto-out" && context) {
        const produced = this.methodReturnType(type, ["toDTO", "toDto"], context);
        if (produced) {
          if (produced.flags & (TypeFlags.Void | TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Never)) return SKIP;
          this.property(this.simplifyIntersection(produced), definition, path, node, depth + 1);
          return KEEP;
        }
      }

      const serialized = context ? this.methodReturnType(type, ["toJSON"], context) : undefined;
      if (serialized) {
        const flags = serialized.flags;
        if (flags & (TypeFlags.Void | TypeFlags.Undefined | TypeFlags.Null | TypeFlags.Never)) return SKIP;
        const returned = this.checker.typeToString(serialized);
        // A `toJSON(): this` says nothing new; only a concrete return type is
        // worth substituting for the class shape.
        if (returned !== typeName && !(flags & TypeFlags.Any)) {
          this.property(this.simplifyIntersection(serialized), definition, path, node, depth + 1);
          return KEEP;
        }
      }
    }

    // For alias-based utility types (`Partial<T>`, `Pick<T, K>`) the apparent
    // type is the one with enumerable properties.
    const structural = this.structuralType(type);
    const shape = this.objectShape(structural, path);
    // Annotations already collected outranks the structural keywords.
    const merged: JSONSchema7 = { ...shape, ...definition };

    if (path === "/" && (typeName.trim().startsWith("{") || isAnonymous(structural))) {
      for (const key of Object.keys(definition)) delete definition[key];
      Object.assign(definition, merged);
      return KEEP;
    }

    this.registerDefinition(typeName, merged, definition, path);
    return KEEP;
  }

  /**
   * Prefer the apparent type when a type alias hides the concrete shape.
   * @param type - the declared type
   * @returns the type whose properties should be enumerated
   */
  private structuralType(type: Type): Type {
    if (!type.getAliasSymbol() && type.getAliasTypeArguments().length === 0) return type;
    const apparent = this.checker.getApparentType(type);
    if (this.checker.typeToString(apparent) === this.checker.typeToString(type)) return type;
    if (this.checker.getPropertiesOfType(apparent).length < this.checker.getPropertiesOfType(type).length) return type;
    return apparent;
  }

  /**
   * Build the `type` / `properties` / `required` / `additionalProperties`
   * portion of an object schema.
   *
   * Properties are read off the **type**, not the declaration's own members,
   * so inherited attributes are included.
   * @param type - the object type
   * @param path - schema path of the object
   * @returns the object schema
   */
  private objectShape(type: Type, path: string): JSONSchema7 {
    const schema: JSONSchema7 = { type: "object" };
    const depth = (path.match(/\//g) ?? []).length;

    const indexType = this.checker.getIndexTypeOfType(type, IndexKind.String);
    if (indexType) {
      const indexSchema: JSONSchema7 = {};
      this.property(indexType, indexSchema, joinPath(path, "[key: string]"), undefined, depth + 1);
      schema.additionalProperties = indexSchema;
    } else {
      schema.additionalProperties = false;
    }

    for (const prop of this.checker.getPropertiesOfType(type)) {
      const declaration = this.declarationOf(prop);
      if (this.isSymbolKeyed(prop, declaration)) continue;

      const location = declaration ?? this.targetNode;
      if (!location) continue;

      const modifiers = declaration ? modifierFlagsOf(declaration) : 0;
      if (modifiers & (ModifierFlags.Private | ModifierFlags.Protected)) continue;
      if (declaration && isMethodLike(declaration)) continue;

      const propertyType = this.readableType(prop, declaration, location);
      if (!propertyType) continue;

      const propSchema: JSONSchema7 = {};
      const propPath = joinPath(path, prop.name);
      const outcome = this.property(propertyType, propSchema, propPath, location, depth + 1);
      applyDocs(propSchema, prop, this.checker, this.project);
      if (outcome.decision === "skip" || propSchema.SchemaIgnore === true) continue;

      // `@readOnly` on the property is equivalent to the modifier.
      const readonly = (modifiers & ModifierFlags.Readonly) !== 0 || propSchema.readOnly === true;
      if (readonly && this.isInputMode()) continue;

      let optional = outcome.optional;
      if (hasQuestionToken(declaration) || propSchema.SchemaOptional) optional = true;

      // `@param` documents a callback's arguments, not the property, and is
      // not a JSON Schema keyword. It reaches the schema through the generic
      // tag handling and is dropped here, as `@webda/schema` does.
      delete propSchema.param;

      schema.properties ??= {};
      schema.properties[prop.name] = propSchema;

      const initializer = declaration && !is.isPropertyAssignment(declaration) ? initializerOf(declaration) : undefined;
      if (initializer) {
        // A field with an initializer need not be supplied.
        optional = true;
        const literal = literalOf(initializer);
        if (literal) propSchema.default = literal.const;
      }
      if (propSchema.type === "boolean" && this.booleanDefaultFalse && propSchema.default === undefined) {
        propSchema.default = false;
      }

      const declaredOptional = (prop.flags & SymbolFlags.Optional) !== 0;
      if (!optional && !declaredOptional && propSchema.default === undefined) {
        schema.required ??= [];
        schema.required.push(prop.name);
      }
    }

    schema.required?.sort();
    return schema;
  }

  /**
   * The type a property contributes to this schema, honouring accessors.
   *
   * For an input schema a getter-only property cannot be supplied at all; when
   * a setter exists its parameter type is the accepted one, which is what
   * makes the asymmetric accessors the content mapper generates meaningful.
   * @param prop - the property symbol
   * @param declaration - its primary declaration
   * @param location - resolution context
   * @returns the type to convert, or undefined to drop the property
   */
  private readableType(prop: TsSymbol, declaration: Node | undefined, location: Node): Type | undefined {
    if (declaration && is.isGetAccessorDeclaration(declaration) && this.isInputMode()) {
      const setter = prop.declarations
        .map(handle => handle.resolve(this.project))
        .find(node => node && is.isSetAccessorDeclaration(node));
      if (!setter) return undefined;
      const parameter = (setter as unknown as { parameters: readonly Node[] }).parameters[0];
      if (!parameter) return undefined;
      return this.checker.getTypeAtLocation(parameter);
    }
    return this.checker.getTypeOfSymbolAtLocation(prop, location);
  }

  /**
   * Register a schema under a definition key and rewrite the slot as a `$ref`.
   *
   * Inline object types stringify to their whole shape, which makes a useless
   * key, so those fall back to the schema path.
   * @param rawKey - stringified type
   * @param source - the schema to store
   * @param slot - the caller's schema object, emptied and replaced by a `$ref`
   * @param path - schema path, used when the key is unusable
   */
  private registerDefinition(rawKey: string, source: JSONSchema7, slot: JSONSchema7, path: string): void {
    const key = rawKey.startsWith("{") || rawKey.endsWith('">') ? path.substring(1).replace(/\//g, "$") : rawKey;
    this.definitions[key] = { ...source };
    for (const existing of Object.keys(slot)) delete slot[existing];
    slot.$ref = `#/definitions/${encodeURIComponent(key)}`;
  }

  // ------------------------------------------------------------ dto modes --

  /**
   * The return type of the first of `methodNames` the type declares.
   *
   * The apparent type is consulted first so a generic instantiation carries
   * its type arguments into the signature.
   * @param type - the type to inspect
   * @param methodNames - names to try, in order
   * @param location - resolution context
   * @returns the return type, or undefined when no method matches
   */
  private methodReturnType(type: Type, methodNames: string[], location: Node): Type | undefined {
    const apparent = this.checker.getApparentType(type);
    const parentArguments = apparent.isTypeReference() ? this.checker.getTypeArguments(apparent) : [];

    for (const name of methodNames) {
      const symbol = apparent.getProperty(name) ?? type.getProperty(name);
      if (!symbol) continue;

      const methodType =
        this.checker.getTypeOfPropertyOfType(apparent, name) ??
        this.checker.getTypeOfSymbolAtLocation(symbol, location);
      const signatures = this.checker.getSignaturesOfType(methodType, SignatureKind.Call);
      if (signatures.length === 0) continue;

      const returned = this.checker.getReturnTypeOfSignature(signatures[0]);
      // Depending on traversal order the method type can keep the parent's
      // own type parameter (`BinaryFileInfo<T>`) rather than the substituted
      // argument. There is no usable return type then, so fall back to the
      // parent's structural shape instead of emitting a schema for `T`.
      if (parentArguments.length > 0 && this.mentionsTypeParameter(returned)) return undefined;
      return returned;
    }
    return undefined;
  }

  /**
   * Whether a type still contains an unsubstituted type parameter.
   * @param type - the type to inspect
   * @param seen - types already visited, guarding cycles
   * @returns true when a type parameter is reachable
   */
  private mentionsTypeParameter(type: Type, seen = new Set<number>()): boolean {
    if (seen.has(type.id)) return false;
    seen.add(type.id);
    if (type.flags & TypeFlags.TypeParameter) return true;
    if (type.isTypeReference()) {
      if (this.checker.getTypeArguments(type).some(argument => this.mentionsTypeParameter(argument, seen))) return true;
    }
    if (type.flags & (TypeFlags.Union | TypeFlags.Intersection)) {
      return (type as UnionOrIntersectionType).getTypes().some(member => this.mentionsTypeParameter(member, seen));
    }
    return false;
  }

  /**
   * The value a class accepts through `fromDto`, for the Input schema.
   *
   * Static and instance declarations both count, because `fromDto` is
   * normally static. A first parameter of `never` is the explicit way to say
   * "this attribute is never supplied".
   * @param type - the type to inspect
   * @param location - resolution context
   * @returns the accepted type, `"skip"`, or undefined when absent
   */
  private resolveFromDto(type: Type, location: Node): Type | "skip" | undefined {
    for (const name of ["fromDTO", "fromDto"]) {
      let symbol = type.getProperty(name);
      if (!symbol) {
        const classSymbol = type.getSymbol();
        const declaration = this.declarationOf(classSymbol);
        if (classSymbol && declaration) {
          symbol = this.checker.getTypeOfSymbolAtLocation(classSymbol, declaration).getProperty(name);
        }
      }
      if (!symbol) continue;

      const methodType = this.checker.getTypeOfSymbolAtLocation(symbol, location);
      const signatures = this.checker.getSignaturesOfType(methodType, SignatureKind.Call);
      if (signatures.length === 0) continue;

      const parameters = signatures[0].getParameters();
      if (parameters.length === 0) continue;
      const parameterDeclaration = this.declarationOf(parameters[0]);
      const parameterType = parameterDeclaration
        ? this.checker.getTypeAtLocation(parameterDeclaration)
        : this.checker.getParameterType(signatures[0], 0);

      return parameterType.flags & TypeFlags.Never ? "skip" : parameterType;
    }
    return undefined;
  }

  /**
   * Whether a class is tagged `@readOnly`, opting its attributes out of Input.
   * @param type - the type to inspect
   * @returns true when the tag is present
   */
  private hasReadOnlyTag(type: Type): boolean {
    for (const symbol of [type.getSymbol(), type.getAliasSymbol()]) {
      if (!symbol) continue;
      if (symbol.getJsDocTags(this.checker).some(tag => tag.name === "readOnly")) return true;
    }
    return false;
  }

  /**
   * Reduce an intersection to the constituent that carries the data.
   *
   * `string & { __brand: x }` is a string, and `T & { toString(): string }`
   * is `T` — an `allOf` of the parts would be technically true and useless.
   * @param type - the type to simplify
   * @returns the simplified type, or the original
   */
  private simplifyIntersection(type: Type): Type {
    if (!type.isIntersectionType()) return type;
    const members = type.getTypes();

    const primitives =
      TypeFlags.String |
      TypeFlags.Number |
      TypeFlags.Boolean |
      TypeFlags.StringLiteral |
      TypeFlags.NumberLiteral |
      TypeFlags.BooleanLiteral;
    const primitive = members.find(member => member.flags & primitives);
    if (primitive) return primitive;

    const withData = members.filter(member =>
      this.checker.getPropertiesOfType(member).some(property => {
        const declaration = this.declarationOf(property);
        return !declaration || !isMethodLike(declaration);
      })
    );
    return withData.length === 1 ? withData[0] : type;
  }

  // --------------------------------------------------------------- unions --

  /**
   * Union constituents in the order `webda.module.json` records them.
   *
   * `UnionType.getTypes()` returns them alphabetically, so without this every
   * `enum` and every `type: [..]` in the corpus is reordered.
   *
   * TypeScript 6 exposed a union's constituents sorted by type id, and ids
   * are issued as types are created. That has two regimes, and reproducing
   * both is what makes this correct rather than lucky:
   *
   * - **Primitives** are interned when the checker starts, in a fixed order,
   *   so they always sort ahead of everything else and among themselves by
   *   that order. `number | string` is recorded as `["string", "number"]`.
   * - **Literals** are interned on first use, so their ids follow the source.
   *
   * Sorting on 7.1's ids reproduces neither reliably: they are assigned as
   * the session happens to query, so `"SUCCESS" | "ERROR"` came back reversed
   * whenever something earlier in the batch had already interned `"ERROR"` —
   * the score depended on which requests shared a worker. Primitives are
   * ranked from the table instead, and literals from the syntax.
   * @param type - the union type
   * @param node - the declaration the union was reached through
   * @returns the constituents, in the recorded order
   */
  private unionOrder(type: UnionOrIntersectionType, node: Node | undefined): readonly Type[] {
    const members = [...type.getTypes()];
    const declared = this.declaredUnionOrder(type, node);
    const idRank = new Map(
      [...members].sort((left, right) => left.id - right.id).map((member, index) => [member.id, index])
    );

    const rankOf = (member: Type): number => {
      const primitive = primitiveRank(member);
      if (primitive !== undefined) return primitive;
      const position = declared?.indexOf(member.id) ?? -1;
      // Anything the syntax does not mention — a synthesised constituent with
      // no declaration order to recover — falls back to id order, after
      // everything it does mention.
      return PRIMITIVE_RANKS + (position >= 0 ? position : PRIMITIVE_RANKS + idRank.get(member.id)!);
    };

    return members
      .map((member, index) => ({ member, index }))
      .sort((left, right) => rankOf(left.member) - rankOf(right.member) || left.index - right.index)
      .map(entry => entry.member);
  }

  /**
   * Type ids of a union's constituents, in the order the syntax lists them.
   * @param type - the union type
   * @param node - the declaration the union was reached through
   * @returns the ids, or undefined when there is no syntax to read
   */
  private declaredUnionOrder(type: UnionOrIntersectionType, node: Node | undefined): number[] | undefined {
    const enumDeclaration = this.declarationOf(type.getSymbol());
    if (enumDeclaration && is.isEnumDeclaration(enumDeclaration)) {
      return enumDeclaration.members.map(member => this.checker.getTypeAtLocation(member).id);
    }

    const typeNode = this.unionTypeNode(type, node);
    if (!typeNode) return undefined;

    const ids: number[] = [];
    const collect = (union: { types: readonly Node[] }): void => {
      for (const member of union.types) {
        const resolved = this.checker.getTypeFromTypeNode(member as never);
        // A member may itself be a union — TypeScript flattens those, so the
        // nested constituents have to be expanded to line up with `getTypes`.
        if (resolved.isUnionType()) {
          for (const nested of this.unionOrder(resolved, undefined)) ids.push(nested.id);
        } else {
          ids.push(resolved.id);
        }
      }
    };
    collect(typeNode);
    return ids;
  }

  /**
   * The `UnionTypeNode` a union type was written as, if there is one.
   * @param type - the union type
   * @param node - the declaration the union was reached through
   * @returns the syntax node
   */
  private unionTypeNode(type: UnionOrIntersectionType, node: Node | undefined): { types: readonly Node[] } | undefined {
    const aliasDeclaration = this.declarationOf(type.getAliasSymbol());
    if (aliasDeclaration && is.isTypeAliasDeclaration(aliasDeclaration) && is.isUnionTypeNode(aliasDeclaration.type)) {
      return aliasDeclaration.type;
    }
    const declared = node && (node as { type?: Node }).type;
    if (declared && is.isUnionTypeNode(declared)) return declared;
    return undefined;
  }

  /**
   * Convert a union into `anyOf`, then simplify.
   *
   * The simplifications are what turn most unions in the corpus into the
   * `enum` and `type: [..]` forms that appear in `webda.module.json`, so they
   * are part of the output contract rather than cosmetic.
   * @param type - the union type
   * @param definition - schema to populate
   * @param path - schema path
   * @param node - the declaration the union was reached through
   * @param depth - recursion depth
   * @returns keep, and whether `undefined` was a member
   */
  private union(
    type: UnionOrIntersectionType,
    definition: JSONSchema7,
    path: string,
    node: Node | undefined,
    depth: number
  ): PropertyOutcome {
    const branches: JSONSchema7[] = [];
    let optional = false;

    const unionDeclaration = this.declarationOf(type.getSymbol());
    const isEnum = unionDeclaration ? is.isEnumDeclaration(unionDeclaration) : false;
    // -1 before the first member, -2 once a non-numeric member breaks the run.
    let lastValue = -1;

    let index = 0;
    for (const member of this.unionOrder(type, node)) {
      index++;
      if (member.flags & TypeFlags.Undefined) {
        optional = true;
        continue;
      }

      const branch: JSONSchema7 = {};
      const memberDeclaration = this.declarationOf(member.getSymbol()) ?? this.targetNode;
      const outcome = this.property(member, branch, `${path}#${index}`, memberDeclaration, depth + 1);
      if (outcome.decision === "skip") continue;

      const initializer = memberDeclaration ? initializerOf(memberDeclaration) : undefined;
      if (initializer) {
        const constant = this.checker.getConstantValue(memberDeclaration!);
        if (constant !== undefined) {
          branch.const = constant;
          if (isEnum) lastValue = typeof constant === "number" ? constant : -2;
        } else {
          if (isEnum) lastValue = -2;
          const literal = literalOf(initializer);
          if (literal) {
            branch.const = literal.const;
            branch.type = literal.type;
          }
        }
      } else if (isEnum && lastValue !== -2) {
        // Implicit enum members continue the numeric run.
        lastValue += 1;
        branch.const = lastValue;
      }

      branches.push(branch);
    }

    definition.anyOf = dedupe(branches);
    for (const branch of definition.anyOf) {
      if (branch.type === "null") branch.const = null;
    }
    this.simplifyUnion(definition);
    return { optional, decision: "keep" };
  }

  /**
   * Collapse an `anyOf` into the narrowest equivalent form.
   * @param definition - schema carrying `anyOf`, mutated in place
   */
  private simplifyUnion(definition: JSONSchema7): void {
    let branches = definition.anyOf!;

    if (branches.length === 0) {
      delete definition.anyOf;
      return;
    }
    if (branches.length === 1) {
      delete definition.anyOf;
      Object.assign(definition, branches[0]);
      return;
    }
    // All constants: an `enum` says the same thing and is what consumers read.
    if (branches.every(branch => branch.const !== undefined)) {
      delete definition.anyOf;
      definition.enum = Array.from(new Set(branches.map(branch => branch.const)));
      const types = [...new Set(branches.map(branch => branch.type))];
      definition.type = (types.length === 1 ? types[0] : types) as string | string[];
      // `true | false` is just `boolean`; the enum adds nothing.
      if (definition.enum.length === 2 && definition.type === "boolean") delete definition.enum;
      return;
    }
    if (branches.every(isBareType)) {
      delete definition.anyOf;
      definition.type = branches.map(branch => branch.type) as string[];
      return;
    }
    // `true | false` reached here alongside other branches.
    const hasTrue = branches.some(branch => branch.type === "boolean" && branch.const === true);
    const hasFalse = branches.some(branch => branch.type === "boolean" && branch.const === false);
    if (hasTrue && hasFalse) {
      branches = branches.filter(branch => branch.type !== "boolean");
      if (branches.length === 0) {
        delete definition.anyOf;
        definition.type = "boolean";
        return;
      }
      branches.push({ type: "boolean" });
      definition.anyOf = branches;
    }
    if (definition.anyOf!.every(isBareType)) {
      definition.type = definition.anyOf!.map(branch => branch.type) as string[];
      delete definition.anyOf;
    }
  }

  // -------------------------------------------------------- intersections --

  /**
   * Convert an intersection by merging object constituents.
   *
   * A merge is only sound when every constituent is an object; anything else
   * falls back to `allOf`, which states the constraint without pretending to
   * flatten it.
   * @param type - the intersection type
   * @param definition - schema to populate
   * @param path - schema path
   * @param depth - recursion depth
   * @returns keep
   */
  private intersection(
    type: UnionOrIntersectionType,
    definition: JSONSchema7,
    path: string,
    depth: number
  ): PropertyOutcome {
    const properties: Record<string, JSONSchema7> = {};
    const required = new Set<string>();
    const parts: JSONSchema7[] = [];
    let closed = true;
    let mergeable = true;

    let index = 0;
    for (const member of type.getTypes()) {
      index++;
      const partPath = `${path}&${index}`;
      const part: JSONSchema7 = {};

      if (member.isClassOrInterface() || this.checker.getPropertiesOfType(member).length > 0) {
        Object.assign(part, this.objectShape(member, partPath));
        if (part.additionalProperties !== false) closed = false;
      } else {
        const memberNode = this.declarationOf(member.getSymbol()) ?? this.targetNode;
        if (this.property(member, part, partPath, memberNode, depth + 1).decision === "skip") continue;
        mergeable = false;
      }
      parts.push(part);

      if (part.type === "object" && part.properties) {
        for (const [name, schema] of Object.entries(part.properties)) properties[name] ??= schema;
        for (const name of part.required ?? []) required.add(name);
        if (part.additionalProperties !== false) closed = false;
      } else {
        mergeable = false;
      }
    }

    if (mergeable) {
      definition.type = "object";
      definition.properties = properties;
      if (required.size > 0) definition.required = [...required].sort();
      definition.additionalProperties = closed ? false : undefined;
    } else {
      definition.allOf = parts;
    }
    return KEEP;
  }

  // --------------------------------------------------------------- arrays --

  /**
   * Convert an array or tuple type.
   * @param type - the array-like type
   * @param definition - schema to populate
   * @param path - schema path
   * @param depth - recursion depth
   * @returns keep
   */
  private array(type: Type, definition: JSONSchema7, path: string, depth: number): PropertyOutcome {
    definition.type = "array";
    if (this.checker.isTupleType(type)) return this.tuple(type as TupleTypeReference, definition, path, depth);

    const element = this.elementType(type);
    if (!element) {
      throw new SchemaConversionError(
        "array element type could not be resolved",
        path,
        this.checker.typeToString(type)
      );
    }
    const items: JSONSchema7 = {};
    definition.items = items;
    const elementNode = this.declarationOf(element.getSymbol()) ?? this.targetNode;
    if (this.property(element, items, `${path}[]`, elementNode, depth + 1).decision === "skip") {
      delete definition.items;
    }
    return KEEP;
  }

  /**
   * Convert a tuple into positional or homogeneous `items`.
   * @param type - the tuple reference
   * @param definition - schema to populate
   * @param path - schema path
   * @param depth - recursion depth
   * @returns keep
   */
  private tuple(type: TupleTypeReference, definition: JSONSchema7, path: string, depth: number): PropertyOutcome {
    const target = type.getTarget();
    const elementFlags = target.elementFlags;
    // ElementFlags.Rest === 1 << 2.
    const openEnded = elementFlags.length > 0 && (elementFlags[elementFlags.length - 1] & 4) !== 0;

    const elements = this.checker.getTypeArguments(type);
    const items: JSONSchema7[] = [];
    definition.minItems = elements.length;

    elements.forEach((element, index) => {
      const item: JSONSchema7 = {};
      const elementNode = this.declarationOf(element.getSymbol()) ?? this.targetNode;
      if (this.property(element, item, `${path}[${index}]`, elementNode, depth + 1).decision === "skip") {
        definition.minItems!--;
        return;
      }
      // ElementFlags.Optional === 1 << 1.
      if ((elementFlags[index] & 2) !== 0) definition.minItems!--;
      items.push(item);
    });

    definition.items = isHomogeneous(items) ? items[0] : items;
    if (openEnded) definition.minItems!--;
    else definition.maxItems = elements.length;

    if (target.readonly) {
      // A readonly tuple of literals is a single constant value.
      const constants = items.map(item => item.const).filter(value => value !== undefined);
      if (constants.length === items.length) definition.const = constants;
      delete definition.items;
      delete definition.minItems;
      delete definition.maxItems;
    }
    return KEEP;
  }

  /**
   * Whether the type should be represented as a JSON array.
   *
   * Mapped types are excluded explicitly: the checker synthesises a numeric
   * index signature for some of them, which would otherwise read as an array.
   * @param type - the type to test
   * @returns true when array-like
   */
  private isArrayLike(type: Type): boolean {
    if (objectFlagsOf(type) & ObjectFlags.Mapped) return false;
    if (this.checker.isArrayLikeType(type)) return true;
    if (this.checker.getIndexTypeOfType(type, IndexKind.Number)) return true;
    return false;
  }

  /**
   * The element type of an array-like type.
   * @param type - the array-like type
   * @returns the element type, or undefined when it cannot be resolved
   */
  private elementType(type: Type): Type | undefined {
    const byIndex = this.checker.getIndexTypeOfType(type, IndexKind.Number);
    if (byIndex) return byIndex;
    if (type.isTypeReference()) {
      const args = this.checker.getTypeArguments(type as TypeReference);
      if (args.length > 0) return args[0];
    }
    return undefined;
  }

  // -------------------------------------------------------------- buffers --

  /**
   * Whether the type is a binary buffer.
   * @param type - the type to test
   * @param typeName - its stringified form
   * @returns true for `Buffer`, `ArrayBuffer` or a `Buffer`-flavoured `Uint8Array`
   */
  private isBuffer(type: Type, typeName: string): boolean {
    const name = type.getSymbol()?.name;
    if (!name) return false;
    if (name === "Buffer" || typeName === "Buffer") return true;
    if (name === "ArrayBuffer" || typeName === "ArrayBuffer") return true;
    return name === "Uint8Array" && /Buffer/.test(typeName);
  }

  /**
   * Write the configured buffer representation.
   * @param definition - schema to populate
   */
  private applyBuffer(definition: JSONSchema7): void {
    switch (this.bufferStrategy) {
      case "array":
        definition.type = "array";
        definition.items = { type: "integer", minimum: 0, maximum: 255 };
        return;
      case "binary":
        definition.type = "string";
        definition.format = "binary";
        definition.contentMediaType = "application/octet-stream";
        return;
      case "hex":
        definition.type = "string";
        definition.contentEncoding = "hex";
        definition.pattern = "^[0-9a-fA-F]+$";
        definition.contentMediaType = "application/octet-stream";
        return;
      case "base64":
        definition.type = "string";
        definition.contentEncoding = "base64";
        definition.contentMediaType = "application/octet-stream";
        return;
    }
  }

  // --------------------------------------------------------------- shared --

  /**
   * Whether the current mode describes values being supplied.
   * @returns true for `input` and `dto-in`
   */
  private isInputMode(): boolean {
    return this.mode === "input" || this.mode === "dto-in";
  }

  /**
   * Resolve a symbol's primary declaration node.
   *
   * `Symbol.declarations` are handles, not nodes; reaching the AST needs an
   * explicit `resolve` against the project.
   * @param symbol - the symbol
   * @returns the declaration, when it has one
   */
  private declarationOf(symbol: TsSymbol | undefined): Node | undefined {
    if (!symbol) return undefined;
    return symbol.valueDeclaration?.resolve(this.project) ?? symbol.declarations[0]?.resolve(this.project);
  }

  /**
   * Whether a property is keyed by an ES symbol.
   *
   * Symbol-keyed slots are how Webda stores model internals
   * (`[WEBDA_STORAGE]`, `[WEBDA_EVENTS]`), and none of them are JSON.
   * @param prop - the property symbol
   * @param declaration - its declaration
   * @returns true when the key is an ES symbol
   */
  private isSymbolKeyed(prop: TsSymbol, declaration: Node | undefined): boolean {
    if (declaration && hasName(declaration)) {
      const name = declaration.name;
      if (name && is.isComputedPropertyName(name)) {
        const keyFlags = this.checker.getTypeAtLocation(name.expression).flags;
        if (keyFlags & (TypeFlags.ESSymbol | TypeFlags.UniqueESSymbol)) return true;
      }
    }
    return String(prop.escapedName).startsWith("__@");
  }

  /**
   * The initializer expression governing a type, if any.
   * @param type - the type
   * @param node - the declaration it was read from
   * @returns the initializer expression
   */
  private initializerFor(type: Type, node: Node | undefined): Expression | undefined {
    if (node) return initializerOf(node);
    return initializerOf(this.declarationOf(type.getSymbol()));
  }

  /**
   * The name under which a declaration's schema is registered.
   * @param node - the node being converted
   * @returns the declared name, or undefined for type nodes
   */
  private declaredName(node: Node): string | undefined {
    if (is.isClassDeclaration(node) || is.isInterfaceDeclaration(node) || is.isTypeAliasDeclaration(node)) {
      return node.name?.text;
    }
    return undefined;
  }
}

// ------------------------------------------------------------- free helpers --

/**
 * Join a schema path segment.
 * @param base - the parent path
 * @param segment - the child segment
 * @returns the joined path
 */
function joinPath(base: string, segment: string): string {
  if (!base || base === "/") return `/${segment}`;
  return `${base.replace(/\/+$/, "")}/${segment.replace(/^\/+/, "")}`;
}

/**
 * Whether an object type is anonymous rather than declared.
 * @param type - the type to test
 * @returns true for anonymous object types
 */
function isAnonymous(type: Type): boolean {
  return (objectFlagsOf(type) & ObjectFlags.Anonymous) !== 0;
}

/**
 * A type's object flags, or zero when it is not an object type.
 * @param type - the type
 * @returns the object flags
 */
function objectFlagsOf(type: Type): ObjectFlags {
  return type.isObjectType() ? type.objectFlags : 0;
}

/** Ranks reserved for primitives; anything else sorts after them. */
const PRIMITIVE_RANKS = 100;

/**
 * Where a primitive sits in the checker's intrinsic-type creation order.
 *
 * Taken from `initializeTypeChecker`, which interns these before any user
 * type, so in TypeScript 6 they always carried the lowest ids and therefore
 * came first in a union. Boolean literals are ranked by value because 7.1
 * leaves `intrinsicName` empty on them.
 * @param type - the constituent to rank
 * @returns its rank, or undefined when it is not a primitive
 */
function primitiveRank(type: Type): number | undefined {
  const flags = type.flags;
  if (flags & TypeFlags.Any) return 0;
  if (flags & TypeFlags.Unknown) return 1;
  if (flags & TypeFlags.Undefined) return 2;
  if (flags & TypeFlags.Null) return 3;
  if (flags & TypeFlags.StringLiteral) return undefined;
  if (flags & TypeFlags.String) return 4;
  if (flags & TypeFlags.NumberLiteral) return undefined;
  if (flags & TypeFlags.Number) return 5;
  if (flags & TypeFlags.BigIntLiteral) return undefined;
  if (flags & TypeFlags.BigInt) return 6;
  if (flags & TypeFlags.BooleanLiteral) return (type as LiteralType).value === true ? 8 : 7;
  if (flags & TypeFlags.Boolean) return 9;
  if (flags & TypeFlags.ESSymbol) return 10;
  if (flags & TypeFlags.Void) return 11;
  if (flags & TypeFlags.Never) return 12;
  if (flags & TypeFlags.NonPrimitive) return 13;
  return undefined;
}

/**
 * Whether a schema says nothing but `type`.
 * @param schema - the schema to test
 * @returns true when `type` is its only keyword
 */
function isBareType(schema: JSONSchema7): boolean {
  return Object.keys(schema).length === 1 && schema.type !== undefined;
}

/**
 * Drop structurally identical branches from a union.
 * @param branches - the branch schemas
 * @returns the branches, deduplicated, in first-seen order
 */
function dedupe(branches: JSONSchema7[]): JSONSchema7[] {
  const seen = new Set<string>();
  const unique: JSONSchema7[] = [];
  for (const branch of branches) {
    const key = JSON.stringify(branch);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(branch);
  }
  return unique;
}

/** Keywords compared when deciding whether tuple elements share a shape. */
const SHAPE_KEYWORDS = ["type", "const", "enum", "format", "pattern", "minimum", "maximum", "minLength", "maxLength"];

/**
 * Whether every tuple element has the same constraining keywords.
 * @param items - the element schemas
 * @returns true when a single `items` schema is equivalent
 */
function isHomogeneous(items: JSONSchema7[]): boolean {
  if (items.length === 0) return false;
  const first = items[0];
  const count = (schema: JSONSchema7) => Object.keys(schema).filter(key => SHAPE_KEYWORDS.includes(key)).length;
  return items.every(
    item =>
      SHAPE_KEYWORDS.every(key => JSON.stringify(first[key]) === JSON.stringify(item[key])) &&
      count(item) === count(first)
  );
}

/**
 * Read a declaration's initializer.
 * @param node - the declaration
 * @returns the initializer expression, when present
 */
function initializerOf(node: Node | undefined): Expression | undefined {
  if (!node) return undefined;
  if (
    is.isPropertyDeclaration(node) ||
    is.isPropertySignatureDeclaration(node) ||
    is.isPropertyAssignment(node) ||
    is.isParameterDeclaration(node) ||
    is.isVariableDeclaration(node) ||
    is.isEnumMember(node)
  ) {
    return node.initializer ?? undefined;
  }
  return undefined;
}

/**
 * Extract a non-numeric literal value from an initializer.
 *
 * Numbers are deliberately excluded: `@webda/schema` treats them as values
 * rather than schema defaults, and enum numbering is handled separately.
 * @param expression - the initializer
 * @returns the JSON Schema type and constant, or undefined
 */
function literalOf(expression: Expression | undefined): { type: string; const: boolean | null | string } | undefined {
  if (!expression) return undefined;
  const inner = is.skipOuterExpressions(expression);
  switch (inner.kind) {
    case SyntaxKind.TrueKeyword:
      return { type: "boolean", const: true };
    case SyntaxKind.FalseKeyword:
      return { type: "boolean", const: false };
    case SyntaxKind.NullKeyword:
      return { type: "null", const: null };
    case SyntaxKind.StringLiteral:
      return { type: "string", const: (inner as unknown as { text: string }).text };
    default:
      return undefined;
  }
}

/**
 * Whether a declaration is a method rather than a data property.
 * @param node - the declaration
 * @returns true for methods and function-typed members
 */
function isMethodLike(node: Node): boolean {
  return is.isMethodDeclaration(node) || is.isMethodSignatureDeclaration(node) || is.isFunctionTypeNode(node);
}

/**
 * Whether a member declaration carries a `?` token.
 * @param node - the declaration
 * @returns true when optional
 */
function hasQuestionToken(node: Node | undefined): boolean {
  if (!node) return false;
  const postfix = (node as { postfixToken?: { kind: SyntaxKind } }).postfixToken;
  if (postfix) return postfix.kind === SyntaxKind.QuestionToken;
  return (node as { questionToken?: unknown }).questionToken !== undefined;
}

/**
 * Whether a node has a declaration name.
 * @param node - the node
 * @returns true when it exposes a `name`
 */
function hasName(node: Node): node is Node & { name?: Node & { expression?: Node } } {
  return "name" in node;
}

/**
 * A declaration's modifier flags, or zero when it has none.
 * @param node - the declaration
 * @returns the modifier flags
 */
function modifierFlagsOf(node: Node): ModifierFlags {
  return (node as { modifierFlags?: ModifierFlags }).modifierFlags ?? 0;
}

/**
 * Recursively sort object keys.
 *
 * The committed `webda.module.json` is key-sorted, so a stable order is part
 * of byte-identical output rather than a nicety.
 * @param value - any JSON value
 * @returns a deep copy with sorted keys
 */
function sortKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(sortKeys) as unknown as T;
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted as T;
  }
  return value;
}
