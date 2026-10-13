import type { ModelClass } from "@webda/models";
import { useApplication } from "../application/hooks.js";
import type { Application } from "../application/application.js";
import type { MigrationReport } from "../stores/migration.js";
import { V3Animal, V3Dog, V3Plant, V3Puppy } from "./legacy-types.fixture.model.js";

// This module may be loaded from `src` while the store under test comes from `lib` (store packages alias
// `@webda/core/lib/test`): it never touches the Registry or a class of `@webda/core` directly, only the store
// methods and the fixture models.

/**
 * `models` of a store holding the fixture: two models sharing one table, V3Animal its root
 */
export const LEGACY_TYPE_MODELS = ["Webda/V3Animal", "Webda/V3Plant"];

/**
 * Rows as Webda 3 stored them: short, lower-case, upper-case, aliased, untyped and unknown types
 */
export const LEGACY_TYPE_ROWS: { key: string; data: Record<string, any> }[] = [
  { key: "a1", data: { uuid: "a1", __type: "Webda/V3Animal", name: "current animal" } },
  { key: "a2", data: { uuid: "a2", __type: "V3Animal", name: "short animal" } },
  { key: "a3", data: { uuid: "a3", __type: "webda/v3animal", name: "lower animal" } },
  { key: "a4", data: { uuid: "a4", name: "untyped animal" } },
  { key: "d1", data: { uuid: "d1", __type: "v3dog", name: "lower short dog" } },
  { key: "p1", data: { uuid: "p1", __type: "WEBDA/V3PUPPY", name: "upper puppy" } },
  { key: "p2", data: { uuid: "p2", __type: "Webda/V3Puppy", name: "current puppy" } },
  { key: "g1", data: { uuid: "g1", __type: "Webda/Flora", name: "alias plant" } },
  { key: "g2", data: { uuid: "g2", __type: "Flora", name: "short alias plant" } },
  { key: "g3", data: { uuid: "g3", __type: "Webda/V3Plant", name: "current plant" } },
  { key: "u1", data: { uuid: "u1", __type: "Gone/Model", name: "unknown" } }
];

/**
 * Totals of a migration report, summed over the tables
 */
export interface LegacyTypeTotals {
  /** Rows read */
  scanned: number;
  /** Rows rewritten */
  updated: number;
  /** Count by change */
  byChange: Record<string, number>;
  /** Untouched rows by stored type */
  unknown: Record<string, number>;
}

/**
 * Exact `types` migration totals over {@link LEGACY_TYPE_ROWS}
 */
export const LEGACY_TYPE_REPORT: LegacyTypeTotals = {
  scanned: 11,
  updated: 7,
  byChange: {
    "(untyped) → Webda/V3Animal": 1,
    "Flora → Webda/V3Plant": 1,
    "V3Animal → Webda/V3Animal": 1,
    "WEBDA/V3PUPPY → Webda/V3Puppy": 1,
    "Webda/Flora → Webda/V3Plant": 1,
    "v3dog → Webda/V3Dog": 1,
    "webda/v3animal → Webda/V3Animal": 1
  },
  unknown: { "Gone/Model": 1 }
};

/**
 * Register the fixture models in the current application (once), with the runtime Metadata the module loader sets
 */
export function registerLegacyTypeFixtures(): void {
  const app = useApplication() as Application;
  if ((app.getModels()["Webda/V3Animal"] as unknown) === V3Animal) {
    return;
  }
  const metadata = (identifier: string, ancestors: string[], subclasses: ModelClass[], aliases: string[] = []) => ({
    Identifier: identifier,
    Import: "",
    Plural: `${identifier.split("/").pop()}s`,
    Schemas: {},
    Relations: {},
    Ancestors: ancestors,
    Subclasses: subclasses as any,
    PrimaryKey: ["uuid"],
    Events: [],
    Reflection: {},
    Actions: {},
    Aliases: aliases
  });
  const models: [string, any, any][] = [
    ["Webda/V3Puppy", V3Puppy, metadata("Webda/V3Puppy", ["Webda/V3Dog", "Webda/V3Animal"], [])],
    ["Webda/V3Dog", V3Dog, metadata("Webda/V3Dog", ["Webda/V3Animal"], [V3Puppy])],
    ["Webda/V3Animal", V3Animal, metadata("Webda/V3Animal", [], [V3Dog])],
    ["Webda/V3Plant", V3Plant, metadata("Webda/V3Plant", [], [], ["Webda/Flora"])]
  ];
  for (const [identifier, clazz, meta] of models) {
    app.addModel(identifier, clazz, meta);
    clazz.registerSerializer(true, identifier);
  }
}

/**
 * Sum a migration report over its tables
 * @param report - the report
 * @returns the totals
 */
export function sumMigrationReport(report: MigrationReport): LegacyTypeTotals {
  const sum: LegacyTypeTotals = { scanned: 0, updated: 0, byChange: {}, unknown: {} };
  for (const table of Object.values(report.tables)) {
    sum.scanned += table.scanned;
    sum.updated += table.updated;
    for (const [change, n] of Object.entries(table.byChange)) {
      sum.byChange[change] = (sum.byChange[change] ?? 0) + n;
    }
    for (const [type, n] of Object.entries(table.unknown)) {
      sum.unknown[type] = (sum.unknown[type] ?? 0) + n;
    }
  }
  return sum;
}
