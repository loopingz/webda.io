import type { JSONSchemaLike } from "./metadata.js";
import type { ColumnType, SchemaLayoutOptions } from "./plan.js";

/**
 * Longest identifier every supported engine accepts (PostgreSQL truncates at 63 bytes)
 */
export const MAX_IDENTIFIER_LENGTH = 63;

/**
 * The column type of a schema property
 */
export interface ScalarMapping {
  type: ColumnType;
  /**
   * The schema itself allows null (`type: ["string", "null"]`, `anyOf` with a null branch)
   */
  nullable: boolean;
  enum?: string[];
  /**
   * Enum values that are not strings, left out of `enum`
   */
  ignoredEnumValues?: unknown[];
}

/**
 * @param schema - a schema
 * @returns whether it only accepts null
 */
function isNullSchema(schema: JSONSchemaLike): boolean {
  return schema.type === "null" || (schema.const === null && schema.type === undefined);
}

/**
 * Map a JSON schema property to a column type
 *
 * `string` is `text` (`varchar(n)` with `maxLength`, `timestamptz`/`date`/`uuid` by `format`), `integer` is `bigint`,
 * `number` is `double` (`decimal` with `numericAsDecimal`), `boolean` is `boolean`, everything else (objects, arrays,
 * unions, references, untyped) is `json`.
 * @param schema - the property schema
 * @param reflectedType - the TypeScript type of the field, from `Reflection` (a `Date` without format is a timestamp)
 * @param options - the layout options
 * @returns the mapping
 */
export function mapScalar(
  schema: JSONSchemaLike | undefined,
  reflectedType: string | undefined,
  options: Pick<SchemaLayoutOptions, "numericAsDecimal">
): ScalarMapping {
  if (!schema || typeof schema !== "object") {
    return { type: { kind: "json" }, nullable: true };
  }
  const union = schema.anyOf ?? schema.oneOf;
  if (union) {
    const branches = union.filter(branch => !isNullSchema(branch));
    const nullable = branches.length !== union.length;
    if (branches.length === 1) {
      const mapping = mapScalar(branches[0], reflectedType, options);
      return { ...mapping, nullable: mapping.nullable || nullable };
    }
    return { type: { kind: "json" }, nullable };
  }
  let type = schema.type;
  let nullable = false;
  if (Array.isArray(type)) {
    const types = type.filter(t => t !== "null");
    nullable = types.length !== type.length;
    type = types.length === 1 ? types[0] : undefined;
    if (types.length !== 1) {
      return { type: { kind: "json" }, nullable };
    }
  }
  if (type === undefined && schema.enum?.every(value => typeof value === "string")) {
    type = "string";
  }
  if (type === undefined && typeof schema.const === "string") {
    type = "string";
  }
  switch (type) {
    case "string":
      return { ...mapString(schema, reflectedType), nullable };
    case "integer":
      return { type: { kind: "bigint" }, nullable };
    case "number":
      return { type: { kind: options.numericAsDecimal ? "decimal" : "double" }, nullable };
    case "boolean":
      return { type: { kind: "boolean" }, nullable };
    default:
      return { type: { kind: "json" }, nullable: nullable || type === undefined };
  }
}

/**
 * @param schema - a string schema
 * @param reflectedType - the TypeScript type of the field
 * @returns the mapping
 */
function mapString(schema: JSONSchemaLike, reflectedType: string | undefined): Omit<ScalarMapping, "nullable"> {
  if (schema.format === "date-time" || (reflectedType === "Date" && !schema.format)) {
    return { type: { kind: "timestamptz" } };
  }
  if (schema.format === "date") {
    return { type: { kind: "date" } };
  }
  if (schema.format === "uuid") {
    return { type: { kind: "uuid" } };
  }
  const type: ColumnType =
    typeof schema.maxLength === "number" && schema.maxLength > 0
      ? { kind: "varchar", length: schema.maxLength }
      : { kind: "text" };
  const values = schema.enum ?? (typeof schema.const === "string" ? [schema.const] : undefined);
  if (!values) {
    return { type };
  }
  const strings = values.filter((value): value is string => typeof value === "string");
  const ignored = values.filter(value => typeof value !== "string");
  return {
    type,
    enum: [...new Set(strings)],
    ...(ignored.length ? { ignoredEnumValues: ignored } : {})
  };
}

/**
 * @param a - a column type
 * @param b - another column type
 * @returns whether they are the same
 */
export function sameType(a: ColumnType, b: ColumnType): boolean {
  return a.kind === b.kind && (a.kind !== "varchar" || a.length === (b as typeof a).length);
}

/**
 * @param type - a column type
 * @returns its text form: `varchar(200)`, `text`, ...
 */
export function typeToString(type: ColumnType): string {
  return type.kind === "varchar" ? `varchar(${type.length})` : type.kind;
}

/**
 * Whether every value of `from` is a valid value of `to`: the same type, a longer `varchar` or `text`
 * @param from - the current type
 * @param to - the new type
 * @returns true when `to` accepts every value of `from`
 */
export function isWidening(from: ColumnType, to: ColumnType): boolean {
  if (sameType(from, to)) {
    return true;
  }
  if (from.kind === "varchar") {
    return to.kind === "text" || (to.kind === "varchar" && to.length >= from.length);
  }
  return false;
}

/**
 * The type holding the values of both: the widest of two text types
 * @param a - a column type
 * @param b - another column type
 * @returns the common type, undefined when the types are incompatible
 */
export function widestType(a: ColumnType, b: ColumnType): ColumnType | undefined {
  if (isWidening(a, b)) {
    return b;
  }
  if (isWidening(b, a)) {
    return a;
  }
  return undefined;
}

/**
 * Physical name of a field
 * @param name - the field name
 * @param naming - the naming option
 * @returns the column name: unchanged with `preserve`, `createdAt` → `created_at` with `snake_case` (leading
 *   underscores kept: `_creationDate` → `_creation_date`)
 */
export function columnName(name: string, naming: SchemaLayoutOptions["columnNaming"]): string {
  if (naming === "preserve") {
    return name;
  }
  const prefix = /^_*/.exec(name)![0];
  return (
    prefix +
    name
      .slice(prefix.length)
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
      .toLowerCase()
  );
}

/**
 * FNV-1a hash of a text
 * @param text - the text
 * @returns 8 hexadecimal characters
 */
function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Name of a constraint or index: `<prefix>_<table>_<columns>`, cut with a hash suffix to fit
 * {@link MAX_IDENTIFIER_LENGTH}, so two long names never collide after truncation
 * @param prefix - `pk`, `fk`, `idx`, `uq`
 * @param table - the table
 * @param columns - the columns
 * @returns the name
 */
export function constraintName(prefix: string, table: string, columns: string[]): string {
  return identifier([prefix, table, ...columns].join("_"));
}

/**
 * @param name - an identifier
 * @returns the identifier, cut with a hash suffix when longer than {@link MAX_IDENTIFIER_LENGTH}
 */
export function identifier(name: string): string {
  if (name.length <= MAX_IDENTIFIER_LENGTH) {
    return name;
  }
  return `${name.slice(0, MAX_IDENTIFIER_LENGTH - 9)}_${shortHash(name)}`;
}
