import { StoreNotFoundError, UpdateConditionFailError, WebdaError } from "@webda/core";
import type { ModelClass } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import type { ColumnPlan, RelationPlan, RelationalSchemaPlan, TablePlan } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import { SQLRepository } from "../repository.js";
import { SQLColumnComparisonExpression } from "./comparison.js";
import type { RelationalDialect } from "./dialect.js";
import { TableMapping } from "./mapping.js";
import type { AttributeTarget, JunctionWrite, RowWrite } from "./mapping.js";
import type { Transact } from "./transaction.js";

/**
 * What a relational store gives a repository
 */
export interface RelationalRepositoryOptions {
  plan: RelationalSchemaPlan;
  table: TablePlan;
  /**
   * The client, or a function returning the store's current one
   */
  client: SQLClient | (() => SQLClient | undefined);
  /**
   * Runs statements in one transaction on one connection
   */
  transact: Transact;
  dialect: RelationalDialect;
  separator?: string;
  prepare?: () => Promise<void>;
}

/**
 * Repository of a model stored in a typed table: one column per field, foreign keys for the links, junction tables
 * for the link collections, the unknown properties in the extra JSON column
 *
 * Every statement names its columns from the plan projection of the written model, so a database shared by several
 * application versions keeps the columns a version does not know.
 */
export class RelationalRepository<T extends ModelClass> extends SQLRepository<T> {
  readonly mapping: TableMapping;
  protected readonly transact: Transact;

  /**
   * @param model - the model class
   * @param pks - primary key field names
   * @param options - the plan, the table and the connection
   */
  constructor(model: T, pks: string[], options: RelationalRepositoryOptions) {
    super(
      model,
      pks,
      options.client,
      options.table.name,
      options.separator,
      options.prepare,
      options.table.root,
      options.dialect
    );
    this.mapping = new TableMapping(options.plan, options.table);
    this.transact = options.transact;
  }

  /**
   * @returns the engine syntax
   */
  protected get sql(): RelationalDialect {
    return this.dialect as RelationalDialect;
  }

  /**
   * @param name - a column or table name
   * @returns the quoted identifier
   */
  protected q(name: string): string {
    return this.sql.quote(name);
  }

  /**
   * The store owns the DDL
   * @override
   */
  async setupTable(): Promise<void> {}

  /**
   * Typed rows are always stamped
   * @override
   */
  async backfillTypes(): Promise<number> {
    return 0;
  }

  /**
   * @param attribute - a WebdaQL attribute
   * @returns the description of the attribute, for messages
   */
  protected attributeName(attribute: string[]): string {
    return `${this.modelIdentifier()}.${attribute.join(".")}`;
  }

  /**
   * Where an attribute lives, refusing what no statement can reach
   * @param path - the validated attribute path
   * @returns the target: a column, a JSON path or the extra column path
   * @throws WebdaError.BadRequest for a junction attribute, a composite reference or an unknown attribute
   */
  protected target(
    path: string[]
  ): Extract<AttributeTarget, { kind: "column" }> | Extract<AttributeTarget, { kind: "json" | "extra" }> {
    const target = this.mapping.resolve(path);
    switch (target.kind) {
      case "column":
      case "json":
      case "extra":
        return target;
      case "junction":
        throw new WebdaError.BadRequest(
          `${this.attributeName(path)} is a link collection stored in ${target.table.name}: query the junction instead`
        );
      case "reference":
        throw new WebdaError.BadRequest(`${this.attributeName(path)} references a composite key: not filterable`);
      default:
        throw new WebdaError.BadRequest(`${this.attributeName(path)} is not a stored field`);
    }
  }

  /** @override */
  protected fieldText(field: string): string {
    return this.mapExpressionAttribute([field]);
  }

  /** @override */
  protected typeText(): string {
    return this.q(this.mapping.typeColumn);
  }

  /** @override */
  protected keyColumns(): string[] {
    return this.mapping.primaryKey.map(c => this.q(c));
  }

  /** @override */
  mapExpressionAttribute(attribute: string[]): string {
    const target = this.target(this.checkPath(attribute));
    return target.kind === "column"
      ? this.q(target.column.name)
      : this.sql.columnJsonText(target.column.name, target.path);
  }

