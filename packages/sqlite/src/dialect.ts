import type { JSONType, SQLDialect } from "@webda/sql";
import { sqlString } from "@webda/sql";

const KEY = /^[A-Za-z0-9_]+$/;

/**
 * JSON1 path of validated segments: numeric segments index arrays
 * @param path - the segments
 * @returns the path, e.g. `$.list[1].v`
 */
export function jsonPath(path: string[]): string {
  return "$" + path.map(segment => (/^\d+$/.test(segment) ? `[${segment}]` : `.${segment}`)).join("");
}

/**
 * GLOB pattern of a LIKE pattern: `%` → `*`, `_` → `?`, `\%` / `\_` literal, GLOB metacharacters escaped
 *
 * SQLite LIKE is case-insensitive for ASCII; GLOB is case-sensitive like the in-memory and PostgreSQL semantics.
 * @param like - the LIKE pattern
 * @returns the GLOB pattern
 */
export function globPattern(like: string): string {
  let out = "";
  for (let i = 0; i < like.length; i++) {
    const c = like[i];
    if (c === "\\" && (like[i + 1] === "%" || like[i + 1] === "_")) {
      out += like[++i];
    } else if (c === "%") {
      out += "*";
    } else if (c === "_") {
      out += "?";
    } else if (c === "*" || c === "?" || c === "[") {
      out += `[${c}]`;
    } else {
      out += c;
    }
  }
  return out;
}

/**
 * SQLite JSON1 syntax: `uuid TEXT` key, `data TEXT` JSON document, `?n` placeholders
 */
export class SQLiteDialect implements SQLDialect {
  readonly binaryCollation = "COLLATE BINARY";

  /** @override */
  placeholder(i: number): string {
    return `?${i}`;
  }

  /** @override */
  jsonParam(i: number): string {
    return `json(?${i})`;
  }

  /**
   * Booleans read as `true` / `false` (not 0 / 1), everything else as its text; NULL for missing and JSON null
   * @override
   */
  jsonText(path: string[]): string {
    const p = jsonPath(path);
    return `(CASE json_type(data, '${p}') WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE CAST(data ->> '${p}' AS TEXT) END)`;
  }

  /** @override */
  jsonValue(path: string[]): string {
    return `data -> '${jsonPath(path)}'`;
  }

  /** @override */
  jsonValueOrNull(path: string[]): string {
    return `NULLIF(data -> '${jsonPath(path)}', 'null')`;
  }

  /** @override */
  keyText(key: string): string {
    this.checkKey(key);
    return `data ->> '$.${key}'`;
  }

  /** @override */
  isType(json: string, type: JSONType): string {
    switch (type) {
      case "number":
        return `json_type(${json}) IN ('integer', 'real')`;
      case "string":
        return `json_type(${json}) = 'text'`;
      case "boolean":
        return `json_type(${json}) IN ('true', 'false')`;
      default:
        return `json_type(${json}) = '${type}'`;
    }
  }

  /** @override */
  asNumber(json: string): string {
    return `(${json} ->> '$')`;
  }

  /** @override */
  asString(json: string): string {
    return `(${json} ->> '$')`;
  }

  /** @override */
  typedAttribute(_text: string, json: string, type: "number" | "boolean"): string {
    return `(CASE WHEN ${this.isType(json, type)} THEN ${json} ->> '$' END)`;
  }

  /** @override */
  distinctFrom(left: string, right: string): string {
    return `${left} IS NOT ${right}`;
  }

  /** @override */
  contains(json: string, value: string | number | boolean): string {
    const literal =
      typeof value === "string" ? sqlString(value) : typeof value === "boolean" ? (value ? "1" : "0") : String(value);
    const type =
      typeof value === "string"
        ? "type = 'text'"
        : typeof value === "boolean"
          ? `type = '${value}'`
          : "type IN ('integer', 'real')";
    return `(json_type(${json}) = 'array' AND EXISTS (SELECT 1 FROM json_each(${json}) WHERE value = ${literal} AND ${type}))`;
  }

  /** @override */
  like(text: string, pattern: string): string {
    return `${text} GLOB ${sqlString(globPattern(pattern))}`;
  }

  /** @override */
  createTable(table: string): string {
    return `CREATE TABLE IF NOT EXISTS ${table} (uuid TEXT NOT NULL PRIMARY KEY, data TEXT NOT NULL CHECK (json_valid(data)))`;
  }

  /**
   * SQLITE_CONSTRAINT_PRIMARYKEY (1555) or SQLITE_CONSTRAINT_UNIQUE (2067)
   * @override
   */
  isUniqueViolation(err: unknown): boolean {
    const e = err as any;
    return (
      typeof e === "object" && e !== null && e.code === "ERR_SQLITE_ERROR" && (e.errcode === 1555 || e.errcode === 2067)
    );
  }

  /** @override */
  hasStoredType(): string {
    return `json_type(data, '$.__type') IS NOT NULL`;
  }

  /** @override */
  keptType(mapParam: number): string {
    return `COALESCE(json(?${mapParam}) ->> lower(data ->> '$.__type'), data ->> '$.__type')`;
  }

