import { suite, test } from "@webda/test";
import * as assert from "assert";
import { bind } from "./bind.js";
import { QueryValidator, validateSyntax } from "./query.js";
import { WebdaQLError } from "./webdaql-string.js";

/**
 * Check a bound query parses and evaluates against an object
 * @param query - the bound query
 * @param object - the object to evaluate
 * @returns the evaluation result
 */
function evaluate(query: string, object: any): boolean {
  return new QueryValidator(query).eval(object);
}

@suite
class BindTest {
  @test
  positional() {
    assert.strictEqual(bind("x = ? AND y = ?", [1, "a"]), "x = 1 AND y = 'a'");
    assert.strictEqual(bind("x=?", [1]), "x=1", "no spaces needed around a placeholder");
  }

  @test
  named() {
    assert.strictEqual(
      bind("x = :x AND y = :y OR z = :x", { x: 1, y: "a" }),
      "x = 1 AND y = 'a' OR z = 1",
      "a named parameter can be used several times"
    );
    assert.strictEqual(bind("x = :camelCase_1", { camelCase_1: true }), "x = TRUE");
  }

  @test
  noParametersLeavesQueryUnchanged() {
    assert.strictEqual(bind("x = 1"), "x = 1");
    assert.strictEqual(bind("x = 1", []), "x = 1");
    assert.strictEqual(bind("x = 1", {}), "x = 1");
    assert.strictEqual(bind(""), "");
  }

  @test
  placeholdersInsideStringsAreLeftAlone() {
    assert.strictEqual(bind("name = '?' AND x = ?", [1]), "name = '?' AND x = 1");
    assert.strictEqual(bind('t = "10:30" AND x = :x', { x: 1 }), 't = "10:30" AND x = 1');
    assert.strictEqual(bind("a = 'it''s ?' AND b = ?", ["c"]), "a = 'it''s ?' AND b = 'c'");
    assert.strictEqual(bind("a = 'x\\' ?' AND b = ?", ["c"]), "a = 'x\\' ?' AND b = 'c'");
  }

  @test
  valueTypes() {
    const date = new Date("2026-05-03T12:00:00.000Z");
    assert.strictEqual(bind("x = ?", [42]), "x = 42");
    assert.strictEqual(bind("x = ?", [-7]), "x = -7");
    assert.strictEqual(bind("x = ?", [3.14]), "x = 3.14");
    assert.strictEqual(bind("x = ?", [false]), "x = FALSE");
    assert.strictEqual(bind("t = ?", [date]), "t = '2026-05-03T12:00:00.000Z'");
    assert.strictEqual(bind("x IN ?", [["a", "b"]]), "x IN ['a', 'b']");
    assert.strictEqual(bind("x IN [?, ?]", [1, "b"]), "x IN [1, 'b']");
    assert.strictEqual(bind("x LIKE ?", ["a%"]), "x LIKE 'a%'");
    assert.strictEqual(bind("tags CONTAINS :t", { t: "x" }), "tags CONTAINS 'x'");
    assert.strictEqual(bind("x = 1 LIMIT ? OFFSET ?", [10, "token"]), "x = 1 LIMIT 10 OFFSET 'token'");
    // Every bound query parses back to the values
    assert.ok(evaluate(bind("x = ? AND y = ?", [-7, 3.14]), { x: -7, y: 3.14 }));
    assert.ok(evaluate(bind("x IN ?", [["a", "b"]]), { x: "b" }));
    assert.ok(!evaluate(bind("x IN ?", [["a", "b"]]), { x: "c" }));
    assert.strictEqual(new QueryValidator(bind("x = 1 LIMIT ?", [5])).getLimit(), 5);
  }

  @test
  nullRewrites() {
    assert.strictEqual(bind("x = ?", [null]), "x IS NULL");
    assert.strictEqual(bind("x != :v", { v: undefined }), "x IS NOT NULL");
    assert.ok(evaluate(bind("x = ? AND y = ?", [null, 1]), { y: 1 }));
    for (const query of ["x > ?", "x IN ?", "x LIKE ?", "x IN [?]", "x = 1 LIMIT ?", "x = 1 OFFSET ?"]) {
      assert.throws(() => bind(query, [null]), WebdaQLError, query);
    }
  }

