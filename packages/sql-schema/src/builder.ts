import { columnName, constraintName, identifier, mapScalar, typeToString, widestType } from "./columns.js";
import type { DeclaredRelation, JSONSchemaLike, SchemaModelMetadata } from "./metadata.js";
import { declaredRelations, referenceIdentifier, shortName } from "./metadata.js";
import type {
  ColumnPlan,
  ColumnType,
  DeletePolicy,
  ForeignKeyPlan,
  IndexPlan,
  ModelPlan,
  RelationPlan,
  RelationalSchemaPlan,
  SchemaLayoutOptions,
  SchemaWarning,
  TablePlan
} from "./plan.js";

/**
 * Options of {@link RelationalSchemaBuilder}
 */
export interface RelationalSchemaOptions extends Partial<SchemaLayoutOptions> {
  /**
   * Table name per model identifier. A subclass with its own entry gets its own table; the others share the table of
   * their closest planned ancestor. Default name: the identifier lowercased, `/` replaced by `_` (as `SQLStore`)
   */
  tables?: { [identifier: string]: string };
  /**
   * Models outside the plan, to resolve and type the references to them (no foreign key is created to them)
   */
  knownModels?: Iterable<SchemaModelMetadata>;
}

/**
 * The metadata cannot be mapped to a relational schema
 */
export class SchemaBuildError extends Error {
  /**
   * @param message - the reason
   */
  constructor(message: string) {
    super(message);
    this.name = "SchemaBuildError";
  }
}

/**
 * Default layout options
 */
export const DEFAULT_LAYOUT: SchemaLayoutOptions = {
  columnNaming: "preserve",
  extraColumn: "_extra",
  foreignKeys: true,
  numericAsDecimal: false
};

/**
 * Name of the class discriminator column
 */
export const TYPE_COLUMN = "__type";

/**
 * Name of the position column of array junctions
 */
export const POSITION_COLUMN = "_position";

/**
 * Name of the key column of map junctions
 */
export const KEY_COLUMN = "key";

/**
 * Name of the JSON column of link attributes without declared fields
 */
export const ATTRIBUTES_COLUMN = "attributes";

/**
 * A physical key column of a table
 */
interface KeyColumn {
  name: string;
  type: ColumnType;
}

/**
 * A table being built
 */
interface TableDraft {
  name: string;
  /**
   * Members, root first (by depth in the hierarchy)
   */
  members: SchemaModelMetadata[];
  primaryKeyFields: string[];
  primaryKeySeparator?: string;
  columns: Map<string, ColumnPlan & { declaredBy: Set<string> }>;
}

/**
 * Builds the {@link RelationalSchemaPlan} of the models of a store from their compiled metadata
 *
 * Pure: no database, no logging (warnings are returned in the plan), same input same plan. Rules:
 * - one table per model hierarchy (single-table inheritance, `__type` discriminator), unless `tables` names one
 * - one typed column per stored field (`Schemas.Stored`), `NOT NULL` when required
 * - `ModelParent` / `ModelLink`: a column (one per key part for a composite key) with a foreign key, `ON DELETE
 *   CASCADE` for a parent, `NO ACTION` for a link (until the delete policies of #798)
 * - `ModelLinksSimpleArray` / `ModelLinksArray` / `ModelLinksMap`: a junction table `<table>_<attribute>`
 * - `ModelRelated` / `ModelsMapped`: no storage
 * - foreign keys only between models of the plan: a reference to another model gets a column and an index
 */
export class RelationalSchemaBuilder {
  private readonly layout: SchemaLayoutOptions;

  /**
   * @param options - the builder options
   */
  constructor(private readonly options: RelationalSchemaOptions = {}) {
    this.layout = {
      columnNaming: options.columnNaming ?? DEFAULT_LAYOUT.columnNaming,
      extraColumn: options.extraColumn ?? DEFAULT_LAYOUT.extraColumn,
      foreignKeys: options.foreignKeys ?? DEFAULT_LAYOUT.foreignKeys,
      numericAsDecimal: options.numericAsDecimal ?? DEFAULT_LAYOUT.numericAsDecimal
    };
  }

  /**
   * Build the plan
   * @param models - the models handled by the store, subclasses included
   * @returns the plan
   * @throws SchemaBuildError when the models cannot share their tables (primary keys or column types differ)
   */
  build(models: Iterable<SchemaModelMetadata>): RelationalSchemaPlan {
    return new PlanBuilder(this.layout, this.options, models).build();
  }
}

