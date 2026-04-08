import { suite, test } from "@webda/test";
import * as assert from "assert";
import * as WebdaQL from "./query";
import { CharStreams, CommonTokenStream } from "antlr4ts";
import { ParseTreeWalker } from "antlr4ts/tree/index.js";
import { WebdaQLLexer } from "./WebdaQLLexer";
import { WebdaQLParserParser } from "./WebdaQLParserParser";
import type { WebdaQLParserListener } from "./WebdaQLParserListener";

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
  mergeTypeMismatch() {
    // AND filter merged with OR type — should wrap in OrExpression
    const v1 = new WebdaQL.QueryValidator("a = 1 AND b = 2");
    v1.merge("c = 3", "OR");
    const expr1 = v1.getExpression();
    assert.ok(expr1 instanceof WebdaQL.OrExpression);

    // OR filter merged with AND type — should wrap in AndExpression
    const v2 = new WebdaQL.QueryValidator("a = 1 OR b = 2");
    v2.merge("c = 3", "AND");
    const expr2 = v2.getExpression();
    assert.ok(expr2 instanceof WebdaQL.AndExpression);
  }

  @test
  getOffsetFallback() {
    // Query without OFFSET should return ""
    const v = new WebdaQL.QueryValidator("a = 1");
    assert.strictEqual(v.getOffset(), "");

    // Query with OFFSET
    const v2 = new WebdaQL.QueryValidator('OFFSET "tok"');
    assert.strictEqual(v2.getOffset(), "tok");
  }

  @test
  expressionToString() {
    // Test toString at different depths
    const v = new WebdaQL.QueryValidator("a = 1 AND (b = 2 OR c = 3)");
    const str = v.getExpression().toString();
    assert.ok(str.includes("a = 1"));

    // Empty AND/OR toString
    const emptyAnd = new WebdaQL.AndExpression([]);
    assert.strictEqual(emptyAnd.toString(), "");
    assert.strictEqual(emptyAnd.eval({}), true);

    const emptyOr = new WebdaQL.OrExpression([]);
    assert.strictEqual(emptyOr.toString(), "");
    assert.strictEqual(emptyOr.eval({}), true);

    // Test ComparisonExpression toString with various operators
    const comp = new WebdaQL.ComparisonExpression("!=", "field", "test");
    assert.strictEqual(comp.toString(), 'field != "test"');

    // Boolean values in toString
    const boolComp = new WebdaQL.ComparisonExpression("=", "field", true);
    assert.strictEqual(boolComp.toString(), "field = TRUE");

    // Array values in toString
    const arrComp = new WebdaQL.ComparisonExpression("IN", "field", ["a", 1, true]);
    assert.ok(arrComp.toString().includes("IN"));
  }

  @test
  hasCondition() {
    const v1 = new WebdaQL.QueryValidator("a = 1");
    assert.ok(v1.hasCondition());

    const v2 = new WebdaQL.QueryValidator("");
    assert.ok(!v2.hasCondition());

    const v3 = new WebdaQL.QueryValidator("ORDER BY a");
    assert.ok(!v3.hasCondition());
  }

  @test
  queryValidatorToString() {
    const v = new WebdaQL.QueryValidator("a = 1 ORDER BY b LIMIT 10");
    const str = v.toString();
    assert.ok(str.includes("a = 1"));
    assert.ok(str.includes("ORDER BY"));
    assert.ok(str.includes("LIMIT 10"));
  }

  @test
  complexQueries() {
    // Nested parentheses
    new WebdaQL.QueryValidator("(a = 1 OR b = 2) AND (c = 3 OR d = 4)").eval({ a: 1, c: 3 });

    // Multiple IN values
    const v = new WebdaQL.QueryValidator("field IN ['a', 'b', 'c', 'd']");
    assert.ok(v.eval({ field: "b" }));
    assert.ok(!v.eval({ field: "e" }));

    // Multiple ORDER BY
    const v2 = new WebdaQL.QueryValidator("a = 1 ORDER BY x DESC, y ASC, z DESC");
    assert.strictEqual(v2.toString().includes("ORDER BY"), true);

    // LIMIT + OFFSET + ORDER BY together
    const v3 = new WebdaQL.QueryValidator('a = 1 ORDER BY b LIMIT 5 OFFSET "page2"');
    assert.strictEqual(v3.getOffset(), "page2");

    // Numeric comparisons
    assert.ok(new WebdaQL.QueryValidator("x > 5").eval({ x: 10 }));
    assert.ok(new WebdaQL.QueryValidator("x >= 10").eval({ x: 10 }));
    assert.ok(new WebdaQL.QueryValidator("x < 10").eval({ x: 5 }));
    assert.ok(new WebdaQL.QueryValidator("x <= 10").eval({ x: 10 }));

    // FALSE boolean
    assert.ok(new WebdaQL.QueryValidator("x = FALSE").eval({ x: false }));
  }

  @test
  containsNonArray() {
    // CONTAINS on non-array should return false
    assert.ok(!new WebdaQL.QueryValidator("x CONTAINS 'a'").eval({ x: "hello" }));
    assert.ok(!new WebdaQL.QueryValidator("x CONTAINS 'a'").eval({ x: 42 }));
  }

  @test
  likeOnNonString() {
    // LIKE on numeric value should toString and match
    assert.ok(new WebdaQL.QueryValidator("x LIKE '1%'").eval({ x: 123 }));
  }

  @test
  lexerIntrospection() {
    const lexer = new WebdaQLLexer(CharStreams.fromString("a = 1"));
    assert.ok(lexer.grammarFileName);
    assert.ok(Array.isArray(lexer.ruleNames));
    assert.ok(typeof lexer.serializedATN === "string");
    assert.ok(Array.isArray(lexer.channelNames));
    assert.ok(Array.isArray(lexer.modeNames));
  }

  @test
  parserIntrospection() {
    const lexer = new WebdaQLLexer(CharStreams.fromString("a = 1"));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new WebdaQLParserParser(tokenStream);
    assert.ok(parser.vocabulary);
    assert.strictEqual(parser.grammarFileName, "WebdaQLParser.g4");
    assert.ok(Array.isArray(parser.ruleNames));
    assert.ok(typeof parser.serializedATN === "string");
  }

  @test
  listenerWalk() {
    const lexer = new WebdaQLLexer(CharStreams.fromString('a = 1 AND b LIKE "test%" AND c IN [1, "x", TRUE] AND d CONTAINS "v" AND (e = 2 OR f = 3) ORDER BY g DESC LIMIT 10 OFFSET "tok"'));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new WebdaQLParserParser(tokenStream);
    const tree = parser.webdaql();

    const visited: string[] = [];
    const listener: WebdaQLParserListener = {};
    // Dynamically add all enter/exit methods to track visits
    for (const rule of parser.ruleNames) {
      const capitalized = rule.charAt(0).toUpperCase() + rule.slice(1);
      listener[`enter${capitalized}`] = () => visited.push(`enter${capitalized}`);
      listener[`exit${capitalized}`] = () => visited.push(`exit${capitalized}`);
    }
    ParseTreeWalker.DEFAULT.walk(listener, tree);

    assert.ok(visited.includes("enterWebdaql"));
    assert.ok(visited.includes("exitWebdaql"));
    assert.ok(visited.length > 20);
  }

  @test
  contextAccessors() {
    // Exercise parser context accessor methods
    const lexer = new WebdaQLLexer(CharStreams.fromString('a = 1 AND b IN [1, 2] ORDER BY c DESC'));
    const tokenStream = new CommonTokenStream(lexer);
    const parser = new WebdaQLParserParser(tokenStream);
    const tree = parser.webdaql();

    // Access children of the parse tree
    assert.ok(tree.expression());
    const orderExpr = tree.orderExpression();
    assert.ok(orderExpr);
    assert.strictEqual(tree.limitExpression(), undefined);

    // Exercise ruleIndex
    assert.strictEqual(typeof tree.ruleIndex, "number");
  }

  @test
  setterAssignment() {
    // Test SetterValidator assignments
    const setter = new WebdaQL.SetterValidator("a = 1 AND b = 'hello' AND c = TRUE");
    const target = { a: 0, b: "", c: false };
    setter.eval(target);
    assert.strictEqual(target.a, 1);
    assert.strictEqual(target.b, "hello");
    assert.strictEqual(target.c, true);
  }

  @test
  mergePreservesExistingMeta() {
    // Same-type merge (AND + AND) should push into existing children
    const v = new WebdaQL.QueryValidator("a = 1 AND b = 2");
    v.merge("c = 3", "AND");
    const expr = v.getExpression();
    assert.ok(expr instanceof WebdaQL.AndExpression);
    assert.strictEqual((<WebdaQL.AndExpression>expr).children.length, 3);
  }
}
