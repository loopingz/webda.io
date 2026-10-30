import { WebdaError } from "@webda/core";
import { KEY_COLUMN, POSITION_COLUMN, TYPE_COLUMN } from "@webda/sql-schema";
import type { ColumnPlan, RelationPlan, RelationalSchemaPlan, TablePlan } from "@webda/sql-schema";

/**
 * Where a model attribute lives in the table
 *
 * - `column`: a scalar field or a single-column reference
 * - `json`: a JSON field, with the path inside it (may be empty)
 * - `reference`: a reference to a composite key, one column per key part
 * - `junction`: the rows of a junction table
 * - `extra`: an unknown field kept in the extra JSON column
 * - `unknown`: an unknown field and no extra column
 */
export type AttributeTarget =
  | { kind: "column"; column: ColumnPlan }
  | { kind: "json"; column: ColumnPlan; path: string[] }
  | { kind: "reference"; columns: ColumnPlan[]; relation: RelationPlan }
  | { kind: "junction"; table: TablePlan; relation: RelationPlan }
  | { kind: "extra"; column: ColumnPlan; path: string[] }
  | { kind: "unknown" };

/**
 * The rows of a junction table for one owner row
 */
export interface JunctionWrite {
  table: TablePlan;
  relation: RelationPlan;
  rows: Record<string, unknown>[];
}

/**
 * A model object as columns and junction rows
 */
export interface RowWrite {
  columns: string[];
  values: unknown[];
  junctions: JunctionWrite[];
}

const NUMBER_KINDS = new Set(["bigint", "double", "decimal"]);

/**
 * @param date - a date
 * @returns its local calendar day as `YYYY-MM-DD`
 */
function localDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Maps the JSON of the models of one table to its columns and junction rows, and back
 */
export class TableMapping {
  readonly typeColumn: string;
  readonly extraColumn: string | undefined;
  readonly primaryKey: string[];
  private readonly byField = new Map<string, ColumnPlan[]>();
  private readonly relations = new Map<string, RelationPlan>();
  private readonly junctionTables = new Map<string, TablePlan>();

  /**
   * @param plan - the plan
   * @param table - the table of the models
   */
  constructor(
    readonly plan: RelationalSchemaPlan,
    readonly table: TablePlan
  ) {
    this.typeColumn = table.columns.find(c => c.role === "type")?.name ?? TYPE_COLUMN;
    this.extraColumn = table.columns.find(c => c.role === "extra")?.name;
    this.primaryKey = table.primaryKey;
    for (const column of table.columns) {
      if (column.role === "field" || column.role === "reference") {
        this.byField.set(column.field, [...(this.byField.get(column.field) ?? []), column]);
      }
    }
    for (const relation of plan.relations) {
      if (!table.models.includes(relation.model)) {
        continue;
      }
      this.relations.set(relation.attribute, relation);
      const storage = relation.storage;
      if (storage.kind === "junction") {
        this.junctionTables.set(
          relation.attribute,
          plan.tables.find(t => t.name === storage.table)!
        );
      }
    }
  }

  /**
   * @param path - an attribute path
   * @returns where the attribute lives
   */
  resolve(path: string[]): AttributeTarget {
    const [head, ...rest] = path;
    const relation = this.relations.get(head);
    const junction = this.junctionTables.get(head);
    if (relation && junction) {
      return { kind: "junction", table: junction, relation };
    }
    const columns = this.byField.get(head);
    if (columns?.length) {
      if (columns.length > 1) {
        return { kind: "reference", columns, relation: relation! };
      }
      return columns[0].type.kind === "json"
        ? { kind: "json", column: columns[0], path: rest }
        : { kind: "column", column: columns[0] };
    }
    const extra = this.table.columns.find(c => c.role === "extra");
    return extra ? { kind: "extra", column: extra, path } : { kind: "unknown" };
  }

  /**
   * @param model - a model identifier
   * @returns the columns the model reads and writes, those of the table root for an unknown model
   */
  projection(model: string): string[] {
    return (
      this.plan.models[model]?.columns ??
      (this.table.root ? this.plan.models[this.table.root]?.columns : undefined) ??
      this.table.columns.map(c => c.name)
    );
  }

  /**
   * @returns every column of the table, in table order
   */
  readColumns(): string[] {
    return this.table.columns.map(c => c.name);
  }

  /**
   * @returns the junction tables of the models of the table
   */
  junctions(): { table: TablePlan; relation: RelationPlan }[] {
    return [...this.junctionTables].map(([attribute, table]) => ({ table, relation: this.relations.get(attribute)! }));
  }

  /**
   * @param value - a JSON value
   * @param column - the column receiving it
   * @returns the value to bind
   */
  encode(value: unknown, column: ColumnPlan): unknown {
    if (value === undefined || value === null) {
      return null;
    }
    const kind = column.type.kind;
    if (kind === "json") {
      return JSON.stringify(value);
    }
    if (kind === "date") {
      return value instanceof Date ? value.toISOString().slice(0, 10) : value;
    }
    if (kind === "timestamptz") {
      return value instanceof Date ? value.toISOString() : value;
    }
    if (NUMBER_KINDS.has(kind)) {
      return typeof value === "number" ? value : Number(value);
    }
    if (kind === "boolean") {
      return value;
    }
    return typeof value === "string" ? value : String(value);
  }

