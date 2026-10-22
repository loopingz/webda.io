import { isWidening, sameType, typeToString } from "./columns.js";
import type { ColumnPlan, DeletePolicy, IndexPlan, RelationPlan, RelationalSchemaPlan, TablePlan } from "./plan.js";

/**
 * Severity of a change between a live plan and the next one
 *
 * - `SAFE`: additive or relaxing, both versions keep working
 * - `WARN`: works, with a caveat to review
 * - `BLOCK`: the versions would read or write incompatible data: the new version must not start
 */
export type SchemaChangeCategory = "SAFE" | "WARN" | "BLOCK";

/**
 * Kind of change
 */
export type SchemaChangeCode =
  | "OPTIONS_CHANGED"
  | "MODEL_ADDED"
  | "MODEL_REMOVED"
  | "MODEL_TABLE_CHANGED"
  | "TABLE_ADDED"
  | "TABLE_UNUSED"
  | "PRIMARY_KEY_CHANGED"
  | "COLUMN_ADDED"
  | "COLUMN_UNUSED"
  | "POSSIBLE_RENAME"
  | "TYPE_WIDENED"
  | "TYPE_NARROWED"
  | "TYPE_CHANGED"
  | "COLUMN_ROLE_CHANGED"
  | "ENUM_VALUES_ADDED"
  | "ENUM_VALUES_REMOVED"
  | "ENUM_CONSTRAINT_ADDED"
  | "ENUM_CONSTRAINT_REMOVED"
  | "FIELD_REQUIRED"
  | "FIELD_OPTIONAL"
  | "RELATION_ADDED"
  | "RELATION_REMOVED"
  | "RELATION_KIND_CHANGED"
  | "RELATION_TARGET_CHANGED"
  | "DELETE_POLICY_CHANGED"
  | "INDEX_ADDED"
  | "UNIQUE_INDEX_ADDED";

/**
 * A change between a live plan and the next one
 */
export interface SchemaChange {
  category: SchemaChangeCategory;
  code: SchemaChangeCode;
  /**
   * The live version compared
   */
  version: string;
  table?: string;
  column?: string;
  model?: string;
  attribute?: string;
  message: string;
  /**
   * A `BLOCK` downgraded to `WARN` by `allowIncompatible`
   */
  forced?: boolean;
}

/**
 * A plan in use by a running version
 */
export interface LiveSchemaPlan {
  version: string;
  plan: RelationalSchemaPlan;
}

/**
 * Options of {@link compareSchemaPlans}
 */
export interface CompareSchemaOptions {
  /**
   * Downgrade the `BLOCK` changes of these elements to `WARN`: `<table>`, `<table>.<column>`, `<model>` or
   * `<model>.<attribute>`
   */
  allowIncompatible?: string[];
}

/**
 * Compare the plan of a new version to the plans of the versions still running on the same database
 *
 * The physical schema has to stay the union of every live plan: additions are safe, anything making the rows of
 * one version unreadable or unwritable by another (type changes, narrowing, key, hierarchy or relation changes)
 * blocks.
 * @param live - the plans of the running versions
 * @param next - the plan of the new version
 * @param options - the options
 * @returns the changes, every category included
 */
export function compareSchemaPlans(
  live: LiveSchemaPlan[],
  next: RelationalSchemaPlan,
  options: CompareSchemaOptions = {}
): SchemaChange[] {
  const allowed = new Set(options.allowIncompatible ?? []);
  const changes: SchemaChange[] = [];
  for (const { version, plan } of live) {
    const add = (change: Omit<SchemaChange, "version">) => {
      const keys = [
        change.table,
        change.table && change.column ? `${change.table}.${change.column}` : undefined,
        change.model,
        change.model && change.attribute ? `${change.model}.${change.attribute}` : undefined
      ];
      const forced = change.category === "BLOCK" && keys.some(key => key && allowed.has(key));
      changes.push({ ...change, version, ...(forced ? { category: "WARN", forced: true } : {}) });
    };
    compareOptions(plan, next, add);
    compareModels(plan, next, add);
    compareTables(plan, next, add);
    compareRelations(plan, next, add);
    compareIndexes(plan, next, add);
  }
  return changes;
}

