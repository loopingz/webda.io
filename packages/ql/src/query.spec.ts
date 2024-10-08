import { suite, test } from "@testdeck/mocha";
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
      "a = 1 AND b=2 OR a=1 AND b=3": "( a = 1 AND b = 2 ) OR ( a = 1 AND b = 3 )", // TODO Might want to auto-simplify to a = 1 AND b IN [2,3]
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
}