  /**
   * @param value - a column value
   * @param column - its column
   * @param decodeJson - decoder of the JSON columns of the engine
   * @returns the JSON value, undefined for NULL
   */
  decode(value: unknown, column: ColumnPlan, decodeJson: (v: unknown) => unknown): unknown {
    if (value === undefined || value === null) {
      return undefined;
    }
    const kind = column.type.kind;
    if (kind === "json") {
      return decodeJson(value);
    }
    if (value instanceof Date) {
      // pg parses a DATE as a local-midnight Date: its local calendar day is the stored day
      return kind === "date" ? localDay(value) : value.toISOString();
    }
    if (NUMBER_KINDS.has(kind) && typeof value === "string") {
      return Number(value);
    }
    return value;
  }

  /**
   * Whether a relation declared by a model applies to objects of a type: the same model, or an ancestor (its
   * projection is included in the type's)
   * @param relation - the relation
   * @param type - the model identifier of the object
   * @returns true when the relation is one of the type's
   */
  private appliesTo(relation: RelationPlan, type: string): boolean {
    if (relation.model === type) {
      return true;
    }
    const own = new Set(this.projection(type));
    return this.projection(relation.model).every(column => own.has(column));
  }

  /**
   * The columns and junction rows of an object
   * @param json - the serialized object
   * @param model - the model identifier of the repository, used when the object declares no known `__type`
   * @param partial - only the fields present in the object (a patch), everything of the projection otherwise
   * @returns the row
   */
  toRow(json: Record<string, unknown>, model: string, partial: boolean): RowWrite {
    const type = typeof json.__type === "string" && this.plan.models[json.__type] ? json.__type : model;
    const columns: string[] = [];
    const values: unknown[] = [];
    const handled = new Set<string>(["__type"]);
    const byName = new Map(this.table.columns.map(c => [c.name, c]));
    for (const name of this.projection(type)) {
      const column = byName.get(name);
      if (!column || column.role === "extra") {
        continue;
      }
      if (column.role === "type") {
        if (!partial || "__type" in json) {
          columns.push(name);
          values.push(json.__type ?? null);
        }
        continue;
      }
      handled.add(column.field);
      if (partial && !(column.field in json)) {
        continue;
      }
      columns.push(name);
      values.push(this.referenceValue(json[column.field], column));
    }
    const junctions: JunctionWrite[] = [];
    for (const [attribute, table] of this.junctionTables) {
      const relation = this.relations.get(attribute)!;
      handled.add(attribute);
      if (attribute in json || (!partial && this.appliesTo(relation, type))) {
        junctions.push({ table, relation, rows: this.junctionRows(json, json[attribute], table, relation) });
      }
    }
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
      if (handled.has(key) || value === undefined) {
        continue;
      }
      // A column of the table outside the writer's projection (a subclass field written through the parent): the
      // writer named it, so it is written, never stashed in the extra column where it would shadow nothing
      const named = this.byField.get(key);
      if (named) {
        for (const column of named) {
          columns.push(column.name);
          values.push(this.referenceValue(value, column));
        }
        continue;
      }
      extra[key] = value;
    }
    if (this.extraColumn) {
      if (!partial || Object.keys(extra).length) {
        columns.push(this.extraColumn);
        values.push(JSON.stringify(extra));
      }
    } else if (Object.keys(extra).length) {
      throw new WebdaError.BadRequest(
        `Unknown properties for ${type} in table ${this.table.name}: ${Object.keys(extra).join(", ")}`
      );
    }
    return { columns, values, junctions };
  }

  /**
   * @param value - the serialized attribute
   * @param column - a field or reference column
   * @returns the value of the column: the key part of a composite reference, the encoded value otherwise
   */
  private referenceValue(value: unknown, column: ColumnPlan): unknown {
    const siblings = this.byField.get(column.field)!;
    if (column.role === "reference" && siblings.length > 1) {
      if (value === undefined || value === null) {
        return null;
      }
      const parts = String(value).split(this.relations.get(column.field)!.keySeparator!);
      return parts[siblings.indexOf(column)] ?? null;
    }
    return this.encode(value, column);
  }

  /**
   * @param junction - a junction table
   * @param keyValues - the owner object (its primary key fields)
   * @returns the owner columns of its junction rows
   */
  ownerColumns(junction: TablePlan, keyValues: Record<string, unknown>): Record<string, unknown> {
    const owner: Record<string, unknown> = {};
    for (const column of junction.columns) {
      if (column.role === "owner") {
        owner[column.name] = keyValues[column.keyPart!];
      }
    }
    return owner;
  }

  /**
   * @param json - the owner object
   * @param value - the serialized relation attribute
   * @param table - the junction table
   * @param relation - the relation
   * @returns the junction rows
   */
  private junctionRows(
    json: Record<string, unknown>,
    value: unknown,
    table: TablePlan,
    relation: RelationPlan
  ): Record<string, unknown>[] {
    const owner = this.ownerColumns(table, json);
    const targets = table.columns.filter(c => c.role === "target");
    const fields = table.columns.filter(c => c.role === "field");
    const attributes = table.columns.find(c => c.role === "attributes");
    const separator = relation.keySeparator ?? "_";
    const keyOf = (item: unknown): string => {
      if (typeof item !== "object" || item === null) {
        return String(item);
      }
      const record = item as Record<string, unknown>;
      return targets.map(c => String(record[c.keyPart ?? "uuid"])).join(separator);
    };
    const row = (item: unknown): Record<string, unknown> => {
      const parts = keyOf(item).split(separator);
      const out: Record<string, unknown> = { ...owner };
      targets.forEach((column, i) => (out[column.name] = targets.length === 1 ? parts.join(separator) : parts[i]));
      if (typeof item === "object" && item !== null) {
        const record = item as Record<string, unknown>;
        const taken = new Set([...targets.map(c => c.keyPart ?? "uuid"), ...fields.map(c => c.field)]);
        for (const column of fields) {
          out[column.name] = this.encode(record[column.field], column);
        }
        if (attributes) {
          const rest = Object.fromEntries(Object.entries(record).filter(([k, v]) => !taken.has(k) && v !== undefined));
          out[attributes.name] = Object.keys(rest).length ? JSON.stringify(rest) : null;
        }
      }
      return out;
    };
    if (relation.kind === "linksMap") {
      return Object.entries((value as Record<string, unknown>) ?? {}).map(([key, item]) => ({
        ...row(item),
        [KEY_COLUMN]: key
      }));
    }
    return ((value as unknown[]) ?? []).map((item, i) => ({ ...row(item), [POSITION_COLUMN]: i }));
  }

  /**
   * The JSON of a row: the extra column under the typed columns, references joined, junction rows folded
   * @param row - the row
   * @param junctionRows - the junction rows by attribute
   * @param decodeJson - decoder of the JSON columns of the engine
   * @returns the serialized object, `__type` included when stored
   */
  fromRow(
    row: Record<string, unknown>,
    junctionRows: Map<string, Record<string, unknown>[]>,
    decodeJson: (v: unknown) => unknown
  ): Record<string, unknown> {
    const extra = this.extraColumn !== undefined ? row[this.extraColumn] : undefined;
    const out: Record<string, unknown> =
      extra !== undefined && extra !== null ? { ...(decodeJson(extra) as Record<string, unknown>) } : {};
    const references = new Set<string>();
    for (const column of this.table.columns) {
      if (column.role === "type") {
        if (row[column.name] !== undefined && row[column.name] !== null) {
          out.__type = row[column.name];
        }
      } else if (column.role === "reference" && this.byField.get(column.field)!.length > 1) {
        references.add(column.field);
      } else if (column.role === "field" || column.role === "reference") {
        const value = this.decode(row[column.name], column, decodeJson);
        if (value !== undefined) {
          out[column.field] = value;
        }
      }
    }
    for (const field of references) {
      const parts = this.byField.get(field)!.map(c => row[c.name]);
      if (parts.some(p => p !== undefined && p !== null)) {
        out[field] = parts.join(this.relations.get(field)!.keySeparator!);
      }
    }
    for (const [attribute, rows] of junctionRows) {
      const relation = this.relations.get(attribute);
      const table = this.junctionTables.get(attribute);
      if (relation && table) {
        out[attribute] = this.foldJunction(table, relation, rows, decodeJson);
      }
    }
    return out;
  }

  /**
   * @param table - the junction table
   * @param relation - the relation
   * @param rows - its rows for one owner
   * @param decodeJson - decoder of the JSON columns of the engine
   * @returns the attribute value: keys, items or a map of items
   */
  private foldJunction(
    table: TablePlan,
    relation: RelationPlan,
    rows: Record<string, unknown>[],
    decodeJson: (v: unknown) => unknown
  ): unknown {
    const targets = table.columns.filter(c => c.role === "target");
    const fields = table.columns.filter(c => c.role === "field");
    const attributes = table.columns.find(c => c.role === "attributes");
    const separator = relation.keySeparator ?? "_";
    const key = (row: Record<string, unknown>) => targets.map(c => String(row[c.name])).join(separator);
    const item = (row: Record<string, unknown>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const column of targets) {
        out[column.keyPart ?? "uuid"] = row[column.name];
      }
      for (const column of fields) {
        const value = this.decode(row[column.name], column, decodeJson);
        if (value !== undefined) {
          out[column.field] = value;
        }
      }
      if (attributes) {
        const rest = this.decode(row[attributes.name], attributes, decodeJson);
        Object.assign(out, rest ?? {});
      }
      return out;
    };
    if (relation.kind === "linksMap") {
      return Object.fromEntries(rows.map(row => [String(row[KEY_COLUMN]), item(row)]));
    }
    const sorted = [...rows].sort((a, b) => Number(a[POSITION_COLUMN]) - Number(b[POSITION_COLUMN]));
    return relation.kind === "linksSimpleArray" ? sorted.map(key) : sorted.map(item);
  }
}
