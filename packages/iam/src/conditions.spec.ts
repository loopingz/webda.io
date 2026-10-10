import { suite, test } from "@webda/test";
import * as assert from "assert";
import { analyzeCondition, PolicyCompileError } from "./conditions.js";

@suite
class ConditionsTest {
  @test
  acceptsSupportedExpressions() {
    for (const condition of [
      "r.ctx.input.status != 'archived'",
      "r.ctx.input.amount < 1000 && r.ctx.user.uuid == r.ctx.input.owner",
      "includes(r.ctx.user.groups, 'admins') || !r.ctx.input.draft",
      "globMatch(r.ctx.input.path, '/public/*')",
      "ipMatch(r.ctx.http.ip, '10.0.0.0/8')",
      "r.ctx.input['status'] == 'open' ? true : false",
      "r.ctx.now % 2 == 0",
      "includes(['a', 'b'], r.ctx.input.kind)"
    ]) {
      assert.doesNotThrow(() => analyzeCondition(condition), condition);
    }
  }

  @test
  detectsInputReads() {
    assert.strictEqual(analyzeCondition("r.ctx.input.status == 'x'").readsInput, true);
    assert.strictEqual(analyzeCondition("r.ctx['input'].status == 'x'").readsInput, true);
    assert.strictEqual(analyzeCondition("includes(r.ctx.user.groups, 'a')").readsInput, false);
    assert.strictEqual(analyzeCondition("r.ctx.http.method == 'GET'").readsInput, false);
  }

  @test
  rejectsEscapes() {
    for (const condition of [
      "r.ctx.constructor.constructor('return process')()",
      "r.ctx.input.__proto__",
      "r.ctx.input.prototype",
      "r.ctx.input[r.ctx.input.key]",
      "process.exit()",
      "r.sub",
      "r",
      "this",
      "eval('1')",
      "regexMatch(r.ctx.input.name, '(a+)+$')",
      "r.ctx.input.toString()",
      "a, b",
      "includes.constructor('return process')()",
      "includes(r.ctx.input.a, 1).length",
      "typeof r.ctx.input.a",
      "r.ctx.input.a++"
    ]) {
      assert.throws(() => analyzeCondition(condition), PolicyCompileError, condition);
    }
  }

  @test
  rejectsLiteralKeyEscapes() {
    for (const condition of ["r.ctx['constructor']", "r.ctx.input['__proto__'].x", "r['ctx'].input['prototype']"]) {
      assert.throws(() => analyzeCondition(condition), PolicyCompileError, condition);
    }
  }

  @test
  rejectsConditionsCasbinWouldNotRewrite() {
    for (const condition of [
      "true?r.ctx.input.x:0",
      "[r.ctx.input.x]",
      "~r.ctx.input.x",
      "r.ctx.input.x^r.ctx.input.x",
      "r.ctx.input.x%r.ctx.input.x",
      "r .ctx.input.x",
      "(r).ctx.input.x",
      "r['ctx'].input.x",
      "r.ctx.input.s == ' r.ctx'"
    ]) {
      assert.throws(() => analyzeCondition(condition), PolicyCompileError, condition);
    }
  }

  @test
  rejectsSyntaxErrors() {
    assert.throws(() => analyzeCondition("r.ctx.input.status =="), PolicyCompileError);
  }
}
