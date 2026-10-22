import { MemoryRepository, StoreNotFoundError, UpdateConditionFailError } from "@webda/core";
import type { CountResult, ModelClass } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import type { AggregationQuery, AggregationResult } from "@webda/ql";
import { SQLComparisonExpression } from "./comparison.js";
import type { SQLClient, SQLDialect } from "./dialect.js";
import { sqlString } from "./dialect.js";

/**
 * SQL-backed repository for a single model class: one JSON `data` column per `uuid` row.
 *
 * Every statement is assembled from the fragments of a {@link SQLDialect}, so the same logic runs on every engine.
 * The inherited MemoryRepository serialize/deserialize helpers are reused for JSON to model-instance conversion.
 */
export class SQLRepository<T extends ModelClass> extends MemoryRepository<T> {
  /**
   * Create a new SQLRepository.
   * @param model - the model class
   * @param pks - primary key field names
   * @param client - the client, or a function returning the store's current one: the repository then follows the
   *   client the store connects in `init()`, even when created before it or kept across a `stop()`
   * @param table - the table name
   * @param separator - composite key separator
   * @param prepare - awaited before every statement (e.g. to ensure the table exists)
   * @param tableModel - identifier of the model the table was declared for: rows without `__type` (written before
   *   stamping) belong to it. Defaults to the topmost ancestor of `model` carrying metadata.
   * @param dialect - the engine syntax
   */
  constructor(
    model: T,
    pks: string[],
    client: SQLClient | (() => SQLClient | undefined),
    protected readonly table: string,
    separator: string | undefined,
    prepare: (() => Promise<void>) | undefined,
    tableModel: string | undefined,
    protected readonly dialect: SQLDialect
  ) {
    // Pass an empty Map — we do NOT use in-memory storage
    super(model, pks, separator, new Map<string, string>() as any);
    this.clientSource = client;
    this.prepare = prepare;
    this.tableModel = tableModel ?? SQLRepository.rootIdentifier(model);
  }

  /**
   * Awaited before every statement (e.g. to ensure the table exists)
   */
  protected readonly prepare?: () => Promise<void>;

  /**
   * The client, or the function resolving the store's current one
   */
  private readonly clientSource: SQLClient | (() => SQLClient | undefined);

  /**
   * Identifier of the model the table was declared for: unstamped rows belong to it
   */
  protected readonly tableModel?: string;

