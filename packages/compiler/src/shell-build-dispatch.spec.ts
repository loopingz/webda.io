import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldDispatchBuildHooks, spawnWebdaBuild } from "./shell-build-dispatch.js";

@suite
class ShellBuildDispatchTest {
  @test
  async returnsTrueWhenConfiguredModdaHasBuildCommand() {
    const mod = {
      moddas: {
        "Webda/GrpcService": { commands: { build: { description: "Generate proto" } } },
        "Webda/MemoryStore": {}
      },
      beans: {}
    };
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["Webda/GrpcService", "Webda/MemoryStore"]), true);
  }

  @test
  async returnsTrueWhenConfiguredBeanHasBuildCommand() {
    const mod = {
      moddas: {},
      beans: {
        "MyApp/BuildBean": { commands: { build: {} } }
      }
    };
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["MyApp/BuildBean"]), true);
  }

  @test
  async returnsFalseWhenNoConfiguredTypeHasBuildCommand() {
    const mod = {
      moddas: {
        "Webda/GrpcService": { commands: { build: {} } }
      },
      beans: {}
    };
    // Configured services do not include GrpcService
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["Webda/MemoryStore"]), false);
  }

  @test
  async returnsFalseWhenModuleHasNoBuildCommands() {
    const mod = {
      moddas: {
        "Webda/GrpcService": {},
        "Webda/MemoryStore": {}
      },
      beans: {}
    };
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["Webda/GrpcService", "Webda/MemoryStore"]), false);
  }

  @test
  async handlesMissingModdasAndBeansSections() {
    const mod = {};
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["Webda/GrpcService"]), false);
  }

  @test
  async ignoresServicesWithCommandsButNotBuild() {
    const mod = {
      moddas: {
        "Webda/GrpcService": { commands: { deploy: {}, lint: {} } }
      },
      beans: {}
    };
    assert.strictEqual(shouldDispatchBuildHooks(mod, ["Webda/GrpcService"]), false);
  }

  @test
  async returnsFalseForEmptyConfiguredTypes() {
    const mod = {
      moddas: {
        "Webda/GrpcService": { commands: { build: {} } }
      },
      beans: {}
    };
    assert.strictEqual(shouldDispatchBuildHooks(mod, []), false);
  }

  @test
  async spawnsWebdaBuildAndHandlesExitSignalAndFallbackError() {
    const dir = mkdtempSync(join(tmpdir(), "webda-dispatch-"));
    try {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }));
      const coreBinDir = join(dir, "node_modules", "@webda", "core", "lib", "bin");
      mkdirSync(coreBinDir, { recursive: true });
      writeFileSync(
        join(dir, "node_modules", "@webda", "core", "package.json"),
        JSON.stringify({ name: "@webda/core", version: "1.0.0" })
      );
      const launcherPath = join(coreBinDir, "launcher.js");

      // 1. Successful exit with deployment argument
      writeFileSync(
        launcherPath,
        `if (process.argv.includes("-d") && process.argv.includes("Prod") && process.env.WEBDA_BUILD_DISPATCH === "1") process.exit(0); process.exit(2);`
      );
      const code = await spawnWebdaBuild(dir, "Prod");
      assert.strictEqual(code, 0);

      // 2. Terminated by signal -> exit code is null -> resolves to 1
      writeFileSync(launcherPath, `process.kill(process.pid, "SIGTERM");`);
      const sigCode = await spawnWebdaBuild(dir);
      assert.strictEqual(sigCode, 1);

      // 3. Fallback when createRequire throws (relative cwd) and spawn emits error (non-existent cwd)
      await assert.rejects(() => spawnWebdaBuild("./non-existent-relative-cwd-xyz"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
