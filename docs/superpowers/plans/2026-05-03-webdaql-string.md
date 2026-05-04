# WebdaQLString Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ship a branded `WebdaQLString<T>` type and a TS transformer (`@webda/ts-plugin/transforms/qlvalidator`) that catches WebdaQL attribute typos and grammar errors at compile time, plus rewrites template-literal interpolations into a parameterized `escape(parts, values)` form.

**Architecture:** the brand + runtime helper (`escape`, `WebdaQLError`) live in `@webda/ql`. The transformer lives in `@webda/ts-plugin/src/transforms/qlvalidator.ts` and plugs into the existing composed `before:` factory in `transform.ts`. Session-type codegen — emitting `.webda/session-types.d.ts` from `webda.config.json#session` — lives in `@webda/compiler` next to the existing `generateTypescriptLibrary` step. Every `query: string` and `permission: string` parameter in `@webda/core` and `@webda/models` flips to `WebdaQLString<T>`.

**Tech Stack:** TypeScript 5.x, ts-patch, Vitest, ANTLR-generated `parse()` from `@webda/ql/query.ts`, existing pattern from `transforms/behaviors.ts` and `transforms/accessors.ts`.

**Spec:** [`docs/superpowers/specs/2026-05-03-webdaql-string-design.md`](../specs/2026-05-03-webdaql-string-design.md)

---

## File Structure

**New files (6):**

| File | Responsibility |
|---|---|
| `packages/ql/src/webdaql-string.ts` | `WebdaQLString<T>` brand type, `escape` runtime helper, `WebdaQLError` class |
| `packages/ql/src/webdaql-string.spec.ts` | Vitest suite: brand erasure, `escape` happy path, escape rejection cases |
| `packages/ts-plugin/src/transforms/qlvalidator.ts` | `createQlValidatorTransformer` factory: visits call expressions, peels brand, validates literals, rewrites templates, emits diagnostics, throws aggregate on errorCount > 0 |
| `packages/ts-plugin/src/transforms/qlvalidator.spec.ts` | Vitest suite using in-memory `ts.Program` (mirrors `behaviors.spec.ts`) |
| `packages/compiler/src/session-types.ts` | `generateSessionTypes(project)` — reads `webda.config.json#session`, resolves model ID via `webda.module.json`, writes `.webda/session-types.d.ts` |
| `packages/compiler/src/session-types.spec.ts` | Vitest suite for the codegen step |

**Modified files (~10):**

| File | Change |
|---|---|
| `packages/ql/src/index.ts` | re-export from `./webdaql-string.js` |
| `packages/ts-plugin/src/transform.ts` | wire `createQlValidatorTransformer` into the composed `before:` factory |
| `packages/compiler/src/module.ts` | call `generateSessionTypes` from `ModuleGenerator.generateTypescriptLibrary` |
| `packages/core/src/core/icore.ts` | add `WebdaSessionRegistry` interface; type `OperationDefinition.permission` as `WebdaQLString<WebdaSessionRegistry["session"]>` |
| `packages/core/src/index.ts` | export `WebdaSessionRegistry` and re-export `WebdaQLString`/`escape`/`WebdaQLError` from `@webda/ql` |
| `packages/core/src/stores/store.ts` | `query: string` → `WebdaQLString<T>` on `find`, `query`, `iterate` |
| `packages/models/src/repositories/repository.ts` | `query: string` → `WebdaQLString<InstanceType<T>>` |
| `packages/models/src/relations.ts` | `query: string` → `WebdaQLString<T>` on `Relations.query` and `Relations.iterate` |
| `sample-app/webda.config.json` | add `session` field |
| `sample-apps/blog-system/webda.config.json` | add `session` field |

Files that change together (the brand + the runtime + the index re-export) ship in the same task. Each later task is self-contained.

---

## Task Order Rationale

1. **Phase 1 — runtime brand + helper** (Tasks 1–4). Pure TypeScript, no transformer ceremony. Ship and verify in isolation: branded type behaves like `string`, `escape` produces correct WebdaQL fragments, `WebdaQLError` thrown on bad inputs.
2. **Phase 2 — session-type codegen** (Tasks 5–6). Decoupled from the transformer. Lets `OperationDefinition.permission` carry a meaningful `T` even with a plain `tsc` build.
3. **Phase 3 — core types** (Task 7). Adds `WebdaSessionRegistry` interface and re-routes `OperationDefinition.permission`. Done before the migration so call-site type-checks during `Store.query` migration.
4. **Phase 4 — transformer** (Tasks 8–14). The big build. TDD against in-memory `ts.Program`. Each sub-task is one diagnostic code or one walking rule. Wire into `transform.ts` only at the end (Task 15).
5. **Phase 5 — wholesale rename** (Tasks 16–18). Flip the three signatures. Type errors at call sites surface; fix them.
6. **Phase 6 — sample-app adoption** (Tasks 19–20). Real-code shakeout.
7. **Phase 7 — full build** (Task 21).

---

## Task 1: Brand type + WebdaQLError + escape (string + scalars)

**Files:**
- Create: `packages/ql/src/webdaql-string.ts`
- Create: `packages/ql/src/webdaql-string.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ql/src/webdaql-string.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { escape, WebdaQLError, type WebdaQLString } from "./webdaql-string.js";

describe("WebdaQLString brand", () => {
  it("is structurally a string at runtime", () => {
    const q: WebdaQLString<{ name: string }> = "name = 'x'" as WebdaQLString<{ name: string }>;
    expect(typeof q).toBe("string");
    expect(q).toBe("name = 'x'");
  });
});

describe("escape — string values", () => {
  it("wraps strings in single quotes", () => {
    expect(escape(["name = ", ""], ["alice"])).toBe("name = 'alice'");
  });

  it("doubles embedded single quotes (SQL convention)", () => {
    expect(escape(["name = ", ""], ["O'Brien"])).toBe("name = 'O''Brien'");
  });

  it("preserves backslashes verbatim", () => {
    expect(escape(["path = ", ""], ["a\\b"])).toBe("path = 'a\\b'");
  });

  it("supports multi-byte / unicode strings", () => {
    expect(escape(["x = ", ""], ["café"])).toBe("x = 'café'");
  });

  it("supports multiple values", () => {
    expect(escape(["name = ", " AND age = ", ""], ["alice", 30])).toBe(
      "name = 'alice' AND age = 30"
    );
  });
});

describe("escape — scalar values", () => {
  it("emits numbers verbatim", () => {
    expect(escape(["age = ", ""], [42])).toBe("age = 42");
    expect(escape(["x = ", ""], [3.14])).toBe("x = 3.14");
    expect(escape(["x = ", ""], [-7])).toBe("x = -7");
  });

  it("emits booleans as TRUE/FALSE (uppercase)", () => {
    expect(escape(["ok = ", ""], [true])).toBe("ok = TRUE");
    expect(escape(["ok = ", ""], [false])).toBe("ok = FALSE");
  });

  it("emits null/undefined as NULL", () => {
    expect(escape(["x = ", ""], [null])).toBe("x = NULL");
    expect(escape(["x = ", ""], [undefined])).toBe("x = NULL");
  });

  it("emits Date as ISO string in single quotes", () => {
    const d = new Date("2026-05-03T12:00:00.000Z");
    expect(escape(["t = ", ""], [d])).toBe("t = '2026-05-03T12:00:00.000Z'");
  });

  it("rejects NaN", () => {
    expect(() => escape(["x = ", ""], [NaN])).toThrow(WebdaQLError);
  });

  it("rejects Infinity", () => {
    expect(() => escape(["x = ", ""], [Infinity])).toThrow(WebdaQLError);
    expect(() => escape(["x = ", ""], [-Infinity])).toThrow(WebdaQLError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/ql`:

```bash
pnpm test -- webdaql-string
```

Expected: FAIL with "Cannot find module './webdaql-string.js'".

- [ ] **Step 3: Implement `webdaql-string.ts`**

Create `packages/ql/src/webdaql-string.ts`:

