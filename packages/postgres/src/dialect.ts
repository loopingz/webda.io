import type { JSONType, SQLDialect } from "@webda/sql";
import { sqlString } from "@webda/sql";

const KEY = /^[A-Za-z0-9_]+$/;

/**
 * PostgreSQL JSONB syntax: `uuid VARCHAR(255)` key, `data jsonb` document, `$n` placeholders
 */
export class PostgresDialect implements SQLDialect {
  readonly binaryCollation = `COLLATE "C"`;

  /** @override */
  placeholder(i: number): string {
    return `$${i}`;
  }

  /** @override */
  jsonParam(i: number): string {
    return `$${i}::jsonb`;
  }

  /** @override */
  jsonText(path: string[]): string {
    return `data#>>'{${this.checkPath(path).join(",")}}'`;
  }

  /** @override */
  jsonValue(path: string[]): string {
    return `data#>'{${this.checkPath(path).join(",")}}'`;
  }

  /** @override */
  jsonValueOrNull(path: string[]): string {
    return `NULLIF(data #> '{${this.checkPath(path).join(",")}}', 'null'::jsonb)`;
  }

  /** @override */
  keyText(key: string): string {
    this.checkKey(key);
    return `data->>'${key}'`;
  }

  /** @override */
  isType(json: string, type: JSONType): string {
    return `jsonb_typeof(${json}) = '${type}'`;
  }

  /** @override */
  asNumber(json: string): string {
    return `(${json})::numeric`;
  }

  /** @override */
  asString(json: string): string {
    return `${json} #>> '{}'`;
  }

  /** @override */
  typedAttribute(text: string, json: string, type: "number" | "boolean"): string {
    return `(CASE WHEN jsonb_typeof(${json}) = '${type}' THEN (${text})::${type === "number" ? "numeric" : "boolean"} END)`;
  }

  /** @override */
  distinctFrom(left: string, right: string): string {
    return `${left} IS DISTINCT FROM ${right}`;
  }

  /** @override */
  contains(json: string, value: string | number | boolean): string {
    return `(CASE WHEN jsonb_typeof(${json}) = 'array' THEN ${json} END) @> ${sqlString(JSON.stringify([value]))}::jsonb`;
  }

  /** @override */
  like(text: string, pattern: string): string {
    return `${text} LIKE ${sqlString(pattern)}`;
  }

  /** @override */
  createTable(table: string): string {
    return `CREATE TABLE IF NOT EXISTS ${table} (uuid VARCHAR(255) NOT NULL, data jsonb, CONSTRAINT ${table}_pkey PRIMARY KEY (uuid))`;
  }

