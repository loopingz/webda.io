import { mapScalar, widestType } from "./columns.js";
import { declaredRelations } from "./metadata.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RelationalSchemaBuilder, SchemaBuildError, buildSchemaPlan } from "./builder.js";
import type { JSONSchemaLike, SchemaModelMetadata } from "./metadata.js";
import type { RelationalSchemaPlan, TablePlan } from "./plan.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Model metadata as compiled in webda.module.json
 * @param Identifier - the model identifier
 * @param properties - the stored properties
 * @param extra - other metadata
 * @returns the metadata
 */
function model(
  Identifier: string,
  properties: { [name: string]: JSONSchemaLike },
  extra: Partial<SchemaModelMetadata> & { required?: string[] } = {}
): SchemaModelMetadata {
  const { required = Object.keys(properties), ...rest } = extra;
  return {
    Identifier,
    PrimaryKey: ["uuid"],
    Ancestors: [],
    Subclasses: [],
    Relations: {},
    Reflection: {},
    Schemas: { Stored: { type: "object", properties, required } },
    ...rest
  };
}

const uuid: JSONSchemaLike = { type: "string" };

type Relations = NonNullable<SchemaModelMetadata["Relations"]>;
type Link = NonNullable<Relations["links"]>[number];

/**
 * A compiled link
 * @param attribute - the attribute
 * @param model - the target identifier
 * @param type - the link type
 * @returns the link
 */
function link(attribute: string, model: string | undefined, type = "LINK"): Link {
  return { attribute, ...(model ? { model } : {}), type };
}

/**
 * @param list - compiled links
 * @returns the Relations holding them
 */
function links(...list: Link[]): { Relations: Relations } {
  return { Relations: { links: list } };
}

/**
 * The User / Post / Comment / Tag sample of #838
 * @returns the models
 */
function blog(): SchemaModelMetadata[] {
  return [
    model("MyApp/User", { uuid, name: { type: "string" }, email: { type: "string" } }),
    model(
      "MyApp/Post",
      {
        uuid,
        title: { type: "string", maxLength: 200 },
        author: { type: "string" },
        _creationDate: { type: "string", format: "date-time" },
        tags: { type: "array", items: { allOf: [{ type: "object" }, { type: "object" }] } }
      },
      links(link("author", "MyApp/User"), link("tags", "MyApp/Tag", "LINKS_ARRAY"))
    ),
    model(
      "MyApp/Comment",
      { uuid, post: { type: "string" }, body: { type: "string" } },
      { Relations: { parent: { attribute: "post", model: "MyApp/Post" } } }
    ),
    model("MyApp/Tag", { uuid, label: { type: "string" } })
  ];
}

/**
 * @param plan - a plan
 * @param name - a table name
 * @returns the table
 */
function table(plan: RelationalSchemaPlan, name: string): TablePlan {
  const result = plan.tables.find(t => t.name === name);
  expect(result, `table ${name} in ${plan.tables.map(t => t.name).join(", ")}`).toBeDefined();
  return result!;
}

/**
 * @param plan - a plan
 * @param name - a table name
 * @returns its columns as `name type [null]`
 */
function columns(plan: RelationalSchemaPlan, name: string): string[] {
  return table(plan, name).columns.map(
    c =>
      `${c.name} ${c.type.kind === "varchar" ? `varchar(${c.type.length})` : c.type.kind}${c.nullable ? " null" : ""}`
  );
}