/**
 * @param changes - the changes
 * @returns the changes preventing the new version from starting
 */
export function blockingChanges(changes: SchemaChange[]): SchemaChange[] {
  return changes.filter(change => change.category === "BLOCK");
}

type Add = (change: Omit<SchemaChange, "version">) => void;

/**
 * @param live - the live plan
 * @param next - the next plan
 * @param add - the change collector
 */
function compareOptions(live: RelationalSchemaPlan, next: RelationalSchemaPlan, add: Add): void {
  for (const key of Object.keys({ ...live.options, ...next.options }) as (keyof RelationalSchemaPlan["options"])[]) {
    if (live.options[key] !== next.options[key]) {
      add({
        category: "BLOCK",
        code: "OPTIONS_CHANGED",
        message: `Store option ${key} changed from ${JSON.stringify(live.options[key])} to ${JSON.stringify(next.options[key])}: the physical layout differs`
      });
    }
  }
}

/**
 * @param live - the live plan
 * @param next - the next plan
 * @param add - the change collector
 */
function compareModels(live: RelationalSchemaPlan, next: RelationalSchemaPlan, add: Add): void {
  for (const [model, plan] of Object.entries(next.models)) {
    const before = live.models[model];
    if (!before) {
      add({ category: "SAFE", code: "MODEL_ADDED", model, table: plan.table, message: `${model} added` });
    } else if (before.table !== plan.table) {
      add({
        category: "BLOCK",
        code: "MODEL_TABLE_CHANGED",
        model,
        message: `${model} moves from table ${before.table} to ${plan.table}: its rows would be split across tables`
      });
    }
  }
  for (const [model, plan] of Object.entries(live.models)) {
    if (!next.models[model]) {
      add({
        category: "SAFE",
        code: "MODEL_REMOVED",
        model,
        table: plan.table,
        message: `${model} is no longer used by the new version: its rows stay for the live version`
      });
    }
  }
}

/**
 * @param live - the live plan
 * @param next - the next plan
 * @param add - the change collector
 */
function compareTables(live: RelationalSchemaPlan, next: RelationalSchemaPlan, add: Add): void {
  const liveTables = new Map(live.tables.map(t => [t.name, t]));
  const nextTables = new Map(next.tables.map(t => [t.name, t]));
  for (const table of next.tables) {
    const before = liveTables.get(table.name);
    if (!before) {
      add({ category: "SAFE", code: "TABLE_ADDED", table: table.name, message: `Table ${table.name} added` });
      continue;
    }
    compareTable(before, table, add);
  }
  for (const table of live.tables) {
    if (!nextTables.has(table.name)) {
      add({
        category: "SAFE",
        code: "TABLE_UNUSED",
        table: table.name,
        message: `Table ${table.name} is no longer used by the new version: kept until the contract phase`
      });
    }
  }
}

/**
 * @param live - the live table
 * @param next - the next table
 * @param add - the change collector
 */
