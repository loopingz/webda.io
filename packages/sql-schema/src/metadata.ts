import type { DeletePolicy } from "@webda/models";
import type { ForeignKeyAction, RelationKind } from "./plan.js";

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
    /**
     * `onDelete` defaults to `CASCADE`
     */
    parent?: { attribute: string; model?: string; onDelete?: DeletePolicy };
    /**
     * `onDelete` defaults to `NONE`
     */
    links?: { attribute: string; model?: string; type: string; onDelete?: DeletePolicy; ownership?: string }[];
    queries?: { attribute: string; model?: string; targetAttribute?: string }[];
    maps?: { attribute: string; model?: string; [key: string]: unknown }[];
    [key: string]: unknown;
  };
  Reflection?: { [field: string]: { type: string; typeParameters?: string[] } };
  Schemas?: { Stored?: JSONSchemaLike; [key: string]: unknown };
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
  /**
   * Delete policy of the relation, defaulted from its kind
   */
  onDelete?: DeletePolicy;
}

/**
 * `ON DELETE` of the foreign key of a reference column, from the delete policy of its relation
 *
 * `NONE` keeps the `NO ACTION` the references always had: the database still refuses to delete a referenced row.
 * @param policy - the delete policy
 * @returns the SQL action
 */
export function foreignKeyAction(policy: DeletePolicy | undefined): ForeignKeyAction {
  switch (policy) {
    case "CASCADE":
      return "CASCADE";
    case "RESTRICT":
      return "RESTRICT";
    case "SET_NULL":
      return "SET NULL";
    default:
      return "NO ACTION";
  }
}

/**
 * `ON DELETE` of the target foreign key of a junction table, from the delete policy of its link array relation
 *
 * A row of the junction is an item of the array: `SET_NULL` removes it with the target (`CASCADE`). Deleting the
 * owners of a `CASCADE` array is the runtime work of the `RelationIntegrity` service, not of the junction.
 * @param policy - the delete policy
 * @returns the SQL action
 */
export function junctionForeignKeyAction(policy: DeletePolicy | undefined): ForeignKeyAction {
  switch (policy) {
    case "SET_NULL":
      return "CASCADE";
    case "RESTRICT":
      return "RESTRICT";
    default:
      return "NO ACTION";
  }
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
      target: relations.parent.model,
      onDelete: relations.parent.onDelete ?? "CASCADE"
    });
  }
  for (const link of relations.links ?? []) {
    const kind = LINK_TYPES[link.type];
    if (kind) {
      result.set(link.attribute, {
        attribute: link.attribute,
        kind,
        target: link.model,
        ...(meta.Reflection?.[link.attribute]?.type === "OneToOne" ? { unique: true } : {}),
        // A Contains applies its policy to the listed models when the owner is deleted: not a constraint
        ...(link.onDelete && link.ownership !== "CONTAINS" ? { onDelete: link.onDelete } : {})
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
