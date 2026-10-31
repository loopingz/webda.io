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
    /**
     * Attributes tagged `@Index` / `@Unique`; those sharing a `name` form one composite index, in declaration order
     */
    indexes?: IndexDeclaration[];
    [key: string]: unknown;
  };
  Reflection?: { [field: string]: { type: string; typeParameters?: string[] } };
  Schemas?: { Stored?: JSONSchemaLike; [key: string]: unknown };
}

/**
 * An index declared on a model attribute (`@Index` / `@Unique` JSDoc tag), as compiled
 */
export interface IndexDeclaration {
  attribute: string;
  /**
   * `@Unique`: a unique index
   */
  unique?: boolean;
  /**
   * Group name (`@Index <name>`): the tagged attributes sharing it form one composite index
   */
  name?: string;
}

/**
 * A relation of a model, as compiled
 */
export interface DeclaredRelation {
  attribute: string;
  kind: RelationKind;
  /**
   * Identifier of the target
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
 * Kind of each `Relations.links[].type`
 */
const LINK_TYPES: { [type: string]: RelationKind } = {
  LINK: "link",
  LINKS_SIMPLE_ARRAY: "linksSimpleArray",
  LINKS_ARRAY: "linksArray",
  LINKS_MAP: "linksMap"
};

/**
 * The relations a model declares, from its compiled `Relations`
 *
 * `Relations` does not tell a `OneToOne` from a `ModelLink`: the written type, in `Reflection`, does.
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
      result.set(link.attribute, {
        attribute: link.attribute,
        kind,
        target: link.model,
        ...(meta.Reflection?.[link.attribute]?.type === "OneToOne" ? { unique: true } : {})
      });
    }
  }
  for (const query of relations.queries ?? []) {
    result.set(query.attribute, {
      attribute: query.attribute,
      kind: "query",
      target: query.model,
      ...(query.targetAttribute ? { targetAttribute: query.targetAttribute } : {})
    });
  }
  for (const map of relations.maps ?? []) {
    result.set(map.attribute, { attribute: map.attribute, kind: "map", target: map.model });
  }
  return result;
}

/**
 * @param meta - a model
 * @returns its class name: the last segment of its identifier
 */
export function shortName(meta: SchemaModelMetadata): string {
  return meta.Identifier.split("/").pop()!;
}
