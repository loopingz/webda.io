# WebdaQLString Design

**Goal:** turn WebdaQL query strings into a typed surface so attribute typos and grammar errors are caught at compile time, and so template-literal interpolations are automatically rewritten into a parameterized form that can't be used to inject malicious query syntax.

**Approach:** introduce a branded `WebdaQLString<T>` type erased at runtime, swap every `query: string` / `permission: string` parameter in `@webda/core` and `@webda/models` to use it, and add a TypeScript transformer in `@webda/ts-plugin` that walks every literal/template/typed-local flowing into one of those parameters and validates it against `T`'s properties.

**Non-goals:** third-party store packages (`mongodb`, `postgres`, `dynamodb`, `firestore`, `elasticsearch`) keep `string` for this PR — their query implementations differ enough that per-store follow-ups are cleaner.

---

## 1. Architecture

Three packages cooperate; one new file in each.

### `packages/ql`

- **`src/index.ts`** — adds:
  - `export type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T }` (brand)
  - `export function escape<T>(parts: TemplateStringsArray | string[], values: unknown[]): WebdaQLString<T>` (runtime helper)
  - `export class WebdaQLError extends Error` (thrown by `escape` when a value isn't representable)
- The existing `parse(s)` / `QueryValidator` exports are unchanged.

### `packages/ts-plugin`

- **`src/transforms/qlvalidator.ts`** — new transformer factory:

  ```ts
  export function createQlValidatorTransformer(
    tsModule: typeof ts,
    program: ts.Program
  ): ts.TransformerFactory<ts.SourceFile>
  ```

  Walks each source file looking for call expressions whose resolved parameter type is `WebdaQLString<T>`. For each such argument, applies the discovery rules in §3 (validate, rewrite, or fail).

- **`src/transform.ts`** — extended to plug `qlvalidator` into the same composed `before:` array as `behaviors` and `accessors`.

### `packages/compiler`

- **`src/configuration.ts`** (or a new `src/session-types.ts`) — reads the new `session: "<ModelId>"` field from `webda.config.json` and emits `.webda/session-types.d.ts`:

  ```ts
  // .webda/session-types.d.ts (auto-generated)
  import type { Session as __ResolvedSession } from "<resolved-import>";
  declare module "@webda/core" {
    interface WebdaSessionRegistry {
      session: __ResolvedSession;
    }
  }
  ```

- The compiler's existing `webda build` flow already writes `.webda/module.d.ts` and `.webda/operations.json`; this is the same kind of codegen step.

### Compile-time data flow

```
tsconfig.json `plugins:` entry
  ↓
packages/ts-plugin/src/transform.ts
  ↓ (composed `before:` factories)
qlvalidator transformer (per source file)
  ↓ ts.visitNode(...)
for each ts.CallExpression:
  ↓ checker.getResolvedSignature(call)
  ↓ peel `WebdaQLString<T>` from each parameter
  ↓ for each matching argument:
      ┌── string literal:  parse → validate → leave call untouched
      ┌── template literal: parse(parts.join("?")) → validate → rewrite to escape(...)
      ┌── const-bound literal: type-flow one hop → above
      ┌── typed local `WebdaQLString<T> = …`: accept, no parsing
      └── else: emit WQL9005 diagnostic, increment errorCount
  ↓ at end of source file, if errorCount > 0 throw WebdaQLAggregateError
```

The aggregate throw is what makes `tsc-esm` / `webdac build` exit non-zero when there are validation errors — diagnostics already light up in editors, but the build needs an exception to fail the way callers expect.

---

## 2. The brand + runtime helper

### `WebdaQLString<T>`

```ts
/**
 * Marker brand for query strings. `T` is the type whose attributes
 * the @webda/ts-plugin validates the query against — typically the
 * model class for `Store.query` and the configured session type for
 * `OperationDefinition.permission`.
 *
 * Erased at runtime — `WebdaQLString<X>` IS a string, so adoption is
 * zero-cost for callers and consumers.
 */
export type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
```

The brand uses `& { readonly __webdaQL?: T }` (rather than `__webdaQL: T`) so that an existing string variable can flow into a `WebdaQLString<T>` parameter without an explicit cast — the property is optional. The phantom-type effect (TypeScript distinguishes `WebdaQLString<Post>` from `WebdaQLString<User>`) survives because variance on `T` is preserved by the optional property.

### `escape`

The compile output for `\`title = '${name}' AND age = ${age}\`` becomes:

```ts
escape(["title = ", " AND age = ", ""], [name, age])
```

`escape` joins `parts` with type-aware escaping of each value:

| Runtime type | Escaped form |
|---|---|
| `string` | `'…'` with single-quotes doubled (SQL convention) |
| `number` (incl. `NaN`/`Infinity`) | numeric literal; `NaN`/`Infinity` throw `WebdaQLError` |
| `boolean` | `TRUE` / `FALSE` |
| `null` / `undefined` | `NULL` |
| `Date` | ISO string in single quotes |
| `Array<scalar>` | `(v1, v2, …)` — each element escaped recursively; nested arrays throw |
| anything else (object, function, symbol) | throws `WebdaQLError` |

The thrown error is intentional: a typo in user code that smuggles an object into an interpolation slot should fail loudly rather than silently produce `[object Object]` in the query string.

---

## 3. Plugin discovery rules

### Resolving `T`

1. The plugin asks the type checker for the parameter type via `checker.getTypeOfSymbolAtLocation(paramSymbol, callNode)`.
2. If the resolved type matches the structural shape `string & { __webdaQL?: T }`, peel the brand to get `T`. (Use the type's `aliasTypeArguments` when available; fall back to checking `getProperties()` for the `__webdaQL` member and reading its type.)
3. For `Store<Post>.query(q)` and friends, `T` is `Post` (the class generic carries through).
4. For `OperationDefinition.permission`, `T` is `WebdaSessionRegistry["session"]` — resolved from the codegen'd `.webda/session-types.d.ts` (§5). When the user hasn't configured a session, `T` falls back to `unknown` and the plugin emits `WQL9006`.

### Per-argument policy

| Argument shape | Plugin action |
|---|---|
| String literal `"title = 'x'"` | parse → validate attrs against `T` → leave call site unchanged |
| Template literal `` `title = '${n}'` `` | parse with `?` placeholders → validate attrs → rewrite to `escape([…], […])` |
| Local `const q = "…"` (literal initializer) | type-flow one hop, treat as literal |
| Local `const q = \`…\`` (template initializer) | type-flow one hop, rewrite the original template |
| Typed local `const q: WebdaQLString<T> = computed()` | accept as-is — explicit opt-out |
| Anything else | emit `WQL9005` and fail |

"One-hop type-flow" means: the plugin follows the local variable's declarator if it's `const` and the initializer is itself a literal/template. It does NOT chase reassignments, ternaries, or function returns. The escape hatch (`const q: WebdaQLString<T> = …`) is unambiguous and discoverable.

### Attribute walk

For each `ComparisonExpression` in the parsed AST, the plugin takes its `attribute: string[]` (the dotted path) and walks `T`'s structural properties one segment at a time. Rules:

- **`ModelRelation<U>` / `BelongTo<U>`** — walk into `U`. So `author.email` validates against `keyof User`.
- **`OneToMany<C>` / array-typed properties** — walk one level into the element type. `comments.content` validates against `keyof Comment`. Multi-level paths through array properties (`comments.author.email`) emit `WQL9003`.
- **`Binary<T>` / `BinariesImpl<T>` / Behavior types** — walk into the `BinaryFileInfo<T>` data shape exposed by the Behavior. `mainImage.hash`, `mainImage.size`, and `mainImage.metadata.…` valid; `mainImage.setMetadata` and other method references rejected (`WQL9004`).
- **Plain nested objects** — walked to any depth.
- **`Date` / `Map` / `Set`** — terminal: queryable as a value, but their methods are not. `createdAt` valid; `createdAt.getTime` rejected (`WQL9004`).
- **`unknown` / `any`** — short-circuits the walk. The remaining segments are accepted as-is so the plugin doesn't reject queries the type system can't reason about.

"Did you mean?" suggestions: when an attribute is rejected, the plugin computes Levenshtein distance against the candidate set at that walk position; if any are within distance 2, the diagnostic includes a single suggestion. Same shape as TS's own "Did you mean".

---

## 4. Error reporting + build failure

### Diagnostic shape

Diagnostics surface through the standard TS plugin path (a `ts.Diagnostic` pushed onto the program's diagnostics list), which means:

- VS Code (and any editor with a TS language service) shows a red squiggly under the offending range.
- `tsc --noEmit` includes the diagnostic in its output.
- The diagnostic carries a `code` in the `9000-9099` range so it's distinguishable from TS's own diagnostics in tooling that filters by code.

### Diagnostic codes

| Code | Trigger |
|---|---|
| `WQL9001` | Attribute doesn't exist on the resolved type |
| `WQL9002` | Grammar parse error (forwards the ANTLR parser's own position) |
| `WQL9003` | Walking through an array-shaped property at depth > 1 |
| `WQL9004` | Reference to a method or non-data property |
| `WQL9005` | Argument is a non-literal expression and isn't typed `WebdaQLString<T>` |
| `WQL9006` | `T` in `WebdaQLString<T>` couldn't be resolved (typically: `permission` used without `session` configured in `webda.config.json`) |

### Build-failure semantics

The transformer keeps an internal `errorCount` for each source file. After walking the file, if `errorCount > 0` it throws a single `WebdaQLAggregateError` listing every diagnostic emitted. `tsc-esm` and the build hooks under `webdac build` already wrap transformer exceptions and exit non-zero, so this gives us:

- editor: inline squigglies (no exception interrupts the language service)
- `tsc --noEmit`: diagnostics in the report, non-zero exit
- `webdac build`: one aggregate exception listing every error in the file

### Suppression

Two escape hatches for the rare case the plugin's heuristics are wrong or the user has a query the system can't validate:

- **Single-line:** `// @webdaql-ignore-next-line` directly above the offending call. Skips the next call expression's WebdaQL validation.
- **File-level:** `/* @webdaql-disable */` at the top of the source file. Skips every WebdaQL validation in the file.

Both directives suppress diagnostics AND the rewrite — a suppressed template literal stays as-is, including its interpolations. Users who suppress should know what they're doing.

---

## 5. Session-type codegen

### Configuration

`webda.config.json` gains an optional `session` field:

```jsonc
{
  "$schema": "./.webda-config-schema.json",
  "version": 3,
  "session": "WebdaSample/Session",
  "services": { … }
}
```

The value is a model identifier in the same format used elsewhere in the config (`<namespace>/<class>`).

### Codegen step

During `webda build` (the compiler's existing pipeline), if `webda.config.json` carries a `session` field:

1. Resolve the model ID to its declared class via the project's `webda.module.json` (which already maps model IDs to import paths).
2. Compute the relative import path from the `.webda/` directory to the source file declaring the class.
3. Write `.webda/session-types.d.ts`:

   ```ts
   // AUTO-GENERATED — do not edit
   import type { Session as __ResolvedSession } from "../src/models/session.js";
   declare module "@webda/core" {
     interface WebdaSessionRegistry {
       session: __ResolvedSession;
     }
   }
   ```

4. The user's `tsconfig.json` already includes `.webda/**/*` — no extra wiring needed.

### Effect on `OperationDefinition`

In `@webda/core`:

```ts
// (new) — in @webda/core/src/operations/types.ts (or similar)
export interface WebdaSessionRegistry {
  // augmented by .webda/session-types.d.ts at build time
}

export interface OperationDefinition {
  // …
  permission?: WebdaQLString<WebdaSessionRegistry["session"]>;
}
```

When the user hasn't configured a `session`, `WebdaSessionRegistry["session"]` resolves to `unknown` and the plugin emits `WQL9006` on any `permission` usage. Apps that don't use operation-level permissions never see the diagnostic.

### Editor experience

Because the augmentation lives in a `.d.ts` file under the project, **plain `tsc` understands the session type without our plugin loaded**. IDE feedback works regardless of plugin status. The plugin only adds the parse + attribute-walk on top.

---

## 6. Testing

### `packages/ql/src/webdaql-string.spec.ts` (new)

Runtime brand erasure + the `escape` helper:

- Brand erasure: `WebdaQLString<X>` is structurally a string; `typeof` returns `"string"`.
- `escape` happy path: every supported value type produces the expected escaped output.
- `escape` regression: `O'Brien`, `\'`, embedded `;`, embedded backticks, multi-byte chars.
- `escape` rejection: object → `WebdaQLError`, function → `WebdaQLError`, symbol → `WebdaQLError`, nested array → `WebdaQLError`, `NaN` → `WebdaQLError`.

### `packages/ts-plugin/src/transforms/qlvalidator.spec.ts` (new)

Pattern matches `behaviors.spec.ts`: in-memory `ts.Program`, run the transformer, assert on emitted output and diagnostics.

Cases:
- happy path: literal validates, template rewrites correctly
- typo → `WQL9001` diagnostic + "did you mean"
- grammar error → `WQL9002` diagnostic with parser position
- dynamic argument without explicit typing → `WQL9005`
- typed local opt-out compiles clean
- relation walk: `author.email` valid, `author.bogus` rejected
- array-relation depth: `comments.content` ok, `comments.author.email` rejected (`WQL9003`)
- method ref: `createdAt.getTime` rejected (`WQL9004`)
- Behavior data shape: `mainImage.hash` ok, `mainImage.setMetadata` rejected
- session resolution: with codegen'd augmentation, `permission: "uuid = 'x'"` validates against session
- `unknown` short-circuit: `WebdaQLString<unknown>` accepts anything (no walk)
- suppression directives: both `// @webdaql-ignore-next-line` and `/* @webdaql-disable */` suppress diagnostics

### `packages/compiler/src/configuration.spec.ts` (extend)

Codegen step:
- `webda.config.json` with `"session": "WebdaSample/Session"` produces `.webda/session-types.d.ts` with the right augmentation.
- Missing `session` field → no file generated, no error.
- `session` references a non-existent model → diagnostic at build time, no broken `.d.ts` file.

### Integration via `sample-app` and `sample-apps/blog-system`

- Adopt `WebdaQLString<T>` in their existing `.query()` call sites.
- Run their build: confirm the transformer plugs in cleanly, no regressions, the e2e suite still passes.
- This is the catch-all for the "wholesale rename actually works in real code" risk. If a meaningful fraction of the codebase trips up on the new types, we discover it here.

---

## 7. Out of scope (explicit)

- **Third-party stores** (`@webda/mongodb`, `@webda/postgres`, etc.) keep `query: string`. Per-store follow-ups can flip them once we know the rename pattern lands cleanly.
- **`SetterValidator`** (used by `Store.update` for set-clauses) — same grammar but a different validation context (the LHS is a property to write, not a property to query). Stays string for now.
- **`PartialValidator`** subclass — keeps its existing constructor; not exposed as a public branded surface.

---

## 8. File-by-file impact

**New:**
- `packages/ql/src/webdaql-string.spec.ts`
- `packages/ts-plugin/src/transforms/qlvalidator.ts`
- `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

**Modified:**
- `packages/ql/src/index.ts` — add `WebdaQLString`, `escape`, `WebdaQLError`
- `packages/ts-plugin/src/transform.ts` — plug `qlvalidator` into composed factories
- `packages/compiler/src/configuration.ts` (or sibling) — emit `.webda/session-types.d.ts`
- `packages/compiler/src/configuration.spec.ts` — extend
- `packages/core/src/stores/store.ts` — `query: string` → `WebdaQLString<T>`
- `packages/core/src/core/operations.ts` (or `icore.ts`) — `permission: string` → `WebdaQLString<WebdaSessionRegistry["session"]>`
- `packages/core/src/index.ts` — export `WebdaSessionRegistry`
- `packages/models/src/repositories/repository.ts` — `query: string` → `WebdaQLString<T>`
- `packages/models/src/relations.ts` — `query: string` → `WebdaQLString<T>` (Relations.query)
- `sample-app/webda.config.json` — add `session` field
- `sample-apps/blog-system/webda.config.json` — add `session` field
- existing `.query()` call sites in both sample apps as needed

**Total estimate:** 3 new files + ~10 modified.
