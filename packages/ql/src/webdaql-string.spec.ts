import { suite, test } from "@webda/test";
import * as assert from "assert";
import { escape, WebdaQLError, type WebdaQLString } from "./webdaql-string.js";
import { parse, QueryValidator } from "./query.js";

@suite
class WebdaQLStringTest {
  @test
  brandIsStructurallyAStringAtRuntime() {
    const q: WebdaQLString<{ name: string }> = "name = 'x'" as WebdaQLString<{ name: string }>;
    assert.strictEqual(typeof q, "string");
    assert.strictEqual(q, "name = 'x'");
  }

  @test
  escapeWrapsStringsInSingleQuotes() {
    assert.strictEqual(escape(["name = ", ""], ["alice"]), "name = 'alice'");
  }

  @test
  escapeDoublesEmbeddedSingleQuotes() {
    assert.strictEqual(escape(["name = ", ""], ["O'Brien"]), "name = 'O''Brien'");
  }

  @test
  escapePreservesBackslashesVerbatim() {
    assert.strictEqual(escape(["path = ", ""], ["a\\b"]), "path = 'a\\\\b'");
  }

  @test
  escapeSupportsMultiByteUnicodeStrings() {
    assert.strictEqual(escape(["x = ", ""], ["café"]), "x = 'café'");
  }

  @test
  escapeSupportsMultipleValues() {
    assert.strictEqual(escape(["name = ", " AND age = ", ""], ["alice", 30]), "name = 'alice' AND age = 30");
  }

  @test
  escapeEmitsNumbersVerbatim() {
    assert.strictEqual(escape(["age = ", ""], [42]), "age = 42");
    assert.strictEqual(escape(["x = ", ""], [3.14]), "x = 3.14");
    assert.strictEqual(escape(["x = ", ""], [-7]), "x = -7");
    assert.ok(new QueryValidator(escape(["x = ", " AND y = ", ""], [-7, 3.14])).eval({ x: -7, y: 3.14 }));
    // Numbers WebdaQL cannot write are rejected rather than rendered as `1e+21`
    assert.throws(() => escape(["x = ", ""], [1e21]), WebdaQLError);
    assert.throws(() => escape(["x = ", ""], [1e-7]), WebdaQLError);
  }

  @test
  escapeEmitsBooleansAsTrueFalse() {
    assert.strictEqual(escape(["ok = ", ""], [true]), "ok = TRUE");
    assert.strictEqual(escape(["ok = ", ""], [false]), "ok = FALSE");
  }

  @test
  escapeRewritesEqualNullToIsNull() {
    for (const value of [null, undefined]) {
      assert.strictEqual(escape(["x = ", ""], [value]), "x IS NULL");
      assert.strictEqual(escape(["x=", ""], [value]), "x IS NULL");
      assert.strictEqual(escape(["x != ", ""], [value]), "x IS NOT NULL");
      assert.strictEqual(escape(["x!=", ""], [value]), "x IS NOT NULL");
      assert.strictEqual(
        escape(["a = ", " AND x != ", " OR y = ", ""], [1, value, "z"]),
        "a = 1 AND x IS NOT NULL OR y = 'z'"
      );
    }
  }

  @test
  escapeNullOutputParses() {
    for (const [query, expected] of [
      [escape(["x = ", ""], [null]), "x IS NULL"],
      [escape(["x != ", " AND y = ", ""], [undefined, 2]), "x IS NOT NULL AND y = 2"],
      [escape(["(x = ", " OR y = ", ") AND z = ", ""], [null, "a", true]), "(x IS NULL OR y = 'a') AND z = TRUE"]
    ]) {
      assert.strictEqual(new QueryValidator(query).toString(), new QueryValidator(expected).toString());
    }
    assert.strictEqual(new QueryValidator(escape(["x = ", ""], [null])).eval({ y: 1 }), true);
    assert.strictEqual(new QueryValidator(escape(["x != ", ""], [null])).eval({ x: 0 }), true);
  }

  @test
  escapeRejectsNullWithOtherOperators() {
    for (const prefix of ["x > ", "x >= ", "x < ", "x <= ", "x LIKE ", "x CONTAINS ", "x IN ", ""]) {
      assert.throws(() => escape([prefix, ""], [null]), WebdaQLError, `'${prefix}' with null`);
      assert.throws(() => escape([prefix, ""], [undefined]), WebdaQLError, `'${prefix}' with undefined`);
    }
  }

