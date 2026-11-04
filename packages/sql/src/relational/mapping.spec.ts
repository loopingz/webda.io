import { buildSchemaPlan } from "@webda/sql-schema";
import type { SchemaModelMetadata } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import { TableMapping } from "./mapping.js";

/**
 * Model metadata as compiled in webda.module.json
 * @param Identifier - the model identifier
 * @param properties - the stored properties
 * @param extra - other metadata
 * @returns the metadata
 */
function model(
  Identifier: string,
  properties: { [name: string]: any },
  extra: Partial<SchemaModelMetadata> & { required?: string[] } = {}
): SchemaModelMetadata {
  const { required = ["uuid"], ...rest } = extra;
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

const uuid = { type: "string" };
const models = [
  model(
    "App/Post",
    {
      uuid,
      title: { type: "string" },
      views: { type: "integer" },
      meta: { type: "object" },
      createdAt: { type: "string", format: "date-time" },
      day: { type: "string", format: "date" },
      author: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      contributors: { type: "array", items: { type: "object", properties: { role: { type: "string" } } } },
      reviewers: { type: "object", additionalProperties: { type: "object" } },
      ghosts: { type: "object", additionalProperties: { type: "object" } }
    },
    {
      Relations: {
        links: [
          { attribute: "author", model: "App/User", type: "LINK" },
          { attribute: "tags", model: "App/Tag", type: "LINKS_SIMPLE_ARRAY" },
          { attribute: "contributors", model: "App/User", type: "LINKS_ARRAY" },
          { attribute: "reviewers", model: "App/User", type: "LINKS_MAP" },
          { attribute: "ghosts", model: "App/Ghost", type: "LINKS_MAP" }
        ]
      }
    }
  ),
  model("App/User", { uuid, name: { type: "string" } }),
  model("App/Tag", { uuid, label: { type: "string" } }),
  model(
    "App/Pair",
    { a: { type: "string" }, b: { type: "string" }, label: { type: "string" } },
    {
      PrimaryKey: ["a", "b"],
      PrimaryKeySeparator: "_",
      required: ["a", "b"]
    }
  ),
  model(
    "App/PairRef",
    { uuid, pair: { type: "string" }, pairs: { type: "array", items: { type: "string" } } },
    {
      Relations: {
        links: [
          { attribute: "pair", model: "App/Pair", type: "LINK" },
          { attribute: "pairs", model: "App/Pair", type: "LINKS_SIMPLE_ARRAY" }
        ]
      }
    }
  ),
  model(
    "App/Animal",
    { uuid, kind: { type: "string" }, tags: { type: "array", items: { type: "string" } } },
    {
      Subclasses: ["App/Dog"],
      Relations: { links: [{ attribute: "tags", model: "App/Tag", type: "LINKS_SIMPLE_ARRAY" }] }
    }
  ),
  model("App/Dog", { uuid, kind: { type: "string" }, bark: { type: "boolean" } }, { Ancestors: ["App/Animal"] })
];
const plan = buildSchemaPlan(models);
const table = (name: string) => plan.tables.find(t => t.name === name)!;
const posts = new TableMapping(plan, table("app_post"));
const decodeJson = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v);

