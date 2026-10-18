import type { ModelClass } from "@webda/core";
import { SQLRepository } from "@webda/sql";
import type { SQLClient } from "@webda/sql";
import { PostgresDialect } from "./dialect.js";

export { SQLComparisonExpression, SQLRepository, SQLStore, SQLStoreParameters, sqlString } from "@webda/sql";
export type { SQLClient, SQLDatabase, SQLDialect, SQLResult } from "@webda/sql";

/**
 * PostgreSQL-backed repository for a single model class: SQLRepository bound to the JSONB dialect.
 *
 * Stores every object as a JSONB `data` column alongside a `uuid` primary-key column.
 */
export class PostgresRepository<T extends ModelClass> extends SQLRepository<T> {
  /**
   * Create a new PostgresRepository.
   * @param model - the model class
   * @param pks - primary key field names
   * @param client - the pg client or pool, or a function returning the store's current one: the repository then
   *   follows the client the store connects in `init()`, even when created before it or kept across a `stop()`
   * @param table - the table name
   * @param separator - composite key separator
   * @param prepare - awaited before every statement (e.g. to ensure the table exists)
   * @param tableModel - identifier of the model the table was declared for: rows without `__type` (written before
   *   stamping) belong to it. Defaults to the topmost ancestor of `model` carrying metadata.
   */
  constructor(
    model: T,
    pks: string[],
    client: SQLClient | (() => SQLClient | undefined),
    table: string,
    separator?: string,
    prepare?: () => Promise<void>,
    tableModel?: string
  ) {
    super(model, pks, client, table, separator, prepare, tableModel, new PostgresDialect());
  }
}
