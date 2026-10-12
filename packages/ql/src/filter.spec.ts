import { suite, test } from "@webda/test";
import * as assert from "assert";
import { filterToExpression, toWebdaQL } from "./filter.js";
import { WebdaQLError } from "./webdaql-string.js";

@suite
class FilterTest {
  @test
  convertsFilters() {
    assert.strictEqual(toWebdaQL({ a: 1, b: 2 }), "a = 1 AND b = 2");
    assert.strictEqual(toWebdaQL({ a: null }), "a IS NULL");
    assert.strictEqual(toWebdaQL({ a: { $ne: null } }), "a IS NOT NULL");
    assert.strictEqual(toWebdaQL({ a: { $gte: 2, $lt: 10 } }), "a >= 2 AND a < 10");
    assert.strictEqual(toWebdaQL({ a: { $in: ["x", "y"] } }), "a IN ['x', 'y']");
    assert.strictEqual(toWebdaQL({ a: { $like: "Do%" } }), "a LIKE 'Do%'");
    assert.strictEqual(toWebdaQL({ tags: { $contains: "urgent" } }), "tags CONTAINS 'urgent'");
    assert.strictEqual(toWebdaQL({ a: { $exists: false } }), "a IS NULL");
    assert.strictEqual(toWebdaQL({ $or: [{ a: 1 }, { b: 2 }] }), "( a = 1 ) OR ( b = 2 )");
    assert.strictEqual(toWebdaQL({ "profile.verified": true }), "profile.verified = TRUE");
    assert.strictEqual(toWebdaQL({}), "");
  }

  @test
  refusesInjectionAndInvalidValues() {
    assert.throws(() => filterToExpression({ "a' OR 1=1 --": 1 } as any), WebdaQLError);
    assert.throws(() => toWebdaQL({ a: { $nor: [] } } as any), WebdaQLError);
    assert.throws(() => toWebdaQL({ a: { $in: [] } } as any), WebdaQLError);
    assert.strictEqual(toWebdaQL({ a: "it's safe" }), "a = 'it''s safe'");
  }
}
