import { suite, test } from "@webda/test";
import * as assert from "assert";
import { AggregationError, validateAggregation, type AggregationQuery } from "./aggregation.js";
import { AndExpression } from "./query.js";
import { WebdaQLError } from "./webdaql-string.js";

/**
 * Build a valid aggregation query, overridden by the given fields
 * @param over - fields to override
 * @returns the query
 */
function q(over: Partial<AggregationQuery> = {}): AggregationQuery {
  return {
    filter: new AndExpression([]),
    groupBy: ["status"],
    metrics: { n: { fn: "COUNT" } },
    ...over
  };
}

@suite
class ValidateAggregationTest {
  @test
  valid() {
    const query = q({
      groupBy: ["status", "owner.uuid"],
      metrics: { n: { fn: "COUNT" }, total: { fn: "SUM", field: "points" }, d: { fn: "COUNT_DISTINCT", field: "tag" } },
      orderBy: [
        { key: "n", direction: "DESC" },
        { key: "owner.uuid", direction: "ASC" }
      ],
      limit: 10
    });
    assert.strictEqual(validateAggregation(query), query);
  }

  @test
  rejects() {
    const bad: [string, Partial<AggregationQuery>][] = [
      ["no metric", { metrics: {} }],
      ["bad path", { groupBy: ["a b"] }],
      ["proto path", { groupBy: ["__proto__.x"] }],
      ["constructor path", { groupBy: ["a.constructor"] }],
      ["duplicate group", { groupBy: ["a", "a"] }],
      ["bad alias", { metrics: { "1n": { fn: "COUNT" } } }],
      ["underscore alias", { metrics: { _id: { fn: "COUNT" } } }],
      ["reserved alias", { metrics: { constructor: { fn: "COUNT" } } }],
      ["alias clash", { metrics: { status: { fn: "COUNT" } } }],
      ["unknown fn", { metrics: { n: { fn: "MEDIAN" as any, field: "a" } } }],
      ["missing field", { metrics: { n: { fn: "SUM" } } }],
      ["bad field", { metrics: { n: { fn: "SUM", field: "a;drop" } } }],
      ["unknown order key", { orderBy: [{ key: "nope", direction: "ASC" }] }],
      ["bad direction", { orderBy: [{ key: "n", direction: "UP" as any }] }],
      ["zero limit", { limit: 0 }],
      ["float limit", { limit: 1.5 }]
    ];
    for (const [name, over] of bad) {
      assert.throws(() => validateAggregation(q(over)), WebdaQLError, name);
    }
  }

  @test
  errorCode() {
    const err = new AggregationError("AGGREGATION_NOT_NATIVE", "nope");
    assert.ok(err instanceof WebdaQLError);
    assert.strictEqual(err.code, "AGGREGATION_NOT_NATIVE");
    assert.strictEqual(err.name, "AggregationError");
  }
}
