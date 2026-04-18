# `@webda/mock` — Design Spec

**Date:** 2026-04-17
**Status:** Approved (brainstorm phase)
**Branch:** `feat/mock`
**Packages touched:** `@webda/models` (decorators) + new `@webda/mock` (engine, service, CLI)

## 1. Purpose

Generate mock data for `@webda/models` classes that is **coherent with the domain** — not random garbage. A single decorator set drives generation for unit tests, dev/staging seeding, demo datasets, and load testing. AI is available as an opt-in enhancement for fields that benefit from domain-aware text; everything else runs fully deterministic, offline, and free.

### Target use cases (all supported in v1 by the same engine)

- **Unit / integration tests** — fast, deterministic, offline, reproducible via seed.
- **Dev / staging seed data** — realistic, cross-referenced graph (Orders reference real Users).
- **Demo / screenshot data** — polished values (product descriptions, reviews) — AI-assisted when configured.
- **Load testing** — high volume (10k+), speed-optimized, relation-coherence optional.

## 2. Scope

**In scope (v1):**

- `@Mock.*` decorators for ~20 common kinds (plus `@Mock.custom`, `@Mock.ai`, `@Mock({ kind, … })` escape hatch) — shipped in `@webda/models`.
- Auto-inference from field name and field type when no `@Mock` is present.
- Relation-aware generation via `@Mock.count` / `@Mock.linkExisting` / `@Mock.linkNew` on `@ModelRelated` / `@ModelLink` fields.
- `generate(ModelClass, opts)` standalone function.
- `generateGraph(spec, opts)` multi-model graph generation with topological ordering.
- `MockService` webda bean that wires generation to Stores.
- `webda mock seed` / `webda mock clear` CLI subcommands.
- Pluggable `AIProvider` interface with a default `AnthropicProvider`.

**Out of scope (v1):**

- Example-based / few-shot data augmentation (give me 3 seed rows, generate 100 in that style).
- Snapshot testing / fixture serialization (orthogonal concern).
- Non-destructive "append only new" seeding beyond simple idempotency by uuid.
- OpenAI / Google / Bedrock providers (pluggable interface is in scope; concrete providers other than Anthropic are follow-ups).

## 3. Package layout

**Decorators live in `@webda/models`** so that any model file using `@Mock.email` imports only from a package the application already depends on — **zero new runtime footprint in production**.

```
packages/models/src/
├── mock.ts            # @Mock.email, @Mock.name, @Mock.count, @Mock.custom, @Mock({ kind, … })
│                      # Plus readMockMeta(ModelClass) — the metadata-reading helper
├── model.ts           # existing
└── …

packages/mock/src/     # NEW package — dev dependency for most users
├── index.ts           # public API barrel
├── engine/
│   ├── generate.ts    # generate(Model, { count, seed, mode, ai? })
│   ├── graph.ts       # generateGraph(spec, opts) — topological multi-model
│   ├── pool.ts        # session pool for relation resolution
│   ├── faker.ts       # @faker-js/faker integration (seeded instance)
│   └── infer.ts       # auto-inference rules
├── ai/
│   ├── provider.ts    # AIProvider interface
│   └── anthropic.ts   # default provider (uses @anthropic-ai/sdk)
├── service/
│   └── mock-service.ts  # @Bean, persists via configured Stores
└── cli/
    └── seed.ts        # `webda mock seed` / `webda mock clear` handlers
```

### Contract between the two packages

- `@webda/models` owns the decorator surface AND the metadata shape: each field gets `{ kind: string, options?: unknown }` stashed on `Symbol.metadata`.
- `@webda/mock` reads that metadata via `readMockMeta()` and decides what to do with each kind.
- New kinds can ship in `@webda/mock` without touching `@webda/models`, using the `@Mock({ kind, … })` escape hatch for anything beyond the predefined named decorators.

### Dependencies

- `@webda/models` — no new runtime deps (the decorators are tiny pure functions that only write to `Symbol.metadata`).
- `@webda/mock`:
  - Runtime: `@faker-js/faker`, `@webda/models`, `@webda/core` (service + CLI integration).
  - Optional peer: `@anthropic-ai/sdk` (only needed when the Anthropic provider is used).
  - Dev: `@webda/test`, `vitest`, `fast-check`.

## 4. Decorators

### Named decorators — scalar fields

```ts
// Strings / identity
@Mock.uuid
@Mock.email
@Mock.firstName            @Mock.lastName            @Mock.fullName
@Mock.phone
@Mock.url
@Mock.avatar
@Mock.lorem({ sentences?: number; paragraphs?: number; words?: number })
@Mock.word

// Numbers
@Mock.integer({ min?: number; max?: number })
@Mock.float({ min?: number; max?: number; precision?: number })
@Mock.percentage           // 0–100

// Dates
@Mock.pastDate({ within?: "day" | "week" | "month" | "year" })
@Mock.futureDate({ within?: … })
@Mock.recentDate           // past 7 days

// Enumeration
@Mock.pick(["draft", "active", "archived"])

// Escape hatches
@Mock.custom((ctx: MockContext) => ctx.faker.company.name())
@Mock.ai({ prompt: string; maxTokens?: number })
@Mock({ kind: string, ...options })   // forward-compat generic form
```

