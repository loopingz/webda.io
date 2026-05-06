import { suite, test } from "@webda/test";
import * as assert from "assert";
import { escape, WebdaQLError, type WebdaQLString } from "./webdaql-string.js";

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
    assert.strictEqual(escape(["path = ", ""], ["a\\b"]), "path = 'a\\b'");
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
  }

  @test
  escapeEmitsBooleansAsTrueFalse() {
    assert.strictEqual(escape(["ok = ", ""], [true]), "ok = TRUE");
    assert.strictEqual(escape(["ok = ", ""], [false]), "ok = FALSE");
  }

  @test
  escapeEmitsNullUndefinedAsNull() {
    assert.strictEqual(escape(["x = ", ""], [null]), "x = NULL");
    assert.strictEqual(escape(["x = ", ""], [undefined]), "x = NULL");
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
    assert.strictEqual(escape(["tags IN ", ""], [["a", "b", "c"]]), "tags IN ('a', 'b', 'c')");
  }

  @test
  escapeEmitsNumberArraysTheSameWay() {
    assert.strictEqual(escape(["x IN ", ""], [[1, 2, 3]]), "x IN (1, 2, 3)");
  }

  @test
  escapeSupportsMixedScalarArrays() {
    assert.strictEqual(escape(["x IN ", ""], [[1, "two", true, null]]), "x IN (1, 'two', TRUE, NULL)");
  }

  @test
  escapeEscapesEmbeddedQuotesInsideStringArrays() {
    assert.strictEqual(escape(["x IN ", ""], [["O'Brien"]]), "x IN ('O''Brien')");
  }

  @test
  escapeEmitsEmptyArraysAsParens() {
    assert.strictEqual(escape(["x IN ", ""], [[]]), "x IN ()");
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
}
