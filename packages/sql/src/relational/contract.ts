import type { LiveSchemaPlan, RelationalSchemaPlan, TablePlan } from "@webda/sql-schema";
import type { LiveSchema } from "./dialect.js";

/**
 * One change of the contract phase: what the schema can lose or tighten once no live version depends on it
 *
 * - `dropColumn`: no live version reads or writes the column
 * - `dropTable`: no live version uses the table (a model table or a junction)
 * - `setNotNull`: every live version writes the column (a field or a reference) and requires it; applied only when no
 *   row is null
 * - `validateForeignKey`: a foreign key added `NOT VALID` by `alter`
 */
export type ContractStep =
  | { kind: "dropColumn"; table: string; column: string }
  | { kind: "dropTable"; table: string }
  | { kind: "setNotNull"; table: string; column: string }
  | { kind: "validateForeignKey"; table: string; constraint: string };

/**
 * @param step - a contract step
 * @returns a one-line description for logs and the dry run
 */
export function describeContractStep(step: ContractStep): string {
  switch (step.kind) {
    case "dropColumn":
      return `drop column ${step.table}.${step.column}`;
    case "dropTable":
      return `drop table ${step.table}`;
    case "setNotNull":
      return `set not null ${step.table}.${step.column}`;
    case "validateForeignKey":
      return `validate foreign key ${step.constraint}`;
  }
}

/**
 * The tables of a set of plans, by name
 * @param plans - the plans
 * @returns the tables of every plan, grouped by name
 */
function tablesByName(plans: RelationalSchemaPlan[]): Map<string, TablePlan[]> {
  const tables = new Map<string, TablePlan[]>();
  for (const plan of plans) {
    for (const table of plan.tables) {
      tables.set(table.name, [...(tables.get(table.name) ?? []), table]);
    }
  }
  return tables;
}

/**
 * What the contract phase can apply: the database compared with the union of the live plans
 *
 * Pure: the caller describes the database (every table any version, live or retired, ever planned) and decides what to
 * run. A table or column the live plans do not know is only dropped when a retired version planned it (`known`):
 * anything else in the database is left alone.
 * @param live - the plans of the running versions, this one included
 * @param db - the database, as described by the dialect
 * @param known - the plans of the retired versions: what they planned and no live version uses is dropped
 * @returns the steps, drops first, then `NOT NULL`, then validations
 */
export function planContract(
  live: LiveSchemaPlan[],
  db: LiveSchema,
  known: RelationalSchemaPlan[] = []
): ContractStep[] {
  const steps: ContractStep[] = [];
  const liveTables = tablesByName(live.map(l => l.plan));
  const knownTables = tablesByName(known);
  for (const [name, table] of Object.entries(db.tables)) {
    const versions = liveTables.get(name);
    if (!versions) {
      if (knownTables.has(name)) {
        steps.push({ kind: "dropTable", table: name });
      }
      continue;
    }
    for (const column of Object.keys(table.columns)) {
      const used = versions.some(t => t.columns.some(c => c.name === column));
      const planned = knownTables.get(name)?.some(t => t.columns.some(c => c.name === column));
      if (!used && planned) {
        steps.push({ kind: "dropColumn", table: name, column });
      }
    }
  }
  for (const [name, table] of Object.entries(db.tables)) {
    const versions = liveTables.get(name);
    if (!versions) {
      continue;
    }
    for (const [column, current] of Object.entries(table.columns)) {
      if (!current.nullable) {
        continue;
      }
      const required = versions.every(t =>
        t.columns.some(c => c.name === column && !c.nullable && (c.role === "field" || c.role === "reference"))
      );
      if (required) {
        steps.push({ kind: "setNotNull", table: name, column });
      }
    }
    for (const constraint of table.unvalidated ?? []) {
      steps.push({ kind: "validateForeignKey", table: name, constraint });
    }
  }
  return steps;
}
