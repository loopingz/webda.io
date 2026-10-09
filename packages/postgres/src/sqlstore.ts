import { MemoryRepository, Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import type { AggregationQuery, AggregationResult } from "@webda/ql";

/** Database connection metadata */
export interface SQLDatabase {
  name: string;
}

/** Base parameters for SQL-backed stores */
export class SQLStoreParameters extends StoreParameters {
  table: string;
  database: SQLDatabase;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any): this {
    super.load(params);
    return this;
  }
}

/** Minimal SQL client interface compatible with pg.Client and pg.Pool */
export interface SQLClient {
  query: (q: string, values?: any[]) => Promise<{ rows: any[]; rowCount: number }>;
}

/** Typed result wrapper for SQL queries */
export interface SQLResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * Quote a string as a SQL literal: single quotes are doubled so a value can never close the literal. Backslashes
 * stay literal: with `standard_conforming_strings` (PostgreSQL default) `\\` is not an escape character in '...'
 * strings — only LIKE gives it a meaning.
 * @param value - the string
 * @returns the SQL literal
 */
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Extends ComparisonExpression to emit SQL for JSONB comparisons
 *
 * With the JSON path of the attribute (`jsonAttribute`), comparisons follow the in-memory semantics:
 * - a number or a boolean only matches a JSON number or boolean: a missing field, a null or another type never
 *   matches, and never raises a cast error;
 * - `!=` matches a missing field, a null or another type (`IS DISTINCT FROM`);
 * - strings compare the text of the value, so a number field equals its text (`n = '1'`), as the loose `==` does;
 * - `CONTAINS` only matches an array holding the value.
 */
export class SQLComparisonExpression extends WebdaQL.ComparisonExpression {
  /**
   * @param operator - the comparison operator
   * @param attribute - the SQL text of the attribute (`data#>>'{a,b}'`)
   * @param value - the value
   * @param jsonAttribute - the SQL JSON of the attribute (`data#>'{a,b}'`), for typed comparisons
   */
  constructor(
    operator: WebdaQL.ComparisonOperator,
    attribute: string,
    value: any,
    protected readonly jsonAttribute?: string
  ) {
    super(operator, attribute, value);
  }

  /**
   * @override
   * @param value - the value to stringify
   * @returns SQL-compatible literal
   */
  toStringValue(value: (string | number | boolean) | (string | number | boolean)[]): string {
    if (typeof value === "string") {
      return sqlString(value);
    }
    return super.toStringValue(value);
  }

  /**
   * @override
   * @returns SQL attribute expression, typed when the value is a number or a boolean
   */
  toStringAttribute(): string {
    const text = this.attribute.join(".");
    if (this.jsonAttribute && (typeof this.value === "number" || typeof this.value === "boolean")) {
      const type = typeof this.value;
      return `(CASE WHEN jsonb_typeof(${this.jsonAttribute}) = '${type}' THEN (${text})::${type === "number" ? "numeric" : "boolean"} END)`;
    }
    return text;
  }

  /**
   * @override
   * @returns the SQL condition
   */
  toString(): string {
    if (WebdaQL.UNARY_COMPARISON_OPERATORS.includes(this.operator)) {
      return `${this.attribute.join(".")} ${this.operator}`;
    }
    if (this.operator === "CONTAINS" && this.jsonAttribute) {
      return `(CASE WHEN jsonb_typeof(${this.jsonAttribute}) = 'array' THEN ${this.jsonAttribute} END) @> ${sqlString(JSON.stringify([this.value]))}::jsonb`;
    }
    if (this.operator === "!=") {
      return `${this.toStringAttribute()} IS DISTINCT FROM ${this.toStringValue(this.value)}`;
    }
    return super.toString();
  }
}

/**
 * PostgreSQL-backed repository for a single model class.
 *
 * Stores every object as a JSONB `data` column alongside a `uuid` primary-key
 * column. All CRUD operations hit the pg client; the inherited MemoryRepository
 * serialize/deserialize helpers are reused for JSON ↔ model-instance
 * conversion.
 */
/**
 * PostgreSQL-backed repository for a single model class.
 *
 * Stores every object as a JSONB `data` column alongside a `uuid` primary-key
 * column. All CRUD operations hit the pg client; the inherited MemoryRepository
 * serialize/deserialize helpers are reused for JSON to model-instance conversion.
 */
