import { describe, expect, it } from "vitest";
import type { RelationalSchemaOptions } from "./builder.js";
import { buildSchemaPlan } from "./builder.js";
import type { SchemaChange } from "./compare.js";
import { blockingChanges, compareSchemaPlans } from "./compare.js";
import { canonicalJSON, planHash } from "./hash.js";
import type { JSONSchemaLike, SchemaModelMetadata } from "./metadata.js";

/**
 * A model with a `uuid` key
 * @param Identifier - the identifier
 * @param properties - the stored properties
 * @param extra - other metadata
 * @returns the metadata
 */
function model(
  Identifier: string,
  properties: { [name: string]: JSONSchemaLike },
  extra: Partial<SchemaModelMetadata> & { required?: string[] } = {}
): SchemaModelMetadata {
  const { required = ["uuid"], ...rest } = extra;
  return {
    Identifier,
    PrimaryKey: ["uuid"],
    Reflection: {},
    Schemas: { Stored: { type: "object", properties: { uuid: { type: "string" }, ...properties }, required } },
    ...rest
  };
}

const user = model("MyApp/User", {});
const team = model("MyApp/Team", {});

/**
 * @param properties - the Post properties
 * @param extra - other Post metadata
 * @returns the models
 */
function post(
  properties: { [name: string]: JSONSchemaLike },
  extra: Partial<SchemaModelMetadata> & { required?: string[] } = {}
): SchemaModelMetadata[] {
  return [user, team, model("MyApp/Post", properties, extra)];
}

/**
 * Compare the plan of v1 to the plan of v2
 * @param v1 - the models of the live version
 * @param v2 - the models of the new version
 * @param options - builder options of each version
 * @returns the changes other than SAFE
 */
function diff(
  v1: SchemaModelMetadata[],
  v2: SchemaModelMetadata[],
  options: { v1?: RelationalSchemaOptions; v2?: RelationalSchemaOptions; allowIncompatible?: string[] } = {}
): Pick<SchemaChange, "category" | "code">[] {
  return compareSchemaPlans(
    [{ version: "1.0.0", plan: buildSchemaPlan(v1, options.v1) }],
    buildSchemaPlan(v2, options.v2),
    {
      allowIncompatible: options.allowIncompatible
    }
  )
    .filter(c => c.category !== "SAFE")
    .map(({ category, code }) => ({ category, code }));
}

/**
 * @param code - the change code
 * @returns the expected BLOCK change
 */
const block = (code: SchemaChange["code"]) => ({ category: "BLOCK", code });

/**
 * Link type compiled for each written relation type
 */
const COMPILED: { [type: string]: string } = {
  ModelLink: "LINK",
  OneToOne: "LINK",
  ModelLinksSimpleArray: "LINKS_SIMPLE_ARRAY",
  ManyToMany: "LINKS_ARRAY"
};

/**
 * Relations as compiled, with the written types in Reflection
 * @param relations - attribute, target class name and written type of each relation
 * @returns the metadata fragment
 */
function relate(...relations: [attribute: string, target: string, type?: string][]): Partial<SchemaModelMetadata> {
  const compiled: NonNullable<SchemaModelMetadata["Relations"]> = {};
  const reflection: NonNullable<SchemaModelMetadata["Reflection"]> = {};
  for (const [attribute, target, type = "ModelLink"] of relations) {
    const model = `MyApp/${target}`;
    if (type === "ModelParent") {
      compiled.parent = { attribute, model };
    } else {
      (compiled.links ??= []).push({ attribute, model, type: COMPILED[type] });
    }
    reflection[attribute] = { type, typeParameters: [target] };
  }
  return { Relations: compiled, Reflection: reflection };
}

