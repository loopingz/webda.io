import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaQL from "./query.js";
import { bind } from "./bind.js";
import { WebdaQLError } from "./webdaql-string.js";

/**
 * Parse a query, print it and parse it back: both parses must describe the same query
 * @param query - the query
 * @returns the printed form
 */
function roundTrip(query: string): string {
  const first = WebdaQL.parse(query);
  const printed = first.toString();
  const second = WebdaQL.parse(printed);
  for (const key of ["type", "fields", "assignments", "limit", "continuationToken", "orderBy"]) {
    assert.deepStrictEqual(second[key], first[key], `${key} of ${query} => ${printed}`);
  }
  assert.strictEqual(second.filter.toString(), first.filter.toString(), `filter of ${query} => ${printed}`);
  assert.strictEqual(second.toString(), printed, `stable print of ${query}`);
  // The validator prints the same canonical form
  assert.strictEqual(new WebdaQL.QueryValidator(query).toString(), printed);
  return printed;
}

@suite
class StatementsTest {
  @test
  deleteStatement() {
    const q1 = WebdaQL.parse("DELETE WHERE status = 'inactive'");
    assert.strictEqual(q1.type, "DELETE");
    assert.ok(q1.filter.eval({ status: "inactive" }));
    assert.ok(!q1.filter.eval({ status: "active" }));
    assert.strictEqual(q1.fields, undefined);
    assert.strictEqual(q1.assignments, undefined);

    const q2 = WebdaQL.parse("DELETE WHERE age < 18 AND status = 'pending'");
    assert.ok(q2.filter.eval({ age: 10, status: "pending" }));
    assert.ok(!q2.filter.eval({ age: 20, status: "pending" }));

    const q3 = WebdaQL.parse("DELETE WHERE status = 'old' LIMIT 100");
    assert.strictEqual(q3.limit, 100);

    // Without WHERE: every object
    const q4 = WebdaQL.parse("DELETE");
    assert.strictEqual(q4.type, "DELETE");
    assert.ok(q4.filter.eval({}));

    // DELETE takes no ORDER BY / OFFSET, and WHERE needs a condition
    for (const invalid of ["DELETE ORDER BY a", "DELETE WHERE a = 1 OFFSET 'x'", "DELETE WHERE", "DELETE a = 1"]) {
      assert.throws(() => WebdaQL.parse(invalid), SyntaxError, invalid);
    }
  }

  @test
  updateStatement() {
    const q1 = WebdaQL.parse("UPDATE SET status = 'active' WHERE name = 'John'");
    assert.strictEqual(q1.type, "UPDATE");
    assert.ok(q1.filter.eval({ name: "John" }));
    assert.ok(!q1.filter.eval({ name: "Jane" }));
    assert.deepStrictEqual(q1.assignments, [{ field: "status", value: "active" }]);
    assert.strictEqual(q1.fields, undefined);

    const q2 = WebdaQL.parse("UPDATE SET status = 'active', age = 30, ratio = -1.5 WHERE name = 'John'");
    assert.deepStrictEqual(q2.assignments, [
      { field: "status", value: "active" },
      { field: "age", value: 30 },
      { field: "ratio", value: -1.5 }
    ]);

    // Dotted paths, booleans
    const q3 = WebdaQL.parse("UPDATE SET profile.verified = TRUE WHERE id = 1");
    assert.deepStrictEqual(q3.assignments, [{ field: "profile.verified", value: true }]);

    const q4 = WebdaQL.parse("UPDATE SET status = 'archived' WHERE active = FALSE LIMIT 50");
    assert.strictEqual(q4.limit, 50);

    // Without WHERE
    const q5 = WebdaQL.parse("UPDATE SET a = 1");
    assert.ok(q5.filter.eval({}));

    for (const invalid of [
      "UPDATE a = 1",
      "UPDATE SET",
      "UPDATE SET a > 1",
      "UPDATE SET a = 1 ORDER BY a",
      "UPDATE SET a = 1 OFFSET 'x'",
      "UPDATE SET a = b"
    ]) {
      assert.throws(() => WebdaQL.parse(invalid), SyntaxError, invalid);
    }
  }

