import { suite, test } from "@webda/test";
import * as assert from "assert";
import { compileAttachments, compilePolicies, validateStatements } from "./compiler.js";
import { PolicyCompileError } from "./conditions.js";
import { PolicyEngine } from "./engine.js";
import { iamGlobMatch, MAX_GLOB_PATTERN_LENGTH, MAX_GLOB_VALUE_LENGTH } from "./glob.js";

@suite
class GlobTest {
  @test
  matchesWildcards() {
    assert.strictEqual(iamGlobMatch("Tasks.Update", "Tasks.*"), true);
    assert.strictEqual(iamGlobMatch("Tasks.Update", "*"), true);
    assert.strictEqual(iamGlobMatch("Tasks.Update", "*.Update"), true);
    assert.strictEqual(iamGlobMatch("Tasks.Update", "Task?.Up*e"), true);
    assert.strictEqual(iamGlobMatch("Tasks.Update", "Tasks.Get"), false);
    assert.strictEqual(iamGlobMatch("Tasks", "Tasks.*"), false);
    assert.strictEqual(iamGlobMatch("", "*"), true);
    assert.strictEqual(iamGlobMatch("a", ""), false);
    assert.strictEqual(iamGlobMatch(undefined, "*"), false);
    assert.strictEqual(iamGlobMatch("a", 1), false);
  }

  @test
  starsDoNotCrossSlashes() {
    assert.strictEqual(iamGlobMatch("/public/a", "/public/*"), true);
    assert.strictEqual(iamGlobMatch("/public/a/b", "/public/*"), false);
    assert.strictEqual(iamGlobMatch("/private/a", "/public/*"), false);
  }

  @test
  bracesAndExtglobAreLiteral() {
    assert.strictEqual(iamGlobMatch("1", "{1..3}"), false);
    assert.strictEqual(iamGlobMatch("{1..3}", "{1..3}"), true);
    assert.strictEqual(iamGlobMatch("Op.Get", "Op.{Get,Delete}"), false);
    assert.strictEqual(iamGlobMatch("a", "+(a)"), false);
    assert.strictEqual(iamGlobMatch("a", "[a]"), false);
  }

  @test
  oversizedArgumentsThrow() {
    assert.throws(() => iamGlobMatch("a", "*".repeat(MAX_GLOB_PATTERN_LENGTH + 1)));
    assert.throws(() => iamGlobMatch("a".repeat(MAX_GLOB_VALUE_LENGTH + 1), "*"));
  }

  @test
  pathologicalPatternIsBounded() {
    const start = Date.now();
    assert.strictEqual(iamGlobMatch("a".repeat(MAX_GLOB_VALUE_LENGTH), "*a".repeat(300) + "*b"), false);
    assert.ok(Date.now() - start < 500, `took ${Date.now() - start}ms`);
  }

  @test
  operationPatternsAreValidated() {
    for (const op of ["Tasks.{Get,Delete}", "{1..100000}", "+(Tasks)", "Tasks.[GD]*", "a/b", "Tasks Get"]) {
      assert.throws(
        () => validateStatements([{ effect: "allow", operations: [op] }]),
        PolicyCompileError,
        JSON.stringify(op)
      );
    }
    validateStatements([{ effect: "allow", operations: ["*", "Tasks.*", "Task?.Get", "my-op_1.Get"] }]);
  }

  @test
  async conditionGlobMatchDoesNotExpandBraces() {
    const rows = compilePolicies([
      {
        name: "Glob",
        statements: [{ effect: "allow", operations: ["Tasks.*"], condition: "globMatch(r.ctx.input.a, r.ctx.input.b)" }]
      }
    ]);
    const { rows: links } = compileAttachments([{ principal: "anonymous", policy: "Glob" }], new Set(["Glob"]));
    const engine = await PolicyEngine.build(rows, links);
    const ctx = (input: any) => ({ operationId: "Tasks.Run", probe: false, input, now: Date.now() });
    const start = Date.now();
    assert.notStrictEqual(await engine.decide(["anonymous"], "Tasks.Run", ctx({ a: "5", b: "{1..100000}" })), true);
    assert.ok(Date.now() - start < 50, `took ${Date.now() - start}ms`);
    assert.strictEqual(
      await engine.decide(["anonymous"], "Tasks.Run", ctx({ a: "{1..100000}", b: "{1..100000}" })),
      true
    );
    assert.strictEqual(await engine.decide(["anonymous"], "Tasks.Run", ctx({ a: "abc", b: "a*" })), true);
    // Oversized arguments fail the condition: refused
    assert.notStrictEqual(
      await engine.decide(["anonymous"], "Tasks.Run", ctx({ a: "a".repeat(MAX_GLOB_VALUE_LENGTH + 1), b: "*" })),
      true
    );
  }
}
