import { suite, test } from "@webda/test";
import * as assert from "assert";
import { bootCoreForCommand, executeApplicationCommand, selectPhase } from "./cli-phase.js";

@suite
class CliPhaseTest {
  @test
  allResolvedReturnsResolved() {
    assert.strictEqual(selectPhase(["resolved", "resolved"]), "resolved");
  }

  @test
  singleUndefinedReturnsInitialized() {
    assert.strictEqual(selectPhase([undefined]), "initialized");
  }

  @test
  singleInitializedReturnsInitialized() {
    assert.strictEqual(selectPhase(["initialized"]), "initialized");
  }

  @test
  undefinedAndInitializedNormalizeToSame() {
    assert.strictEqual(selectPhase([undefined, "initialized"]), "initialized");
  }

  @test
  mixedResolvedAndInitializedThrows() {
    assert.throws(() => selectPhase(["resolved", "initialized"]), /inconsistent phases/);
  }

  @test
  mixedResolvedAndUndefinedThrows() {
    assert.throws(() => selectPhase(["resolved", undefined]), /inconsistent phases/);
  }

  @test
  errorMessageIncludesCommandName() {
    assert.throws(() => selectPhase(["resolved", "initialized"], "build"), /Command 'build' has inconsistent phases/);
  }

  @test
  allUndefinedReturnsInitialized() {
    assert.strictEqual(selectPhase([undefined, undefined]), "initialized");
  }

  @test
  emptyArrayReturnsInitialized() {
    // Document the choice: no declared phases = safest default (full init).
    assert.strictEqual(selectPhase([]), "initialized");
  }

  @test
  applicationPhase() {
    assert.strictEqual(selectPhase(["application", "application"]), "application");
    assert.throws(() => selectPhase(["application", "resolved"], "config encrypt"), /inconsistent phases/);
  }

  @test
  async applicationCommandCallsStaticMethodsWithoutCore() {
    const calls: any[] = [];
    class Tool {
      static async run(file: string, force?: boolean) {
        calls.push([file, force]);
      }
    }
    const cmdInfo: any = {
      description: "Tool",
      services: [{ name: "MyApp/Tool", type: "MyApp/Tool", method: "run" }],
      args: { file: { type: "string" }, force: { type: "boolean" } },
      requires: [],
      phases: ["application"]
    };
    const app = { getModda: (type: string) => (type === "MyApp/Tool" ? <any>Tool : undefined) };
    assert.strictEqual(await executeApplicationCommand(app, "tool", cmdInfo, { file: "a.json" }), 0);
    assert.deepStrictEqual(calls, [["a.json", undefined]]);
    // Core is never booted for it
    await assert.rejects(() => bootCoreForCommand(<any>{}, "tool", cmdInfo), /runs without Core/);
  }
}
