# Stores: v3 to v4

Webda 4 reads the data Webda 3 wrote, on the same database, without a manual step. You run `webda migrate` when
you choose: it rewrites the Webda 3 types to the Webda 4 format, can be resumed, and is safe to run again.

:::note
The Memory and File stores implement this today. The Postgres, MongoDB, DynamoDB and Firestore stores, and the
authentication changes, arrive in follow-up plans: until then those stores are skipped by `webda migrate` with a
warning.
:::

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
the store's `models`.

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
- Running it again scans every row again and reports 0 updates.
- A store that cannot run migrations yet is skipped with a warning.

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

They are listed under the table (`unknown Gone/Model: 1`), and the command exits with code `1`. Declare a
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
