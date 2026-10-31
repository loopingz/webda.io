import { WebdaError } from "@webda/core";
import { isWidening, sameType, typeToString } from "@webda/sql-schema";
import type { ColumnType, RelationalSchemaPlan } from "@webda/sql-schema";
import type { LiveSchema, LiveTable, SchemaStep } from "./dialect.js";

/**
 * How a store brings the database to its plan at init
 *
 * - `none`: nothing
 * - `create`: create the missing tables (with their indexes and foreign keys); existing tables are only reported
 * - `alter`: `create`, plus add the missing columns, indexes and foreign keys of existing tables
 * - `validate`: write nothing, fail when anything is missing or differs
 */
export type SchemaSyncMode = "none" | "create" | "alter" | "validate";

/**
 * A difference between the database and the plan that sync never resolves on its own
 */
export interface SchemaDrift {
  table: string;
  column?: string;
  message: string;
}

/**
 * The database differs from the plan and the store is not allowed to change it (`schemaSync: "validate"`)
 */
export class SchemaDriftError extends WebdaError.CodeError {
  /**
   * @param steps - the changes sync would apply
   * @param drift - the differences sync never resolves
   */
  constructor(
    readonly steps: SchemaStep[],
    readonly drift: SchemaDrift[]
  ) {
    super(
      "SCHEMA_DRIFT",
      ["Database schema differs from the plan:", ...steps.map(describeStep), ...drift.map(d => d.message)].join("\n")
    );
  }
}

/**
 * @param step - a schema change
 * @returns a one-line description for logs and errors
 */
export function describeStep(step: SchemaStep): string {
  switch (step.kind) {
    case "createTable":
      return `create table ${step.table.name}`;
    case "addColumn":
      return `add column ${step.table}.${step.column.name}`;
    case "createIndex":
      return `create index ${step.index.name}`;
    case "addForeignKey":
      return `add foreign key ${step.foreignKey.name}`;
  }
}

/**
 * @param step - a schema change on an existing table
 * @returns what it adds, for the drift messages
 */
function describeMissing(step: Exclude<SchemaStep, { kind: "createTable" }>): string {
  switch (step.kind) {
    case "addColumn":
      return `column ${step.table}.${step.column.name}`;
    case "createIndex":
      return `index ${step.index.name}`;
    case "addForeignKey":
      return `foreign key ${step.foreignKey.name}`;
  }
}

/**
 * Whether a live column can hold the planned column: the same type, a wider one, or `text` for `uuid` (engines
 * render `uuid` as text)
 * @param live - the type the database holds
 * @param plan - the planned type
 * @returns true when the column needs no change
 */
export function compatibleType(live: ColumnType, plan: ColumnType): boolean {
  const textual = (type: ColumnType) => type.kind === "text" || type.kind === "uuid";
  return sameType(live, plan) || isWidening(plan, live) || (textual(live) && textual(plan));
}

/**
 * The additive changes bringing the database to the plan, and the differences that are never resolved
 *
 * Nothing destructive is ever planned: no drop, no type change, no `NOT NULL`. In `create` mode the changes of an
 * existing table are reported as drift instead of planned.
 * @param plan - the plan
 * @param live - the database as described by the dialect
 * @param mode - `create` or `alter`
 * @param options - planner options
 * @param options.inlineForeignKeys - the engine declares the foreign keys inside `CREATE TABLE` and cannot add one later
 * @returns the steps in application order (tables, columns, indexes, foreign keys) and the drift
 */
export function planSchemaChanges(
  plan: RelationalSchemaPlan,
  live: LiveSchema,
  mode: "create" | "alter",
  options: { inlineForeignKeys?: boolean } = {}
): { steps: SchemaStep[]; drift: SchemaDrift[] } {
  const steps: SchemaStep[] = [];
  const drift: SchemaDrift[] = [];
  const created = new Set<string>();
  const columns: SchemaStep[] = [];
  // Something missing from an existing table: planned in `alter`, reported in `create`
  const onExisting = (step: Exclude<SchemaStep, { kind: "createTable" }>, sink: SchemaStep[] = steps) => {
    if (mode === "alter") {
      sink.push(step);
    } else {
      drift.push({
        table:
          step.kind === "addColumn"
            ? step.table
            : step.kind === "createIndex"
              ? step.index.table
              : step.foreignKey.table,
        ...(step.kind === "addColumn" ? { column: step.column.name } : {}),
        message: `${describeMissing(step)} is missing (schemaSync: alter adds it)`
      });
    }
  };
  for (const table of plan.tables) {
    const existing: LiveTable | undefined = live.tables[table.name];
    if (!existing) {
      steps.push({ kind: "createTable", table, foreignKeys: plan.foreignKeys.filter(fk => fk.table === table.name) });
      created.add(table.name);
      continue;
    }
    for (const column of table.columns) {
      const current = existing.columns[column.name];
      if (!current) {
        onExisting({ kind: "addColumn", table: table.name, column }, columns);
      } else if (!current.type || !compatibleType(current.type, column.type)) {
        drift.push({
          table: table.name,
          column: column.name,
          message: `column ${table.name}.${column.name} is ${current.raw}, expected ${typeToString(column.type)}`
        });
      }
    }
    for (const name of Object.keys(existing.columns)) {
      if (!table.columns.some(c => c.name === name)) {
        drift.push({
          table: table.name,
          column: name,
          message: `column ${table.name}.${name} is not in the plan (DROP COLUMN is never run)`
        });
      }
    }
  }
  steps.push(...columns);
  for (const index of plan.indexes) {
    if (created.has(index.table)) {
      steps.push({ kind: "createIndex", index });
    } else if (!live.tables[index.table]?.indexes.has(index.name)) {
      onExisting({ kind: "createIndex", index });
    }
  }
  for (const foreignKey of plan.foreignKeys) {
    if (created.has(foreignKey.table)) {
      if (!options.inlineForeignKeys) {
        steps.push({ kind: "addForeignKey", foreignKey });
      }
    } else if (!live.tables[foreignKey.table]?.constraints.has(foreignKey.name)) {
      if (options.inlineForeignKeys) {
        drift.push({
          table: foreignKey.table,
          message: `foreign key ${foreignKey.name} cannot be added to ${foreignKey.table}: recreate the table`
        });
      } else {
        onExisting({ kind: "addForeignKey", foreignKey });
      }
    }
  }
  return { steps, drift };
}
