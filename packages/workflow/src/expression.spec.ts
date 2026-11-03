import { suite, test } from "@webda/test";
import * as assert from "assert";
import { evaluate, MAX_EXPR_STRING_LENGTH, validateExpr } from "./expression.js";
import type { BinaryOp, Expr } from "./graph.js";

/**
 * Build a binary operation over two literals
 * @param op - the operator
 * @param a - left value
 * @param b - right value
 * @returns the expression
 */
function bin(op: BinaryOp, a: any, b: any): Expr {
  return { op, args: [{ lit: a }, { lit: b }] };
}

@suite
class ExpressionTest {
  @test
  literalsAndVariables() {
    assert.strictEqual(evaluate({ lit: 3 }, {}), 3);
    assert.deepStrictEqual(evaluate({ lit: { a: [1] } }, {}), { a: [1] });
    assert.strictEqual(evaluate({ var: "x" }, { x: "y" }), "y");
    assert.strictEqual(evaluate({ var: "missing" }, {}), undefined);
  }

  @test
  everyOperator() {
    const cases: [BinaryOp, any, any, any][] = [
      ["==", 1, "1", true],
      ["!=", 1, "2", true],
      ["===", 1, "1", false],
      ["!==", 1, "1", true],
      ["<", 1, 2, true],
      ["<=", 2, 2, true],
      [">", 1, 2, false],
      [">=", 3, 2, true],
      ["+", 1, 2, 3],
      ["+", "a", "b", "ab"],
      ["-", 5, 2, 3],
      ["*", 3, 4, 12],
      ["/", 9, 3, 3],
      ["%", 7, 3, 1],
      ["&&", 1, 2, 2],
      ["&&", 0, 2, 0],
      ["||", 0, 2, 2],
      ["||", 1, 2, 1],
      ["??", null, 2, 2],
      ["??", 0, 2, 0]
    ];
    for (const [op, a, b, expected] of cases) {
      assert.strictEqual(evaluate(bin(op, a, b), {}), expected, `${a} ${op} ${b}`);
    }
    assert.strictEqual(evaluate({ not: { lit: 0 } }, {}), true);
    assert.strictEqual(evaluate({ neg: { lit: 4 } }, {}), -4);
    assert.strictEqual(evaluate({ cond: [{ lit: true }, { lit: "a" }, { lit: "b" }] }, {}), "a");
    assert.strictEqual(evaluate({ cond: [{ lit: false }, { lit: "a" }, { lit: "b" }] }, {}), "b");
    assert.deepStrictEqual(evaluate({ obj: { a: { var: "x" }, b: { lit: 2 } } }, { x: 1 }), { a: 1, b: 2 });
    assert.deepStrictEqual(evaluate({ arr: [{ var: "x" }, { lit: 2 }] }, { x: 1 }), [1, 2]);
  }

  @test
  shortCircuits() {
    // The right side throws when evaluated: an unknown expression node
    const throwingRight = { boom: true } as unknown as Expr;
    assert.throws(() => evaluate(throwingRight, {}), /Invalid expression/);
    assert.strictEqual(evaluate({ op: "&&", args: [{ lit: 0 }, throwingRight] }, {}), 0);
    assert.strictEqual(evaluate({ op: "||", args: [{ lit: "y" }, throwingRight] }, {}), "y");
    assert.strictEqual(evaluate({ op: "??", args: [{ lit: "z" }, throwingRight] }, {}), "z");
    assert.strictEqual(evaluate({ cond: [{ lit: 1 }, { lit: "t" }, throwingRight] }, {}), "t");
    // A get on undefined does not throw
    assert.strictEqual(
      evaluate({ op: "&&", args: [{ var: "u" }, { get: [{ var: "u" }, { lit: "a" }] }] }, {}),
      undefined
    );
  }

