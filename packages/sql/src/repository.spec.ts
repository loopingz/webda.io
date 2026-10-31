import { describe, expect, it } from "vitest";
import { StoreNotFoundError, UpdateConditionFailError } from "@webda/core";
import type { SQLClient, SQLDialect } from "./dialect.js";
import { sqlString } from "./dialect.js";
import { SQLRepository } from "./repository.js";

/** A dialect that tags every fragment so the repository assembly can be read in the SQL */
class TagDialect implements SQLDialect {
  binaryCollation = "COLLATE X";
  placeholder = (i: number) => `?${i}`;
  jsonParam = (i: number) => `J(?${i})`;
  jsonText = (p: string[]) => `T(${p.join("/")})`;
  jsonValue = (p: string[]) => `V(${p.join("/")})`;
  jsonValueOrNull = (p: string[]) => `N(${p.join("/")})`;
  keyText = (k: string) => `K(${k})`;
  isType = (j: string, t: string) => `${j} IS ${t}`;
  asNumber = (j: string) => `NUM(${j})`;
  asString = (j: string) => `STR(${j})`;
  typedAttribute = (_t: string, j: string, type: string) => `TYPED(${j},${type})`;
  distinctFrom = (l: string, r: string) => `${l} <> ${r}`;
  contains = (j: string, v: any) => `${j} HAS ${JSON.stringify(v)}`;
  like = (t: string, p: string) => `${t} LIKE ${sqlString(p)}`;
  createTable = (t: string) => `CREATE ${t}`;
  isUniqueViolation = (err: any) => err?.code === "DUP";
  hasStoredType = () => "HASTYPE";
  keptType = (i: number) => `KEPT(?${i})`;
  withStoredType = (j: string, t: string) => `TYPED(${j}, ${t})`;
  shallowMerge = (j: string, patch: any, args: any[]) => {
    args.push(JSON.stringify(patch));
    return `MERGE(${j}, ?${args.length})`;
  };
  removeKey = (a: string, args: any[]) => {
    args.push(a);
    return `REMOVE(?${args.length})`;
  };
  increment = (e: any[], d: string, args: any[]) => {
    e.forEach(x => args.push(x.value));
    return `INC(${e.map(x => x.property).join(",")}, ${d})`;
  };
  setCollectionItem = (a: string, i: number, idx: number | undefined, d: string) =>
    `SETITEM(${a}, ?${i}, ${idx}, ${d})`;
  removeCollectionItem = (a: string, idx: number, d: string) => `DELITEM(${a}, ${idx}, ${d})`;
  collectionItemCondition = (a: string, idx: any, f: string, p: number) => `ITEM(${a}, ${idx}, ${f}) = ?${p}`;
  bulkAssign = (_t: string, as: any[], args: any[]) => {
    as.forEach(x => args.push(JSON.stringify(x.value)));
    return `ASSIGN(${as.map(x => x.field).join(",")})`;
  };
  backfillTypes = (t: string) => `BACKFILL ${t}`;
  countStoredTypes = (t: string) => `COUNT ${t}`;
  isObjectRow = () => "ISOBJ";
  decode = (v: any) => (typeof v === "string" ? JSON.parse(v) : v);
}

class Item {
  uuid!: string;
  name?: string;
  load(data: any) {
    Object.assign(this, data);
    return this;
  }
}

function make(rowCount = 1, data: any = JSON.stringify({ uuid: "a", name: "found" })) {
  const events: { q: string; values?: any[] }[] = [];
  const client: SQLClient = {
    query: async (q: string, values?: any[]) => {
      events.push({ q, values });
      return { rows: [{ data, uuid: "a" }], rowCount };
    }
  };
  const repo = new SQLRepository(
    Item as any,
    ["uuid"],
    client,
    "items",
    undefined,
    async () => {
      events.push({ q: "prepare" });
    },
    undefined,
    new TagDialect()
  );
  return { repo, events, sql: () => events.map(e => e.q), last: () => events[events.length - 1] };
}

