import type { RelationKind } from "./plan.js";

/**
 * JSON schema subset read by the builder
 */
export interface JSONSchemaLike {
  type?: string | string[];
  format?: string;
  maxLength?: number;
  enum?: unknown[];
  const?: unknown;
  properties?: { [name: string]: JSONSchemaLike };
  additionalProperties?: boolean | JSONSchemaLike;
  required?: string[];
  items?: JSONSchemaLike | JSONSchemaLike[];
  allOf?: JSONSchemaLike[];
  anyOf?: JSONSchemaLike[];
  oneOf?: JSONSchemaLike[];
  $ref?: string;
  [key: string]: unknown;
}

/**
 * Reference to a model in `Ancestors` / `Subclasses`: the identifier in `webda.module.json`, the class once the
 * application loaded it
 */
export type ModelReference = string | { Metadata?: { Identifier?: string } };

/**
 * The model metadata the builder reads: structurally compatible with `ModelMetadata` from `@webda/compiler`, both as
 * compiled in `webda.module.json` and as resolved at runtime
 */
export interface SchemaModelMetadata {
  Identifier: string;
  ShortName?: string;
  PrimaryKey: string[];
  PrimaryKeySeparator?: string;
  /**
   * Ordered from the closest
   */
  Ancestors?: ModelReference[];
  Subclasses?: ModelReference[];
  Relations?: {
    parent?: { attribute: string; model?: string };
    links?: { attribute: string; model?: string; type: string }[];
    queries?: { attribute: string; model?: string; targetAttribute?: string }[];
    maps?: { attribute: string; model?: string; [key: string]: unknown }[];
    [key: string]: unknown;
  };
  Reflection?: { [field: string]: { type: string; typeParameters?: string[] } };
  Schemas?: { Stored?: JSONSchemaLike; [key: string]: unknown };
}

/**
 * A relation of a model, before its target is resolved
 */
export interface DeclaredRelation {
  attribute: string;
  kind: RelationKind;
  /**
   * Identifier or class name of the target, as declared
   */
  target?: string;
  targetAttribute?: string;
  unique?: boolean;
}

/**
 * @param ref - an ancestor or subclass reference
 * @returns its identifier
 */
export function referenceIdentifier(ref: ModelReference): string | undefined {
  return typeof ref === "string" ? ref : ref?.Metadata?.Identifier;
}

/**
 * Relation kind of each type name written in a model: the compiled `Relations` only know the canonical names, the
 * aliases are recognized from `Reflection`
 */
const RELATION_TYPES: { [type: string]: { kind: RelationKind; unique?: boolean } } = {
  ModelParent: { kind: "parent" },
  BelongTo: { kind: "parent" },
  ModelLink: { kind: "link" },
  RelateTo: { kind: "link" },
  ManyToOne: { kind: "link" },
  OneToOne: { kind: "link", unique: true },
  ModelLinksSimpleArray: { kind: "linksSimpleArray" },
  ModelLinksArray: { kind: "linksArray" },
  ManyToMany: { kind: "linksArray" },
  Contains: { kind: "linksArray" },
  ModelLinksMap: { kind: "linksMap" },
  ModelRelated: { kind: "query" },
  OneToMany: { kind: "query" },
  ModelsMapped: { kind: "map" }
};

/**
 * Kind of each `Relations.links[].type`
 */
const LINK_TYPES: { [type: string]: RelationKind } = {
  LINK: "link",
  LINKS_SIMPLE_ARRAY: "linksSimpleArray",
  LINKS_ARRAY: "linksArray",
  LINKS_MAP: "linksMap"
};

/**
 * @param text - a type parameter as reflected, possibly quoted (`"\"students\""`)
 * @returns the text without quotes
 */