describe("RelationalSchemaBuilder", () => {
  it("derives the ON DELETE of each foreign key from the relation delete policy", () => {
    const plan = buildSchemaPlan([
      model("MyApp/User", { uuid }),
      model("MyApp/Tag", { uuid }),
      model(
        "MyApp/Comment",
        {
          uuid,
          author: { type: "string" },
          reviewer: { type: "string" },
          editor: { type: "string" },
          plain: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          pinned: { type: "array", items: { type: "string" } }
        },
        {
          required: ["uuid", "author", "plain"],
          Relations: {
            parent: { attribute: "author", model: "MyApp/User", onDelete: "RESTRICT" },
            links: [
              { attribute: "reviewer", model: "MyApp/User", type: "LINK", onDelete: "SET_NULL" },
              { attribute: "editor", model: "MyApp/User", type: "LINK", onDelete: "CASCADE" },
              { attribute: "plain", model: "MyApp/User", type: "LINK" },
              { attribute: "tags", model: "MyApp/Tag", type: "LINKS_SIMPLE_ARRAY", onDelete: "SET_NULL" },
              { attribute: "pinned", model: "MyApp/Tag", type: "LINKS_SIMPLE_ARRAY", onDelete: "RESTRICT" }
            ]
          }
        }
      ),
      model(
        "MyApp/Note",
        { uuid, owner: { type: "string" } },
        { Relations: { parent: { attribute: "owner", model: "MyApp/User", onDelete: "NONE" } } }
      )
    ]);
    const onDelete = (name: string) => plan.foreignKeys.find(f => f.name === name)?.onDelete;
    expect(onDelete("fk_myapp_comment_author")).toBe("RESTRICT");
    expect(onDelete("fk_myapp_comment_reviewer")).toBe("SET NULL");
    expect(onDelete("fk_myapp_comment_editor")).toBe("CASCADE");
    expect(onDelete("fk_myapp_comment_plain")).toBe("NO ACTION");
    expect(onDelete("fk_myapp_note_owner")).toBe("NO ACTION");
    // SET_NULL on a link array removes the item: the junction row goes with the target
    expect(onDelete("fk_myapp_comment_tags_tag")).toBe("CASCADE");
    expect(onDelete("fk_myapp_comment_pinned_tag")).toBe("RESTRICT");
    const relation = (attribute: string) => plan.relations.find(r => r.attribute === attribute);
    expect(relation("reviewer")?.onDelete).toBe("SET NULL");
    expect(relation("tags")?.onDelete).toBe("CASCADE");
  });

  it("maps the #838 blog sample to typed tables, foreign keys and a junction", () => {
    const plan = buildSchemaPlan(blog());
    expect(plan.version).toBe(1);
    expect(plan.options).toEqual({
      columnNaming: "preserve",
      extraColumn: "_extra",
      foreignKeys: true,
      numericAsDecimal: false
    });
    expect(columns(plan, "myapp_post")).toEqual([
      "uuid text",
      "title varchar(200)",
      "author text",
      "_creationDate timestamptz",
      "__type text",
      "_extra json null"
    ]);
    expect(table(plan, "myapp_post").primaryKey).toEqual(["uuid"]);
    expect(columns(plan, "myapp_post_tags")).toEqual([
      "post text",
      "tag text",
      "_position bigint",
      "attributes json null"
    ]);
    expect(table(plan, "myapp_post_tags").primaryKey).toEqual(["post", "tag"]);
    expect(table(plan, "myapp_post_tags").junction).toEqual({
      model: "MyApp/Post",
      attribute: "tags",
      kind: "linksArray"
    });
    expect(plan.foreignKeys).toEqual(
      expect.arrayContaining([
        {
          name: "fk_myapp_comment_post",
          table: "myapp_comment",
          columns: ["post"],
          references: { table: "myapp_post", columns: ["uuid"] },
          onDelete: "CASCADE"
        },
        {
          name: "fk_myapp_post_author",
          table: "myapp_post",
          columns: ["author"],
          references: { table: "myapp_user", columns: ["uuid"] },
          onDelete: "NO ACTION"
        },
        {
          name: "fk_myapp_post_tags_post",
          table: "myapp_post_tags",
          columns: ["post"],
          references: { table: "myapp_post", columns: ["uuid"] },
          onDelete: "CASCADE"
        },
        {
          name: "fk_myapp_post_tags_tag",
          table: "myapp_post_tags",
          columns: ["tag"],
          references: { table: "myapp_tag", columns: ["uuid"] },
          onDelete: "NO ACTION"
        }
      ])
    );
    expect(plan.foreignKeys).toHaveLength(4);
    expect(plan.relations).toEqual(
      expect.arrayContaining([
        {
          model: "MyApp/Post",
          attribute: "author",
          kind: "link",
          target: "MyApp/User",
          foreignKey: "fk_myapp_post_author",
          onDelete: "NO ACTION",
          storage: { kind: "columns", columns: ["author"] }
        },
        {
          model: "MyApp/Post",
          attribute: "tags",
          kind: "linksArray",
          target: "MyApp/Tag",
          foreignKey: "fk_myapp_post_tags_tag",
          onDelete: "NO ACTION",
          storage: { kind: "junction", table: "myapp_post_tags" }
        }
      ])
    );
    expect(plan.indexes.map(i => i.name)).toEqual(
      expect.arrayContaining([
        "idx_myapp_post_author",
        "idx_myapp_comment_post",
        "idx_myapp_post_tags_tag",
        "idx_myapp_post___type"
      ])
    );
    // The junction primary key already indexes its owner column
    expect(plan.indexes.find(i => i.name === "idx_myapp_post_tags_post")).toBeUndefined();
    // Referenced tables first
    const order = plan.tables.map(t => t.name);
    expect(order.indexOf("myapp_user")).toBeLessThan(order.indexOf("myapp_post"));
    expect(order.indexOf("myapp_post")).toBeLessThan(order.indexOf("myapp_comment"));
    expect(order.indexOf("myapp_tag")).toBeLessThan(order.indexOf("myapp_post_tags"));
    expect(plan.models["MyApp/Post"]).toEqual({
      table: "myapp_post",
      columns: ["uuid", "title", "author", "_creationDate", "__type", "_extra"]
    });
    expect(plan.warnings).toEqual([]);
  });

  it("maps scalars from the stored schema and Reflection", () => {
    const plan = buildSchemaPlan(
      [
        model(
          "MyApp/Scalars",
          {
            uuid: { type: "string", format: "uuid" },
            text: { type: "string" },
            short: { type: "string", maxLength: 12 },
            day: { type: "string", format: "date" },
            when: { type: "string", format: "date-time" },
            reflectedDate: { type: "string" },
            count: { type: "integer" },
            ratio: { type: "number" },
            flag: { type: "boolean" },
            meta: { type: "object" },
            list: { type: "array", items: { type: "string" } },
            nullableText: { type: ["string", "null"] },
            mixed: { type: ["string", "number"] },
            optionalUnion: { anyOf: [{ type: "integer" }, { type: "null" }] },
            union: { anyOf: [{ type: "integer" }, { type: "string" }] },
            status: { type: "string", enum: ["draft", "published"] },
            mixedEnum: { type: "string", enum: ["a", 1] },
            untypedEnum: { enum: ["a", "b"] },
            constant: { const: "fixed" },
            binary: { $ref: "#/definitions/Binary" },
            anything: {},
            optional: { type: "string" }
          },
          {
            required: ["uuid", "text", "status", "count"],
            Reflection: { reflectedDate: { type: "Date" } }
          }
        )
      ],
      { numericAsDecimal: false }
    );
    const t = table(plan, "myapp_scalars");
    const byName = Object.fromEntries(t.columns.map(c => [c.name, c]));
    expect(byName.uuid).toMatchObject({ type: { kind: "uuid" }, nullable: false, role: "field" });
    expect(byName.text).toMatchObject({ type: { kind: "text" }, nullable: false });
    expect(byName.short.type).toEqual({ kind: "varchar", length: 12 });
    expect(byName.day.type.kind).toBe("date");
    expect(byName.when.type.kind).toBe("timestamptz");
    expect(byName.reflectedDate.type.kind).toBe("timestamptz");
    expect(byName.count).toMatchObject({ type: { kind: "bigint" }, nullable: false });
    expect(byName.ratio.type.kind).toBe("double");
    expect(byName.flag.type.kind).toBe("boolean");
    expect(byName.meta.type.kind).toBe("json");
    expect(byName.list.type.kind).toBe("json");
    expect(byName.nullableText).toMatchObject({ type: { kind: "text" }, nullable: true });
    expect(byName.mixed.type.kind).toBe("json");
    expect(byName.optionalUnion).toMatchObject({ type: { kind: "bigint" }, nullable: true });
    expect(byName.union.type.kind).toBe("json");
    expect(byName.status).toMatchObject({ type: { kind: "text" }, enum: ["draft", "published"], nullable: false });
    // A text column only checks text values
    expect(byName.mixedEnum.type.kind).toBe("text");
    expect(byName.mixedEnum.enum).toBeUndefined();
    expect(byName.untypedEnum).toMatchObject({ type: { kind: "text" }, enum: ["a", "b"] });
    expect(byName.constant).toMatchObject({ type: { kind: "text" }, enum: ["fixed"] });
    expect(byName.binary.type.kind).toBe("json");
    expect(byName.anything.type.kind).toBe("json");
    expect(byName.optional.nullable).toBe(true);
    expect(plan.warnings).toEqual([]);
    expect(
      buildSchemaPlan([model("MyApp/N", { uuid, ratio: { type: "number" } })], { numericAsDecimal: true }).tables[0]
        .columns[1].type
    ).toEqual({ kind: "decimal" });
  });

  it("maps every compiled relation kind", () => {
    const plan = buildSchemaPlan([
      model("WebdaSample/User", { uuid }),
      model(
        "WebdaSample/Profile",
        {
          uuid,
          owner: { type: "string" },
          friend: { type: "string" },
          buddy: { type: "string" },
          reflected: { type: "string" }
        },
        {
          Relations: {
            parent: { attribute: "owner", model: "WebdaSample/User" },
            links: [link("friend", "WebdaSample/User"), link("buddy", "WebdaSample/User")],
            queries: [{ attribute: "posts", model: "WebdaSample/Post", targetAttribute: "profile" }],
            maps: [{ attribute: "mapped", model: "WebdaSample/Post" }]
          },
          // Relations does not tell a OneToOne from a ModelLink; a relation only in Reflection is not one
          Reflection: {
            friend: { type: "OneToOne", typeParameters: ["User"] },
            buddy: { type: "ManyToOne", typeParameters: ["User"] },
            reflected: { type: "ModelLink", typeParameters: ["User"] }
          },
          required: ["uuid", "owner"]
        }
      ),
      model("WebdaSample/Post", { uuid, profile: { type: "string" } }, links(link("profile", "WebdaSample/Profile")))
    ]);
    const kinds = Object.fromEntries(plan.relations.map(r => [`${r.model}.${r.attribute}`, r]));
    expect(kinds["WebdaSample/Profile.owner"]).toMatchObject({ kind: "parent", onDelete: "CASCADE" });
    expect(kinds["WebdaSample/Profile.friend"]).toMatchObject({ kind: "link", unique: true, onDelete: "NO ACTION" });
    expect(kinds["WebdaSample/Profile.buddy"]).toMatchObject({ kind: "link" });
    expect(kinds["WebdaSample/Profile.buddy"].unique).toBeUndefined();
    expect(kinds["WebdaSample/Profile.reflected"]).toBeUndefined();
    expect(kinds["WebdaSample/Profile.posts"]).toEqual({
      model: "WebdaSample/Profile",
      attribute: "posts",
      kind: "query",
      target: "WebdaSample/Post",
      targetAttribute: "profile",
      storage: { kind: "none" }
    });
    expect(kinds["WebdaSample/Profile.mapped"]).toMatchObject({ kind: "map", storage: { kind: "none" } });
    expect(kinds["WebdaSample/Post.profile"]).toMatchObject({ kind: "link", target: "WebdaSample/Profile" });
    expect(columns(plan, "webdasample_profile")).toEqual([
      "uuid text",
      "owner text",
      "friend text null",
      "buddy text null",
      "reflected text null",
      "__type text",
      "_extra json null"
    ]);
    expect(plan.indexes).toEqual(
      expect.arrayContaining([
        { name: "uq_webdasample_profile_friend", table: "webdasample_profile", columns: ["friend"], unique: true }
      ])
    );
  });

  it("supports composite primary keys and references to them", () => {
    const plan = buildSchemaPlan([
      model("MyApp/Post", { slug: { type: "string", maxLength: 250 } }, { PrimaryKey: ["slug"] }),
      model("MyApp/Tag", { uuid: { type: "string", format: "uuid" } }),
      model(
        "MyApp/PostTag",
        { post: { type: "string" }, tag: { type: "string" }, createdAt: { type: "string", format: "date-time" } },
        {
          PrimaryKey: ["post", "tag"],
          PrimaryKeySeparator: ":",
          Relations: { parent: { attribute: "post", model: "MyApp/Post" }, links: [link("tag", "MyApp/Tag")] }
        }
      ),
      model(
        "MyApp/Like",
        { uuid, postTag: { type: "string" } },
        { ...links(link("postTag", "MyApp/PostTag")), required: ["uuid"] }
      )
    ]);
    // Key columns take the type of the referenced key
    expect(columns(plan, "myapp_posttag")).toEqual([
      "post varchar(250)",
      "tag uuid",
      "createdAt timestamptz",
      "__type text",
      "_extra json null"
    ]);
    expect(table(plan, "myapp_posttag")).toMatchObject({ primaryKey: ["post", "tag"], primaryKeySeparator: ":" });
    // A link to a composite key: one column per key part
    expect(columns(plan, "myapp_like")).toEqual([
      "uuid text",
      "postTag_post varchar(250) null",
      "postTag_tag uuid null",
      "__type text",
      "_extra json null"
    ]);
    expect(table(plan, "myapp_like").columns[1]).toMatchObject({
      field: "postTag",
      keyPart: "post",
      role: "reference"
    });
    expect(plan.relations.find(r => r.attribute === "postTag")).toMatchObject({
      keySeparator: ":",
      storage: { kind: "columns", columns: ["postTag_post", "postTag_tag"] }
    });
    expect(plan.foreignKeys.find(f => f.table === "myapp_like")).toEqual({
      name: "fk_myapp_like_postTag_post_postTag_tag",
      table: "myapp_like",
      columns: ["postTag_post", "postTag_tag"],
      references: { table: "myapp_posttag", columns: ["post", "tag"] },
      onDelete: "NO ACTION"
    });
    // post starts the primary key: no extra index; tag does not
    expect(plan.indexes.map(i => i.name)).not.toContain("idx_myapp_posttag_post");
    expect(plan.indexes.map(i => i.name)).toContain("idx_myapp_posttag_tag");
  });

  it("builds junctions for simple arrays, arrays with attributes and maps", () => {
    const plan = buildSchemaPlan([
      model(
        "MyApp/Student",
        {
          uuid,
          teachers: { type: "array", items: { type: "string" } },
          friends: {
            type: "array",
            items: {
              allOf: [
                { type: "object" },
                {
                  type: "object",
                  properties: { since: { type: "string", format: "date-time" }, note: { type: "string" } },
                  required: ["since"]
                }
              ]
            }
          },
          badges: {
            type: "object",
            additionalProperties: { type: "object", properties: { uuid, level: { type: "integer" } } }
          }
        },
        {
          Relations: {
            links: [
              { attribute: "teachers", model: "MyApp/Teacher", type: "LINKS_SIMPLE_ARRAY" },
              { attribute: "friends", model: "MyApp/Student", type: "LINKS_ARRAY" },
              { attribute: "badges", model: "MyApp/Badge", type: "LINKS_MAP" }
            ]
          }
        }
      ),
      model("MyApp/Teacher", { uuid }),
      model("MyApp/Badge", { uuid })
    ]);
    expect(columns(plan, "myapp_student")).toEqual(["uuid text", "__type text", "_extra json null"]);
    expect(columns(plan, "myapp_student_teachers")).toEqual(["student text", "teacher text", "_position bigint"]);
    // Self reference: the target columns take the attribute name
    expect(columns(plan, "myapp_student_friends")).toEqual([
      "student text",
      "friends text",
      "_position bigint",
      "since timestamptz",
      "note text null"
    ]);
    expect(columns(plan, "myapp_student_badges")).toEqual([
      "student text",
      "badge text",
      "key text",
      "level bigint null"
    ]);
    expect(table(plan, "myapp_student_badges").primaryKey).toEqual(["student", "key"]);
    expect(plan.foreignKeys.filter(f => f.table === "myapp_student_friends").map(f => f.references.table)).toEqual([
      "myapp_student",
      "myapp_student"
    ]);
  });

  it("keeps the subclasses in the table of their root unless tables names one", () => {
    const animal = model(
      "MyApp/Animal",
      { uuid, name: { type: "string" } },
      { Subclasses: ["MyApp/Dog", "MyApp/Bird"] }
    );
    // Runtime metadata: Ancestors / Subclasses resolved to classes
    const dog = model(
      "MyApp/Dog",
      { uuid, name: { type: "string" }, breed: { type: "string" } },
      { Ancestors: [{ Metadata: { Identifier: "MyApp/Animal" } }] }
    );
    const bird = model(
      "MyApp/Bird",
      { uuid, name: { type: "string" }, wings: { type: "integer" } },
      { Ancestors: ["MyApp/Animal", "Webda/Unplanned"] }
    );
    const plan = buildSchemaPlan([dog, bird, animal]);
    expect(plan.tables.map(t => t.name)).toEqual(["myapp_animal"]);
    expect(table(plan, "myapp_animal")).toMatchObject({
      root: "MyApp/Animal",
      models: ["MyApp/Animal", "MyApp/Bird", "MyApp/Dog"]
    });
    // Subclass-only columns are nullable even when the subclass requires them
    expect(columns(plan, "myapp_animal")).toEqual([
      "uuid text",
      "name text",
      "wings bigint null",
      "breed text null",
      "__type text",
      "_extra json null"
    ]);
    expect(plan.models["MyApp/Dog"].columns).toEqual(["uuid", "name", "breed", "__type", "_extra"]);
    expect(plan.models["MyApp/Animal"].columns).toEqual(["uuid", "name", "__type", "_extra"]);

    const split = buildSchemaPlan([dog, bird, animal], { tables: { "MyApp/Dog": "dogs" } });
    expect(split.tables.map(t => t.name).sort()).toEqual(["dogs", "myapp_animal"]);
    expect(split.models["MyApp/Dog"].table).toBe("dogs");
    expect(split.models["MyApp/Bird"].table).toBe("myapp_animal");
  });

  it("records an inherited relation once, and rejects a conflicting redeclaration", () => {
    const owner = links(link("owner", "MyApp/User"));
    const user = model("MyApp/User", { uuid });
    const other = model("MyApp/Other", { uuid });
    const base = model("MyApp/Base", { uuid, owner: { type: "string" } }, owner);
    const child = model("MyApp/Child", { uuid, owner: { type: "string" } }, { Ancestors: ["MyApp/Base"], ...owner });
    const plan = buildSchemaPlan([user, base, child]);
    expect(plan.relations.filter(r => r.attribute === "owner")).toHaveLength(1);
    expect(plan.foreignKeys).toHaveLength(1);
    expect(plan.warnings).toEqual([]);
    // An inherited junction is planned once
    const tags = { tags: { type: "array" } as JSONSchemaLike };
    const tagLinks = links(link("tags", "MyApp/User", "LINKS_SIMPLE_ARRAY"));
    const junction = buildSchemaPlan([
      user,
      model("MyApp/Base", { uuid, ...tags }, tagLinks),
      model("MyApp/Child", { uuid, ...tags }, { Ancestors: ["MyApp/Base"], ...tagLinks })
    ]);
    expect(junction.tables.map(t => t.name).pop()).toBe("myapp_base_tags");
    expect(junction.tables).toHaveLength(3);
    expect(junction.relations).toEqual([expect.objectContaining({ model: "MyApp/Base", attribute: "tags" })]);
    const conflicting = model(
      "MyApp/Child",
      { uuid, owner: { type: "string" } },
      { Ancestors: ["MyApp/Base"], ...links(link("owner", "MyApp/Other")) }
    );
    expect(() => buildSchemaPlan([user, other, base, conflicting])).toThrow(/owner is a link to MyApp\/Other/);
  });

  it("handles self references and cycles", () => {
    const plan = buildSchemaPlan([
      model(
        "MyApp/A",
        { uuid, b: { type: "string" }, manager: { type: "string" } },
        links(link("b", "MyApp/B"), link("manager", "MyApp/A"))
      ),
      model("MyApp/B", { uuid, a: { type: "string" } }, links(link("a", "MyApp/A")))
    ]);
    expect(plan.tables.map(t => t.name)).toEqual(["myapp_b", "myapp_a"]);
    expect(plan.foreignKeys.map(f => `${f.table}.${f.columns}->${f.references.table}`)).toEqual([
      "myapp_a.b->myapp_b",
      "myapp_a.manager->myapp_a",
      "myapp_b.a->myapp_a"
    ]);
  });

  it("references models outside the store with a column, an index and a warning", () => {
    const plan = buildSchemaPlan(
      [
        model(
          "MyApp/Post",
          { uuid, author: { type: "string" }, ghost: { type: "string" }, tags: { type: "array" } },
          links(
            link("author", "MyApp/User"),
            link("ghost", "MyApp/Ghost"),
            link("tags", "MyApp/Tag", "LINKS_SIMPLE_ARRAY")
          )
        )
      ],
      {
        knownModels: [
          model("MyApp/User", { id: { type: "string", format: "uuid" } }, { PrimaryKey: ["id"] }),
          model("MyApp/Tag", { uuid })
        ]
      }
    );
    expect(columns(plan, "myapp_post")).toEqual([
      "uuid text",
      "author uuid",
      "ghost text",
      "__type text",
      "_extra json null"
    ]);
    expect(plan.foreignKeys.map(f => f.name)).toEqual(["fk_myapp_post_tags_post"]);
    expect(plan.indexes.map(i => i.name)).toEqual(
      expect.arrayContaining(["idx_myapp_post_author", "idx_myapp_post_ghost", "idx_myapp_post_tags_tag"])
    );
    expect(plan.relations.find(r => r.attribute === "author")).toEqual({
      model: "MyApp/Post",
      attribute: "author",
      kind: "link",
      target: "MyApp/User",
      storage: { kind: "columns", columns: ["author"] }
    });
    expect(plan.relations.find(r => r.attribute === "ghost")?.target).toBeUndefined();
    expect(plan.warnings.map(w => `${w.code}:${w.attribute}`)).toEqual([
      "CROSS_STORE_REFERENCE:author",
      "UNRESOLVED_TARGET:ghost",
      "CROSS_STORE_REFERENCE:tags"
    ]);
  });

  it("warns when a link has no target", () => {
    // A link declared on a generic base class has no model
    const missing = buildSchemaPlan([
      model("C/Post", { uuid, owner: { type: "string" } }, links(link("owner", undefined)))
    ]);
    expect(missing.warnings).toEqual([expect.objectContaining({ code: "UNRESOLVED_TARGET", attribute: "owner" })]);
    expect(columns(missing, "c_post")[1]).toBe("owner text");
  });

  it("applies the layout options", () => {
    const models = blog();
    const plan = new RelationalSchemaBuilder({
      columnNaming: "snake_case",
      extraColumn: false,
      foreignKeys: false
    }).build(models);
    expect(columns(plan, "myapp_post")).toEqual([
      "uuid text",
      "title varchar(200)",
      "author text",
      "_creation_date timestamptz",
      "__type text"
    ]);
    expect(plan.foreignKeys).toEqual([]);
    expect(plan.indexes.map(i => i.name)).toContain("idx_myapp_post_author");
    expect(
      buildSchemaPlan([model("MyApp/X", { uuid, HTTPServerURL: { type: "string" } })], { columnNaming: "snake_case" })
        .tables[0].columns[1].name
    ).toBe("http_server_url");
  });

  it("cuts long constraint names with a hash", () => {
    const long = "a".repeat(40);
    const plan = buildSchemaPlan([
      model(
        `MyApp/${long}`,
        { uuid, [`${long}Owner`]: { type: "string" } },
        links(link(`${long}Owner`, `MyApp/${long}`))
      )
    ]);
    for (const name of [...plan.foreignKeys, ...plan.indexes].map(c => c.name)) {
      expect(name.length).toBeLessThanOrEqual(63);
    }
    expect(plan.foreignKeys[0].name).toMatch(/^fk_myapp_a[a_]+_[0-9a-f]{8}$/);
  });

  it("rejects what cannot share a table", () => {
    expect(() => buildSchemaPlan([model("MyApp/NoKey", { uuid }, { PrimaryKey: [] })])).toThrow(SchemaBuildError);
    const parent = model("MyApp/P", { uuid, value: { type: "string" } });
    expect(() =>
      buildSchemaPlan([parent, model("MyApp/C", { uuid, id: uuid }, { Ancestors: ["MyApp/P"], PrimaryKey: ["id"] })])
    ).toThrow(/different primary keys/);
    expect(() =>
      buildSchemaPlan([parent, model("MyApp/C", { uuid, value: { type: "integer" } }, { Ancestors: ["MyApp/P"] })])
    ).toThrow(/has type text in MyApp\/P and bigint in MyApp\/C/);
    expect(() => buildSchemaPlan([model("MyApp/X", { uuid, _extra: { type: "object" } })])).toThrow(/reserved/);
    expect(() =>
      buildSchemaPlan(
        [
          model(
            "MyApp/Post",
            { uuid, tags: { type: "array" } },
            links(link("tags", "MyApp/Tag", "LINKS_SIMPLE_ARRAY"))
          ),
          model("MyApp/Tag", { uuid }, {}),
          model("MyApp/PostTags", { uuid }, {})
        ],
        { tables: { "MyApp/PostTags": "myapp_post_tags" } }
      )
    ).toThrow(/Junction table myapp_post_tags of MyApp\/Post.tags already exists/);
    expect(() =>
      buildSchemaPlan([
        model(
          "MyApp/Post",
          { uuid, tags: { type: "array", items: { type: "object", properties: { key: { type: "string" } } } } },
          links(link("tags", "MyApp/Tag", "LINKS_MAP"))
        ),
        model("MyApp/Tag", { uuid })
      ])
    ).not.toThrow();
    expect(() =>
      buildSchemaPlan([model("MyApp/X", { uuid, fooBar: { type: "string" }, foo_bar: { type: "string" } })], {
        columnNaming: "snake_case"
      })
    ).toThrow(/used by both field fooBar and field foo_bar/);
    // A subclass may widen a text column
    const widened = buildSchemaPlan([
      model("MyApp/P", { uuid, value: { type: "string", maxLength: 10, enum: ["a"] } }),
      model("MyApp/C", { uuid, value: { type: "string" } }, { Ancestors: ["MyApp/P"] })
    ]);
    expect(widened.tables[0].columns[1]).toMatchObject({ type: { kind: "text" } });
    expect(widened.tables[0].columns[1].enum).toBeUndefined();
  });

  it("is deterministic", () => {
    const a = buildSchemaPlan(blog());
    const b = buildSchemaPlan(blog().reverse());
    expect(b).toEqual(a);
  });

  for (const module of ["sample-app/webda.module.json", "sample-apps/blog-system/webda.module.json"]) {
    it(`plans the models of ${module}`, () => {
      const models = Object.values(
        JSON.parse(readFileSync(join(root, module), "utf-8")).models
      ) as SchemaModelMetadata[];
      const plan = buildSchemaPlan(models.filter(m => m.PrimaryKey?.length || m.Subclasses?.length));
      expect(plan.tables.length).toBeGreaterThan(0);
      for (const t of plan.tables) {
        expect(t.primaryKey.length, t.name).toBeGreaterThan(0);
        for (const key of t.primaryKey) {
          expect(t.columns.find(c => c.name === key)?.nullable, `${t.name}.${key}`).toBe(false);
        }
      }
      if (module.includes("blog")) {
        expect(columns(plan, "webdasample_posttag").slice(0, 2)).toEqual(["post varchar(250)", "tag varchar(50)"]);
        expect(table(plan, "webdasample_post_tags").junction?.kind).toBe("linksArray");
        // ManyToOne: a link
        expect(plan.foreignKeys.find(f => f.name === "fk_webdasample_comment_post")?.onDelete).toBe("NO ACTION");
        expect(plan.relations.find(r => r.model === "WebdaSample/Tag" && r.attribute === "posts")).toMatchObject({
          kind: "query",
          targetAttribute: "tags"
        });
        expect(table(plan, "webdasample_post").columns.find(c => c.name === "status")?.enum).toEqual([
          "draft",
          "published",
          "archived"
        ]);
      }
    });
  }
});

