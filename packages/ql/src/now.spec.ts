import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import { bind } from "./bind.js";
import {
  DynamicValue,
  NowValue,
  parse,
  parseDurationToMs,
  PartialValidator,
  PrependCondition,
  QueryValidator,
  SetterValidator,
  validateSyntax
} from "./query.js";
import { WebdaQLError, type WebdaQLString } from "./webdaql-string.js";

@suite
class NowFunctionTest {
  @test
  parseDurationUnits() {
    assert.strictEqual(parseDurationToMs("10s"), 10000);
    assert.strictEqual(parseDurationToMs("10sec"), 10000);
    assert.strictEqual(parseDurationToMs("10seconds"), 10000);
    assert.strictEqual(parseDurationToMs("-10s"), -10000);
    assert.strictEqual(parseDurationToMs("+10s"), 10000);
    assert.strictEqual(parseDurationToMs("2m"), 120000);
    assert.strictEqual(parseDurationToMs("-10m"), -600000);
    assert.strictEqual(parseDurationToMs("+1d"), 86400000);
    assert.strictEqual(parseDurationToMs("-1d2h"), -93600000);
    assert.strictEqual(parseDurationToMs("1h30m"), 5400000);
    assert.strictEqual(parseDurationToMs("30"), 30000);
    assert.strictEqual(parseDurationToMs(-60), -60000);
    assert.strictEqual(parseDurationToMs(120), 120000);
  }

  @test
  invalidDurationsThrowWebdaQLError() {
    assert.throws(() => parseDurationToMs(""), WebdaQLError);
    assert.throws(() => parseDurationToMs("   "), WebdaQLError);
    assert.throws(() => parseDurationToMs("bogus"), WebdaQLError);
    assert.throws(() => parseDurationToMs("10xyz"), WebdaQLError);
    assert.throws(() => parseDurationToMs("10m bogus"), WebdaQLError);
    assert.throws(() => parseDurationToMs("1d -2h"), WebdaQLError);
  }

  @test
  grammarParsesNowVariants() {
    validateSyntax("expiresAt < NOW()");
    validateSyntax("mfaAt > NOW('-10m')");
    validateSyntax("mfaAt > NOW('+1d')");
    validateSyntax("mfaAt > NOW('-1d2h')");
    validateSyntax("mfaAt > NOW(:offset)");
    validateSyntax("mfaAt > NOW(?)");
    validateSyntax("mfaAt > NOW(60)");
    validateSyntax("mfaAt > NOW(-600)");
    validateSyntax("UPDATE SET updatedAt = NOW() WHERE id = 1");
    validateSyntax("UPDATE SET updatedAt = NOW('-5m')");
    validateSyntax("x IN [NOW(), 0]");
  }

  @test
  invalidDurationAtParseTimeThrowsWebdaQLError() {
    assert.throws(() => parse("expiresAt < NOW('bogus')"), WebdaQLError);
    assert.throws(() => parse("expiresAt < NOW('10xyz')"), WebdaQLError);
    assert.throws(() => parse("expiresAt < NOW('')"), WebdaQLError);
    assert.throws(() => parse("expiresAt < NOW('   ')"), WebdaQLError);
    assert.throws(() => parse("expiresAt < NOW('10m bogus')"), WebdaQLError);
  }

  @test
  lowercaseNowRemainsIdentifier() {
    const q1 = parse("now = 1");
    assert.strictEqual(q1.filter.toString(), "now = 1");

    const q2 = parse("UPDATE SET now = 1 WHERE id = 2");
    assert.deepStrictEqual(q2.assignments, [{ field: "now", value: 1 }]);

    assert.throws(() => parse("NOW = 1"), SyntaxError);
  }

  @test
  evalWithFakeClockReturnsDynamicResults() {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000000);
      const qv = new QueryValidator("expiresAt > NOW('-10s')");

      // At t = 1000000, NOW('-10s') = 990000. Target at 995000 is > 990000 (true)
      assert.strictEqual(qv.eval({ expiresAt: 995000 }), true);
      // Target at 980000 is not > 990000 (false)
      assert.strictEqual(qv.eval({ expiresAt: 980000 }), false);

      // Advance clock by 10s: now t = 1010000, NOW('-10s') = 1000000
      vi.advanceTimersByTime(10000);
      // Target at 995000 is now < 1000000 (false!) without reparsing
      assert.strictEqual(qv.eval({ expiresAt: 995000 }), false);

