import { buildSchemaPlan } from "@webda/sql-schema";
import type { SchemaChange, SchemaModelMetadata } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import type { RelationalDialect, SchemaStep } from "./dialect.js";
import { RelationalSchemaManager } from "./manager.js";
import { SchemaVersion } from "./schemaversion.model.js";
import { SchemaDriftError } from "./sync.js";
import { SchemaIncompatibleError, SchemaRegistryError, describeChange, recipeFor } from "./versions.js";

const post: SchemaModelMetadata = {
  Identifier: "App/Post",
  PrimaryKey: ["uuid"],
  Relations: { links: [{ attribute: "author", model: "App/User", type: "LINK" }] },
  Schemas: {
    Stored: {
      type: "object",
      properties: { uuid: { type: "string" }, title: { type: "string" }, author: { type: "string" } },
      required: ["uuid", "title"]
    }
  }
};
const user: SchemaModelMetadata = {
  Identifier: "App/User",
  PrimaryKey: ["uuid"],
  Schemas: { Stored: { type: "object", properties: { uuid: { type: "string" } } } }
};

/**
 * A recording client
 * @param rowCounts - the row counts the statements return, in order (the last one repeats)
 * @returns the client and its statements
 */
function client(rowCounts: number[] = [0]) {
  const statements: string[] = [];
  return {
    statements,
    query: async (q: string) => {
      statements.push(q);
      const rowCount = rowCounts.length > 1 ? rowCounts.shift()! : rowCounts[0];
      return { rows: [{ n: rowCount }], rowCount };
    }
  };
}

/**
 * @param dialect - the dialect overrides
 * @param logs - where the logs go
 * @returns a manager with the post plan built
 */
function manager(dialect: Partial<RelationalDialect>, logs: string[] = []): RelationalSchemaManager {
  const m = new RelationalSchemaManager({
    name: "m",
    dialect: {
      inlineForeignKeys: false,
      quote: (id: string) => `"${id}"`,
      renderStep: (step: SchemaStep) => [`STEP ${step.kind}`],
      describeSchema: async () => ({ tables: {} }),
      schemaLock: () => "LOCK",
      ...dialect
    } as unknown as RelationalDialect,
    layout: {},
    log: (l, msg) => logs.push(`${l} ${msg}`)
  });
  m.build([post, user], []);
  return m;
}

/**
 * The post table exists with its uuid and title, the user table does not
 */
const partial = async () => ({
  tables: {
    app_post: {
      columns: {
        uuid: { type: { kind: "text" as const }, nullable: false, raw: "text" },
        title: { type: { kind: "text" as const }, nullable: true, raw: "text" },
        legacy: { type: { kind: "text" as const }, nullable: true, raw: "text" }
      },
      indexes: new Set<string>(),
      constraints: new Set<string>()
    }
  }
});

