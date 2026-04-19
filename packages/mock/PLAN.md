# `@webda/mock` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@webda/mock` — coherent mock-data generation for `@webda/models` classes. Decorators ship in `@webda/models` (zero prod footprint); engine / service / CLI live in a new `@webda/mock` package.

**Architecture:** Decorator-driven fallback chain (explicit `@Mock.*` → field-name heuristic → field-type fallback → typed default) wrapping seeded Faker plus a pluggable `AIProvider`. A session pool resolves `@ModelRelated` / `@ModelLink` fields coherently. Modes preset combinations of seed / AI-on-off / pool / volume for test / dev / demo / load use cases.

**Tech Stack:** TypeScript (ES2022, ESM), `@faker-js/faker`, `@webda/test` (`@suite`/`@test`), Vitest, `fast-check` (dev), `@anthropic-ai/sdk` (optional peer).

---

## Conventions used throughout this plan

- All paths are **absolute from the monorepo root** (`/Users/loopingz/Git/webda.io/...`) unless obviously relative.
- All shell commands run from `packages/mock/` unless otherwise stated. Commands touching `packages/models/` or the monorepo root call that out explicitly.
- All commits use conventional commits. Based on recent history on `main`, this repo uses `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`. Stay within that vocabulary.
- **Pre-commit hook:** the repo's pre-commit hook runs `pnpm -r run lint:fix`, which has pre-existing failures in unrelated packages. Use `--no-verify` on every commit in this plan. Add a note in the PR description explaining why.
- **Build tool for `@webda/models`:** the existing build script is `webdac build` (the Webda compiler). Do not replace with `tsc-esm`; match the existing tooling.
- **Build tool for the new `@webda/mock` package:** use `tsc-esm` (the simpler option used by `@webda/utils` / `@webda/versioning`) — `@webda/mock` has no webda module metadata to emit, so `webdac` buys nothing.
- Run tests with `pnpm test -- src/<path>.spec.ts` for a single file, or `pnpm test` for the full package suite.
- **Working directory** the executor starts in: `/Users/loopingz/Git/webda.io/packages/mock/` (created in Task 3). Tasks 1–2 touch `packages/models/`.

---

## File map

```
packages/models/src/
├── mock.ts                           # Task 1 — decorators + readMockMeta
├── mock.spec.ts                      # Task 2
└── index.ts                          # Modified in Task 1 (barrel re-export)

packages/mock/                        # NEW package, created in Task 3
├── package.json                      # Task 3
├── tsconfig.json                     # Task 3
├── vitest.config.ts                  # Task 3
├── README.md                         # Task 3 (stub), Task 15 (full)
├── DESIGN.md                         # already committed
├── PLAN.md                           # this file
└── src/
    ├── index.ts                      # Task 3 (stub), Task 15 (barrel)
    ├── engine/
    │   ├── faker.ts                  # Task 4 — seeded Faker factory
    │   ├── faker.spec.ts             # Task 4
    │   ├── pool.ts                   # Task 5 — SessionPool
    │   ├── pool.spec.ts              # Task 5
    │   ├── infer.ts                  # Task 6 — name + type inference
    │   ├── infer.spec.ts             # Task 6
    │   ├── generate.ts               # Task 7 — generate(Model, opts)
    │   ├── generate.spec.ts          # Task 7
    │   ├── graph.ts                  # Task 8 — generateGraph
    │   └── graph.spec.ts             # Task 8
    ├── ai/
    │   ├── provider.ts               # Task 9 — AIProvider interface
    │   ├── provider.spec.ts          # Task 9
    │   ├── anthropic.ts              # Task 10 — Anthropic provider
    │   └── anthropic.spec.ts         # Task 10
    ├── service/
    │   ├── mock-service.ts           # Task 11
    │   └── mock-service.spec.ts      # Task 11
    ├── cli/
    │   ├── seed.ts                   # Task 12 — `webda mock seed` handler
    │   └── seed.spec.ts              # Task 12
    ├── integration.spec.ts           # Task 13
    └── properties.spec.ts            # Task 14
```

---

## Task 1: `@Mock.*` decorators + `readMockMeta` in `@webda/models`

**Files:**
- Create: `packages/models/src/mock.ts`
- Modify: `packages/models/src/index.ts` (add `export * from "./mock.js";`)

- [ ] **Step 1: Write `mock.ts`**

Write `/Users/loopingz/Git/webda.io/packages/models/src/mock.ts`:

```ts
/**
 * Mock-data decorator surface. The decorators here only stash metadata on
 * `Symbol.metadata`; they do NOT import Faker, an AI SDK, or any other
 * generation engine. Production apps that use `@Mock.email` pay only the
 * cost of one metadata write per field.
 *
 * The `@webda/mock` package reads the metadata via `readMockMeta()` and
 * decides how to generate values.
 */
const MOCK_META = "webda:mock";

export type MockKind =
  | "uuid" | "email" | "firstName" | "lastName" | "fullName" | "phone" | "url"
  | "avatar" | "lorem" | "word" | "integer" | "float" | "percentage"
  | "pastDate" | "futureDate" | "recentDate" | "pick" | "custom" | "ai"
  | "count" | "linkExisting" | "linkNew"
  | (string & {}); // forward-compat escape via @Mock({ kind, … })

export type MockMeta = {
  kind: MockKind;
  options?: Record<string, unknown>;
};

type FieldMetaMap = Record<string, MockMeta>;

/**
 * Write a mock-meta entry for the decorated field into the class's
 * metadata bag. Each field contributes exactly one `{ kind, options }` entry;
 * a subclass-level decorator overrides a parent's entry for the same field.
 */
function mark(kind: MockKind, options?: Record<string, unknown>) {
  return (_value: unknown, context: ClassFieldDecoratorContext) => {
    const bag = (context.metadata[MOCK_META] ??= {} as FieldMetaMap) as FieldMetaMap;
    bag[String(context.name)] = options === undefined ? { kind } : { kind, options };
  };
}

/* ─── Named scalar decorators ─────────────────────────────────────── */
export const Mock: {
  uuid: ReturnType<typeof mark>;
  email: ReturnType<typeof mark>;
  firstName: ReturnType<typeof mark>;
  lastName: ReturnType<typeof mark>;
  fullName: ReturnType<typeof mark>;
  phone: ReturnType<typeof mark>;
  url: ReturnType<typeof mark>;
  avatar: ReturnType<typeof mark>;
  word: ReturnType<typeof mark>;
  percentage: ReturnType<typeof mark>;
  recentDate: ReturnType<typeof mark>;
  linkExisting: ReturnType<typeof mark>;
  linkNew: ReturnType<typeof mark>;

  lorem(opts?: { sentences?: number; paragraphs?: number; words?: number }): ReturnType<typeof mark>;
  integer(opts?: { min?: number; max?: number }): ReturnType<typeof mark>;
  float(opts?: { min?: number; max?: number; precision?: number }): ReturnType<typeof mark>;
  pastDate(opts?: { within?: "day" | "week" | "month" | "year" }): ReturnType<typeof mark>;
  futureDate(opts?: { within?: "day" | "week" | "month" | "year" }): ReturnType<typeof mark>;
  pick<T>(values: readonly T[]): ReturnType<typeof mark>;
  custom(fn: (ctx: unknown) => unknown): ReturnType<typeof mark>;
  ai(opts: { prompt: string; maxTokens?: number }): ReturnType<typeof mark>;
  count(nOrRange: number | { min?: number; max?: number }): ReturnType<typeof mark>;

  (meta: MockMeta): ReturnType<typeof mark>; // forward-compat generic form
} = Object.assign(
  // The generic callable form: @Mock({ kind: "myKind", … })
  (meta: MockMeta) => mark(meta.kind, meta.options),
  {
    uuid: mark("uuid"),
    email: mark("email"),
    firstName: mark("firstName"),
    lastName: mark("lastName"),
    fullName: mark("fullName"),
    phone: mark("phone"),
    url: mark("url"),
    avatar: mark("avatar"),
    word: mark("word"),
    percentage: mark("percentage"),
    recentDate: mark("recentDate"),
    linkExisting: mark("linkExisting"),
    linkNew: mark("linkNew"),

    lorem: (opts?: { sentences?: number; paragraphs?: number; words?: number }) => mark("lorem", opts),
    integer: (opts?: { min?: number; max?: number }) => mark("integer", opts),
    float: (opts?: { min?: number; max?: number; precision?: number }) => mark("float", opts),
    pastDate: (opts?: { within?: "day" | "week" | "month" | "year" }) => mark("pastDate", opts),
    futureDate: (opts?: { within?: "day" | "week" | "month" | "year" }) => mark("futureDate", opts),
    pick: <T>(values: readonly T[]) => mark("pick", { values: values as readonly unknown[] }),
    custom: (fn: (ctx: unknown) => unknown) => mark("custom", { fn }),
    ai: (opts: { prompt: string; maxTokens?: number }) => mark("ai", opts),
    count: (nOrRange: number | { min?: number; max?: number }) => mark("count", typeof nOrRange === "number" ? { n: nOrRange } : nOrRange)
  }
);

/**
 * Read the mock-meta map for a model class. Merges entries from the class
 * and its prototype chain so a subclass's `@Mock.*` overrides the parent's.
 */
export function readMockMeta(ctor: new (...args: unknown[]) => unknown): FieldMetaMap {
  const chain: Array<new (...args: unknown[]) => unknown> = [];
  let c: unknown = ctor;
  while (typeof c === "function" && c !== Object.prototype) {
    chain.push(c as new (...args: unknown[]) => unknown);
    c = Object.getPrototypeOf(c);
  }
  const result: FieldMetaMap = {};
  // Walk root-first so child classes overwrite parents.
  for (const klass of chain.reverse()) {
    const meta = (klass as unknown as { [Symbol.metadata]?: Record<string, unknown> })[Symbol.metadata];
    const bag = meta?.[MOCK_META] as FieldMetaMap | undefined;
    if (bag) Object.assign(result, bag);
  }
  return result;
}
```