describe("compareSchemaPlans", () => {
  it("finds nothing between identical plans", () => {
    const models = post({ title: { type: "string" } });
    expect(compareSchemaPlans([{ version: "1", plan: buildSchemaPlan(models) }], buildSchemaPlan(models))).toEqual([]);
  });

  it("accepts additive changes", () => {
    const changes = compareSchemaPlans(
      [{ version: "1.0.0", plan: buildSchemaPlan(post({ title: { type: "string" } })) }],
      buildSchemaPlan([
        ...post(
          {
            title: { type: "string" },
            summary: { type: "string" },
            owner: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          },
          {
            required: ["uuid", "summary"],
            ...relate(["owner", "User"], ["tags", "Tag", "ModelLinksSimpleArray"])
          }
        ),
        model("MyApp/Tag", {})
      ])
    );
    expect(blockingChanges(changes)).toEqual([]);
    expect(changes.map(c => c.code)).toEqual(
      expect.arrayContaining(["MODEL_ADDED", "TABLE_ADDED", "COLUMN_ADDED", "RELATION_ADDED", "INDEX_ADDED"])
    );
    expect(changes.every(c => c.version === "1.0.0")).toBe(true);
    // A new required field is announced as created nullable
    expect(changes.find(c => c.column === "summary")?.message).toMatch(/created nullable/);
  });

  it("accepts removals: the storage stays for the live version", () => {
    expect(
      diff([...post({ title: { type: "string" }, owner: { type: "string" } }, relate(["owner", "User"]))], [user])
    ).toEqual([]);
  });

  it("blocks a property type change", () => {
    expect(diff(post({ status: { type: "string" } }), post({ status: { type: "number" } }))).toEqual([
      block("TYPE_CHANGED")
    ]);
    expect(diff(post({ count: { type: "integer" } }), post({ count: { type: "number" } }))).toEqual([
      block("TYPE_CHANGED")
    ]);
    expect(diff(post({ meta: { type: "object" } }), post({ meta: { type: "string" } }))).toEqual([
      block("TYPE_CHANGED")
    ]);
    expect(diff(post({ when: { type: "string", format: "date-time" } }), post({ when: { type: "string" } }))).toEqual([
      block("TYPE_CHANGED")
    ]);
  });

  it("accepts widening and blocks narrowing", () => {
    expect(
      diff(post({ title: { type: "string", maxLength: 50 } }), post({ title: { type: "string", maxLength: 100 } }))
    ).toEqual([]);
    expect(diff(post({ title: { type: "string", maxLength: 50 } }), post({ title: { type: "string" } }))).toEqual([]);
    expect(diff(post({ title: { type: "string" } }), post({ title: { type: "string", maxLength: 50 } }))).toEqual([
      block("TYPE_NARROWED")
    ]);
    expect(
      diff(post({ title: { type: "string", maxLength: 100 } }), post({ title: { type: "string", maxLength: 50 } }))
    ).toEqual([block("TYPE_NARROWED")]);
  });

  it("warns on added enum values and blocks removed ones", () => {
    const status = (...values: string[]) => post({ status: { type: "string", enum: values } });
    expect(diff(status("a"), status("a", "b"))).toEqual([{ category: "WARN", code: "ENUM_VALUES_ADDED" }]);
    expect(diff(status("a", "b"), status("a"))).toEqual([block("ENUM_VALUES_REMOVED")]);
    expect(diff(post({ status: { type: "string" } }), status("a"))).toEqual([block("ENUM_CONSTRAINT_ADDED")]);
    expect(diff(status("a"), post({ status: { type: "string" } }))).toEqual([]);
  });

  it("accepts a field becoming required and blocks one becoming optional", () => {
    const optional = post({ title: { type: "string" } });
    const required = post({ title: { type: "string" } }, { required: ["uuid", "title"] });
    expect(diff(optional, required)).toEqual([]);
    expect(diff(required, optional)).toEqual([block("FIELD_OPTIONAL")]);
  });

  it("warns that a rename does not carry the data", () => {
    expect(diff(post({ title: { type: "string" } }), post({ headline: { type: "string" } }))).toEqual([
      { category: "WARN", code: "POSSIBLE_RENAME" }
    ]);
  });

  it("blocks a relation kind change", () => {
    const owner = (type: string, schema: JSONSchemaLike = { type: "string" }) =>
      post({ owner: schema }, relate(["owner", "User", type]));
    // link -> parent: same column, other semantics
    expect(diff(owner("ModelLink"), owner("ModelParent"))).toEqual(
      expect.arrayContaining([block("RELATION_KIND_CHANGED"), block("DELETE_POLICY_CHANGED")])
    );
    // column -> junction
    expect(diff(owner("ModelLink"), owner("ModelLinksSimpleArray", { type: "array" }))).toEqual(
      expect.arrayContaining([block("RELATION_KIND_CHANGED")])
    );
    // simple array -> array with attributes
    expect(diff(owner("ModelLinksSimpleArray", { type: "array" }), owner("ManyToMany", { type: "array" }))).toEqual(
      expect.arrayContaining([block("RELATION_KIND_CHANGED")])
    );
  });

  it("blocks a relation target change", () => {
    const owner = (target: string) => post({ owner: { type: "string" } }, relate(["owner", target]));
    expect(diff(owner("User"), owner("Team"))).toEqual([block("RELATION_TARGET_CHANGED")]);
  });

  it("blocks a delete policy change, except between NO ACTION and RESTRICT", () => {
    const v1 = buildSchemaPlan(post({ owner: { type: "string" } }, relate(["owner", "User"])));
    const withPolicy = (onDelete: "RESTRICT" | "SET NULL") => ({
      ...v1,
      relations: v1.relations.map(r => (r.attribute === "owner" ? { ...r, onDelete } : r))
    });
    expect(blockingChanges(compareSchemaPlans([{ version: "1", plan: v1 }], withPolicy("RESTRICT")))).toEqual([]);
    expect(blockingChanges(compareSchemaPlans([{ version: "1", plan: v1 }], withPolicy("SET NULL")))).toEqual([
      expect.objectContaining({ code: "DELETE_POLICY_CHANGED", model: "MyApp/Post", attribute: "owner" })
    ]);
  });

  it("blocks a primary key change", () => {
    const keyed = (PrimaryKey: string[], PrimaryKeySeparator?: string) => [
      model("MyApp/Post", { slug: { type: "string" }, lang: { type: "string" } }, { PrimaryKey, PrimaryKeySeparator })
    ];
    expect(diff(keyed(["uuid"]), keyed(["slug"]))).toEqual(expect.arrayContaining([block("PRIMARY_KEY_CHANGED")]));
    expect(diff(keyed(["slug", "lang"]), keyed(["lang", "slug"]))).toEqual(
      expect.arrayContaining([block("PRIMARY_KEY_CHANGED")])
    );
    expect(diff(keyed(["slug", "lang"], ":"), keyed(["slug", "lang"], "#"))).toEqual([block("PRIMARY_KEY_CHANGED")]);
  });

  it("blocks a hierarchy change", () => {
    const animal = model("MyApp/Animal", {});
    const dog = model("MyApp/Dog", {}, { Ancestors: ["MyApp/Animal"] });
    expect(diff([animal, dog], [animal, dog], { v2: { tables: { "MyApp/Dog": "dogs" } } })).toEqual([
      block("MODEL_TABLE_CHANGED")
    ]);
    // A new subclass is safe: the live version skips it with the class filter
    expect(diff([animal], [animal, dog])).toEqual([]);
  });

  it("blocks a store option change", () => {
    const models = post({ createdAt: { type: "string" } });
    expect(diff(models, models, { v2: { extraColumn: false } })).toEqual([block("OPTIONS_CHANGED")]);
    expect(diff(models, models, { v2: { columnNaming: "snake_case" } })).toEqual(
      expect.arrayContaining([block("OPTIONS_CHANGED"), { category: "WARN", code: "POSSIBLE_RENAME" }])
    );
  });

  it("blocks a column changing meaning", () => {
    expect(
      diff(post({ owner: { type: "string" } }), post({ owner: { type: "string" } }, relate(["owner", "User"])))
    ).toEqual([block("COLUMN_ROLE_CHANGED")]);
  });

  it("warns on a new unique index", () => {
    expect(
      diff(
        post({ owner: { type: "string" } }, relate(["owner", "User"])),
        post({ owner: { type: "string" } }, relate(["owner", "User", "OneToOne"]))
      )
    ).toEqual([{ category: "WARN", code: "UNIQUE_INDEX_ADDED" }]);
  });

  it("downgrades allowed incompatibilities to forced warnings", () => {
    const v1 = post({ status: { type: "string" } });
    const v2 = post({ status: { type: "number" } });
    expect(diff(v1, v2, { allowIncompatible: ["myapp_post.status"] })).toEqual([
      { category: "WARN", code: "TYPE_CHANGED" }
    ]);
    const forced = compareSchemaPlans([{ version: "1", plan: buildSchemaPlan(v1) }], buildSchemaPlan(v2), {
      allowIncompatible: ["myapp_post"]
    }).find(c => c.code === "TYPE_CHANGED");
    expect(forced).toMatchObject({ category: "WARN", forced: true, table: "myapp_post", column: "status" });
    expect(diff(v1, v2, { allowIncompatible: ["myapp_post.title"] })).toEqual([block("TYPE_CHANGED")]);
  });

  it("compares against every live version", () => {
    const changes = compareSchemaPlans(
      [
        { version: "1.0.0", plan: buildSchemaPlan(post({ status: { type: "string" } })) },
        { version: "1.1.0", plan: buildSchemaPlan(post({ status: { type: "number" } })) }
      ],
      buildSchemaPlan(post({ status: { type: "number" } }))
    );
    expect(blockingChanges(changes)).toEqual([
      expect.objectContaining({ version: "1.0.0", code: "TYPE_CHANGED", table: "myapp_post", column: "status" })
    ]);
  });
});