  /** @override */
  mapJsonAttribute(attribute: string[]): string {
    const target = this.target(this.checkPath(attribute));
    return target.kind === "column"
      ? this.sql.toJson(this.q(target.column.name), target.column.type)
      : this.sql.columnJsonValue(target.column.name, target.path);
  }

  /** @override */
  protected jsonPath(path: string): string {
    const target = this.target(this.checkPath(path.split(".")));
    return target.kind === "column"
      ? this.sql.toJson(this.q(target.column.name), target.column.type)
      : this.sql.columnJsonValueOrNull(target.column.name, target.path);
  }

  /**
   * A comparison on a typed column renders for its type; everything else is the JSON translation
   * @override
   */
  duplicateExpression(expression: WebdaQL.Expression): WebdaQL.Expression {
    if (expression instanceof WebdaQL.ComparisonExpression) {
      const target = this.target(this.checkPath(expression.attribute));
      if (target.kind === "column") {
        const column = this.q(target.column.name);
        const compare = (operator: WebdaQL.ComparisonOperator, value: any) =>
          new SQLColumnComparisonExpression(operator, column, value, target.column.type, this.sql);
        if (expression.operator === "IN") {
          return new WebdaQL.OrExpression((<any[]>expression.value).map(v => compare("=", v)));
        }
        return compare(expression.operator, expression.value);
      }
    }
    return super.duplicateExpression(expression);
  }

  /**
   * @param column - a column name of the table
   * @returns the field the column holds
   */
  protected fieldOf(column: string): string {
    return this.mapping.table.columns.find(c => c.name === column)!.field;
  }

  /**
   * @param primaryKey - a primary key, an object or the model instance
   * @param args - the statement parameters, extended with the key values
   * @returns the condition selecting the row
   */
  protected pkCondition(primaryKey: any, args: unknown[]): string {
    const values: Record<string, unknown> = this.getPrimaryKey(primaryKey, true) as any;
    return this.mapping.primaryKey
      .map(column => {
        args.push(values[this.fieldOf(column)]);
        return `${this.q(column)} = ${this.dialect.placeholder(args.length)}`;
      })
      .join(" AND ");
  }

  /**
   * @returns the quoted columns a read selects: every column of the table
   */
  protected selectList(): string {
    return this.mapping
      .readColumns()
      .map(c => this.q(c))
      .join(", ");
  }

  /**
   * @param row - a row of the table
   * @param junction - a junction table
   * @returns the owner key values of its junction rows, in owner column order
   */
  protected ownerValues(row: Record<string, unknown>, junction: TablePlan): unknown[] {
    return junction.columns.filter(c => c.role === "owner").map(c => row[this.columnOfField(c.keyPart!)]);
  }

  /**
   * @param field - a field of the model
   * @returns its column name
   */
  protected columnOfField(field: string): string {
    return this.mapping.table.columns.find(c => c.field === field && c.role !== "extra")!.name;
  }

  /**
   * Read the junction rows of a page of rows: one statement per junction table
   * @param rows - the rows
   * @returns the junction rows by attribute, then by owner key
   */
  protected async loadJunctions(
    rows: Record<string, unknown>[]
  ): Promise<Map<string, Map<string, Record<string, unknown>[]>>> {
    const result = new Map<string, Map<string, Record<string, unknown>[]>>();
    if (!rows.length) {
      return result;
    }
    for (const { table, relation } of this.mapping.junctions()) {
      const owner = table.columns.filter(c => c.role === "owner");
      const args: unknown[] = [];
      const tuples = rows.map(
        row =>
          `(${this.ownerValues(row, table)
            .map(v => (args.push(v), this.dialect.placeholder(args.length)))
            .join(", ")})`
      );
      const keys = owner.length === 1 ? this.q(owner[0].name) : `(${owner.map(c => this.q(c.name)).join(", ")})`;
      const order = table.columns.find(c => c.role === "position" || c.role === "key")!.name;
      const res = await this.execute(
        `SELECT ${table.columns.map(c => this.q(c.name)).join(", ")} FROM ${this.q(table.name)} WHERE ${keys} IN (${tuples.join(", ")}) ORDER BY ${this.q(order)}`,
        args
      );
      const byOwner = new Map<string, Record<string, unknown>[]>();
      for (const junctionRow of res.rows) {
        const key = owner.map(c => String(junctionRow[c.name])).join("\u0000");
        byOwner.set(key, [...(byOwner.get(key) ?? []), junctionRow]);
      }
      result.set(relation.attribute, byOwner);
    }
    return result;
  }