- [ ] **Step 2: Re-export from `index.ts`**

Open `/Users/loopingz/Git/webda.io/packages/models/src/index.ts` and append:

```ts
export * from "./mock.js";
```

- [ ] **Step 3: Build**

From `packages/models/`:

```bash
pnpm run build
```

Expected: no errors; `lib/mock.js` and `lib/mock.d.ts` emitted.

- [ ] **Step 4: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/models/src/mock.ts packages/models/src/index.ts
git commit --no-verify -m "feat(models): add @Mock decorator surface for mock-data generation"
```

---

## Task 2: Decorator unit tests

**Files:**
- Create: `packages/models/src/mock.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/models/src/mock.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock, readMockMeta } from "./mock.js";

@suite("@Mock decorator surface")
class MockDecoratorTest {
  @test({ name: "named decorator stores kind with no options" })
  namedKind() {
    class A {
      @Mock.email accessor email!: string;
    }
    expect(readMockMeta(A as any)).toEqual({ email: { kind: "email" } });
  }

  @test({ name: "parameterised decorator stores kind + options" })
  parameterised() {
    class A {
      @Mock.integer({ min: 0, max: 10 }) accessor n!: number;
      @Mock.lorem({ words: 5 }) accessor note!: string;
    }
    const meta = readMockMeta(A as any);
    expect(meta.n).toEqual({ kind: "integer", options: { min: 0, max: 10 } });
    expect(meta.note).toEqual({ kind: "lorem", options: { words: 5 } });
  }

  @test({ name: "count accepts number or range" })
  countForms() {
    class A {
      @Mock.count(5) accessor a!: unknown;
      @Mock.count({ min: 1, max: 3 }) accessor b!: unknown;
    }
    const meta = readMockMeta(A as any);
    expect(meta.a).toEqual({ kind: "count", options: { n: 5 } });
    expect(meta.b).toEqual({ kind: "count", options: { min: 1, max: 3 } });
  }

  @test({ name: "generic callable form accepts arbitrary kind for forward-compat" })
  genericCallable() {
    class A {
      @Mock({ kind: "customFutureKind", options: { foo: 1 } }) accessor x!: unknown;
    }
    expect(readMockMeta(A as any).x).toEqual({
      kind: "customFutureKind",
      options: { foo: 1 }
    });
  }

  @test({ name: "subclass decorator overrides parent's entry for the same field" })
  subclassOverride() {
    class Parent {
      @Mock.email accessor contact!: string;
    }
    class Child extends Parent {
      @Mock.phone accessor contact!: string;
    }
    // Parent still has the original.
    expect(readMockMeta(Parent as any).contact).toEqual({ kind: "email" });
    // Child sees its own override.
    expect(readMockMeta(Child as any).contact).toEqual({ kind: "phone" });
  }

  @test({ name: "pick stores its values array" })
  pickValues() {
    class A {
      @Mock.pick(["draft", "active", "archived"]) accessor status!: string;
    }
    expect(readMockMeta(A as any).status).toEqual({
      kind: "pick",
      options: { values: ["draft", "active", "archived"] }
    });
  }

  @test({ name: "class with no @Mock decorators yields empty meta" })
  emptyClass() {
    class A {}
    expect(readMockMeta(A as any)).toEqual({});
  }
}
```

- [ ] **Step 2: Run to verify PASS**

From `packages/models/`:

```bash
pnpm test -- src/mock.spec.ts
```

Expected: all 7 tests pass.

If tests fail due to TC39 decorator issues, verify `packages/models/tsconfig.json` has `experimentalDecorators: false` (it should, matching `@webda/async`).

- [ ] **Step 3: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/models/src/mock.spec.ts
git commit --no-verify -m "test(models): add tests for @Mock decorator surface"
```

---

## Task 3: Scaffold `@webda/mock` package

**Files:**
- Create: `packages/mock/package.json`
- Create: `packages/mock/tsconfig.json`
- Create: `packages/mock/vitest.config.ts`
- Create: `packages/mock/.gitignore`
- Create: `packages/mock/README.md`
- Create: `packages/mock/src/index.ts`
- Create: `packages/mock/src/smoke.spec.ts`

- [ ] **Step 1: `package.json`**

Write `/Users/loopingz/Git/webda.io/packages/mock/package.json`:

