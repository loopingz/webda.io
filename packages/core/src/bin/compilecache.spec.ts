import { suite, test } from "@webda/test";
import * as assert from "assert";
import { join } from "node:path";
import { vi } from "vitest";

const state = vi.hoisted(() => ({
  supported: true,
  status: 1,
  throws: false,
  calls: [] as string[]
}));

vi.mock("node:module", async importOriginal => {
  const original = await importOriginal<typeof import("node:module")>();
  return {
    ...original,
    get enableCompileCache() {
      if (!state.supported) return undefined;
      return (directory: string) => {
        state.calls.push(directory);
        if (state.throws) throw new Error("EACCES");
        return { status: state.status, directory };
      };
    }
  };
});

import { COMPILE_CACHE_FOLDER, enableCompileCache } from "./compilecache.js";

@suite
class CompileCacheTest {
  beforeEach() {
    state.supported = true;
    state.status = 1; // ENABLED
    state.throws = false;
    state.calls = [];
  }

  @test
  enabledInTheApplicationFolder() {
    const env: NodeJS.ProcessEnv = {};
    const directory = enableCompileCache("/app", env);
    assert.strictEqual(directory, join("/app", COMPILE_CACHE_FOLDER));
    assert.deepStrictEqual(state.calls, [join("/app", ".webda", "compile-cache")]);
    // Exported for the CLI child process
    assert.strictEqual(env.NODE_COMPILE_CACHE, directory);
  }

  @test
  keepsAnExplicitNodeCompileCache() {
    const env: NodeJS.ProcessEnv = { NODE_COMPILE_CACHE: "/tmp/cache" };
    state.status = 2; // ALREADY_ENABLED: Node enabled it at startup
    assert.strictEqual(enableCompileCache("/app", env), "/tmp/cache");
    assert.deepStrictEqual(state.calls, ["/tmp/cache"]);
    assert.strictEqual(env.NODE_COMPILE_CACHE, "/tmp/cache");
  }

  @test
  optOut() {
    for (const env of [
      { WEBDA_COMPILE_CACHE: "false" },
      { WEBDA_COMPILE_CACHE: " FALSE " },
      { WEBDA_COMPILE_CACHE: "0" },
      { NODE_DISABLE_COMPILE_CACHE: "1" }
    ] as NodeJS.ProcessEnv[]) {
      assert.strictEqual(enableCompileCache("/app", env), undefined);
      assert.strictEqual(env.NODE_COMPILE_CACHE, undefined);
    }
    assert.deepStrictEqual(state.calls, []);
    // Any other value keeps it enabled
    assert.ok(enableCompileCache("/app", { WEBDA_COMPILE_CACHE: "true" }));
  }

  @test
  unsupportedNode() {
    state.supported = false;
    const env: NodeJS.ProcessEnv = {};
    assert.strictEqual(enableCompileCache("/app", env), undefined);
    assert.strictEqual(env.NODE_COMPILE_CACHE, undefined);
  }

  @test
  failureNeverBlocksTheCli() {
    const env: NodeJS.ProcessEnv = {};
    state.status = 0; // FAILED, e.g. read-only folder
    assert.strictEqual(enableCompileCache("/app", env), undefined);
    state.throws = true;
    assert.strictEqual(enableCompileCache("/app", env), undefined);
    assert.strictEqual(env.NODE_COMPILE_CACHE, undefined);
  }
}