  @test
  selectStatement() {
    const q1 = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    assert.strictEqual(q1.type, "SELECT");
    assert.deepStrictEqual(q1.fields, ["name", "age"]);
    assert.ok(q1.filter.eval({ status: "active" }));

    const q2 = WebdaQL.parse("SELECT name, profile.email WHERE status = 'active'");
    assert.deepStrictEqual(q2.fields, ["name", "profile.email"]);

    const q3 = WebdaQL.parse("SELECT name, age WHERE status = 'active' ORDER BY name DESC LIMIT 10 OFFSET 'token'");
    assert.deepStrictEqual(q3.fields, ["name", "age"]);
    assert.strictEqual(q3.limit, 10);
    assert.strictEqual(q3.continuationToken, "token");
    assert.deepStrictEqual(q3.orderBy, [{ field: "name", direction: "DESC" }]);

    const q4 = WebdaQL.parse("SELECT name, age");
    assert.deepStrictEqual(q4.fields, ["name", "age"]);
    assert.ok(q4.filter instanceof WebdaQL.AndExpression);
    assert.strictEqual((q4.filter as WebdaQL.AndExpression).children.length, 0);

    const q5 = WebdaQL.parse("SELECT name ORDER BY name LIMIT 5");
    assert.strictEqual(q5.limit, 5);

    // SELECT needs a field list; no implicit SELECT of a bare field list
    for (const invalid of ["SELECT", "SELECT WHERE a = 1", "name, age", "name, age WHERE a = 1", "SELECT a,"]) {
      assert.throws(() => WebdaQL.parse(invalid), SyntaxError, invalid);
    }
  }

  @test
  plainFilterIsImplicitSelect() {
    for (const query of ["", "status = 'active'", "status = 'active' AND age > 18 ORDER BY name LIMIT 3"]) {
      const q = WebdaQL.parse(query);
      assert.strictEqual(q.type, "SELECT", query);
      assert.strictEqual(q.fields, undefined, query);
      assert.strictEqual(q.assignments, undefined, query);
    }
  }

  @test
  keywordsAreUppercaseOnly() {
    for (const invalid of [
      "delete where status = 'x'",
      "Delete WHERE status = 'x'",
      "update set a = 1",
      "UPDATE set a = 1",
      "select a where b = 1",
      "SELECT a where b = 1"
    ]) {
      assert.throws(() => WebdaQL.parse(invalid), SyntaxError, invalid);
    }
  }

  @test
  lowercaseFieldsAreNotReserved() {
    const object = { desc: 1, set: 2, update: 3, select: 4, where: 5, delete: 6 };
    for (const field of Object.keys(object)) {
      const q = WebdaQL.parse(`${field} = ${object[field]} ORDER BY ${field} DESC`);
      assert.strictEqual(q.type, "SELECT", field);
      assert.ok(q.filter.eval(object), field);
      assert.ok(!q.filter.eval({ ...object, [field]: 0 }), field);
      assert.deepStrictEqual(q.orderBy, [{ field, direction: "DESC" }]);
    }
    assert.ok(
      WebdaQL.parse("desc = 1 AND set = 2 AND update = 3 AND select = 4 AND where = 5 AND delete = 6").filter.eval(
        object
      )
    );
    // And in statements
    const select = WebdaQL.parse("SELECT where, set WHERE delete = 6");
    assert.deepStrictEqual(select.fields, ["where", "set"]);
    assert.ok(select.filter.eval(object));
    assert.deepStrictEqual(WebdaQL.parse("UPDATE SET select = 1, desc = 2 WHERE update = 3").assignments, [
      { field: "select", value: 1 },
      { field: "desc", value: 2 }
    ]);
  }

  @test
  toStringRoundTrips() {
    assert.strictEqual(roundTrip(""), "");
    assert.strictEqual(roundTrip("a = 1 ORDER BY a LIMIT 10 OFFSET 'x'"), 'a = 1 ORDER BY a ASC LIMIT 10 OFFSET "x"');
    assert.strictEqual(roundTrip("DELETE"), "DELETE");
    assert.strictEqual(roundTrip("DELETE LIMIT 2"), "DELETE LIMIT 2");
    assert.strictEqual(
      roundTrip("DELETE WHERE a = 1 OR (b = 'x' AND c IS NULL) LIMIT 5"),
      'DELETE WHERE a = 1 OR ( b = "x" AND c IS NULL ) LIMIT 5'
    );
    assert.strictEqual(roundTrip("UPDATE SET a = 1"), "UPDATE SET a = 1");
    assert.strictEqual(
      roundTrip("UPDATE SET a = 'it''s', b.c = TRUE, d = -2.5 WHERE e != 'x' LIMIT 3"),
      'UPDATE SET a = "it\'s", b.c = TRUE, d = -2.5 WHERE e != "x" LIMIT 3'
    );
    assert.strictEqual(roundTrip("SELECT a"), "SELECT a");
    assert.strictEqual(
      roundTrip("SELECT a, b.c WHERE d IN [1, 2] ORDER BY a DESC, b ASC LIMIT 4 OFFSET 'tok'"),
      'SELECT a, b.c WHERE d IN [1, 2] ORDER BY a DESC, b ASC LIMIT 4 OFFSET "tok"'
    );
    assert.strictEqual(roundTrip("SELECT a ORDER BY a"), "SELECT a ORDER BY a ASC");
    // A mutated parsed query prints its current state
    const q = WebdaQL.parse("SELECT a WHERE b = 1");
    q.limit = 7;
    q.continuationToken = "next";
    assert.strictEqual(q.toString(), 'SELECT a WHERE b = 1 LIMIT 7 OFFSET "next"');
  }

