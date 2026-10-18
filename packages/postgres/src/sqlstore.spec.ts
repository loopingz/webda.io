import { describe, expect, it, vi } from "vitest";
import * as WebdaQL from "@webda/ql";
import { PostgresDialect } from "./dialect.js";
import { PostgresRepository, SQLClient, SQLComparisonExpression } from "./sqlstore.js";

/**
 * Translation tests: a fake SQL client captures the generated SQL, so no
 * running PostgreSQL server is needed.
 */
class FakeModel {}

/**
 * Build a repository on a fake client that records every query
 * @returns the repository and the captured queries
 */
function makeRepository(): { repo: PostgresRepository<any>; queries: string[] } {
  const queries: string[] = [];
  const client: SQLClient = {
    query: async (q: string) => {
      queries.push(q);
      return { rows: [], rowCount: 0 };
    }
  };
  return { repo: new PostgresRepository(FakeModel as any, ["uuid"], client, "items"), queries };
}

/**
 * Translate a WebdaQL query and return the generated WHERE clause
 * @param query - the WebdaQL query
 * @returns the SQL condition part (before LIMIT)
 */
async function where(query: string): Promise<string> {
  const { repo, queries } = makeRepository();
  await repo.query(query);
  return queries[0].replace(/^SELECT \* FROM items WHERE /, "").replace(/ LIMIT \d+$/, "");
}

describe("SQLComparisonExpression", () => {
  it("doubles single quotes in string literals", () => {
    expect(new SQLComparisonExpression("=", "a", "x' OR 1=1 --", new PostgresDialect()).toString()).toBe(
      "a = 'x'' OR 1=1 --'"
    );
  });

  it("keeps backslashes literal (standard_conforming_strings)", () => {
    expect(new SQLComparisonExpression("=", "a", "c:\\dir", new PostgresDialect()).toString()).toBe("a = 'c:\\dir'");
  });
});

