import { suite, test } from "@webda/test";
import * as assert from "assert";
import { shouldDispatchBuildHooks } from "./shell-build-dispatch";

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
}
