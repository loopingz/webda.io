import { WebdaError } from "@webda/core";
import type { ModelClass } from "@webda/core";
import * as WebdaQL from "@webda/ql";
import type { ColumnPlan, RelationPlan, RelationalSchemaPlan, TablePlan } from "@webda/sql-schema";
import type { SQLClient } from "../dialect.js";
import { SQLRepository } from "../repository.js";
import { SQLColumnComparisonExpression } from "./comparison.js";
import type { RelationalDialect } from "./dialect.js";
import { TableMapping } from "./mapping.js";
import type { AttributeTarget } from "./mapping.js";
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
    return `${(this.model as any)?.Metadata?.Identifier ?? this.table}.${attribute.join(".")}`;
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
    return this.mapping.table.columns.find(c => c.name === column)?.field ?? column;
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
    return junction.columns
      .filter(c => c.role === "owner")
      .map(c => row[this.columnOfField(c.keyPart ?? this.fieldOf(this.mapping.primaryKey[0]))]);
  }

  /**
   * @param field - a field of the model
   * @returns its column name
   */
  protected columnOfField(field: string): string {
    return this.mapping.table.columns.find(c => c.field === field && c.role !== "extra")?.name ?? field;
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
      const violation = this.sql.isForeignKeyViolation(err);
      if (!violation) {
        throw err;
      }
      const relation = this.relationOfConstraint(violation.constraint);
      const what = relation ? `${relation.model}.${relation.attribute}` : (violation.constraint ?? "a foreign key");
      if (q.startsWith("DELETE")) {
        throw new WebdaError.Conflict(`Row still referenced through ${what}`);
      }
      throw new WebdaError.BadRequest(`Unknown reference for ${what}`);
    }
  }

  /**
   * @param constraint - a foreign key constraint name
   * @returns the relation it enforces, undefined for a junction key or an unknown constraint
   */
  protected relationOfConstraint(constraint: string | undefined): RelationPlan | undefined {
    return constraint ? this.mapping.plan.relations.find(r => r.foreignKey === constraint) : undefined;
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
}