function unquote(text: string | undefined): string | undefined {
  return text?.replace(/^["'`]|["'`]$/g, "");
}

/**
 * The relations a model declares: the compiled `Relations`, completed from `Reflection`
 *
 * The compiler only records the canonical relation types (`ModelParent`, `ModelLink`, ...); the aliases (`BelongTo`,
 * `ManyToMany`, ...) only appear in `Reflection`. `Reflection` also gives the right `ModelRelated` attribute (its third
 * type parameter) and the `OneToOne` uniqueness.
 * @param meta - the model metadata
 * @returns the relations, by attribute
 */
export function declaredRelations(meta: SchemaModelMetadata): Map<string, DeclaredRelation> {
  const result = new Map<string, DeclaredRelation>();
  const relations = meta.Relations ?? {};
  if (relations.parent) {
    result.set(relations.parent.attribute, {
      attribute: relations.parent.attribute,
      kind: "parent",
      target: relations.parent.model
    });
  }
  for (const link of relations.links ?? []) {
    const kind = LINK_TYPES[link.type];
    if (kind) {
      result.set(link.attribute, { attribute: link.attribute, kind, target: link.model });
    }
  }
  for (const query of relations.queries ?? []) {
    result.set(query.attribute, {
      attribute: query.attribute,
      kind: "query",
      target: query.model,
      targetAttribute: query.targetAttribute
    });
  }
  for (const map of relations.maps ?? []) {
    result.set(map.attribute, { attribute: map.attribute, kind: "map", target: map.model });
  }
  for (const [attribute, reflected] of Object.entries(meta.Reflection ?? {})) {
    const relationType = RELATION_TYPES[reflected.type];
    if (!relationType) {
      continue;
    }
    const declared = result.get(attribute) ?? { attribute, kind: relationType.kind };
    if (!result.has(attribute)) {
      result.set(attribute, declared);
    }
    declared.target ??= unquote(reflected.typeParameters?.[0]);
    if (relationType.unique) {
      declared.unique = true;
    }
    if (declared.kind === "query" && reflected.typeParameters?.[2]) {
      // The compiled targetAttribute is read from the wrong type parameter
      declared.targetAttribute = unquote(reflected.typeParameters[2]);
    }
  }
  return result;
}

/**
 * Index of models resolving the targets of relations, declared as an identifier or a class name
 */
export class ModelIndex {
  private readonly byIdentifier = new Map<string, SchemaModelMetadata>();
  private readonly byName = new Map<string, SchemaModelMetadata[]>();

  /**
   * @param models - the known models
   */
  constructor(models: Iterable<SchemaModelMetadata>) {
    for (const meta of models) {
      if (this.byIdentifier.has(meta.Identifier)) {
        continue;
      }
      this.byIdentifier.set(meta.Identifier, meta);
      const names = new Set([ModelIndex.shortName(meta)]);
      if (meta.ShortName) {
        names.add(meta.ShortName);
      }
      for (const name of names) {
        this.byName.set(name, [...(this.byName.get(name) ?? []), meta]);
      }
    }
  }

  /**
   * @param meta - a model
   * @returns its class name: the last segment of its identifier
   */
  static shortName(meta: SchemaModelMetadata): string {
    return meta.Identifier.split("/").pop()!;
  }

  /**
   * Resolve a declared target: an identifier, otherwise a class name, preferring the namespace of the declaring model
   * @param name - the declared target
   * @param from - the declaring model
   * @returns the model, `ambiguous` when several models of other namespaces have the name, undefined when unknown
   */
  resolve(name: string, from: SchemaModelMetadata): SchemaModelMetadata | "ambiguous" | undefined {
    const exact = this.byIdentifier.get(name);
    if (exact) {
      return exact;
    }
    const candidates = this.byName.get(name.split("/").pop()!) ?? [];
    if (candidates.length <= 1) {
      return candidates[0];
    }
    const namespace = from.Identifier.split("/")[0];
    const local = candidates.filter(c => c.Identifier.split("/")[0] === namespace);
    return local.length === 1 ? local[0] : "ambiguous";
  }
}
