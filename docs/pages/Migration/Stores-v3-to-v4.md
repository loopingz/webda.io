# Stores: v3 to v4

With the Memory, File, PostgreSQL, SQLite, MongoDB and DynamoDB stores, Webda 4 reads the data Webda 3 wrote, on the
same database, without a manual step. You run `webda migrate` when you choose: it rewrites the Webda 3 types to the
Webda 4 format, can be resumed, and is safe to run again.

| Store                          | Webda 3 types read | `webda migrate` | Startup check         |
| ------------------------------ | ------------------ | --------------- | --------------------- |
| `MemoryStore`, `FileStore`     | yes                | yes             | scan, up to `maxRows` |
| `PostgresStore`, `SQLiteStore` | yes                | yes             | exact (`GROUP BY`)    |
| `MongoStore`                   | yes                | yes             | exact (`$group`)      |
| `DynamoStore`                  | yes                | yes             | scan, up to `maxRows` |
| `FireStore`                    | not filtered       | no              | no                    |

`FireStore` neither stamps nor filters `__type`: its documents stay visible whatever type Webda 3 stored, and they
load as the model of their collection. The authentication data (idents, users) has its own command,
`webda auth migrate`.

## Before the first Webda 4 login

Start Webda 4 on a copy of the database first, and read the startup check and `webda migrate --dry-run`: they list
the legacy, untyped and unknown types of every store. A row whose type no model resolves (a deleted or renamed
model without `@WebdaAlias`, a model moved to another store) is invisible to queries.

This matters most for the authentication models. When the `User` and `Ident` rows of an existing account are not
found, the first login on Webda 4 creates a **new user** and new idents: the passkeys, tokens and objects of the
Webda 3 user stay on the old one, and the two have to be merged by hand. Before you open Webda 4 to your users:

1. check that the startup check reports no unknown type for the stores of `User` and `Ident`, declaring a
   `@WebdaAlias` where needed;