function compareTable(live: TablePlan, next: TablePlan, add: Add): void {
  const table = next.name;
  if (
    live.primaryKey.join("\0") !== next.primaryKey.join("\0") ||
    (live.primaryKeySeparator ?? "") !== (next.primaryKeySeparator ?? "")
  ) {
    add({
      category: "BLOCK",
      code: "PRIMARY_KEY_CHANGED",
      table,
      message: `Primary key of ${table} changed from (${live.primaryKey.join(", ")}) to (${next.primaryKey.join(", ")}): existing keys and references become invalid`
    });
  }
  const liveColumns = new Map(live.columns.map(c => [c.name, c]));
  const nextColumns = new Map(next.columns.map(c => [c.name, c]));
  const added = next.columns.filter(c => !liveColumns.has(c.name));
  const removed = live.columns.filter(c => !nextColumns.has(c.name));
  for (const column of added) {
    add({
      category: "SAFE",
      code: "COLUMN_ADDED",
      table,
      column: column.name,
      message: `Column ${table}.${column.name} added${column.nullable ? "" : " (created nullable: NOT NULL is applied when no live version can write a row without it)"}`
    });
  }
  for (const column of removed) {
    add({
      category: "SAFE",
      code: "COLUMN_UNUSED",
      table,
      column: column.name,
      message: `Column ${table}.${column.name} is no longer written by the new version: kept for the live version`
    });
  }
  if (added.length && removed.length) {
    add({
      category: "WARN",
      code: "POSSIBLE_RENAME",
      table,
      message: `Table ${table} loses ${removed.map(c => c.name).join(", ")} and gains ${added.map(c => c.name).join(", ")}: a rename does not carry the data over`
    });
  }
  for (const column of next.columns) {
    const before = liveColumns.get(column.name);
    if (before) {
      compareColumn(table, before, column, add);
    }
  }
}

/**
 * @param table - the table
 * @param live - the live column
 * @param next - the next column
 * @param add - the change collector
 */
function compareColumn(table: string, live: ColumnPlan, next: ColumnPlan, add: Add): void {
  const column = next.name;
  const where = `${table}.${column}`;
  if (live.role !== next.role || live.field !== next.field || live.keyPart !== next.keyPart) {
    add({
      category: "BLOCK",
      code: "COLUMN_ROLE_CHANGED",
      table,
      column,
      message:
        `Column ${where} held ${live.role} ${live.field || ""} and now holds ${next.role} ${next.field || ""}`.replace(
          /\s+/g,
          " "
        )
    });
  }
  if (!sameType(live.type, next.type)) {
    const from = typeToString(live.type);
    const to = typeToString(next.type);
    if (isWidening(live.type, next.type)) {
      add({
        category: "SAFE",
        code: "TYPE_WIDENED",
        table,
        column,
        message: `Column ${where} widened from ${from} to ${to}`
      });
    } else if (isWidening(next.type, live.type)) {
      add({
        category: "BLOCK",
        code: "TYPE_NARROWED",
        table,
        column,
        message: `Column ${where} narrowed from ${from} to ${to}: rows written by the live version may not fit`
      });
    } else {
      add({
        category: "BLOCK",
        code: "TYPE_CHANGED",
        table,
        column,
        message: `Column ${where} changes type from ${from} to ${to}: add a new field instead (expand/contract)`
      });
    }
  }
  compareEnum(table, live, next, add);
  if (live.nullable && !next.nullable) {
    add({
      category: "SAFE",
      code: "FIELD_REQUIRED",
      table,
      column,
      message: `${where} becomes required: enforced by the application, NOT NULL waits for the contract phase`
    });
  } else if (!live.nullable && next.nullable) {
    add({
      category: "BLOCK",
      code: "FIELD_OPTIONAL",
      table,
      column,
      message: `${where} becomes optional while the live version requires it: drop its NOT NULL first`
    });
  }
}

/**
 * @param table - the table
 * @param live - the live column
 * @param next - the next column
 * @param add - the change collector
 */
function compareEnum(table: string, live: ColumnPlan, next: ColumnPlan, add: Add): void {
  const column = next.name;
  const where = `${table}.${column}`;
  if (!live.enum && !next.enum) {
    return;
  }
  if (!next.enum) {
    add({
      category: "SAFE",
      code: "ENUM_CONSTRAINT_REMOVED",
      table,
      column,
      message: `${where} accepts any value`
    });
    return;
  }
  if (!live.enum) {
    add({
      category: "BLOCK",
      code: "ENUM_CONSTRAINT_ADDED",
      table,
      column,
      message: `${where} becomes an enum while the live version writes any value`
    });
    return;
  }
  const liveValues = new Set(live.enum);
  const nextValues = new Set(next.enum);
  const added = next.enum.filter(v => !liveValues.has(v));
  const removed = live.enum.filter(v => !nextValues.has(v));
  if (added.length) {
    add({
      category: "WARN",
      code: "ENUM_VALUES_ADDED",
      table,
      column,
      message: `${where} accepts ${added.join(", ")}: the live version reads them but fails to validate them on write`
    });
  }
  if (removed.length) {
    add({
      category: "BLOCK",
      code: "ENUM_VALUES_REMOVED",
      table,
      column,
      message: `${where} no longer accepts ${removed.join(", ")} while the live version still writes them`
    });
  }
}

