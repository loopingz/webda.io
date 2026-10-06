---
name: webda-stores
description: Use when reading or writing model data, querying models, or choosing or switching the store (memory, file, MongoDB, PostgreSQL) of a Webda app
---

# Webda stores and data access

## When to use

Reading, writing or querying models, reacting to data changes, or changing where the data is stored.

## Pattern

Code never talks to a store: it uses the model. The store is configuration.

```ts
import { useLog } from "@webda/core";
import { UuidModel, useRepository } from "@webda/models";

export class Note extends UuidModel {
  text!: string;
  archived!: boolean;
}

export async function examples() {
  const note = await Note.create({ text: "Hello", archived: false });
  const loaded = await Note.ref(note.getUUID()).get();
  await Note.ref(note.getUUID()).patch({ archived: true });
  const { results, continuationToken } = await Note.query("archived = false ORDER BY text LIMIT 10");
  const same = await Note.query("text = ?", [loaded.text]);
  for await (const item of Note.iterate("archived = true")) {
    await item.delete();
  }
  useRepository(Note).on("Created", event => useLog("INFO", "Note created", event));
  return { results, continuationToken, same };
}
```

Pass user input as query parameters (`?` or `:name`), never by building the query string.

The default store is the `Registry` service. To switch, replace it in `webda.config.json` and add the package:

| Store            | Package           | `Registry` configuration                                   | Connection                                               |
| ---------------- | ----------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| memory (default) | `@webda/core`     | none (persisted to `.registry`)                            |                                                          |
| files            | `@webda/fs`       | `{ "type": "Webda/FileStore", "folder": "./data" }`        |                                                          |
| MongoDB          | `@webda/mongo`    | `{ "type": "Webda/MongoStore", "collection": "registry" }` | `WEBDA_MONGO_URL`                                        |
| PostgreSQL       | `@webda/postgres` | `{ "type": "Webda/PostgresStore", "table": "registry" }`   | `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` |

## Common mistakes

```text
@Inject("Registry") store; store.save(...)  → Model.create / Model.ref(id).patch / Model.query
`text = '${input}'` in a query               → Note.query("text = ?", [input])
Credentials in webda.config.json             → environment variables (.env.example)
```

## Verify

`npm test`. For MongoDB or PostgreSQL, start the database (`docker compose up -d`) and `cp .env.example .env`: tests load `.env` automatically; for `npm run debug` or `npm run serve`, export the variables first (`set -a; . ./.env; set +a`).

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