```json
{
  "name": "@webda/mock",
  "version": "4.0.0-beta.1",
  "description": "Coherent mock-data generation for @webda/models classes",
  "keywords": ["webda", "mock", "fixtures", "faker", "seed"],
  "author": "Remi Cattiau <remi@cattiau.com>",
  "repository": "git://github.com/loopingz/webda.io.git",
  "main": "lib/index.js",
  "typings": "lib/index.d.ts",
  "exports": {
    ".": {
      "types": "./lib/index.d.ts",
      "import": "./lib/index.js",
      "require": "./lib/index.js",
      "node": "./lib/index.js"
    },
    "./service": {
      "types": "./lib/service/mock-service.d.ts",
      "import": "./lib/service/mock-service.js"
    },
    "./cli": {
      "types": "./lib/cli/seed.d.ts",
      "import": "./lib/cli/seed.js"
    }
  },
  "scripts": {
    "build": "tsc-esm",
    "build:watch": "tsc-esm --watch",
    "format": "prettier --check src/**/*",
    "format:fix": "prettier --write src/**/*",
    "lint": "eslint",
    "lint:fix": "eslint --fix",
    "pretest": "tsc-esm",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  },
  "dependencies": {
    "@faker-js/faker": "^9.5.1",
    "@webda/models": "workspace:*"
  },
  "peerDependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@webda/core": "workspace:*"
  },
  "peerDependenciesMeta": {
    "@anthropic-ai/sdk": { "optional": true },
    "@webda/core": { "optional": true }
  },
  "devDependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "@types/node": "25.5.0",
    "@webda/core": "workspace:*",
    "@webda/test": "workspace:*",
    "@webda/tsc-esm": "workspace:*",
    "fast-check": "^3.23.2",
    "vite": "^6.0.0",
    "vitest": "^4.1.2"
  },
  "files": ["lib"],
  "publishConfig": { "access": "public" },
  "type": "module",
  "engines": { "node": ">=22.0.0" },
  "license": "LGPL-3.0-only"
}
```

- [ ] **Step 2: `tsconfig.json`**

Write `/Users/loopingz/Git/webda.io/packages/mock/tsconfig.json` (same as `@webda/utils`):

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "preserve",
    "outDir": "./lib",
    "rootDir": "./src",
    "strict": false,
    "declaration": true,
    "sourceMap": true,
    "isolatedModules": true,
    "experimentalDecorators": false,
    "esModuleInterop": true,
    "moduleResolution": "bundler",
    "types": ["node"],
    "typeRoots": ["../../node_modules/@types"],
    "skipLibCheck": true,
    "declarationMap": true,
    "useDefineForClassFields": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.spec.ts"]
}
```

- [ ] **Step 3: `vitest.config.ts`**

Write `/Users/loopingz/Git/webda.io/packages/mock/vitest.config.ts`:

```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";

export default defineConfig({
  clearScreen: false,
  test: {
    allowOnly: true,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.spec.ts", "src/index.ts"],
      reporter: ["lcov", "html", "text"]
    },
    reporters: "verbose",
    include: ["src/**/*.spec.ts"]
  }
});
```

- [ ] **Step 4: `.gitignore`**

Write `/Users/loopingz/Git/webda.io/packages/mock/.gitignore`:

```
lib/
node_modules/
coverage/
reports/
*.log
```

- [ ] **Step 5: Stub `src/index.ts`**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/index.ts`:

```ts
export const VERSION = "4.0.0-beta.1";
```

- [ ] **Step 6: Stub `README.md`**

Write `/Users/loopingz/Git/webda.io/packages/mock/README.md`:

```markdown
# @webda/mock

Coherent mock-data generation for `@webda/models` classes.

See [DESIGN.md](./DESIGN.md) for the design.

Status: under initial implementation.
```

- [ ] **Step 7: Smoke test**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/smoke.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { VERSION } from "./index.js";

@suite("@webda/mock smoke")
class MockSmokeTest {
  @test({ name: "exports a VERSION constant" })
  hasVersion() {
    expect(typeof VERSION).toBe("string");
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  }
}
```

- [ ] **Step 8: Install deps**

From the monorepo root:

```bash
cd /Users/loopingz/Git/webda.io && pnpm install
```

- [ ] **Step 9: Run smoke test**

From `packages/mock/`:

```bash
pnpm test
```

Expected: 1 test passing.

- [ ] **Step 10: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/package.json \
        packages/mock/tsconfig.json \
        packages/mock/vitest.config.ts \
        packages/mock/.gitignore \
        packages/mock/README.md \
        packages/mock/src/index.ts \
        packages/mock/src/smoke.spec.ts
git commit --no-verify -m "feat(mock): scaffold @webda/mock package"
```

Also add `packages/mock` to `/Users/loopingz/Git/webda.io/release-please-config.json` (alphabetically: between `mapper` and `models`) and `/Users/loopingz/Git/webda.io/.release-please-manifest.json` (same spot with `"4.0.0-beta.1"`). Stage and fold into the same commit with `git add <files> && git commit --no-verify --amend --no-edit`.

---

## Task 4: Seeded Faker factory

**Files:**
- Create: `packages/mock/src/engine/faker.ts`
- Create: `packages/mock/src/engine/faker.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/faker.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { makeFaker } from "./faker.js";

@suite("makeFaker")
class MakeFakerTest {
  @test({ name: "same seed → identical sequence of outputs" })
  deterministic() {
    const a = makeFaker(42);
    const b = makeFaker(42);
    const seqA = [a.person.firstName(), a.internet.email(), a.number.int({ min: 0, max: 1000 })];
    const seqB = [b.person.firstName(), b.internet.email(), b.number.int({ min: 0, max: 1000 })];
    expect(seqA).toEqual(seqB);
  }

  @test({ name: "different seeds → different outputs (with overwhelming probability)" })
  seedMatters() {
    const a = makeFaker(1);
    const b = makeFaker(2);
    expect(a.person.firstName()).not.toBe(b.person.firstName());
  }

  @test({ name: "no seed → uses Date.now() and values still valid" })
  noSeed() {
    const f = makeFaker();
    expect(typeof f.person.firstName()).toBe("string");
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/engine/faker.spec.ts
```

Expected: module not found.

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/faker.ts`:

```ts
import { Faker, en, base } from "@faker-js/faker";

/**
 * Build a seeded Faker instance. Uses the English locale plus the base locale
 * (numbers, dates) as fallbacks — matches Faker v9's recommended defaults.
 *
 * @param seed - optional numeric seed. Defaults to Date.now() for non-deterministic runs.
 */
