import { toAggregationQuery } from "@webda/ql";
import { SQLRepository } from "@webda/sql";
import type { SQLClient } from "@webda/sql";
import { describe, expect, it } from "vitest";
import { globPattern, jsonPath, SQLiteDialect } from "./dialect.js";

class FakeModel {}

function recorder() {
  const statements: { q: string; values?: any[] }[] = [];
  const client: SQLClient = {
    query: async (q: string, values?: any[]) => {
      statements.push({ q, values });
      return { rows: [], rowCount: 1 };
    }
  };
  const repo = new SQLRepository(
    FakeModel as any,
    ["uuid"],
    client,
    "items",
    undefined,
    undefined,
    undefined,
    new SQLiteDialect()
  );
  return { repo, statements, last: () => statements[statements.length - 1] };
}

async function where(query: string): Promise<string> {
  const { repo, statements } = recorder();
  await repo.query(query);
  return statements[0].q.replace(/^SELECT \* FROM items WHERE /, "").replace(/ LIMIT \d+$/, "");
}

const T = (p: string) =>
  `(CASE json_type(data, '${p}') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST(data ->> '${p}' AS TEXT) END)`;
const NUM = (p: string) =>
  `(CASE WHEN json_type(data -> '${p}') IN ('integer', 'real') THEN data -> '${p}' ->> '$' END)`;

describe("helpers", () => {
  it("builds JSON paths with array indexes for numeric segments", () => {
    expect(jsonPath(["a", "b"])).toBe("$.a.b");
    expect(jsonPath(["tags", "0"])).toBe("$.tags[0]");
    expect(jsonPath(["list", "1", "v"])).toBe("$.list[1].v");
  });

  it("translates LIKE patterns to GLOB", () => {
    expect(globPattern("a%")).toBe("a*");
    expect(globPattern("a_c")).toBe("a?c");
    expect(globPattern("100\\%")).toBe("100%");
    expect(globPattern("x\\_y")).toBe("x_y");
    expect(globPattern("*?[")).toBe("[*][?][[]");
  });
});

describe("SQLiteDialect query translation", () => {
  it("compares strings on the text of the value", async () => {
    expect(await where("s = 'x'")).toBe(`${T("$.s")} = 'x'`);
    expect(await where("a.b IS NOT NULL")).toBe(`${T("$.a.b")} IS NOT NULL`);
  });

  it("types number and boolean comparisons", async () => {
    expect(await where("n < 2")).toBe(`${NUM("$.n")} < 2`);
    expect(await where("b = TRUE")).toBe(
      `(CASE WHEN json_type(data -> '$.b') IN ('true', 'false') THEN data -> '$.b' ->> '$' END) = TRUE`
    );
  });

  it("uses IS NOT for !=", async () => {
    expect(await where("s != 'x'")).toBe(`${T("$.s")} IS NOT 'x'`);
  });

  it("translates CONTAINS with json_each", async () => {
    expect(await where("tags CONTAINS 'x'")).toBe(
      `(json_type(data -> '$.tags') = 'array' AND EXISTS (SELECT 1 FROM json_each(data -> '$.tags') WHERE value = 'x' AND type = 'text'))`
    );
    const dialect = new SQLiteDialect();
    expect(dialect.contains("x", 1)).toBe(
      `(json_type(x) = 'array' AND EXISTS (SELECT 1 FROM json_each(x) WHERE value = 1 AND type IN ('integer', 'real')))`
    );
    expect(dialect.contains("x", true)).toBe(
      `(json_type(x) = 'array' AND EXISTS (SELECT 1 FROM json_each(x) WHERE value = 1 AND type = 'true'))`
    );
  });

  it("translates LIKE to a case-sensitive GLOB", async () => {
    expect(await where("s LIKE 'o''brien%'")).toBe(`${T("$.s")} GLOB 'o''brien*'`);
  });

  it("escapes quotes in values", async () => {
    expect(await where("name = 'x'' OR 1=1 --'")).toBe(`${T("$.name")} = 'x'' OR 1=1 --'`);
  });

  it("uses ?n placeholders", async () => {
    const { repo, last } = recorder();
    await repo.get("a").catch(() => undefined);
    expect(last().q).toBe("SELECT data FROM items WHERE uuid=?1");
    await repo.create({ uuid: "a" });
    expect(last().q).toBe("INSERT INTO items(uuid,data) VALUES(?1, ?2)");
  });
});

