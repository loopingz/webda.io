/**
 * Engine-neutral column type: each store maps it to its own DDL type (`TEXT`, `DataTypes.STRING(n)`, ...)
 */
export type ColumnType =
  | { kind: "text" }
  | { kind: "varchar"; length: number }
  | { kind: "timestamptz" }
  | { kind: "date" }
  | { kind: "uuid" }
  | { kind: "bigint" }
  | { kind: "double" }
  | { kind: "decimal" }
  | { kind: "boolean" }
  | { kind: "json" };

/**
 * What a column holds
 *
 * - `field`: a model field (scalar or JSON)
 * - `reference`: the key (or one key part) of a linked model (`ModelLink`, `ModelParent`)
 * - `type`: the `__type` class discriminator
 * - `extra`: the JSON column keeping the properties the schema does not know
 * - `owner` / `target`: the keys of a junction row
 * - `position`: the index of the link in its array
 * - `key`: the key of the link in its map
 * - `attributes`: the JSON column holding the link attributes when they have no declared field
 */
export type ColumnRole =
  "field" | "reference" | "type" | "extra" | "owner" | "target" | "position" | "key" | "attributes";

/**
 * A column of a table
 */
export interface ColumnPlan {
  /**
   * Physical column name (after `columnNaming`)
   */
  name: string;
  /**
   * The model field the column holds: the attribute for `field`/`reference`, the link attribute field for junction
   * attribute columns, empty for the system columns
   */
  field: string;
  /**
   * For a `reference`, `owner` or `target` column: the primary key field of the referenced model it holds
   */
  keyPart?: string;
  role: ColumnRole;
  type: ColumnType;
  /**
   * Whether the model allows the value to be absent. A store may still create the column nullable (see the
   * multi-version rules of #838: `NOT NULL` is only applied in the contract phase)
   */
  nullable: boolean;
  /**
   * Allowed values (`CHECK (col IN (...))`)
   */
  enum?: string[];
}

/**
 * `ON DELETE` clause of a foreign key, in SQL
 *
 * Derived from the `DeletePolicy` of the relation (`@webda/models`), see {@link foreignKeyAction}
 */
export type ForeignKeyAction = "CASCADE" | "RESTRICT" | "SET NULL" | "NO ACTION";

/**
 * A foreign key constraint
 *
 * Stores create every table first and the constraints afterwards (deferrable), so self references and cycles work.
 */
export interface ForeignKeyPlan {
  name: string;
  table: string;
  columns: string[];
  references: {
    table: string;
    columns: string[];
  };
  onDelete: ForeignKeyAction;
}

/**
 * An index
 */
export interface IndexPlan {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

/**
 * Kind of a relation, from `Metadata.Relations` (the compiler records the aliases as the type they resolve to)
 *
 * - `parent`: `ModelParent` / `BelongTo`
 * - `link`: `ModelLink` / `RelateTo` / `ManyToOne` / `OneToOne`
 * - `linksSimpleArray`: `ModelLinksSimpleArray`
 * - `linksArray`: `ModelLinksArray` / `ManyToMany` / `Contains`
 * - `linksMap`: `ModelLinksMap`
 * - `query`: `ModelRelated` / `OneToMany`, the reverse side of a link: no storage
 * - `map`: `ModelsMapped`, denormalized copies: no storage
 */
export type RelationKind = "parent" | "link" | "linksSimpleArray" | "linksArray" | "linksMap" | "query" | "map";

/**
 * Where a relation lives
 */
export type RelationStorage =
  { kind: "columns"; columns: string[] } | { kind: "junction"; table: string } | { kind: "none" };

/**
 * A relation of a model
 */
export interface RelationPlan {
  /**
   * Model declaring the relation
   */
  model: string;
  attribute: string;
  kind: RelationKind;
  /**
   * Identifier of the related model, undefined when it cannot be resolved
   */
  target?: string;
  /**
   * For a `query`: the attribute of the target model linking back to this model
   */
  targetAttribute?: string;
  /**
   * `OneToOne`: one row at most per target
   */
  unique?: boolean;
  /**
   * `ON DELETE` of the constraint, when one is created
   */
  onDelete?: ForeignKeyAction;
  /**
   * Name of the foreign key constraint, undefined when the target is not in this plan or foreign keys are disabled
   */
  foreignKey?: string;
  /**
   * Separator joining the target composite key into the string the model stores
   */
  keySeparator?: string;
  storage: RelationStorage;
}

/**
 * A junction table: the rows of a `linksSimpleArray`, `linksArray` or `linksMap` relation
 */
export interface JunctionPlan {
  /**
   * Model declaring the relation
   */
  model: string;
  attribute: string;
  kind: "linksSimpleArray" | "linksArray" | "linksMap";
}

/**
 * A table
 */
export interface TablePlan {
  name: string;
  /**
   * For a model table: the model it was declared for, owner of rows without `__type`
   */
  root?: string;
  /**
   * For a model table: every model stored in it (single-table inheritance)
   */
  models: string[];
  /**
   * Set on junction tables
   */
  junction?: JunctionPlan;
  /**
   * Primary key column names
   */
  primaryKey: string[];
  /**
   * Separator joining a composite primary key into a string
   */
  primaryKeySeparator?: string;
  columns: ColumnPlan[];
}

/**
 * What a model reads and writes: its projection of the table
 */
export interface ModelPlan {
  table: string;
  /**
   * Columns the model uses (its fields, references, `__type` and the extra column), in table order
   */
  columns: string[];
}

/**
 * Options of the builder that change the physical layout: two plans built with different options are incompatible
 */
export interface SchemaLayoutOptions {
  /**
   * `preserve` keeps the field names (quoted camelCase), `snake_case` converts them
   */
  columnNaming: "preserve" | "snake_case";
  /**
   * Name of the JSON column keeping unknown properties, false to have none
   */
  extraColumn: string | false;
  /**
   * Create foreign key constraints between the tables of the plan
   */
  foreignKeys: boolean;
  /**
   * Map JSON schema `number` to `decimal` instead of `double`
   */
  numericAsDecimal: boolean;
}

/**
 * A warning raised while building, for the store to log
 */
export interface SchemaWarning {
  code: "CROSS_STORE_REFERENCE" | "UNRESOLVED_TARGET";
  model: string;
  attribute?: string;
  message: string;
}

/**
 * The relational schema of the models of a store: a pure function of their metadata
 */
export interface RelationalSchemaPlan {
  /**
   * Format version of the plan
   */
  version: 1;
  options: SchemaLayoutOptions;
  /**
   * Tables in creation order: a referenced table comes before the tables referencing it (cycles excepted)
   */
  tables: TablePlan[];
  foreignKeys: ForeignKeyPlan[];
  indexes: IndexPlan[];
  relations: RelationPlan[];
  models: { [identifier: string]: ModelPlan };
  warnings: SchemaWarning[];
}