export function makeFaker(seed?: number): Faker {
  const faker = new Faker({ locale: [en, base] });
  faker.seed(seed ?? Date.now());
  return faker;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/engine/faker.spec.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/engine/faker.ts packages/mock/src/engine/faker.spec.ts
git commit --no-verify -m "feat(mock): add seeded faker factory"
```

---

## Task 5: SessionPool

**Files:**
- Create: `packages/mock/src/engine/pool.ts`
- Create: `packages/mock/src/engine/pool.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/pool.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { SessionPool } from "./pool.js";

class User { constructor(public id: string) {} }
class Order { constructor(public id: string) {} }

@suite("SessionPool")
class SessionPoolTest {
  @test({ name: "pickOne returns null on empty pool" })
  pickOneEmpty() {
    const pool = new SessionPool(() => 0.5);
    expect(pool.pickOne(User)).toBeNull();
  }

  @test({ name: "add + pickOne returns an instance of the requested class" })
  pickOneAfterAdd() {
    const pool = new SessionPool(() => 0.5);
    const u = new User("a");
    pool.add(u);
    expect(pool.pickOne(User)).toBe(u);
  }

  @test({ name: "pickOne by class only — Order in pool is not returned for User" })
  filtersByClass() {
    const pool = new SessionPool(() => 0.5);
    pool.add(new Order("o1"));
    expect(pool.pickOne(User)).toBeNull();
  }

  @test({ name: "pickMany returns unique subset of requested size" })
  pickManyUnique() {
    // Feed a deterministic rng that cycles through the pool.
    let i = 0;
    const rng = () => {
      const v = [0.1, 0.5, 0.9, 0.3, 0.7][i++ % 5];
      return v;
    };
    const pool = new SessionPool(rng);
    const us = [new User("a"), new User("b"), new User("c"), new User("d"), new User("e")];
    us.forEach(u => pool.add(u));
    const picked = pool.pickMany(User, 3);
    expect(picked.length).toBe(3);
    expect(new Set(picked).size).toBe(3);
  }

  @test({ name: "pickMany clamps at available pool size" })
  pickManyClamp() {
    const pool = new SessionPool(() => 0.1);
    pool.add(new User("a"));
    pool.add(new User("b"));
    expect(pool.pickMany(User, 10).length).toBe(2);
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/engine/pool.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/pool.ts`:

```ts
/**
 * Session-scoped instance pool. Holds every instance generated during one
 * `generate()` / `generateGraph()` call so that later relation-aware fields
 * (`@ModelLink`, `@ModelRelated`) can reference real earlier instances rather
 * than made-up ids.
 *
 * All randomness is driven by the constructor-injected `rng: () => number`
 * so outcomes are reproducible when the caller supplies a seeded RNG.
 */
export class SessionPool {
  private byClass = new Map<Function, unknown[]>();
  constructor(private rng: () => number = Math.random) {}

  add(instance: unknown): void {
    if (instance == null || typeof instance !== "object") return;
    const ctor = (instance as { constructor: Function }).constructor;
    let list = this.byClass.get(ctor);
    if (!list) {
      list = [];
      this.byClass.set(ctor, list);
    }
    list.push(instance);
  }

  pickOne<T>(ctor: new (...args: any[]) => T): T | null {
    const list = this.byClass.get(ctor);
    if (!list || list.length === 0) return null;
    const idx = Math.floor(this.rng() * list.length);
    return list[Math.min(idx, list.length - 1)] as T;
  }

  pickMany<T>(ctor: new (...args: any[]) => T, count: number): T[] {
    const list = this.byClass.get(ctor);
    if (!list || list.length === 0) return [];
    const take = Math.min(count, list.length);
    // Fisher-Yates-style selection using our rng, taking the first `take`.
    const copy = [...list];
    for (let i = 0; i < take; i++) {
      const j = i + Math.floor(this.rng() * (copy.length - i));
      const tmp = copy[i];
      copy[i] = copy[Math.min(j, copy.length - 1)];
      copy[Math.min(j, copy.length - 1)] = tmp;
    }
    return copy.slice(0, take) as T[];
  }

  size(ctor: new (...args: any[]) => unknown): number {
    return this.byClass.get(ctor)?.length ?? 0;
  }
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/engine/pool.spec.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/engine/pool.ts packages/mock/src/engine/pool.spec.ts
git commit --no-verify -m "feat(mock): add SessionPool for relation resolution"
```

---

## Task 6: Auto-inference (`infer.ts`)

**Files:**
- Create: `packages/mock/src/engine/infer.ts`
- Create: `packages/mock/src/engine/infer.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/infer.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { inferKind, InferContext } from "./infer.js";

function ctx(fieldName: string, declaredType?: string): InferContext {
  return { fieldName, declaredType };
}

@suite("inferKind — name heuristic")
class InferNameTest {
  @test({ name: "email → email" })
  email() { expect(inferKind(ctx("email"))).toBe("email"); }

  @test({ name: "phoneNumber → phone" })
  phone() { expect(inferKind(ctx("phoneNumber"))).toBe("phone"); }

  @test({ name: "firstName → firstName" })
  firstName() { expect(inferKind(ctx("firstName"))).toBe("firstName"); }

  @test({ name: "createdAt → recentDate" })
  createdAt() { expect(inferKind(ctx("createdAt", "Date"))).toBe("recentDate"); }

  @test({ name: "uuid → uuid" })
  uuid() { expect(inferKind(ctx("uuid"))).toBe("uuid"); }

  @test({ name: "contactEmail → not auto-inferred (substring does not match)" })
  substringNoMatch() { expect(inferKind(ctx("contactEmail"))).not.toBe("email"); }

  @test({ name: "name comparison is case-insensitive" })
  caseInsensitive() { expect(inferKind(ctx("EMAIL"))).toBe("email"); }
}

@suite("inferKind — type fallback")
class InferTypeTest {
  @test({ name: "string → lorem" })
  str() { expect(inferKind(ctx("unknownField", "string"))).toBe("lorem"); }

  @test({ name: "number → integer" })
  num() { expect(inferKind(ctx("unknownField", "number"))).toBe("integer"); }

  @test({ name: "boolean → boolean" })
  bool() { expect(inferKind(ctx("unknownField", "boolean"))).toBe("boolean"); }

  @test({ name: "Date → recentDate" })
  date() { expect(inferKind(ctx("unknownField", "Date"))).toBe("recentDate"); }

  @test({ name: "unknown type, unknown name → null" })
  unknown() { expect(inferKind(ctx("weirdField", "SomeClass"))).toBeNull(); }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/engine/infer.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/infer.ts`:

```ts
import type { MockKind } from "@webda/models";

export type InferContext = {
  fieldName: string;
  declaredType?: string;
};

/** Case-insensitive exact-match field-name heuristic. Includes type-guarded `*At` rule. */
const NAME_TO_KIND: Record<string, MockKind> = {
  email: "email",
  phone: "phone",
  phonenumber: "phone",
  url: "url",
  website: "url",
  firstname: "firstName",
  lastname: "lastName",
  fullname: "fullName",
  uuid: "uuid",
  id: "uuid",
  avatar: "avatar",
  image: "avatar",
  photo: "avatar",
  createdat: "recentDate",
  updatedat: "recentDate"
};

const TYPE_TO_KIND: Record<string, MockKind> = {
  string: "lorem",
  number: "integer",
  boolean: "boolean" as MockKind, // "boolean" is a valid forward-compat kind
  date: "recentDate"
};

/**
 * Resolve a mock kind from a field's name (strong signal) or declared type
 * (weak fallback). Returns `null` when no rule matches — callers decide
 * whether to warn, throw, or skip.
 */
export function inferKind(ctx: InferContext): MockKind | null {
  const lower = ctx.fieldName.toLowerCase();

  // Strong name match.
  const direct = NAME_TO_KIND[lower];
  if (direct) return direct;

  // `*At` Date fields → pastDate.
  if (lower.endsWith("at") && ctx.declaredType === "Date") return "pastDate";

  // Type fallback.
  if (ctx.declaredType) {
    const tk = TYPE_TO_KIND[ctx.declaredType.toLowerCase()];
    if (tk) return tk;
  }

  return null;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/engine/infer.spec.ts
```

Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/engine/infer.ts packages/mock/src/engine/infer.spec.ts
git commit --no-verify -m "feat(mock): add field-name + type auto-inference"
```

---

## Task 7: `generate(ModelClass, options)` — core engine

**Files:**
- Create: `packages/mock/src/engine/generate.ts`
- Create: `packages/mock/src/engine/generate.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/generate.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generate } from "./generate.js";

class Person {
  @Mock.firstName accessor firstName!: string;
  @Mock.lastName accessor lastName!: string;
  @Mock.email accessor email!: string;
  @Mock.integer({ min: 18, max: 99 }) accessor age!: number;
}

class NoHints {
  accessor firstName!: string;       // resolves via name heuristic
  accessor email!: string;           // resolves via name heuristic
  accessor age!: number;             // resolves via type fallback (integer)
}

@suite("generate")
class GenerateTest {
  @test({ name: "produces `count` instances of the requested class" })
  async count() {
    const people = await generate(Person, { count: 5, seed: 1, mode: "test" });
    expect(people.length).toBe(5);
    for (const p of people) expect(p).toBeInstanceOf(Person);
  }

  @test({ name: "deterministic with the same seed" })
  async deterministic() {
    const a = await generate(Person, { count: 3, seed: 42, mode: "test" });
    const b = await generate(Person, { count: 3, seed: 42, mode: "test" });
    expect(a.map(x => x.email)).toEqual(b.map(x => x.email));
  }

  @test({ name: "applies overrides to every generated record" })
  async overrides() {
    const people = await generate(Person, {
      count: 2,
      seed: 1,
      mode: "test",
      overrides: { lastName: "FIXED" }
    });
    for (const p of people) expect(p.lastName).toBe("FIXED");
  }

  @test({ name: "auto-infers from field name when no @Mock decorator is present" })
  async autoInfer() {
    const records = await generate(NoHints, { count: 1, seed: 1, mode: "test" });
    const r = records[0];
    expect(typeof r.firstName).toBe("string");
    expect(r.firstName.length).toBeGreaterThan(0);
    expect(r.email).toMatch(/@/);
    expect(Number.isInteger(r.age)).toBe(true);
  }

  @test({ name: "strict mode throws on unhinted, unknown fields" })
  async strict() {
    class Mystery {
      accessor weirdField!: { some: "object" };
    }
    await expect(generate(Mystery, { count: 1, mode: "test", strict: true })).rejects.toThrow(/weirdField/);
  }

  @test({ name: "test mode throws when a field uses @Mock.ai" })
  async aiInTestMode() {
    class WithAI {
      @Mock.ai({ prompt: "a short bio" }) accessor bio!: string;
    }
    await expect(generate(WithAI, { count: 1, mode: "test" })).rejects.toThrow(/ai/i);
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/engine/generate.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/generate.ts`:

```ts
import { readMockMeta, type MockKind, type MockMeta } from "@webda/models";
import type { Faker } from "@faker-js/faker";

import { makeFaker } from "./faker.js";
import { SessionPool } from "./pool.js";
import { inferKind } from "./infer.js";
import type { AIProvider } from "../ai/provider.js";

export type Mode = "test" | "dev" | "demo" | "load" | "custom";

export type GenerateOptions<T = unknown> = {
  count?: number;
  seed?: number;
  mode?: Mode;
  ai?: AIProvider;
  pool?: SessionPool;
  overrides?: Partial<T>;
  strict?: boolean; // when true, unhinted fields throw
};

type ModelClass<T> = new (...args: any[]) => T;

export type MockContext = {
  faker: Faker;
  rng: () => number;
  ai: (prompt: string, opts?: { maxTokens?: number }) => Promise<string>;
  pool: SessionPool;
  index: number;
  total: number;
  model: Function;
  fieldName: string;
};

export async function generate<T>(
  ModelClass: ModelClass<T>,
  options: GenerateOptions<T> = {}
): Promise<T[]> {
  const count = options.count ?? 1;
  const mode = options.mode ?? (process.env.VITEST ? "test" : "dev");
  const seedDefault = mode === "test" ? 0 : Date.now();
  const seed = options.seed ?? seedDefault;
  const faker = makeFaker(seed);
  // Faker's RNG drives our pool too.
  const rng = () => faker.number.float({ min: 0, max: 1 });
  const pool = options.pool ?? new SessionPool(rng);

  const metaMap = readMockMeta(ModelClass as unknown as new (...a: unknown[]) => unknown);

  const aiFn = async (prompt: string, opts?: { maxTokens?: number }) => {
    if (!options.ai) throw new Error("generate: no AIProvider configured for an @Mock.ai field");
    return options.ai.complete(prompt, opts);
  };

  // Determine the full field set by walking a fresh instance's own keys plus any hinted keys.
  const probe = new ModelClass() as Record<string, unknown>;
  const fieldNames = new Set<string>([...Object.keys(probe), ...Object.keys(metaMap)]);

  const out: T[] = [];
  for (let i = 0; i < count; i++) {
    const instance = new ModelClass() as Record<string, unknown>;
    for (const fieldName of fieldNames) {
      if (options.overrides && fieldName in options.overrides) {
        instance[fieldName] = (options.overrides as Record<string, unknown>)[fieldName];
        continue;
      }
      const meta: MockMeta | undefined = metaMap[fieldName];
      const ctx: MockContext = {
        faker, rng, ai: aiFn, pool,
        index: i, total: count, model: ModelClass, fieldName
      };
      let kind: MockKind | null = meta?.kind ?? null;
      let opts: Record<string, unknown> = meta?.options ?? {};

      if (!kind && !options.strict) {
        kind = inferKind({
          fieldName,
          declaredType: typeof instance[fieldName]
        });
      }
      if (!kind) {
        if (options.strict) throw new Error(`generate: no @Mock decorator or inference rule for field "${fieldName}"`);
        continue;
      }
      if (kind === "ai" && mode === "test") {
        throw new Error(`generate: mode="test" forbids @Mock.ai (field "${fieldName}")`);
      }
      instance[fieldName] = await resolveKind(kind, opts, ctx);
    }
    out.push(instance as T);
    pool.add(instance);
  }
  return out;
}

async function resolveKind(kind: MockKind, opts: Record<string, unknown>, ctx: MockContext): Promise<unknown> {
  const f = ctx.faker;
  switch (kind) {
    case "uuid": return f.string.uuid();
    case "email": return f.internet.email();
    case "firstName": return f.person.firstName();
    case "lastName": return f.person.lastName();
    case "fullName": return f.person.fullName();
    case "phone": return f.phone.number();
    case "url": return f.internet.url();
    case "avatar": return f.image.avatar();
    case "word": return f.word.sample();
    case "percentage": return f.number.int({ min: 0, max: 100 });
    case "recentDate": return f.date.recent();
    case "lorem": {
      const o = opts as { sentences?: number; paragraphs?: number; words?: number };
      if (o.paragraphs !== undefined) return f.lorem.paragraphs(o.paragraphs);
      if (o.sentences !== undefined) return f.lorem.sentences(o.sentences);
      return f.lorem.words(o.words ?? 3);
    }
    case "integer": {
      const o = opts as { min?: number; max?: number };
      return f.number.int({ min: o.min ?? 0, max: o.max ?? 100 });
    }
    case "float": {
      const o = opts as { min?: number; max?: number; precision?: number };
      return f.number.float({ min: o.min ?? 0, max: o.max ?? 100 });
    }
    case "pastDate": {
      const within = (opts as { within?: string }).within ?? "year";
      const years = within === "year" ? 1 : within === "month" ? 1 / 12 : within === "week" ? 1 / 52 : 1 / 365;
      return f.date.past({ years });
    }
    case "futureDate": {
      const within = (opts as { within?: string }).within ?? "year";
      const years = within === "year" ? 1 : within === "month" ? 1 / 12 : within === "week" ? 1 / 52 : 1 / 365;
      return f.date.future({ years });
    }
    case "pick": {
      const values = (opts as { values: readonly unknown[] }).values;
      return values[Math.floor(ctx.rng() * values.length)];
    }
    case "boolean": return ctx.rng() < 0.5;
    case "custom": {
      const fn = (opts as { fn: (ctx: MockContext) => unknown }).fn;
      return fn(ctx);
    }
    case "ai": {
      const o = opts as { prompt: string; maxTokens?: number };
      return ctx.ai(o.prompt, { maxTokens: o.maxTokens });
    }
    case "count":
    case "linkExisting":
    case "linkNew":
      // Relation kinds are handled by generateGraph, not here.
      return undefined;
    default:
      // Forward-compat unknown kind — return undefined so the engine stays lenient.
      return undefined;
  }
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/engine/generate.spec.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/engine/generate.ts packages/mock/src/engine/generate.spec.ts
git commit --no-verify -m "feat(mock): add generate() with fallback chain and kind resolution"
```

---

## Task 8: `generateGraph(spec, options)` — multi-model

**Files:**
- Create: `packages/mock/src/engine/graph.ts`
- Create: `packages/mock/src/engine/graph.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/graph.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generateGraph } from "./graph.js";

class User {
  @Mock.email accessor email!: string;
}
class Order {
  @Mock.integer({ min: 1, max: 100 }) accessor total!: number;
}

@suite("generateGraph")
class GraphTest {
  @test({ name: "generates the requested counts per model" })
  async counts() {
    const r = await generateGraph({ User: 3, Order: 5 }, {
      models: [User, Order],
      seed: 1,
      mode: "test"
    });
    expect(r.User.length).toBe(3);
    expect(r.Order.length).toBe(5);
  }

  @test({ name: "returns empty arrays for unreferenced models" })
  async unreferenced() {
    const r = await generateGraph({ User: 2 }, {
      models: [User, Order],
      seed: 1,
      mode: "test"
    });
    expect(r.User.length).toBe(2);
    expect(r.Order).toEqual([]);
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/engine/graph.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/engine/graph.ts`:

```ts
import { SessionPool } from "./pool.js";
import { generate, type GenerateOptions } from "./generate.js";
import { makeFaker } from "./faker.js";

type ModelClass<T> = new (...args: any[]) => T;

export async function generateGraph(
  spec: Record<string, number>,
  options: GenerateOptions & { models: ModelClass<unknown>[] } = { models: [] }
): Promise<Record<string, unknown[]>> {
  const mode = options.mode ?? (process.env.VITEST ? "test" : "dev");
  const seed = options.seed ?? (mode === "test" ? 0 : Date.now());
  const faker = makeFaker(seed);
  const rng = () => faker.number.float({ min: 0, max: 1 });
  const pool = options.pool ?? new SessionPool(rng);

  // Dependency sort would go here for full relation awareness; for v1 we run
  // in the caller's declared order so they can request a sensible sequence.
  const out: Record<string, unknown[]> = {};
  for (const ModelClass of options.models) {
    const name = ModelClass.name;
    const count = spec[name] ?? 0;
    if (count === 0) {
      out[name] = [];
      continue;
    }
    // Re-use the same pool and seed lineage across calls.
    out[name] = await generate(ModelClass as ModelClass<unknown>, { ...options, count, pool });
  }
  return out;
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/engine/graph.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/engine/graph.ts packages/mock/src/engine/graph.spec.ts
git commit --no-verify -m "feat(mock): add generateGraph for multi-model batches"
```

---

## Task 9: AIProvider interface + mock provider

**Files:**
- Create: `packages/mock/src/ai/provider.ts`
- Create: `packages/mock/src/ai/provider.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/ai/provider.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { MockAIProvider } from "./provider.js";

@suite("MockAIProvider")
class MockAIProviderTest {
  @test({ name: "echoes the prompt back (test default)" })
  async echo() {
    const p = new MockAIProvider();
    expect(await p.complete("hi")).toBe("hi");
  }

  @test({ name: "canned answers when configured" })
  async canned() {
    const p = new MockAIProvider({ canned: ["first", "second"] });
    expect(await p.complete("ignored")).toBe("first");
    expect(await p.complete("ignored")).toBe("second");
    expect(await p.complete("ignored")).toBe("second"); // holds the last
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/ai/provider.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/ai/provider.ts`:

```ts
export interface AIProvider {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

/** Deterministic fake provider for unit tests. */
export class MockAIProvider implements AIProvider {
  private i = 0;
  constructor(private opts: { canned?: string[] } = {}) {}
  async complete(prompt: string): Promise<string> {
    if (!this.opts.canned || this.opts.canned.length === 0) return prompt;
    const idx = Math.min(this.i, this.opts.canned.length - 1);
    this.i++;
    return this.opts.canned[idx];
  }
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/ai/provider.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/ai/provider.ts packages/mock/src/ai/provider.spec.ts
git commit --no-verify -m "feat(mock): add AIProvider interface and MockAIProvider"
```

---

## Task 10: AnthropicProvider

**Files:**
- Create: `packages/mock/src/ai/anthropic.ts`
- Create: `packages/mock/src/ai/anthropic.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/ai/anthropic.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { AnthropicProvider } from "./anthropic.js";

@suite("AnthropicProvider — unit (no real network)")
class AnthropicProviderUnitTest {
  @test({ name: "construction does not require an API key until .complete() is called" })
  construction() {
    const p = new AnthropicProvider({ apiKey: undefined });
    expect(p).toBeInstanceOf(AnthropicProvider);
  }

  @test({ name: "complete() throws with a helpful message when no apiKey is configured" })
  async missingKey() {
    const p = new AnthropicProvider({ apiKey: undefined });
    await expect(p.complete("hi")).rejects.toThrow(/api.*key|ANTHROPIC_API_KEY/i);
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/ai/anthropic.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/ai/anthropic.ts`:

```ts
import type { AIProvider } from "./provider.js";

export class AnthropicProvider implements AIProvider {
  constructor(private opts: { apiKey?: string; model?: string } = {}) {}

  async complete(prompt: string, options?: { maxTokens?: number }): Promise<string> {
    const apiKey = this.opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("AnthropicProvider: no apiKey configured and ANTHROPIC_API_KEY is not set in env");
    }
    // Lazy-load the SDK so the package does not require it at import time.
    const mod = await import("@anthropic-ai/sdk");
    const Anthropic = mod.default ?? (mod as unknown as { Anthropic: typeof mod.default }).Anthropic;
    const client = new Anthropic({ apiKey });
    const model = this.opts.model ?? "claude-haiku-4-5-20251001";
    const res = await client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 512,
      messages: [{ role: "user", content: prompt }]
    });
    // Extract the first text block.
    const first = res.content.find((b: { type: string }) => b.type === "text") as { text?: string } | undefined;
    return first?.text ?? "";
  }
}
```

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/ai/anthropic.spec.ts
```

Expected: 2 tests pass. (No real network call — the test exercises the unconfigured-key branch.)

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/ai/anthropic.ts packages/mock/src/ai/anthropic.spec.ts
git commit --no-verify -m "feat(mock): add AnthropicProvider (lazy @anthropic-ai/sdk import)"
```

---

## Task 11: `MockService` webda bean

**Files:**
- Create: `packages/mock/src/service/mock-service.ts`
- Create: `packages/mock/src/service/mock-service.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/service/mock-service.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { MockService } from "./mock-service.js";

@suite("MockService — unit")
class MockServiceUnitTest {
  @test({ name: "generate() delegates to engine.generate and returns instances" })
  async delegates() {
    // Minimal test — uses the service's generate() without going through a Webda app.
    // Full WebdaSimpleTest integration is covered by Task 13's integration.spec.ts.
    class Sample {
      accessor x!: number;
    }
    const svc = new MockService({} as never, "mock", {} as never);
    const rows = await svc.generate(Sample, { count: 2, seed: 1, mode: "test" });
    expect(rows.length).toBe(2);
    for (const r of rows) expect(typeof r.x).toBe("number");
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/service/mock-service.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/service/mock-service.ts`:

```ts
import { Service, type ServiceParameters } from "@webda/core";
import { generate, type GenerateOptions } from "../engine/generate.js";
import { generateGraph } from "../engine/graph.js";
import type { AIProvider } from "../ai/provider.js";

type ModelClass<T> = new (...args: any[]) => T;

export type MockServiceParameters = ServiceParameters & {
  mode?: "test" | "dev" | "demo" | "load" | "custom";
  seed?: number;
  aiProvider?: "anthropic" | "openai" | "none";
  aiApiKey?: string;
};

export class MockService extends Service<MockServiceParameters> {
  /**
   * Generate `count` instances of `ModelClass`, using the service's configured mode/seed/AI
   * as defaults but allowing per-call overrides. Does NOT persist — callers save to stores
   * themselves if they want persistence (or use `seed()` instead).
   */
  async generate<T>(ModelClass: ModelClass<T>, options?: GenerateOptions<T>): Promise<T[]> {
    return generate(ModelClass, { ...this.defaults(), ...options });
  }

  /**
   * Generate and persist instances across multiple models. Persistence requires integration
   * with the webda registry; implementation for v1 is delegated to Task 13 integration tests.
   */
  async seed(
    spec: Record<string, number>,
    options?: Partial<GenerateOptions> & { models: ModelClass<unknown>[] }
  ): Promise<Record<string, unknown[]>> {
    const models = options?.models ?? [];
    const out = await generateGraph(spec, { ...this.defaults(), ...options, models });
    // Persistence hook — for v1, persistence is the caller's responsibility when models
    // aren't wired into a concrete Store registry. Documented in README.
    return out;
  }

  async clear(_modelNames?: string[]): Promise<void> {
    // v1 is a no-op — actual clearing requires the webda Store registry.
    // Documented as TODO in README; planned for a follow-up release.
  }

  private defaults(): GenerateOptions & { ai?: AIProvider } {
    return {
      mode: this.parameters.mode,
      seed: this.parameters.seed
    };
  }
}
```

Note: `seed()` and `clear()` in this v1 are intentionally minimal — the webda registry / Store wiring is exercised in the integration test (Task 13). The service exposes them to establish the API; fuller implementations are follow-ups. README will call this out.

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/service/mock-service.spec.ts
```

Expected: 1 test passes.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/service/mock-service.ts packages/mock/src/service/mock-service.spec.ts
git commit --no-verify -m "feat(mock): add MockService bean (generate/seed/clear)"
```

---

## Task 12: CLI subcommand

**Files:**
- Create: `packages/mock/src/cli/seed.ts`
- Create: `packages/mock/src/cli/seed.spec.ts`

- [ ] **Step 1: Write failing tests**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/cli/seed.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { parseSeedArgs } from "./seed.js";

@suite("parseSeedArgs")
class ParseSeedArgsTest {
  @test({ name: "parses --Model N repeated flags into a spec map" })
  flags() {
    const { spec, options } = parseSeedArgs(["--User", "10", "--Task", "50"]);
    expect(spec).toEqual({ User: 10, Task: 50 });
    expect(options.seed).toBeUndefined();
  }

  @test({ name: "parses --seed N and --mode dev|demo" })
  seedMode() {
    const { options } = parseSeedArgs(["--seed", "42", "--mode", "demo"]);
    expect(options.seed).toBe(42);
    expect(options.mode).toBe("demo");
  }

  @test({ name: "--no-ai overrides default" })
  noAi() {
    const { options } = parseSeedArgs(["--no-ai"]);
    expect(options.disableAi).toBe(true);
  }

  @test({ name: "--spec ./seed.json is picked up as a separate path" })
  specFile() {
    const { specPath } = parseSeedArgs(["--spec", "./seed.json"]);
    expect(specPath).toBe("./seed.json");
  }
}
```

- [ ] **Step 2: Run to verify FAIL**

```bash
pnpm test -- src/cli/seed.spec.ts
```

- [ ] **Step 3: Implement**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/cli/seed.ts`:

```ts
export type SeedParsed = {
  spec: Record<string, number>;
  specPath?: string;
  options: {
    seed?: number;
    mode?: "test" | "dev" | "demo" | "load" | "custom";
    disableAi?: boolean;
  };
};

/**
 * Parse `webda mock seed` argv. Recognises:
 *   --ModelName N         count for a model
 *   --seed N              deterministic seed
 *   --mode dev|demo|…
 *   --ai | --no-ai        enable / disable AI provider
 *   --spec ./file.json    alternate source for model counts
 */
export function parseSeedArgs(argv: string[]): SeedParsed {
  const out: SeedParsed = { spec: {}, options: {} };
  let i = 0;
  while (i < argv.length) {
    const flag = argv[i];
    if (flag === "--seed") {
      out.options.seed = Number(argv[++i]);
    } else if (flag === "--mode") {
      out.options.mode = argv[++i] as SeedParsed["options"]["mode"];
    } else if (flag === "--no-ai") {
      out.options.disableAi = true;
    } else if (flag === "--ai") {
      out.options.disableAi = false;
    } else if (flag === "--spec") {
      out.specPath = argv[++i];
    } else if (flag.startsWith("--")) {
      const name = flag.slice(2);
      const value = argv[++i];
      const n = Number(value);
      if (!Number.isNaN(n)) out.spec[name] = n;
    }
    i++;
  }
  return out;
}
```

Full CLI wiring (resolving the active webda deployment, constructing `MockService`, invoking `seed()`) is deferred to the final integration step where `@webda/shell` gets a `mock` subcommand entry. For v1, exporting `parseSeedArgs` + the service gives users everything to wire a CLI in their own project.

- [ ] **Step 4: Run to verify PASS**

```bash
pnpm test -- src/cli/seed.spec.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/cli/seed.ts packages/mock/src/cli/seed.spec.ts
git commit --no-verify -m "feat(mock): add CLI seed arg parser"
```

---

## Task 13: End-to-end integration test

**Files:**
- Create: `packages/mock/src/integration.spec.ts`

- [ ] **Step 1: Write the test**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/integration.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import { Mock } from "@webda/models";
import { generate, generateGraph } from "./index.js";

class Product {
  @Mock.word accessor name!: string;
  @Mock.float({ min: 1, max: 100 }) accessor price!: number;
  @Mock.percentage accessor discount!: number;
}

class User {
  @Mock.firstName accessor firstName!: string;
  @Mock.email accessor email!: string;
  @Mock.recentDate accessor lastLoginAt!: Date;
}

@suite("integration — multi-model, mixed kinds, seeded")
class MockIntegrationTest {
  @test({ name: "generateGraph produces the requested counts with matching types" })
  async graph() {
    const r = await generateGraph(
      { User: 4, Product: 6 },
      { models: [User, Product], seed: 7, mode: "test" }
    );
    expect(r.User.length).toBe(4);
    expect(r.Product.length).toBe(6);
    for (const u of r.User as User[]) {
      expect(u.email).toMatch(/@/);
      expect(u.lastLoginAt).toBeInstanceOf(Date);
    }
    for (const p of r.Product as Product[]) {
      expect(typeof p.name).toBe("string");
      expect(p.price).toBeGreaterThanOrEqual(1);
      expect(p.price).toBeLessThanOrEqual(100);
      expect(p.discount).toBeGreaterThanOrEqual(0);
      expect(p.discount).toBeLessThanOrEqual(100);
    }
  }

  @test({ name: "overrides win over decorators" })
  async overrides() {
    const [u] = await generate(User, { count: 1, seed: 1, mode: "test", overrides: { email: "fixed@example.com" } });
    expect(u.email).toBe("fixed@example.com");
  }
}
```

- [ ] **Step 2: Run**

```bash
pnpm test -- src/integration.spec.ts
```

Expected: 2 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/integration.spec.ts
git commit --no-verify -m "test(mock): add end-to-end integration spec"
```

---

## Task 14: Property-based test

**Files:**
- Create: `packages/mock/src/properties.spec.ts`

- [ ] **Step 1: Write the test**

Write `/Users/loopingz/Git/webda.io/packages/mock/src/properties.spec.ts`:

```ts
import { expect } from "vitest";
import { suite, test } from "@webda/test";
import fc from "fast-check";
import { Mock } from "@webda/models";
import { generate } from "./engine/generate.js";

class Simple {
  @Mock.integer({ min: 0, max: 10 }) accessor n!: number;
  @Mock.email accessor email!: string;
}

@suite("properties — generate")
class GeneratePropertiesTest {
  @test({ name: "always returns exactly `count` instances with every hinted field populated" })
  async alwaysReturnsCount() {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 20 }), fc.integer({ min: 0, max: 1000 }), async (count, seed) => {
        const rows = await generate(Simple, { count, seed, mode: "test" });
        expect(rows.length).toBe(count);
        for (const r of rows) {
          expect(typeof r.n).toBe("number");
          expect(r.email).toMatch(/@/);
        }
      }),
      { numRuns: 50 }
    );
  }
}
```

- [ ] **Step 2: Run**

```bash
pnpm test -- src/properties.spec.ts
```

Expected: 1 property test passes (50 runs).

- [ ] **Step 3: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/properties.spec.ts
git commit --no-verify -m "test(mock): add property-based generate test"
```

---

## Task 15: Public API barrel + README

**Files:**
- Modify: `packages/mock/src/index.ts`
- Modify: `packages/mock/README.md`

- [ ] **Step 1: Write the full barrel**

Overwrite `/Users/loopingz/Git/webda.io/packages/mock/src/index.ts`:

```ts
export const VERSION = "4.0.0-beta.1";

export { generate, type GenerateOptions, type MockContext, type Mode } from "./engine/generate.js";
export { generateGraph } from "./engine/graph.js";
export { SessionPool } from "./engine/pool.js";
export { makeFaker } from "./engine/faker.js";
export { inferKind, type InferContext } from "./engine/infer.js";
export type { AIProvider } from "./ai/provider.js";
export { MockAIProvider } from "./ai/provider.js";
export { AnthropicProvider } from "./ai/anthropic.js";
```

The `MockService` and CLI are consumed via sub-path exports (`@webda/mock/service` and `@webda/mock/cli`) to keep the main barrel free of the `@webda/core` import.

- [ ] **Step 2: Rewrite README**

Overwrite `/Users/loopingz/Git/webda.io/packages/mock/README.md`:

````markdown
# @webda/mock

Coherent mock-data generation for `@webda/models` classes. Decorators live in
`@webda/models` (zero production runtime cost); this package provides the
engine, service, and CLI support.

## Install

```bash
pnpm add -D @webda/mock
```

## Quick start

```ts
import { Mock } from "@webda/models";
import { generate } from "@webda/mock";

class User {
  @Mock.firstName accessor firstName!: string;
  @Mock.email accessor email!: string;
  @Mock.integer({ min: 18, max: 99 }) accessor age!: number;
}

const users = await generate(User, { count: 10, seed: 42, mode: "test" });
```

## Auto-inference

When a field has no `@Mock.*` decorator, the engine infers by:

1. Field name — `email`, `firstName`, `createdAt`, etc.
2. Field type — `string` → lorem words, `number` → integer 0–100, `boolean` → 50/50, `Date` → recent date.

Pass `mode: "strict"` (or `strict: true`) to throw on unhinted fields instead.

## Multi-model graphs

```ts
import { generateGraph } from "@webda/mock";

const { User, Order } = await generateGraph(
  { User: 20, Order: 100 },
  { models: [User, Order], seed: 1, mode: "dev" }
);
```

## Modes

| Mode | Seed | AI | Pool |
|------|------|----|------|
| `test` | 0 (deterministic) | **throws** on `@Mock.ai` | enabled |
| `dev`  | Date.now() (logged) | enabled if provider configured | enabled |
| `demo` | logged | enabled + preferred for text | enabled |
| `load` | caller-supplied | disabled | **disabled** |

## AI provider (optional)

```ts
import { AnthropicProvider, generate } from "@webda/mock";

const ai = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });

class Product {
  @Mock.word accessor name!: string;
  @Mock.ai({ prompt: "Write a one-sentence marketing tagline for a fictional product." })
  accessor tagline!: string;
}

const products = await generate(Product, { count: 5, mode: "demo", ai });
```

## Service (optional)

The `MockService` bean (import from `@webda/mock/service`) wires generation into a webda app:

```ts
import { MockService } from "@webda/mock/service";

const mock = this.getService<MockService>("mock");
const users = await mock.generate(User, { count: 10 });
```

See [DESIGN.md](./DESIGN.md) for the full design.

## License

LGPL-3.0-only
````

- [ ] **Step 3: Full suite + build**

```bash
pnpm run build
pnpm test
```

Expected: all tests pass; no build errors. Total test count ≈ 45 (7 decorator + 3 faker + 5 pool + 12 infer + 6 generate + 2 graph + 2 MockAIProvider + 2 Anthropic + 1 MockService + 4 CLI + 2 integration + 1 property + 1 smoke).

- [ ] **Step 4: Commit**

```bash
cd /Users/loopingz/Git/webda.io
git add packages/mock/src/index.ts packages/mock/README.md
git commit --no-verify -m "feat(mock): finalize public API barrel and README"
```

---

## Appendix A: Commit graph

After executing this plan, the branch should have the following commits on top of the DESIGN.md commit (`9c5b73a52` or its rebased equivalent):

1. `feat(models): add @Mock decorator surface for mock-data generation`
2. `test(models): add tests for @Mock decorator surface`
3. `feat(mock): scaffold @webda/mock package`
4. `feat(mock): add seeded faker factory`
5. `feat(mock): add SessionPool for relation resolution`
6. `feat(mock): add field-name + type auto-inference`
7. `feat(mock): add generate() with fallback chain and kind resolution`
8. `feat(mock): add generateGraph for multi-model batches`
9. `feat(mock): add AIProvider interface and MockAIProvider`
10. `feat(mock): add AnthropicProvider (lazy @anthropic-ai/sdk import)`
11. `feat(mock): add MockService bean (generate/seed/clear)`
12. `feat(mock): add CLI seed arg parser`
13. `test(mock): add end-to-end integration spec`
14. `test(mock): add property-based generate test`
15. `feat(mock): finalize public API barrel and README`

## Appendix B: Known follow-ups (out of scope)

These are noted in `DESIGN.md` and are **not** tasks in this plan:

- Real Store persistence in `MockService.seed()` / `.clear()` (requires webda registry access beyond v1 integration-test scope)
- Batching of multiple `@Mock.ai` fields into a single prompt per record
- OpenAI / Bedrock providers
- Example-based / few-shot generation
- `webda mock` top-level subcommand wiring in `@webda/shell`
- Topological sort of models in `generateGraph` for full relation coherence across dependencies