describe("RelationalSchemaManager with the version hooks", () => {
  it("runs check and register under the lock, online steps after the transaction, and drops a failed one", async () => {
    const logs: string[] = [];
    const m = manager(
      {
        describeSchema: partial,
        renderOnlineStep: (step: SchemaStep) =>
          step.kind === "createIndex"
            ? { inside: [], after: [`CONCURRENTLY ${step.index.name}`], onFailure: [`DROP ${step.index.name}`] }
            : { inside: [`NOT VALID ${step.kind}`], after: [`VALIDATE ${step.kind}`] }
      },
      logs
    );
    const c = client();
    const events: string[] = [];
    const steps = await m.sync(c, "alter", {
      check: async () => (events.push("check"), []),
      register: async () => void events.push("register")
    });
    const kinds = steps.map(s => s.kind);
    expect(kinds[0]).toBe("createTable");
    expect(kinds.filter(k => k === "createIndex").length).toBeGreaterThan(0);
    expect(kinds.filter(k => k === "addForeignKey")).toEqual(["addForeignKey"]);
    const commit = c.statements.indexOf("COMMIT");
    expect(c.statements.slice(0, 3)).toEqual(["BEGIN", "LOCK", "STEP createTable"]);
    expect(c.statements.slice(3, commit)).toEqual([
      ...steps
        .filter(s => s.kind === "addColumn" || (s.kind === "createIndex" && !s.online))
        .map(s => `STEP ${s.kind}`),
      "NOT VALID addForeignKey"
    ]);
    const after = c.statements.slice(commit + 1);
    expect(after.filter(q => q.startsWith("CONCURRENTLY"))).toHaveLength(
      steps.filter(s => s.kind === "createIndex" && s.online).length
    );
    expect(after[after.length - 1]).toBe("VALIDATE addForeignKey");
    expect(events).toEqual(["check", "register"]);
    expect(logs.filter(l => l.includes("(online)"))).toHaveLength(after.length);
    // The concurrent build fails: the index is dropped and left out
    const failing = client();
    failing.query = async (q: string) => {
      failing.statements.push(q);
      if (q.startsWith("CONCURRENTLY")) {
        throw new Error("duplicate key");
      }
      return { rows: [], rowCount: 0 };
    };
    logs.length = 0;
    await m.sync(failing, "alter", { live: [] });
    expect(failing.statements.filter(q => q.startsWith("DROP"))).toEqual(
      failing.statements.filter(q => q.startsWith("CONCURRENTLY")).map(q => q.replace("CONCURRENTLY", "DROP"))
    );
    expect(failing.statements[failing.statements.length - 1]).toBe("VALIDATE addForeignKey");
    expect(
      logs.some(l => l.includes("create index idx_app_post_author failed online and is left out: duplicate key"))
    ).toBe(true);
  });

  it("runs online steps inside the transaction when the dialect has no online rendering", async () => {
    const m = manager({ describeSchema: partial });
    const c = client();
    const steps = await m.sync(c, "alter");
    expect(c.statements).toEqual(["BEGIN", "LOCK", ...steps.map(s => `STEP ${s.kind}`), "COMMIT"]);
    expect(steps.some(s => s.kind === "createIndex" && s.online)).toBe(true);
  });

  it("checks and registers without DDL in none and validate modes, live columns are not drift", async () => {
    const logs: string[] = [];
    const m = manager({ describeSchema: partial }, logs);
    const events: string[] = [];
    const hooks = {
      check: async () => (events.push("check"), [{ version: "1", plan: buildSchemaPlan([post, user]) }]),
      register: async () => void events.push("register")
    };
    expect(await m.sync(client(), "none", hooks)).toEqual([]);
    await expect(m.sync(client(), "validate", hooks)).rejects.toThrow(SchemaDriftError);
    expect(events).toEqual(["check", "register", "check"]);
    // The legacy column belongs to a live version: not drift; a column of nobody is
    const legacy = buildSchemaPlan([
      {
        ...post,
        Schemas: {
          Stored: {
            ...post.Schemas.Stored,
            properties: { ...post.Schemas.Stored.properties, legacy: { type: "string" } }
          }
        }
      },
      user
    ]);
    const c = client();
    await m.sync(c, "alter", { live: [{ version: "0", plan: legacy }] });
    expect(logs.some(l => l.includes("legacy"))).toBe(false);
    await m.sync(client(), "alter", { live: [] });
    expect(logs.some(l => l.includes("app_post.legacy is not in the plan"))).toBe(true);
    const diff = await m.diff(client(), [{ version: "0", plan: legacy }]);
    expect(diff.drift).toEqual([]);
  });

  it("plans and applies the contract, skipping a NOT NULL on null rows and unsupported steps", async () => {
    const logs: string[] = [];
    const db = async () => ({
      tables: {
        app_post: {
          columns: {
            uuid: { type: { kind: "text" as const }, nullable: false, raw: "text" },
            title: { type: { kind: "text" as const }, nullable: true, raw: "text" },
            author: { type: { kind: "text" as const }, nullable: true, raw: "text" },
            legacy: { type: { kind: "text" as const }, nullable: true, raw: "text" }
          },
          indexes: new Set<string>(),
          constraints: new Set(["fk"]),
          unvalidated: new Set(["fk"])
        },
        app_old: { columns: {}, indexes: new Set<string>(), constraints: new Set<string>() }
      }
    });
    const retired = buildSchemaPlan([
      {
        ...post,
        Schemas: {
          Stored: {
            ...post.Schemas.Stored,
            properties: { ...post.Schemas.Stored.properties, legacy: { type: "string" } }
          }
        }
      },
      user,
      {
        Identifier: "App/Old",
        PrimaryKey: ["uuid"],
        Schemas: { Stored: { type: "object", properties: { uuid: { type: "string" } } } }
      }
    ]);
    const unsupported = manager({ describeSchema: db }, logs);
    const live = [{ version: "2", plan: unsupported.plan! }];
    const steps = await unsupported.contract(client(), live, [retired]);
    expect(steps.map(s => [s.step.kind, s.statements])).toEqual([
      ["dropColumn", []],
      ["dropTable", []],
      ["setNotNull", []],
      ["validateForeignKey", []]
    ]);
    expect(await unsupported.applyContract(client(), steps)).toEqual([]);
    const m = manager({ describeSchema: db, renderContractStep: step => [`CONTRACT ${step.kind}`] }, logs);
    const rendered = await m.contract(client(), live, [retired]);
    // One null row: the NOT NULL is skipped
    const c = client([1]);
    const applied = await m.applyContract(c, rendered);
    expect(applied.map(s => s.kind)).toEqual(["dropColumn", "dropTable", "validateForeignKey"]);
    expect(c.statements).toEqual([
      "BEGIN",
      "LOCK",
      "CONTRACT dropColumn",
      "CONTRACT dropTable",
      'SELECT COUNT(*) AS n FROM "app_post" WHERE "title" IS NULL',
      "COMMIT",
      "CONTRACT validateForeignKey"
    ]);
    expect(logs.some(l => l.includes("set not null app_post.title skipped: 1 null row(s)"))).toBe(true);
    const all = await m.applyContract(client([0]), rendered);
    expect(all.map(s => s.kind)).toEqual(["dropColumn", "dropTable", "setNotNull", "validateForeignKey"]);
  });

  it("backfills by batches until a short batch", async () => {
    const m = manager({});
    const c = client([2, 2, 1]);
    expect(await m.backfill(c, "app_post", "title", "author", 2)).toBe(5);
    expect(c.statements).toHaveLength(3);
    expect(c.statements[0]).toBe(
      'UPDATE "app_post" SET "author" = "title" WHERE ("uuid") IN (SELECT "uuid" FROM "app_post" WHERE "author" IS NULL AND "title" IS NOT NULL LIMIT 2)'
    );
    expect(await m.backfill(client([0]), "app_post", "title", "author", 0)).toBe(0);
    await expect(m.backfill(client(), "nope", "title", "author")).rejects.toThrow("Table nope is not in the plan of m");
    await expect(m.backfill(client(), "app_post", "nope", "author")).rejects.toThrow("Column app_post.nope");
  });
});

