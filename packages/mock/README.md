# @webda/mock module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

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

1. Field name — `email`, `firstName`, `createdAt`, `age`, etc.
2. Field type — `string` → lorem words, `number` → integer 0–100, `boolean` → 50/50, `Date` → recent date.

Pass `strict: true` to throw on unhinted fields instead.

## Multi-model graphs

```ts
import { generateGraph } from "@webda/mock";

const { User: users, Order: orders } = await generateGraph(
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
| `load` | caller-supplied | disabled | disabled |

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

`@anthropic-ai/sdk` is an optional peer dependency — it is only loaded when
`AnthropicProvider.complete()` is actually called.

## Service (optional)

```ts
import { MockService } from "@webda/mock/service";

const mock = new MockService(undefined, "mock", { mode: "dev", seed: 1 });
const users = await mock.generate(User, { count: 10 });
```

In v1 `MockService` is a plain class. Wrapping it as a webda `@Bean` subclass
is a planned follow-up once `@webda/core`'s export graph on `main` is repaired.

## CLI arg parser

```ts
import { parseSeedArgs } from "@webda/mock/cli";

const { spec, options } = parseSeedArgs(process.argv.slice(2));
// spec:    { User: 10, Task: 50 }
// options: { seed?, mode?, disableAi? }
```

A full `webda mock seed` subcommand in `@webda/shell` is a follow-up.

## Design

See [DESIGN.md](./DESIGN.md) for the design.

## License

LGPL-3.0-only

<!-- README_FOOTER -->
## Sponsors

<!--
Support this project by becoming a sponsor. Your logo will show up here with a link to your website. [Become a sponsor](mailto:sponsor@webda.io)
-->

Arize AI is a machine learning observability and model monitoring platform. It helps you visualize, monitor, and explain your machine learning models. [Learn more](https://arize.com)

[<img src="https://arize.com/hubfs/arize/brand/arize-logomark-1.png" width="200">](https://arize.com)

Loopingz is a software development company that provides consulting and development services. [Learn more](https://loopingz.com)

[<img src="https://loopingz.com/images/logo.png" width="200">](https://loopingz.com)

Tellae is an innovative consulting firm specialized in cities transportation issues. We provide our clients, both public and private, with solutions to support your strategic and operational decisions. [Learn more](https://tellae.fr)

[<img src="https://tellae.fr/" width="200">](https://tellae.fr)