  @test
  prependConditionOnStatements() {
    const check = (query: string, condition: string, expected: string) => {
      const merged = WebdaQL.PrependCondition(query, condition);
      assert.strictEqual(merged, expected);
      // Parsable and stable
      assert.strictEqual(WebdaQL.parse(merged).toString(), merged);
    };
    check(
      "SELECT a, b WHERE x = 1 ORDER BY a LIMIT 10 OFFSET 't'",
      "y = 2",
      'SELECT a, b WHERE x = 1 AND y = 2 ORDER BY a ASC LIMIT 10 OFFSET "t"'
    );
    check("SELECT a ORDER BY a", "y = 2", "SELECT a WHERE y = 2 ORDER BY a ASC");
    check("DELETE LIMIT 5", "y = 2", "DELETE WHERE y = 2 LIMIT 5");
    check("UPDATE SET a = 1 WHERE x = 1", "y = 2", "UPDATE SET a = 1 WHERE x = 1 AND y = 2");
    // Precedence: both sides keep their grouping
    check("x = 1 OR y = 2", "z = 3 OR w = 4", "( x = 1 OR y = 2 ) AND ( z = 3 OR w = 4 )");
    check("DELETE WHERE x = 1 OR y = 2", "owner = 'me'", 'DELETE WHERE ( x = 1 OR y = 2 ) AND owner = "me"');
    check(
      "SELECT a WHERE x = 1 OR y = 2 LIMIT 3",
      "owner = 'me' OR public = TRUE",
      'SELECT a WHERE ( x = 1 OR y = 2 ) AND ( owner = "me" OR public = TRUE ) LIMIT 3'
    );
    // The merged condition must be a filter: a statement there is refused
    for (const condition of ["DELETE WHERE a = 1", "SELECT a WHERE b = 1", "UPDATE SET a = 1"]) {
      assert.throws(() => WebdaQL.PrependCondition("x = 1", condition), SyntaxError, condition);
    }
  }

  @test
  allowedFields() {
    const allowed = ["name", "age", "status", "profile.email", "address"];
    assert.deepStrictEqual(WebdaQL.parse("SELECT name, age WHERE status = 'active'", allowed).fields, ["name", "age"]);
    assert.throws(
      () => WebdaQL.parse("SELECT name, unknown WHERE status = 'active'", allowed),
      /Unknown field "unknown"/
    );
    assert.strictEqual(WebdaQL.parse("UPDATE SET status = 'active' WHERE name = 'John'", allowed).type, "UPDATE");
    assert.throws(
      () => WebdaQL.parse("UPDATE SET invalid = 'active' WHERE name = 'John'", allowed),
      /Unknown assignment field "invalid"/
    );
    // Dotted paths: listed as such, or nested in a listed field
    assert.deepStrictEqual(WebdaQL.parse("SELECT profile.email, address.city", allowed).fields, [
      "profile.email",
      "address.city"
    ]);
    assert.throws(() => WebdaQL.parse("SELECT profile.ssn", allowed), /Unknown field "profile.ssn"/);
    assert.throws(() => WebdaQL.parse("UPDATE SET profile.secret = 'x'", allowed), /profile.secret/);
    // A prefix is not a parent
    assert.throws(() => WebdaQL.parse("SELECT nam", allowed), /Unknown field "nam"/);
    // DELETE and plain filters have no field list
    assert.strictEqual(WebdaQL.parse("DELETE WHERE status = 'old'", allowed).type, "DELETE");
    assert.strictEqual(WebdaQL.parse("status = 'active'", allowed).type, "SELECT");
    // Standalone
    const parsed = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    WebdaQL.validateQueryFields(parsed, allowed);
    assert.throws(() => WebdaQL.validateQueryFields(parsed, ["status"]), /Unknown field "name"/);
    assert.throws(() => WebdaQL.parse("SELECT name", []), /Unknown field "name"/);
    // Errors are syntax errors (a 400 at the API)
    assert.throws(() => WebdaQL.parse("SELECT nope", allowed), SyntaxError);
  }

