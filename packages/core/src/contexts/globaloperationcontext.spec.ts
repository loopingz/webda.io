import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { WebdaAsyncStorageTest } from "../test/asyncstorage";
import { Session } from "../session/session";
import { OperationContext } from "./operationcontext";
import { GlobalContext } from "./globalcontext";
import { runAsSystem, useContext } from "./execution";
import { GlobalOperationContext, useSystem } from "./globaloperationcontext";

@suite
class GlobalOperationContextTest extends WebdaAsyncStorageTest {
  @test
  async identity() {
    const ctx = useSystem();
    assert.ok(ctx instanceof OperationContext);
    assert.strictEqual(ctx.isGlobalContext(), true);
    assert.strictEqual(ctx.getCurrentUserId(), "system");
    assert.strictEqual(await ctx.getCurrentUser(), undefined);
    assert.ok(ctx.getSession() instanceof Session);
  }

  @test
  smallOutputBuffer() {
    // runAsSystem is on hot paths (user resolution, login throttling): no 100 KB buffer per call
    assert.ok((useSystem()._stream as any).maxSize() <= 1024);
  }

  @test
  freshEachCall() {
    assert.notStrictEqual(useSystem(), useSystem());
  }

  @test
  async input() {
    assert.strictEqual(await useSystem({ a: 1 }).getRawInputAsString(), '{"a":1}');
    assert.strictEqual((await useSystem().getRawInput()).length, 0);
  }

  @test
  async runAsSystemGivesOperationContext() {
    const first = await runAsSystem(async () => useContext());
    const second = await runAsSystem(async () => useContext());
    assert.ok(first instanceof GlobalOperationContext);
    assert.ok(second instanceof GlobalOperationContext);
    assert.notStrictEqual(first, second);
  }

  @test
  fallbackUnchanged() {
    assert.ok(useContext() instanceof GlobalContext);
  }

  @test
  async importOrder() {
    vi.resetModules();
    await import("./operationcontext.js");
    const mod = await import("./globaloperationcontext.js");
    assert.strictEqual(mod.useSystem().getCurrentUserId(), "system");
  }
}
