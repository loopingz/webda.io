import { buildSchemaPlan } from "@webda/sql-schema";
import type { SchemaModelMetadata } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import { describeContractStep, planContract } from "./contract.js";
import type { ContractStep } from "./contract.js";
import type { LiveSchema, LiveTable } from "./dialect.js";

/**
 * @param properties - the stored properties of a Post
 * @param required - the required ones
 * @param links - link attributes to User
 * @returns the metadata of the version
 */
function version(
  properties: Record<string, any>,
  required: string[] = ["uuid"],
  links: string[] = []
): SchemaModelMetadata[] {
  return [
    {
      Identifier: "App/User",
      PrimaryKey: ["uuid"],
      Schemas: { Stored: { type: "object", properties: { uuid: { type: "string" } } } }
    },
    {
      Identifier: "App/Post",
      PrimaryKey: ["uuid"],
      Relations: { links: links.map(attribute => ({ attribute, model: "App/User", type: "LINK" })) },
      Schemas: {
        Stored: {
          type: "object",
          properties: {
            uuid: { type: "string" },
            ...properties,
            ...Object.fromEntries(links.map(l => [l, { type: "string" }]))
          },
          required
        }
      }
    }
  ];
}

/**
 * @param columns - column name → nullable
 * @param unvalidated - the foreign keys added NOT VALID
 * @returns a live table
 */
function table(columns: Record<string, boolean>, unvalidated?: string[]): LiveTable {
  return {
    columns: Object.fromEntries(
      Object.entries(columns).map(([name, nullable]) => [name, { type: { kind: "text" }, nullable, raw: "text" }])
    ),
    indexes: new Set(),
    constraints: new Set(unvalidated),
    ...(unvalidated ? { unvalidated: new Set(unvalidated) } : {})
  };
}

const v1 = buildSchemaPlan(version({ title: { type: "string" }, legacy: { type: "string" } }, ["uuid", "title"]));
const v2 = buildSchemaPlan(
  version({ title: { type: "string" }, summary: { type: "string" } }, ["uuid", "title", "summary"], ["author"])
);

describe("planContract", () => {
  const db: LiveSchema = {
    tables: {
      app_user: table({ uuid: false, __type: true, _extra: true }),
      app_post: table(
        { uuid: false, title: true, legacy: true, summary: true, author: true, __type: true, _extra: true, dba: true },
        ["fk_app_post_author"]
      ),
      app_old_junction: table({ post: false, tag: false })
    }
  };

  it("keeps everything while both versions are live", () => {
    const steps = planContract(
      [
        { version: "1", plan: v1 },
        { version: "2", plan: v2 }
      ],
      db
    );
    expect(steps).toEqual([
      { kind: "setNotNull", table: "app_post", column: "title" },
      { kind: "validateForeignKey", table: "app_post", constraint: "fk_app_post_author" }
    ]);
  });

  it("drops what the retired version planned and no live version uses, tightens what every live version requires", () => {
    const retiredJunction = {
      ...v1,
      tables: [...v1.tables, { name: "app_old_junction", models: [], primaryKey: ["post", "tag"], columns: [] }]
    };
    const steps = planContract([{ version: "2", plan: v2 }], db, [retiredJunction]);
    expect(steps).toEqual([
      { kind: "dropColumn", table: "app_post", column: "legacy" },
      { kind: "dropTable", table: "app_old_junction" },
      { kind: "setNotNull", table: "app_post", column: "title" },
      { kind: "setNotNull", table: "app_post", column: "summary" },
      { kind: "validateForeignKey", table: "app_post", constraint: "fk_app_post_author" }
    ]);
    // A column nobody planned (a DBA's) and a table no version ever planned are left alone
    expect(steps.some(s => s.kind === "dropColumn" && s.column === "dba")).toBe(false);
    expect(planContract([{ version: "2", plan: v2 }], db).some(s => s.kind === "dropTable")).toBe(false);
  });

  it("describes every step", () => {
    const steps: ContractStep[] = [
      { kind: "dropColumn", table: "t", column: "c" },
      { kind: "dropTable", table: "t" },
      { kind: "setNotNull", table: "t", column: "c" },
      { kind: "validateForeignKey", table: "t", constraint: "fk" }
    ];
    expect(steps.map(describeContractStep)).toEqual([
      "drop column t.c",
      "drop table t",
      "set not null t.c",
      "validate foreign key fk"
    ]);
  });
});
