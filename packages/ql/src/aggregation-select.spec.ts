import { suite, test } from "@webda/test";
import * as assert from "assert";
import { toAggregationQuery, type AggregationQuery } from "./aggregation.js";
import { assertFilterQuery, normalizeQuery, parse } from "./query.js";

/**
 * Comparable form of an aggregation query
 * @param query - the query
 * @returns a plain object
 */
function plain(query: AggregationQuery) {
  return { ...query, filter: query.filter.toString() };
}

@suite
class AggregationSelectTest {
  @test
  roundTrip() {
    const query = parse(
      "SELECT status, owner.uuid, COUNT(*) AS n, COUNT(tag) AS withTag, COUNT(DISTINCT tag) AS tags, " +
        "SUM(points) AS total, AVG(points) AS mean, MIN(createdAt) AS first, MAX(points) AS top " +
        "WHERE completed = FALSE AND owner.uuid = 'u1' GROUP BY status, owner.uuid ORDER BY n DESC, status LIMIT 10"
    );
    assert.strictEqual(query.type, "SELECT");
    assert.deepStrictEqual(query.fields, ["status", "owner.uuid"]);
    assert.deepStrictEqual(
      plain(query.aggregation),
      plain(
        toAggregationQuery({
          filter: "completed = FALSE AND owner.uuid = 'u1'",
          groupBy: ["status", "owner.uuid"],
          metrics: {
            n: { count: "*" },
            withTag: { count: "tag" },
            tags: { countDistinct: "tag" },
            total: { sum: "points" },
            mean: { avg: "points" },
            first: { min: "createdAt" },
            top: { max: "points" }
          },
          orderBy: [
            { key: "n", direction: "DESC" },
            { key: "status", direction: "ASC" }
          ],
          limit: 10
        })
      )
    );
    assert.deepStrictEqual(plain(parse(query.toString()).aggregation), plain(query.aggregation));
  }

  @test
  globalAggregation() {
    const query = parse("SELECT COUNT(*) AS n");
    assert.deepStrictEqual(query.fields, []);
    assert.deepStrictEqual(plain(query.aggregation), {
      filter: "",
      groupBy: [],
      metrics: { n: { fn: "COUNT" } },
      orderBy: undefined,
      limit: undefined
    });
    // Repository query() / iterate() refuse it like any SELECT field list
    assert.throws(() => assertFilterQuery(query));
    assert.deepStrictEqual(plain(parse(query.toString()).aggregation), plain(query.aggregation));
    assert.throws(() => normalizeQuery(query), /Aggregation/);
  }

  @test
  plainSelectUnchanged() {
    const query = parse("SELECT a, b WHERE a = 1");
    assert.deepStrictEqual(query.fields, ["a", "b"]);
    assert.strictEqual(query.aggregation, undefined);
  }

  @test
  rejects() {
    for (const bad of [
      "SELECT status, COUNT(*) AS n",
      "SELECT COUNT(*) AS n GROUP BY status",
      "SELECT status, owner GROUP BY status",
      "SELECT COUNT(*)",
      "SELECT SUM(*) AS s",
      "SELECT COUNT(*) AS n, COUNT(a) AS n",
      "SELECT COUNT(*) AS n OFFSET 'x'",
      "SELECT COUNT(*) AS n ORDER BY nope",
      "SELECT status GROUP BY status"
    ]) {
      assert.throws(() => parse(bad), undefined, bad);
    }
  }

  @test
  reservedAliases() {
    for (const bad of ["SELECT COUNT(*) AS n, SUM(x) AS __proto__", "SELECT SUM(x) AS __proto__"]) {
      assert.throws(() => parse(bad), /Invalid metric alias/, bad);
    }
  }

  @test
  allowedFields() {
    assert.throws(() => parse("SELECT SUM(secret) AS s", ["points"]), /secret/);
    assert.ok(parse("SELECT SUM(points) AS s", ["points"]).aggregation);
  }

  @test
  keywords() {
    assert.strictEqual(
      parse("count = 1 AND min = 2").filter.toString(),
      "count = 1 AND min = 2",
      "lowercase stays an attribute"
    );
    assert.throws(() => parse("COUNT = 1"), undefined, "uppercase COUNT is now a keyword");
    assert.throws(() => parse("a = 1 GROUP BY a"), undefined, "GROUP BY only in a SELECT");
  }
}