/**
 * Build the plan of the models of a store
 * @param models - the models handled by the store, subclasses included
 * @param options - the builder options
 * @returns the plan
 */
export function buildSchemaPlan(
  models: Iterable<SchemaModelMetadata>,
  options: RelationalSchemaOptions = {}
): RelationalSchemaPlan {
  return new RelationalSchemaBuilder(options).build(models);
}

/**
 * The state of one build
 */
class PlanBuilder {
  private readonly handled = new Map<string, SchemaModelMetadata>();
  private readonly known = new Map<string, SchemaModelMetadata>();
  private readonly tableNames = new Map<string, string>();
  private readonly drafts = new Map<string, TableDraft>();
  private readonly keyColumnsCache = new Map<string, KeyColumn[]>();
  private readonly resolving = new Set<string>();
  private readonly junctions: TablePlan[] = [];
  private readonly relations: RelationPlan[] = [];
  private readonly relationKeys = new Map<string, RelationPlan>();
  private readonly foreignKeys = new Map<string, ForeignKeyPlan>();
  private readonly indexes = new Map<string, IndexPlan>();
  private readonly models: { [identifier: string]: ModelPlan } = {};
  private readonly modelColumns = new Map<string, Set<string>>();
  private readonly warnings: SchemaWarning[] = [];
  private readonly warned = new Set<string>();

  /**
   * @param layout - the layout options
   * @param options - the builder options
   * @param models - the planned models
   */
  constructor(
    private readonly layout: SchemaLayoutOptions,
    private readonly options: RelationalSchemaOptions,
    models: Iterable<SchemaModelMetadata>
  ) {
    for (const meta of [...models].sort((a, b) => a.Identifier.localeCompare(b.Identifier))) {
      this.handled.set(meta.Identifier, meta);
    }
    for (const meta of [...(options.knownModels ?? []), ...this.handled.values()]) {
      this.known.set(meta.Identifier, meta);
    }
  }

  /**
   * @returns the plan
   */
  build(): RelationalSchemaPlan {
    this.groupTables();
    for (const draft of this.drafts.values()) {
      this.buildTable(draft);
    }
    const tables = [...this.drafts.values()].map(draft => this.finishTable(draft));
    return {
      version: 1,
      options: { ...this.layout },
      tables: this.sortTables([...tables, ...this.junctions]),
      foreignKeys: [...this.foreignKeys.values()],
      indexes: [...this.indexes.values()],
      relations: this.relations,
      models: this.models,
      warnings: this.warnings
    };
  }

  /**
   * @param name - a field or derived name
   * @returns its physical column name
   */
  private column(name: string): string {
    return columnName(name, this.layout.columnNaming);
  }

  /**
   * @param meta - a planned model
   * @returns the identifiers of its ancestors, closest first
   */
  private ancestorsOf(meta: SchemaModelMetadata): string[] {
    return (meta.Ancestors ?? []).map(referenceIdentifier).filter((id): id is string => !!id);
  }