### Relation decorators — stack alongside `@ModelRelated` / `@ModelLink`

```ts
@ModelRelated("User", "tasks")
@Mock.count(5)                                  // exactly 5 links
tasks: ModelRelation<Task>;

@ModelRelated("User", "orders")
@Mock.count({ min: 0, max: 20 })                // range
orders: ModelRelation<Order>;

@ModelLink(Account)
@Mock.linkExisting                              // pick one from the pool (default)
account: ModelLink<Account>;

@ModelLink(Profile)
@Mock.linkNew                                   // always create a fresh linked instance
profile: ModelLink<Profile>;
```

## 5. Auto-inference

When no `@Mock.*` decorator is present on a field, the engine infers in this order:

### 5.1 Field-name heuristic (case-insensitive exact match)

Comparison is against the camelCase field name, case-insensitive. Substring matches do not trigger — `contactEmail` does **not** auto-infer to email; use an explicit `@Mock.email` for that case (or a catch-all regex in a later iteration).

| Field name matches | Resolves to |
|---|---|
| `email` | `@Mock.email` |
| `phone`, `phoneNumber` | `@Mock.phone` |
| `url`, `website` | `@Mock.url` |
| `firstName`, `lastName`, `fullName` | corresponding name kind |
| `uuid`, `id` | `@Mock.uuid` |
| `createdAt`, `updatedAt` | `@Mock.recentDate` |
| `*At` where type is `Date` | `@Mock.pastDate` |
| `avatar`, `image`, `photo` | `@Mock.avatar` |

### 5.2 Field-type fallback

| TypeScript type | Default generator |
|---|---|
| `string` | `@Mock.lorem({ words: 3 })` |
| `number` | `@Mock.integer({ min: 0, max: 100 })` |
| `boolean` | 50/50 coin flip |
| `Date` | `@Mock.recentDate` |

### 5.3 Relation fallback

| Relation type | Default behavior |
|---|---|
| `ModelLink` | Pick one from pool; create new if pool empty |
| `ModelRelated`, `ModelLinksArray` | `@Mock.count({ min: 0, max: 3 })` |

### 5.4 Unknown fields

Engine emits a one-time warning listing unhinted fields and returns `undefined` for them. Under `mode: "strict"`, steps 5.1–5.3 are skipped and the engine throws on the first unhinted field — useful for ensuring a model's mock contract is fully specified.

## 6. Engine architecture

### 6.1 Fallback chain (per field)

```
1. Explicit @Mock.* decorator on the field      → use it directly
2. Auto-inference by field name                 → skipped if mode: "strict"
3. Auto-inference by field type                 → skipped if mode: "strict"
4. Warn + return undefined                      → throw if mode: "strict"
```

Step 1 routes directly to Faker, the AI provider, or a custom function depending on the kind. The engine never calls the network for a non-AI kind.

### 6.2 Generation context

Every generator — named, custom, and AI — receives a `MockContext`:

```ts
type MockContext = {
  faker: Faker;                                  // seeded Faker instance
  rng: () => number;                             // seeded RNG for custom generators
  ai: (prompt: string, opts?: AIOpts) => Promise<string>;
  pool: SessionPool;                             // all instances generated so far
  index: number;                                 // 0-based row index
  total: number;                                 // total rows being generated
  model: ModelClass;                             // the class being generated
  fieldName: string;                             // the field this value is for
};
```

### 6.3 Session pool

Populates in dependency order (topological sort of registered models):

- `pool.add(instance)` after each record is generated.
- `pool.pickOne<T>(ModelClass)` — picks an existing instance by seeded RNG; `null` if empty.
- `pool.pickMany<T>(ModelClass, count)` — unique subset.

For `@ModelLink` fields, the engine first tries `pool.pickOne` and falls back to generating a fresh linked instance if the pool is empty.

### 6.4 Modes

```ts
type Mode = "test" | "dev" | "demo" | "load" | "custom";
```

| Mode | Seed | AI | Pool | Notes |
|---|---|---|---|---|
| `test` | `0` (deterministic) | **throws** if a field uses `@Mock.ai` | Enabled | Default under `VITEST` env |
| `dev` | `Date.now()` (logged) | Enabled if provider configured | Enabled | Sensible default |
| `demo` | logged | Enabled + preferred for text-ish fields | Enabled | Polished output |
| `load` | caller-supplied | Disabled | **Disabled** (random ids) | Fastest |
| `custom` | caller-supplied | caller-supplied | caller-supplied | Full control |

### 6.5 AI provider interface

```ts
export interface AIProvider {
  complete(prompt: string, options?: { maxTokens?: number }): Promise<string>;
}

export class AnthropicProvider implements AIProvider {
  constructor(opts: { apiKey?: string; model?: string });
  async complete(prompt, options): Promise<string>;
}
```