/**
 * Delete policies behaving the same: both refuse the delete of a referenced row
 */
const EQUIVALENT_POLICIES = new Set<DeletePolicy | undefined>(["NO ACTION", "RESTRICT"]);

/**
 * @param live - the live plan
 * @param next - the next plan
 * @param add - the change collector
 */
function compareRelations(live: RelationalSchemaPlan, next: RelationalSchemaPlan, add: Add): void {
  const key = (relation: RelationPlan) => `${relation.model}\0${relation.attribute}`;
  const liveRelations = new Map(live.relations.map(r => [key(r), r]));
  const nextRelations = new Map(next.relations.map(r => [key(r), r]));
  for (const relation of next.relations) {
    const { model, attribute } = relation;
    const before = liveRelations.get(key(relation));
    if (!before) {
      add({ category: "SAFE", code: "RELATION_ADDED", model, attribute, message: `${model}.${attribute} added` });
      continue;
    }
    if (before.kind !== relation.kind || storageKind(before) !== storageKind(relation)) {
      add({
        category: "BLOCK",
        code: "RELATION_KIND_CHANGED",
        model,
        attribute,
        message: `${model}.${attribute} changes from ${before.kind} to ${relation.kind}: column and junction table do not match`
      });
    }
    if (before.target !== relation.target) {
      add({
        category: "BLOCK",
        code: "RELATION_TARGET_CHANGED",
        model,
        attribute,
        message: `${model}.${attribute} now targets ${relation.target} instead of ${before.target}`
      });
    }
    if (
      before.onDelete !== relation.onDelete &&
      !(EQUIVALENT_POLICIES.has(before.onDelete) && EQUIVALENT_POLICIES.has(relation.onDelete))
    ) {
      add({
        category: "BLOCK",
        code: "DELETE_POLICY_CHANGED",
        model,
        attribute,
        message: `${model}.${attribute} deletes with ${relation.onDelete ?? "no constraint"} instead of ${before.onDelete ?? "no constraint"}: the same delete would behave differently per version`
      });
    }
  }
  for (const relation of live.relations) {
    if (!nextRelations.has(key(relation))) {
      add({
        category: "SAFE",
        code: "RELATION_REMOVED",
        model: relation.model,
        attribute: relation.attribute,
        message: `${relation.model}.${relation.attribute} is no longer used by the new version: its storage is kept`
      });
    }
  }
}

/**
 * @param relation - a relation
 * @returns the kind of its storage, with the junction table
 */
function storageKind(relation: RelationPlan): string {
  return relation.storage.kind === "junction" ? `junction:${relation.storage.table}` : relation.storage.kind;
}

/**
 * @param live - the live plan
 * @param next - the next plan
 * @param add - the change collector
 */
function compareIndexes(live: RelationalSchemaPlan, next: RelationalSchemaPlan, add: Add): void {
  const signature = (index: IndexPlan) => `${index.table}\0${index.columns.join("\0")}\0${index.unique}`;
  const existing = new Set(live.indexes.map(signature));
  for (const index of next.indexes) {
    if (existing.has(signature(index))) {
      continue;
    }
    add(
      index.unique
        ? {
            category: "WARN",
            code: "UNIQUE_INDEX_ADDED",
            table: index.table,
            message: `Unique index ${index.name} added: the live version may write duplicates, it is created concurrently and left out on failure`
          }
        : {
            category: "SAFE",
            code: "INDEX_ADDED",
            table: index.table,
            message: `Index ${index.name} added`
          }
    );
  }
}