describe("relational metadata boundary cases", () => {
  it("types recursive primary-key references without recursing forever", () => {
    const plan = buildSchemaPlan([
      model(
        "App/Recursive",
        { owner: { type: "object" } },
        { PrimaryKey: ["owner"], ...links(link("owner", "App/Recursive")) }
      )
    ]);
    expect(plan.tables[0].primaryKey).toEqual(["owner"]);
    expect(plan.tables[0].columns[0].type).toEqual({ kind: "text" });
  });

  it("uses text references for external models with missing keys and unknown junction targets", () => {
    const external = model("External/NoKey", {}, { PrimaryKey: undefined });
    const plan = buildSchemaPlan(
      [
        model(
          "App/Owner",
          { uuid, ref: { type: "object" }, refs: { type: "array" } },
          links(link("ref", "External/NoKey"), link("refs", undefined, "LINKS_ARRAY"))
        )
      ],
      { knownModels: [external] }
    );
    expect(plan.tables.find(t => t.name === "app_owner")!.columns.find(c => c.name === "ref")!.type).toEqual({
      kind: "text"
    });
    expect(plan.tables.find(t => t.junction)!.columns.some(c => c.role === "target" && c.type.kind === "text")).toBe(
      true
    );
    expect(
      buildSchemaPlan([
        model("App/Owner", { uuid, ref: { type: "object" } }, links(link("ref", undefined)))
      ]).tables[0].columns.find(c => c.name === "ref")!.type
    ).toEqual({ kind: "text" });
  });

  it("merges shared enum columns and keeps wider parent types", () => {
    const plan = buildSchemaPlan([
      model("App/Base", { uuid, value: { type: "string", maxLength: 30, enum: ["a"] } }),
      model("App/Child", { uuid, value: { type: "string", maxLength: 10, enum: ["b"] } }, { Ancestors: ["App/Base"] })
    ]);
    expect(plan.tables[0].columns.find(c => c.name === "value")).toMatchObject({
      type: { kind: "varchar", length: 30 },
      enum: ["a", "b"]
    });
    expect(widestType({ kind: "text" }, { kind: "varchar", length: 10 })).toEqual({ kind: "text" });
  });

  it("types external composite keys and composite junction targets", () => {
    for (const separator of [undefined, ":"]) {
      const target = model(
        "External/Composite",
        { a: uuid, b: uuid },
        { PrimaryKey: ["a", "b"], PrimaryKeySeparator: separator }
      );
      const owner = model(
        "App/Owner",
        { uuid, ref: uuid, refs: { type: "array" } },
        links(link("ref", target.Identifier), link("refs", target.Identifier, "LINKS_SIMPLE_ARRAY"))
      );
      const plan = buildSchemaPlan([owner], { knownModels: [target] });
      expect(plan.relations.find(r => r.attribute === "ref")!.keySeparator).toBe(separator ?? "_");
      expect(
        plan.tables
          .find(t => t.junction)!
          .columns.filter(c => c.role === "target")
          .map(c => c.keyPart)
      ).toEqual(["a", "b"]);
    }
  });

  it("rejects junction attribute collisions and preserves their enums", () => {
    const owner = (properties: any) =>
      model(
        "App/Owner",
        { uuid, refs: { type: "array", items: { type: "object", properties, required: Object.keys(properties) } } },
        links(link("refs", "App/Target", "LINKS_ARRAY"))
      );
    const target = model("App/Target", { uuid });
    expect(() => buildSchemaPlan([owner({ owner: uuid }), target])).toThrow(/conflicts with the junction column/);
    const plan = buildSchemaPlan([owner({ status: { type: "string", enum: ["a", "b"] } }), target]);
    expect(plan.tables.find(t => t.junction)!.columns.find(c => c.name === "status")!.enum).toEqual(["a", "b"]);
  });

  it("ignores unknown link kinds and null-only union branches", () => {
    expect(declaredRelations(model("App/M", { uuid }, links(link("x", "App/M", "FUTURE_KIND")))).size).toBe(0);
    expect(
      mapScalar({ anyOf: [{ const: null }, { type: "string" }] }, undefined, {
        columnNaming: "preserve",
        extraColumn: "_extra",
        foreignKeys: true,
        numericAsDecimal: false
      })
    ).toMatchObject({ type: { kind: "text" }, nullable: true });
  });
});

describe("compound reference identities", () => {
  it("derives separators when one logical key expands into several physical columns", () => {
    const composite = model("App/Composite", { a: uuid, b: uuid }, { PrimaryKey: ["a", "b"] });
    const indirect = model(
      "App/Indirect",
      { ref: uuid },
      { PrimaryKey: ["ref"], ...links(link("ref", "App/Composite")) }
    );
    const owner = model("App/Owner", { uuid, ref: uuid }, links(link("ref", "App/Indirect")));
    const plan = buildSchemaPlan([composite, indirect, owner]);
    expect(plan.relations.find(r => r.model === "App/Owner")!.keySeparator).toBe("_");
  });

  it("does not duplicate the discriminator when metadata includes it as its only key", () => {
    const plan = buildSchemaPlan([model("App/Singleton", { __type: uuid }, { PrimaryKey: ["__type"] })]);
    expect(plan.tables[0].columns.filter(c => c.name === "__type")).toHaveLength(1);
    expect(plan.models["App/Singleton"].columns).toContain("__type");
  });
});