Users plug another provider by passing `{ ai: new MyProvider() }` to `generate()` or configuring it on `MockService`. v1 batching heuristic: one AI call per `@Mock.ai` field. Batching multiple fields of the same record into a single prompt is a future optimization.

### 6.6 Determinism contract

- Same seed + same Faker version + same decorator set → byte-identical output for non-AI fields.
- AI-generated fields are inherently non-deterministic.
- `mode === "test"` throws on encountering `@Mock.ai` rather than silently producing non-deterministic values.
- In non-test modes the seed is logged so a run can be reproduced with `generate(Class, { seed: 0x1234 })`.

## 7. Public API

### 7.1 Core — `@webda/mock`

```ts
export async function generate<T extends Model>(
  ModelClass: ModelClass<T>,
  options?: GenerateOptions
): Promise<T[]>;

export type GenerateOptions = {
  count?: number;                  // default 1
  seed?: number;                   // defaults per mode
  mode?: Mode;                     // default "dev" ("test" when VITEST env set)
  ai?: AIProvider;                 // defaults to AnthropicProvider if ANTHROPIC_API_KEY
  pool?: SessionPool;              // pre-seeded pool
  overrides?: Partial<T>;          // force specific field values on every record
};

export async function generateGraph(
  spec: Record<string, number>,    // e.g. { User: 10, Order: 50 }
  options?: GenerateOptions & { models: ModelClass[] }
): Promise<Record<string, Model[]>>;

export { SessionPool } from "./engine/pool.js";
export { AnthropicProvider } from "./ai/anthropic.js";
export type { AIProvider } from "./ai/provider.js";
```

### 7.2 Service — `@webda/mock/service`

```ts
@Bean
export class MockService extends Service<MockServiceParameters> {
  @Inject("Registry") registry: ModelRegistry;

  async seed(spec: Record<string, number>, options?: Partial<GenerateOptions>): Promise<void>;
  async generate<T extends Model>(ModelClass: ModelClass<T>, options?: GenerateOptions): Promise<T[]>;
  async clear(modelNames?: string[]): Promise<void>;
}

type MockServiceParameters = ServiceParameters & {
  mode?: Mode;
  aiProvider?: "anthropic" | "openai" | "none";
  aiApiKey?: string;               // resolves from env ANTHROPIC_API_KEY / OPENAI_API_KEY if omitted
  seed?: number;
};
```

`seed()` is idempotent by default — it skips saves for records already present at the generated uuids.

### 7.3 CLI

```
webda mock seed --Task 10 --User 50 [--seed 42] [--mode dev|demo] [--ai|--no-ai]
webda mock seed --spec ./seed.json             # { "Task": 10, "User": 50 }
webda mock clear [--Task]                      # specific models or all
```

The CLI is a thin wrapper: parses args, instantiates `MockService` in the current deployment context, calls `seed()` or `clear()`.

### 7.4 Typical flows

```ts
// Unit test
const users = await generate(User, { count: 3, mode: "test", seed: 42 });

// Seed script
await generateGraph(
  { User: 20, Product: 50, Order: 100 },
  { models: [User, Product, Order], mode: "dev" }
);

// Dev service use
const mock = this.getService<MockService>("mock");
await mock.seed({ User: 10, Task: 100 });
```

```
$ webda mock seed --User 10 --Task 100
```

## 8. Testing strategy

**Framework:** Vitest + `@webda/test` class-based `@suite`/`@test` decorators.

### 8.1 Layers

1. **Decorator metadata** — tests in `packages/models/test/mock.spec.ts` verify `Symbol.metadata` writes, `readMockMeta()` returns the expected map, decorator stacking composes, subclass overrides parent.
2. **Engine units** — `packages/mock/test/`: `generate.spec.ts`, `pool.spec.ts`, `infer.spec.ts`, `faker.spec.ts`, `ai.spec.ts` (using a mock `AIProvider`). Real Anthropic calls are opt-in, skipped without `ANTHROPIC_API_KEY`.
3. **`generateGraph` integration** — topological ordering; cross-model relation pool usage; seeded reproducibility across runs.
4. **`MockService` integration** — via `WebdaSimpleTest` with a `MemoryStore`. Verifies persistence, idempotency, and `clear()`.
5. **CLI smoke tests** — spawn the binary; verify exit code 0 and expected store counts.
6. **Property-based** — `fast-check` on a plain primitive-fields model: `generate(M, { count: n })` always returns `n` instances with all required fields populated.

### 8.2 Coverage target

85% branches. The gap tolerates provider error paths that are hard to exercise without full network mocks.

### 8.3 Explicit non-goals

- Faker.js internals.
- The real Anthropic API (a mock-provider contract test is enough for CI).

## 9. Open questions

None as of approval. Follow-ups (CLI `--preview` mode, OpenAI provider, batched AI prompts, example-based generation) are explicitly out of scope and do not require design changes to land.
