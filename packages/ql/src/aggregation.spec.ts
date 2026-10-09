import { suite, test } from "@webda/test";
import * as assert from "assert";
import {
  Aggregator,
  AggregationError,
  compareValues,
  toAggregationQuery,
  validateAggregation,
  type AggregationQuery
} from "./aggregation.js";
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
      ["reserved alias", { metrics: { constructor: { fn: "COUNT" } } as any }],
      ["alias clash", { metrics: { status: { fn: "COUNT" } } }],
      ["unknown fn", { metrics: { n: { fn: "MEDIAN" as any, field: "a" } } }],
      ["missing field", { metrics: { n: { fn: "SUM" } } }],
      ["bad field", { metrics: { n: { fn: "SUM", field: "a;drop" } } }],
      ["unknown order key", { orderBy: [{ key: "nope", direction: "ASC" }] }],
      ["bad direction", { orderBy: [{ key: "n", direction: "UP" as any }] }],
      ["zero limit", { limit: 0 }],
      ["float limit", { limit: 1.5 }],
      ["digit group segment", { groupBy: ["tags.0"] }],
      ["digit field segment", { metrics: { n: { fn: "MAX", field: "items.12.price" } } }]
    ];
    for (const [name, over] of bad) {
      assert.throws(() => validateAggregation(q(over)), WebdaQLError, name);
    }
  }

  @test
  digitsInsideSegments() {
    // Only all-digit segments are rejected: MongoDB `$a.0` does not index arrays
    validateAggregation(q({ groupBy: ["a1", "b.c2d"] }));
  }

  @test
  missingGroupBy() {
    const query: any = { filter: new AndExpression([]), metrics: { n: { fn: "COUNT" } } };
    validateAggregation(query);
    assert.deepStrictEqual(query.groupBy, [], "a missing groupBy is normalized to []");
    const agg = new Aggregator({ filter: new AndExpression([]), metrics: { n: { fn: "COUNT" } } } as any);
    agg.add({});
    assert.deepStrictEqual(agg.rows(), [{ n: 1 }]);
  }

  @test
  errorCode() {
    const err = new AggregationError("AGGREGATION_NOT_NATIVE", "nope");
    assert.ok(err instanceof WebdaQLError);
    assert.strictEqual(err.code, "AGGREGATION_NOT_NATIVE");
    assert.strictEqual(err.name, "AggregationError");
  }
}

/**
 * Run an aggregation over items
 * @param over - query overrides
 * @param items - items, already filtered
 * @returns the rows
 */
function run(over: Partial<AggregationQuery>, items: any[]): Record<string, unknown>[] {
  const agg = new Aggregator(q(over));
  items.forEach(item => agg.add(item));
  return agg.rows();
}

const ITEMS = [
  { status: "open", points: 3, tag: "a", owner: { uuid: "u1" }, label: "delta" },
  { status: "open", points: "8", tag: "a", owner: { uuid: "u2" }, label: "alpha" },
  { status: "done", points: null, tag: "b", label: "charlie" },
  { status: null, points: 5, tag: null, owner: { uuid: "u1" } },
  { points: 2, tag: "c" }
];

@suite
class AggregatorTest {
  @test
  compare() {
    assert.ok(compareValues(null, 0) < 0, "null first");
    assert.ok(compareValues(undefined, "a") < 0, "undefined is null");
    assert.strictEqual(compareValues(null, undefined), 0);
    assert.ok(compareValues(2, 10) < 0, "numeric, not lexical");
    assert.ok(compareValues("B", "a") < 0, "code unit order");
    assert.ok(compareValues(false, true) < 0);
    assert.ok(compareValues(1, "1") < 0, "numbers before strings");
    assert.ok(compareValues("2026-01-02", "2026-01-10") < 0, "ISO dates as strings");
  }

  @test
  groupedCounts() {
    assert.deepStrictEqual(
      run({ metrics: { n: { fn: "COUNT" } }, orderBy: [{ key: "status", direction: "ASC" }] }, ITEMS),
      [
        { status: null, n: 2 },
        { status: "done", n: 1 },
        { status: "open", n: 2 }
      ],
      "missing and null keys share one group, sorted first"
    );
  }

  @test
  metricSemantics() {
    assert.deepStrictEqual(
      run(
        {
          groupBy: [],
          metrics: {
            all: { fn: "COUNT" },
            withTag: { fn: "COUNT", field: "tag" },
            tags: { fn: "COUNT_DISTINCT", field: "tag" },
            total: { fn: "SUM", field: "points" },
            mean: { fn: "AVG", field: "points" },
            lo: { fn: "MIN", field: "label" },
            hi: { fn: "MAX", field: "points" }
          }
        },
        ITEMS
      ),
      [{ all: 5, withTag: 4, tags: 3, total: 10, mean: 10 / 3, lo: "alpha", hi: "8" }]
    );
  }

  @test
  emptyGroups() {
    assert.deepStrictEqual(
      run(
        {
          groupBy: [],
          metrics: {
            n: { fn: "COUNT" },
            total: { fn: "SUM", field: "points" },
            mean: { fn: "AVG", field: "points" },
            lo: { fn: "MIN", field: "points" },
            d: { fn: "COUNT_DISTINCT", field: "tag" }
          }
        },
        []
      ),
      [{ n: 0, total: 0, mean: null, lo: null, d: 0 }],
      "a global aggregation always returns one row"
    );
    assert.deepStrictEqual(run({}, []), [], "a grouped aggregation over nothing has no row");
    assert.deepStrictEqual(
      run({ groupBy: ["status"], metrics: { total: { fn: "SUM", field: "points" } } }, [{ status: "x", points: "1" }]),
      [{ status: "x", total: 0 }],
      "non-numeric values are ignored by SUM"
    );
  }