  @test
  getAccess() {
    assert.strictEqual(evaluate({ get: [{ var: "o" }, { lit: "a" }] }, { o: { a: 1 } }), 1);
    assert.strictEqual(evaluate({ get: [{ var: "o" }, { lit: 1 }] }, { o: [5, 6] }), 6);
    assert.strictEqual(evaluate({ get: [{ var: "o" }, { lit: "length" }] }, { o: [5, 6] }), 2);
    // get on undefined returns undefined
    assert.strictEqual(evaluate({ get: [{ var: "nope" }, { lit: "a" }] }, {}), undefined);
    assert.strictEqual(evaluate({ get: [{ lit: null }, { lit: "a" }] }, {}), undefined);
    // Never reach the prototype chain
    assert.strictEqual(evaluate({ get: [{ var: "o" }, { lit: "constructor" }] }, { o: {} }), undefined);
    assert.strictEqual(evaluate({ get: [{ var: "o" }, { lit: "__proto__" }] }, { o: {} }), undefined);
  }

  @test
  templates() {
    assert.strictEqual(evaluate({ tpl: ["order ", { var: "id" }, " is ", { lit: 3 }] }, { id: "o1" }), "order o1 is 3");
    assert.strictEqual(evaluate({ tpl: [{ var: "u" }] }, {}), "undefined");
  }

  @test
  validate() {
    assert.deepStrictEqual(validateExpr({ lit: 1 }), []);
    assert.deepStrictEqual(validateExpr({ call: "x" }), ["$"]);
    assert.deepStrictEqual(validateExpr("x"), ["$"]);
    assert.deepStrictEqual(validateExpr(null), ["$"]);
    assert.deepStrictEqual(validateExpr({ op: "**", args: [{ lit: 1 }, { lit: 2 }] }), ["$"]);
    assert.deepStrictEqual(validateExpr({ op: "+", args: [{ lit: 1 }] }), ["$"]);
    assert.deepStrictEqual(validateExpr({ lit: 1, var: "x" }), ["$"]);
    assert.deepStrictEqual(
      validateExpr({
        obj: { a: { var: "x" }, b: { call: 1 } },
        // extra key makes it invalid at the root as well
        arr: []
      }),
      ["$"]
    );
    assert.deepStrictEqual(validateExpr({ obj: { a: { var: "x" }, b: { call: 1 } } }), ["$.obj.b"]);
    assert.deepStrictEqual(validateExpr({ arr: [{ lit: 1 }, { nope: 1 }] }), ["$.arr[1]"]);
    assert.deepStrictEqual(validateExpr({ tpl: ["a", { var: 1 }, 3] }), ["$.tpl[1]", "$.tpl[2]"]);
    assert.deepStrictEqual(validateExpr({ cond: [{ lit: 1 }, { lit: 2 }] }), ["$"]);
    assert.deepStrictEqual(validateExpr({ get: [{ var: "o" }, { bad: 1 }] }), ["$.get[1]"]);
    assert.deepStrictEqual(validateExpr({ not: { x: 1 } }), ["$.not"]);
    assert.deepStrictEqual(validateExpr({ neg: { var: "a" } }), []);
    assert.deepStrictEqual(validateExpr({ obj: { constructor: { lit: 1 } } }), ["$.obj.constructor"]);

    // Expression string growth and forbidden object keys are bounded/rejected
    const big = "x".repeat(Math.floor(MAX_EXPR_STRING_LENGTH / 2) + 10);
    assert.throws(() => evaluate({ op: "+", args: [{ lit: big }, { lit: big }] }, {}), /string length limit/);
    assert.throws(() => evaluate({ tpl: [big, big] }, {}), /string length limit/);
    assert.throws(() => evaluate({ obj: { constructor: { lit: 1 } } }, {}), /Forbidden object key/);
    assert.deepStrictEqual(validateExpr({ var: 3 }), ["$"]);
    assert.deepStrictEqual(validateExpr({ obj: [] }), ["$"]);
  }

  @test
  invalidNodes() {
    // An operator unknown to the evaluator (a stored graph bypassing validateExpr)
    assert.throws(
      () => evaluate({ op: "**" as any, args: [{ lit: 2 }, { lit: 3 }] }, {}),
      /Invalid expression operator/
    );
    assert.throws(() => evaluate(null as any, {}), /Invalid expression null/);
    assert.throws(() => evaluate(3 as any, {}), /Invalid expression 3/);
    // arr and tpl must hold arrays
    assert.deepStrictEqual(validateExpr({ arr: { lit: 1 } }), ["$"]);
    assert.deepStrictEqual(validateExpr({ tpl: "a" }), ["$"]);
  }
}