  /**
   * @param rows - rows of the table
   * @returns the model instances, their junction attributes filled
   */
  protected async toInstances(rows: Record<string, unknown>[]): Promise<InstanceType<T>[]> {
    const junctions = await this.loadJunctions(rows);
    const decode = (v: unknown) => this.dialect.decode(v);
    return rows.map(row => {
      const junctionRows = new Map<string, Record<string, unknown>[]>();
      for (const { table, relation } of this.mapping.junctions()) {
        const key = this.ownerValues(row, table)
          .map(v => String(v))
          .join("\u0000");
        junctionRows.set(relation.attribute, junctions.get(relation.attribute)?.get(key) ?? []);
      }
      return this.fromJSON(this.mapping.fromRow(row, junctionRows, decode));
    });
  }

  /**
   * Foreign key violations become Webda errors: a conflict when deleting a referenced row, a bad request otherwise
   * @override
   */
  protected async execute(q: string, values?: any[]): Promise<{ rows: any[]; rowCount: number }> {
    try {
      return await super.execute(q, values);
    } catch (err) {
      throw this.mapError(q, err);
    }
  }

  /**
   * @param q - the statement that failed
   * @param err - the error
   * @returns the Webda error of a foreign key violation, the error itself otherwise
   */
  protected mapError(q: string, err: unknown): unknown {
    const violation = this.sql.isForeignKeyViolation(err);
    if (!violation) {
      return err;
    }
    const relation = this.relationOfConstraint(violation.constraint);
    const what = relation ? `${relation.model}.${relation.attribute}` : (violation.constraint ?? "a foreign key");
    return q.startsWith("DELETE")
      ? new WebdaError.Conflict(`Row still referenced through ${what}`)
      : new WebdaError.BadRequest(`Unknown reference for ${what}`);
  }

  /**
   * @param constraint - a foreign key constraint name
   * @returns the relation it enforces, undefined for a junction key or an unknown constraint
   */
  protected relationOfConstraint(constraint: string | undefined): RelationPlan | undefined {
    return this.mapping.plan.relations.find(r => r.foreignKey === constraint);
  }

  /** @override */
  async get(primaryKey: any): Promise<any> {
    const args: unknown[] = [];
    const condition = this.pkCondition(primaryKey, args);
    const res = await this.execute(`SELECT ${this.selectList()} FROM ${this.q(this.table)} WHERE ${condition}`, args);
    if (res.rowCount === 0) {
      throw new Error(`Not found: ${this.getPrimaryKey(primaryKey).toString()}`);
    }
    return (await this.toInstances(res.rows))[0];
  }

  /** @override */
  async exists(primaryKey: any): Promise<boolean> {
    const args: unknown[] = [];
    const condition = this.pkCondition(primaryKey, args);
    const res = await this.execute(`SELECT 1 FROM ${this.q(this.table)} WHERE ${condition}`, args);
    return res.rowCount === 1;
  }

  /** @override */
  async query(queryStr: string | any): Promise<{ results: InstanceType<T>[]; continuationToken?: string }> {
    // A query object built or changed by code goes back through the grammar before any SQL is written
    const parsed = typeof queryStr === "string" ? WebdaQL.parse(queryStr) : WebdaQL.normalizeQuery(queryStr);
    WebdaQL.assertFilterQuery(parsed);
    let sql = this.getFilterCondition(parsed.filter);
    const offset = parseInt((parsed as any).continuationToken || "0", 10);
    if (parsed.orderBy?.length) {
      sql += ` ORDER BY ${parsed.orderBy
        // NULL is the smallest value on every engine: first ascending, last descending
        .map(
          (c: any) =>
            `${this.mapExpressionAttribute(c.field.split("."))} ${c.direction} NULLS ${c.direction === "DESC" ? "LAST" : "FIRST"}`
        )
        .join(", ")}`;
    }
    const limit = parsed.limit || 1000;
    sql += ` LIMIT ${limit}`;
    if (offset) {
      sql += ` OFFSET ${offset}`;
    }
    const res = await this.execute(`SELECT ${this.selectList()} FROM ${this.q(this.table)} WHERE ${sql}`, []);
    const results = await this.toInstances(res.rows);
    return {
      results,
      continuationToken: limit <= results.length ? (offset + limit).toString() : undefined
    };
  }