  @test
  assertFilterQuery() {
    for (const query of ["", "a = 1", "a = 1 ORDER BY a LIMIT 2 OFFSET 'x'"]) {
      WebdaQL.assertFilterQuery(WebdaQL.parse(query));
    }
    // Hand-built queries without a type are filters
    WebdaQL.assertFilterQuery({ filter: new WebdaQL.AndExpression([]) } as any);
    for (const query of ["DELETE", "DELETE WHERE a = 1", "UPDATE SET a = 1", "SELECT a", "SELECT a WHERE b = 1"]) {
      assert.throws(() => WebdaQL.assertFilterQuery(WebdaQL.parse(query)), WebdaQLError, query);
    }
    assert.throws(() => WebdaQL.assertFilterQuery({ type: "DELETE" } as any), /DELETE/);
  }

  @test
  parametersInStatements() {
    assert.strictEqual(bind("DELETE WHERE a = ? LIMIT ?", ["x", 5]), "DELETE WHERE a = 'x' LIMIT 5");
    assert.strictEqual(
      bind("UPDATE SET a = :a, b.c = :b WHERE d IN :d LIMIT :l", { a: "it's", b: true, d: [1, 2], l: 3 }),
      "UPDATE SET a = 'it''s', b.c = TRUE WHERE d IN [1, 2] LIMIT 3"
    );
    assert.strictEqual(
      bind("SELECT a, b WHERE c = ? ORDER BY a LIMIT ? OFFSET ?", [1.5, 10, "tok"]),
      "SELECT a, b WHERE c = 1.5 ORDER BY a LIMIT 10 OFFSET 'tok'"
    );
    const update = WebdaQL.parse(bind("UPDATE SET a = ?, b = ? WHERE c = ?", ["x", -2, null]));
    assert.deepStrictEqual(update.assignments, [
      { field: "a", value: "x" },
      { field: "b", value: -2 }
    ]);
    assert.ok(update.filter.eval({}));
    // A null cannot be assigned: SET has no NULL literal
    assert.throws(() => bind("UPDATE SET a = ? WHERE b = ?", [null, 1]), /cannot be assigned/);
    assert.throws(() => bind("UPDATE SET a = :a", { a: undefined }), /cannot be assigned/);
    // Placeholders never become a field or a keyword
    for (const query of ["SELECT ? WHERE a = 1", "UPDATE SET ? = 1", "DELETE WHERE ? = 1", "? WHERE a = 1"]) {
      assert.throws(() => bind(query, ["x"]), SyntaxError, query);
    }
    // Unbound parameters are refused at parse time, in statements too
    for (const query of ["UPDATE SET a = ?", "DELETE LIMIT ?", "SELECT a WHERE b = :b"]) {
      assert.throws(() => WebdaQL.parse(query), WebdaQLError, query);
    }
  }

  @test
  limitZeroIsKept() {
    assert.strictEqual(roundTrip("DELETE LIMIT 0"), "DELETE LIMIT 0");
    assert.strictEqual(roundTrip("UPDATE SET a = 1 WHERE b = 2 LIMIT 0"), "UPDATE SET a = 1 WHERE b = 2 LIMIT 0");
    assert.strictEqual(roundTrip("SELECT a LIMIT 0 OFFSET 't'"), 'SELECT a LIMIT 0 OFFSET "t"');
    assert.strictEqual(roundTrip("a = 1 LIMIT 0"), "a = 1 LIMIT 0");
    assert.strictEqual(WebdaQL.PrependCondition("DELETE LIMIT 0", "name = 'x'"), 'DELETE WHERE name = "x" LIMIT 0');
    assert.strictEqual(WebdaQL.parse(WebdaQL.PrependCondition("DELETE LIMIT 0", "name = 'x'")).limit, 0);
    // A LIMIT 0 condition overrides the query LIMIT, like any other LIMIT
    assert.strictEqual(WebdaQL.PrependCondition("DELETE LIMIT 5", "LIMIT 0"), "DELETE LIMIT 0");
  }