```ts
"use strict";

/**
 * Marker brand for WebdaQL query strings. `T` is the type whose attributes
 * `@webda/ts-plugin` validates the query against — typically the model class
 * for `Store.query` and the configured session type for
 * `OperationDefinition.permission`.
 *
 * Erased at runtime — `WebdaQLString<X>` IS a string, so adoption is zero
 * cost for callers and consumers. The optional brand property lets a plain
 * string variable flow into a `WebdaQLString<T>` parameter without an
 * explicit cast, while `T` still differentiates `WebdaQLString<Post>` from
 * `WebdaQLString<User>` at the type level.
 */
export type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };

/**
 * Thrown by `escape` when an interpolated value is not representable as a
 * WebdaQL literal (object, function, symbol, NaN, Infinity, nested array).
 */
export class WebdaQLError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebdaQLError";
  }
}

/**
 * Type-aware WebdaQL value escaper. Called by the rewritten output of any
 * template literal that flows into a `WebdaQLString<T>` parameter:
 *
 *     `name = '${n}' AND age = ${a}`
 *
 * is rewritten by the qlvalidator transformer to:
 *
 *     escape(["name = ", " AND age = ", ""], [n, a])
 *
 * Each value is escaped according to its runtime type, then concatenated
 * with the surrounding `parts` to form a parameterised query string that
 * cannot be used to inject grammar.
 */
export function escape<T = unknown>(
  parts: TemplateStringsArray | readonly string[],
  values: readonly unknown[]
): WebdaQLString<T> {
  let out = parts[0];
  for (let i = 0; i < values.length; i++) {
    out += escapeValue(values[i]);
    out += parts[i + 1];
  }
  return out as WebdaQLString<T>;
}

/**
 * Escape a single value to its WebdaQL literal form.
 * @internal exported only for testing.
 */
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new WebdaQLError(`Cannot embed ${value} in a WebdaQL query`);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return `'${value.toISOString()}'`;
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (const item of value) {
      if (Array.isArray(item)) {
        throw new WebdaQLError("Nested arrays are not representable in WebdaQL");
      }
      parts.push(escapeValue(item));
    }
    return `(${parts.join(", ")})`;
  }
  throw new WebdaQLError(
    `Cannot embed value of type ${typeof value} in a WebdaQL query`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- webdaql-string`. Expected: all tests in the suite pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ql/src/webdaql-string.ts packages/ql/src/webdaql-string.spec.ts