  /**
   * The client the statements run on
   *
   * Resolved on every access: a repository handed out before its store connected (Store.computeStores asks every
   * store for its repositories from the first store init) or kept across a stop()/init() cycle uses the current one.
   * @returns the client
   * @throws when the store has no client, i.e. is not initialized or is stopped
   */
  protected get client(): SQLClient {
    const client = typeof this.clientSource === "function" ? this.clientSource() : this.clientSource;
    if (!client) {
      throw new Error(`No SQL client for table ${this.table}: the store is not initialized`);
    }
    return client;
  }

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
   * Idempotent; only the repository of the table model writes. Equivalent SQL (PostgreSQL):
   * `UPDATE <table> SET data = data || jsonb_build_object('__type', '<table model>') WHERE data->>'__type' IS NULL`.
   * @returns the number of rows stamped
   */
  async backfillTypes(): Promise<number> {
    const own = (this.model as any)?.Metadata?.Identifier;
    if (!own || own !== this.tableModel) {
      return 0;
    }
    return (await this.execute(this.dialect.backfillTypes(this.table), [own])).rowCount;
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
   * Owns the per-model DDL of the store.
   * @internal Not part of the @webda/models Repository interface.
   */
  async setupTable(): Promise<void> {
    await this.client.query(this.dialect.createTable(this.table));
  }

  /**
   * Run a statement against the client once {@link prepare} has resolved.
   * @param q - the SQL statement
   * @param values - the statement parameters
   * @returns the raw query result
   */
  protected async execute(q: string, values?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    await this.prepare?.();
    return this.client.query(q, values);
  }

  /**
   * Map an expression attribute path array to the SQL text of the value
   * @param attribute - the attribute path
   * @returns the SQL expression
   */
  mapExpressionAttribute(attribute: string[]): string {
    return this.dialect.jsonText(this.checkPath(attribute));
  }

  /**
   * Map an expression attribute path array to its JSON value (not its text)
   * @param attribute - the attribute path
   * @returns the SQL expression
   */
  mapJsonAttribute(attribute: string[]): string {
    return this.dialect.jsonValue(this.checkPath(attribute));
  }

  /**
   * Check the segments of a path written inside a SQL literal: letters, digits and `_`, like WebdaQL identifiers
   * @param attribute - the attribute path
   * @returns the validated segments
   * @throws Error for any other character
   */
  protected checkPath(attribute: string[]): string[] {
    if (attribute.some(segment => !/^[A-Za-z0-9_]+$/.test(segment))) {
      throw new Error(`Invalid attribute path: ${JSON.stringify(attribute)}`);
    }
    return attribute;
  }

  /**
   * SQL condition restricting rows to this model and its subclasses, whatever form their `__type` has (Webda 3 short,
   * lower-case and aliased types included); rows without a stamp (written before stamping) and rows typed as a
   * strict ancestor of the table model belong to the table model and its ancestors
   * @returns the condition, undefined for a model without metadata
   */
  protected getClassCondition(): string | undefined {
    const ids = this.buildClassFilterIdentifiers();
    if (!ids) {
      return undefined;
    }
    // Stored types resolve case-insensitively (`WEBDA/USER` is `Webda/User`)
    const accepted = [...new Set([...ids, ...this.acceptedTypes()].map(name => name.toLowerCase()))];
    const typeText = this.dialect.keyText("__type");
    const typed = `lower(${typeText}) IN (${accepted.map(sqlString).join(", ")})`;
    // Unstamped rows belong to the table model: its repository and its ancestors' see them, a subclass never does
    if (!this.tableModel || !ids.includes(this.tableModel)) {
      return `(${typed})`;
    }
    const ancestors = Object.keys(this.rootAncestorTypes());
    return `(${typed} OR ${typeText} IS NULL OR ${typeText} = ''${
      ancestors.length ? ` OR lower(${typeText}) IN (${ancestors.map(sqlString).join(", ")})` : ""
    })`;
  }

  /**
   * The class of the table model, when it is this model or one of its subclasses
   * @returns the class, undefined when the table model is unknown or outside the model family
   */
  protected tableModelClass(): any {
    if (!this.tableModel || !(this.model as any)?.Metadata?.Identifier) {
      return undefined;
    }
    return this.typeResolver()
      .family(this.model)
      .find(clazz => (clazz as any).Metadata?.Identifier === this.tableModel);
  }

  /**
   * Stored types naming a strict ancestor of the table model (e.g. `CoreModel` in a table of an application model):
   * such rows belong to the table model, like unstamped rows
   * @returns the current identifier of the table model by lower-cased stored type, empty when this model does not own
   *   the table
   */
  protected rootAncestorTypes(): Record<string, string> {
    const root = this.tableModelClass();
    const types: Record<string, string> = {};
    if (!root) {
      return types;
    }
    const resolver = this.typeResolver();
    for (let clazz = Object.getPrototypeOf(root); clazz && clazz !== Function.prototype;) {
      if (Object.prototype.hasOwnProperty.call(clazz, "Metadata") && clazz.Metadata?.Identifier) {
        const names = resolver.knows(clazz) ? resolver.acceptedTypes(clazz) : [clazz.Metadata.Identifier];
        for (const name of names) {
          if (!resolver.knows(clazz) || resolver.resolveStoredType(name) === clazz) {
            types[name.toLowerCase()] = this.tableModel!;
          }
        }
      }
      clazz = Object.getPrototypeOf(clazz);
    }
    return types;
  }

  /**
   * Stored types to rewrite when a row of this model family is written: each legacy form (short, lower-case, alias)
   * to its current identifier, and the ancestor types of the table model to the table model
   * @returns the current identifier by lower-cased stored type
   */
  protected legacyTypeMap(): Record<string, string> {
    if (!(this.model as any)?.Metadata?.Identifier) {
      return {};
    }
    const resolver = this.typeResolver();
    const map: Record<string, string> = { ...this.rootAncestorTypes() };
    for (const name of this.acceptedTypes()) {
      const resolved = resolver.resolveStoredType(name);
      const current = resolved
        ? (resolver.getIdentifier(resolved) ?? (resolved as any).Metadata?.Identifier)
        : undefined;
      if (current) {
        map[name.toLowerCase()] = current;
      }
    }
    return map;
  }

  /**
   * SQL expression of the `__type` a written row keeps: its stored type, rewritten to the current identifier when it
   * is a legacy form of this model family
   * @param mapParam - position of the bound {@link legacyTypeMap} parameter
   * @returns the SQL expression
   */
  protected keptTypeExpression(mapParam: number): string {
    return this.dialect.keptType(mapParam);
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
   *
   * An `undefined` or `null` expected value means the field is absent: it is matched with `IS NULL`, as `= NULL` is
   * never true in SQL (a missing key and a JSON null both read as NULL)
   * @param writeCondition - the expected value
   * @param writeConditionField - the field to check
   * @param params - the existing params array (will be extended in place)
   * @returns the SQL AND clause
   */
  getQueryCondition(writeCondition: any, writeConditionField: string, params: any[]): string {
    if (writeCondition === undefined || writeCondition === null) {
      return ` AND ${this.dialect.keyText(writeConditionField)} IS NULL`;
    }
    const condition = writeCondition instanceof Date ? writeCondition.toISOString() : writeCondition;
    params.push(condition);
    return ` AND ${this.dialect.keyText(writeConditionField)}=${this.dialect.placeholder(params.length)}`;
  }

  /**
   * Run a raw SQL query and return typed results.
   * @param q - the SQL query (WHERE clause or full query)
   * @param values - the query parameters
   * @returns the raw query result
   */
  protected async sqlQuery(q: string, values: any[] = []): Promise<{ rows: any[]; rowCount: number }> {
    if (!q.startsWith("DELETE") && !q.startsWith("INSERT") && !q.startsWith("SELECT") && !q.startsWith("UPDATE")) {
      q = `SELECT * FROM ${this.table} WHERE ${q}`;
    }
    return this.execute(q, values);
  }

  /**
   * Deserialize a raw JSON object from the database into a model instance.
   * @param stored - the decoded JSON object of the data column; its `__type` stamp becomes a non-enumerable property
   * @returns the model instance
   */
  protected fromJSON(stored: any): InstanceType<T> {
    const { __type, ...data } = stored ?? {};
    const typed = typeof __type === "string" && __type !== "";
    // A row loads as the class its type resolves to (a Webda 3 form included): a subclass row as the subclass
    const clazz: any = (typed && this.findModelClass(__type)) || this.model;
    const instance = new clazz({}) as InstanceType<T>;
    if (typeof (instance as any).load === "function") {
      (instance as any).load(data);
    } else {
      Object.assign(instance as any, data);
    }
    if (__type !== undefined) {
      Object.defineProperty(instance, "__type", {
        // The current identifier of a legacy type, the stored value when it is unknown or ambiguous
        value: typed ? this.currentTypeOf(instance, __type) : __type,
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
    const res = await this.sqlQuery(`SELECT data FROM ${this.table} WHERE uuid=${this.dialect.placeholder(1)}`, [key]);
    if (res.rowCount === 0) {
      throw new Error(`Not found: ${key}`);
    }
    return this.fromJSON(this.dialect.decode(res.rows[0].data));
  }

  /** @override */
  async create(data: any, _save: boolean = true): Promise<any> {
    // Persist the built item: a primary key generated by the model (e.g. UuidModel)
    // must be the one stored in the row, not only the one used as key
    const item = this.buildItem(data);
    const key = this.getPrimaryKey(item).toString();
    try {
      const p = (i: number) => this.dialect.placeholder(i);
      await this.execute(`INSERT INTO ${this.table}(uuid,data) VALUES(${p(1)}, ${p(2)})`, [
        key,
        this.toStoredJSON(item, (this.model as any).Metadata?.Identifier)
      ]);
    } catch (err) {
      // unique violation on the primary key: the object exists, never overwrite it
      if (this.dialect.isUniqueViolation(err)) {
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
    const d = this.dialect;
    // Plain data keeps the stored type: a write through a parent repository never re-types a subclass row; a legacy
    // form of it is written as the current identifier
    let q = `UPDATE ${this.table} SET data=${d.placeholder(1)} WHERE uuid=${d.placeholder(2)}`;
    if (!this.declaredType(data)) {
      args.push(JSON.stringify(this.legacyTypeMap()));
      q = `UPDATE ${this.table} SET data = CASE WHEN ${d.hasStoredType()} THEN ${d.withStoredType(d.jsonParam(1), this.keptTypeExpression(3))} ELSE ${d.jsonParam(1)} END WHERE uuid=${d.placeholder(2)}`;
    }
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
    const d = this.dialect;
    const args: any[] = [];
    const merged = d.shallowMerge("data", data ?? {}, args);
    args.push(key);
    const keyParam = args.length;
    let q = `UPDATE ${this.table} SET data = ${merged} WHERE uuid=${d.placeholder(keyParam)}`;
    if (!Object.prototype.hasOwnProperty.call(data ?? {}, "__type")) {
      // A legacy form of the stored type is written as the current identifier
      args.push(JSON.stringify(this.legacyTypeMap()));
      q = `UPDATE ${this.table} SET data = CASE WHEN ${d.hasStoredType()} THEN ${d.withStoredType(`(${merged})`, this.keptTypeExpression(args.length))} ELSE ${merged} END WHERE uuid=${d.placeholder(keyParam)}`;
    }
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
    let q = `DELETE FROM ${this.table} WHERE uuid=${this.dialect.placeholder(1)}`;
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
    const res = await this.execute(`SELECT uuid FROM ${this.table} WHERE uuid=${this.dialect.placeholder(1)}`, [key]);
    return res.rowCount === 1;
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const args: any[] = [];
    const removed = this.dialect.removeKey(String(attribute), args);
    args.push(key);
    let q = `UPDATE ${this.table} SET data = ${removed} WHERE uuid=${this.dialect.placeholder(args.length)}`;
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
    const entries: Array<{ property: string; value: number }> = Array.isArray(info)
      ? info.map((e: any) =>
          typeof e === "string" ? { property: e, value: 1 } : { property: e.property, value: e.value ?? 1 }
        )
      : Object.entries(info).map(([property, value]) => ({ property: String(property), value: value as number }));
    const q = `UPDATE ${this.table} SET data = ${this.dialect.increment(entries, updateDate.toISOString(), args)} WHERE uuid=${this.dialect.placeholder(1)}`;
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
    // The item is bound as a parameter: inlining it would break (and inject) on any quote, e.g. a file named l'été.png
    const args: any[] = [key, JSON.stringify(item)];
    const d = this.dialect;
    let q = `UPDATE ${this.table} SET data = ${d.setCollectionItem(attr, 2, index, updateDate.toISOString())} WHERE uuid=${d.placeholder(1)}`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND ${d.collectionItemCondition(attr, index, String(itemWriteConditionField), args.length)}`;
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
    const d = this.dialect;
    let q = `UPDATE ${this.table} SET data = ${d.removeCollectionItem(attr, index, updateDate.toISOString())} WHERE uuid=${d.placeholder(1)}`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND ${d.collectionItemCondition(attr, index, String(itemWriteConditionField), args.length)}`;
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
   * Duplicate and translate a WebdaQL expression into SQL JSON path expressions.
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
          (<string[]>expression.value).map(v => new SQLComparisonExpression("=", attr, v, this.dialect, json))
        );
      }
      // IS NULL / IS NOT NULL map natively: the text of a missing key and of a JSON null is NULL
      return new SQLComparisonExpression(
        expression.operator,
        this.mapExpressionAttribute(expression.attribute),
        expression.value,
        this.dialect,
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
    const results = res.rows.map(r => this.fromJSON(this.dialect.decode(r.data)));
    return {
      results,
      continuationToken: limit <= results.length ? (offset + limit).toString() : undefined
    };
  }

  /**
   * JSON expression of a dotted path, JSON null folded into SQL NULL
   * @param path - validated dotted path
   * @returns the SQL expression
   */
  protected jsonPath(path: string): string {
    return this.dialect.jsonValueOrNull(this.checkPath(path.split(".")));
  }

  /**
   * Translate an aggregation to SQL
   *
   * The query is validated again here and paths are checked once more, so they are safe to interpolate.
   * Columns get positional names (`gN` per group path, `mN` / `nN` / `sN` per metric index), mapped back to
   * the aliases by decode: alias length or shared prefixes never meet an identifier length limit.
   * MIN / MAX select a numeric and a text candidate, merged by decode.
   * @param query - the aggregation
   * @param where - extra WHERE condition (class condition), optional
   * @returns the statement and the row decoder
   */
  buildAggregationSQL(query: AggregationQuery, where?: string): { sql: string; decode: (row: any) => any } {
    WebdaQL.validateAggregation(query);
    const metrics = Object.entries(query.metrics);
    const columns: string[] = [];
    const groupColumns: string[] = [];
    // Sort keys of each groupBy path / metric alias: type rank, then number, then text in code unit order, then jsonb
    const sortKeys: Record<string, string[]> = {};
    const d = this.dialect;
    const num = (x: string) => `CASE WHEN ${d.isType(x, "number")} THEN ${d.asNumber(x)} END`;
    const str = (x: string) => `(CASE WHEN ${d.isType(x, "string")} THEN ${d.asString(x)} END) ${d.binaryCollation}`;
    query.groupBy.forEach((path, i) => {
      const x = this.jsonPath(path);
      columns.push(`${x} AS "g${i}"`);
      groupColumns.push(String(i + 1));
      sortKeys[path] = [
        `CASE WHEN ${x} IS NULL THEN NULL WHEN ${d.isType(x, "number")} THEN 1 WHEN ${d.isType(x, "string")} THEN 2 ELSE 3 END`,
        num(x),
        str(x),
        x
      ];
    });
    metrics.forEach(([alias, metric], i) => {
      const x = metric.field ? this.jsonPath(metric.field) : "";
      switch (metric.fn) {
        case "COUNT":
          columns.push(`${metric.field ? `COUNT(${x})` : "COUNT(*)"} AS "m${i}"`);
          break;
        case "COUNT_DISTINCT":
          columns.push(`COUNT(DISTINCT ${x}) AS "m${i}"`);
          break;
        case "SUM":
          columns.push(`COALESCE(SUM(${num(x)}), 0) AS "m${i}"`);
          break;
        case "AVG":
          columns.push(`AVG(${num(x)}) AS "m${i}"`);
          break;
        case "MIN":
        case "MAX": {
          const n = `${metric.fn}(${num(x)})`;
          const t = `${metric.fn}(${str(x)})`;
          columns.push(`${n} AS "n${i}"`, `${t} AS "s${i}"`);
          // The rank follows the type of the decoded value (number 1 < string 2), not the preference:
          // MIN prefers a number, MAX prefers a string. The other candidate only matters when it is the result.
          sortKeys[alias] =
            metric.fn === "MIN"
              ? [
                  `CASE WHEN ${n} IS NOT NULL THEN 1 WHEN ${t} IS NOT NULL THEN 2 END`,
                  n,
                  `CASE WHEN ${n} IS NULL THEN ${t} END`
                ]
              : [
                  `CASE WHEN ${t} IS NOT NULL THEN 2 WHEN ${n} IS NOT NULL THEN 1 END`,
                  `CASE WHEN ${t} IS NULL THEN ${n} END`,
                  t
                ];
          break;
        }
      }
      sortKeys[alias] ??= [`"m${i}"`];
    });
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
      query.groupBy.forEach((path, i) => (out[path] = this.dialect.decode(row[`g${i}`]) ?? null));
      metrics.forEach(([alias, metric], i) => {
        if (metric.fn === "MIN" || metric.fn === "MAX") {
          const raw = row[`n${i}`];
          const n = raw === null || raw === undefined ? null : Number(raw);
          const t = row[`s${i}`] ?? null;
          out[alias] = metric.fn === "MIN" ? (n ?? t) : (t ?? n);
        } else {
          const v = row[`m${i}`];
          out[alias] = v === null || v === undefined ? null : Number(v);
        }
      });
      return out;
    };
    return { sql, decode };
  }

  /** @override GROUP BY over the data JSON column */
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
   * SQL condition selecting the rows of this model matching a filter: the filter and the class condition
   * @param filter - the WebdaQL filter
   * @returns the condition
   */
  protected getFilterCondition(filter: WebdaQL.Expression): string {
    const where = `(${this.duplicateExpression(filter).toString()})`;
    const classCondition = this.getClassCondition();
    return classCondition ? `${where} AND ${classCondition}` : where;
  }

  /**
   * Translate a count to SQL: one `COUNT(*)` over the filter, or over a sub-select stopped at max + 1 rows so a
   * capped count reads at most max + 1 rows
   * @param filter - the WebdaQL filter
   * @param max - stop after max rows, undefined for an exact count
   * @returns the statement, its `n` column holds the count
   */
  buildCountSQL(filter: WebdaQL.Expression, max?: number): string {
    const where = this.getFilterCondition(filter);
    if (max === undefined) {
      return `SELECT COUNT(*) AS n FROM ${this.table} WHERE ${where}`;
    }
    if (!Number.isSafeInteger(max) || max <= 0) {
      throw new Error(`Invalid count max: ${max}`);
    }
    return `SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${this.table} WHERE ${where} LIMIT ${max + 1}) s`;
  }

  /** @override COUNT(*) over the data JSON column */
  protected async executeCount(filter: WebdaQL.Expression, max?: number): Promise<CountResult> {
    const res = await this.execute(this.buildCountSQL(filter, max));
    // PostgreSQL returns COUNT(*) as a bigint string
    const n = Number(res.rows[0]?.n ?? 0);
    return max !== undefined && n > max
      ? { value: max, relation: "gte", native: true }
      : { value: n, relation: "eq", native: true };
  }

  /**
   * SQL condition selecting the rows a statement targets: its WHERE, restricted to the first LIMIT rows when the
   * statement has a LIMIT (DELETE and UPDATE have none on every engine)
   * @param statement - the parsed statement
   * @returns the condition
   */
  protected getStatementCondition(statement: WebdaQL.Query): string {
    const where = this.getFilterCondition(statement.filter);
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
   * Update in bulk with one `UPDATE ... SET data = <assignments> WHERE`: no per-object event (see
   * `Repository.updateMany`)
   *
   * SET paths and values are bound parameters (the statement went through the grammar, see `parseStatement`); the
   * parents of a dotted target are created when missing, an existing array parent is indexed.
   * @override
   */
  async updateMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("UPDATE", statement, params);
    const values: any[] = [];
    const data = this.dialect.bulkAssign(this.table, parsed.assignments!, values);
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