  /** @override */
  withStoredType(json: string, type: string): string {
    return `json_set(${json}, '$.__type', ${type})`;
  }

  /**
   * One `json_set` pair per top-level key (`json_patch` would drop null values and merge nested objects)
   * @override
   */
  shallowMerge(json: string, patch: Record<string, any>, args: any[]): string {
    const pairs: string[] = [];
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (value === undefined) continue;
      this.checkKey(key);
      args.push(JSON.stringify(value));
      pairs.push(`'$.${key}', json(?${args.length})`);
    }
    return pairs.length ? `json_set(${json}, ${pairs.join(", ")})` : json;
  }

  /** @override */
  removeKey(attribute: string, args: any[]): string {
    this.checkKey(attribute);
    args.push(attribute);
    return `json_remove(data, '$.' || ?${args.length})`;
  }

  /** @override */
  increment(entries: { property: string; value: number }[], updateDate: string, args: any[]): string {
    const pairs = entries.map(({ property, value }) => {
      this.checkKey(property);
      args.push(value);
      return `'$.${property}', COALESCE(data ->> '$.${property}', 0) + ?${args.length}`;
    });
    return `json_set(data, ${pairs.join(", ")}, '$._lastUpdate', ${sqlString(updateDate)})`;
  }

  /**
   * An index at or beyond the end appends (json_set ignores a path past the end), as PostgreSQL jsonb_set does
   * @override
   */
  setCollectionItem(attr: string, itemParam: number, index: number | undefined, updateDate: string): string {
    this.checkKey(attr);
    const array = `COALESCE(data -> '$.${attr}', '[]')`;
    const append = `json_insert(${array}, '$[#]', json(?${itemParam}))`;
    const updated =
      index === undefined
        ? append
        : `CASE WHEN json_array_length(${array}) > ${this.checkIndex(index)} THEN json_set(${array}, '$[${index}]', json(?${itemParam})) ELSE ${append} END`;
    return `json_set(data, '$.${attr}', json(${updated}), '$._lastUpdate', ${sqlString(updateDate)})`;
  }

  /** @override */
  removeCollectionItem(attr: string, index: number, updateDate: string): string {
    this.checkKey(attr);
    return `json_set(data, '$.${attr}', json_remove(COALESCE(data -> '$.${attr}', '[]'), '$[${this.checkIndex(index)}]'), '$._lastUpdate', ${sqlString(updateDate)})`;
  }

  /**
   * Without an index (an append with a condition) the condition never matches, as on the other stores
   * @override
   */
  collectionItemCondition(attr: string, index: number | undefined, field: string, valueParam: number): string {
    this.checkKey(attr);
    this.checkKey(field);
    if (index === undefined) {
      return `0 = ?${valueParam}`;
    }
    return `data ->> '$.${attr}[${this.checkIndex(index)}].${field}' = ?${valueParam}`;
  }

  /**
   * One json_set: parents of dotted targets made objects (read from the stored row: a statement never sets a field
   * and one of its children), then the values. An array index beyond the end of an existing array is not applied
   * (json_set ignores a path past the end).
   * @override
   */
  bulkAssign(_table: string, assignments: { field: string; value: any }[], args: any[]): string {
    const pairs: string[] = [];
    const ensured = new Set<string>();
    for (const { field, value } of assignments) {
      const segments = field.split(".");
      for (let i = 1; i < segments.length; i++) {
        const parent = jsonPath(segments.slice(0, i));
        if (ensured.has(parent)) continue;
        ensured.add(parent);
        pairs.push(
          `'${parent}', json(COALESCE(CASE WHEN json_type(data, '${parent}') IN ('object', 'array') THEN data -> '${parent}' END, '{}'))`
        );
      }
      args.push(JSON.stringify(value));
      pairs.push(`'${jsonPath(segments)}', json(?${args.length})`);
    }
    return `json_set(data, ${pairs.join(", ")})`;
  }

  /** @override */
  backfillTypes(table: string): string {
    return `UPDATE ${table} SET data = json_set(data, '$.__type', ?1) WHERE data ->> '$.__type' IS NULL`;
  }

  /** @override */
  countStoredTypes(table: string): string {
    return `SELECT CASE WHEN json_type(data) IS NOT 'object' THEN ?1 WHEN json_type(data, '$.__type') = 'text' AND data ->> '$.__type' <> '' THEN data ->> '$.__type' ELSE ?2 END AS type, count(*) AS n FROM ${table} GROUP BY 1`;
  }

  /** @override */
  isObjectRow(): string {
    return `json_type(data) = 'object'`;
  }

  /**
   * The data column is JSON text
   * @override
   */
  decode(value: any): any {
    return typeof value === "string" ? JSON.parse(value) : value;
  }

  /**
   * @param key - a top-level key written inside a JSON path literal
   */
  protected checkKey(key: string): void {
    if (!KEY.test(key)) {
      throw new Error(`Invalid attribute: ${key}`);
    }
  }

  /**
   * @param index - an array index written inside a JSON path literal
   * @returns the index
   */
  protected checkIndex(index: number): number {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid index: ${index}`);
    }
    return index;
  }
}
