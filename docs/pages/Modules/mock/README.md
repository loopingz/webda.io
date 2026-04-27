---
sidebar_label: "@webda/mock"
---
# mock

# @webda/mock

> Coherent mock-data generation for `@webda/models` classes — decorator-driven field population with deterministic seeding, multi-model graph support, and optional AI-generated text.

## When to use it

- You need realistic, consistent test fixtures for Webda models without writing manual factory functions.
- You want reproducible test data with `mode: "test"` (seed=0) and varied demo data with `mode: "demo"`.
- You need to populate an entire relational graph of models (e.g. Users + Orders + Posts) in one call.

## Install

```bash
pnpm add -D @webda/mock
```

## Configuration

`@webda/mock` is a pure library — no `webda.config.json` entry is required. Field hints are added via `@Mock.*` decorators from `@webda/models` (zero production cost — tree-shaken out).

| Option | Type | Default | Description |
|---|---|---|---|
| `count` | number | `1` | Number of instances to generate |
| `seed` | number | `0` (test) / `Date.now()` (dev) | RNG seed for reproducibility |
| `mode` | `"test"` \| `"dev"` \| `"demo"` \| `"load"` | `"test"` in Vitest | Controls seed default, AI usage, and session pool |
| `overrides` | `Partial<T>` | — | Force-set specific fields regardless of inference |
| `strict` | boolean | `false` | Throw instead of skip on unhinted, uninferable fields |
| `ai` | `AIProvider` | — | AI provider for `@Mock.ai` fields (e.g. `AnthropicProvider`) |

## Usage

```typescript
import { Mock } from "@webda/models";
import { generate, generateGraph } from "@webda/mock";

// Annotate your model fields
class Post {
  @Mock.word accessor title!: string;
  @Mock.paragraph accessor body!: string;
  @Mock.pastDate accessor publishedAt!: Date;
}

class User {
  @Mock.firstName accessor firstName!: string;
  @Mock.email accessor email!: string;
  @Mock.integer({ min: 18, max: 99 }) accessor age!: number;
}

// Generate 5 deterministic posts (seed=42)
const posts = await generate(Post, { count: 5, seed: 42, mode: "test" });
// posts[0].title is always the same string across runs

// Generate a relational graph: 10 users and 50 posts
const graph = await generateGraph(
  { User: 10, Post: 50 },
  { models: [User, Post], seed: 1, mode: "dev" }
);
// graph.User → User[], graph.Post → Post[]

// Optional: AI-generated text fields (Anthropic)
import { AnthropicProvider } from "@webda/mock";

const ai = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY });

class Product {
  @Mock.word accessor name!: string;
  @Mock.ai({ prompt: "One-sentence marketing tagline for a fictional product." })
  accessor tagline!: string;
}

const products = await generate(Product, { count: 3, mode: "demo", ai });
```

## Modes

| Mode | Seed default | AI | Use case |
|------|-------------|-----|---------|
| `test` | `0` (deterministic) | Throws on `@Mock.ai` | Unit tests, snapshots |
| `dev` | `Date.now()` | Enabled if provider given | Local development seeding |
| `demo` | Logged | Enabled + preferred for text | Demo environments |
| `load` | Caller-supplied | Disabled | Load/performance testing |

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/mock/`.
- Source: [`packages/mock`](https://github.com/loopingz/webda.io/tree/main/packages/mock)
- Related: [`@webda/models`](_media/models) for the `@Mock.*` decorator definitions; [`@webda/test`](_media/test) for the `WebdaTest` harness where mock data is typically used; [`@webda/fs`](_media/fs) for `FileStore` to persist generated data locally.
