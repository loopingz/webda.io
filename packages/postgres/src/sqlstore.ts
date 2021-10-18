import { CoreModel, Store, StoreNotFoundError, StoreParameters, UpdateConditionFailError } from "@webda/core";

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

export abstract class SQLStore<T extends CoreModel, K extends SQLStoreParameters = SQLStoreParameters> extends Store<
  T,
  K
> {
  query(q: string): Promise<SQLResult<T>> {
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
    let res = await this.query(query);
    if (res.rowCount === 0 && writeCondition) {
      throw new UpdateConditionFailError(uid, writeConditionField, writeCondition);
    }
  }

  /**
   * @override
   */
  async _find(request: any, offset?: any, limit?: any): Promise<T[]> {
    request ??= "TRUE";
    limit ??= 1000;
    if (typeof request !== "string") {
      throw new Error("Query should be a string");
    }
    request += ` LIMIT ${limit}`;
    return (await this.query(request)).rows;
  }

  /**
   * @override
   */
  async exists(uid: string): Promise<boolean> {
    let res = await this.query(
      `SELECT uuid FROM ${this.parameters.table} WHERE ${this.getModel().getUuidField()} = '${this.getUuid(uid)}'`
    );
    return res.rowCount === 1;
  }

  /**
   * @override
   */
  async _get(uid: string, raiseIfNotFound?: boolean): Promise<T> {
    let res = await this.query(`${this.getModel().getUuidField()} = '${this.getUuid(uid)}'`);
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
      return (await this.query(list.map(uuid => `uuid='${this.getUuid(uuid)}'`).join(" OR "))).rows;
    }
    return (await this.query("TRUE")).rows;
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
    let res = await this.query(q);
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
    await this.query(
      `INSERT INTO ${this.parameters.table}(uuid,data) VALUES('${this.getUuid(object)}', '${object.toStoredJSON(
        true
      )}')`
    );
    return object;
  }

  async __clean() {
    await this.query(`DELETE FROM ${this.parameters.table}`);
  }
}
