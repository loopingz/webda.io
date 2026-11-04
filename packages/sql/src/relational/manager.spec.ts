import { buildSchemaPlan } from "@webda/sql-schema";
import type { SchemaModelMetadata } from "@webda/sql-schema";
import { describe, expect, it } from "vitest";
import type { RelationalDialect } from "./dialect.js";
import { RelationalSchemaManager } from "./manager.js";
import { SchemaDriftError } from "./sync.js";

const user: SchemaModelMetadata = {
  Identifier: "App/User",
  PrimaryKey: ["uuid"],
  Relations: { links: [{ attribute: "friend", model: "App/Ghost", type: "LINK" }] },
  Schemas: { Stored: { type: "object", properties: { uuid: { type: "string" }, friend: { type: "string" } } } }
};

/** An engine without a schema lock, rendering one statement per step */
const dialect = {
  renderStep: (step: any) => [`STEP ${step.kind}`],
  describeSchema: async () => ({ tables: {} }),
  schemaLock: () => undefined
} as unknown as RelationalDialect;

describe("RelationalSchemaManager", () => {
  it("syncsWithoutALockAndLogsWarningsWithTheirModel", async () => {
    const logs: string[] = [];
    const manager = new RelationalSchemaManager({
      name: "m",
      dialect,
      layout: {},
      log: (l, m) => logs.push(`${l} ${m}`)
    });
    manager.build([user], []);
    expect(logs).toEqual(["WARN UNRESOLVED_TARGET App/User.friend: " + manager.plan!.warnings[0].message]);
    const statements: string[] = [];
    const client = { query: async (q: string) => (statements.push(q), { rows: [], rowCount: 0 }) };
    const steps = await manager.sync(client, "create");
    const expected = ["createTable", ...manager.plan!.indexes.map(() => "createIndex")];
    expect(steps.map(s => s.kind)).toEqual(expected);
    expect(statements).toEqual(["BEGIN", ...expected.map(k => `STEP ${k}`), "COMMIT"]);
    expect(logs.filter(l => l.startsWith("INFO"))).toHaveLength(expected.length);
    await expect(manager.sync(client, "validate")).rejects.toThrow(SchemaDriftError);
    expect(manager.createStatements()).toEqual(expected.map(k => `STEP ${k}`));
    expect(buildSchemaPlan([user]).tables).toHaveLength(1);
  });
});