  /**
   * @param identifier - a planned model
   * @returns its table name
   */
  private tableOf(identifier: string): string {
    let name = this.tableNames.get(identifier);
    if (name) {
      return name;
    }
    const meta = this.handled.get(identifier)!;
    const ancestor = this.ancestorsOf(meta).find(id => this.handled.has(id));
    name =
      this.options.tables?.[identifier] ??
      (ancestor ? this.tableOf(ancestor) : identifier.toLowerCase().replace(/\//g, "_"));
    this.tableNames.set(identifier, name);
    return name;
  }

  /**
   * Group the models by table, root first
   */
  private groupTables(): void {
    for (const meta of this.handled.values()) {
      const name = this.tableOf(meta.Identifier);
      if (!this.drafts.has(name)) {
        this.drafts.set(name, { name, members: [], primaryKeyFields: [], columns: new Map() });
      }
      this.drafts.get(name)!.members.push(meta);
    }
    for (const draft of this.drafts.values()) {
      const ids = new Set(draft.members.map(m => m.Identifier));
      const depth = (meta: SchemaModelMetadata) => this.ancestorsOf(meta).filter(id => ids.has(id)).length;
      draft.members.sort((a, b) => depth(a) - depth(b));
      const keyed = draft.members.filter(m => m.PrimaryKey?.length);
      if (!keyed.length) {
        throw new SchemaBuildError(
          `Table ${draft.name} has no primary key: none of ${[...ids].join(", ")} declares one`
        );
      }
      for (const meta of keyed) {
        if (meta.PrimaryKey.join("\0") !== keyed[0].PrimaryKey.join("\0")) {
          throw new SchemaBuildError(
            `Models sharing table ${draft.name} have different primary keys: ${keyed[0].Identifier} ` +
              `(${keyed[0].PrimaryKey.join(", ")}) and ${meta.Identifier} (${meta.PrimaryKey.join(", ")})`
          );
        }
      }
      draft.primaryKeyFields = [...keyed[0].PrimaryKey];
      if (draft.primaryKeyFields.length > 1) {
        draft.primaryKeySeparator = keyed.find(m => m.PrimaryKeySeparator)?.PrimaryKeySeparator ?? "_";
      }
    }
  }

  /**
   * @param code - the warning code
   * @param meta - the model
   * @param attribute - the attribute
   * @param message - the message
   */
  private warn(code: SchemaWarning["code"], meta: SchemaModelMetadata, attribute: string | undefined, message: string) {
    const key = `${code}:${meta.Identifier}:${attribute}`;
    if (this.warned.has(key)) {
      return;
    }
    this.warned.add(key);
    this.warnings.push({ code, model: meta.Identifier, ...(attribute ? { attribute } : {}), message });
  }

  /**
   * @param meta - a model
   * @param field - a field
   * @returns its stored schema and whether it is required
   */
  private fieldSchema(meta: SchemaModelMetadata, field: string): { schema?: JSONSchemaLike; required: boolean } {
    const stored = meta.Schemas?.Stored;
    return {
      schema: stored?.properties?.[field],
      required: !!stored?.required?.includes(field)
    };
  }

  /**
   * Resolve the target of a relation
   * @param meta - the declaring model
   * @param relation - the relation
   * @returns the target model, undefined when unknown (a warning is raised)
   */
  private resolveTarget(meta: SchemaModelMetadata, relation: DeclaredRelation): SchemaModelMetadata | undefined {
    if (!relation.target) {
      this.warn("UNRESOLVED_TARGET", meta, relation.attribute, `No target model declared for ${relation.attribute}`);
      return undefined;
    }
    const target = this.known.get(relation.target);
    if (!target) {
      this.warn("UNRESOLVED_TARGET", meta, relation.attribute, `Unknown target model ${relation.target}`);
    }
    return target;
  }

  /**
   * Physical primary key columns of a model: those of its table when planned, derived from its own metadata otherwise
   * @param target - the model
   * @returns the key columns, a single `text` column when they cannot be derived
   */
  private keyColumnsOf(target: SchemaModelMetadata): KeyColumn[] {
    const planned = this.handled.has(target.Identifier);
    const cacheKey = planned ? `table:${this.tableOf(target.Identifier)}` : `model:${target.Identifier}`;
    const cached = this.keyColumnsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    if (this.resolving.has(cacheKey)) {
      // A key referencing itself through other keys: cannot be typed
      return [{ name: "", type: { kind: "text" } }];
    }
    this.resolving.add(cacheKey);
    const draft = planned ? this.drafts.get(this.tableOf(target.Identifier))! : undefined;
    const members = draft?.members ?? [target];
    const fields = draft?.primaryKeyFields ?? target.PrimaryKey ?? [];
    const columns: KeyColumn[] = [];
    for (const field of fields) {
      const owner =
        members.find(m => declaredRelations(m).has(field)) ?? members.find(m => this.fieldSchema(m, field).schema);
      const relation = owner ? declaredRelations(owner).get(field) : undefined;
      if (owner && relation && (relation.kind === "parent" || relation.kind === "link")) {
        columns.push(...this.referenceColumns(owner, relation, false).map(({ name, type }) => ({ name, type })));
        continue;
      }
      columns.push({ name: this.column(field), type: this.keyType(owner, field) });
    }
    this.resolving.delete(cacheKey);
    const result = columns.length ? columns : [{ name: "", type: { kind: "text" } as ColumnType }];
    this.keyColumnsCache.set(cacheKey, result);
    return result;
  }

  /**
   * @param meta - the model declaring the key field
   * @param field - the key field
   * @returns the column type of the key field, without enum
   */
  private keyType(meta: SchemaModelMetadata | undefined, field: string): ColumnType {
    const type = meta
      ? mapScalar(this.fieldSchema(meta, field).schema, meta.Reflection?.[field]?.type, this.layout).type
      : undefined;
    // A key is compared as text: JSON is never a key type
    return !type || type.kind === "json" ? { kind: "text" } : type;
  }

  /**
   * Columns holding a reference (`ModelParent` / `ModelLink`)
   * @param meta - the declaring model
   * @param relation - the relation
   * @param warn - raise the resolution warnings
   * @returns the columns: `<attribute>` for a single key, `<attribute>_<key column>` for a composite key
   */
  private referenceColumns(
    meta: SchemaModelMetadata,
    relation: DeclaredRelation,
    warn = true
  ): (KeyColumn & { keyPart?: string })[] {
    const target = warn ? this.resolveTarget(meta, relation) : this.quietTarget(relation);
    const keys = target ? this.keyColumnsOf(target) : [];
    if (keys.length <= 1) {
      const fallback = mapScalar(this.fieldSchema(meta, relation.attribute).schema, undefined, this.layout).type;
      return [
        {
          name: this.column(relation.attribute),
          type: keys[0]?.type ?? (fallback.kind === "json" ? { kind: "text" } : fallback),
          ...(keys[0]?.name ? { keyPart: keys[0].name } : {})
        }
      ];
    }
    return keys.map(key => ({
      name: this.column(`${relation.attribute}_${key.name}`),
      type: key.type,
      keyPart: key.name
    }));
  }

  /**
   * @param relation - the relation
   * @returns the target, without warning
   */
  private quietTarget(relation: DeclaredRelation): SchemaModelMetadata | undefined {
    return relation.target ? this.known.get(relation.target) : undefined;
  }

  /**
   * Add a column to a table, merging it with the same column declared by another model of the table
   * @param draft - the table
   * @param meta - the declaring model
   * @param column - the column
   */
  private addColumn(draft: TableDraft, meta: SchemaModelMetadata, column: ColumnPlan): void {
    const existing = draft.columns.get(column.name);
    if (!existing) {
      draft.columns.set(column.name, { ...column, declaredBy: new Set([meta.Identifier]) });
      return;
    }
    if (existing.field !== column.field || existing.role !== column.role) {
      throw new SchemaBuildError(
        `Column ${draft.name}.${column.name} is used by both ${existing.role} ${existing.field} and ` +
          `${column.role} ${column.field} (${meta.Identifier})`
      );
    }
    const type = widestType(existing.type, column.type);
    if (!type) {
      throw new SchemaBuildError(
        `Column ${draft.name}.${column.name} has type ${typeToString(existing.type)} in ` +
          `${[...existing.declaredBy].join(", ")} and ${typeToString(column.type)} in ${meta.Identifier}`
      );
    }
    existing.type = type;
    existing.nullable ||= column.nullable;
    if (existing.enum && column.enum) {
      existing.enum = [...new Set([...existing.enum, ...column.enum])];
    } else {
      delete existing.enum;
    }
    existing.declaredBy.add(meta.Identifier);
  }

  /**
   * @param meta - a model
   * @param column - a column it uses
   */
  private useColumn(meta: SchemaModelMetadata, column: string): void {
    if (!this.modelColumns.has(meta.Identifier)) {
      this.modelColumns.set(meta.Identifier, new Set());
    }
    this.modelColumns.get(meta.Identifier)!.add(column);
  }

  /**
   * Plan the columns, references and junctions of a table
   * @param draft - the table
   */
  private buildTable(draft: TableDraft): void {
    const reserved = new Set([TYPE_COLUMN, ...(this.layout.extraColumn ? [this.layout.extraColumn] : [])]);
    for (const meta of draft.members) {
      const relations = declaredRelations(meta);
      const stored = meta.Schemas?.Stored?.properties ?? {};
      const fields = [...new Set([...draft.primaryKeyFields, ...Object.keys(stored), ...relations.keys()])];
      for (const field of fields) {
        if (field === TYPE_COLUMN) {
          continue;
        }
        const relation = relations.get(field);
        if (relation && relation.kind !== "parent" && relation.kind !== "link") {
          if (relation.kind === "query" || relation.kind === "map") {
            this.addRelation(draft, meta, relation, { kind: "none" });
          } else {
            this.addJunction(draft, meta, relation);
          }
          continue;
        }
        const { schema, required } = this.fieldSchema(meta, field);
        const isKey = draft.primaryKeyFields.includes(field);
        if (relation) {
          const columns = this.referenceColumns(meta, relation, !this.isRecorded(draft, relation));
          for (const column of columns) {
            this.checkReserved(reserved, draft, meta, column.name);
            this.addColumn(draft, meta, {
              name: column.name,
              field,
              ...(column.keyPart ? { keyPart: column.keyPart } : {}),
              role: "reference",
              type: column.type,
              nullable: !isKey && !required
            });
            this.useColumn(meta, column.name);
          }
          this.addReference(draft, meta, relation, columns);
          continue;
        }
        const mapping = mapScalar(schema, meta.Reflection?.[field]?.type, this.layout);
        const name = this.column(field);
        this.checkReserved(reserved, draft, meta, name);
        this.addColumn(draft, meta, {
          name,
          field,
          role: "field",
          type: isKey ? this.keyType(meta, field) : mapping.type,
          nullable: !isKey && (!required || mapping.nullable),
          ...(mapping.enum && !isKey ? { enum: mapping.enum } : {})
        });
        this.useColumn(meta, name);
      }
    }
  }

  /**
   * @param reserved - the system column names
   * @param draft - the table
   * @param meta - the model
   * @param name - a column name
   */
  private checkReserved(reserved: Set<string>, draft: TableDraft, meta: SchemaModelMetadata, name: string): void {
    if (reserved.has(name)) {
      throw new SchemaBuildError(
        `Column ${draft.name}.${name} of ${meta.Identifier} is reserved: rename the field or change extraColumn`
      );
    }
  }

  /**
   * Record a relation once per table and attribute: the subclasses inherit the relations of their ancestors
   * @param draft - the table of the declaring model
   * @param meta - the declaring model
   * @param relation - the relation
   * @param storage - where it lives
   * @param details - target, constraint and key separator
   * @returns the recorded relation, undefined when an ancestor already declared it
   */
  private addRelation(
    draft: TableDraft,
    meta: SchemaModelMetadata,
    relation: DeclaredRelation,
    storage: RelationPlan["storage"],
    details: Partial<RelationPlan> = {}
  ): RelationPlan | undefined {
    const key = `${draft.name}\0${relation.attribute}`;
    const target = details.target ?? this.quietTarget(relation)?.Identifier;
    const existing = this.relationKeys.get(key);
    if (existing) {
      if (existing.kind !== relation.kind || existing.target !== target) {
        throw new SchemaBuildError(
          `${meta.Identifier}.${relation.attribute} is a ${relation.kind} to ${target} but ${existing.model} ` +
            `declares it as a ${existing.kind} to ${existing.target} in table ${draft.name}`
        );
      }
      return undefined;
    }
    const plan: RelationPlan = {
      model: meta.Identifier,
      attribute: relation.attribute,
      kind: relation.kind,
      ...(target ? { target } : {}),
      ...(relation.targetAttribute ? { targetAttribute: relation.targetAttribute } : {}),
      ...(relation.unique ? { unique: true } : {}),
      ...details,
      storage
    };
    this.relationKeys.set(key, plan);
    this.relations.push(plan);
    return plan;
  }

  /**
   * @param draft - a table
   * @param relation - a relation
   * @returns whether a model of the table (an ancestor) already recorded the relation
   */
  private isRecorded(draft: TableDraft, relation: DeclaredRelation): boolean {
    return this.relationKeys.has(`${draft.name}\0${relation.attribute}`);
  }

  /**
   * Foreign key (or index only) of a reference
   * @param draft - the table
   * @param meta - the declaring model
   * @param relation - the relation
   * @param columns - its columns
   */
  private addReference(
    draft: TableDraft,
    meta: SchemaModelMetadata,
    relation: DeclaredRelation,
    columns: (KeyColumn & { keyPart?: string })[]
  ): void {
    const names = columns.map(c => c.name);
    if (this.isRecorded(draft, relation)) {
      // Inherited: check it matches
      this.addRelation(draft, meta, relation, { kind: "columns", columns: names });
      return;
    }
    const target = this.quietTarget(relation);
    const onDelete: DeletePolicy = relation.kind === "parent" ? "CASCADE" : "NO ACTION";
    const foreignKey = this.constraintTo(draft.name, names, meta, relation, target, onDelete);
    const separator = columns.length > 1 ? this.separatorOf(target) : undefined;
    this.addRelation(
      draft,
      meta,
      relation,
      { kind: "columns", columns: names },
      {
        ...(target ? { target: target.Identifier } : {}),
        ...(foreignKey ? { foreignKey: foreignKey.name, onDelete } : {}),
        ...(separator ? { keySeparator: separator } : {})
      }
    );
    if (!this.isKeyPrefix(draft, names)) {
      this.addIndex(draft.name, names, !!relation.unique);
    }
  }

  /**
   * @param target - a model
   * @returns the separator of its composite key
   */
  private separatorOf(target: SchemaModelMetadata | undefined): string {
    if (target && this.handled.has(target.Identifier)) {
      return this.drafts.get(this.tableOf(target.Identifier))!.primaryKeySeparator ?? "_";
    }
    return target?.PrimaryKeySeparator ?? "_";
  }

  /**
   * @param draft - a table
   * @param columns - columns
   * @returns whether the columns start the primary key (already indexed by it)
   */
  private isKeyPrefix(draft: TableDraft, columns: string[]): boolean {
    const key = this.primaryKeyColumns(draft);
    return columns.every((column, i) => key[i] === column);
  }

  /**
   * Create the foreign key to the target table when it is planned, warn otherwise
   * @param table - the referencing table
   * @param columns - the referencing columns
   * @param meta - the declaring model
   * @param relation - the relation
   * @param target - the target model
   * @param onDelete - the delete policy
   * @returns the constraint, undefined when none is created
   */
  private constraintTo(
    table: string,
    columns: string[],
    meta: SchemaModelMetadata,
    relation: DeclaredRelation,
    target: SchemaModelMetadata | undefined,
    onDelete: DeletePolicy
  ): ForeignKeyPlan | undefined {
    if (!target) {
      return undefined;
    }
    if (!this.handled.has(target.Identifier)) {
      this.warn(
        "CROSS_STORE_REFERENCE",
        meta,
        relation.attribute,
        `${target.Identifier} is not stored by this store: ${relation.attribute} gets a column and an index, no foreign key`
      );
      return undefined;
    }
    if (!this.layout.foreignKeys) {
      return undefined;
    }
    const targetDraft = this.drafts.get(this.tableOf(target.Identifier))!;
    return this.addForeignKey(table, columns, targetDraft.name, this.primaryKeyColumns(targetDraft), onDelete);
  }

  /**
   * @param table - the referencing table
   * @param columns - the referencing columns
   * @param references - the referenced table
   * @param referenced - the referenced columns
   * @param onDelete - the delete policy
   * @returns the constraint
   */
  private addForeignKey(
    table: string,
    columns: string[],
    references: string,
    referenced: string[],
    onDelete: DeletePolicy
  ): ForeignKeyPlan {
    const name = constraintName("fk", table, columns);
    const foreignKey = this.foreignKeys.get(name) ?? {
      name,
      table,
      columns,
      references: { table: references, columns: referenced },
      onDelete
    };
    this.foreignKeys.set(name, foreignKey);
    return foreignKey;
  }

  /**
   * @param table - the table
   * @param columns - the columns
   * @param unique - a unique index
   */
  private addIndex(table: string, columns: string[], unique: boolean): void {
    const name = constraintName(unique ? "uq" : "idx", table, columns);
    if (!this.indexes.has(name)) {
      this.indexes.set(name, { name, table, columns, unique });
    }
  }

  /**
   * @param draft - a model table
   * @returns its primary key column names
   */
  private primaryKeyColumns(draft: TableDraft): string[] {
    return this.keyColumnsOf(draft.members[0]).map(c => c.name);
  }

  /**
   * Plan the junction table of a `linksSimpleArray`, `linksArray` or `linksMap` relation
   * @param draft - the owner table
   * @param meta - the declaring model
   * @param relation - the relation
   */
  private addJunction(draft: TableDraft, meta: SchemaModelMetadata, relation: DeclaredRelation): void {
    const kind = relation.kind as "linksSimpleArray" | "linksArray" | "linksMap";
    const name = identifier(`${draft.name}_${this.column(relation.attribute)}`);
    if (this.isRecorded(draft, relation)) {
      // Inherited: check it matches
      this.addRelation(draft, meta, relation, { kind: "junction", table: name });
      return;
    }
    const target = this.resolveTarget(meta, relation);
    this.addRelation(draft, meta, relation, { kind: "junction", table: name });
    if (this.drafts.has(name) || this.junctions.some(j => j.name === name)) {
      throw new SchemaBuildError(`Junction table ${name} of ${meta.Identifier}.${relation.attribute} already exists`);
    }
    const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);
    const ownerPrefix = this.column(lowerFirst(shortName(draft.members[0])));
    let targetPrefix = this.column(
      lowerFirst(target ? shortName(target) : (relation.target ?? relation.attribute).split("/").pop()!)
    );
    if (targetPrefix === ownerPrefix) {
      targetPrefix = this.column(relation.attribute);
    }
    const ownerKeys = this.keyColumnsOf(draft.members[0]);
    const targetKeys = target ? this.keyColumnsOf(target) : [{ name: "", type: { kind: "text" } as ColumnType }];
    const keyColumns = (prefix: string, keys: KeyColumn[], role: "owner" | "target"): ColumnPlan[] =>
      keys.map(key => ({
        name: keys.length === 1 ? prefix : this.column(`${prefix}_${key.name}`),
        field: "",
        ...(key.name ? { keyPart: key.name } : {}),
        role,
        type: key.type,
        nullable: false
      }));
    const owner = keyColumns(ownerPrefix, ownerKeys, "owner");
    const targets = keyColumns(targetPrefix, targetKeys, "target");
    const columns: ColumnPlan[] = [...owner, ...targets];
    let primaryKey: string[];
    if (kind === "linksMap") {
      columns.push({ name: KEY_COLUMN, field: "", role: "key", type: { kind: "text" }, nullable: false });
      primaryKey = [...owner.map(c => c.name), KEY_COLUMN];
    } else {
      columns.push({ name: POSITION_COLUMN, field: "", role: "position", type: { kind: "bigint" }, nullable: false });
      primaryKey = [...owner.map(c => c.name), ...targets.map(c => c.name)];
    }
    if (kind !== "linksSimpleArray") {
      columns.push(...this.linkAttributeColumns(meta, relation, kind, target, new Set(columns.map(c => c.name))));
    }
    this.junctions.push({
      name,
      models: [],
      junction: { model: meta.Identifier, attribute: relation.attribute, kind },
      primaryKey,
      columns
    });
    if (this.layout.foreignKeys) {
      this.addForeignKey(
        name,
        owner.map(c => c.name),
        draft.name,
        this.primaryKeyColumns(draft),
        "CASCADE"
      );
    }
    const targetForeignKey = this.constraintTo(
      name,
      targets.map(c => c.name),
      meta,
      relation,
      target,
      "NO ACTION"
    );
    if (targetForeignKey) {
      const recorded = this.relationKeys.get(`${draft.name}\0${relation.attribute}`)!;
      recorded.foreignKey = targetForeignKey.name;
      recorded.onDelete = "NO ACTION";
    }
    // Reverse lookups: the target columns do not start the primary key
    this.addIndex(
      name,
      targets.map(c => c.name),
      false
    );
  }

  /**
   * Columns of the attributes of a `linksArray` / `linksMap` link: one per declared field, a JSON column otherwise
   * @param meta - the declaring model
   * @param relation - the relation
   * @param kind - the relation kind
   * @param target - the target model
   * @param taken - the key column names
   * @returns the columns
   */
  private linkAttributeColumns(
    meta: SchemaModelMetadata,
    relation: DeclaredRelation,
    kind: "linksArray" | "linksMap",
    target: SchemaModelMetadata | undefined,
    taken: Set<string>
  ): ColumnPlan[] {
    const schema = this.fieldSchema(meta, relation.attribute).schema;
    const item = kind === "linksArray" ? schema?.items : schema?.additionalProperties;
    const { properties, required } = collectProperties(
      Array.isArray(item) || typeof item !== "object" ? undefined : item
    );
    const keys = new Set(target?.PrimaryKey ?? []);
    const columns: ColumnPlan[] = [];
    for (const [field, property] of Object.entries(properties)) {
      if (keys.has(field)) {
        continue;
      }
      const mapping = mapScalar(property, undefined, this.layout);
      const name = this.column(field);
      if (taken.has(name)) {
        throw new SchemaBuildError(
          `Link attribute ${field} of ${meta.Identifier}.${relation.attribute} conflicts with the junction column ${name}`
        );
      }
      columns.push({
        name,
        field,
        role: "field",
        type: mapping.type,
        nullable: !required.has(field) || mapping.nullable,
        ...(mapping.enum ? { enum: mapping.enum } : {})
      });
    }
    if (!columns.length) {
      columns.push({ name: ATTRIBUTES_COLUMN, field: "", role: "attributes", type: { kind: "json" }, nullable: true });
    }
    return columns;
  }

  /**
   * Turn a draft into its table plan, with its system columns and model projections
   * @param draft - the table
   * @returns the table plan
   */
  private finishTable(draft: TableDraft): TablePlan {
    const primaryKey = this.primaryKeyColumns(draft);
    const columns: ColumnPlan[] = [];
    for (const { declaredBy, ...column } of draft.columns.values()) {
      columns.push({
        ...column,
        nullable: !primaryKey.includes(column.name) && (column.nullable || declaredBy.size < draft.members.length)
      });
    }
    columns.sort((a, b) => rank(primaryKey, a.name) - rank(primaryKey, b.name));
    columns.push({ name: TYPE_COLUMN, field: "", role: "type", type: { kind: "text" }, nullable: false });
    if (this.layout.extraColumn) {
      columns.push({ name: this.layout.extraColumn, field: "", role: "extra", type: { kind: "json" }, nullable: true });
    }
    this.addIndex(draft.name, [TYPE_COLUMN], false);
    for (const meta of draft.members) {
      const used = this.modelColumns.get(meta.Identifier) ?? new Set();
      [...primaryKey, TYPE_COLUMN, ...(this.layout.extraColumn ? [this.layout.extraColumn] : [])].forEach(c =>
        used.add(c)
      );
      this.models[meta.Identifier] = {
        table: draft.name,
        columns: columns.filter(c => used.has(c.name)).map(c => c.name)
      };
    }
    return {
      name: draft.name,
      root: draft.members[0].Identifier,
      models: draft.members.map(m => m.Identifier),
      primaryKey,
      ...(draft.primaryKeySeparator ? { primaryKeySeparator: draft.primaryKeySeparator } : {}),
      columns
    };
  }

  /**
   * Order the tables so that a referenced table is created before the tables referencing it (cycles keep the
   * declaration order: their foreign keys are added once every table exists)
   * @param tables - the tables
   * @returns the sorted tables
   */
  private sortTables(tables: TablePlan[]): TablePlan[] {
    const byName = new Map(tables.map(t => [t.name, t]));
    const dependencies = new Map<string, Set<string>>(tables.map(t => [t.name, new Set()]));
    for (const fk of this.foreignKeys.values()) {
      if (fk.table !== fk.references.table) {
        dependencies.get(fk.table)?.add(fk.references.table);
      }
    }
    const sorted: TablePlan[] = [];
    const state = new Map<string, "visiting" | "done">();
    const visit = (name: string) => {
      if (state.has(name)) {
        return;
      }
      state.set(name, "visiting");
      for (const dependency of dependencies.get(name) ?? []) {
        visit(dependency);
      }
      state.set(name, "done");
      sorted.push(byName.get(name)!);
    };
    tables.forEach(t => visit(t.name));
    return sorted;
  }
}

/**
 * @param primaryKey - the primary key columns
 * @param name - a column
 * @returns its sort rank: key columns first, in key order
 */
function rank(primaryKey: string[], name: string): number {
  const index = primaryKey.indexOf(name);
  return index === -1 ? primaryKey.length : index;
}

/**
 * The properties of an object schema, merged through `allOf`
 * @param schema - the schema
 * @returns the properties and the required ones
 */
export function collectProperties(schema: JSONSchemaLike | undefined): {
  properties: { [name: string]: JSONSchemaLike };
  required: Set<string>;
} {
  const properties: { [name: string]: JSONSchemaLike } = {};
  const required = new Set<string>();
  const visit = (current: JSONSchemaLike | undefined) => {
    if (!current || typeof current !== "object") {
      return;
    }
    Object.assign(properties, current.properties ?? {});
    current.required?.forEach(r => required.add(r));
    current.allOf?.forEach(visit);
  };
  visit(schema);
  return { properties, required };
}