2. run `webda migrate`, then `webda auth migrate` (see [Authentication: v3 to v4](./Authentication-v3-to-v4.md));
3. check that each store still reads the table or collection Webda 3 wrote (see [Postgres tables](#postgres-tables)).

## Postgres tables

A Postgres store keeps reading and writing the tables Webda 3 created: every model of the store, its subclasses and
the models routed to it as fallback live in its `table`, unless `tables` maps a model elsewhere. Untyped rows
belong to the first model of `models` stored in the table. Only a model new to the application gets a new table
(its store's `table`, or its identifier lower-cased with `/` → `_` when the store has none). Key columns Webda 3
created as `uuid` are kept as they are.

## What is transparent

Webda 3 stamped rows with short or lower-case types (`User`, `user`, `webda/user`, `Transaction`), and Webda 4
stamps the namespaced identifier (`MyApp/Transaction`). Webda 4 resolves a stored `__type` in this order:

1. the exact identifier (`MyApp/Transaction`);
2. a `@WebdaAlias` of a model, exact, then case-insensitive;
3. an identifier, case-insensitive (`webda/user` → `Webda/User`);
4. for a value without `/`, the Webda 3 namespace completion: `<your namespace>/<value>`, then `Webda/<value>`,
   case-insensitive, identifiers first and then aliases (`User` → `MyApp/User` when your application defines it,
   `Webda/User` otherwise).

A row loads as the class its type resolves to, so a subclass row loads as the subclass. Queries, counts,
aggregations and bulk statements of a model see its rows and the rows of its subclasses, whatever form their type
has. When such a row is saved, it gets the current identifier. A row without `__type` belongs to the first model of
the store's `models`, the table root, and is seen by the queries of that model and of its ancestors.

A row whose type resolves to an ancestor of the table root is handled like a row without `__type`: in a store whose
first model is `MyApp/User extends Webda/User`, a row stored as `webda/user` or `CoreModel` loads as `MyApp/User`,
the queries of `MyApp/User` and its ancestors see it, and `webda migrate` rewrites it to `MyApp/User`
(`webda/user → MyApp/User`). The startup check counts it as a legacy type.

## MongoDB and DynamoDB

A `MongoStore` keeps every model of the store in its `collection`. A `DynamoStore` keeps them in its `table`, unless
`tables` maps a model elsewhere. Untyped documents and items belong to the first model of `models` stored in the
collection or table. MongoDB matches the stored types in the query itself, case-insensitively. DynamoDB cannot compare
case-insensitively, so it filters the scanned items in memory, as it already did for the subclasses.

Saving a document of a legacy type writes its current identifier: MongoDB in the same update, DynamoDB with a second
update conditioned on the type it replaces.

## `webda migrate`

```bash
webda migrate --dry-run       # count only: no row, no progress, no lease is written
webda migrate                 # rewrite every store
webda migrate --service=Users # one store
webda migrate --batch 1000    # rows per page (default 500)
```

Every store prints its report:

```
Store Users: migration types
  Users: 1200 scanned, 600 updated
    User → MyApp/User: 480
    webda/user → Webda/User: 120
```

- Rows without `__type` get the identifier of the first model of the store (`(untyped) → MyApp/User`).
- The command records its progress in the Registry (`storeMigration.<store>.types`) after each page. When a run
  stops, the next one resumes and the report says `(resumed)`.
- A second runner fails while the first one holds the migration lease (5 minutes, renewed every page). If a runner
  crashed, the next one takes over once the lease has expired.
- Resuming in another process and the lease between processes need a persistent Registry shared by every runner: a
  Registry kept in memory only protects the runners of one process, and its progress is lost when it stops.
- Running it again scans every row again and reports 0 updates.
- `webda migrate` runs on the stores that declare the `migrate` command: the Memory, File, PostgreSQL, SQLite, MongoDB
  and DynamoDB stores. A `Store` subclass of your own only gets it if it declares the `migrate` command itself; other
  stores are not migrated.

## Renamed models: `@WebdaAlias`

When a model changed its name between versions, declare its former names:

```ts
/**
 * @WebdaModel
 * @WebdaAlias Payment
 * @WebdaAlias Legacy/Payment
 */
export class Transaction extends UuidModel {}
```

A name without `/` gets your package namespace (`Payment` → `MyApp/Payment`), and you can declare several aliases.
An alias equal to the identifier of another model fails the build. Rows stored as `MyApp/Payment`, `Payment`,
`payment` or `Legacy/Payment` load as `Transaction`, and `webda migrate` rewrites them to `MyApp/Transaction`.

The store parameter `modelAliases` is removed, and so are `defaultModel` and `forceModel`.

## Unknown and ambiguous types

`webda migrate` never rewrites a type it cannot resolve:

- **unknown**: no model matches, for example a model you deleted;
- **ambiguous**: two models match at the same step, for example two aliases with the same name;
- **(unreadable)**: the stored value is not a JSON object, for example a half-written file.

They are listed under the table (`unknown Gone/Model: 1`, `ambiguous Webda/Creature: 1`, and
`unknown (unreadable): 1` for unreadable rows), and the command exits with code `1`. Declare a
`@WebdaAlias` on the model they belong to, delete the rows, or pass `--allow-unknown` to accept them. Queries never
return these rows. Reading one by key loads it as the repository model and keeps its stored type.

## Startup check

When a store starts, it counts its rows by stored type and logs a single warning if it finds legacy, untyped or
unknown types:

```
Store Users holds rows with legacy, untyped or unknown types: Users ('User' → MyApp/User: 480, ...). Run `webda migrate` to rewrite them.
```

Stores without a native count scan at most `typeCheck.maxRows` rows, and beyond that the counts are "at least".
The check never stops the application.

```jsonc
{ "services": { "Users": { "type": "MemoryStore", "typeCheck": { "enabled": true, "maxRows": 10000 } } } }
```

## Your own migrations

`webda migrate` runs the built-in `types` migration. Code can run other migrations on the same engine. Each one
gets the same raw rows, the same resumable progress and the same lease:

```ts
const report = await store.migration("lowercase-emails", (row, context) => {
  // Memory and File stores keep Webda 4 rows as serializer envelopes: the fields are in row.data.value
  const email = row.data.value?.email ?? row.data.email;
  if (typeof email !== "string" || email === email.toLowerCase()) return undefined;
  context.change("mixed case", "lower case");
  return row.data.value ? { value: { ...row.data.value, email: email.toLowerCase() } } : { email: email.toLowerCase() };
});
```
