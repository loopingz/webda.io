import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaQL from "./query";

const targets = [
  {
    test: {
      attr1: "plop"
    },
    attr2: "OK",
    attr3: 13,
    attr4: "ok",
    attr5: ["test", "plip"]
  }
];

@suite
class QueryTest {
  @test
  dev() {
    const queryMap = {
      "a = 1 AND b = 2 AND c = 3 AND d = 4": "a = 1 AND b = 2 AND c = 3 AND d = 4",
      "a = 1 AND (b = 2 AND c = 3) AND d = 4": "a = 1 AND b = 2 AND c = 3 AND d = 4",
      "a = 1 AND ((b = 2 AND c = 3) AND d = 4)": "a = 1 AND b = 2 AND c = 3 AND d = 4",
      "a = 1 AND ((b = 2 OR c = 3) AND d = 4)": "a = 1 AND ( b = 2 OR c = 3 ) AND d = 4",
      "a = 1 AND (b = 2) AND c = 3 AND d = 4": "a = 1 AND b = 2 AND c = 3 AND d = 4",
      "a = 1 OR b = 2 OR c = 3 OR d = 4": "a = 1 OR b = 2 OR c = 3 OR d = 4",
      'a = 1 AND (b = 2 OR c = 3) AND d = "plop"': 'a = 1 AND ( b = 2 OR c = 3 ) AND d = "plop"',
      "a = 1 OR b = TRUE AND c = FALSE OR d = 'plop'": 'a = 1 OR ( b = TRUE AND c = FALSE ) OR d = "plop"',
      "test.attr1 = 'plop'": true,
      "test.attr1 = 'plop2'": false,
      "test.attr1 = 'plop' AND attr2 IN ['TEST', TRUE, 3]": 'test.attr1 = "plop" AND attr2 IN ["TEST", TRUE, 3]',
      "(test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK']) OR attr3 <= 12": null,
      "test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK'] OR attr3 <= 12 AND attr4 = 'ok'": null,
      "test.attr1 = 'plop' AND (attr2 IN ['TEST', 'OK'] OR attr3 <= 12) AND attr4 = 'ok'": null,
      "test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK'] AND attr3 <= 12 AND attr4 = 'ok'": null,
      "a = 1 OR b = 2": null,
      "a = 1 AND b = 2 OR c = 3 AND d = 4": null,
      "a = 1 AND b = 2 OR c = 3 AND d = 4 OR e = 5 AND f = 6": null,
      "a = 1 AND (b = 2 OR (c = 3 AND (d = 4 OR e = 5))) AND f = 6": null,
      "": true,
      'test.attr1 LIKE "pl_p"': true,
      'test.attr1 LIKE "pl__p"': false,
      'attr3 LIKE "1_"': true,
      "attr3 >= 12": true,
      "attr3 <= 12": false,
      "attr3 != 12": true,
      "attr3 > 12": true,
      "attr3 < 13": false,
      "attr5 CONTAINS 'test'": true,
      "attr5 CONTAINS 'test2'": false,
      'test.attr1 LIKE "pl%"': true,
      "a = 1 AND b=2 OR a=1 AND b=3": "( a = 1 AND b = 2 ) OR ( a = 1 AND b = 3 )",
      "a = 1 ORDER BY a": null,
      "a = 1 ORDER BY a DESC, b ASC": null,
      "(attr3 >= 12)": true
    };
    for (const query in queryMap) {
      const validator = new WebdaQL.QueryValidator(query);
      assert.strictEqual(validator.displayTree().replace(/\s/g, ""), query.replace(/\s/g, ""));
      if (typeof queryMap[query] === "string") {
        assert.strictEqual(
          validator.getExpression().toString(),
          queryMap[query],
          `Failed optimization of query: ${query} => ${validator.getExpression().toString()}`
        );
      } else if (typeof queryMap[query] === "boolean") {
        assert.strictEqual(validator.eval(targets[0]), queryMap[query], `Failed query: ${query}`);
      } else {
        console.log("QUERY", query);
        console.log("OPTIMIZED QUERY", validator.getExpression().toString(), "=>", validator.eval(targets[0]));
      }
    }
  }

