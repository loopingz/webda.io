import { suite, test } from "@webda/test";
import * as assert from "assert";
import { selectPhase } from "./cli-phase.js";

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
    assert.throws(
      () => selectPhase(["resolved", "initialized"], "build"),
      /Command 'build' has inconsistent phases/
    );
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
}