  /**
   * unique_violation
   * @override
   */
  isUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as any).code === "23505";
  }

  /** @override */
  hasStoredType(): string {
    return `data ? '__type'`;
  }

  /** @override */
  keptType(mapParam: number): string {
    return `COALESCE($${mapParam}::jsonb -> lower(data->>'__type'), data->'__type')`;
  }

  /** @override */
  withStoredType(json: string, type: string): string {
    return `${json} || jsonb_build_object('__type', ${type})`;
  }

  /** @override */
  shallowMerge(json: string, patch: Record<string, any>, args: any[]): string {
    args.push(JSON.stringify(patch));
    return `${json} || $${args.length}::jsonb`;
  }

  /** @override */
  removeKey(attribute: string, args: any[]): string {
    args.push(attribute);
    return `data - $${args.length}`;
  }

  /** @override */
  increment(entries: { property: string; value: number }[], updateDate: string, args: any[]): string {
    let data = "data";
    for (const p of entries) {
      this.checkKey(p.property);
      args.push(p.value);
      data = `jsonb_set(${data}, '{${p.property}}', (COALESCE(data->>'${p.property}','0')::int + $${args.length})::text::jsonb)::jsonb`;
    }
    return `jsonb_set(${data}, '{_lastUpdate}', ${sqlString(`"${updateDate}"`)}::jsonb)`;
  }

  /** @override */
  setCollectionItem(attr: string, itemParam: number, index: number | undefined, updateDate: string): string {
    this.checkKey(attr);
    let q = `jsonb_set(jsonb_set(data::jsonb, array['${attr}'],`;
    if (index === undefined) {
      q += `COALESCE((data->'${attr}')::jsonb, '[]'::jsonb) || jsonb_build_array($${itemParam}::jsonb))::jsonb`;
    } else {
      q += `jsonb_set(COALESCE((data->'${attr}')::jsonb, '[]'::jsonb), '{${this.checkIndex(index)}}', $${itemParam}::jsonb)::jsonb)`;
    }
    return `${q}, '{_lastUpdate}', ${sqlString(`"${updateDate}"`)}::jsonb)`;
  }

  /** @override */
  removeCollectionItem(attr: string, index: number, updateDate: string): string {
    this.checkKey(attr);
    return `jsonb_set(jsonb_set(data::jsonb, array['${attr}'], COALESCE(((data->'${attr}')::jsonb - ${this.checkIndex(index)}), '[]'::jsonb))::jsonb, '{_lastUpdate}', ${sqlString(`"${updateDate}"`)}::jsonb)`;
  }

  /** @override */
  collectionItemCondition(attr: string, index: number | undefined, field: string, valueParam: number): string {
    this.checkKey(attr);
    this.checkKey(field);
    if (index === undefined) {
      return `(data#>>'{${attr}, undefined}')::jsonb->>'${field}'=$${valueParam}`;
    }
    return `(data#>>'{${attr}, ${this.checkIndex(index)}}')::jsonb->>'${field}'=$${valueParam}`;
  }

  /**
   * One step per jsonb_set, each reading the previous one (d0 is the row data): the SQL stays linear in size
   * @override
   */
  bulkAssign(table: string, assignments: { field: string; value: any }[], values: any[]): string {
    const steps: string[] = [];
    const ensured = new Set<string>();
    for (const { field, value } of assignments) {
      const segments = field.split(".");
      // Make every parent of a dotted target an object, keeping an existing object or array (a numeric segment
      // then indexes the array)
      for (let i = 1; i < segments.length; i++) {
        const parent = segments.slice(0, i);
        if (ensured.has(parent.join("."))) continue;
        ensured.add(parent.join("."));
        values.push(parent);
        const d = `d${steps.length}`;
        const path = `$${values.length}::text[]`;
        steps.push(
          `jsonb_set(${d}, ${path}, CASE WHEN jsonb_typeof(${d} #> ${path}) IN ('object', 'array') THEN ${d} #> ${path} ELSE '{}'::jsonb END, true)`
        );
      }
      values.push(segments, JSON.stringify(value));
      steps.push(`jsonb_set(d${steps.length}, $${values.length - 1}::text[], $${values.length}::jsonb, true)`);
    }
    return `(SELECT d${steps.length} FROM (SELECT ${table}.data AS d0) s0${steps
      .map((step, i) => ` CROSS JOIN LATERAL (SELECT ${step} AS d${i + 1}) s${i + 1}`)
      .join("")})`;
  }

  /** @override */
  backfillTypes(table: string): string {
    return `UPDATE ${table} SET data = data || jsonb_build_object('__type', $1::text) WHERE data->>'__type' IS NULL`;
  }

  /** @override */
  countStoredTypes(table: string): string {
    return `SELECT CASE WHEN jsonb_typeof(data) IS DISTINCT FROM 'object' THEN $1
          WHEN jsonb_typeof(data->'__type') = 'string' AND data->>'__type' <> '' THEN data->>'__type'
          ELSE $2 END AS type, count(*)::int AS n FROM ${table} GROUP BY 1`;
  }

  /** @override */
  isObjectRow(): string {
    return `jsonb_typeof(data) = 'object'`;
  }

  /**
   * pg parses jsonb columns
   * @override
   */
  decode(value: any): any {
    return value;
  }

  /**
   * @param key - a key segment written inside a JSON path literal
   */
  protected checkKey(key: string): void {
    if (!KEY.test(key)) {
      throw new Error(`Invalid attribute: ${key}`);
    }
  }

  /**
   * @param path - path segments written inside a JSON path literal
   * @returns the validated segments
   */
  protected checkPath(path: string[]): string[] {
    for (const segment of path) {
      this.checkKey(segment);
    }
    return path;
  }

  /**
   * @param index - an array index written inside a JSON path literal
   * @returns the validated index
   */
  protected checkIndex(index: number): number {
    if (!Number.isInteger(index) || index < 0) {
      throw new Error(`Invalid index: ${index}`);
    }
    return index;
  }
}