  @test
  prependQuery() {
    // merge method is tested through the prependQuery helper

    const strictEqual = (arg1, arg2) => {
      // Ensure it is parsable
      new WebdaQL.QueryValidator(arg1);
      assert.deepStrictEqual(arg1, arg2);
    };
    strictEqual(WebdaQL.PrependCondition("", "test='plop'"), 'test = "plop"');
    strictEqual(WebdaQL.PrependCondition("test='plop'", ""), 'test = "plop"');
    strictEqual(WebdaQL.PrependCondition("test='plip'", "test='plop'"), 'test = "plip" AND test = "plop"');

    strictEqual(WebdaQL.PrependCondition("ORDER BY test", "test='plop'"), 'test = "plop" ORDER BY test ASC');
    strictEqual(
      WebdaQL.PrependCondition("ORDER BY test LIMIT 100", "test='plop'"),
      'test = "plop" ORDER BY test ASC LIMIT 100'
    );
    strictEqual(
      WebdaQL.PrependCondition("ORDER BY test DESC LIMIT 100", "test='plop'"),
      'test = "plop" ORDER BY test DESC LIMIT 100'
    );
    strictEqual(
      WebdaQL.PrependCondition("test='plip' ORDER BY test ASC LIMIT 100", "test='plop'"),
      'test = "plip" AND test = "plop" ORDER BY test ASC LIMIT 100'
    );
    strictEqual(
      WebdaQL.PrependCondition("test='plip' LIMIT 100", "test='plop'"),
      'test = "plip" AND test = "plop" LIMIT 100'
    );
    strictEqual(
      WebdaQL.PrependCondition("test='plip' OFFSET 'test'", "test='plop'"),
      'test = "plip" AND test = "plop" OFFSET "test"'
    );
    strictEqual(
      WebdaQL.PrependCondition("test='ORDER BY plop' OFFSET 'test'", "test='plop'"),
      'test = "ORDER BY plop" AND test = "plop" OFFSET "test"'
    );
    strictEqual(
      WebdaQL.PrependCondition('test="ORDER BY plop" LIMIT 100', "test='plop'"),
      'test = "ORDER BY plop" AND test = "plop" LIMIT 100'
    );
    // Composed ORDER BY
    strictEqual(
      WebdaQL.PrependCondition('test="plop" ORDER BY ab ASC LIMIT 100', "ORDER BY forced DESC"),
      'test = "plop" ORDER BY forced DESC, ab ASC LIMIT 100'
    );
    // Opposite ORDER BY
    strictEqual(
      WebdaQL.PrependCondition('test="plop" ORDER BY forced ASC LIMIT 100', "ORDER BY forced DESC"),
      'test = "plop" ORDER BY forced DESC LIMIT 100'
    );
    // Overwrite LIMIT
    strictEqual(
      WebdaQL.PrependCondition('test="plop" ORDER BY forced ASC LIMIT 100', "LIMIT 5"),
      'test = "plop" ORDER BY forced ASC LIMIT 5'
    );
    // Overwrite OFFSET
    strictEqual(WebdaQL.PrependCondition('OFFSET "test"', "OFFSET 'plop'"), 'OFFSET "plop"');
    strictEqual(WebdaQL.PrependCondition('plop = "ok"', "OFFSET 'plop'"), 'plop = "ok" OFFSET "plop"');
  }

