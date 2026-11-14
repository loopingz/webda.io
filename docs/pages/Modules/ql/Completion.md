# WebdaQL Code Completion

WebdaQL provides grammar-driven code completion powered by `antlr4-c3`. It delivers context-aware suggestions for keywords, operators, fields, enum/boolean values, and query parameters directly from the ANTLR grammar.

## Overview

The `getCompletions` function parses an incomplete or partial query up to a caret offset and returns candidates suitable for autocomplete boxes, editor popups, or language tools.

```typescript
import { getCompletions, fieldsFromSchema } from "@webda/ql";

const fields = [
  { name: "status", type: "string", enum: ["draft", "published", "archived"] },
  { name: "viewCount", type: "integer" },
  { name: "author.name", type: "string" }
];

// Autocomplete at caret offset 7 (after "status ")
const result = getCompletions("status ", 7, { fields });
// => offers operators: '=', '!=', 'IN', 'LIKE', 'CONTAINS', 'IS NULL', 'IS NOT NULL'
```

## API Reference

### `getCompletions(query, caret, options?)`

Evaluates completion candidates at `caret` (0-based character offset):

```typescript
export function getCompletions(query: string, caret: number, options?: CompletionOptions): CompletionResult;
```

#### `CompletionOptions`

- `fields?: CompletionField[]`: Known fields. Without them, no field candidates are returned.
- `filterOnly?: boolean`: Restricts candidates to filter-query syntax (drops `SELECT`, `DELETE`, `UPDATE`, `SET`, `WHERE`, `GROUP BY`, `AS`, `DISTINCT`, and aggregate functions). For inputs that take a filter only, such as GraphQL.
- `relations?: CompletionRelation[]`: The relations a `HYDRATE` clause can name, as dotted paths from the queried model (`{ name: "project.team", model: "MyApp/Team" }`). They are the candidates after `HYDRATE` and after each `,` of the clause, instead of the fields; typing `project.` keeps the paths below `project`. `INNER` and `LEFT` are offered after a path. Build them with `relationsFromGraph(Metadata.Relations, resolve?, maxDepth?)`, which lists the parent and the links of a model and, with `resolve` (the `Relations` of a model identifier), those of their targets; `repository.getCompletionRelations()` returns the first level.
- `fieldList?: boolean`: With `filterOnly`, also offers `SELECT` at the start of the query, the fields inside the list and `WHERE` after it, and the `HYDRATE` clause (`HYDRATE`, `INNER`, `LEFT`), which `filterOnly` alone drops. Aggregate functions, `GROUP BY`, `AS`, `DISTINCT`, `DELETE`, `UPDATE` and `SET` stay dropped. Use `{ filterOnly: true, fieldList: true }` for the REST, gRPC and MCP query inputs, which return [partial results](./Statements.md#field-selection); keep `filterOnly` alone for GraphQL.
- `statements?: boolean`: With `filterOnly`, also offers `DELETE`, `UPDATE`, `SET` and their `WHERE`. Use it for the Query inputs (REST `PUT`, gRPC) of the models that [run statements](./Statements.md#statements-through-the-query-operations); it combines with `fieldList`.
- `parameters?: string[]`: Available named parameters (offered as `:name` where values are expected).
- `limit?: number`: Maximum candidates returned (default `50`).

#### `CompletionResult`

```typescript
export interface CompletionResult {
  items: CompletionItem[];
  prefix: string;
}

export interface CompletionItem {
  label: string; // Shown text, e.g. "ORDER BY", "status", "TRUE"
  insertText: string; // Inserted text, e.g. "ORDER BY ", "'published'"
  kind: CompletionKind; // "keyword" | "operator" | "field" | "value" | "parameter" | "punctuation"
  detail?: string; // Field type or description
  range: [number, number]; // [start, end) char offsets replaced by insertText
}
```

### `fieldsFromSchema(schema, maxDepth?)`

Flattens a JSON Schema into `CompletionField[]` by traversing nested object properties into dotted paths:

```typescript
import { fieldsFromSchema } from "@webda/ql";

const schema = {
  type: "object",
  properties: {
    title: { type: "string" },
    status: { type: "string", enum: ["draft", "published"] },
    profile: {
      type: "object",
      properties: {
        email: { type: "string" }
      }
    }
  }
};

const fields = fieldsFromSchema(schema);
// => [
//   { name: "title", type: "string" },
//   { name: "status", type: "string", enum: ["draft", "published"] },
//   { name: "profile.email", type: "string" }
// ]
```

Rules:

- Nested objects are flattened into dotted paths up to `maxDepth` (default `3`).
- Properties with `$ref` are skipped.
- `type`, `enum`, and `description` are preserved on leaf fields.

## Contextual Completion Behavior

| Context                                    | Candidates Offered                                                                                                                                  |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Beginning of query `\|`                    | Fields, keywords (`SELECT`, `ORDER BY`, `LIMIT`...). With `filterOnly: true`, statements are omitted; with `fieldList: true` too, `SELECT` is kept. |
| Incomplete word `sta\|`                    | Fields matching prefix (`status`), range covers partial token `[0, 3]`.                                                                             |
| After identifier `status \|`               | Comparison operators (`=`, `!=`, `LIKE`, `IN`, `CONTAINS`, `IS NULL`, `IS NOT NULL`).                                                               |
| After operator on enum `status = \|`       | Enum value literals (`'draft'`, `'published'`), parameters (`?`, `:name`).                                                                          |
| After operator on boolean `done = \|`      | `TRUE`, `FALSE`.                                                                                                                                    |
| Inside string literal `'dra\|'`            | Enum value candidates matching prefix inside quotes.                                                                                                |
| After expression `status = 'published' \|` | Keywords `AND`, `OR`, `ORDER BY`, `LIMIT`, `OFFSET`.                                                                                                |
| Dotted path `profile.\|`                   | Child properties of `profile.` only (`profile.email`), range covers `profile.`.                                                                     |
