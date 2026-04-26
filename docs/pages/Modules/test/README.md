---
sidebar_label: "@webda/test"
---
# test

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
- Related: [`@webda/mock`](_media/mock) for generating test fixtures; [`@webda/workout`](_media/workout) for the `MemoryLogger` used to capture logs during tests; [`@webda/fs`](_media/fs) for `FileStore` as an in-test store backend.