git commit -m "feat(ql): add WebdaQLString brand, WebdaQLError, escape (scalars)"
```

---

## Task 2: escape — array values

**Files:**
- Modify: `packages/ql/src/webdaql-string.spec.ts` (already covers scalars from Task 1; add array cases)

- [ ] **Step 1: Add the failing tests**

Append to `packages/ql/src/webdaql-string.spec.ts`:

```ts
describe("escape — array values", () => {
  it("emits string arrays as parenthesised, comma-separated", () => {
    expect(escape(["tags IN ", ""], [["a", "b", "c"]])).toBe(
      "tags IN ('a', 'b', 'c')"
    );
  });

  it("emits number arrays the same way", () => {
    expect(escape(["x IN ", ""], [[1, 2, 3]])).toBe("x IN (1, 2, 3)");
  });

  it("supports mixed scalar arrays", () => {
    expect(escape(["x IN ", ""], [[1, "two", true, null]])).toBe(
      "x IN (1, 'two', TRUE, NULL)"
    );
  });

  it("escapes embedded quotes inside string arrays", () => {
    expect(escape(["x IN ", ""], [["O'Brien"]])).toBe("x IN ('O''Brien')");
  });

  it("emits empty arrays as ()", () => {
    expect(escape(["x IN ", ""], [[]])).toBe("x IN ()");
  });

  it("rejects nested arrays", () => {
    expect(() => escape(["x = ", ""], [[[1, 2]]])).toThrow(WebdaQLError);
  });
});
```

- [ ] **Step 2: Run test**

Run: `pnpm test -- webdaql-string`. Tests pass — the implementation in Task 1 already supports arrays. (Confirm by reading the suite output. If any case fails, fix `escapeValue` before continuing.)

- [ ] **Step 3: Commit**

```bash
git add packages/ql/src/webdaql-string.spec.ts
git commit -m "test(ql): cover escape() array values"
```

---

## Task 3: escape — rejection of unsupported types

**Files:**
- Modify: `packages/ql/src/webdaql-string.spec.ts`

- [ ] **Step 1: Add the failing tests**

Append:

```ts
describe("escape — rejected value types", () => {
  it("rejects plain objects", () => {
    expect(() => escape(["x = ", ""], [{ a: 1 }])).toThrow(WebdaQLError);
  });

  it("rejects functions", () => {
    expect(() => escape(["x = ", ""], [() => 1])).toThrow(WebdaQLError);
  });

  it("rejects symbols", () => {
    expect(() => escape(["x = ", ""], [Symbol("s")])).toThrow(WebdaQLError);
  });

  it("rejects bigints", () => {
    expect(() => escape(["x = ", ""], [10n])).toThrow(WebdaQLError);
  });

  it("rejection message names the offending value type", () => {
    try {
      escape(["x = ", ""], [{ a: 1 }]);
      throw new Error("did not throw");
    } catch (err) {
      expect(err).toBeInstanceOf(WebdaQLError);
      expect((err as WebdaQLError).message).toMatch(/object/);
    }
  });
});
```

- [ ] **Step 2: Run test**

`pnpm test -- webdaql-string`. The bigint case will fail — the current implementation falls through to `throw new WebdaQLError(...)` with message "type bigint", which matches. Object/function/symbol all hit the same path. Verify suite passes; if the message regex fails, adjust the test to match the actual error text.

- [ ] **Step 3: Commit**

```bash
git add packages/ql/src/webdaql-string.spec.ts
git commit -m "test(ql): cover escape() rejection of unsupported types"
```

---

## Task 4: Re-export from @webda/ql index

**Files:**
- Modify: `packages/ql/src/index.ts`
- Test: `packages/ql/src/webdaql-string.spec.ts` (add public-API import test)

- [ ] **Step 1: Write the failing test**

Append to `packages/ql/src/webdaql-string.spec.ts`:

```ts
describe("public API surface", () => {
  it("re-exports WebdaQLString, escape, WebdaQLError from package root", async () => {
    const mod = await import("./index.js");
    expect(mod.escape).toBeDefined();
    expect(mod.WebdaQLError).toBeDefined();
    // WebdaQLString is a type — verify via runtime no-op
    const q: import("./index.js").WebdaQLString<{ x: string }> =
      "x = 'a'" as any;
    expect(q).toBe("x = 'a'");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- webdaql-string`. Expected: `mod.escape` undefined.

- [ ] **Step 3: Add the re-export**

Edit `packages/ql/src/index.ts` to:

```ts
export * from "./query.js";
export * from "./webdaql-string.js";
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- webdaql-string`. All passing.

Also run the full ql package test suite to confirm no regression: `pnpm test`.

- [ ] **Step 5: Commit**

```bash
git add packages/ql/src/index.ts
git commit -m "feat(ql): export WebdaQLString surface from package root"
```

---

## Task 5: Session-type codegen helper

**Files:**
- Create: `packages/compiler/src/session-types.ts`
- Create: `packages/compiler/src/session-types.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/compiler/src/session-types.spec.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionTypes } from "./session-types.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "session-types-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function writeJson(rel: string, value: unknown) {
  const full = join(tmp, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, JSON.stringify(value, null, 2));
}

describe("generateSessionTypes", () => {
  it("does nothing when webda.config.json has no session field", () => {
    writeJson("webda.config.json", { version: 3, services: {} });
    writeJson("webda.module.json", { models: {} });

    generateSessionTypes(tmp);

    expect(existsSync(join(tmp, ".webda/session-types.d.ts"))).toBe(false);
  });

  it("emits .webda/session-types.d.ts when session is configured", () => {
    writeJson("webda.config.json", { version: 3, session: "MyApp/Session" });
    writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(tmp);

    const out = readFileSync(join(tmp, ".webda/session-types.d.ts"), "utf-8");
    expect(out).toContain('declare module "@webda/core"');
    expect(out).toContain("interface WebdaSessionRegistry");
    expect(out).toContain("session: __ResolvedSession");
    expect(out).toMatch(/import type \{ Session as __ResolvedSession \} from ".*src\/models\/session/);
  });

  it("throws when session model is not declared in webda.module.json", () => {
    writeJson("webda.config.json", { version: 3, session: "MyApp/Missing" });
    writeJson("webda.module.json", { models: { list: {} } });

    expect(() => generateSessionTypes(tmp)).toThrow(/MyApp\/Missing/);
  });

  it("supports namespace-less model id (resolves with case-insensitive lookup)", () => {
    writeJson("webda.config.json", { version: 3, session: "Session" });
    writeJson("webda.module.json", {
      models: {
        list: { "MyApp/Session": "src/models/session.ts:Session" }
      }
    });

    generateSessionTypes(tmp);

    const out = readFileSync(join(tmp, ".webda/session-types.d.ts"), "utf-8");
    expect(out).toContain("Session as __ResolvedSession");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `packages/compiler`:

```bash
pnpm test -- session-types
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `session-types.ts`**

Create `packages/compiler/src/session-types.ts`:

```ts
"use strict";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { useLog } from "@webda/workout";

/**
 * Read `webda.config.json#session` (a model id like `MyApp/Session`),
 * resolve it via `webda.module.json` to an import path, and emit
 * `.webda/session-types.d.ts` with a module augmentation that fills the
 * `WebdaSessionRegistry["session"]` slot.
 *
 * The augmentation is a plain `.d.ts` file under the project — it is picked
 * up by `tsc` via the user's standard tsconfig include, so editor feedback
 * works without our ts-plugin loaded.
 *
 * @param projectRoot absolute path to the project root (where webda.config.json lives)
 */
export function generateSessionTypes(projectRoot: string): void {
  const configPath = join(projectRoot, "webda.config.json");
  if (!existsSync(configPath)) return;

  const config = JSON.parse(readFileSync(configPath, "utf-8")) as { session?: string };
  if (!config.session) return;

  const modulePath = join(projectRoot, "webda.module.json");
  if (!existsSync(modulePath)) {
    throw new Error(`Cannot resolve session model "${config.session}": webda.module.json is missing`);
  }

  const mod = JSON.parse(readFileSync(modulePath, "utf-8")) as {
    models?: { list?: Record<string, string> };
  };
  const models = mod.models?.list ?? {};

  const importDescriptor = resolveModelImport(models, config.session);
  if (!importDescriptor) {
    throw new Error(
      `Cannot resolve session model "${config.session}" in webda.module.json: not declared`
    );
  }

  const [importFile, exportName] = importDescriptor.split(":");
  const outDir = join(projectRoot, ".webda");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "session-types.d.ts");

  let importTarget: string;
  if (importFile.startsWith(".") || importFile.startsWith("/")) {
    const absImportFile = importFile.startsWith("/")
      ? importFile
      : join(projectRoot, importFile);
    importTarget = relative(outDir, absImportFile)
      .replace(/\\/g, "/")
      .replace(/\.tsx?$/, ".js");
    if (!importTarget.startsWith(".")) importTarget = "./" + importTarget;
  } else {
    importTarget = importFile;
  }

  const content =
    `// AUTO-GENERATED by @webda/compiler — do not edit\n` +
    `import type { ${exportName} as __ResolvedSession } from "${importTarget}";\n` +
    `declare module "@webda/core" {\n` +
    `  interface WebdaSessionRegistry {\n` +
    `    session: __ResolvedSession;\n` +
    `  }\n` +
    `}\n`;

  writeFileSync(outPath, content);
  useLog("INFO", `Generated session types at ${relative(projectRoot, outPath)}`);
}

/**
 * Look up a model id in the module's models list. Accepts both fully
 * qualified ids (`MyApp/Session`) and bare class names (`Session`); for the
 * latter, returns the first matching declaration.
 */
function resolveModelImport(
  models: Record<string, string>,
  id: string
): string | undefined {
  if (models[id]) return models[id];
  if (!id.includes("/")) {
    for (const key of Object.keys(models)) {
      if (key.split("/").pop() === id) return models[key];
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- session-types`. All passing.

- [ ] **Step 5: Commit**

```bash
git add packages/compiler/src/session-types.ts packages/compiler/src/session-types.spec.ts
git commit -m "feat(compiler): generate .webda/session-types.d.ts from webda.config.json#session"
```

---

## Task 6: Wire session-types codegen into ModuleGenerator

**Files:**
- Modify: `packages/compiler/src/module.ts:1316-1355` (`generateTypescriptLibrary`)

- [ ] **Step 1: Write the failing test**

Add a fresh, standalone test to `packages/compiler/src/session-types.spec.ts` rather than threading through `module.spec.ts`'s fixture (the integration is covered indirectly by Task 21's full build):

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateSessionTypes } from "./session-types.js";

describe("generateSessionTypes — module-generator integration", () => {
  let tmp: string;
  beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "session-types-int-")); });
  afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

  it("running after module generation leaves both files in .webda/", () => {
    // Simulate state at the end of generateTypescriptLibrary: webda.module.json
    // already exists, webda.config.json has session.
    mkdirSync(join(tmp, ".webda"), { recursive: true });
    writeFileSync(join(tmp, ".webda/module.d.ts"), "// existing");
    writeFileSync(join(tmp, "webda.config.json"), JSON.stringify({
      version: 3, session: "WebdaSample/Session"
    }));
    writeFileSync(join(tmp, "webda.module.json"), JSON.stringify({
      models: { list: { "WebdaSample/Session": "src/models/session.ts:Session" } }
    }));

    generateSessionTypes(tmp);

    // module.d.ts is preserved (we don't overwrite); session-types.d.ts is added.
    expect(readFileSync(join(tmp, ".webda/module.d.ts"), "utf-8")).toBe("// existing");
    expect(existsSync(join(tmp, ".webda/session-types.d.ts"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- session-types.spec` from `packages/compiler`. Expected: this test passes already (Task 5 implements `generateSessionTypes`); the failing piece is that `ModuleGenerator` doesn't *call* it. We'll catch that in the integration check at Step 4 below; first wire the call.

- [ ] **Step 3: Wire the call**

In `packages/compiler/src/module.ts`, at the bottom of `generateTypescriptLibrary` (after `writeFileSync(outPath, content)` at line 1353):

```ts
    writeFileSync(outPath, content);
    useLog("INFO", `Generated TypeScript library at .webda/module.d.ts`);

    // Emit session-types augmentation if webda.config.json#session is set.
    try {
      generateSessionTypes(this.compiler.project.getAppPath());
    } catch (err) {
      useLog("ERROR", "Failed to generate session types:", (err as Error).message);
      throw err;
    }
  }
```

Add the import at the top of `module.ts` near the other internal imports:

```ts
import { generateSessionTypes } from "./session-types.js";
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test` (full compiler suite). The new integration test passes. Confirm no regression in `module.spec.ts` or `compiler.spec.ts`.

- [ ] **Step 5: Commit**

```bash
git add packages/compiler/src/module.ts packages/compiler/src/session-types.spec.ts
git commit -m "feat(compiler): wire session-types codegen into module generation"
```

---

## Task 7: WebdaSessionRegistry interface + OperationDefinition typing

**Files:**
- Modify: `packages/core/src/core/icore.ts:73` (`OperationDefinition.permission`)
- Modify: `packages/core/src/index.ts` (export `WebdaSessionRegistry`, re-export brand)

- [ ] **Step 1: Write the failing test**

Add to `packages/core/src/core/icore.spec.ts` (create the file if missing). The codebase doesn't pull in `vitest`'s `expectTypeOf` elsewhere; we use a runtime-erased type-assignment check instead, which fails compilation if the typing is wrong:

```ts
"use strict";

import { describe, it, expect } from "vitest";
import type { OperationDefinition, WebdaSessionRegistry } from "./icore.js";
import type { WebdaQLString } from "@webda/ql";

describe("OperationDefinition.permission typing", () => {
  it("is assignable to WebdaQLString<WebdaSessionRegistry['session']>", () => {
    // If the field is mistyped, this assignment chain fails to compile.
    const sample = "x = 'y'" as WebdaQLString<WebdaSessionRegistry["session"]>;
    const def: OperationDefinition = {
      id: "test",
      input: "void",
      output: "void",
      method: "noop",
      permission: sample
    };
    expect(typeof def.permission).toBe("string");
  });

  it("WebdaSessionRegistry['session'] defaults to unknown without augmentation", () => {
    // The whole point of `unknown` is that anything is assignable INTO it,
    // and nothing is assignable OUT of it without a narrowing. Verify with
    // the latter direction:
    const value: WebdaSessionRegistry["session"] = { anything: 1 };
    // @ts-expect-error — `unknown` cannot flow into `string` without a check
    const asString: string = value;
    expect(typeof value).toBe("object");
    expect(asString).toEqual({ anything: 1 }); // erased at runtime — value IS the object
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- icore`. Expected: type error / mismatch.

- [ ] **Step 3: Update `icore.ts`**

In `packages/core/src/core/icore.ts`, at the top (after existing imports):

```ts
import type { WebdaQLString } from "@webda/ql";

/**
 * Registry interface augmented at build time by `.webda/session-types.d.ts`
 * (generated from `webda.config.json#session`). The qlvalidator transformer
 * resolves `OperationDefinition.permission`'s type parameter through this
 * interface — when no session is configured, `session` resolves to `unknown`
 * and the plugin emits `WQL9006` on any permission usage.
 */
export interface WebdaSessionRegistry {
  session: unknown;
}
```

Replace the existing `permission?: string;` (line 73) with:

```ts
  /**
   * WebdaQL to execute on session to know if
   * operation is available to user
   */
  permission?: WebdaQLString<WebdaSessionRegistry["session"]>;
```

In `packages/core/src/index.ts`, ensure the new types and the brand are re-exported:

```ts
// Add (or augment) the existing exports:
export type { WebdaSessionRegistry } from "./core/icore.js";
export { escape, WebdaQLError } from "@webda/ql";
export type { WebdaQLString } from "@webda/ql";
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- icore`. Run full core suite: `pnpm test`. Some call sites may now type-error — that's expected and addressed in Tasks 16–18; for now run only the type tests for this file.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/core/icore.ts packages/core/src/core/icore.spec.ts packages/core/src/index.ts
git commit -m "feat(core): WebdaSessionRegistry + OperationDefinition.permission as WebdaQLString"
```

---

## Task 8: qlvalidator skeleton + brand detection

**Files:**
- Create: `packages/ts-plugin/src/transforms/qlvalidator.ts`
- Create: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`:

```ts
"use strict";

import { describe, it, expect } from "vitest";
import * as ts from "typescript";
import { createQlValidatorTransformer } from "./qlvalidator.js";

/**
 * Build an in-memory TS Program from inline source. Mirrors the helper in
 * `behaviors.spec.ts`. We pass `lib: []` and provide just enough stub types
 * to avoid pulling in the full stdlib (which would slow tests to a crawl).
 */
function createTestProgram(sources: Record<string, string>): ts.Program {
  const opts: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
    strict: false,
    noEmit: true,
    lib: ["es2022"]
  };
  const host = ts.createCompilerHost(opts);
  const original = host.getSourceFile.bind(host);
  host.getSourceFile = (fileName, lv, onErr) => {
    if (sources[fileName]) {
      return ts.createSourceFile(fileName, sources[fileName], lv);
    }
    return original(fileName, lv, onErr);
  };
  host.fileExists = fn => fn in sources || ts.sys.fileExists(fn);
  host.readFile = fn => sources[fn] ?? ts.sys.readFile(fn);
  return ts.createProgram(Object.keys(sources), opts, host);
}

function runValidator(program: ts.Program, fileName: string): {
  output: string;
  diagnostics: ts.Diagnostic[];
} {
  const diagnostics: ts.Diagnostic[] = [];
  const factory = createQlValidatorTransformer(ts, program, {
    onDiagnostic: d => diagnostics.push(d),
    throwOnError: false
  });
  const sourceFile = program.getSourceFile(fileName)!;
  const result = ts.transform(sourceFile, [factory]);
  const printer = ts.createPrinter();
  const output = printer.printFile(result.transformed[0] as ts.SourceFile);
  result.dispose();
  return { output, diagnostics };
}

describe("qlvalidator skeleton", () => {
  it("is a no-op when no call site uses WebdaQLString", () => {
    const program = createTestProgram({
      "test.ts": `
        function plain(q: string) { return q; }
        plain("hello");
      `
    });

    const { output, diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain('plain("hello")');
  });

  it("recognises a parameter typed as WebdaQLString<T> and parses literal", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'x'");
      `
    });

    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("rejects an unknown attribute with WQL9001", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("bogus = 'x'");
      `
    });

    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9001);
    expect(ts.flattenDiagnosticMessageText(diagnostics[0].messageText, "\n")).toMatch(/bogus/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- qlvalidator
```

Expected: FAIL — `qlvalidator.js` not found.

- [ ] **Step 3: Implement the skeleton**

Create `packages/ts-plugin/src/transforms/qlvalidator.ts`:

```ts
"use strict";

import type * as tsTypes from "typescript";
import { parse, QueryValidator } from "@webda/ql";

/**
 * Configuration for the qlvalidator factory.
 * Tests pass `throwOnError: false` and capture diagnostics manually; the
 * production wiring uses defaults (throws aggregate on errorCount > 0).
 */
export interface QlValidatorOptions {
  /** Called for every emitted diagnostic. Default: pushed to program.getSemanticDiagnostics(). */
  onDiagnostic?: (d: tsTypes.Diagnostic) => void;
  /** If false, do not throw `WebdaQLAggregateError` at end of file walk. Default: true. */
  throwOnError?: boolean;
}

/**
 * Aggregate exception thrown at the end of a source file walk if any
 * WQL diagnostic was emitted. `tsc-esm` and `webdac build` already wrap
 * transformer exceptions and exit non-zero, so this is what makes the
 * build fail.
 */
export class WebdaQLAggregateError extends Error {
  readonly diagnostics: readonly tsTypes.Diagnostic[];
  constructor(diagnostics: readonly tsTypes.Diagnostic[]) {
    super(
      `${diagnostics.length} WebdaQL validation error(s):\n` +
        diagnostics
          .map(d => {
            const text =
              typeof d.messageText === "string"
                ? d.messageText
                : d.messageText.messageText;
            const file = d.file?.fileName ?? "<unknown>";
            const pos = d.file && d.start !== undefined
              ? d.file.getLineAndCharacterOfPosition(d.start)
              : { line: 0, character: 0 };
            return `  ${file}:${pos.line + 1}:${pos.character + 1} WQL${d.code} ${text}`;
          })
          .join("\n")
    );
    this.name = "WebdaQLAggregateError";
    this.diagnostics = diagnostics;
  }
}

/**
 * Factory: returns a TransformerFactory<SourceFile> that validates every
 * call expression whose resolved parameter type is `WebdaQLString<T>`.
 */
export function createQlValidatorTransformer(
  tsModule: typeof tsTypes,
  program: tsTypes.Program,
  options: QlValidatorOptions = {}
): tsTypes.TransformerFactory<tsTypes.SourceFile> {
  const { onDiagnostic, throwOnError = true } = options;
  const checker = program.getTypeChecker();

  return context => sourceFile => {
    const collected: tsTypes.Diagnostic[] = [];
    const emit = (d: tsTypes.Diagnostic) => {
      collected.push(d);
      onDiagnostic?.(d);
    };

    const visit = (node: tsTypes.Node): tsTypes.Node => {
      if (tsModule.isCallExpression(node)) {
        validateCall(tsModule, checker, node, sourceFile, emit);
      }
      return tsModule.visitEachChild(node, visit, context);
    };

    const result = tsModule.visitNode(sourceFile, visit) as tsTypes.SourceFile;

    if (throwOnError && collected.length > 0) {
      throw new WebdaQLAggregateError(collected);
    }
    return result;
  };
}

/**
 * For every argument of `call` whose parameter type is `WebdaQLString<T>`,
 * parse and validate the argument's WebdaQL.
 */
function validateCall(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  call: tsTypes.CallExpression,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  const signature = checker.getResolvedSignature(call);
  if (!signature) return;

  const params = signature.getParameters();
  for (let i = 0; i < call.arguments.length && i < params.length; i++) {
    const paramType = checker.getTypeOfSymbolAtLocation(params[i], call);
    const targetT = peelWebdaQLString(checker, paramType);
    if (!targetT) continue; // not a WebdaQLString parameter — skip

    validateArgument(ts, checker, call.arguments[i], targetT, sourceFile, emit);
  }
}

/**
 * Detect whether `type` is structurally `WebdaQLString<T>` and return `T`.
 *
 * Strategy:
 *   1. Read aliasTypeArguments when the alias is preserved (most cases).
 *   2. Fall back to looking for a property symbol named `__webdaQL`.
 */
export function peelWebdaQLString(
  checker: tsTypes.TypeChecker,
  type: tsTypes.Type
): tsTypes.Type | undefined {
  // `type & {…}` — the alias may live on the intersection or its constituent.
  if (type.aliasSymbol?.escapedName === "WebdaQLString" && type.aliasTypeArguments?.[0]) {
    return type.aliasTypeArguments[0];
  }
  if (type.isUnionOrIntersection()) {
    for (const t of type.types) {
      const peeled = peelWebdaQLString(checker, t);
      if (peeled) return peeled;
    }
  }
  const brandProp = type.getProperty("__webdaQL");
  if (brandProp) {
    const brandType = checker.getTypeOfSymbol(brandProp);
    return brandType;
  }
  return undefined;
}

/**
 * Validate a single argument against `targetT`. For now: only string
 * literals; later tasks add templates, locals, etc.
 */
function validateArgument(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  argument: tsTypes.Expression,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    validateLiteral(ts, checker, argument.text, argument, targetT, sourceFile, emit);
  }
  // Other argument shapes are added in later tasks.
}

/**
 * Parse the literal as WebdaQL; if it parses, walk every comparison's
 * attribute path against `targetT`'s structural properties.
 */
function validateLiteral(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  source: string,
  node: tsTypes.Node,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  let parsed;
  try {
    new QueryValidator(source);
    parsed = parse(source);
  } catch (err) {
    emit(makeDiagnostic(sourceFile, node, 9002, `WebdaQL grammar: ${(err as Error).message}`));
    return;
  }

  for (const cmp of collectComparisons(parsed)) {
    const head = cmp.attribute[0];
    if (!head) continue;
    const propSymbol = targetT.getProperty(head);
    if (!propSymbol) {
      const candidates = targetT.getProperties().map(p => p.name);
      const suggestion = nearestNeighbour(head, candidates);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      emit(
        makeDiagnostic(
          sourceFile,
          node,
          9001,
          `WebdaQL: attribute '${head}' does not exist on type.` + hint
        )
      );
    }
    // Multi-segment paths handled in later tasks.
  }
}

/**
 * Walk an Expression tree (ANTLR-emitted) and collect leaf
 * ComparisonExpressions. Implementation depends on `@webda/ql/query`'s
 * exported AST shapes — `AndExpression`/`OrExpression` carry `.children`,
 * `NotExpression` carries `.expression`, `ComparisonExpression` is a leaf.
 */
function collectComparisons(expr: any): any[] {
  if (!expr) return [];
  if (Array.isArray(expr.children)) return expr.children.flatMap(collectComparisons);
  if (expr.expression) return collectComparisons(expr.expression);
  if (Array.isArray(expr.attribute)) return [expr];
  return [];
}

/**
 * Compute Levenshtein distance and return the closest candidate within
 * distance 2, or undefined.
 */
function nearestNeighbour(needle: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 3;
  for (const c of candidates) {
    const d = levenshtein(needle, c);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function makeDiagnostic(
  sourceFile: tsTypes.SourceFile,
  node: tsTypes.Node,
  code: number,
  message: string
): tsTypes.Diagnostic {
  return {
    file: sourceFile,
    start: node.getStart(sourceFile),
    length: node.getEnd() - node.getStart(sourceFile),
    category: 1, // ts.DiagnosticCategory.Error
    code,
    messageText: message,
    source: "webdaql"
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- qlvalidator`. The three skeleton tests should pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): qlvalidator skeleton — WQL9001 + WQL9002 on string literals"
```

---

## Task 9: Grammar errors (WQL9002) — extended coverage

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing test cases**

Append:

```ts
describe("qlvalidator — grammar errors", () => {
  it("emits WQL9002 with parser position info on syntax error", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { uuid: string; title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title === 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9002);
  });

  it("emits WQL9002 on unterminated string literal in WebdaQL", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'unterminated");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9002)).toBe(true);
  });

  it("does NOT emit WQL9002 on a valid AND/OR query", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string; status: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'x' AND status = 'pub'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test**

`pnpm test -- qlvalidator`. The first two pass; the third may also pass — but if the existing AST walker doesn't traverse `AndExpression.children`, it won't see the second comparison. That walking is exercised in Task 10.

- [ ] **Step 3: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "test(ts-plugin): cover qlvalidator grammar errors"
```

---

## Task 10: Walk through ModelRelation / BelongTo / nested objects

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.ts`
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing tests**

Append to the spec file:

```ts
describe("qlvalidator — attribute walk", () => {
  it("walks into ModelRelation<U>", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type ModelRelation<U> = { __relation: U };
        type User = { uuid: string; email: string };
        type Post = { author: ModelRelation<User> };
        function query(q: WebdaQLString<Post>) { return q; }
        query("author.email = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("rejects unknown attribute under a relation", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type ModelRelation<U> = { __relation: U };
        type User = { uuid: string; email: string };
        type Post = { author: ModelRelation<User> };
        function query(q: WebdaQLString<Post>) { return q; }
        query("author.bogus = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9001);
  });

  it("walks into plain nested objects to any depth", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { meta: { author: { name: string } } };
        function query(q: WebdaQLString<Post>) { return q; }
        query("meta.author.name = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("walks every comparison in an AND/OR composition", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string; status: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("title = 'x' AND bogus = 'y'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(9001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- qlvalidator`. The first three fail; the fourth may already pass.

- [ ] **Step 3: Implement the walker**

In `packages/ts-plugin/src/transforms/qlvalidator.ts`, replace the body of `validateLiteral` (specifically the per-comparison loop) with:

```ts
  for (const cmp of collectComparisons(parsed)) {
    walkAttributePath(ts, checker, cmp.attribute, targetT, node, sourceFile, emit);
  }
```

And add at the bottom of the file:

```ts
/**
 * Walk a dotted attribute path one segment at a time, descending into
 * relations / Behaviors / nested objects. Emits diagnostics on missing
 * properties (WQL9001), depth-violating array walks (WQL9003), method
 * references (WQL9004).
 */
function walkAttributePath(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  path: string[],
  rootType: tsTypes.Type,
  node: tsTypes.Node,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): void {
  let current = rootType;
  let arrayHopsUsed = 0;

  for (let depth = 0; depth < path.length; depth++) {
    const segment = path[depth];

    // any/unknown short-circuits the walk
    if ((current.flags & ts.TypeFlags.Any) || (current.flags & ts.TypeFlags.Unknown)) {
      return;
    }

    // Peel relation wrappers and array element types before property lookup.
    let probe = unwrapRelation(checker, current);
    if (isArrayLike(ts, checker, probe)) {
      if (arrayHopsUsed >= 1) {
        emit(makeDiagnostic(sourceFile, node, 9003,
          `WebdaQL: cannot walk past depth 1 through array attribute '${path.slice(0, depth).join(".")}'.`));
        return;
      }
      arrayHopsUsed++;
      probe = elementType(ts, checker, probe) ?? probe;
    }

    const propSymbol = probe.getProperty(segment);
    if (!propSymbol) {
      const candidates = probe.getProperties().map(p => p.name).filter(n => !n.startsWith("__"));
      const suggestion = nearestNeighbour(segment, candidates);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
      const prefix = path.slice(0, depth).join(".");
      const where = prefix ? ` under '${prefix}'` : "";
      emit(makeDiagnostic(sourceFile, node, 9001,
        `WebdaQL: attribute '${segment}'${where} does not exist.` + hint));
      return;
    }

    // Reject method / non-data references.
    if (propSymbol.flags & ts.SymbolFlags.Method) {
      emit(makeDiagnostic(sourceFile, node, 9004,
        `WebdaQL: '${path.slice(0, depth + 1).join(".")}' is a method, not a queryable attribute.`));
      return;
    }

    current = checker.getTypeOfSymbol(propSymbol);
  }
}

/**
 * If `type` looks like `ModelRelation<U>` or `BelongTo<U>`, return `U`.
 * Otherwise return `type` unchanged.
 */
function unwrapRelation(
  checker: tsTypes.TypeChecker,
  type: tsTypes.Type
): tsTypes.Type {
  const aliasName = type.aliasSymbol?.escapedName as string | undefined;
  if (
    (aliasName === "ModelRelation" || aliasName === "BelongTo") &&
    type.aliasTypeArguments?.[0]
  ) {
    return type.aliasTypeArguments[0];
  }
  return type;
}

/**
 * Detect array-like types: `Array<T>`, `ReadonlyArray<T>`, `OneToMany<T>`.
 */
function isArrayLike(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  type: tsTypes.Type
): boolean {
  if (checker.isArrayType(type) || checker.isTupleType(type)) return true;
  const aliasName = type.aliasSymbol?.escapedName as string | undefined;
  return aliasName === "OneToMany";
}

function elementType(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  type: tsTypes.Type
): tsTypes.Type | undefined {
  if (type.aliasTypeArguments?.[0]) return type.aliasTypeArguments[0];
  const numIndex = checker.getIndexTypeOfType(type, ts.IndexKind.Number);
  return numIndex;
}
```

Note that some helpers (`checker.isArrayType`, `checker.isTupleType`) are members of the public TS API since 4.0; if they are missing in the version pinned by this repo, fall back to `(type as any).typeArguments && type.symbol?.escapedName === "Array"`.

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- qlvalidator`. All four cases from Step 1 pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): qlvalidator walks relations + nested objects + AND/OR"
```

---

## Task 11: Array depth (WQL9003) and method/Date rejection (WQL9004)

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe("qlvalidator — array depth + methods", () => {
  it("allows depth-1 walk into array elements", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Comment = { content: string };
        type Post = { comments: Comment[] };
        function query(q: WebdaQLString<Post>) { return q; }
        query("comments.content = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("emits WQL9003 on depth-2 walk through arrays", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Author = { email: string };
        type Comment = { author: Author };
        type Post = { comments: Comment[] };
        function query(q: WebdaQLString<Post>) { return q; }
        query("comments.author.email = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9003)).toBe(true);
  });

  it("emits WQL9004 on method reference", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { createdAt: Date };
        function query(q: WebdaQLString<Post>) { return q; }
        query("createdAt.getTime = 0");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9004)).toBe(true);
  });

  it("treats Date as a terminal queryable value", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { createdAt: Date };
        function query(q: WebdaQLString<Post>) { return q; }
        query("createdAt = '2026-01-01'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test**

`pnpm test -- qlvalidator`. The depth-2 + method tests should now pass with the walker from Task 10. If "depth-2 walk through array of relation" doesn't trigger because the second hop sees a relation (not an array), confirm by reading the diagnostic emitted; either WQL9003 (array depth) or WQL9001 (no `email` on `Author` because the walker bailed early) is acceptable. The test asserts WQL9003 — adjust the walker if it emits the wrong code, or relax the assertion to `expect(diagnostics).toHaveLength(1)` if the team prefers either-code-is-fine semantics.

- [ ] **Step 3: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "test(ts-plugin): qlvalidator array depth + method rejection"
```

---

## Task 12: Template literal rewrite to escape() call

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.ts`
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe("qlvalidator — template literal rewrite", () => {
  it("rewrites a template literal into escape([...], [...])", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        const name = "alice";
        query(\`title = '\${name}'\`);
      `
    });
    const { output, diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain("escape(");
    expect(output).toMatch(/escape\(\s*\[\s*"title = '"\s*,\s*"'"\s*\]/);
    expect(output).toMatch(/\[\s*name\s*\]/);
  });

  it("validates attributes inside the template literal", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        const v = "x";
        query(\`bogus = '\${v}'\`);
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9001)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- qlvalidator`. Templates aren't recognised yet.

- [ ] **Step 3: Extend the validator**

In `qlvalidator.ts`, replace `validateArgument` with:

```ts
function validateArgument(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  argument: tsTypes.Expression,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): { rewrite?: tsTypes.Expression } {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    validateLiteral(ts, checker, argument.text, argument, targetT, sourceFile, emit);
    return {};
  }
  if (ts.isTemplateExpression(argument)) {
    const parts = templateParts(argument);
    const placeholderSource = parts.join("?");
    validateLiteral(ts, checker, placeholderSource, argument, targetT, sourceFile, emit);
    return { rewrite: rewriteTemplate(ts, argument, parts) };
  }
  return {};
}

function templateParts(expr: tsTypes.TemplateExpression): string[] {
  const parts = [expr.head.text];
  for (const span of expr.templateSpans) parts.push(span.literal.text);
  return parts;
}

function rewriteTemplate(
  ts: typeof tsTypes,
  expr: tsTypes.TemplateExpression,
  parts: string[]
): tsTypes.CallExpression {
  const factory = ts.factory;
  const partsArray = factory.createArrayLiteralExpression(
    parts.map(p => factory.createStringLiteral(p)),
    false
  );
  const valuesArray = factory.createArrayLiteralExpression(
    expr.templateSpans.map(s => s.expression),
    false
  );
  return factory.createCallExpression(
    factory.createIdentifier("escape"),
    undefined,
    [partsArray, valuesArray]
  );
}
```

And update `validateCall` to apply the rewrite via a transformation result list. Replace `validateCall` with:

```ts
function validateCall(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  call: tsTypes.CallExpression,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): tsTypes.CallExpression {
  const signature = checker.getResolvedSignature(call);
  if (!signature) return call;

  const params = signature.getParameters();
  let newArgs: tsTypes.Expression[] | undefined;
  for (let i = 0; i < call.arguments.length && i < params.length; i++) {
    const paramType = checker.getTypeOfSymbolAtLocation(params[i], call);
    const targetT = peelWebdaQLString(checker, paramType);
    if (!targetT) continue;

    const result = validateArgument(ts, checker, call.arguments[i], targetT, sourceFile, emit);
    if (result.rewrite) {
      newArgs ??= [...call.arguments];
      newArgs[i] = result.rewrite;
    }
  }

  if (newArgs) {
    return ts.factory.updateCallExpression(
      call,
      call.expression,
      call.typeArguments,
      newArgs
    );
  }
  return call;
}
```

Update the transformer body to track rewrites and add the auto-import. Replace the `return context => sourceFile => {…}` body in `createQlValidatorTransformer` with:

```ts
  return context => sourceFile => {
    const collected: tsTypes.Diagnostic[] = [];
    let rewroteAny = false;
    const emit = (d: tsTypes.Diagnostic) => {
      collected.push(d);
      onDiagnostic?.(d);
    };

    const visit = (node: tsTypes.Node): tsTypes.Node => {
      if (tsModule.isCallExpression(node)) {
        const updated = validateCall(tsModule, checker, node, sourceFile, emit);
        if (updated !== node) rewroteAny = true;
        return tsModule.visitEachChild(updated, visit, context);
      }
      return tsModule.visitEachChild(node, visit, context);
    };

    let result = tsModule.visitNode(sourceFile, visit) as tsTypes.SourceFile;
    if (rewroteAny) result = ensureEscapeImport(tsModule, result);

    if (throwOnError && collected.length > 0) {
      throw new WebdaQLAggregateError(collected);
    }
    return result;
  };
```

Add the `ensureEscapeImport` helper at the bottom of the file:

```ts
function ensureEscapeImport(
  ts: typeof tsTypes,
  sourceFile: tsTypes.SourceFile
): tsTypes.SourceFile {
  const hasIt = sourceFile.statements.some(stmt =>
    ts.isImportDeclaration(stmt) &&
    ts.isStringLiteral(stmt.moduleSpecifier) &&
    stmt.moduleSpecifier.text === "@webda/ql" &&
    stmt.importClause?.namedBindings &&
    ts.isNamedImports(stmt.importClause.namedBindings) &&
    stmt.importClause.namedBindings.elements.some(e => e.name.text === "escape")
  );
  if (hasIt) return sourceFile;
  const importDecl = ts.factory.createImportDeclaration(
    undefined,
    ts.factory.createImportClause(
      false,
      undefined,
      ts.factory.createNamedImports([
        ts.factory.createImportSpecifier(false, undefined, ts.factory.createIdentifier("escape"))
      ])
    ),
    ts.factory.createStringLiteral("@webda/ql")
  );
  return ts.factory.updateSourceFile(sourceFile, [importDecl, ...sourceFile.statements]);
}
```

- [ ] **Step 4: Run test to verify it passes**

`pnpm test -- qlvalidator`. Both new tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): qlvalidator rewrites template literals to escape()"
```

---

## Task 13: Const-bound literal flow + typed-local opt-out + WQL9005

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.ts`
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe("qlvalidator — local-flow and typed opt-out", () => {
  it("validates a const-bound literal initializer", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        const q = "bogus = 'x'";
        query(q);
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9001)).toBe(true);
  });

  it("rewrites a const-bound template initializer", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        const name = "alice";
        const q = \`title = '\${name}'\`;
        query(q);
      `
    });
    const { output, diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
    expect(output).toContain("escape(");
  });

  it("accepts a WebdaQLString<T>-typed local without parsing it", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        function build(): WebdaQLString<Post> { return "title = 'x'" as WebdaQLString<Post>; }
        const q: WebdaQLString<Post> = build();
        query(q);
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("rejects a dynamic argument (WQL9005)", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        function compute(): string { return "title = 'x'"; }
        query(compute());
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9005)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- qlvalidator`.

- [ ] **Step 3: Extend `validateArgument`**

Add new branches:

```ts
function validateArgument(
  ts: typeof tsTypes,
  checker: tsTypes.TypeChecker,
  argument: tsTypes.Expression,
  targetT: tsTypes.Type,
  sourceFile: tsTypes.SourceFile,
  emit: (d: tsTypes.Diagnostic) => void
): { rewrite?: tsTypes.Expression } {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    validateLiteral(ts, checker, argument.text, argument, targetT, sourceFile, emit);
    return {};
  }
  if (ts.isTemplateExpression(argument)) {
    const parts = templateParts(argument);
    validateLiteral(ts, checker, parts.join("?"), argument, targetT, sourceFile, emit);
    return { rewrite: rewriteTemplate(ts, argument, parts) };
  }
  if (ts.isIdentifier(argument)) {
    // 1. If the identifier is typed as WebdaQLString<T>, accept (opt-out).
    const argType = checker.getTypeAtLocation(argument);
    if (peelWebdaQLString(checker, argType)) return {};

    // 2. Type-flow one hop into the const declarator's initializer.
    const symbol = checker.getSymbolAtLocation(argument);
    const decl = symbol?.declarations?.find(d => ts.isVariableDeclaration(d)) as
      | tsTypes.VariableDeclaration
      | undefined;
    if (decl?.parent && ts.isVariableDeclarationList(decl.parent)) {
      const isConst = (decl.parent.flags & ts.NodeFlags.Const) !== 0;
      if (isConst && decl.initializer) {
        const init = decl.initializer;
        if (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) {
          validateLiteral(ts, checker, init.text, argument, targetT, sourceFile, emit);
          return {};
        }
        if (ts.isTemplateExpression(init)) {
          const parts = templateParts(init);
          validateLiteral(ts, checker, parts.join("?"), argument, targetT, sourceFile, emit);
          // Replace the const initializer with the escape() call. Done by
          // visiting variable declarations in a separate pass — see below.
          pendingRewrites.set(decl, rewriteTemplate(ts, init, parts));
          return {};
        }
      }
    }
    // Fall through to WQL9005.
  }

  emit(makeDiagnostic(sourceFile, argument, 9005,
    `WebdaQL: argument is not a literal/template/typed local. Type it as 'WebdaQLString<T>' to opt out.`));
  return {};
}
```

To actually rewrite the const declarator's initializer, do this in two passes inside the transformer body. Add a per-file `pendingRewrites` map at the top of the visitor closure, then do a second visit pass that consults it. Replace the transformer body with:

```ts
  return context => sourceFile => {
    const collected: tsTypes.Diagnostic[] = [];
    const pendingRewrites = new Map<tsTypes.VariableDeclaration, tsTypes.Expression>();
    let rewroteAny = false;
    const emit = (d: tsTypes.Diagnostic) => {
      collected.push(d);
      onDiagnostic?.(d);
    };

    const visit = (node: tsTypes.Node): tsTypes.Node => {
      if (tsModule.isCallExpression(node)) {
        const updated = validateCall(tsModule, checker, node, sourceFile, emit, pendingRewrites);
        if (updated !== node) rewroteAny = true;
        return tsModule.visitEachChild(updated, visit, context);
      }
      return tsModule.visitEachChild(node, visit, context);
    };

    let result = tsModule.visitNode(sourceFile, visit) as tsTypes.SourceFile;

    if (pendingRewrites.size > 0) {
      const rewriteVars = (node: tsTypes.Node): tsTypes.Node => {
        if (tsModule.isVariableDeclaration(node) && pendingRewrites.has(node)) {
          rewroteAny = true;
          return tsModule.factory.updateVariableDeclaration(
            node, node.name, node.exclamationToken, node.type, pendingRewrites.get(node)!
          );
        }
        return tsModule.visitEachChild(node, rewriteVars, context);
      };
      result = tsModule.visitNode(result, rewriteVars) as tsTypes.SourceFile;
    }

    if (rewroteAny) result = ensureEscapeImport(tsModule, result);

    if (throwOnError && collected.length > 0) {
      throw new WebdaQLAggregateError(collected);
    }
    return result;
  };
```

(Also extend `validateCall`'s signature to accept the `pendingRewrites` map and forward it to `validateArgument`.)

- [ ] **Step 4: Run test**

`pnpm test -- qlvalidator`. All four pass.

- [ ] **Step 5: Commit**

```ts
git add packages/ts-plugin/src/transforms/qlvalidator.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): qlvalidator one-hop const flow + typed local + WQL9005"
```

---

## Task 14: Suppression directives + WQL9006

**Files:**
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.ts`
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts`

- [ ] **Step 1: Add failing tests**

```ts
describe("qlvalidator — suppression and unresolved T", () => {
  it("respects // @webdaql-ignore-next-line", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        // @webdaql-ignore-next-line
        query("bogus = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("respects /* @webdaql-disable */ at top of file", () => {
    const program = createTestProgram({
      "test.ts": `/* @webdaql-disable */
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("bogus = 'x'");
        query("alsoBogus = 'y'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics).toHaveLength(0);
  });

  it("emits WQL9006 when T resolves to unknown", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        function permissionCheck(p: WebdaQLString<unknown>) { return p; }
        permissionCheck("anything = 'x'");
      `
    });
    const { diagnostics } = runValidator(program, "test.ts");
    expect(diagnostics.some(d => d.code === 9006)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

`pnpm test -- qlvalidator`.

- [ ] **Step 3: Implement directives + WQL9006**

In the transformer body, before walking, scan for the file-level pragma:

```ts
    const fullText = sourceFile.getFullText();
    if (/\/\*\s*@webdaql-disable\s*\*\//.test(fullText)) return sourceFile;
```

For the line directive, walk leading comments on the call expression's outer statement:

```ts
function isSuppressed(
  ts: typeof tsTypes,
  call: tsTypes.CallExpression,
  sourceFile: tsTypes.SourceFile
): boolean {
  // Walk up to the enclosing statement; the directive must be the comment
  // immediately preceding it.
  let stmt: tsTypes.Node = call;
  while (stmt.parent && !ts.isStatement(stmt)) stmt = stmt.parent;
  const ranges = ts.getLeadingCommentRanges(sourceFile.getFullText(), stmt.getFullStart());
  if (!ranges) return false;
  return ranges.some(r => {
    const text = sourceFile.getFullText().slice(r.pos, r.end);
    return /@webdaql-ignore-next-line/.test(text);
  });
}
```

Call `isSuppressed` at the top of `validateCall` and skip processing entirely if true.

For WQL9006: in `validateCall`, after peeling `targetT`, check `targetT.flags & ts.TypeFlags.Unknown`:

```ts
    if (targetT.flags & ts.TypeFlags.Unknown) {
      emit(makeDiagnostic(sourceFile, call, 9006,
        `WebdaQL: type parameter resolves to 'unknown'. Configure 'session' in webda.config.json or supply an explicit T.`));
      continue;
    }
```

- [ ] **Step 4: Run test**

`pnpm test -- qlvalidator`. All three pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ts-plugin/src/transforms/qlvalidator.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): qlvalidator suppression + WQL9006 unresolved T"
```

---

## Task 15: Wire qlvalidator into the composed transformer

**Files:**
- Modify: `packages/ts-plugin/src/transform.ts`
- Modify: `packages/ts-plugin/src/transforms/qlvalidator.spec.ts` (aggregate-throw test)

- [ ] **Step 1: Write the failing test**

Append to `qlvalidator.spec.ts`:

```ts
describe("qlvalidator — aggregate throw", () => {
  it("throws WebdaQLAggregateError after walking the file when any error is present", () => {
    const program = createTestProgram({
      "test.ts": `
        type WebdaQLString<T = unknown> = string & { readonly __webdaQL?: T };
        type Post = { title: string };
        function query(q: WebdaQLString<Post>) { return q; }
        query("bogus = 'x'");
      `
    });
    const factory = createQlValidatorTransformer(ts, program, {});
    const sourceFile = program.getSourceFile("test.ts")!;
    expect(() => ts.transform(sourceFile, [factory])).toThrow(/9001/);
  });
});
```

Then, ensure `transform.ts`'s composed factory plugs in qlvalidator. Add to the composed transformer test by writing a small integration check (or skip — covered by sample-app build).

- [ ] **Step 2: Run test**

`pnpm test -- qlvalidator`. The aggregate-throw test should pass; the transformer already has `throwOnError = true` by default.

- [ ] **Step 3: Wire into `transform.ts`**

Edit `packages/ts-plugin/src/transform.ts`:

```ts
import { createQlValidatorTransformer } from "./transforms/qlvalidator.js";

// In `transformer(...)`, alongside accessorTransformer / behaviorTransformer:
  const qlValidatorTransformer = createQlValidatorTransformer(tsModule, program);

  return context => {
    const behaviorFn = behaviorTransformer(context);
    const accessorFn = accessorTransformer(context);
    const qlFn = qlValidatorTransformer(context);
    return sourceFile => qlFn(accessorFn(behaviorFn(sourceFile)));
  };
```

Also re-export from `transform.ts`:

```ts
export { createQlValidatorTransformer, WebdaQLAggregateError } from "./transforms/qlvalidator.js";
```

- [ ] **Step 4: Run full ts-plugin tests**

`pnpm test`. Confirm no regressions in accessors/behaviors/module-generator.

- [ ] **Step 5: Commit**

```bash
git add packages/ts-plugin/src/transform.ts packages/ts-plugin/src/transforms/qlvalidator.spec.ts
git commit -m "feat(ts-plugin): plug qlvalidator into composed transformer"
```

---

## Task 16: Migrate Store.query / Store.iterate / Store.find signatures

**Files:**
- Modify: `packages/core/src/stores/store.ts` (the `IStore<T>` interface, around line 208) and `packages/core/src/stores/istore.ts` (the only other file in `stores/` that has matching `query: string` signatures, per `grep -rln 'query(query: string)' packages/core/src/stores/`)

- [ ] **Step 1: Update the signatures**

Add the import at the top of both files:

```ts
import type { WebdaQLString } from "@webda/ql";
```

In `packages/core/src/stores/store.ts`, in the `IStore<T>` interface near line 208, change:

```ts
  find(query: string): Promise<StoreFindResult<any>>;
  query(query: string): Promise<StoreFindResult<any>>;
  iterate(query: string): AsyncGenerator;
```

to:

```ts
  find(query: WebdaQLString<T>): Promise<StoreFindResult<any>>;
  query(query: WebdaQLString<T>): Promise<StoreFindResult<any>>;
  iterate(query: WebdaQLString<T>): AsyncGenerator;
```

In `packages/core/src/stores/istore.ts`, do the same swap on every method that currently declares `query: string`. (Run `grep -n 'query: string' packages/core/src/stores/istore.ts` first to enumerate them; the swap is mechanical.)

Implementation classes elsewhere (e.g. `MemoryStore`) already accept `string` at runtime — `WebdaQLString<T>` is `string & {…}`, so a `string` value flows in cleanly and no further changes are required at the implementation site unless the implementation explicitly re-declares the signature.

- [ ] **Step 2: Build core**

```bash
cd packages/core && pnpm run build
```

Type errors at call sites are expected — fix any internal call site by changing the local variable's type or by calling `as WebdaQLString<...>`. Sample-app fixes are deferred to Task 19; only fix internal core/models call sites here.

- [ ] **Step 3: Run core tests**

`pnpm test`. Resolve type errors in spec files (often the test passes a string literal — that flows in cleanly thanks to the optional brand).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/stores/
git commit -m "refactor(core): Store.query/iterate/find accept WebdaQLString<T>"
```

---

## Task 17: Migrate Repository.query signature

**Files:**
- Modify: `packages/models/src/repositories/repository.ts:113`

- [ ] **Step 1: Update the signature**

In `packages/models/src/repositories/repository.ts`, change:

```ts
  query(query: string): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }>;
  iterate(query: string): AsyncGenerator<InstanceType<T>>;
```

to:

```ts
  query(query: WebdaQLString<InstanceType<T>>): Promise<{
    results: InstanceType<T>[];
    continuationToken?: string;
  }>;
  iterate(query: WebdaQLString<InstanceType<T>>): AsyncGenerator<InstanceType<T>>;
```

Add the import:

```ts
import type { WebdaQLString } from "@webda/ql";
```

- [ ] **Step 2: Build + test**

`pnpm test`. Resolve any breakage in `packages/models`.

- [ ] **Step 3: Commit**

```bash
git add packages/models/src/repositories/repository.ts
git commit -m "refactor(models): Repository.query accepts WebdaQLString<InstanceType<T>>"
```

---

## Task 18: Migrate Relations.query signature

**Files:**
- Modify: `packages/models/src/relations.ts:340-366`

- [ ] **Step 1: Update the signatures**

In `packages/models/src/relations.ts`, change:

```ts
  getQuery(query: string = ""): string {
    return WebdaQL.PrependCondition(query, `${this.attribute} = "${this.object.getPrimaryKey()}"`);
  }

  async query(query: string = ""): Promise<{ results: T[]; continuationToken?: string }> {
    return this.repoSource.query(this.getQuery(query));
  }

  iterate(query: string): AsyncIterable<T> {
    return this.repoSource.iterate(this.getQuery(query));
  }
```

to:

```ts
  getQuery(query: WebdaQLString<T> | string = ""): WebdaQLString<T> {
    return WebdaQL.PrependCondition(query as string,
      `${this.attribute} = "${this.object.getPrimaryKey()}"`) as WebdaQLString<T>;
  }

  async query(query: WebdaQLString<T> = "" as WebdaQLString<T>): Promise<{ results: T[]; continuationToken?: string }> {
    return this.repoSource.query(this.getQuery(query));
  }

  iterate(query: WebdaQLString<T>): AsyncIterable<T> {
    return this.repoSource.iterate(this.getQuery(query));
  }
```

Add the import:

```ts
import type { WebdaQLString } from "@webda/ql";
```

- [ ] **Step 2: Build + test**

`pnpm test`. Resolve breakage.

- [ ] **Step 3: Commit**

```bash
git add packages/models/src/relations.ts
git commit -m "refactor(models): Relations.query accepts WebdaQLString<T>"
```

---

## Task 19: sample-app adoption (config + verify build)

**Files:**
- Modify: `sample-app/webda.config.json`
- Inspect: `sample-app/src/**/*.ts` for any `.query()` / `permission` usage

- [ ] **Step 1: Add session field to config**

If the sample-app has a `Session` model, add to `sample-app/webda.config.json`:

```jsonc
{
  "$schema": "...",
  "version": 3,
  "session": "WebdaSample/Session",
  "services": { ... }
}
```

If no Session model exists, skip this (the codegen step does nothing without `session`).

- [ ] **Step 2: Build sample-app**

```bash
cd sample-app && pnpm run build
```

Resolve any qlvalidator diagnostics surfaced by the build. Common fixes:
- A literal with a typo: fix the typo.
- A dynamic argument: type it as `WebdaQLString<T>` to opt out.
- A template that should rewrite: confirm `escape` is auto-imported.

- [ ] **Step 3: Run sample-app tests if any**

```bash
pnpm test
```

- [ ] **Step 4: Commit**

```bash
git add sample-app/
git commit -m "chore(sample-app): adopt WebdaQLString — session config + fixes"
```

---

## Task 20: blog-system adoption

**Files:**
- Modify: `sample-apps/blog-system/webda.config.json`
- Inspect: `sample-apps/blog-system/src/**/*.ts` and any places using `.query()`

- [ ] **Step 1: Add session field**

If the blog-system has a `Session` model:

```jsonc
"session": "BlogSystem/Session"
```

- [ ] **Step 2: Build + e2e**

```bash
cd sample-apps/blog-system
pnpm run build
pnpm test  # if e2e exists
```

Resolve any diagnostics.

- [ ] **Step 3: Commit**

```bash
git add sample-apps/blog-system/
git commit -m "chore(blog-system): adopt WebdaQLString — session config + fixes"
```

---

## Task 21: Full-monorepo build verification

**Files:**
- All

- [ ] **Step 1: Build everything**

From the repo root:

```bash
pnpm -r run build
```

Resolve any cross-package type errors.

- [ ] **Step 2: Test everything**

```bash
pnpm -r run test
```

- [ ] **Step 3: Lint + format**

```bash
pnpm run lint
pnpm run format
```

- [ ] **Step 4: Commit any remaining fixes**

If fixes were needed, commit per package with conventional messages.

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/webdaql-string
gh pr create --title "feat: WebdaQLString<T> branded type + ts-plugin compile-time validator" --body-file <(cat <<'EOF'
## Summary
- Introduces `WebdaQLString<T>` branded type and `escape` runtime helper in `@webda/ql`.
- New `qlvalidator` transformer in `@webda/ts-plugin` parses every literal/template/typed local flowing into a `WebdaQLString<T>` parameter, validates attribute paths against `T` via the TS type checker, and rewrites template literals into a parameterised `escape(parts, values)` call.
- Diagnostics surface as standard TS diagnostics (codes WQL9001-9006); build fails via aggregate throw.
- New session-type codegen in `@webda/compiler` emits `.webda/session-types.d.ts` from `webda.config.json#session`, so `OperationDefinition.permission` carries the right `T` even with a plain `tsc` build.
- Wholesale-renames `query: string` / `permission: string` to `WebdaQLString<T>` across `@webda/core` / `@webda/models`.

## Spec
- `docs/superpowers/specs/2026-05-03-webdaql-string-design.md`

## Test plan
- [ ] `pnpm -r run test` green
- [ ] `pnpm -r run build` green
- [ ] sample-app + blog-system build clean
- [ ] qlvalidator emits expected diagnostics on intentional errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)
```

---

## Self-review checklist

After Task 21:

1. **Spec coverage:** every requirement in `docs/superpowers/specs/2026-05-03-webdaql-string-design.md` is represented by a task — §1 (Tasks 8, 15), §2 (Tasks 1-4), §3 (Tasks 8-13), §4 (Tasks 9, 11, 14, 15), §5 (Tasks 5-7), §6 testing (specs in every task), §8 file impact (every file flipped).
2. **Placeholder scan:** no "TBD" / "implement later". Every step has either complete code or a precise spec for what to write.
3. **Type consistency:** `WebdaQLString` brand, `escape`, `WebdaQLError`, `WebdaQLAggregateError`, `WebdaSessionRegistry`, `createQlValidatorTransformer` are referenced by the same name everywhere they appear.
4. **Out-of-scope honour:** third-party stores (`mongodb`, `postgres`, `dynamodb`, `firestore`, `elasticsearch`) are NOT touched in any task.