describe("PostgresRepository query translation", () => {
  it("translates IS NULL and IS NOT NULL", async () => {
    expect(await where("name IS NULL")).toBe("data#>>'{name}' IS NULL");
    expect(await where("a.b IS NOT NULL AND c = 'x'")).toBe("data#>>'{a,b}' IS NOT NULL AND data#>>'{c}' = 'x'");
  });

  it("escapes a quote injection attempt", async () => {
    expect(await where("name = 'x'' OR 1=1 --'")).toBe("data#>>'{name}' = 'x'' OR 1=1 --'");
  });

  it("escapes quotes produced by escape()", async () => {
    expect(await where(WebdaQL.escape(["name = ", ""], ["it's"]))).toBe("data#>>'{name}' = 'it''s'");
  });

  it("escapes quotes in LIKE patterns", async () => {
    expect(await where("name LIKE 'o''brien%'")).toBe("data#>>'{name}' LIKE 'o''brien%'");
  });

  it("escapes quotes in IN values", async () => {
    expect(await where("name IN ['a''b', 'c']")).toBe("data#>>'{name}' = 'a''b' OR data#>>'{name}' = 'c'");
  });

  it("translates a TRUE filter to match everything", async () => {
    expect(await where("TRUE")).toBe("TRUE");
  });

  it("translates a FALSE filter to match nothing", async () => {
    expect(await where("FALSE")).toBe("FALSE");
  });

  it("keeps a FALSE merged inside an AND", () => {
    const { repo } = makeRepository();
    const merged = new WebdaQL.QueryValidator("name = 'a'").merge("FALSE").getExpression();
    expect(repo.duplicateExpression(merged).toString()).toBe("data#>>'{name}' = 'a' AND FALSE");
  });

  it("keeps a FALSE OR-merged into a match-all filter", () => {
    const { repo } = makeRepository();
    const merged = new WebdaQL.QueryValidator("").merge("FALSE", "OR").getExpression();
    expect(repo.duplicateExpression(merged).toString()).toBe("TRUE OR FALSE");
  });

  it("translates nested empty AND / OR and constants into SQL booleans", () => {
    const { repo } = makeRepository();
    const tree = new WebdaQL.AndExpression([
      new WebdaQL.ComparisonExpression("=", "name", "a"),
      new WebdaQL.OrExpression([]),
      new WebdaQL.AndExpression([]),
      new WebdaQL.BooleanExpression(false)
    ]);
    expect(repo.duplicateExpression(tree).toString()).toBe("data#>>'{name}' = 'a' AND TRUE AND TRUE AND FALSE");
  });

  it("translates NOW() with duration offset to numeric timestamp comparison", async () => {
    const before = Date.now();
    const sql = await where("lastUsedAt < NOW('-1h')");
    const after = Date.now();
    const match = sql.match(
      /^\(CASE WHEN jsonb_typeof\(data#>'{lastUsedAt}'\) = 'number' THEN \(data#>>'{lastUsedAt}'\)::numeric END\) < (\d+)$/
    );
    expect(match).not.toBeNull();
    const timestamp = Number(match![1]);
    expect(timestamp).toBeGreaterThanOrEqual(before - 3600000);
    expect(timestamp).toBeLessThanOrEqual(after - 3600000);
  });
});

/**
 * Every statement a repository issues must go through the table-readiness hook first, so a
 * table is never queried before it exists. The fake client answers like a table that holds
 * one row and records the order of hook and statements.
 */
describe("PostgresRepository table readiness", () => {
  class Item {
    uuid!: string;
    name?: string;
    load(data: any) {
      Object.assign(this, data);
      return this;
    }
  }

  function makeReadyRepository(rowCount = 1) {
    const events: string[] = [];
    const client: SQLClient = {
      query: async (q: string) => {
        events.push(q);
        return { rows: [{ data: { uuid: "a", name: "found" } }], rowCount };
      }
    };
    const repo = new PostgresRepository(Item as any, ["uuid"], client, "items", undefined, async () => {
      events.push("prepare");
    });
    return { repo, events };
  }

  it("prepares before get, query and iterate and maps rows to models", async () => {
    const { repo, events } = makeReadyRepository();
    const item = await repo.get("a");
    expect(item).toBeInstanceOf(Item);
    expect(item.name).toBe("found");
    expect(events).toEqual(["prepare", "SELECT data FROM items WHERE uuid=$1"]);

    events.length = 0;
    const { results } = await repo.query("name = 'found'");
    expect(results.map((r: any) => r.name)).toEqual(["found"]);
    expect(events[0]).toBe("prepare");
    expect(events[1]).toMatch(/^SELECT \* FROM items WHERE /);

    events.length = 0;
    const iterated: any[] = [];
    for await (const r of repo.iterate("name = 'found' LIMIT 100")) {
      iterated.push(r);
    }
    expect(iterated).toHaveLength(1);
    expect(events[0]).toBe("prepare");
  });

  it("prepares before every write and read statement", async () => {
    const { repo, events } = makeReadyRepository();
    const calls: Array<[string, () => Promise<any>, RegExp]> = [
      ["create", () => repo.create({ uuid: "a" }), /^INSERT INTO items/],
      ["update", () => repo.update({ uuid: "a" }, "name", "x"), /^UPDATE items SET data = CASE WHEN data \? /],
      ["patch", () => repo.patch("a", { name: "b" }, "name", "x"), /data \|\| \$1::jsonb/],
      ["delete", () => repo.delete("a"), /^DELETE FROM items WHERE uuid=\$1$/],
      ["conditional delete", () => repo.delete("a", "name", "x"), /^DELETE FROM items WHERE uuid=\$1 AND/],
      ["exists", () => repo.exists("a"), /^SELECT uuid FROM items/],
      ["removeAttribute", () => repo.removeAttribute("a", "name"), /data - \$1/],
      ["incrementAttributes", () => repo.incrementAttributes("a", { count: 2 } as any), /jsonb_set/],
      [
        "upsertItemToCollection",
        () => repo.upsertItemToCollection("a", "tags", { v: 1 } as any),
        /jsonb_build_array\(\$2::jsonb\)/
      ],
      ["deleteItemFromCollection", () => repo.deleteItemFromCollection("a", "tags", 0), /- 0/],
      ["__clean", () => repo.__clean(), /^DELETE FROM items$/]
    ];
    for (const [name, run, statement] of calls) {
      events.length = 0;
      await run();
      expect(events[0], name).toBe("prepare");
      expect(events[1], name).toMatch(statement);
    }
  });

  it("does not run the statement when the table cannot be prepared", async () => {
    const statements: string[] = [];
    const client: SQLClient = {
      query: async (q: string) => {
        statements.push(q);
        return { rows: [], rowCount: 1 };
      }
    };
    const repo = new PostgresRepository(Item as any, ["uuid"], client, "items", undefined, async () => {
      throw new Error("create failed");
    });
    await expect(repo.get("a")).rejects.toThrow("create failed");
    expect(statements).toEqual([]);
  });

  it("reports failed conditions and missing rows from the statement result", async () => {
    const { repo } = makeReadyRepository(0);
    await expect(repo.update({ uuid: "a" })).rejects.toThrow();
    await expect(repo.patch("a", {})).rejects.toThrow();
    await expect(repo.delete("a", "name", "x")).rejects.toThrow();
    await expect(repo.removeAttribute("a", "name")).rejects.toThrow();
    await expect(repo.removeAttribute("a", "name", "name", "x")).rejects.toThrow();
    await expect(repo.incrementAttributes("a", ["count"])).rejects.toThrow();
    await expect(repo.upsertItemToCollection("a", "tags", {} as any)).rejects.toThrow();
    await expect(repo.upsertItemToCollection("a", "tags", {} as any, 0, "k", "v")).rejects.toThrow();
    await expect(repo.deleteItemFromCollection("a", "tags", 0)).rejects.toThrow();
    await expect(repo.deleteItemFromCollection("a", "tags", 0, "k", "v")).rejects.toThrow();
    await expect(repo.get("a")).rejects.toThrow("Not found");
    expect(await repo.exists("a")).toBe(false);
  });
});

describe("PostgresRepository collection items with quotes (#670)", () => {
  /**
   * Build a repository on a fake client that records every statement with its values
   * @returns the repository and the captured statements
   */
  function makeCapturingRepository(): {
    repo: PostgresRepository<any>;
    statements: { q: string; values?: any[] }[];
  } {
    const statements: { q: string; values?: any[] }[] = [];
    const client: SQLClient = {
      query: async (q: string, values?: any[]) => {
        statements.push({ q, values });
        return { rows: [], rowCount: 1 };
      }
    };
    return { repo: new PostgresRepository(FakeModel as any, ["uuid"], client, "items"), statements };
  }

  const item = { name: "l'été.png", hash: "x' OR 1=1 --", mimetype: "image/png" };

  it("binds an appended item as a parameter instead of inlining it", async () => {
    const { repo, statements } = makeCapturingRepository();
    await repo.upsertItemToCollection("a", "files", item);
    const { q, values } = statements.pop()!;
    expect(q).not.toContain("l'été");
    expect(q).not.toContain("OR 1=1");
    expect(q).toContain("jsonb_build_array($2::jsonb)");
    expect(values).toEqual(["a", JSON.stringify(item)]);
  });

  it("binds a replaced item as a parameter, keeping the write condition last", async () => {
    const { repo, statements } = makeCapturingRepository();
    await repo.upsertItemToCollection("a", "files", item, 1, "hash", "it's");
    const { q, values } = statements.pop()!;
    expect(q).not.toContain("l'été");
    expect(q).toContain("'{1}', $2::jsonb");
    expect(q).toMatch(/->>'hash'=\$3$/);
    expect(values).toEqual(["a", JSON.stringify(item), "it's"]);
  });
});

/**
 * Golden check for the @webda/sql extraction: every statement the repository issues, recorded through a fake
 * client. The snapshot must stay byte-identical when PostgresRepository becomes SQLRepository + PostgresDialect.
 */
describe("PostgresRepository SQL snapshot", () => {
  class Animal {
    static Metadata = { Identifier: "Test/Animal", Subclasses: [] as any[] };
    uuid!: string;
    constructor(data?: any) {
      Object.assign(this, data);
    }
  }
  class Dog extends Animal {
    static Metadata = { Identifier: "Test/Dog", Subclasses: [] as any[] };
  }
  Animal.Metadata.Subclasses.push(Dog);

  function recorder() {
    const statements: { q: string; values?: any[] }[] = [];
    const client: SQLClient = {
      query: async (q: string, values?: any[]) => {
        statements.push({ q, values });
        return { rows: [{ data: { uuid: "a", __type: "Test/Dog" }, uuid: "a" }], rowCount: 1 };
      }
    };
    return { statements, client };
  }

  it("records every statement", async () => {
    vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00.000Z") });
    try {
      const { statements, client } = recorder();
      const animals = new PostgresRepository(
        Animal as any,
        ["uuid"],
        client,
        "animals",
        undefined,
        undefined,
        "Test/Animal"
      );
      const dogs = new PostgresRepository(Dog as any, ["uuid"], client, "animals", undefined, undefined, "Test/Animal");
      const plain = new PostgresRepository(FakeModel as any, ["uuid"], client, "items");
      await dogs.setupTable();
      await dogs.get("a");
      await dogs.exists("a");
      await dogs.create(new Dog({ uuid: "a", n: 1 }));
      await animals.update({ uuid: "a", n: 2 });
      await animals.update(new Dog({ uuid: "a", n: 2 }), "n", 1);
      await animals.patch("a", { n: 3, tags: ["x"] });
      await animals.patch("a", { n: 3, __type: "Test/Dog" }, "n", 2);
      await dogs.delete("a");
      await dogs.delete("a", "n", 3);
      await dogs.removeAttribute("a", "n");
      await dogs.removeAttribute("a", "n", "n", 3);
      await dogs.incrementAttributes("a", { count: 2, other: -1 } as any);
      await dogs.incrementAttributes("a", ["count"] as any);
      await dogs.upsertItemToCollection("a", "files" as any, { name: "l'été.png" } as any);
      await dogs.upsertItemToCollection("a", "files" as any, { name: "x" } as any, 1, "hash", "h2");
      await dogs.deleteItemFromCollection("a", "files" as any, 0);
      await dogs.deleteItemFromCollection("a", "files" as any, 0, "hash", "h2");
      await dogs.backfillTypes();
      await animals.backfillTypes();
      for (const query of [
        "",
        "n < 2",
        "n = 1",
        "n != 1",
        "n = 'abc'",
        "b = TRUE",
        "b != TRUE",
        "s = 'x'",
        "s != 'x'",
        "s LIKE 'a%'",
        "s IS NULL",
        "n IS NOT NULL",
        "tags CONTAINS 'x'",
        "n IN [1, 5]",
        "n < 2 OR b = TRUE",
        "a.b = 'x' ORDER BY a.b DESC, n ASC LIMIT 5 OFFSET '10'",
        "name = 'x'' OR 1=1 --'"
      ]) {
        await dogs.query(query);
        await plain.query(query);
      }
      await dogs.deleteMany("DELETE WHERE n < 2 LIMIT 2");
      await plain.deleteMany("DELETE");
      await dogs.updateMany(
        "UPDATE SET name = 'even', profile.level = 3, profile.deep.flag = TRUE, list.1.v = 3 WHERE n = 1 LIMIT 1"
      );
      await plain.updateMany("UPDATE SET tags.0 = 'n'");
      await dogs.aggregate({ metrics: { n: { count: "*" } } } as any);
      await dogs.aggregate({
        groupBy: ["team.name"],
        metrics: {
          n: { count: "*" },
          d: { countDistinct: "kind" },
          s: { sum: "points" },
          a: { avg: "points" },
          mn: { min: "points" },
          mx: { max: "points" }
        },
        orderBy: [
          { key: "mx", direction: "DESC" },
          { key: "mn", direction: "ASC" }
        ],
        limit: 3
      } as any);
      await plain.aggregate({ filter: "n > 1", groupBy: ["kind"], metrics: { n: { count: "*" } } } as any);
      await dogs.__clean();
      expect(statements).toMatchSnapshot();
    } finally {
      vi.useRealTimers();
    }
  });
});