  /**
   * @param column - a column
   * @returns whether it holds a number
   */
  protected isNumeric(column: ColumnPlan): boolean {
    return ["bigint", "double", "decimal"].includes(column.type.kind);
  }
  /**
   * Run a statement on a transaction client or on the store client, with the same error mapping
   * @param tx - the transaction client, undefined for the store client
   * @param q - the statement
   * @param values - its parameters
   * @returns the result
   */
  protected async run(
    tx: SQLClient | undefined,
    q: string,
    values?: unknown[]
  ): Promise<{ rows: any[]; rowCount: number }> {
    if (!tx) {
      return this.execute(q, values);
    }
    try {
      return await tx.query(q, values as any[]);
    } catch (err) {
      throw this.mapError(q, err);
    }
  }

  /**
   * Run statements in one transaction when they are several, directly otherwise. Deferred foreign keys fail at
   * COMMIT: that error is mapped like the statement's
   * @param needed - whether several statements are involved
   * @param kind - the statement kind, for the error mapping
   * @param fn - the statements
   * @returns the function result
   */
  protected async maybeTransact<R>(
    needed: boolean,
    kind: "INSERT" | "UPDATE" | "DELETE",
    fn: (tx: SQLClient | undefined) => Promise<R>
  ): Promise<R> {
    if (!needed) {
      return fn(undefined);
    }
    try {
      return await this.transact(tx => fn(tx));
    } catch (err) {
      throw this.mapError(kind, err);
    }
  }

  /**
   * @param item - an object or plain data
   * @param fallbackType - the type stamped when the object declares none
   * @returns its serialized JSON, `__type` set when known
   */
  protected toJSONRecord(item: any, fallbackType?: string): Record<string, unknown> {
    return JSON.parse(this.toStoredJSON(item, fallbackType));
  }

  /**
   * @returns the identifier of the repository model
   */
  protected modelIdentifier(): string {
    return (this.model as any).Metadata.Identifier;
  }

  /**
   * Replace (or create) the junction rows of one owner
   * @param tx - the transaction client
   * @param owner - the owner object (its primary key fields)
   * @param junction - the rows
   * @param replace - delete the current rows first
   */
  protected async writeJunction(
    tx: SQLClient | undefined,
    owner: Record<string, unknown>,
    junction: JunctionWrite,
    replace: boolean
  ): Promise<void> {
    const table = junction.table;
    if (replace) {
      const args: unknown[] = [];
      await this.run(tx, `DELETE FROM ${this.q(table.name)} WHERE ${this.ownerCondition(table, owner, args)}`, args);
    }
    if (!junction.rows.length) {
      return;
    }
    const columns = Object.keys(junction.rows[0]);
    const args: unknown[] = [];
    const tuples = junction.rows.map(
      row => `(${columns.map(c => (args.push(row[c]), this.dialect.placeholder(args.length))).join(", ")})`
    );
    await this.run(
      tx,
      `INSERT INTO ${this.q(table.name)} (${columns.map(c => this.q(c)).join(", ")}) VALUES ${tuples.join(", ")}`,
      args
    );
  }

  /**
   * @param table - a junction table
   * @param owner - the owner object (its primary key fields)
   * @param args - the statement parameters, extended
   * @returns the condition selecting the junction rows of the owner
   */
  protected ownerCondition(table: TablePlan, owner: Record<string, unknown>, args: unknown[]): string {
    return Object.entries(this.mapping.ownerColumns(table, owner))
      .map(([column, value]) => {
        args.push(value);
        return `${this.q(column)} = ${this.dialect.placeholder(args.length)}`;
      })
      .join(" AND ");
  }