  @test
  nestedGroupAndOrderLimit() {
    assert.deepStrictEqual(
      run(
        {
          groupBy: ["owner.uuid"],
          metrics: { n: { fn: "COUNT" } },
          orderBy: [
            { key: "n", direction: "DESC" },
            { key: "owner.uuid", direction: "DESC" }
          ],
          limit: 2
        },
        ITEMS
      ),
      [
        { "owner.uuid": "u1", n: 2 },
        { "owner.uuid": null, n: 2 }
      ],
      "null sorts last in DESC"
    );
  }

  @test
  dates() {
    const items = [
      { day: new Date("2026-01-05T10:00:00.000Z"), at: new Date("2026-01-05T10:00:00.000Z") },
      { day: "2026-01-05T10:00:00.000Z", at: new Date("2025-12-31T23:59:59.000Z") },
      { day: new Date("2026-03-01T00:00:00.000Z"), at: "2026-03-01T00:00:00.000Z" }
    ];
    // Group keys: a Date and its ISO string are one group, returned as the ISO string
    assert.deepStrictEqual(
      run(
        {
          groupBy: ["day"],
          metrics: { n: { fn: "COUNT" } },
          orderBy: [{ key: "day", direction: "ASC" }]
        },
        items
      ),
      [
        { day: "2026-01-05T10:00:00.000Z", n: 2 },
        { day: "2026-03-01T00:00:00.000Z", n: 1 }
      ]
    );
    // MIN / MAX return ISO strings; COUNT_DISTINCT treats a Date and its ISO string alike
    assert.deepStrictEqual(
      run(
        {
          groupBy: [],
          metrics: {
            lo: { fn: "MIN", field: "at" },
            hi: { fn: "MAX", field: "at" },
            days: { fn: "COUNT_DISTINCT", field: "day" }
          }
        },
        items
      ),
      [{ lo: "2025-12-31T23:59:59.000Z", hi: "2026-03-01T00:00:00.000Z", days: 2 }]
    );
  }

  @test
  maxGroups() {
    const agg = new Aggregator(q({ groupBy: ["tag"] }), 2);
    agg.add({ tag: "a" });
    agg.add({ tag: "b" });
    agg.add({ tag: "a" });
    assert.throws(
      () => agg.add({ tag: "c" }),
      (err: AggregationError) => err.code === "AGGREGATION_TOO_MANY_GROUPS"
    );
  }
}

@suite
class ToAggregationQueryTest {
  @test
  converts() {
    const query = toAggregationQuery(
      {
        filter: "status = :status AND points > :min",
        groupBy: ["owner.uuid"],
        metrics: { n: { count: "*" }, withTag: { count: "tag" }, d: { countDistinct: "tag" }, s: { sum: "points" } },
        orderBy: [{ key: "n", direction: "DESC" }],
        limit: 5
      },
      { status: "open", min: 1 }
    );
    assert.strictEqual(query.filter.toString(), 'status = "open" AND points > 1');
    assert.deepStrictEqual(query.groupBy, ["owner.uuid"]);
    assert.deepStrictEqual(query.metrics, {
      n: { fn: "COUNT" },
      withTag: { fn: "COUNT", field: "tag" },
      d: { fn: "COUNT_DISTINCT", field: "tag" },
      s: { fn: "SUM", field: "points" }
    });
    assert.deepStrictEqual(query.orderBy, [{ key: "n", direction: "DESC" }]);
    assert.strictEqual(query.limit, 5);
  }

  @test
  defaults() {
    const query = toAggregationQuery({ metrics: { n: { count: "*" } } });
    assert.strictEqual(query.filter.toString(), "");
    assert.deepStrictEqual(query.groupBy, []);
  }

  @test
  rejects() {
    assert.throws(() => toAggregationQuery({ filter: "a = 1 LIMIT 3", metrics: { n: { count: "*" } } }), WebdaQLError);
    assert.throws(
      () => toAggregationQuery({ filter: "a = 1 ORDER BY a", metrics: { n: { count: "*" } } }),
      WebdaQLError
    );
    assert.throws(
      () => toAggregationQuery({ filter: "a = 1 OFFSET 'x'", metrics: { n: { count: "*" } } }),
      WebdaQLError
    );
    assert.throws(
      () => toAggregationQuery({ filter: "DELETE WHERE a = 1", metrics: { n: { count: "*" } } }),
      WebdaQLError
    );
    assert.throws(
      () => toAggregationQuery({ filter: "SELECT a WHERE a = 1", metrics: { n: { count: "*" } } }),
      WebdaQLError
    );
    assert.throws(() => toAggregationQuery({ metrics: { n: { count: "*", sum: "a" } as any } }), WebdaQLError);
    assert.throws(() => toAggregationQuery({ metrics: { n: { toString: "a" } as any } }), WebdaQLError);
    assert.throws(() => toAggregationQuery({ metrics: { n: { sum: "*" } } }), WebdaQLError, "* only for count");
    assert.throws(
      () => toAggregationQuery({ metrics: JSON.parse('{"__proto__": {"count": "*"}}') }),
      /Invalid metric alias/,
      "reserved alias is rejected, not dropped"
    );
  }
}