export class PostgresRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * Create a new PostgresRepository.
   * @param model - the model class
   * @param pks - primary key field names
   * @param client - the pg client or pool
   * @param table - the table name
   * @param separator - composite key separator
   * @param prepare - awaited before every statement (e.g. to ensure the table exists)
   * @param tableModel - identifier of the model the table was declared for: rows without `__type` (written before
   *   stamping) belong to it. Defaults to the topmost ancestor of `model` carrying metadata.
   */
  constructor(
    model: T,
    pks: string[],
    protected readonly client: SQLClient,
    protected readonly table: string,
    separator?: string,
    protected readonly prepare?: () => Promise<void>,
    tableModel?: string
  ) {
    // Pass an empty Map — we do NOT use in-memory storage
    super(model, pks, separator, new Map<string, string>() as any);
    this.tableModel = tableModel ?? PostgresRepository.rootIdentifier(model);
  }

  /**
   * Identifier of the model the table was declared for: unstamped rows belong to it
   */
  protected readonly tableModel?: string;

  /**
   * @param model - a model class
   * @returns the identifier of its topmost ancestor (itself included) carrying metadata
   */
  static rootIdentifier(model: any): string | undefined {
    let root: string | undefined;
    for (let clazz = model; clazz && clazz !== Function.prototype; clazz = Object.getPrototypeOf(clazz)) {
      if (Object.prototype.hasOwnProperty.call(clazz, "Metadata") && clazz.Metadata?.Identifier) {
        root = clazz.Metadata.Identifier;
      }
    }
    return root;
  }

  /**
   * Stamp the rows written before `__type` stamping with the table model: they keep belonging to it, and a later
   * change of the table model cannot reassign them
   *
   * Idempotent; only the repository of the table model writes. Equivalent SQL:
   * `UPDATE <table> SET data = data || jsonb_build_object('__type', '<table model>') WHERE data->>'__type' IS NULL`.
   * @returns the number of rows stamped
   */
  async backfillTypes(): Promise<number> {
    const own = (this.model as any)?.Metadata?.Identifier;
    if (!own || own !== this.tableModel) {
      return 0;
    }
    return (
      await this.execute(
        `UPDATE ${this.table} SET data = data || jsonb_build_object('__type', $1::text) WHERE data->>'__type' IS NULL`,
        [own]
      )
    ).rowCount;
  }

  /**
   * The backing table name for this repository's model.
   * @returns the table name
   * @internal Not part of the @webda/models Repository interface.
   */
  getTable(): string {
    return this.table;
  }

  /**
   * Ensure the backing table for this repository's model exists.
   * Owns the per-model DDL previously held by PostgresStore.checkTable().
   * @internal Not part of the @webda/models Repository interface.
   */
  async setupTable(): Promise<void> {
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS ${this.table} (uuid VARCHAR(255) NOT NULL, data jsonb, CONSTRAINT ${this.table}_pkey PRIMARY KEY (uuid))`
    );
  }

  /**
   * Run a statement against the client once {@link prepare} has resolved.
   * @param q - the SQL statement
   * @param values - the statement parameters
   * @returns the raw pg query result
   */
  protected async execute(q: string, values?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    await this.prepare?.();
    return this.client.query(q, values);
  }

  /**
   * Map an expression attribute path array to a JSONB path expression.
   * @param attribute - the attribute path
   * @returns the JSONB path expression
   */
  mapExpressionAttribute(attribute: string[]): string {
    return `data#>>'{${this.checkPath(attribute)}}'`;
  }

  /**
   * Map an expression attribute path array to its JSONB value (not its text)
   * @param attribute - the attribute path
   * @returns the JSONB path expression
   */
  mapJsonAttribute(attribute: string[]): string {
    return `data#>'{${this.checkPath(attribute)}}'`;
  }

  /**
   * Check the segments of a path written inside a SQL literal: letters, digits and `_`, like WebdaQL identifiers
   * @param attribute - the attribute path
   * @returns the segments, comma separated
   * @throws Error for any other character
   */
  protected checkPath(attribute: string[]): string {
    if (attribute.some(segment => !/^[A-Za-z0-9_]+$/.test(segment))) {
      throw new Error(`Invalid attribute path: ${JSON.stringify(attribute)}`);
    }
    return attribute.join(",");
  }

  /**
   * SQL condition restricting rows to this model and its subclasses, as `__type` stamps them; rows without a stamp
   * (written before stamping) belong to every model of the table
   * @returns the condition, undefined for a model without metadata
   */
  protected getClassCondition(): string | undefined {
    const ids = this.buildClassFilterIdentifiers();
    if (!ids) {
      return undefined;
    }
    const typed = `data->>'__type' IN (${ids.map(sqlString).join(", ")})`;
    // Unstamped rows belong to the table model: its repository and its ancestors' see them, a subclass never does
    return this.tableModel && ids.includes(this.tableModel) ? `(${typed} OR data->>'__type' IS NULL)` : `(${typed})`;
  }

  /**
   * The type an object written by the application declares: the `__type` its row was read with (non-enumerable,
   * set by {@link fromJSON}), else the identifier of its class. Plain data declares none, whatever its keys.
   * @param item - the object
   * @returns the model identifier, undefined for plain data
   */
  protected declaredType(item: any): string | undefined {
    if (!item || typeof item !== "object") {
      return undefined;
    }
    const own = Object.getOwnPropertyDescriptor(item, "__type");
    if (own && !own.enumerable && typeof own.value === "string") {
      return own.value;
    }
    const clazz = Object.getPrototypeOf(item)?.constructor;
    return clazz && clazz !== Object ? clazz.Metadata?.Identifier : undefined;
  }

  /**
   * The JSON stored for an object: its fields, and its declared type in `__type` (see {@link declaredType})
   * @param item - the object
   * @param fallbackType - the type to stamp when the object declares none
   * @returns the JSON text
   */
  protected toStoredJSON(item: any, fallbackType?: string): string {
    const data = JSON.parse(JSON.stringify(item));
    // An enumerable `__type` key of plain data is never trusted
    delete data.__type;
    const type = this.declaredType(item) ?? fallbackType;
    if (type) {
      data.__type = type;
    }
    return JSON.stringify(data);
  }

  /**
   * Build a SQL WHERE sub-expression from a write-condition.
   * @param writeCondition - the expected value
   * @param writeConditionField - the field to check
   * @param params - the existing params array (will be extended in place)
   * @returns the SQL AND clause
   */
  getQueryCondition(writeCondition: any, writeConditionField: string, params: any[]): string {
    const condition = writeCondition instanceof Date ? writeCondition.toISOString() : writeCondition;
    params.push(condition);
    return ` AND data->>'${writeConditionField}'=$${params.length}`;
  }

  /**
   * Run a raw SQL query and return typed results.
   * @param q - the SQL query (WHERE clause or full query)
   * @param values - the query parameters
   * @returns the raw pg query result
   */
  protected async sqlQuery(q: string, values: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    if (!q.startsWith("DELETE") && !q.startsWith("INSERT") && !q.startsWith("SELECT") && !q.startsWith("UPDATE")) {
      q = `SELECT * FROM ${this.table} WHERE ${q}`;
    }
    return this.execute(q, values);
  }

  /**
   * Deserialize a raw JSON object from the database into a model instance.
   * @param stored - the raw JSON object from the JSONB column; its `__type` stamp becomes a non-enumerable property
   * @returns the model instance
   */
  protected fromJSON(stored: any): InstanceType<T> {
    const { __type, ...data } = stored ?? {};
    const instance = new this.model({}) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    if (__type !== undefined) {
      Object.defineProperty(instance, "__type", {
        value: __type,
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
    return instance;
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const res = await this.sqlQuery(`SELECT data FROM ${this.table} WHERE uuid=$1`, [key]);
    if (res.rowCount === 0) {
      throw new Error(`Not found: ${key}`);
    }
    return this.fromJSON(res.rows[0].data);
  }

  /** @override */
  async create(data: any, _save: boolean = true): Promise<any> {
    // Persist the built item: a primary key generated by the model (e.g. UuidModel)
    // must be the one stored in the row, not only the one used as key
    const item = this.buildItem(data);
    const key = this.getPrimaryKey(item).toString();
    try {
      await this.execute(`INSERT INTO ${this.table}(uuid,data) VALUES($1, $2)`, [
        key,
        this.toStoredJSON(item, (this.model as any).Metadata?.Identifier)
      ]);
    } catch (err) {
      // unique_violation on the primary key: the object exists, never overwrite it
      if (err?.code === "23505") {
        throw new Error(`Already exists: ${key}`);
      }
      throw err;
    }
    return item;
  }

  /** @override */
  async update(data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(data).toString();
    const args: any[] = [this.toStoredJSON(data), key];
    // Plain data keeps the stored type: a write through a parent repository never re-types a subclass row
    let q = this.declaredType(data)
      ? `UPDATE ${this.table} SET data=$1 WHERE uuid=$2`
      : `UPDATE ${this.table} SET data = CASE WHEN data ? '__type' THEN $1::jsonb || jsonb_build_object('__type', data->'__type') ELSE $1::jsonb END WHERE uuid=$2`;
    if (conditionField) {
      q += this.getQueryCondition(condition, conditionField as string, args);
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw new UpdateConditionFailError(key as any, conditionField as string, condition);
    }
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const args: any[] = [JSON.stringify(data), key];
    let q = `UPDATE ${this.table} SET data = data || $1::jsonb WHERE uuid=$2`;
    if (conditionField) {
      q += this.getQueryCondition(condition, conditionField as string, args);
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw new UpdateConditionFailError(key as any, conditionField as string, condition);
    }
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const args: any[] = [key];
    let q = `DELETE FROM ${this.table} WHERE uuid=$1`;
    if (conditionField) {
      q += this.getQueryCondition(condition, conditionField as string, args);
      const res = await this.execute(q, args);
      if (res.rowCount === 0) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      }
    } else {
      await this.execute(q, args);
    }
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const res = await this.execute(`SELECT uuid FROM ${this.table} WHERE uuid=$1`, [key]);
    return res.rowCount === 1;
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const args: any[] = [String(attribute), key];
    let q = `UPDATE ${this.table} SET data = data - $1 WHERE uuid=$2`;
    if (conditionField) {
      q += this.getQueryCondition(condition, conditionField as string, args);
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      if (conditionField) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      } else {
        throw new StoreNotFoundError(key as any, this.table);
      }
    }
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, _conditionField?: any, _condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const updateDate = new Date();
    const args: any[] = [key];
    let data = "data";
    const entries: Array<{ property: string; value: number }> = Array.isArray(info)
      ? info.map((e: any) =>
          typeof e === "string" ? { property: e, value: 1 } : { property: e.property, value: e.value ?? 1 }
        )
      : Object.entries(info).map(([property, value]) => ({ property: String(property), value: value as number }));
    entries.forEach((p, index) => {
      args.push(p.value);
      data = `jsonb_set(${data}, '{${p.property}}', (COALESCE(data->>'${p.property}','0')::int + $${index + 2})::text::jsonb)::jsonb`;
    });
    const q = `UPDATE ${this.table} SET data = jsonb_set(${data}, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid=$1`;
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw new StoreNotFoundError(key as any, this.table);
    }
  }

  /** @override */
  async upsertItemToCollection(
    primaryKey: any,
    collection: any,
    item: any,
    index?: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const attr = String(collection);
    const updateDate = new Date();
    const args: any[] = [key];
    let q = `UPDATE ${this.table} SET data = jsonb_set(jsonb_set(data::jsonb, array['${attr}'],`;
    if (index === undefined) {
      q += `COALESCE((data->'${attr}')::jsonb, '[]'::jsonb) || '[${JSON.stringify(item)}]'::jsonb)::jsonb`;
    } else {
      q += `jsonb_set(COALESCE((data->'${attr}')::jsonb, '[]'::jsonb), '{${index}}', '${JSON.stringify(item)}'::jsonb)::jsonb)`;
    }
    q += `, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid=$1`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND (data#>>'{${attr}, ${index}}')::jsonb->>'${String(itemWriteConditionField)}'=$${args.length}`;
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      if (itemWriteCondition !== undefined) {
        throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
      } else {
        throw new StoreNotFoundError(key as any, this.table);
      }
    }
  }

  /** @override */
  async deleteItemFromCollection(
    primaryKey: any,
    collection: any,
    index: number,
    itemWriteConditionField?: any,
    itemWriteCondition?: any
  ): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const attr = String(collection);
    const updateDate = new Date();
    const args: any[] = [key];
    let q = `UPDATE ${this.table} SET data = jsonb_set(jsonb_set(data::jsonb, array['${attr}'], COALESCE(`;
    q += `((data->'${attr}')::jsonb - ${index})`;
    q += `, '[]'::jsonb))::jsonb, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid=$1`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND (data#>>'{${attr}, ${index}}')::jsonb->>'${String(itemWriteConditionField)}'=$2`;
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      if (itemWriteCondition !== undefined) {
        throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
      } else {
        throw new StoreNotFoundError(key as any, this.table);
      }
    }
  }

  /**
   * Duplicate and translate a WebdaQL expression into SQL-friendly JSONB path expressions.
   * @param expression - the WebdaQL expression
   * @returns the translated expression
   */
  duplicateExpression(expression: WebdaQL.Expression): WebdaQL.Expression {
    if (expression instanceof WebdaQL.LogicalExpression && expression.children.length === 0) {
      // An empty AND / OR matches everything: emit an explicit SQL TRUE (not "( )")
      return new WebdaQL.BooleanExpression(true);
    }
    if (expression instanceof WebdaQL.BooleanExpression) {
      // TRUE / FALSE are valid SQL booleans
      return new WebdaQL.BooleanExpression(expression.value);
    }
    if (expression instanceof WebdaQL.AndExpression) {
      return new WebdaQL.AndExpression(expression.children.map(exp => this.duplicateExpression(exp)));
    } else if (expression instanceof WebdaQL.OrExpression) {
      return new WebdaQL.OrExpression(expression.children.map(exp => this.duplicateExpression(exp)));
    } else if (expression instanceof WebdaQL.ComparisonExpression) {
      if (expression.operator === "IN") {
        const attr = this.mapExpressionAttribute(expression.attribute);
        const json = this.mapJsonAttribute(expression.attribute);
        return new WebdaQL.OrExpression(
          (<string[]>expression.value).map(v => new SQLComparisonExpression("=", attr, v, json))
        );
      }
      // IS NULL / IS NOT NULL map natively: `data#>>'{a}'` is NULL for a missing key and a JSON null
      return new SQLComparisonExpression(
        expression.operator,
        this.mapExpressionAttribute(expression.attribute),
        expression.value,
        this.mapJsonAttribute(expression.attribute)
      );
    }
    return expression;
  }

  /** @override — use SQL WHERE clause instead of in-memory scan */
  async query(queryStr: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const WebdaQLMod = await import("@webda/ql");
    // A query object built or changed by code goes back through the grammar before any SQL is written
    const parsed = typeof queryStr === "string" ? WebdaQLMod.parse(queryStr) : WebdaQLMod.normalizeQuery(queryStr);
    // DELETE / UPDATE go to deleteMany / updateMany; a field list is not a projection here
    WebdaQLMod.assertFilterQuery(parsed);
    let sql = this.duplicateExpression(parsed.filter).toString();
    const classCondition = this.getClassCondition();
    if (classCondition) {
      sql = `(${sql}) AND ${classCondition}`;
    }
    const offset = parseInt((parsed as any).continuationToken || "0", 10);
    if ((parsed as any).orderBy && (parsed as any).orderBy.length) {
      sql +=
        " ORDER BY " +
        (parsed as any).orderBy
          .map((c: any) => `${this.mapExpressionAttribute(c.field.split("."))} ${c.direction}`)
          .join(", ");
    }
    const limit = (parsed as any).limit || 1000;
    sql += ` LIMIT ${limit}`;
    if (offset) {
      sql += ` OFFSET ${offset}`;
    }
    const res = await this.sqlQuery(sql, []);
    const results = res.rows.map(r => this.fromJSON(r.data));
    return {
      results,
      continuationToken: limit <= results.length ? (offset + limit).toString() : undefined
    };
  }

  /**
   * JSONB expression of a dotted path, JSON null folded into SQL NULL
   * @param path - validated dotted path
   * @returns the SQL expression
   */
  protected jsonPath(path: string): string {
    return `NULLIF(data #> '{${this.checkPath(path.split("."))}}', 'null'::jsonb)`;
  }

  /**
   * Translate an aggregation to SQL
   *
   * Paths and aliases were validated with the aggregation, and paths are checked again, so they are safe to
   * interpolate. MIN / MAX select a numeric and a text candidate, merged by decode.
   * @param query - the validated aggregation
   * @param where - extra WHERE condition (class condition), optional
   * @returns the statement and the row decoder
   */
  buildAggregationSQL(query: AggregationQuery, where?: string): { sql: string; decode: (row: any) => any } {
    const columns: string[] = [];
    const groupColumns: string[] = [];
    // Sort keys of each groupBy path / metric alias: type rank, then number, then text in code unit order, then jsonb
    const sortKeys: Record<string, string[]> = {};
    const num = (x: string) => `CASE WHEN jsonb_typeof(${x}) = 'number' THEN (${x})::numeric END`;
    const str = (x: string) => `(CASE WHEN jsonb_typeof(${x}) = 'string' THEN ${x} #>> '{}' END) COLLATE "C"`;
    query.groupBy.forEach((path, i) => {
      const x = this.jsonPath(path);
      columns.push(`${x} AS "g${i}"`);
      groupColumns.push(String(i + 1));
      sortKeys[path] = [
        `CASE WHEN ${x} IS NULL THEN NULL WHEN jsonb_typeof(${x}) = 'number' THEN 1 WHEN jsonb_typeof(${x}) = 'string' THEN 2 ELSE 3 END`,
        num(x),
        str(x),
        x
      ];
    });
    for (const [alias, metric] of Object.entries(query.metrics)) {
      const x = metric.field ? this.jsonPath(metric.field) : "";
      switch (metric.fn) {
        case "COUNT":
          columns.push(`${metric.field ? `COUNT(${x})` : "COUNT(*)"} AS "m_${alias}"`);
          break;
        case "COUNT_DISTINCT":
          columns.push(`COUNT(DISTINCT ${x}) AS "m_${alias}"`);
          break;
        case "SUM":
          columns.push(`COALESCE(SUM(${num(x)}), 0) AS "m_${alias}"`);
          break;
        case "AVG":
          columns.push(`AVG(${num(x)}) AS "m_${alias}"`);
          break;
        case "MIN":
        case "MAX": {
          const n = `${metric.fn}(${num(x)})`;
          const t = `${metric.fn}(${str(x)})`;
          columns.push(`${n} AS "n_${alias}"`, `${t} AS "s_${alias}"`);
          // numbers rank below strings: MIN prefers a number, MAX prefers a string
          const [first, second] = metric.fn === "MIN" ? [n, t] : [t, n];
          sortKeys[alias] = [
            `CASE WHEN ${first} IS NOT NULL THEN 1 WHEN ${second} IS NOT NULL THEN 2 END`,
            first,
            second
          ];
          break;
        }
      }
      sortKeys[alias] ??= [`"m_${alias}"`];
    }
    const filter = this.duplicateExpression(query.filter).toString();
    let sql = `SELECT ${columns.join(", ")} FROM ${this.table} WHERE ${where ? `${where} AND (${filter})` : filter}`;
    if (groupColumns.length) {
      sql += ` GROUP BY ${groupColumns.join(", ")}`;
    }
    const order = (keys: string[], direction: "ASC" | "DESC") =>
      keys.map(key => `${key} ${direction} NULLS ${direction === "ASC" ? "FIRST" : "LAST"}`);
    const orders = (query.orderBy ?? []).flatMap(o => order(sortKeys[o.key], o.direction));
    if (!orders.length) {
      orders.push(...query.groupBy.flatMap(path => order(sortKeys[path], "ASC")));
    }
    if (orders.length) {
      sql += ` ORDER BY ${orders.join(", ")}`;
    }
    const limit = query.limit ?? (query.groupBy.length ? this.aggregationOptions.maxGroups + 1 : undefined);
    if (limit) {
      sql += ` LIMIT ${limit}`;
    }
    const decode = (row: any) => {
      const out: Record<string, unknown> = {};
      query.groupBy.forEach((path, i) => (out[path] = row[`g${i}`] ?? null));
      for (const [alias, metric] of Object.entries(query.metrics)) {
        if (metric.fn === "MIN" || metric.fn === "MAX") {
          const raw = row[`n_${alias}`];
          const n = raw === null || raw === undefined ? null : Number(raw);
          const t = row[`s_${alias}`] ?? null;
          out[alias] = metric.fn === "MIN" ? (n ?? t) : (t ?? n);
        } else {
          const v = row[`m_${alias}`];
          out[alias] = v === null || v === undefined ? null : Number(v);
        }
      }
      return out;
    };
    return { sql, decode };
  }

  /** @override GROUP BY over the data jsonb column */
  protected async executeAggregation(query: AggregationQuery): Promise<AggregationResult<any>> {
    const { sql, decode } = this.buildAggregationSQL(query, this.getClassCondition());
    const res = await this.execute(sql);
    if (query.limit === undefined && res.rows.length > this.aggregationOptions.maxGroups) {
      const { AggregationError } = await import("@webda/ql");
      throw new AggregationError(
        "AGGREGATION_TOO_MANY_GROUPS",
        `Aggregation exceeds ${this.aggregationOptions.maxGroups} groups`
      );
    }
    return { rows: res.rows.map(decode), native: true };
  }

  /**
   * SQL condition selecting the rows a statement targets: its WHERE, restricted to the first LIMIT rows when the
   * statement has a LIMIT (PostgreSQL DELETE and UPDATE have none)
   * @param statement - the parsed statement
   * @returns the condition
   */
  protected getStatementCondition(statement: WebdaQL.Query): string {
    let where = `(${this.duplicateExpression(statement.filter).toString()})`;
    const classCondition = this.getClassCondition();
    if (classCondition) {
      where += ` AND ${classCondition}`;
    }
    if (statement.limit === undefined) {
      return where;
    }
    if (!Number.isSafeInteger(statement.limit) || statement.limit < 0) {
      throw new Error(`Invalid LIMIT: ${statement.limit}`);
    }
    // The WHERE is kept on the outer statement: a row that stopped matching since the sub-select is left alone
    return `${where} AND uuid IN (SELECT uuid FROM ${this.table} WHERE ${where} LIMIT ${statement.limit})`;
  }

  /**
   * Delete in bulk with one `DELETE ... WHERE`: no per-object event (see `Repository.deleteMany`)
   * @override
   */
  async deleteMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("DELETE", statement, params);
    return (await this.execute(`DELETE FROM ${this.table} WHERE ${this.getStatementCondition(parsed)}`, [])).rowCount;
  }

  /**
   * Update in bulk with one `UPDATE ... SET data = jsonb_set(...) WHERE`: no per-object event (see
   * `Repository.updateMany`)
   *
   * SET paths and values are bound parameters (the statement went through the grammar, see `parseStatement`); the
   * parents of a dotted target are created when missing, an existing array parent is indexed.
   * @override
   */
  async updateMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("UPDATE", statement, params);
    const values: any[] = [];
    // One step per jsonb_set, each reading the previous one (d0 is the row data): the SQL stays linear in size
    const steps: string[] = [];
    const ensured = new Set<string>();
    for (const { field, value } of parsed.assignments!) {
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
    const data = `(SELECT d${steps.length} FROM (SELECT ${this.table}.data AS d0) s0${steps
      .map((step, i) => ` CROSS JOIN LATERAL (SELECT ${step} AS d${i + 1}) s${i + 1}`)
      .join("")})`;
    return (
      await this.execute(`UPDATE ${this.table} SET data = ${data} WHERE ${this.getStatementCondition(parsed)}`, values)
    ).rowCount;
  }

  /** @override — iterate via paginated SQL queries */
  async *iterate(queryStr: string): AsyncGenerator<InstanceType<T>, any, any> {
    const WebdaQLMod = await import("@webda/ql");
    const parsed: any = WebdaQLMod.parse(queryStr);
    WebdaQLMod.assertFilterQuery(parsed);
    if (!parsed.limit) {
      parsed.limit = 100;
    }
    do {
      const res = await this.query(parsed.toString?.() ?? queryStr);
      for (const item of res.results) {
        yield item;
      }
      parsed.continuationToken = res.continuationToken;
    } while (parsed.continuationToken);
  }

  /**
   * Delete all rows from the table (used in tests).
   */
  async __clean(): Promise<void> {
    await this.execute(`DELETE FROM ${this.table}`, []);
  }
}

/** Abstract base class for SQL-backed stores */
export abstract class SQLStore<K extends SQLStoreParameters = SQLStoreParameters> extends Store<K> {
  abstract getRepository<T extends ModelClass>(model: T): Repository<T>;
}
