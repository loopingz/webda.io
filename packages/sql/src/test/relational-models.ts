import type { Application } from "@webda/core";
import { Model, UuidModel, WEBDA_PRIMARY_KEY } from "@webda/models";

/*
 * Fixture models of the relational store tests, registered with hand-written metadata (the module loader is not
 * involved in these specs): a blog (users, posts, comments, tags) with every relation kind, an inheritance pair, a
 * composite key and its reference, a self reference and a cycle.
 */

/**
 * A user: target of links, declares the reverse query
 *
 * @WebdaIgnore
 */
export class RelUser extends UuidModel {
  name?: string;
  email?: string;
}

/**
 * A post: scalars of every type, a JSON field, a link, a simple array, an array with attributes and a map
 *
 * @WebdaIgnore
 */
export class RelPost extends UuidModel {
  title?: string;
  published?: boolean;
  views?: number;
  score?: number;
  order?: number;
  status?: string;
  meta?: any;
  files?: any[];
  _creationDate?: string;
  _lastUpdate?: string;
  day?: string;
  author?: string;
  tags?: string[];
  contributors?: any[];
  reviewers?: Record<string, any>;
}

/**
 * A comment: parent link to its post, link to a model of another store (the `Registry`)
 *
 * @WebdaIgnore
 */
export class RelComment extends UuidModel {
  body?: string;
  post?: string;
  moderator?: string;
}

/**
 * A tag
 *
 * @WebdaIgnore
 */
export class RelTag extends UuidModel {
  label?: string;
}

/**
 * Root of the inheritance pair
 *
 * @WebdaIgnore
 */
export class RelAnimal extends UuidModel {
  kind?: string;
}

/**
 * Subclass sharing the table of {@link RelAnimal}
 *
 * @WebdaIgnore
 */
export class RelDog extends RelAnimal {
  bark?: boolean;
}

/**
 * A composite primary key
 *
 * @WebdaIgnore
 */
export class RelPair extends Model {
  [WEBDA_PRIMARY_KEY] = ["a", "b"] as const;
  a?: string;
  b?: string;
  label?: string;
  tags?: string[];
}

/**
 * A reference to a composite key
 *
 * @WebdaIgnore
 */
export class RelPairRef extends UuidModel {
  pair?: string;
}

/**
 * A self reference
 *
 * @WebdaIgnore
 */
export class RelNode extends UuidModel {
  parentNode?: string;
}

/**
 * Half of a cycle
 *
 * @WebdaIgnore
 */
export class RelCycleA extends UuidModel {
  other?: string;
}

/**
 * Other half of the cycle
 *
 * @WebdaIgnore
 */
export class RelCycleB extends UuidModel {
  other?: string;
}

/**
 * The aggregation conformance dataset: typed scalars, JSON fields (`points` and `mixed` hold several types)
 *
 * @WebdaIgnore
 */
export class RelAggRow extends UuidModel {
  kind?: string;
  team?: any;
  points?: any;
  score?: number;
  label?: string;
  done?: boolean;
  mixed?: any;
  at?: string;
}

/** Identifiers the store lists (subclasses are found through the hierarchy) */
export const RELATIONAL_MODELS = [
  "Rel/User",
  "Rel/Post",
  "Rel/Comment",
  "Rel/Tag",
  "Rel/Animal",
  "Rel/Pair",
  "Rel/PairRef",
  "Rel/Node",
  "Rel/CycleA",
  "Rel/CycleB",
  "Rel/AggRow"
];

/** Every table and junction of the fixtures, for cleanup */
export const RELATIONAL_TABLES = [
  "rel_post_tags",
  "rel_post_contributors",
  "rel_post_reviewers",
  "rel_comment",
  "rel_post",
  "rel_user",
  "rel_tag",
  "rel_animal",
  "rel_pairref",
  "rel_pair_tags",
  "rel_pair",
  "rel_node",
  "rel_cyclea",
  "rel_cycleb",
  "rel_aggrow"
];

const string = { type: "string" };

/**
 * Model metadata as compiled in webda.module.json
 * @param identifier - the model identifier
 * @param properties - the stored properties
 * @param options - keys, relations and hierarchy
 * @param options.required - the required properties (`["uuid"]` by default)
 * @param options.primaryKey - the primary key fields (`["uuid"]` by default)
 * @param options.separator - the separator of a composite key
 * @param options.relations - the compiled `Relations`
 * @param options.ancestors - the ancestor identifiers, closest first
 * @param options.subclasses - the subclass classes
 * @returns the metadata
 */
function metadata(
  identifier: string,
  properties: Record<string, any>,
  options: {
    required?: string[];
    primaryKey?: string[];
    separator?: string;
    relations?: Record<string, any>;
    ancestors?: string[];
    subclasses?: any[];
  } = {}
): any {
  return {
    Identifier: identifier,
    Import: "",
    Plural: `${identifier.split("/").pop()}s`,
    Schemas: { Stored: { type: "object", properties, required: options.required ?? ["uuid"] } },
    Relations: options.relations ?? {},
    Ancestors: options.ancestors ?? [],
    Subclasses: options.subclasses ?? [],
    PrimaryKey: options.primaryKey ?? ["uuid"],
    ...(options.separator ? { PrimaryKeySeparator: options.separator } : {}),
    Events: [],
    Reflection: {},
    Actions: {},
    Aliases: []
  };
}

