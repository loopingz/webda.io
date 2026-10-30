import { RELATIONAL_TABLES } from "@webda/sql/lib/test";
import type pg from "pg";

export { fixtureMetadata, knownMetadata } from "@webda/sql/lib/test";

export const params = {
  postgresqlServer: {
    host: "localhost",
    user: "webda.io",
    database: "webda.io",
    password: "webda.io",
    statement_timeout: 60000,
    max: 2
  }
};

/**
 * Drop the fixture tables
 * @param client - the client
 */
export async function dropRelationalTables(client: pg.Client | pg.Pool): Promise<void> {
  for (const table of RELATIONAL_TABLES) {
    await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
  }
}