  @test
  injectionStaysAValue() {
    for (const value of ["' OR 1=1 --", "x' OR name != 'y", '" OR TRUE OR "', "\\' OR TRUE --", "1 OR TRUE"]) {
      const query = bind("name = ?", [value]);
      const validator = new QueryValidator(query);
      assert.strictEqual(validator.getExpression().toString(), new QueryValidator(query).getExpression().toString());
      assert.ok(validator.eval({ name: value }), `matches the literal value ${value}`);
      assert.ok(!validator.eval({ name: "other" }), `does not match other values for ${value}`);
    }
    assert.ok(!evaluate(bind("name = :n", { n: "' OR 1=1 --" }), { name: "admin" }));
  }

  @test
  missingAndExtraParameters() {
    assert.throws(() => bind("x = ? AND y = ?", [1]), /2 positional parameters.*1 value/);
    assert.throws(() => bind("x = ?", [1, 2]), /1 positional parameter.*2 values/);
    assert.throws(() => bind("x = ?"), WebdaQLError);
    assert.throws(() => bind("x = :x", {}), /Missing named parameter ':x'/);
    assert.throws(() => bind("x = :x", { x: 1, y: 2 }), /Unused named parameter 'y'/);
    assert.throws(() => bind("x = :constructor", {}), /Missing named parameter ':constructor'/);
    assert.throws(() => bind("x = 1", [1]), WebdaQLError);
    assert.throws(() => bind("x = 1", { a: 1 }), WebdaQLError);
    assert.throws(() => bind("x = :x", [1]), /named parameters need an object/);
    assert.throws(() => bind("x = ?", { x: 1 }), /positional parameters need an array/);
  }

  @test
  cannotMixPositionalAndNamed() {
    assert.throws(() => bind("x = ? AND y = :y", { y: 1 }), /Cannot mix/);
    assert.throws(() => bind("x = ? AND y = :y", [1]), /Cannot mix/);
  }

  @test
  placeholdersOnlyInValuePositions() {
    for (const query of ["? = 1", "x ? 1", "x = 1 ORDER BY ?", "x IS ?", "?", "x = 1 AND ?", ":x = 1"]) {
      assert.throws(() => validateSyntax(query), SyntaxError, query);
      assert.throws(() => bind(query, query.includes(":") ? { x: "y" } : ["y"]), query);
    }
  }

  @test
  unrepresentableValues() {
    assert.throws(() => bind("x = ?", [NaN]), WebdaQLError);
    assert.throws(() => bind("x = ?", [1e21]), WebdaQLError);
    assert.throws(() => bind("x = ?", [{ a: 1 }]), WebdaQLError);
    assert.throws(() => bind("x IN ?", [[]]), WebdaQLError);
    assert.throws(() => bind("x IN ?", [[[1]]]), WebdaQLError);
    // A value that is valid but not in its position still fails, after binding
    assert.throws(() => bind("x = ?", [["a"]]), WebdaQLError);
  }

  @test
  unboundQueriesAreRejected() {
    assert.doesNotThrow(() => validateSyntax("x = ? AND y IN [?, ?] AND z = :z LIMIT ? OFFSET ?"));
    assert.throws(() => new QueryValidator("x = ?"), /Unbound parameter '\?'/);
    assert.throws(() => new QueryValidator("x = :x"), /Unbound parameter ':x'/);
  }

  @test
  lexerErrorsAreNotSilentlyIgnored() {
    // A character the lexer does not know used to be dropped: `x = #1` parsed as `x = 1`
    assert.throws(() => new QueryValidator("x = #1"), SyntaxError);
    assert.throws(() => validateSyntax("x = #1"), SyntaxError);
  }
}
