import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { WebdaQL } from "./query";

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
    let queryMap = {
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
    for (let query in queryMap) {
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
  limitOffset() {
    let val = new WebdaQL.QueryValidator('LIMIT 10 OFFSET "pl"');
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
}