describe("SQLRepository", () => {
  it("decodes rows through the dialect and prepares before every statement", async () => {
    const { repo, sql } = make();
    const item = await repo.get("a");
    expect(item).toBeInstanceOf(Item);
    expect(item.name).toBe("found");
    expect(sql()).toEqual(["prepare", "SELECT data FROM items WHERE uuid=?1"]);
  });

  it("assembles writes from dialect fragments", async () => {
    const { repo, last } = make();
    await repo.update({ uuid: "a", name: "b" });
    expect(last().q).toBe(
      "UPDATE items SET data = CASE WHEN HASTYPE THEN TYPED(J(?1), KEPT(?3)) ELSE J(?1) END WHERE uuid=?2"
    );
    await repo.patch("a", { name: "b" }, "name", "x");
    expect(last().q).toBe(
      "UPDATE items SET data = CASE WHEN HASTYPE THEN TYPED((MERGE(data, ?1)), KEPT(?3)) ELSE MERGE(data, ?1) END WHERE uuid=?2 AND K(name)=?4"
    );
    expect(last().values).toEqual([JSON.stringify({ name: "b" }), "a", "{}", "x"]);
    // An absent field is matched with IS NULL, never bound: `= NULL` is never true
    await repo.patch("a", { usedAt: 1 } as any, "usedAt" as any, undefined);
    expect(last().q).toMatch(/ WHERE uuid=\?2 AND K\(usedAt\) IS NULL$/);
    expect(last().values).toEqual([JSON.stringify({ usedAt: 1 }), "a", "{}"]);
    await repo.delete("a", "name", null);
    expect(last().q).toMatch(/ AND K\(name\) IS NULL$/);
    await repo.removeAttribute("a", "name" as any);
    expect(last().q).toBe("UPDATE items SET data = REMOVE(?1) WHERE uuid=?2");
    await repo.incrementAttributes("a", { count: 2 } as any);
    expect(last().q).toMatch(/^UPDATE items SET data = INC\(count, \d{4}-.*\) WHERE uuid=\?1$/);
    expect(last().values).toEqual(["a", 2]);
    await repo.upsertItemToCollection("a", "files" as any, { v: 1 } as any, 1, "k", "v");
    expect(last().q).toMatch(
      /^UPDATE items SET data = SETITEM\(files, \?2, 1, .*\) WHERE uuid=\?1 AND ITEM\(files, 1, k\) = \?3$/
    );
    await repo.deleteItemFromCollection("a", "files" as any, 0);
    expect(last().q).toMatch(/^UPDATE items SET data = DELITEM\(files, 0, .*\) WHERE uuid=\?1$/);
    await repo.updateMany("UPDATE SET name = 'x', a.b = 1 WHERE name = 'y'");
    expect(last().q).toBe("UPDATE items SET data = ASSIGN(name,a.b) WHERE (T(name) = 'y')");
    expect(last().values).toEqual(['"x"', "1"]);
    await repo.backfillTypes();
  });

  it("maps a unique violation to Already exists", async () => {
    const client: SQLClient = {
      query: async () => {
        throw Object.assign(new Error("dup"), { code: "DUP" });
      }
    };
    const repo = new SQLRepository(
      Item as any,
      ["uuid"],
      client,
      "items",
      undefined,
      undefined,
      undefined,
      new TagDialect()
    );
    await expect(repo.create({ uuid: "x" })).rejects.toThrow("Already exists: x");
  });

  it("translates comparisons through the dialect", async () => {
    const { repo, sql } = make();
    await repo.query("n < 2 AND s != 'x' AND tags CONTAINS 'x' AND s LIKE 'a%' AND b IS NULL");
    expect(sql()[1]).toBe(
      "SELECT * FROM items WHERE TYPED(V(n),number) < 2 AND T(s) <> 'x' AND V(tags) HAS \"x\" AND T(s) LIKE 'a%' AND T(b) IS NULL LIMIT 1000"
    );
  });

  it("refuses an invalid LIMIT on a bulk statement", async () => {
    const { repo } = make();
    const WebdaQL = await import("@webda/ql");
    const q: any = WebdaQL.parse("DELETE LIMIT 1");
    q.limit = "1; DROP TABLE items";
    await expect(repo.deleteMany(q)).rejects.toThrow();
  });

  it("rejects unsafe attribute paths before building SQL", () => {
    const { repo, events } = make();
    expect(() => repo.mapExpressionAttribute(["name'); DROP TABLE items; --"])).toThrow("Invalid attribute path");
    expect(events).toEqual([]);
  });

  it("reports missing rows and failed write conditions", async () => {
    const { repo } = make(0);
    await expect(repo.update({ uuid: "a", name: "b" })).rejects.toThrow(UpdateConditionFailError);
    await expect(repo.patch("a", { name: "b" })).rejects.toThrow(UpdateConditionFailError);
    await expect(repo.delete("a", "name", "old")).rejects.toThrow(UpdateConditionFailError);
    await expect(repo.removeAttribute("a", "name", "name", "old")).rejects.toThrow(UpdateConditionFailError);
    await expect(repo.incrementAttributes("a", { count: 1 } as any)).rejects.toThrow(StoreNotFoundError);
    await expect(repo.upsertItemToCollection("a", "files" as any, { v: 1 } as any)).rejects.toThrow(StoreNotFoundError);
    await expect(repo.deleteItemFromCollection("a", "files" as any, 0)).rejects.toThrow(StoreNotFoundError);
  });

  it("refuses statements while the client is disconnected", async () => {
    const repo = new SQLRepository(
      Item as any,
      ["uuid"],
      () => undefined,
      "items",
      undefined,
      undefined,
      undefined,
      new TagDialect()
    );
    await expect(repo.get("a")).rejects.toThrow("No SQL client for table items");
  });

  it("hooksKeepTheJsonStatements: field, type and key hooks drive the shared statements", async () => {
    const WebdaQL = await import("@webda/ql");
    const { repo } = make();
    const statement = (r: any, q: string) => r.getStatementCondition(WebdaQL.parse(q));
    expect(statement(repo, "DELETE LIMIT 1")).toContain("uuid IN (SELECT uuid FROM items WHERE");
    expect((repo as any).getClassCondition()).toBeUndefined();
    class Composite extends SQLRepository<any> {
      protected keyColumns(): string[] {
        return ["a", "b"];
      }
      protected fieldText(field: string): string {
        return `F(${field})`;
      }
      protected typeText(): string {
        return "TYPE";
      }
    }
    const composite = new Composite(
      Item as any,
      ["a", "b"],
      { query: async () => ({ rows: [], rowCount: 0 }) },
      "items",
      undefined,
      undefined,
      undefined,
      new TagDialect()
    );
    expect(statement(composite, "DELETE LIMIT 1")).toContain("(a, b) IN (SELECT a, b FROM items WHERE");
    const params: any[] = [];
    expect(composite.getQueryCondition("x", "name", params)).toBe(" AND F(name)=?1");
    expect(composite.getQueryCondition(undefined, "name", params)).toBe(" AND F(name) IS NULL");
    class Typed extends Composite {
      static Metadata = { Identifier: "Test/Typed", Subclasses: [] };
      load(data: any) {
        Object.assign(this, data);
        return this;
      }
    }
    const typed = new Composite(
      Typed as any,
      ["uuid"],
      { query: async () => ({ rows: [], rowCount: 0 }) },
      "items",
      undefined,
      undefined,
      "Test/Typed",
      new TagDialect()
    );
    expect((typed as any).getClassCondition()).toContain("lower(TYPE) IN ('test/typed')");
    expect((typed as any).getClassCondition()).toContain("TYPE IS NULL");
  });

  it("iterates query results and cleans the table", async () => {
    const { repo, last } = make();
    const items = [];
    for await (const item of repo.iterate("name = 'found'")) items.push(item);
    expect(items).toHaveLength(1);
    expect(items[0]).toBeInstanceOf(Item);
    await repo.__clean();
    expect(last().q).toBe("DELETE FROM items");
  });
});
