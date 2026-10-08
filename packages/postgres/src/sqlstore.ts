import { MemoryRepository, Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "@webda/core";
import type { ModelClass, Repository } from "@webda/core";
import * as WebdaQL from "@webda/ql";

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

/** Extends ComparisonExpression to emit SQL-compatible string literals for JSONB comparisons */
export class SQLComparisonExpression extends WebdaQL.ComparisonExpression {
  /**
   * Single quotes are doubled so a value can never close the literal. Backslashes stay
   * literal: with `standard_conforming_strings` (PostgreSQL default) `\\` is not an
   * escape character in '...' strings — only LIKE gives it a meaning.
   *
   * @override
   * @param value - the value to stringify
   * @returns SQL-compatible string literal
   */
  toStringValue(value: (string | number | boolean) | (string | number | boolean)[]): string {
    if (typeof value === "string") {
      return `'${value.replace(/'/g, "''")}'`;
    }
    return super.toStringValue(value);
  }

  /**
   * @override
   * @returns SQL attribute expression with type cast
   */
  toStringAttribute(): string {
    switch (typeof this.value) {
      case "boolean":
        return `COALESCE(${this.attribute[0]}, false) AS boolean`;
      case "number":
        return `COALESCE(${this.attribute[0]}, 0) AS bigint`;
      default:
        return this.attribute[0];
    }
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
   */
  constructor(
    model: T,
    pks: string[],
    protected readonly client: SQLClient,
    protected readonly table: string,
    separator?: string,
    protected readonly prepare?: () => Promise<void>
  ) {
    // Pass an empty Map — we do NOT use in-memory storage
    super(model, pks, separator, new Map<string, string>() as any);
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
    return `data#>>'{${attribute.join(",")}}'`;
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
   * @param data - the raw JSON object from the JSONB column
   * @returns the model instance
   */
  protected fromJSON(data: any): InstanceType<T> {
    const instance = new this.model({}) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
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
      await this.execute(`INSERT INTO ${this.table}(uuid,data) VALUES($1, $2)`, [key, JSON.stringify(item)]);
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
    const args: any[] = [JSON.stringify(data), key];
    let q = `UPDATE ${this.table} SET data=$1 WHERE uuid=$2`;
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
        return new WebdaQL.OrExpression(
          (<string[]>expression.value).map(v => new SQLComparisonExpression("=", attr, v))
        );
      }
      if (expression.operator === "CONTAINS") {
        return new SQLComparisonExpression(
          <any>"?",
          "(" + this.mapExpressionAttribute(expression.attribute) + ")::jsonb",
          expression.value
        );
      }
      // IS NULL / IS NOT NULL map natively: `data#>>'{a}'` is NULL for a missing key and a JSON null
      return new SQLComparisonExpression(
        expression.operator,
        this.mapExpressionAttribute(expression.attribute),
        expression.value
      );
    }
    return expression;
  }

  /** @override — use SQL WHERE clause instead of in-memory scan */
  async query(queryStr: string): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    const WebdaQLMod = await import("@webda/ql");
    const parsed = WebdaQLMod.parse(queryStr);
    let sql = this.duplicateExpression(parsed.filter).toString();
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

  /** @override — iterate via paginated SQL queries */
  async *iterate(queryStr: string): AsyncGenerator<InstanceType<T>, any, any> {
    const WebdaQLMod = await import("@webda/ql");
    const parsed: any = WebdaQLMod.parse(queryStr);
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