describe("SQLiteDialect writes", () => {
  it("patches top-level keys with json_set and keeps the stored type", async () => {
    const { repo, last } = recorder();
    await repo.patch("a", { n: 3, tags: ["x"], gone: null, skipped: undefined });
    const merge = "json_set(data, '$.n', json(?1), '$.tags', json(?2), '$.gone', json(?3))";
    expect(last().q).toBe(
      `UPDATE items SET data = CASE WHEN json_type(data, '$.__type') IS NOT NULL THEN json_set((${merge}), '$.__type', COALESCE(json(?5) ->> lower(data ->> '$.__type'), data ->> '$.__type')) ELSE ${merge} END WHERE uuid=?4`
    );
    expect(last().values).toEqual(["3", '["x"]', "null", "a", "{}"]);
  });

  it("emptyPatchKeepsData", async () => {
    const { repo, last } = recorder();
    await repo.patch("a", { __type: "X" } as any);
    expect(last().q).toBe("UPDATE items SET data = json_set(data, '$.__type', json(?1)) WHERE uuid=?2");
    await repo.patch("a", {});
    expect(last().q).toBe(
      "UPDATE items SET data = CASE WHEN json_type(data, '$.__type') IS NOT NULL THEN json_set((data), '$.__type', COALESCE(json(?2) ->> lower(data ->> '$.__type'), data ->> '$.__type')) ELSE data END WHERE uuid=?1"
    );
  });

  it("rejectsInvalidKeys", async () => {
    const { repo } = recorder();
    await expect(repo.patch("a", { "a-b": 1 })).rejects.toThrow(/Invalid attribute/);
    await expect(repo.removeAttribute("a", "a.b" as any)).rejects.toThrow(/Invalid attribute/);
    await expect(repo.upsertItemToCollection("a", "fi les" as any, {} as any)).rejects.toThrow(/Invalid attribute/);
    await expect(repo.deleteItemFromCollection("a", "files" as any, -1)).rejects.toThrow(/Invalid index/);
  });

  it("removes, increments and edits collections with JSON1 functions", async () => {
    const { repo, last } = recorder();
    await repo.removeAttribute("a", "n" as any);
    expect(last().q).toBe("UPDATE items SET data = json_remove(data, '$.' || ?1) WHERE uuid=?2");
    expect(last().values).toEqual(["n", "a"]);
    await repo.incrementAttributes("a", { count: 2, other: -1 } as any);
    expect(last().q).toMatch(
      /^UPDATE items SET data = json_set\(data, '\$\.count', COALESCE\(data ->> '\$\.count', 0\) \+ \?2, '\$\.other', COALESCE\(data ->> '\$\.other', 0\) \+ \?3, '\$\._lastUpdate', '\d{4}-[^']+'\) WHERE uuid=\?1$/
    );
    expect(last().values).toEqual(["a", 2, -1]);
    await repo.upsertItemToCollection("a", "files" as any, { name: "l'été" } as any);
    expect(last().q).toMatch(
      /^UPDATE items SET data = json_set\(data, '\$\.files', json_insert\(COALESCE\(data -> '\$\.files', '\[\]'\), '\$\[#\]', json\(\?2\)\), '\$\._lastUpdate', '[^']+'\) WHERE uuid=\?1$/
    );
    expect(last().q).not.toContain("l'été");
    await repo.upsertItemToCollection("a", "files" as any, { name: "x" } as any, 1, "hash", "h2");
    expect(last().q).toMatch(
      /json_set\(COALESCE\(data -> '\$\.files', '\[\]'\), '\$\[1\]', json\(\?2\)\).* AND data ->> '\$\.files\[1\]\.hash' = \?3$/
    );
    expect(last().values).toEqual(["a", JSON.stringify({ name: "x" }), "h2"]);
    await repo.deleteItemFromCollection("a", "files" as any, 0);
    expect(last().q).toMatch(/json_remove\(COALESCE\(data -> '\$\.files', '\[\]'\), '\$\[0\]'\)/);
    await repo.deleteItemFromCollection("a", "files" as any, 0, "hash", "h2");
    expect(last().q).toMatch(/ AND data ->> '\$\.files\[0\]\.hash' = \?2$/);
  });

  it("applies bulk assignments with one json_set, creating parents and indexing arrays", async () => {
    const { repo, last } = recorder();
    await repo.updateMany("UPDATE SET name = 'even', profile.level = 3, list.1.v = 3 WHERE n = 1 LIMIT 1");
    const ensure = (p: string) =>
      `'${p}', json(COALESCE(CASE WHEN json_type(data, '${p}') IN ('object', 'array') THEN data -> '${p}' END, '{}'))`;
    expect(last().q).toBe(
      `UPDATE items SET data = json_set(data, '$.name', json(?1), ${ensure("$.profile")}, '$.profile.level', json(?2), ${ensure("$.list")}, ${ensure("$.list[1]")}, '$.list[1].v', json(?3)) WHERE ` +
        `(${NUM("$.n")} = 1) AND uuid IN (SELECT uuid FROM items WHERE (${NUM("$.n")} = 1) LIMIT 1)`
    );
    expect(last().values).toEqual(['"even"', "3", "3"]);
  });

  it("builds aggregations on JSON1", () => {
    const { repo } = recorder();
    const { sql } = (repo as any).buildAggregationSQL(
      toAggregationQuery({ groupBy: ["team.name"], metrics: { n: { count: "*" } }, limit: 3 } as any)
    );
    const x = `NULLIF(data -> '$.team.name', 'null')`;
    expect(sql).toBe(
      `SELECT ${x} AS "g0", COUNT(*) AS "m0" FROM items WHERE TRUE GROUP BY 1 ORDER BY ` +
        `CASE WHEN ${x} IS NULL THEN NULL WHEN json_type(${x}) IN ('integer', 'real') THEN 1 WHEN json_type(${x}) = 'text' THEN 2 ELSE 3 END ASC NULLS FIRST, ` +
        `CASE WHEN json_type(${x}) IN ('integer', 'real') THEN (${x} ->> '$') END ASC NULLS FIRST, ` +
        `(CASE WHEN json_type(${x}) = 'text' THEN (${x} ->> '$') END) COLLATE BINARY ASC NULLS FIRST, ` +
        `${x} ASC NULLS FIRST LIMIT 3`
    );
  });

  it("maps a primary key violation to Already exists", async () => {
    const client: SQLClient = {
      query: async () => {
        throw Object.assign(new Error("UNIQUE constraint failed: items.uuid"), {
          code: "ERR_SQLITE_ERROR",
          errcode: 1555
        });
      }
    };
    const repo = new SQLRepository(
      FakeModel as any,
      ["uuid"],
      client,
      "items",
      undefined,
      undefined,
      undefined,
      new SQLiteDialect()
    );
    await expect(repo.create({ uuid: "dup" })).rejects.toThrow("Already exists: dup");
  });
});