  @test
  normalizeQueryRejectsForgedObjects() {
    // A well-formed object goes back through the grammar unchanged
    const ok = WebdaQL.normalizeQuery(WebdaQL.parse("DELETE WHERE a.b = 'x' AND c IN [1, 2] LIMIT 3"));
    assert.strictEqual(ok.toString(), 'DELETE WHERE a.b = "x" AND c IN [1, 2] LIMIT 3');
    assert.ok(ok.filter instanceof WebdaQL.AndExpression);
    const forge = (query: string, change: (q: any) => void) => {
      const q: any = WebdaQL.parse(query);
      change(q);
      return () => WebdaQL.normalizeQuery(q);
    };
    const invalid: [string, (q: any) => void][] = [
      // SQL break-out through a field path
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["x}' IS NULL OR TRUE OR data#>>'{y"])],
      // Mongo operators
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["$where"])],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.value = { $ne: "nope" })],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["a", "$"])],
      ["DELETE WHERE uuid IN ['a']", q => (q.filter.value = [{ $gt: "" }])],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.attribute = ["a", ""])],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.value = Number.NaN)],
      ["DELETE WHERE uuid = 'nope'", q => (q.filter.operator = "= 1 OR")],
      // A foreign expression whose toString is chosen by the caller
      ["DELETE", q => (q.filter = { eval: () => true, toString: () => "1 = 1; DROP TABLE x" })],
      ["UPDATE SET a = 1", q => (q.assignments = [{ field: "a'}", value: 1 }])],
      ["UPDATE SET a = 1", q => (q.assignments = [{ field: "a", value: { $set: 1 } }])],
      ["UPDATE SET a = 1", q => (q.assignments = [{ field: "a", value: null }])],
      ["SELECT a", q => (q.fields = ["a; DROP"])],
      ["a = 1 ORDER BY a", q => (q.orderBy = [{ field: "a'", direction: "ASC" }])],
      ["a = 1 ORDER BY a", q => (q.orderBy = [{ field: "a", direction: "ASC; DROP" }])],
      ["DELETE LIMIT 1", q => (q.limit = Number.NaN)],
      ["DELETE LIMIT 1", q => (q.limit = -1)],
      ["DELETE LIMIT 1", q => (q.limit = 1.5)],
      ["DELETE LIMIT 1", q => (q.limit = "1; DROP")],
      ["a = 1", q => (q.continuationToken = 12)],
      ["a = 1", q => (q.type = "DROP")]
    ];
    for (const [query, change] of invalid) {
      assert.throws(forge(query, change), WebdaQLError, `${query} ${change}`);
    }
  }

  @test
  normalizeQueryReadsEachPartOnce() {
    // A Proxy answering one thing to the check and another to the print
    const twoFaced = (safe: any[], hostile: any[]) => {
      let reads = 0;
      return new Proxy(safe, {
        get: (target, prop, receiver) => {
          if (prop === "join" || prop === "map") {
            reads++;
          }
          return Reflect.get(reads > 0 ? hostile : target, prop, receiver);
        }
      });
    };
    const q: any = WebdaQL.parse("DELETE WHERE name = 'nope'");
    q.filter.attribute = twoFaced(["name"], ["uuid IS NOT NULL OR name"]);
    const normalized = (() => {
      try {
        return WebdaQL.normalizeQuery(q);
      } catch (err) {
        return err;
      }
    })();
    if (!(normalized instanceof WebdaQLError)) {
      assert.strictEqual(normalized.toString(), 'DELETE WHERE name = "nope"');
    }
    // Arrays of a query object are copied before they are checked
    const fields: any = WebdaQL.parse("SELECT a");
    fields.fields = twoFaced(["a"], ["a, b WHERE TRUE"]);
    assert.strictEqual(WebdaQL.normalizeQuery(fields).toString(), "SELECT a");
    const set: any = WebdaQL.parse("UPDATE SET a = 1");
    set.assignments = twoFaced(
      [{ field: "a", value: 1 }],
      [
        { field: "a", value: 1 },
        { field: "uuid", value: "x" }
      ]
    );
    assert.strictEqual(WebdaQL.normalizeQuery(set).toString(), "UPDATE SET a = 1");
    const values: any = WebdaQL.parse("DELETE WHERE a IN [1]");
    values.filter.value = twoFaced([1], [1, 2]);
    assert.strictEqual(WebdaQL.normalizeQuery(values).toString(), "DELETE WHERE a IN [1]");
  }
}
