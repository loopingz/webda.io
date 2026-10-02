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
