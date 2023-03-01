import { CoreModel, Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError, WebdaQL } from "@webda/core";

export interface SQLDatabase {
  name: string;
}

export class SQLStoreParameters extends StoreParameters {
  table: string;
  database: SQLDatabase;
}

export interface SQLClient {
  query: () => Promise<void>;
}

export interface SQLResult<T> {
  rows: T[];
  rowCount: number;
}

export class SQLComparisonExpression extends WebdaQL.ComparisonExpression {
  toStringValue(value: (string | number | boolean) | (string | number | boolean)[]): string {
    if (typeof value === "string") {
      return `'${value}'`;
    }
    return super.toStringValue(value);
  }

  toStringAttribute(): string {
    if ([">", "<", "<=", ">="].includes(this.operator)) {
      // coalesce(data#>>'{${this.attribute[0]}}', '0') ?
      return `CAST(${this.attribute[0]} AS integer)`;
    }
    return this.attribute[0];
  }
}

export abstract class SQLStore<T extends CoreModel, K extends SQLStoreParameters = SQLStoreParameters> extends Store<
  T,
  K
> {
  sqlQuery(q: string): Promise<SQLResult<T>> {
    q = this.completeQuery(q);
    return this.executeQuery(q);
  }

  abstract executeQuery(q: string): Promise<SQLResult<T>>;

  completeQuery(q: string): string {
    // Should add the INNER JOIN from map
    // this.parameters.map
    // SELECT * FROM table as t1 LEFT JOIN table2 as t2 ON t2.target = t1.uuid
    // if not same db: table2 is map_${name}_external
    if (!q.startsWith("DELETE") && !q.startsWith("INSERT") && !q.startsWith("SELECT") && !q.startsWith("UPDATE")) {
      return `SELECT * FROM ${this.parameters.table} WHERE ${q}`;
    }
    return q;
  }

  /**
   * @override
   */
  async _delete(uid: string, writeCondition: any, writeConditionField: string) {
    let query = `DELETE FROM ${this.parameters.table} WHERE uuid='${uid}'`;
    if (writeCondition) {
      query += this.getQueryCondition(writeCondition, writeConditionField);
    }
    let res = await this.sqlQuery(query);
    if (res.rowCount === 0 && writeCondition) {
      throw new UpdateConditionFailError(uid, writeConditionField, writeCondition);
    }
  }

  abstract mapExpressionAttribute(attribute: string[]): string;

  duplicateExpression(expression: WebdaQL.Expression): WebdaQL.Expression {
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
      return new SQLComparisonExpression(
        expression.operator,
        this.mapExpressionAttribute(expression.attribute),
        expression.value
      );
    }
  }

  /**
   * @override
   */
  async find(query: WebdaQL.Query): Promise<{
    results: T[];
    continuationToken: string;
    filter: WebdaQL.Expression;
  }> {
    // Update condition

    let sql = this.duplicateExpression(query.filter).toString() || "TRUE";
    let offset = 0;
    offset = parseInt(query.continuationToken || "0", 10);
    if (query.orderBy && query.orderBy.length) {
      sql +=
        " ORDER BY " +
        query.orderBy.map(c => `${this.mapExpressionAttribute(c.field.split("."))} ${c.direction}`).join(", ");
    }
    sql += ` LIMIT ${query.limit || "1000"}`;
    if (offset) {
      sql += ` OFFSET ${offset}`;
    }
    const results = (await this.sqlQuery(sql)).rows.map(c => this.initModel(c));
    return {
      results,
      continuationToken: query.limit <= results.length ? (offset + query.limit).toString() : undefined,
      filter: new WebdaQL.AndExpression([])
    };
  }

  /**
   * @override
   */
  async _exists(uid: string): Promise<boolean> {
    let res = await this.sqlQuery(
      `SELECT uuid FROM ${this.parameters.table} WHERE ${this.getModel().getUuidField()} = '${this.getUuid(uid)}'`
    );
    return res.rowCount === 1;
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound?: boolean): Promise<T> {
    let res = await this.sqlQuery(`${this.getModel().getUuidField()} = '${this.getUuid(uid)}'`);
    if (res.rowCount === 0 && raiseIfNotFound) {
      throw new StoreNotFoundError(uid, this.getName());
    }
    return res.rows.shift();
  }

  /**
   * @override
   */
  async getAll(list?: string[]): Promise<T[]> {
    if (list) {
      return (await this.sqlQuery(list.map(uuid => `uuid='${this.getUuid(uuid)}'`).join(" OR "))).rows;
    }
    return (await this.sqlQuery("TRUE")).rows;
  }

  abstract getQueryCondition(itemWriteCondition: any, itemWriteConditionField: string);

  /**
   * @override
   */
  async _update(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    let q = `UPDATE ${this.parameters.table} SET data='${object.toStoredJSON(true)}' WHERE uuid='${this.getUuid(uid)}'`;
    if (itemWriteCondition) {
      q += this.getQueryCondition(itemWriteCondition, itemWriteConditionField);
    }
    let res = await this.sqlQuery(q);
    if (res.rowCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
    return object;
  }

  getUuid(object: T | string) {
    let id: string;
    if (typeof object === "string") {
      id = object;
    } else {
      id = object.getUuid();
    }
    return id;
  }
  /**
   * @override
   */
  async _save(object: T): Promise<any> {
    await this.sqlQuery(
      `INSERT INTO ${this.parameters.table}(uuid,data) VALUES('${this.getUuid(object)}', '${object.toStoredJSON(
        true
      )}')`
    );
    return object;
  }

  async __clean() {
    await this.sqlQuery(`DELETE FROM ${this.parameters.table}`);
  }
}
