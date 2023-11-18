import { CoreModel, StoreNotFoundError, UpdateConditionFailError } from "@webda/core";
import pg, { ClientConfig, PoolConfig } from "pg";
import { SQLResult, SQLStore, SQLStoreParameters } from "./sqlstore";

class PostgresParameters extends SQLStoreParameters {
  /**
   * @default false
   */
  usePool?: boolean;
  /**
   * By default use environment variables
   */
  postgresqlServer?: ClientConfig | PoolConfig;
  /**
   * Auto create table if not exists
   */
  autoCreateTable?: boolean;
}

/**
 * Store data within PostgreSQL with JSONB
 *
 * The table should be created before with

 * ```sql
 * CREATE TABLE IF NOT EXISTS ${tableName}
 * (
 *   uuid uuid NOT NULL,
 *   data jsonb,
 *   CONSTRAINT ${tableName}_pkey PRIMARY KEY (uuid)
 * );
 * ```
 *
 * @WebdaModda
 */
export default class PostgresStore<
  T extends CoreModel = CoreModel,
  K extends PostgresParameters = PostgresParameters
> extends SQLStore<T, K> {
  client: pg.Client | pg.Pool;

  /**
   * @override
   */
  loadParameters(params: any) {
    return new PostgresParameters(params, this);
  }

  /**
   * @override
   */
  async init(): Promise<this> {
    if (this.parameters.usePool) {
      this.client = new pg.Pool(this.parameters.postgresqlServer);
    } else {
      this.client = new pg.Client(this.parameters.postgresqlServer);
    }
    await this.client.connect();
    await this.checkTable();
    await super.init();
    return this;
  }

  /**
   * Ensure your table exists
   */
  async checkTable() {
    if (!this.parameters.autoCreateTable) {
      return;
    }
    await this.client.query(
      `CREATE TABLE IF NOT EXISTS ${this.parameters.table} (uuid VARCHAR(255) NOT NULL, data jsonb, CONSTRAINT ${this.parameters.table}_pkey PRIMARY KEY (uuid))`
    );
  }

  /**
   * Return the postgresql client
   * @returns
   */
  getClient() {
    return this.client;
  }

  /**
   * Execute a query on the server
   *
   * @param query
   * @returns
   */
  async executeQuery(query: string, values: any[] = []): Promise<SQLResult<T>> {
    this.log("DEBUG", "Query", query);
    let res = await this.client.query(query, values);
    return {
      rows: res.rows.map(r => this.initModel(r.data)),
      rowCount: res.rowCount
    };
  }

  /**
   * @override
   */
  mapExpressionAttribute(attribute: string[]): string {
    return `data#>>'{${attribute.join(",")}}'`;
  }

  /**
   * @override
   */
  async _patch(object: any, uid: string, itemWriteCondition?: any, itemWriteConditionField?: string): Promise<any> {
    let query = `UPDATE ${this.parameters.table} SET data = data || $1::jsonb WHERE uuid = $2`;
    const args = [JSON.stringify(object), this.getUuid(uid)];
    if (itemWriteCondition) {
      query += this.getQueryCondition(itemWriteCondition, itemWriteConditionField, args);
    }
    let res = await this.sqlQuery(query, args);
    if (res.rowCount === 0) {
      throw new UpdateConditionFailError(uid, itemWriteConditionField, itemWriteCondition);
    }
  }

  /**
   * @override
   */
  async _removeAttribute(
    uuid: string,
    attribute: string,
    itemWriteCondition?: any,
    itemWriteConditionField?: string
  ): Promise<void> {
    let query = `UPDATE ${this.parameters.table} SET data = data - $1 WHERE uuid = $2`;
    const args = [attribute, this.getUuid(uuid)];
    if (itemWriteCondition) {
      query += this.getQueryCondition(itemWriteCondition, itemWriteConditionField, args);
    }
    let res = await this.sqlQuery(query, args);
    if (res.rowCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uuid, this.getName());
      }
    }
  }

  /**
   * @override
   */
  getQueryCondition(itemWriteCondition: any, itemWriteConditionField: string, params: any[]) {
    let condition = itemWriteCondition instanceof Date ? itemWriteCondition.toISOString() : itemWriteCondition;
    params.push(condition);
    return ` AND data->>'${itemWriteConditionField}'=$${params.length}`;
  }

  /**
   * @override
   */
  async _incrementAttributes(
    uid: string,
    params: { property: string; value: number }[],
    updateDate: Date
  ): Promise<any> {
    let data = "data";
    const args: any[] = [this.getUuid(uid)];
    params.forEach((p, index) => {
      args.push(p.value);
      data = `jsonb_set(${data}, '{${p.property}}', (COALESCE(data->>'${p.property}','0')::int + $${
        index + 2
      })::text::jsonb)::jsonb`;
    });
    let query = `UPDATE ${
      this.parameters.table
    } SET data = jsonb_set(${data}, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = $1`;
    let res = await this.sqlQuery(query, args);
    if (res.rowCount === 0) {
      throw new StoreNotFoundError(uid, this.getName());
    }
  }

  /**
   * @override
   */
  async _upsertItemToCollection(
    uuid: string,
    attribute: string,
    item: any,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    let query = `UPDATE ${this.parameters.table} SET data = jsonb_set(jsonb_set(data::jsonb, array['${attribute}'],`;
    const args = [this.getUuid(uuid)];
    if (index === undefined) {
      query += `COALESCE((data->'${attribute}')::jsonb, '[]'::jsonb) || '[${JSON.stringify(item)}]'::jsonb)::jsonb`;
    } else {
      query += `jsonb_set(COALESCE((data->'${attribute}')::jsonb, '[]'::jsonb), '{${index}}', '${JSON.stringify(
        item
      )}'::jsonb)::jsonb)`;
    }
    query += `, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = $1`;
    if (itemWriteCondition) {
      args.push(itemWriteCondition);
      query += ` AND (data#>>'{${attribute}, ${index}}')::jsonb->>'${itemWriteConditionField}'=$${args.length}`;
    }
    let res = await this.sqlQuery(query, args);
    if (res.rowCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uuid, this.getName());
      }
    }
  }

  /**
   * @override
   */
  async _deleteItemFromCollection(
    uuid: string,
    attribute: string,
    index: number,
    itemWriteCondition: any,
    itemWriteConditionField: string,
    updateDate: Date
  ): Promise<any> {
    let query = `UPDATE ${this.parameters.table} SET data = jsonb_set(jsonb_set(data::jsonb, array['${attribute}'], COALESCE(`;
    const args = [this.getUuid(uuid)];
    query += `((data->'${attribute}')::jsonb - ${index})`;
    query += `, '[]'::jsonb))::jsonb, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = $1`;
    if (itemWriteCondition) {
      args.push(itemWriteCondition);
      query += ` AND (data#>>'{${attribute}, ${index}}')::jsonb->>'${itemWriteConditionField}'=$2`;
    }
    let res = await this.sqlQuery(query, args);
    if (res.rowCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uuid, this.getName());
      }
    }
  }
}