describe("TableMapping", () => {
  it("resolvesAttributeKinds", () => {
    expect(posts.resolve(["title"])).toMatchObject({ kind: "column", column: { name: "title" } });
    expect(posts.resolve(["meta", "deep", "k"])).toMatchObject({
      kind: "json",
      column: { name: "meta" },
      path: ["deep", "k"]
    });
    expect(posts.resolve(["author"])).toMatchObject({ kind: "column", column: { name: "author", role: "reference" } });
    expect(posts.resolve(["tags"])).toMatchObject({ kind: "junction", table: { name: "app_post_tags" } });
    expect(posts.resolve(["nope"])).toMatchObject({ kind: "extra", column: { name: "_extra" }, path: ["nope"] });
    const refs = new TableMapping(plan, table("app_pairref"));
    const pair = refs.resolve(["pair"]);
    expect(pair.kind).toBe("reference");
    expect((pair as any).columns.map((c: any) => c.name)).toEqual(["pair_a", "pair_b"]);
    const strictPlan = buildSchemaPlan(models, { extraColumn: false });
    const strict = new TableMapping(
      strictPlan,
      strictPlan.tables.find(t => t.name === "app_post")!
    );
    expect(strict.resolve(["nope"])).toEqual({ kind: "unknown" });
    expect(posts.typeColumn).toBe("__type");
    expect(posts.extraColumn).toBe("_extra");
    expect(posts.primaryKey).toEqual(["uuid"]);
  });

  it("toRowFullAndPartial", () => {
    const createdAt = new Date("2024-01-02T03:04:05.000Z");
    const row = posts.toRow(
      {
        uuid: "p1",
        title: "T",
        views: 3,
        meta: { a: 1 },
        createdAt,
        author: "u1",
        tags: ["t2", "t1"],
        extraKey: 1,
        __type: "App/Post"
      },
      "App/Post",
      false
    );
    const value = (name: string) => row.values[row.columns.indexOf(name)];
    expect(row.columns).not.toContain("tags");
    expect(row.columns).not.toContain("reviewers");
    expect(value("uuid")).toBe("p1");
    expect(value("views")).toBe(3);
    expect(value("meta")).toBe(JSON.stringify({ a: 1 }));
    expect(value("createdAt")).toBe("2024-01-02T03:04:05.000Z");
    expect(value("author")).toBe("u1");
    expect(value("__type")).toBe("App/Post");
    expect(value("_extra")).toBe(JSON.stringify({ extraKey: 1 }));
    expect(row.junctions.map(j => j.table.name).sort()).toEqual([
      "app_post_contributors",
      "app_post_ghosts",
      "app_post_reviewers",
      "app_post_tags"
    ]);
    const tags = row.junctions.find(j => j.table.name === "app_post_tags")!;
    expect(tags.rows).toEqual([
      { post: "p1", tag: "t2", _position: 0 },
      { post: "p1", tag: "t1", _position: 1 }
    ]);
    expect(row.junctions.find(j => j.table.name === "app_post_reviewers")!.rows).toEqual([]);
    const partial = posts.toRow({ views: 4 }, "App/Post", true);
    expect(partial.columns).toEqual(["views"]);
    expect(partial.values).toEqual([4]);
    expect(partial.junctions).toEqual([]);
    const partialExtra = posts.toRow({ other: "x", tags: ["t1"] }, "App/Post", true);
    expect(partialExtra.columns).toEqual(["_extra"]);
    expect(partialExtra.junctions).toHaveLength(1);
    expect(
      posts.toRow({ uuid: "p2" }, "App/Post", false).values[
        posts.toRow({ uuid: "p2" }, "App/Post", false).columns.indexOf("title")
      ]
    ).toBeNull();
  });

  it("compositeReferenceSplitsAndJoins", () => {
    const refs = new TableMapping(plan, table("app_pairref"));
    const row = refs.toRow({ uuid: "r1", pair: "x_y" }, "App/PairRef", false);
    expect(row.values[row.columns.indexOf("pair_a")]).toBe("x");
    expect(row.values[row.columns.indexOf("pair_b")]).toBe("y");
    expect(
      refs.fromRow({ uuid: "r1", pair_a: "x", pair_b: "y", __type: null, _extra: null }, new Map(), decodeJson)
    ).toEqual({
      uuid: "r1",
      pair: "x_y"
    });
  });

  it("fromRowMergesExtraUnderColumns", () => {
    const createdAt = new Date("2024-01-02T03:04:05.000Z");
    const json = posts.fromRow(
      { title: "T", _extra: { title: "old", k: 1 }, views: "12", createdAt, meta: null, __type: "App/Post" },
      new Map(),
      decodeJson
    );
    expect(json).toEqual({ title: "T", k: 1, views: 12, createdAt: "2024-01-02T03:04:05.000Z", __type: "App/Post" });
  });

  it("decodesNumericStrings", () => {
    const column = (name: string) => table("app_post").columns.find(c => c.name === name)!;
    expect(posts.decode("9007199254740993", column("views"), decodeJson)).toBe(9007199254740992);
    expect(posts.decode("1.5", { ...column("views"), type: { kind: "decimal" } }, decodeJson)).toBe(1.5);
    expect(posts.decode(null, column("views"), decodeJson)).toBeUndefined();
    expect(posts.decode('{"a":1}', column("meta"), decodeJson)).toEqual({ a: 1 });
    expect(posts.decode("null", column("meta"), decodeJson)).toBeUndefined();
    expect(posts.encode(undefined, column("title"))).toBeNull();
    expect(posts.encode("2024-01-02T03:04:05.000Z", column("createdAt"))).toBe("2024-01-02T03:04:05.000Z");
    expect(posts.encode("7", column("views"))).toBe(7);
  });

  it("booleanNumbersDecode", () => {
    const published: any = { name: "b", field: "b", role: "field", type: { kind: "boolean" }, nullable: true };
    expect(posts.decode(1, published, decodeJson)).toBe(true);
    expect(posts.decode(0, published, decodeJson)).toBe(false);
    expect(posts.decode(true, published, decodeJson)).toBe(true);
    expect(posts.decode(null, published, decodeJson)).toBeUndefined();
  });

  it("foldsJunctions", () => {
    const junctionRows = new Map<string, Record<string, unknown>[]>([
      [
        "tags",
        [
          { post: "p1", tag: "t2", _position: "1" },
          { post: "p1", tag: "t1", _position: "0" }
        ]
      ],
      ["reviewers", [{ post: "p1", user: "u1", key: "lead", attributes: { since: 2020 } }]]
    ]);
    const json = posts.fromRow({ uuid: "p1" }, junctionRows, decodeJson);
    expect(json.tags).toEqual(["t1", "t2"]);
    expect(json.reviewers).toEqual({ lead: { uuid: "u1", since: 2020 } });
    expect(
      posts
        .junctions()
        .map(j => j.relation.attribute)
        .sort()
    ).toEqual(["contributors", "ghosts", "reviewers", "tags"]);
    expect(posts.ownerColumns(table("app_post_tags"), { uuid: "p1" })).toEqual({ post: "p1" });
    const reviewers = posts.toRow({ uuid: "p1", reviewers: { lead: { uuid: "u1", since: 2020 } } }, "App/Post", true);
    expect(reviewers.junctions[0].rows).toEqual([
      { post: "p1", user: "u1", key: "lead", attributes: JSON.stringify({ since: 2020 }) }
    ]);
  });

  it("subclassProjectionAddsItsColumns", () => {
    const animals = new TableMapping(plan, table("app_animal"));
    expect(animals.toRow({ uuid: "d1", __type: "App/Dog", bark: true }, "App/Animal", false).columns).toContain("bark");
    // A named column outside the writer's projection is written, not stashed (see namedColumnsOutsideTheProjection...)
    const named = animals.toRow({ uuid: "a1", bark: true }, "App/Animal", false);
    expect(named.columns).toContain("bark");
    expect(named.values[named.columns.indexOf("_extra")]).toBe("{}");
    expect(animals.projection("App/Dog")).toContain("bark");
    expect(animals.projection("App/Unknown")).toEqual(animals.projection("App/Animal"));
    expect(animals.readColumns()).toEqual(table("app_animal").columns.map(c => c.name));
    expect(animals.toRow({ uuid: "d1", __type: "App/Dog" }, "App/Animal", false).values[0]).toBe("d1");
  });
  it("declaredLinkAttributesGetColumns", () => {
    const row = posts.toRow({ uuid: "p1", contributors: [{ uuid: "u1", role: "x", other: 1 }] }, "App/Post", true);
    const contributors = row.junctions.find(j => j.table.name === "app_post_contributors")!;
    expect(contributors.rows).toEqual([{ post: "p1", user: "u1", _position: 0, role: "x" }]);
    const json = posts.fromRow(
      { uuid: "p1" },
      new Map([["contributors", [{ post: "p1", user: "u1", _position: "0", role: "x" }]]]),
      decodeJson
    );
    expect(json.contributors).toEqual([{ uuid: "u1", role: "x" }]);
  });

  it("refusesUnknownPropertiesWithoutExtraColumn", () => {
    const strictPlan = buildSchemaPlan(models, { extraColumn: false });
    const strict = new TableMapping(
      strictPlan,
      strictPlan.tables.find(t => t.name === "app_post")!
    );
    expect(() => strict.toRow({ uuid: "p1", nope: 1 }, "App/Post", false)).toThrow(/Unknown properties/);
    expect(strict.toRow({ uuid: "p1" }, "App/Post", true).columns).toEqual(["uuid"]);
  });

  it("compositeReferenceAbsentIsNull", () => {
    const refs = new TableMapping(plan, table("app_pairref"));
    const row = refs.toRow({ uuid: "r1" }, "App/PairRef", false);
    expect(row.values[row.columns.indexOf("pair_a")]).toBeNull();
    expect(refs.fromRow({ uuid: "r1", pair_a: null, pair_b: null }, new Map(), decodeJson)).toEqual({ uuid: "r1" });
  });

  it("parentJunctionsApplyToSubclassWrites", () => {
    const animals = new TableMapping(plan, table("app_animal"));
    const row = animals.toRow({ uuid: "d1", __type: "App/Dog", bark: true }, "App/Animal", false);
    expect(row.junctions.map(j => j.relation.attribute)).toEqual(["tags"]);
    expect(row.junctions[0].rows).toEqual([]);
  });

  it("junctionTablesHaveNoProjection", () => {
    const junction = new TableMapping(plan, table("app_post_tags"));
    expect(junction.projection("App/Nope")).toEqual(["post", "tag", "_position"]);
  });
  it("namedColumnsOutsideTheProjectionAreWrittenNotStashed", () => {
    const animals = new TableMapping(plan, table("app_animal"));
    const patch = animals.toRow({ uuid: "d1", bark: false }, "App/Animal", true);
    expect(patch.columns).toEqual(["uuid", "bark"]);
    expect(patch.values).toEqual(["d1", false]);
    const full = animals.toRow({ uuid: "d1", kind: "dog", bark: true, note: "x" }, "App/Animal", false);
    expect(full.columns).toContain("bark");
    expect(full.values[full.columns.indexOf("_extra")]).toBe(JSON.stringify({ note: "x" }));
  });

  it("dateColumnsKeepTheirDayInEveryTimezone", () => {
    const column = table("app_post").columns.find(c => c.name === "day")!;
    expect(column.type).toEqual({ kind: "date" });
    // pg parses a DATE as a local-midnight Date
    expect(posts.decode(new Date(2024, 0, 2), column, decodeJson)).toBe("2024-01-02");
    expect(posts.decode("2024-01-02", column, decodeJson)).toBe("2024-01-02");
    expect(posts.encode(new Date("2024-01-02T23:30:00.000Z"), column)).toBe("2024-01-02");
    expect(posts.encode("2024-01-02", column)).toBe("2024-01-02");
    expect(posts.encode("2024-01-02T23:30:00.000Z", column)).toBe("2024-01-02");
  });
  it("unresolvedJunctionTargetsUseUuid", () => {
    const row = posts.toRow({ uuid: "p1", ghosts: { k: { uuid: "g1", note: 1 } } }, "App/Post", true);
    const ghosts = row.junctions.find(j => j.table.name === "app_post_ghosts")!;
    expect(ghosts.rows).toEqual([{ post: "p1", ghost: "g1", key: "k", attributes: JSON.stringify({ note: 1 }) }]);
    const json = posts.fromRow(
      { uuid: "p1" },
      new Map([["ghosts", [{ post: "p1", ghost: "g1", key: "k", attributes: null }]]]),
      decodeJson
    );
    expect(json.ghosts).toEqual({ k: { uuid: "g1" } });
  });

  it("compositeTargetJunctionSplitsAndJoinsKeys", () => {
    const refs = new TableMapping(plan, table("app_pairref"));
    const row = refs.toRow({ uuid: "r1", pairs: ["x_y"] }, "App/PairRef", true);
    expect(row.junctions[0].rows).toEqual([{ pairRef: "r1", pair_a: "x", pair_b: "y", _position: 0 }]);
    const json = refs.fromRow(
      { uuid: "r1" },
      new Map([["pairs", [{ pairRef: "r1", pair_a: "x", pair_b: "y", _position: "0" }]]]),
      decodeJson
    );
    expect(json.pairs).toEqual(["x_y"]);
    const short = refs.toRow({ uuid: "r1", pair: "x" }, "App/PairRef", false);
    expect(short.values[short.columns.indexOf("pair_b")]).toBeNull();
  });

  it("fromRowIgnoresUnknownJunctionsAndNullFields", () => {
    const json = posts.fromRow(
      { uuid: "p1" },
      new Map([
        ["nope", [{ x: 1 }]],
        ["contributors", [{ post: "p1", user: "u1", _position: "0", role: null }]]
      ]),
      decodeJson
    );
    expect(json.nope).toBeUndefined();
    expect(json.contributors).toEqual([{ uuid: "u1" }]);
    const strictPlan = buildSchemaPlan(models, { extraColumn: false });
    const strict = new TableMapping(
      strictPlan,
      strictPlan.tables.find(t => t.name === "app_post")!
    );
    expect(strict.fromRow({ uuid: "p1", title: "T" }, new Map(), decodeJson)).toEqual({ uuid: "p1", title: "T" });
    expect(
      posts.encode(
        1,
        table("app_post").columns.find(c => c.name === "title")!
      )
    ).toBe("1");
  });
});