/**
 * The metadata of every fixture model, by identifier
 * @returns the metadata
 */
export function relationalMetadata(): Record<string, any> {
  return {
    "Rel/User": metadata(
      "Rel/User",
      { uuid: string, name: string, email: { type: "string", maxLength: 100 } },
      {
        relations: {
          queries: [{ attribute: "_posts", model: "Rel/Post", targetAttribute: "author" }],
          // `@Unique` on email
          indexes: [{ attribute: "email", unique: true }]
        }
      }
    ),
    "Rel/Post": metadata(
      "Rel/Post",
      {
        uuid: string,
        title: { type: "string", maxLength: 200 },
        published: { type: "boolean" },
        views: { type: "integer" },
        score: { type: "number" },
        order: { type: "integer" },
        status: { type: "string", enum: ["draft", "published"] },
        meta: { type: "object" },
        files: { type: "array", items: { type: "object" } },
        _creationDate: { type: "string", format: "date-time" },
        _lastUpdate: { type: "string", format: "date-time" },
        day: { type: "string", format: "date" },
        author: string,
        tags: { type: "array", items: string },
        contributors: { type: "array", items: { type: "object" } },
        reviewers: { type: "object", additionalProperties: { type: "object" } }
      },
      {
        required: ["uuid", "title"],
        relations: {
          links: [
            { attribute: "author", model: "Rel/User", type: "LINK" },
            { attribute: "tags", model: "Rel/Tag", type: "LINKS_SIMPLE_ARRAY" },
            { attribute: "contributors", model: "Rel/User", type: "LINKS_ARRAY" },
            { attribute: "reviewers", model: "Rel/User", type: "LINKS_MAP" }
          ],
          // `@Index byAuthorDay` on author and day
          indexes: [
            { attribute: "author", name: "byAuthorDay" },
            { attribute: "day", name: "byAuthorDay" }
          ]
        }
      }
    ),
    "Rel/Comment": metadata(
      "Rel/Comment",
      { uuid: string, body: string, post: string, moderator: string },
      {
        relations: {
          parent: { attribute: "post", model: "Rel/Post" },
          links: [{ attribute: "moderator", model: "Webda/OwnerModel", type: "LINK" }]
        }
      }
    ),
    "Rel/Tag": metadata("Rel/Tag", { uuid: string, label: string }),
    "Rel/Animal": metadata("Rel/Animal", { uuid: string, kind: string }, { subclasses: [RelDog] }),
    "Rel/Dog": metadata(
      "Rel/Dog",
      { uuid: string, kind: string, bark: { type: "boolean" } },
      { ancestors: ["Rel/Animal"] }
    ),
    "Rel/Pair": metadata(
      "Rel/Pair",
      { a: string, b: string, label: string, tags: { type: "array", items: string } },
      {
        required: ["a", "b"],
        primaryKey: ["a", "b"],
        separator: "_",
        relations: { links: [{ attribute: "tags", model: "Rel/Tag", type: "LINKS_SIMPLE_ARRAY" }] }
      }
    ),
    "Rel/PairRef": metadata(
      "Rel/PairRef",
      { uuid: string, pair: string },
      { relations: { links: [{ attribute: "pair", model: "Rel/Pair", type: "LINK" }] } }
    ),
    "Rel/Node": metadata(
      "Rel/Node",
      { uuid: string, parentNode: string },
      { relations: { links: [{ attribute: "parentNode", model: "Rel/Node", type: "LINK" }] } }
    ),
    "Rel/CycleA": metadata(
      "Rel/CycleA",
      { uuid: string, other: string },
      { relations: { links: [{ attribute: "other", model: "Rel/CycleB", type: "LINK" }] } }
    ),
    "Rel/CycleB": metadata(
      "Rel/CycleB",
      { uuid: string, other: string },
      { relations: { links: [{ attribute: "other", model: "Rel/CycleA", type: "LINK" }] } }
    ),
    "Rel/AggRow": metadata("Rel/AggRow", {
      uuid: string,
      kind: string,
      team: { type: "object" },
      points: {},
      score: { type: "number" },
      label: string,
      done: { type: "boolean" },
      mixed: {},
      at: { type: "string", format: "date-time" }
    })
  };
}

const CLASSES: Record<string, any> = {
  "Rel/User": RelUser,
  "Rel/Post": RelPost,
  "Rel/Comment": RelComment,
  "Rel/Tag": RelTag,
  "Rel/Animal": RelAnimal,
  "Rel/Dog": RelDog,
  "Rel/Pair": RelPair,
  "Rel/PairRef": RelPairRef,
  "Rel/Node": RelNode,
  "Rel/CycleA": RelCycleA,
  "Rel/CycleB": RelCycleB,
  "Rel/AggRow": RelAggRow
};

/**
 * Register the fixture models in the application, once
 * @param app - the test application
 */
export function registerRelationalFixtures(app: Application): void {
  if ((app.getModels()["Rel/Post"] as unknown) === RelPost) {
    return;
  }
  const all = relationalMetadata();
  for (const [identifier, clazz] of Object.entries(CLASSES)) {
    app.addModel(identifier, clazz, all[identifier]);
    clazz.registerSerializer(true, identifier);
  }
}
