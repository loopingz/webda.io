import { suite, test } from "@testdeck/mocha";

import { WebdaQL } from "./query";
import * as assert from "assert";

const targets = [
  {
    test: {
      attr1: "plop"
    },
    attr2: "OK",
    attr3: 13,
    attr4: "ok"
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
      "a = 1 AND b=2 OR a=1 AND b=3": "( a = 1 AND b = 2 ) OR ( a = 1 AND b = 3 )" // TODO Might want to auto-simplify to a = 1 AND b IN [2,3]
    };
    for (let query in queryMap) {
      const validator = new WebdaQL.QueryValidator(query);
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
  simple() {
    assert.strictEqual(new WebdaQL.QueryValidator("test.attr1 = 'plop'").eval(targets[0]), true);
    assert.strictEqual(new WebdaQL.QueryValidator("test.attr1 = 'plop2'").eval(targets[0]), false);
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
}
