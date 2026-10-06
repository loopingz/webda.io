---
name: webda-testing
description: Use when writing, running or fixing tests of a Webda app, its models, services or operations
---

# Testing a Webda app

## When to use

Adding tests for a model, a service or an operation, or fixing a failing test.

## Pattern

Tests are vitest files in `test/*.spec.ts`, written as classes with `@suite` and `@test` from `@webda/test`. `npm test` builds first (`pretest`), because the app is loaded from `lib/` and `webda.module.json`.

```ts
import { suite, test } from "@webda/test";
import * as assert from "node:assert";
import { resolve } from "node:path";
import { TestApplication, WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { useModel, useService } from "@webda/core";

const appDir = resolve(import.meta.dirname, "..");

class AppTestApplication extends TestApplication {
  getNamespace() {
    return "MyApp";
  }

  filterModule(_filename: string): boolean {
    return true;
  }
}

@suite
class NoteTest extends WebdaApplicationTest {
  getTestConfiguration(): string {
    return appDir;
  }

  getApplication() {
    return new AppTestApplication(this.getTestConfiguration());
  }

  @test
  async createsANote() {
    const Note = useModel<any>("MyApp/Note");
    const note = await Note.create({ text: "Hello", archived: false });
    assert.strictEqual((await Note.ref(note.getUUID()).get()).text, "Hello");
  }

  @test
  async callsAService() {
    const greeting = (useService("GreetingService" as any) as any).greet("Ada");
    assert.strictEqual(greeting, "Hello Ada");
  }
}
```

- Get models with `useModel("<Namespace>/<Model>")` and services with `useService("<name>")`: importing classes from `src/` gives different class objects than the ones the app loaded from `lib/`.
- `getNamespace()` returns the `webda.namespace` of `package.json`.
- By default the test replaces the `Registry` store with an in-memory one. Override `async tweakApp() {}` to keep `webda.config.json` as is (then make assertions on data the test creates, since the store keeps data between runs).

## Common mistakes

```text
import { Note } from "../src/models/Note.model.js"  → useModel("MyApp/Note")
Running vitest without building                      → npm test (runs webdac build first)
Assertions on global counts with a persistent store  → assert on records created by the test
```

## Verify

`npm test`.

## Reference

https://docs.webda.io

Written for Webda 4.0.0-beta.