  /**
   * The SET assignments of a row write: the extra column merged, the type kept when the data declares none
   * @param row - the row
   * @param args - the statement parameters, extended
   * @returns the assignments
   */
  protected assignments(row: Pick<RowWrite, "columns" | "values">, args: unknown[]): string[] {
    const sets: string[] = [];
    let typed = false;
    row.columns.forEach((column, i) => {
      const value = row.values[i];
      if (column === this.mapping.extraColumn) {
        // toRow serialized the extra object for an INSERT; the UPDATE merges it
        sets.push(`${this.q(column)} = ${this.sql.columnJsonMerge(column, JSON.parse(value as string), args)}`);
      } else if (column === this.mapping.typeColumn) {
        typed = true;
        args.push(value ?? this.modelIdentifier());
        // Plain data keeps the stored type: a write through a parent repository never re-types a subclass row
        sets.push(
          value === null || value === undefined
            ? `${this.q(column)} = COALESCE(${this.q(column)}, ${this.dialect.placeholder(args.length)})`
            : `${this.q(column)} = ${this.dialect.placeholder(args.length)}`
        );
      } else {
        args.push(value);
        sets.push(`${this.q(column)} = ${this.dialect.placeholder(args.length)}`);
      }
    });
    if (!typed) {
      args.push(this.modelIdentifier());
      sets.push(`${this.typeText()} = COALESCE(${this.typeText()}, ${this.dialect.placeholder(args.length)})`);
    }
    return sets;
  }

