import { CoreModel, StoreNotFoundError, UpdateConditionFailError } from "@webda/core";
import { SQLResult, SQLStore, SQLStoreParameters } from "./sqlstore";
import { Pool, Client, ClientConfig, PoolConfig } from "pg";

class PostgresParameters extends SQLStoreParameters {
  /**
   * @default false
   */
  usePool?: boolean;
  /**
   * By default use environment variables
   */
  postgresqlServer?: ClientConfig | PoolConfig;
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
  client: Client | Pool;

  /**
   * @override
   */
  loadParameters(params: any) {
    return new PostgresParameters(params, this);
  }

  /**
   * @override
   */
  async init() {
    if (this.parameters.usePool) {
      this.client = new Pool(this.parameters.postgresqlServer);
    } else {
      this.client = new Client(this.parameters.postgresqlServer);
    }
    await this.client.connect();
    await super.init();
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
  async executeQuery(query: string): Promise<SQLResult<T>> {
    this.log("DEBUG", "Query", query);
    let res = await this.client.query(query);
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
    let query = `UPDATE ${this.parameters.table} SET data = data || '${JSON.stringify(
      object
    )}'::jsonb WHERE uuid = '${this.getUuid(uid)}'`;
    if (itemWriteCondition) {
      query += this.getQueryCondition(itemWriteCondition, itemWriteConditionField);
    }
    let res = await this.sqlQuery(query);
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
    let query = `UPDATE ${this.parameters.table} SET data = data - '${attribute}' WHERE uuid = '${this.getUuid(uuid)}'`;
    if (itemWriteCondition) {
      query += this.getQueryCondition(itemWriteCondition, itemWriteConditionField);
    }
    let res = await this.sqlQuery(query);
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
  getQueryCondition(itemWriteCondition: any, itemWriteConditionField: string) {
    return ` AND data->>'${itemWriteConditionField}'='${itemWriteCondition}'`;
  }

  /**
   * @override
   */
  async _incrementAttribute(uid: string, attribute: string, value: number, updateDate: Date): Promise<any> {
    let query = `UPDATE ${
      this.parameters.table
    } SET data = jsonb_set(jsonb_set(data, '{${attribute}}', (COALESCE(data->>'${attribute}','0')::int + ${value})::text::jsonb)::jsonb, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = '${this.getUuid(
      uid
    )}'`;
    let res = await this.sqlQuery(query);
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
    if (index === undefined) {
      query += `COALESCE((data->'${attribute}')::jsonb, '[]'::jsonb) || '[${JSON.stringify(item)}]'::jsonb)::jsonb`;
    } else {
      query += `jsonb_set(COALESCE((data->'${attribute}')::jsonb, '[]'::jsonb), '{${index}}', '${JSON.stringify(
        item
      )}'::jsonb)::jsonb)`;
    }
    query += `, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = '${this.getUuid(uuid)}'`;
    if (itemWriteCondition) {
      query += ` AND (data#>>'{${attribute}, ${index}}')::jsonb->>'${itemWriteConditionField}'='${itemWriteCondition}'`;
    }
    let res = await this.sqlQuery(query);
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
    query += `((data->'${attribute}')::jsonb - ${index})`;
    query += `, '[]'::jsonb))::jsonb, '{_lastUpdate}', '"${updateDate.toISOString()}"'::jsonb) WHERE uuid = '${this.getUuid(
      uuid
    )}'`;
    if (itemWriteCondition) {
      query += ` AND (data#>>'{${attribute}, ${index}}')::jsonb->>'${itemWriteConditionField}'='${itemWriteCondition}'`;
    }
    let res = await this.sqlQuery(query);
    if (res.rowCount === 0) {
      if (itemWriteCondition) {
        throw new UpdateConditionFailError(uuid, itemWriteConditionField, itemWriteCondition);
      } else {
        throw new StoreNotFoundError(uuid, this.getName());
      }
    }
  }
}