describe("planHash", () => {
  it("identifies a plan regardless of key order and warnings", () => {
    const plan = buildSchemaPlan(post({ title: { type: "string" } }));
    const reverse = (value: any): any =>
      Array.isArray(value)
        ? value.map(reverse)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .reverse()
                .map(key => [key, reverse(value[key])])
            )
          : value;
    const reordered = reverse(plan);
    expect(Object.keys(reordered)).toEqual(Object.keys(plan).reverse());
    expect(planHash({ ...plan, warnings: [{ code: "UNRESOLVED_TARGET", model: "x", message: "y" }] })).toBe(
      planHash(plan)
    );
    expect(planHash(reordered)).toBe(planHash(plan));
    expect(planHash(buildSchemaPlan(post({ title: { type: "integer" } })))).not.toBe(planHash(plan));
    expect(planHash(plan)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes canonical JSON", () => {
    expect(canonicalJSON({ b: 1, a: [{ d: undefined, c: null }, undefined], e: "x" })).toBe(
      '{"a":[{"c":null},null],"b":1,"e":"x"}'
    );
  });
});

describe("persisted plan compatibility boundaries", () => {
  it("reports role changes even when one side has no logical field name", () => {
    const before = buildSchemaPlan([user]);
    const after = structuredClone(before);
    after.tables[0].columns[0].role = "target";
    after.tables[0].columns[0].field = "";
    expect(
      compareSchemaPlans([{ version: "live", plan: before }], after).some(c => c.code === "COLUMN_ROLE_CHANGED")
    ).toBe(true);
    expect(
      compareSchemaPlans([{ version: "live", plan: after }], before).some(c => c.code === "COLUMN_ROLE_CHANGED")
    ).toBe(true);
  });

  it("reports junction and missing delete-policy changes in both directions", () => {
    const before = buildSchemaPlan(
      post({ author: { type: "string" } }, { Relations: { parent: { attribute: "author", model: "MyApp/User" } } })
    );
    const after = structuredClone(before);
    after.relations[0].storage = { kind: "junction", table: "different_junction" };
    delete after.relations[0].onDelete;
    expect(
      compareSchemaPlans([{ version: "live", plan: before }], after).some(c => c.code === "RELATION_KIND_CHANGED")
    ).toBe(true);
    expect(
      compareSchemaPlans([{ version: "live", plan: before }], after).some(c => c.code === "DELETE_POLICY_CHANGED")
    ).toBe(true);
    expect(
      compareSchemaPlans([{ version: "live", plan: after }], before).some(c => c.code === "DELETE_POLICY_CHANGED")
    ).toBe(true);
  });
});
