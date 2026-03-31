# @webda/ql-ts-plugin

TypeScript language service plugin for [WebdaQL](../ql/README.md). Validates field names in query strings against your model types and provides autocompletion — all inside your IDE.

## Setup

Install the plugin:

```bash
npm install -D @webda/ql-ts-plugin
```

Add it to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "plugins": [{ "name": "@webda/ql-ts-plugin" }]
  }
}
```

> **VSCode users:** Make sure you're using the workspace TypeScript version (`TypeScript: Select TypeScript Version` → `Use Workspace Version`), as plugins only run in the language service, not in `tsc`.

## Features

### Field validation

The plugin detects calls to `repo.query()`, `repo.iterate()`, and `parse()` with string literal arguments. It parses the WebdaQL query and checks that SELECT fields and UPDATE SET targets exist on the model type.

```ts
interface User {
  name: string;
  age: number;
  status: string;
  profile: { bio: string; avatar: string };
}

const repo: MemoryRepository<typeof User>;

repo.query("name, age WHERE status = 'active'");       // ✅
repo.query("name, oops WHERE status = 'active'");      // ❌ Unknown field "oops" in SELECT
repo.query("UPDATE SET role = 'admin' WHERE id = 1");   // ❌ Unknown assignment field "role" in UPDATE SET
repo.query("DELETE WHERE status = 'old'");              // ✅ (DELETE has no field projection)
```

Nested dot-notation fields are supported:

```ts
repo.query("name, profile.bio WHERE status = 'active'");     // ✅
repo.query("name, profile.secret WHERE status = 'active'");  // ❌ Unknown field "profile.secret"
```

### Autocompletion

When your cursor is inside a query string in a field-list position (after `SELECT`, `SET`, or at the start of an implicit field list), the plugin suggests model property names.

```ts
repo.query("name, | WHERE status = 'active'");
//                ^ autocomplete: age, status, profile.bio, profile.avatar
```

## How it works

1. **Intercepts** calls to `.query()`, `.iterate()`, or `parse()` where the first argument is a string literal
2. **Resolves** the model type from the repository's generic parameter (via the return type of `.get()`)
3. **Parses** the query string with a lightweight field extractor (no ANTLR dependency)
4. **Reports** diagnostics if SELECT fields or UPDATE SET targets are not valid property names
5. **Offers** completion entries when the cursor is in a field-list context

## Supported call patterns

| Pattern | Field resolution |
|---------|-----------------|
| `repo.query("...")` | Model type from `Repository<T>` generic |
| `repo.iterate("...")` | Model type from `Repository<T>` generic |
| `parse("...", ["name", "age"])` | Allowed fields from the literal array argument |

## Limitations

- Only works with **string literals** — dynamic query strings (`repo.query(variable)`) cannot be checked
- Runs in the **language service only** (IDE), not during `tsc` builds
- Filter-level field references (e.g. `WHERE unknownField = 1`) are not yet validated — only SELECT and UPDATE SET targets
- ANTLR-level keywords (`AND`, `OR`, `LIKE`, `IN`, `CONTAINS`) must still be uppercase
