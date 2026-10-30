import { useApplication, useModel, useModelMetadata } from "@webda/core";
import type pg from "pg";
import { RELATIONAL_MODELS, RELATIONAL_TABLES } from "./relational-models.js";

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

/**
 * @returns the metadata of the fixture models the store lists, subclasses included
 */
export function fixtureMetadata(): any[] {
  return [...RELATIONAL_MODELS, "Rel/Dog"].map(id => useModelMetadata(useModel(id)));
}

/**
 * @returns the metadata of every application model
 */
export function knownMetadata(): any[] {
  return Object.values(useApplication().getModels())
    .map((m: any) => m?.Metadata)
    .filter(m => m?.Identifier);
}