  @test
  escapeEmitsDateAsIsoStringInSingleQuotes() {
    const d = new Date("2026-05-03T12:00:00.000Z");
    assert.strictEqual(escape(["t = ", ""], [d]), "t = '2026-05-03T12:00:00.000Z'");
  }

  @test
  escapeRejectsNaN() {
    assert.throws(() => escape(["x = ", ""], [NaN]), WebdaQLError);
  }

  @test
  escapeRejectsInfinity() {
    assert.throws(() => escape(["x = ", ""], [Infinity]), WebdaQLError);
    assert.throws(() => escape(["x = ", ""], [-Infinity]), WebdaQLError);
  }

  @test
  escapeEmitsStringArraysAsParenthesisedCommaSeparated() {
    assert.strictEqual(escape(["tags IN ", ""], [["a", "b", "c"]]), "tags IN ['a', 'b', 'c']");
    assert.ok(new QueryValidator(escape(["tags IN ", ""], [["a", "b", "c"]])).eval({ tags: "b" }));
  }

  @test
  escapeEmitsNumberArraysTheSameWay() {
    assert.strictEqual(escape(["x IN ", ""], [[1, 2, 3]]), "x IN [1, 2, 3]");
  }

  @test
  escapeSupportsMixedScalarArrays() {
    assert.strictEqual(escape(["x IN ", ""], [[1, "two", true]]), "x IN [1, 'two', TRUE]");
  }

  @test
  escapeRejectsNullInsideArrays() {
    assert.throws(() => escape(["x IN ", ""], [[1, null]]), WebdaQLError);
    assert.throws(() => escape(["x IN ", ""], [[undefined]]), WebdaQLError);
  }

  @test
  escapeEscapesEmbeddedQuotesInsideStringArrays() {
    assert.strictEqual(escape(["x IN ", ""], [["O'Brien"]]), "x IN ['O''Brien']");
  }

  @test
  escapeRejectsEmptyArrays() {
    // WebdaQL sets cannot be empty
    assert.throws(() => escape(["x IN ", ""], [[]]), WebdaQLError);
  }

  @test
  escapeRejectsNestedArrays() {
    assert.throws(() => escape(["x = ", ""], [[[1, 2]]]), WebdaQLError);
  }

  @test
  escapeRejectsPlainObjects() {
    assert.throws(() => escape(["x = ", ""], [{ a: 1 }]), WebdaQLError);
  }

  @test
  escapeRejectsFunctions() {
    assert.throws(() => escape(["x = ", ""], [() => 1]), WebdaQLError);
  }

  @test
  escapeRejectsSymbols() {
    assert.throws(() => escape(["x = ", ""], [Symbol("s")]), WebdaQLError);
  }

  @test
  escapeRejectsBigints() {
    assert.throws(() => escape(["x = ", ""], [10n]), WebdaQLError);
  }

  @test
  escapeRejectionMessageNamesTheOffendingValueType() {
    try {
      escape(["x = ", ""], [{ a: 1 }]);
      throw new Error("did not throw");
    } catch (err) {
      assert.ok(err instanceof WebdaQLError);
      assert.match((err as WebdaQLError).message, /object/);
    }
  }

  @test
  async publicApiSurfaceReExportsFromPackageRoot() {
    const mod = await import("./index.js");
    assert.ok(mod.escape !== undefined);
    assert.ok(mod.WebdaQLError !== undefined);
    // WebdaQLString is a type — verify via runtime no-op
    const q: import("./index.js").WebdaQLString<{ x: string }> = "x = 'a'" as any;
    assert.strictEqual(q, "x = 'a'");
  }

  @test
  escapedValuesMatchAndRoundTrip() {
    const values = ['it\'s "quoted"', "a\\'b", "trailing\\", "back\\\\slash", "\\' OR k != '"];
    for (const value of values) {
      const query = escape(["k = ", ""], [value]);
      // Match only the correct value
      assert.ok(new QueryValidator(query).eval({ k: value }), `Failed to match ${value}`);
      // Should not match other values
      assert.ok(!new QueryValidator(query).eval({ k: "other" }), `Incorrectly matched other for ${value}`);
      // toString() re-escapes, so a parsed filter can be serialized and parsed again
      const serialized = parse(query).filter.toString();
      assert.ok(new QueryValidator(serialized).eval({ k: value }), `Failed round-trip for ${value}`);
      assert.ok(
        !new QueryValidator(serialized).eval({ k: "other" }),
        `Incorrectly matched other in round-trip for ${value}`
      );
    }
  }
}
