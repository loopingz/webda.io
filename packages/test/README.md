# @webda/test module

This module is part of Webda Application Framework that allows you to quickly develop applications with all modern prerequisites: Security, Extensibility, GraphQL, REST, CloudNative [https://webda.io](https://webda.io)

<img src="https://webda.io/images/webda.svg" width="128" />

![CI](https://github.com/loopingz/webda.io/workflows/CI/badge.svg)

[![Join the chat at https://gitter.im/loopingz/webda](https://badges.gitter.im/loopingz/webda.svg)](https://gitter.im/loopingz/webda?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![codecov](https://codecov.io/gh/loopingz/webda.io/branch/main/graph/badge.svg?token=8N9DNM3K3O)](https://codecov.io/gh/loopingz/webda.io)
[![SonarCloud.io](https://sonarcloud.io/api/project_badges/measure?project=loopingz_webda.io&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=loopingz_webda.io)
![CodeQL](https://github.com/loopingz/webda.io/workflows/CodeQL/badge.svg)

<!-- README_HEADER -->

# @webda/test

> Test harness for Webda applications — framework-agnostic `@suite`/`@test` decorators, automatic memory-log capture on failure, and helpers for wiring up services and stores in isolation (works with Vitest, Mocha, Jest, and Bun).

## When to use it

- You are writing unit or integration tests for Webda services and models and want a class-based, decorator-driven test structure.
- You want automatic log capture: when a test fails the full log for that test run is written to `reports/<suite>/<test>.log` for debugging.
- You need async-context isolation between tests (uses Node `AsyncLocalStorage` under the hood).

## Install

```bash
pnpm add -D @webda/test
```

## Configuration

No `webda.config.json` entry needed. Import and use decorators in your spec files.

## Usage

```typescript
import { suite, test, beforeAll, afterAll } from "@webda/test";
import { assert } from "node:assert";
import { Core } from "@webda/core";

// Vitest / Mocha compatible — the harness auto-detects the runner
@suite
class PostServiceTest {
  private service: PostService;

  @beforeAll
  async setup(): Promise<void> {
    // Boot the Webda application using your test config
    const app = new Core({ appPath: "." });
    await app.init();
    this.service = app.getService<PostService>("postService");
  }

  @afterAll
  async teardown(): Promise<void> {
    await Core.stop();
  }

  @test
  async "create and retrieve a post"(): Promise<void> {
    const post = await this.service.createPost({ title: "Hello" });
    assert.strictEqual(post.title, "Hello");

    const found = await this.service.getPost(post.uuid);
    assert.deepStrictEqual(found.uuid, post.uuid);
  }

  @test({ execution: "skip" })
  async "pending test"(): Promise<void> {
    // Not yet implemented
  }
}

// Run with: pnpm test
// On failure: reports/PostServiceTest/create and retrieve a post.log is written automatically
```

## Reference

- API reference: see the auto-generated typedoc at `docs/pages/Modules/test/`.
- Source: [`packages/test`](https://github.com/loopingz/webda.io/tree/main/packages/test)
- Related: [`@webda/mock`](../mock) for generating test fixtures; [`@webda/workout`](../workout) for the `MemoryLogger` used to capture logs during tests; [`@webda/fs`](../fs) for `FileStore` as an in-test store backend.

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
