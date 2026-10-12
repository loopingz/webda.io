import { suite, test } from "@webda/test";
import * as assert from "assert";
import { filterToExpression, toWebdaQL } from "./filter.js";
import { QueryValidator } from "./query.js";
import { WebdaQLError } from "./webdaql-string.js";

@suite
class FilterTest {
  @test
  convertsFilters() {
    assert.strictEqual(toWebdaQL({ a: 1, b: 2 }), "a = 1 AND b = 2");
    assert.strictEqual(toWebdaQL({ a: null }), "a IS NULL");
    assert.strictEqual(toWebdaQL({ a: { $ne: null } }), "a IS NOT NULL");
    assert.strictEqual(toWebdaQL({ a: { $gte: 2, $lt: 10 } }), "a >= 2 AND a < 10");
    assert.strictEqual(toWebdaQL({ a: { $in: ["x", "y"] } }), 'a IN ["x", "y"]');
    assert.strictEqual(toWebdaQL({ a: { $like: "Do%" } }), 'a LIKE "Do%"');
    assert.strictEqual(toWebdaQL({ tags: { $contains: "urgent" } }), 'tags CONTAINS "urgent"');
    assert.strictEqual(toWebdaQL({ a: { $exists: false } }), "a IS NULL");
    assert.strictEqual(toWebdaQL({ $or: [{ a: 1 }, { b: 2 }] }), "a = 1 OR b = 2");
    assert.strictEqual(toWebdaQL({ $or: [{ a: 1 }, { b: 2 }], c: 3 }), "( a = 1 OR b = 2 ) AND c = 3");
    assert.strictEqual(toWebdaQL({ "profile.verified": true }), "profile.verified = TRUE");
    assert.strictEqual(toWebdaQL({}), "");
    const date = new Date("2026-01-02T03:04:05.000Z");
    assert.strictEqual(toWebdaQL({ due: date }), 'due = "2026-01-02T03:04:05.000Z"');
    assert.strictEqual(toWebdaQL({ due: { $gte: date } }), 'due >= "2026-01-02T03:04:05.000Z"');
    assert.strictEqual(toWebdaQL({ due: { $in: [date] } }), 'due IN ["2026-01-02T03:04:05.000Z"]');
    assert.throws(() => toWebdaQL({ due: new Date("nope") }), WebdaQLError);
    // Evaluation compares stored dates as ISO strings
    const target = { due: new Date("2026-01-02T03:04:05.000Z") };
    assert.ok(new QueryValidator(toWebdaQL({ due: date })).eval(target));
    assert.ok(new QueryValidator(toWebdaQL({ due: { $lt: new Date("2026-02-01T00:00:00.000Z") } })).eval(target));
    assert.ok(!new QueryValidator(toWebdaQL({ due: { $gt: date } })).eval(target));
  }

  @test
  handlesUndefinedNestedAndEmpty() {
    assert.strictEqual(toWebdaQL({ a: undefined, b: 2 }), "b = 2");
    assert.strictEqual(toWebdaQL({ $or: undefined, b: 2 }), "b = 2");
    assert.strictEqual(toWebdaQL({ a: { $gte: undefined, $lt: 10 } }), "a < 10");
    assert.strictEqual(toWebdaQL({ address: { city: "Paris", zip: undefined } }), 'address.city = "Paris"');
    assert.strictEqual(toWebdaQL({ a: { b: { c: 1 } } }), "a.b.c = 1");
    assert.throws(() => toWebdaQL({ a: {} }), /Empty filter object/);
    assert.throws(() => toWebdaQL({ a: { b: {} } }), /Empty filter object/);
    assert.throws(() => toWebdaQL({ a: { $gt: 1, b: 2 } } as any), /Cannot mix/);
    assert.throws(() => toWebdaQL({ a: { $contains: 5 } } as any), /\$contains takes a string/);
  }

  @test
  dateEvalKeepsNumericComparison() {
    const target = { due: new Date(1800000000000) };
    assert.ok(new QueryValidator("due > 1700000000000").eval(target));
    assert.ok(!new QueryValidator("due < 1700000000000").eval(target));
    assert.ok(new QueryValidator(`due > "2020-01-01T00:00:00.000Z"`).eval(target));
    assert.ok(new QueryValidator(`due IN ["${target.due.toISOString()}"]`).eval(target));
  }

  @test
  refusesInjectionAndInvalidValues() {
    assert.throws(() => filterToExpression({ "a' OR 1=1 --": 1 } as any), WebdaQLError);
    assert.throws(() => filterToExpression({ $or: [{ "a = 1 OR b": 1 }] } as any), WebdaQLError);
    assert.throws(() => toWebdaQL({ a: { $nor: [] } } as any), WebdaQLError);
    assert.throws(() => toWebdaQL({ a: { $in: [] } } as any), WebdaQLError);
    assert.throws(() => toWebdaQL({ $or: [] }), WebdaQLError);
    assert.throws(() => toWebdaQL({ $and: [] }), WebdaQLError);
    assert.strictEqual(toWebdaQL({ a: 'it\'s "safe"' }), 'a = "it\'s ""safe"""');
  }
}
