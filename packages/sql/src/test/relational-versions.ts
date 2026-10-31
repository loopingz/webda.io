import { relationalMetadata } from "./relational-models.js";

/**
 * A change of the Rel/Post model in a new application version
 */
export interface PostVersionChanges {
  /**
   * Properties added or retyped
   */
  properties?: Record<string, any>;
  /**
   * Links added (`LINK` or `LINKS_ARRAY`), `oneToOne` for a unique link
   */
  links?: { attribute: string; model: string; type: string; oneToOne?: boolean }[];
  /**
   * The required fields
   */
  required?: string[];
  /**
   * Properties and links removed
   */
  without?: string[];
}

/**
 * The fixture metadata of Rel/Post with the changes of a new application version
 * @param changes - the changes
 * @returns the metadata
 */
export function postVersion(changes: PostVersionChanges): any {
  const meta = relationalMetadata()["Rel/Post"];
  const properties = { ...meta.Schemas.Stored.properties, ...(changes.properties ?? {}) };
  for (const name of changes.without ?? []) {
    delete properties[name];
  }
  const links = [
    ...meta.Relations.links.filter((l: any) => !(changes.without ?? []).includes(l.attribute)),
    ...(changes.links ?? []).map(({ attribute, model, type }) => ({ attribute, model, type }))
  ];
  for (const link of changes.links ?? []) {
    properties[link.attribute] =
      link.type === "LINK" ? { type: "string" } : { type: "array", items: { type: "object" } };
  }
  return {
    ...meta,
    Schemas: {
      Stored: { ...meta.Schemas.Stored, properties, required: changes.required ?? meta.Schemas.Stored.required }
    },
    Relations: { ...meta.Relations, links },
    Reflection: Object.fromEntries(
      (changes.links ?? []).filter(l => l.oneToOne).map(l => [l.attribute, { type: "OneToOne" }])
    )
  };
}

/**
 * The second version of the blog: a field, a link and a ManyToMany more on Rel/Post
 */
export const POST_V2: PostVersionChanges = {
  properties: { summary: { type: "string" } },
  links: [
    { attribute: "editor", model: "Rel/User", type: "LINK" },
    { attribute: "categories", model: "Rel/Tag", type: "LINKS_ARRAY" }
  ]
};
