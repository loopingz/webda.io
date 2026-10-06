import { describe, expect, it } from "vitest";
import * as WebdaQL from "@webda/ql";
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
    expect(new SQLComparisonExpression("=", "a", "x' OR 1=1 --").toString()).toBe("a = 'x'' OR 1=1 --'");
  });

  it("keeps backslashes literal (standard_conforming_strings)", () => {
    expect(new SQLComparisonExpression("=", "a", "c:\\dir").toString()).toBe("a = 'c:\\dir'");
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
      ["update", () => repo.update({ uuid: "a" }, "name", "x"), /^UPDATE items SET data=\$1/],
      ["patch", () => repo.patch("a", { name: "b" }, "name", "x"), /data \|\| \$1::jsonb/],
      ["delete", () => repo.delete("a"), /^DELETE FROM items WHERE uuid=\$1$/],
      ["conditional delete", () => repo.delete("a", "name", "x"), /^DELETE FROM items WHERE uuid=\$1 AND/],
      ["exists", () => repo.exists("a"), /^SELECT uuid FROM items/],
      ["removeAttribute", () => repo.removeAttribute("a", "name"), /data - \$1/],
      ["incrementAttributes", () => repo.incrementAttributes("a", { count: 2 } as any), /jsonb_set/],
      ["upsertItemToCollection", () => repo.upsertItemToCollection("a", "tags", { v: 1 } as any), /'\[\{"v":1\}\]'/],
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