  /**
   * Write a row and its junctions: the UPDATE must hit one row, the junctions are replaced in the same transaction
   * @param primaryKey - the row key
   * @param row - the row
   * @param conditionField - write condition field
   * @param condition - write condition value
   */
  protected async writeRow(primaryKey: any, row: RowWrite, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const owner = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
    await this.maybeTransact(row.junctions.length > 0, "UPDATE", async tx => {
      const args: unknown[] = [];
      const sets = this.assignments(row, args);
      let q = `UPDATE ${this.q(this.table)} SET ${sets.join(", ")} WHERE ${this.pkCondition(primaryKey, args)}`;
      if (conditionField) {
        q += this.getQueryCondition(condition, conditionField as string, args);
      }
      const res = await this.run(tx, q, args);
      if (res.rowCount === 0) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      }
      for (const junction of row.junctions) {
        await this.writeJunction(tx, owner, junction, true);
      }
    });
  }

  /** @override */
  async create(data: any, _save: boolean = true): Promise<any> {
    const item = this.buildItem(data);
    const key = this.getPrimaryKey(item).toString();
    const json = this.toJSONRecord(item, this.modelIdentifier());
    const row = this.mapping.toRow(json, this.modelIdentifier(), false);
    const placeholders = row.values.map((_, i) => this.dialect.placeholder(i + 1));
    try {
      await this.maybeTransact(
        row.junctions.some(j => j.rows.length > 0),
        "INSERT",
        async tx => {
          await this.run(
            tx,
            `INSERT INTO ${this.q(this.table)} (${row.columns.map(c => this.q(c)).join(", ")}) VALUES (${placeholders.join(", ")})`,
            row.values
          );
          for (const junction of row.junctions) {
            await this.writeJunction(tx, json, junction, false);
          }
        }
      );
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
    const json = this.toJSONRecord(data);
    await this.writeRow(data, this.mapping.toRow(json, this.modelIdentifier(), false), conditionField, condition);
  }

  /** @override */
  async patch(primaryKey: any, data: any, conditionField?: any, condition?: any): Promise<void> {
    const json: Record<string, unknown> = { ...(data ?? {}) };
    // An enumerable `__type` of plain data is never trusted
    delete json.__type;
    const keyValues = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
    const row = this.mapping.toRow({ ...keyValues, ...json }, this.modelIdentifier(), true);
    // The key columns are never patched
    const kept = row.columns
      .map((column, i) => [column, row.values[i]] as const)
      .filter(([column]) => !this.mapping.primaryKey.includes(column));
    await this.writeRow(
      primaryKey,
      { columns: kept.map(([c]) => c), values: kept.map(([, v]) => v), junctions: row.junctions },
      conditionField,
      condition
    );
  }

  /** @override */
  async delete(primaryKey: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const owner = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
    const junctions = this.mapping.junctions();
    await this.maybeTransact(junctions.length > 0, "DELETE", async tx => {
      const args: unknown[] = [];
      let q = `DELETE FROM ${this.q(this.table)} WHERE ${this.pkCondition(primaryKey, args)}`;
      if (conditionField) {
        q += this.getQueryCondition(condition, conditionField as string, args);
      }
      const res = await this.run(tx, q, args);
      if (conditionField && res.rowCount === 0) {
        throw new UpdateConditionFailError(key as any, conditionField as string, condition);
      }
      for (const { table } of junctions) {
        const junctionArgs: unknown[] = [];
        await this.run(
          tx,
          `DELETE FROM ${this.q(table.name)} WHERE ${this.ownerCondition(table, owner, junctionArgs)}`,
          junctionArgs
        );
      }
    });
  }

  /** @override */
  async removeAttribute(primaryKey: any, attribute: any, conditionField?: any, condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const name = String(attribute);
    const target = this.mapping.resolve(this.checkPath([name]));
    const args: unknown[] = [];
    let set: string;
    if (target.kind === "column" || target.kind === "json") {
      set = `${this.q(target.column.name)} = NULL`;
    } else if (target.kind === "reference") {
      set = target.columns.map(c => `${this.q(c.name)} = NULL`).join(", ");
    } else if (target.kind === "extra") {
      args.push(name);
      set = `${this.q(target.column.name)} = ${this.sql.columnJsonRemoveKey(target.column.name, args.length)}`;
    } else if (target.kind === "junction") {
      const owner = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
      await this.transact(async tx => {
        const check: unknown[] = [];
        let q = `SELECT 1 FROM ${this.q(this.table)} WHERE ${this.pkCondition(primaryKey, check)}`;
        if (conditionField) {
          q += this.getQueryCondition(condition, conditionField as string, check);
        }
        if ((await this.run(tx, q, check)).rowCount === 0) {
          throw conditionField
            ? new UpdateConditionFailError(key as any, conditionField as string, condition)
            : new StoreNotFoundError(key as any, this.table);
        }
        await this.writeJunction(tx, owner, { table: target.table, relation: target.relation, rows: [] }, true);
      }).catch(err => {
        throw this.mapError("DELETE", err);
      });
      return;
    } else {
      throw new WebdaError.BadRequest(`${this.attributeName([name])} cannot be removed`);
    }
    let q = `UPDATE ${this.q(this.table)} SET ${set} WHERE ${this.pkCondition(primaryKey, args)}`;
    if (conditionField) {
      q += this.getQueryCondition(condition, conditionField as string, args);
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw conditionField
        ? new UpdateConditionFailError(key as any, conditionField as string, condition)
        : new StoreNotFoundError(key as any, this.table);
    }
  }

  /**
   * @param args - the statement parameters, extended
   * @returns the `_lastUpdate` assignment when the table has that column, empty otherwise
   */
  protected lastUpdateSet(args: unknown[]): string[] {
    const target = this.mapping.resolve(["_lastUpdate"]);
    if (target.kind !== "column") {
      return [];
    }
    args.push(new Date().toISOString());
    return [`${this.q(target.column.name)} = ${this.dialect.placeholder(args.length)}`];
  }

  /** @override */
  async incrementAttributes(primaryKey: any, info: any, _conditionField?: any, _condition?: any): Promise<void> {
    const key = this.getPrimaryKey(primaryKey).toString();
    const entries: { property: string; value: number }[] = Array.isArray(info)
      ? info.map((e: any) =>
          typeof e === "string" ? { property: e, value: 1 } : { property: e.property, value: e.value ?? 1 }
        )
      : Object.entries(info).map(([property, value]) => ({ property: String(property), value: value as number }));
    const args: unknown[] = [];
    const sets = entries.map(({ property, value }) => {
      const target = this.mapping.resolve(this.checkPath([property]));
      if (target.kind !== "column" || !this.isNumeric(target.column)) {
        throw new WebdaError.BadRequest(`${this.attributeName([property])} is not a numeric column`);
      }
      args.push(value);
      const column = this.q(target.column.name);
      return `${column} = COALESCE(${column}, 0) + ${this.dialect.placeholder(args.length)}`;
    });
    sets.push(...this.lastUpdateSet(args));
    const res = await this.execute(
      `UPDATE ${this.q(this.table)} SET ${sets.join(", ")} WHERE ${this.pkCondition(primaryKey, args)}`,
      args
    );
    if (res.rowCount === 0) {
      throw new StoreNotFoundError(key as any, this.table);
    }
  }

  /**
   * @param collection - a collection attribute
   * @returns its JSON column, or its junction when it is a simple link array
   * @throws WebdaError.BadRequest for any other attribute
   */
  protected collectionTarget(
    collection: any
  ): Extract<AttributeTarget, { kind: "json" | "junction" }> | Extract<AttributeTarget, { kind: "extra" }> {
    const name = String(collection);
    const target = this.mapping.resolve(this.checkPath([name]));
    if (target.kind === "json" || target.kind === "extra") {
      return target;
    }
    if (target.kind === "junction" && target.relation.kind === "linksSimpleArray") {
      return target;
    }
    throw new WebdaError.BadRequest(`${this.attributeName([name])} is not a collection`);
  }

  /**
   * @param tx - the transaction client
   * @param table - a junction table
   * @param owner - the owner object (its primary key fields)
   * @returns the number of junction rows of the owner
   */
  protected async junctionCount(tx: SQLClient, table: TablePlan, owner: Record<string, unknown>): Promise<number> {
    const args: unknown[] = [];
    const res = await this.run(
      tx,
      `SELECT count(*) AS n FROM ${this.q(table.name)} WHERE ${this.ownerCondition(table, owner, args)}`,
      args
    );
    return Number(res.rows[0].n);
  }

  /**
   * Make sure the owner row exists (with its write condition when given)
   * @param tx - the transaction client
   * @param primaryKey - the owner key
   * @param key - the key text
   */
  protected async requireRow(tx: SQLClient, primaryKey: any, key: string): Promise<void> {
    const args: unknown[] = [];
    const res = await this.run(
      tx,
      `SELECT 1 FROM ${this.q(this.table)} WHERE ${this.pkCondition(primaryKey, args)}`,
      args
    );
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
    const target = this.collectionTarget(collection);
    const owner = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
    if (target.kind === "junction") {
      const table = target.table;
      const targetColumn = table.columns.find(c => c.role === "target")!.name;
      const position = table.columns.find(c => c.role === "position")!.name;
      const targetKey = typeof item === "object" && item !== null ? item.uuid : item;
      await this.transact(async tx => {
        await this.requireRow(tx, primaryKey, key);
        if (index !== undefined) {
          const args: unknown[] = [targetKey, index];
          const p = (i: number) => this.dialect.placeholder(i);
          let q = `UPDATE ${this.q(table.name)} SET ${this.q(targetColumn)} = ${p(1)} WHERE ${this.q(position)} = ${p(2)} AND ${this.ownerCondition(table, owner, args)}`;
          if (itemWriteCondition !== undefined) {
            args.push(itemWriteCondition);
            q += ` AND ${this.q(targetColumn)} = ${this.dialect.placeholder(args.length)}`;
          }
          const res = await this.run(tx, q, args);
          if (res.rowCount > 0) {
            return;
          }
          if (itemWriteCondition !== undefined) {
            throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
          }
        } else if (itemWriteCondition !== undefined) {
          // An append with a write condition never matches, like the other stores
          throw new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition);
        }
        // Append (an index beyond the end appends too)
        const count = await this.junctionCount(tx, table, owner);
        const row = { ...this.mapping.ownerColumns(table, owner), [targetColumn]: targetKey, [position]: count };
        await this.writeJunction(tx, owner, { table, relation: target.relation, rows: [row] }, false);
      }).catch(err => {
        if (this.dialect.isUniqueViolation(err)) {
          throw new WebdaError.Conflict(`${this.attributeName([String(collection)])} already holds ${targetKey}`);
        }
        throw this.mapError("INSERT", err);
      });
      return;
    }
    const column = target.column.name;
    // The item is bound as a parameter: inlining it would break (and inject) on any quote
    const args: unknown[] = [JSON.stringify(item)];
    const sets = [`${this.q(column)} = ${this.sql.columnJsonSetItem(column, 1, index)}`, ...this.lastUpdateSet(args)];
    let q = `UPDATE ${this.q(this.table)} SET ${sets.join(", ")} WHERE ${this.pkCondition(primaryKey, args)}`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND ${this.sql.columnJsonItemCondition(column, index, String(itemWriteConditionField), args.length)}`;
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw itemWriteCondition !== undefined
        ? new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition)
        : new StoreNotFoundError(key as any, this.table);
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
    const target = this.collectionTarget(collection);
    const owner = this.getPrimaryKey(primaryKey, true) as Record<string, unknown>;
    if (target.kind === "junction") {
      const table = target.table;
      const targetColumn = table.columns.find(c => c.role === "target")!.name;
      const position = this.q(table.columns.find(c => c.role === "position")!.name);
      await this.transact(async tx => {
        await this.requireRow(tx, primaryKey, key);
        const args: unknown[] = [index];
        let q = `DELETE FROM ${this.q(table.name)} WHERE ${position} = ${this.dialect.placeholder(1)} AND ${this.ownerCondition(table, owner, args)}`;
        if (itemWriteCondition !== undefined) {
          args.push(itemWriteCondition);
          q += ` AND ${this.q(targetColumn)} = ${this.dialect.placeholder(args.length)}`;
        }
        const res = await this.run(tx, q, args);
        if (res.rowCount === 0) {
          throw itemWriteCondition !== undefined
            ? new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition)
            : new StoreNotFoundError(key as any, this.table);
        }
        const renumber: unknown[] = [index];
        await this.run(
          tx,
          `UPDATE ${this.q(table.name)} SET ${position} = ${position} - 1 WHERE ${position} > ${this.dialect.placeholder(1)} AND ${this.ownerCondition(table, owner, renumber)}`,
          renumber
        );
      });
      return;
    }
    const column = target.column.name;
    const args: unknown[] = [];
    const sets = [`${this.q(column)} = ${this.sql.columnJsonRemoveItem(column, index)}`, ...this.lastUpdateSet(args)];
    let q = `UPDATE ${this.q(this.table)} SET ${sets.join(", ")} WHERE ${this.pkCondition(primaryKey, args)}`;
    if (itemWriteCondition !== undefined) {
      args.push(itemWriteCondition);
      q += ` AND ${this.sql.columnJsonItemCondition(column, index, String(itemWriteConditionField), args.length)}`;
    }
    const res = await this.execute(q, args);
    if (res.rowCount === 0) {
      throw itemWriteCondition !== undefined
        ? new UpdateConditionFailError(key as any, String(itemWriteConditionField), itemWriteCondition)
        : new StoreNotFoundError(key as any, this.table);
    }
  }

  /**
   * Update in bulk: a column assignment binds the encoded value, a path into a JSON column (or an unknown field into
   * the extra column) is set in place; one assignment per JSON column
   * @override
   */
  async updateMany(statement: string | WebdaQL.Query, params?: WebdaQL.QueryParameters): Promise<number> {
    const parsed = await this.parseStatement("UPDATE", statement, params);
    const args: unknown[] = [];
    const sets: string[] = [];
    const jsonColumns = new Set<string>();
    for (const { field, value } of parsed.assignments!) {
      const path = this.checkPath(field.split("."));
      const target = this.mapping.resolve(path);
      if (target.kind === "column") {
        if (path.length > 1) {
          throw new WebdaError.BadRequest(`${this.attributeName(path)}: ${target.column.name} is not a JSON column`);
        }
        args.push(this.mapping.encode(value, target.column));
        sets.push(`${this.q(target.column.name)} = ${this.dialect.placeholder(args.length)}`);
      } else if (target.kind === "json" || target.kind === "extra") {
        const column = target.column.name;
        if (jsonColumns.has(column)) {
          throw new WebdaError.BadRequest(`${this.attributeName(path)}: one assignment per JSON column (${column})`);
        }
        jsonColumns.add(column);
        if (!target.path.length) {
          args.push(JSON.stringify(value));
          sets.push(`${this.q(column)} = ${this.dialect.placeholder(args.length)}`);
        } else {
          args.push(JSON.stringify(value));
          sets.push(`${this.q(column)} = ${this.sql.columnJsonSetPath(column, target.path, args.length)}`);
        }
      } else {
        this.target(path);
      }
    }
    const res = await this.execute(
      `UPDATE ${this.q(this.table)} SET ${sets.join(", ")} WHERE ${this.getStatementCondition(parsed)}`,
      args
    );
    return res.rowCount;
  }

  /**
   * Delete every row of the table and of its junctions (tests)
   * @override
   */
  async __clean(): Promise<void> {
    for (const { table } of this.mapping.junctions()) {
      await this.execute(`DELETE FROM ${this.q(table.name)}`, []);
    }
    await this.execute(`DELETE FROM ${this.q(this.table)}`, []);
  }
}