  @test
  likeRegexp() {
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("test"), /test/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("t_est"), /t.{1}est/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("_test"), /.{1}test/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("t\\_est"), /t_est/);

    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("t%est"), /t.*est/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("%te?st"), /.*te\?st/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("t\\%est"), /t%est/);
    assert.deepStrictEqual(WebdaQL.ComparisonExpression.likeToRegex("t\\eest"), /t\\est/);
  }

  @test
  simple() {
    assert.strictEqual(new WebdaQL.QueryValidator("test.attr1 = 'plop'").eval(targets[0]), true);
    assert.strictEqual(new WebdaQL.QueryValidator("test.attr1 = 'plop2'").eval(targets[0]), false);
  }

  @test
  contains() {
    assert.strictEqual(new WebdaQL.QueryValidator("test.attr1 CONTAINS 'plop2'").eval(targets[0]), false);
  }

  @test
  andQuery() {
    assert.strictEqual(
      new WebdaQL.QueryValidator("test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK']").eval(targets[0]),
      true
    );
  }

  @test
  orQuery() {
    new WebdaQL.QueryValidator("(test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK']) OR attr3 <= 12").eval(targets[0]);
  }

  @test
  multipleQuery() {
    new WebdaQL.QueryValidator("test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK'] OR attr3 <= 12 AND attr4 = 'ok'").eval(
      targets[0]
    );
    new WebdaQL.QueryValidator("test.attr1 = 'plop' AND attr2 IN ['TEST', 'OK'] AND attr3 <= 12 AND attr4 = 'ok'").eval(
      targets[0]
    );
  }

  @test
  unsanitize() {
    assert.strictEqual(WebdaQL.unsanitize("test.attr1 &lt; 12 AND attr2 &gt; 13"), "test.attr1 < 12 AND attr2 > 13");
  }

  @test
  limitOffset() {
    let val = new WebdaQL.QueryValidator('LIMIT 10 OFFSET "pl"');
    // getQuery
    val.getQuery();
    assert.strictEqual(val.getLimit(), 10);
    assert.strictEqual(val.getOffset(), "pl");
    val = new WebdaQL.QueryValidator('OFFSET "pl2"');
    assert.strictEqual(val.getLimit(), 1000);
    assert.strictEqual(val.getOffset(), "pl2");
  }

  @test
  badQuery() {
    assert.throws(() => new WebdaQL.QueryValidator("test lo 'plop'").eval(targets[0]));
  }

  @test
  setters() {
    let target: any = {};
    new WebdaQL.SetterValidator('i = 10 AND j = "12"').eval(target);
    assert.strictEqual(target.i, 10);
    assert.strictEqual(target.j, "12");
    target = {};
    new WebdaQL.SetterValidator("").eval(target);
    assert.strictEqual(Object.keys(target).length, 0);
    new WebdaQL.SetterValidator('test.i = 10 AND j.k.l = "12"').eval(target);
    assert.strictEqual(target.test.i, 10);
    assert.strictEqual(target.j.k.l, "12");
    target = {};
    new WebdaQL.SetterValidator("test.__proto__.test = 10").eval(target);
    assert.strictEqual(target.__proto__.test, undefined);
    assert.throws(() => new WebdaQL.SetterValidator('i = 10 OR j = "12"').eval(target), SyntaxError);
    assert.throws(() => new WebdaQL.SetterValidator('i > 10 AND j = "12"').eval(target), SyntaxError);
  }

  @test
  parse() {
    // Basic query with filter, order, limit, offset
    const query = WebdaQL.parse("status = 'active' AND age > 18 ORDER BY name DESC LIMIT 50 OFFSET 'token123'");
    assert.ok(query.filter instanceof WebdaQL.AndExpression);
    assert.strictEqual(query.limit, 50);
    assert.strictEqual(query.continuationToken, "token123");
    assert.deepStrictEqual(query.orderBy, [{ field: "name", direction: "DESC" }]);
    // toString returns the original parse tree reconstruction
    assert.ok(query.toString().includes("status"));

    // Empty query
    const empty = WebdaQL.parse("");
    assert.ok(empty.filter instanceof WebdaQL.AndExpression);
    assert.strictEqual((empty.filter as WebdaQL.AndExpression).children.length, 0);

    // Filter-only query
    const simple = WebdaQL.parse("x = 1");
    assert.ok(simple.filter.eval({ x: 1 }));
    assert.ok(!simple.filter.eval({ x: 2 }));
  }

  @test
  partialValidator() {
    const validator = new WebdaQL.PartialValidator("attr1 = 'plop' AND attr2 = 'ok'");
    assert.ok(validator.eval({ attr1: "plop" }));
    assert.ok(validator.wasPartialMatch());
    assert.ok(!validator.eval({ attr1: "plop" }, false));
    assert.ok(!validator.eval({ attr1: "plop2" }));
    assert.ok(
      new WebdaQL.PartialValidator(
        "attr1 = 'plop' AND attr2 LIKE '?ok' AND attr3 IN ['test'] AND attr4 CONTAINS 'plop'"
      ).eval({ attr1: "plop" })
    );
  }

  @test
  deleteQuery() {
    // Basic DELETE with WHERE condition
    const q1 = WebdaQL.parse("DELETE WHERE status = 'inactive'");
    assert.strictEqual(q1.type, "DELETE");
    assert.ok(q1.filter.eval({ status: "inactive" }));
    assert.ok(!q1.filter.eval({ status: "active" }));

    // DELETE with complex condition
    const q2 = WebdaQL.parse("DELETE WHERE age < 18 AND status = 'pending'");
    assert.strictEqual(q2.type, "DELETE");
    assert.ok(q2.filter.eval({ age: 10, status: "pending" }));
    assert.ok(!q2.filter.eval({ age: 20, status: "pending" }));

    // DELETE with LIMIT (delete at most N items)
    const q3 = WebdaQL.parse("DELETE WHERE status = 'old' LIMIT 100");
    assert.strictEqual(q3.type, "DELETE");
    assert.strictEqual(q3.limit, 100);

    // toString round-trip
    assert.ok(q1.toString().includes("DELETE"));
    assert.ok(q1.toString().includes("status"));
  }

  @test
  updateQuery() {
    // Basic UPDATE with SET and WHERE
    const q1 = WebdaQL.parse("UPDATE SET status = 'active' WHERE name = 'John'");
    assert.strictEqual(q1.type, "UPDATE");
    assert.ok(q1.filter.eval({ name: "John" }));
    assert.ok(!q1.filter.eval({ name: "Jane" }));
    assert.deepStrictEqual(q1.assignments, [{ field: "status", value: "active" }]);

    // UPDATE with multiple SET assignments
    const q2 = WebdaQL.parse("UPDATE SET status = 'active', age = 30 WHERE name = 'John'");
    assert.strictEqual(q2.type, "UPDATE");
    assert.deepStrictEqual(q2.assignments, [
      { field: "status", value: "active" },
      { field: "age", value: 30 }
    ]);

    // UPDATE with nested attribute
    const q3 = WebdaQL.parse("UPDATE SET profile.verified = TRUE WHERE id = 1");
    assert.strictEqual(q3.type, "UPDATE");
    assert.deepStrictEqual(q3.assignments, [{ field: "profile.verified", value: true }]);

    // UPDATE with LIMIT
    const q4 = WebdaQL.parse("UPDATE SET status = 'archived' WHERE active = FALSE LIMIT 50");
    assert.strictEqual(q4.type, "UPDATE");
    assert.strictEqual(q4.limit, 50);

    // toString round-trip
    assert.ok(q1.toString().includes("UPDATE"));
    assert.ok(q1.toString().includes("SET"));
  }

  @test
  selectFields() {
    // SELECT with WHERE condition
    const q1 = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    assert.strictEqual(q1.type, "SELECT");
    assert.deepStrictEqual(q1.fields, ["name", "age"]);
    assert.ok(q1.filter.eval({ status: "active" }));

    // SELECT with nested fields
    const q2 = WebdaQL.parse("SELECT name, profile.email WHERE status = 'active'");
    assert.strictEqual(q2.type, "SELECT");
    assert.deepStrictEqual(q2.fields, ["name", "profile.email"]);

    // SELECT with ORDER BY, LIMIT, OFFSET
    const q3 = WebdaQL.parse("SELECT name, age WHERE status = 'active' ORDER BY name ASC LIMIT 10 OFFSET 'token'");
    assert.strictEqual(q3.type, "SELECT");
    assert.deepStrictEqual(q3.fields, ["name", "age"]);
    assert.strictEqual(q3.limit, 10);
    assert.strictEqual(q3.continuationToken, "token");
    assert.deepStrictEqual(q3.orderBy, [{ field: "name", direction: "ASC" }]);

    // SELECT without WHERE (all items, specific fields)
    const q4 = WebdaQL.parse("SELECT name, age");
    assert.strictEqual(q4.type, "SELECT");
    assert.deepStrictEqual(q4.fields, ["name", "age"]);
    assert.ok(q4.filter instanceof WebdaQL.AndExpression);
    assert.strictEqual((q4.filter as WebdaQL.AndExpression).children.length, 0);

    // Regular query (no field list) should have type undefined
    const q5 = WebdaQL.parse("status = 'active'");
    assert.strictEqual(q5.type, undefined);
    assert.strictEqual(q5.fields, undefined);

    // Filter query should not be treated as SELECT
    const q6 = WebdaQL.parse("status = 'active' AND age > 18");
    assert.strictEqual(q6.type, undefined);

    // toString round-trip
    assert.ok(q3.toString().includes("name"));
  }

  @test
  allowedFields() {
    const allowed = ["name", "age", "status", "profile.email"];

    // Valid SELECT fields pass
    const q1 = WebdaQL.parse("SELECT name, age WHERE status = 'active'", allowed);
    assert.strictEqual(q1.type, "SELECT");
    assert.deepStrictEqual(q1.fields, ["name", "age"]);

    // Unknown SELECT field throws
    assert.throws(
      () => WebdaQL.parse("SELECT name, unknown WHERE status = 'active'", allowed),
      /Unknown field "unknown"/
    );

    // Valid UPDATE assignment fields pass
    const q2 = WebdaQL.parse("UPDATE SET status = 'active' WHERE name = 'John'", allowed);
    assert.strictEqual(q2.type, "UPDATE");

    // Unknown UPDATE assignment field throws
    assert.throws(
      () => WebdaQL.parse("UPDATE SET invalid = 'active' WHERE name = 'John'", allowed),
      /Unknown assignment field "invalid"/
    );

    // Dot-notation fields work
    const q3 = WebdaQL.parse("SELECT name, profile.email WHERE status = 'active'", allowed);
    assert.deepStrictEqual(q3.fields, ["name", "profile.email"]);

    // DELETE and plain queries are not affected by allowedFields
    const q4 = WebdaQL.parse("DELETE WHERE status = 'old'", allowed);
    assert.strictEqual(q4.type, "DELETE");

    const q5 = WebdaQL.parse("status = 'active'", allowed);
    assert.strictEqual(q5.type, undefined);

    // validateQueryFields can be called standalone
    const parsed = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    WebdaQL.validateQueryFields(parsed, allowed); // should not throw
    assert.throws(
      () => WebdaQL.validateQueryFields(parsed, ["status"]),
      /Unknown field "name"/
    );
  }

  @test
  caseInsensitiveKeywords() {
    // lowercase delete
    const q1 = WebdaQL.parse("delete where status = 'inactive'");
    assert.strictEqual(q1.type, "DELETE");
    assert.ok(q1.filter.eval({ status: "inactive" }));

    // mixed case delete
    const q1b = WebdaQL.parse("Delete Where status = 'old'");
    assert.strictEqual(q1b.type, "DELETE");

    // lowercase update
    const q2 = WebdaQL.parse("update set status = 'active' where name = 'John'");
    assert.strictEqual(q2.type, "UPDATE");
    assert.deepStrictEqual(q2.assignments, [{ field: "status", value: "active" }]);
    assert.ok(q2.filter.eval({ name: "John" }));

    // mixed case update
    const q2b = WebdaQL.parse("Update Set profile.verified = true Where id = 1");
    assert.strictEqual(q2b.type, "UPDATE");
    assert.deepStrictEqual(q2b.assignments, [{ field: "profile.verified", value: true }]);

    // lowercase select
    const q3 = WebdaQL.parse("select name, age where status = 'active'");
    assert.strictEqual(q3.type, "SELECT");
    assert.deepStrictEqual(q3.fields, ["name", "age"]);

    // lowercase delete with limit
    const q4 = WebdaQL.parse("delete where status = 'old' limit 100");
    assert.strictEqual(q4.type, "DELETE");
    assert.strictEqual(q4.limit, 100);

    // lowercase boolean values in assignments
    const q5 = WebdaQL.parse("UPDATE SET active = false WHERE id = 1");
    assert.deepStrictEqual(q5.assignments, [{ field: "active", value: false }]);

    // UPPERCASE keywords
    const q6 = WebdaQL.parse("DELETE WHERE status = 'old'");
    assert.strictEqual(q6.type, "DELETE");
    const q7 = WebdaQL.parse("UPDATE SET status = 'active' WHERE name = 'John'");
    assert.strictEqual(q7.type, "UPDATE");
    const q8 = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    assert.strictEqual(q8.type, "SELECT");

    // lowercase filter keywords
    const q9 = new WebdaQL.QueryValidator("status = 'active' and age > 18");
    assert.ok(q9.getExpression().eval({ status: "active", age: 20 }));
    const q10 = new WebdaQL.QueryValidator("status = 'active' or age > 18");
    assert.ok(q10.getExpression().eval({ age: 20 }));

    // lowercase like, in, contains
    const q11 = new WebdaQL.QueryValidator("name like 'Jo%'");
    assert.ok(q11.getExpression().eval({ name: "John" }));
    const q12 = new WebdaQL.QueryValidator("status in ['active', 'pending']");
    assert.ok(q12.getExpression().eval({ status: "active" }));
    const q13 = new WebdaQL.QueryValidator("tags contains 'vip'");
    assert.ok(q13.getExpression().eval({ tags: ["vip", "premium"] }));

    // lowercase order by, limit, offset
    const q14 = WebdaQL.parse("SELECT name WHERE status = 'active' order by name asc limit 5 offset 'tok'");
    assert.strictEqual(q14.type, "SELECT");
    assert.strictEqual(q14.limit, 5);
    assert.strictEqual(q14.continuationToken, "tok");
    assert.deepStrictEqual(q14.orderBy, [{ field: "name", direction: "ASC" }]);

    // lowercase desc
    const q15 = WebdaQL.parse("SELECT name WHERE status = 'active' order by name desc");
    assert.deepStrictEqual(q15.orderBy, [{ field: "name", direction: "DESC" }]);

    // lowercase true/false in filters
    const q16 = new WebdaQL.QueryValidator("active = true");
    assert.ok(q16.getExpression().eval({ active: true }));
    const q17 = new WebdaQL.QueryValidator("active = false");
    assert.ok(q17.getExpression().eval({ active: false }));
  }

  @test
  modelFieldValidation() {
    // Simulate a model's JSON Schema properties (as getAllowedFields() would return)
    const userFields = ["name", "email", "age", "status", "profile.bio", "profile.avatar"];

    // SELECT: valid fields pass
    const q1 = WebdaQL.parse("SELECT name, email WHERE status = 'active'", userFields);
    assert.strictEqual(q1.type, "SELECT");
    assert.deepStrictEqual(q1.fields, ["name", "email"]);

    // SELECT: unknown field rejects
    assert.throws(
      () => WebdaQL.parse("SELECT name, password WHERE status = 'active'", userFields),
      /Unknown field "password"/
    );

    // SELECT: nested dot-notation field passes
    const q2 = WebdaQL.parse("SELECT name, profile.bio WHERE age > 18", userFields);
    assert.deepStrictEqual(q2.fields, ["name", "profile.bio"]);

    // SELECT: unknown nested field rejects
    assert.throws(
      () => WebdaQL.parse("SELECT name, profile.ssn WHERE age > 18", userFields),
      /Unknown field "profile.ssn"/
    );

    // UPDATE: valid assignment fields pass
    const q3 = WebdaQL.parse("UPDATE SET status = 'banned', age = 0 WHERE name = 'spam'", userFields);
    assert.strictEqual(q3.type, "UPDATE");
    assert.deepStrictEqual(q3.assignments, [
      { field: "status", value: "banned" },
      { field: "age", value: 0 }
    ]);

    // UPDATE: unknown assignment field rejects
    assert.throws(
      () => WebdaQL.parse("UPDATE SET role = 'admin' WHERE name = 'hacker'", userFields),
      /Unknown assignment field "role"/
    );

    // UPDATE: nested assignment field validates
    WebdaQL.parse("UPDATE SET profile.bio = 'hello' WHERE name = 'John'", userFields);
    assert.throws(
      () => WebdaQL.parse("UPDATE SET profile.secret = 'x' WHERE name = 'John'", userFields),
      /Unknown assignment field "profile.secret"/
    );

    // DELETE: not affected by allowedFields (no field projection)
    const q4 = WebdaQL.parse("DELETE WHERE status = 'old'", userFields);
    assert.strictEqual(q4.type, "DELETE");

    // Plain filter: not affected by allowedFields
    const q5 = WebdaQL.parse("status = 'active'", userFields);
    assert.strictEqual(q5.type, undefined);

    // Standalone validateQueryFields works the same way
    const parsed = WebdaQL.parse("SELECT name, age WHERE status = 'active'");
    WebdaQL.validateQueryFields(parsed, userFields); // passes
    assert.throws(
      () => WebdaQL.validateQueryFields(parsed, ["name"]), // age not allowed
      /Unknown field "age"/
    );

    // Empty allowedFields rejects everything
    assert.throws(
      () => WebdaQL.parse("SELECT name, email WHERE status = 'active'", []),
      /Unknown field "name"/
    );
  }
}