      // Now value is fresh on every eval
      const qvNow = new QueryValidator("expiresAt <= NOW()");
      assert.strictEqual(qvNow.eval({ expiresAt: 1010000 }), true);
      assert.strictEqual(qvNow.eval({ expiresAt: 1010001 }), false);
    } finally {
      vi.useRealTimers();
    }
  }

  @test
  isDynamicDetection() {
    assert.strictEqual(parse("expiresAt < NOW()").filter.isDynamic(), true);
    assert.strictEqual(parse("expiresAt < NOW('-10m')").filter.isDynamic(), true);
    assert.strictEqual(parse("a = 1 AND (b = 2 OR c > NOW())").filter.isDynamic(), true);
    assert.strictEqual(parse("a = 1 AND b = 2").filter.isDynamic(), false);
    assert.strictEqual(new QueryValidator("expiresAt < NOW()").isDynamic(), true);
    assert.strictEqual(new QueryValidator("a = 1").isDynamic(), false);
  }

  @test
  toStringRoundTripsNow() {
    for (const [query, expected] of [
      ["expiresAt < NOW()", "expiresAt < NOW()"],
      ["mfaAt > NOW('-10m')", "mfaAt > NOW('-10m')"],
      [
        "lastUsedAt < NOW('-30d') ORDER BY lastUsedAt ASC LIMIT 100",
        "lastUsedAt < NOW('-30d') ORDER BY lastUsedAt ASC LIMIT 100"
      ],
      ["UPDATE SET touchedAt = NOW() WHERE uuid = 'x'", 'UPDATE SET touchedAt = NOW() WHERE uuid = "x"'],
      ["UPDATE SET touchedAt = NOW('-10m') WHERE uuid = 'x'", "UPDATE SET touchedAt = NOW('-10m') WHERE uuid = \"x\""]
    ]) {
      const parsed = parse(query);
      assert.strictEqual(parsed.toString(), expected);
    }
  }

  @test
  mergePreservesDynamicValues() {
    const merged = PrependCondition("status = 'active'", "mfaAt > NOW('-10m')");
    assert.strictEqual(merged, "status = \"active\" AND mfaAt > NOW('-10m')");
    const qv = new QueryValidator(merged);
    assert.strictEqual(qv.isDynamic(), true);
  }

  @test
  partialValidatorRoundTripsAndEvaluates() {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000000);
      const pv = new PartialValidator("mfaAt > NOW('-10m')");
      assert.strictEqual(pv.toString(), "mfaAt > NOW('-10m')");
      assert.strictEqual(pv.isDynamic(), true);
      assert.strictEqual(pv.eval({ mfaAt: 900000 }), true); // 900000 > 400000
      assert.strictEqual(pv.eval({ mfaAt: 300000 }), false);
      // In partial mode, missing attribute is treated as match
      assert.strictEqual(pv.eval({}), true);
    } finally {
      vi.useRealTimers();
    }
  }

  @test
  bindHandlesParametersInsideNow() {
    const boundString = bind("mfaAt > NOW(?)", ["-10m"]);
    assert.strictEqual(boundString, "mfaAt > NOW('-10m')");

    const boundNamed = bind("mfaAt > NOW(:offset)", { offset: "+1d" });
    assert.strictEqual(boundNamed, "mfaAt > NOW('+1d')");

    const boundNumber = bind("mfaAt > NOW(?)", [-600]);
    assert.strictEqual(boundNumber, "mfaAt > NOW(-600)");

    const boundNamedNum = bind("mfaAt > NOW(:offset)", { offset: 30 });
    assert.strictEqual(boundNamedNum, "mfaAt > NOW(30)");

    const q = parse(boundString);
    assert.strictEqual(q.filter.isDynamic(), true);
  }

  @test
  updateSetNowAppliesResolvedTimestamp() {
    const parsed = parse("UPDATE SET touchedAt = NOW() WHERE uuid = 'x'");
    assert.strictEqual(parsed.type, "UPDATE");
    assert.strictEqual(parsed.assignments!.length, 1);
    const assignment = parsed.assignments![0];
    assert.strictEqual(assignment.field, "touchedAt");
    const val1 = assignment.value;
    assert.strictEqual(typeof val1, "number");
    assert.ok(Math.abs((val1 as number) - Date.now()) < 5000);

    // SetterValidator
    const setter = new SetterValidator("touchedAt = NOW()");
    const target: any = {};
    setter.eval(target);
    assert.strictEqual(typeof target.touchedAt, "number");
    assert.ok(Math.abs(target.touchedAt - Date.now()) < 5000);

    // With offset
    const setterOffset = new SetterValidator("touchedAt = NOW('-10m')");
    const targetOffset: any = {};
    setterOffset.eval(targetOffset);
    assert.strictEqual(typeof targetOffset.touchedAt, "number");
    assert.ok(Math.abs(targetOffset.touchedAt - (Date.now() - 600000)) < 5000);
  }

  @test
  webdaQLStringTypeAllowsNow() {
    const q1: WebdaQLString<{ mfaAt: number }> = "mfaAt > NOW('-10m')" as WebdaQLString<{ mfaAt: number }>;
    assert.strictEqual(typeof q1, "string");
    const q2: WebdaQLString<{ expiresAt: number }> = "expiresAt < NOW()" as WebdaQLString<{ expiresAt: number }>;
    assert.strictEqual(typeof q2, "string");
  }
}