describe("SchemaIncompatibleError and SchemaVersion", () => {
  it("lists the changes with their recipe", () => {
    const changes: SchemaChange[] = [
      { category: "BLOCK", code: "TYPE_CHANGED", version: "1.0.0", table: "t", column: "c", message: "type" },
      {
        category: "BLOCK",
        code: "RELATION_KIND_CHANGED",
        version: "2.0.0",
        model: "M",
        attribute: "a",
        message: "kind"
      },
      { category: "BLOCK", code: "MODEL_ADDED", version: "2.0.0", model: "M", message: "no recipe" }
    ];
    const err = new SchemaIncompatibleError("s", changes);
    expect(err.getResponseCode()).toBe(409);
    expect(err.code).toBe("SCHEMA_INCOMPATIBLE_ERROR");
    expect(err.message).toContain("incompatible with live versions 1.0.0, 2.0.0");
    expect(err.message).toContain("[BLOCK] TYPE_CHANGED t.c (live 1.0.0): type\n    recipe: add a new field");
    expect(err.message).toContain(
      "[BLOCK] RELATION_KIND_CHANGED M (live 2.0.0): kind\n    recipe: declare a new attribute"
    );
    expect(err.message).toContain("[BLOCK] MODEL_ADDED M (live 2.0.0): no recipe\n");
    expect(recipeFor(changes[2])).toBeUndefined();
    expect(describeChange({ ...changes[0], category: "WARN", forced: true })).toBe(
      "[WARN forced] TYPE_CHANGED t.c (live 1.0.0): type"
    );
    const registry = new SchemaRegistryError("s", new Error("down"));
    expect(registry.code).toBe("SCHEMA_REGISTRY_UNAVAILABLE");
    expect(registry.message).toContain("down");
    expect((registry.cause as Error).message).toBe("down");
    expect(new SchemaRegistryError("s", "text").message).toContain("text");
  });

  it("builds from JSON and knows when it is live", () => {
    const empty = new SchemaVersion();
    expect(empty.status).toBe("LIVE");
    expect(empty.firstSeen).toBeInstanceOf(Date);
    expect(empty.lastHeartbeat).toBe(empty.firstSeen);
    expect(empty.instances).toEqual({});
    expect(empty.forced).toEqual([]);
    const json = new SchemaVersion({
      uuid: SchemaVersion.identifier("s", "1.0.0", "abc"),
      firstSeen: "2024-01-01T00:00:00.000Z" as any,
      lastHeartbeat: "2024-01-01T00:10:00.000Z" as any,
      instances: { a: "2024-01-01T00:10:00.000Z" as any, b: null as any },
      status: "RETIRED"
    });
    expect(json.uuid).toBe("s:1.0.0:abc");
    expect(json.lastHeartbeat.toISOString()).toBe("2024-01-01T00:10:00.000Z");
    expect(json.instances.a.toISOString()).toBe("2024-01-01T00:10:00.000Z");
    expect(json.instances.b.getTime()).toBe(0);
    expect(json.isLive(60000, new Date("2024-01-01T00:10:30.000Z"))).toBe(false);
    json.status = "LIVE";
    expect(json.isLive(60000, new Date("2024-01-01T00:10:30.000Z"))).toBe(true);
    expect(json.isLive(1000, new Date("2024-01-01T00:12:00.000Z"))).toBe(false);
  });
});
