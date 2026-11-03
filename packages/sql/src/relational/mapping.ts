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
 * - `mapped`: a `ModelsMapped` filled on read from the table of its model, see {@link MappedSource}
 * - `extra`: an unknown field kept in the extra JSON column
 * - `unknown`: an unknown field and no extra column
 */
export type AttributeTarget =
  | { kind: "column"; column: ColumnPlan }
  | { kind: "json"; column: ColumnPlan; path: string[] }
  | { kind: "reference"; columns: ColumnPlan[]; relation: RelationPlan }
  | { kind: "junction"; table: TablePlan; relation: RelationPlan }
  | { kind: "mapped"; source: MappedSource }
  | { kind: "extra"; column: ColumnPlan; path: string[] }
  | { kind: "unknown" };

/**
 * A `ModelsMapped` attribute the store fills on read: its model is planned by the same store and links to this table
 * through a reference (columns) or a link collection (junction)
 */
export interface MappedSource {
  /**
   * The `map` relation of this table
   */
  relation: RelationPlan;
  /**
   * The table of the mapped model
   */
  table: TablePlan;
  /**
   * The mapping of that table
   */
  mapping: TableMapping;
  /**
   * The `__type` values of the mapped model and of its subclasses
   */
  types: string[];
  /**
   * The mapped model is the root of its table: its rows without `__type` are its own
   */
  untyped: boolean;
  /**
   * How a row of the mapped model links to this table: its reference columns, or the junction table of its link
   * collection
   */
  link: { kind: "columns"; columns: ColumnPlan[] } | { kind: "junction"; table: TablePlan };
}

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
  private mappedSources?: Map<string, MappedSource>;

  /**
   * @param plan - the plan
   * @param table - the table of the models
   * @param isA - whether a model is a subclass of another (the plan does not keep the hierarchy): the projections are
   *   compared without it
   */
  constructor(
    readonly plan: RelationalSchemaPlan,
    readonly table: TablePlan,
    private readonly isA?: (type: string, model: string) => boolean
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
    const source = this.mapped().get(head);
    if (source) {
      return { kind: "mapped", source };
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
   * The `ModelsMapped` attributes of the models of the table the store fills on read, computed once (the mapping of
   * a mapped table is built lazily: two tables may map each other)
   * @returns the sources, by attribute
   */
  mapped(): Map<string, MappedSource> {
    if (this.mappedSources) {
      return this.mappedSources;
    }
    this.mappedSources = new Map();
    for (const relation of this.relations.values()) {
      const source = relation.kind === "map" ? this.mappedSource(relation) : undefined;
      if (source) {
        this.mappedSources.set(relation.attribute, source);
      }
    }
    return this.mappedSources;
  }

  /**
   * @param relation - a `map` relation of the table
   * @returns where its items come from, undefined when its model is not planned here or does not link to this table
   */
  private mappedSource(relation: RelationPlan): MappedSource | undefined {
    const target = relation.target;
    const table = this.plan.tables.find(t => !t.junction && t.models.includes(target!));
    const link =
      table &&
      this.plan.relations.find(
        r =>
          r.attribute === relation.targetAttribute &&
          table.models.includes(r.model) &&
          r.target !== undefined &&
          this.table.models.includes(r.target)
      );
    if (!table || !link) {
      return undefined;
    }
    const mapping = table === this.table ? this : new TableMapping(this.plan, table, this.isA);
    const storage = link.storage;
    return {
      relation,
      table,
      mapping,
      types: table.models.filter(model => mapping.appliesTo(target!, model)),
      untyped: table.root === target,
      link:
        storage.kind === "junction"
          ? { kind: "junction", table: this.plan.tables.find(t => t.name === storage.table)! }
          : {
              kind: "columns",
              columns: table.columns.filter(c => c.role === "reference" && c.field === link.attribute)
            }
    };
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
      // A Date (serialized to ISO before reaching the mapping) or an ISO date-time keeps its calendar day
      return (value instanceof Date ? value.toISOString() : String(value)).slice(0, 10);
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
      // A JSON null reads as an absent field, like a SQL NULL (pg decodes both alike)
      const decoded = decodeJson(value);
      return decoded === null ? undefined : decoded;
    }
    if (value instanceof Date) {
      // pg parses a DATE as a local-midnight Date: its local calendar day is the stored day
      return kind === "date" ? localDay(value) : value.toISOString();
    }
    if (NUMBER_KINDS.has(kind) && typeof value === "string") {
      return Number(value);
    }
    if (kind === "boolean" && typeof value === "number") {
      return value !== 0;
    }
    return value;
  }

  /**
   * Whether what a model declares applies to objects of a type: the same model, or an ancestor (without the
   * hierarchy: a model whose projection is included in the type's)
   * @param model - the declaring model
   * @param type - the model identifier of the object
   * @returns true when the type is the model or one of its subclasses
   */
  appliesTo(model: string, type: string): boolean {
    if (model === type) {
      return true;
    }
    if (this.isA) {
      return this.isA(type, model);
    }
    const own = new Set(this.projection(type));
    return this.projection(model).every(column => own.has(column));
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
    // A filled ModelsMapped is read from its model: never written
    for (const attribute of this.mapped().keys()) {
      handled.add(attribute);
    }
    const junctions: JunctionWrite[] = [];
    for (const [attribute, table] of this.junctionTables) {
      const relation = this.relations.get(attribute)!;
      handled.add(attribute);
      if (attribute in json || (!partial && this.appliesTo(relation.model, type))) {
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
