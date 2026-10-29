import { suite, test } from "@webda/test";
import * as assert from "assert";
import type { FlowDefinition, Journal, Stmt } from "./graph.js";
import { run, type RunResult } from "./interpreter.js";

/**
 * Build a flow definition around a body
 * @param body - the statements
 * @param params - the parameter names
 * @returns the definition
 */
function flow(body: Stmt[], params: string[] = []): FlowDefinition {
  return { id: "Test.Flow", version: "v1", params, input: { type: "object" }, body, source: "code" };
}

/**
 * Keys of the scheduled tasks of a pending result
 * @param res - the run result
 * @returns the keys
 */
function keys(res: RunResult): string[] {
  assert.strictEqual(res.status, "pending", JSON.stringify(res));
  return res.status === "pending" ? res.schedule.map(t => t.key) : [];
}

@suite
class InterpreterTest {
  @test
  sequence() {
    const def = flow(
      [
        {
          kind: "task",
          id: "f/A",
          operation: "Test.Add",
          input: { obj: { a: { var: "x" }, b: { lit: 1 } } },
          assign: "r1"
        },
        {
          kind: "task",
          id: "f/B",
          operation: "Test.Add",
          input: { obj: { a: { var: "r1" }, b: { lit: 2 } } },
          options: { retries: 2 },
          assign: "r2"
        },
        { kind: "return", id: "f/ret", value: { obj: { r1: { var: "r1" }, r2: { var: "r2" } } } }
      ],
      ["x"]
    );
    def.options = { timeout: "10s" };
    const journal: Journal = {};
    let res = run(def, { x: 1 }, journal);
    assert.deepStrictEqual(res, {
      status: "pending",
      schedule: [{ key: "f/A@", operation: "Test.Add", input: { a: 1, b: 1 }, options: { timeout: "10s" } }]
    });
    journal["f/A@"] = { result: 2 };
    res = run(def, { x: 1 }, journal);
    assert.deepStrictEqual(res, {
      status: "pending",
      schedule: [{ key: "f/B@", operation: "Test.Add", input: { a: 2, b: 2 }, options: { timeout: "10s", retries: 2 } }]
    });
    journal["f/B@"] = { result: 4 };
    assert.deepStrictEqual(run(def, { x: 1 }, journal), { status: "done", output: { r1: 2, r2: 4 } });
    // No return: output undefined
    assert.deepStrictEqual(run(flow([]), {}, {}), { status: "done", output: undefined });
  }

  @test
  ifBranches() {
    const def = flow(
      [
        {
          kind: "if",
          id: "f/if",
          cond: { op: ">", args: [{ var: "n" }, { lit: 5 }] },
          then: [{ kind: "return", id: "f/if/then/ret", value: { lit: "big" } }],
          else: [{ kind: "assign", id: "f/if/else/assign", name: "out", value: { lit: "small" } }]
        },
        { kind: "return", id: "f/ret", value: { var: "out" } }
      ],
      ["n"]
    );
    assert.deepStrictEqual(run(def, { n: 10 }, {}), { status: "done", output: "big" });
    assert.deepStrictEqual(run(def, { n: 1 }, {}), { status: "done", output: "small" });
    const noElse = flow([{ kind: "if", id: "f/if", cond: { lit: false }, then: [] }]);
    assert.deepStrictEqual(run(noElse, {}, {}), { status: "done", output: undefined });
  }

  @test
  forOfKeys() {
    const def = flow([
      {
        kind: "forOf",
        id: "f/for",
        item: "o",
        items: { lit: ["a", "b", "c"] },
        body: [{ kind: "task", id: "f/for/T", operation: "Test.T", input: { var: "o" } }]
      },
      { kind: "return", id: "f/ret", value: { lit: true } }
    ]);
    const journal: Journal = {};
    for (let i = 0; i < 3; i++) {
      const res = run(def, {}, journal);
      assert.deepStrictEqual(keys(res), [`f/for/T@${i}`]);
      assert.strictEqual(res.status === "pending" && res.schedule[0].input, ["a", "b", "c"][i]);
      journal[`f/for/T@${i}`] = { result: i };
    }
    assert.deepStrictEqual(run(def, {}, journal), { status: "done", output: true });
    // Nested loops: the path joins the indexes
    const nested = flow([
      {
        kind: "forOf",
        id: "f/for",
        item: "a",
        items: { lit: [1, 2, 3] },
        body: [
          {
            kind: "forOf",
            id: "f/for/for",
            item: "b",
            items: { lit: [1] },
            body: [{ kind: "task", id: "f/for/for/T", operation: "Test.T", input: { lit: null } }]
          }
        ]
      }
    ]);
    assert.deepStrictEqual(
      keys(run(nested, {}, { "f/for/for/T@0.0": { result: 1 }, "f/for/for/T@1.0": { result: 1 } })),
      ["f/for/for/T@2.0"]
    );
    // Not an array
    const bad = run(flow([{ kind: "forOf", id: "f/for", item: "a", items: { lit: 3 }, body: [] }]), {}, {});
    assert.strictEqual(bad.status, "error");
    assert.strictEqual(bad.status === "error" && bad.error.code, "TypeError");
  }

  @test
  whileLoop() {
    const counter = (limit: number) =>
      flow([
        { kind: "assign", id: "f/i", name: "i", value: { lit: 0 } },
        {
          kind: "while",
          id: "f/while",
          cond: { op: "<", args: [{ var: "i" }, { lit: limit }] },
          body: [{ kind: "assign", id: "f/while/inc", name: "i", value: { op: "+", args: [{ var: "i" }, { lit: 1 }] } }]
        },
        { kind: "return", id: "f/ret", value: { var: "i" } }
      ]);
    assert.deepStrictEqual(run(counter(5), {}, {}), { status: "done", output: 5 });
    assert.deepStrictEqual(run(counter(10000), {}, {}), { status: "done", output: 10000 });
    const res = run(counter(20000), {}, {});
    assert.strictEqual(res.status, "error");
    assert.strictEqual(res.status === "error" && res.error.code, "LoopLimit");
    // Tasks in a while get the iteration index
    const tasks = flow([
      { kind: "assign", id: "f/i", name: "i", value: { lit: 0 } },
      {
        kind: "while",
        id: "f/while",
        cond: { op: "<", args: [{ var: "i" }, { lit: 2 }] },
        body: [{ kind: "task", id: "f/while/T", operation: "Test.Inc", input: { var: "i" }, assign: "i" }]
      }
    ]);
    assert.deepStrictEqual(keys(run(tasks, {}, { "f/while/T@0": { result: 1 } })), ["f/while/T@1"]);
    assert.strictEqual(run(tasks, {}, { "f/while/T@0": { result: 1 }, "f/while/T@1": { result: 2 } }).status, "done");
  }

  @test
  tryCatchFinally() {
    const def = flow([
      {
        kind: "try",
        id: "f/try",
        body: [{ kind: "task", id: "f/try/T", operation: "Test.Fail", input: { lit: {} }, assign: "r" }],
        catchVar: "e",
        catch: [{ kind: "assign", id: "f/try/catch/a", name: "caught", value: { var: "e" } }],
        finally: [{ kind: "task", id: "f/try/finally/F", operation: "Test.Cleanup", input: { lit: {} } }]
      },
      { kind: "return", id: "f/ret", value: { obj: { r: { var: "r" }, caught: { var: "caught" } } } }
    ]);
    const error = { code: "Boom", message: "failed", operation: "Test.Fail" };
    // Error path: catch binds the FlowError, then finally runs
    assert.deepStrictEqual(keys(run(def, {}, { "f/try/T@": { error } })), ["f/try/finally/F@"]);
    assert.deepStrictEqual(run(def, {}, { "f/try/T@": { error }, "f/try/finally/F@": { result: null } }), {
      status: "done",
      output: { r: undefined, caught: error }
    });
    // Success path: finally runs too
    assert.deepStrictEqual(keys(run(def, {}, { "f/try/T@": { result: 1 } })), ["f/try/finally/F@"]);
    assert.deepStrictEqual(run(def, {}, { "f/try/T@": { result: 1 }, "f/try/finally/F@": { result: null } }), {
      status: "done",
      output: { r: 1, caught: undefined }
    });
    // Uncaught: try/finally without catch rethrows after finally
    const uncaught = flow([
      {
        kind: "try",
        id: "f/try",
        body: [{ kind: "task", id: "f/try/T", operation: "Test.Fail", input: { lit: {} } }],
        finally: [{ kind: "assign", id: "f/try/finally/a", name: "x", value: { lit: 1 } }]
      }
    ]);
    assert.deepStrictEqual(run(uncaught, {}, { "f/try/T@": { error } }), { status: "error", error });
    // A return in the body still runs finally
    const ret = flow([
      {
        kind: "try",
        id: "f/try",
        body: [{ kind: "return", id: "f/try/ret", value: { lit: 1 } }],
        finally: [{ kind: "task", id: "f/try/finally/F", operation: "Test.Cleanup", input: { lit: {} } }]
      }
    ]);
    assert.deepStrictEqual(keys(run(ret, {}, {})), ["f/try/finally/F@"]);
    assert.deepStrictEqual(run(ret, {}, { "f/try/finally/F@": { result: 0 } }), { status: "done", output: 1 });
  }

  @test
  throwStatement() {
    const def = flow([{ kind: "throw", id: "f/throw", value: { tpl: ["bad ", { lit: 1 }] } }]);
    assert.deepStrictEqual(run(def, {}, {}), {
      status: "error",
      error: { code: "FlowError", message: "bad 1", operation: "Test.Flow" }
    });
    // Rethrowing a caught error keeps it
    const error = { code: "Boom", message: "failed", operation: "Test.Fail" };
    const rethrow = flow([
      {
        kind: "try",
        id: "f/try",
        body: [{ kind: "task", id: "f/try/T", operation: "Test.Fail", input: { lit: {} } }],
        catchVar: "e",
        catch: [{ kind: "throw", id: "f/try/catch/throw", value: { var: "e" } }]
      }
    ]);
    assert.deepStrictEqual(run(rethrow, {}, { "f/try/T@": { error } }), { status: "error", error });
    // An object without code/message
    const obj = run(flow([{ kind: "throw", id: "f/throw", value: { lit: { a: 1 } } }]), {}, {});
    assert.deepStrictEqual(obj.status === "error" && obj.error, {
      code: "FlowError",
      message: '{"a":1}',
      operation: "Test.Flow"
    });
  }

  @test
  parallelBranches() {
    const def = flow([
      {
        kind: "parallel",
        id: "f/par",
        branches: [
          [
            { kind: "task", id: "f/par/0/A", operation: "Test.A", input: { lit: 1 }, assign: "a" },
            { kind: "return", id: "f/par/0/ret", value: { var: "a" } }
          ],
          [
            { kind: "task", id: "f/par/1/B", operation: "Test.B", input: { lit: 2 }, assign: "b" },
            { kind: "return", id: "f/par/1/ret", value: { var: "b" } }
          ]
        ],
        assign: "both"
      },
      { kind: "return", id: "f/ret", value: { var: "both" } }
    ]);
    assert.deepStrictEqual(keys(run(def, {}, {})), ["f/par/0/A@0", "f/par/1/B@1"]);
    assert.deepStrictEqual(keys(run(def, {}, { "f/par/1/B@1": { result: "B" } })), ["f/par/0/A@0"]);
    assert.deepStrictEqual(run(def, {}, { "f/par/0/A@0": { result: "A" }, "f/par/1/B@1": { result: "B" } }), {
      status: "done",
      output: ["A", "B"]
    });
    // An error in a branch throws out of the parallel
    const error = { code: "Boom", message: "failed", operation: "Test.B" };
    assert.deepStrictEqual(run(def, {}, { "f/par/1/B@1": { error } }), { status: "error", error });
  }

  @test
  mapConcurrency() {
    const def = flow([
      {
        kind: "map",
        id: "f/map",
        items: { lit: [10, 20, 30, 40, 50] },
        item: "n",
        concurrency: 2,
        body: [
          { kind: "task", id: "f/map/T", operation: "Test.Double", input: { var: "n" }, assign: "d" },
          { kind: "return", id: "f/map/ret", value: { var: "d" } }
        ],
        assign: "doubled"
      },
      { kind: "return", id: "f/ret", value: { var: "doubled" } }
    ]);
    const journal: Journal = {};
    assert.deepStrictEqual(keys(run(def, {}, journal)), ["f/map/T@0", "f/map/T@1"]);
    journal["f/map/T@0"] = { result: 20 };
    const res = run(def, {}, journal);
    assert.deepStrictEqual(keys(res), ["f/map/T@1", "f/map/T@2"]);
    assert.strictEqual(res.status === "pending" && res.schedule[1].input, 30);
    for (let i = 1; i < 5; i++) {
      journal[`f/map/T@${i}`] = { result: (i + 1) * 20 };
    }
    assert.deepStrictEqual(run(def, {}, journal), { status: "done", output: [20, 40, 60, 80, 100] });
    // Without concurrency every item is scheduled
    delete def.body[0]["concurrency"];
    assert.strictEqual(keys(run(def, {}, {})).length, 5);
  }

  @test
  branchIsolation() {
    const def = flow([
      { kind: "assign", id: "f/x", name: "x", value: { lit: "parent" } },
      {
        kind: "parallel",
        id: "f/par",
        branches: [
          [
            { kind: "assign", id: "f/par/0/x", name: "x", value: { lit: "branch" } },
            { kind: "return", id: "f/par/0/ret", value: { var: "x" } }
          ],
          [{ kind: "return", id: "f/par/1/ret", value: { var: "x" } }]
        ],
        assign: "res"
      },
      {
        kind: "map",
        id: "f/map",
        items: { lit: [1] },
        item: "x",
        body: [{ kind: "assign", id: "f/map/y", name: "y", value: { lit: 1 } }]
      },
      { kind: "return", id: "f/ret", value: { arr: [{ var: "x" }, { var: "res" }, { var: "y" }] } }
    ]);
    assert.deepStrictEqual(run(def, {}, {}), { status: "done", output: ["parent", ["branch", "parent"], undefined] });
  }

  @test
  dateNowDeterminism() {
    const def = flow([
      { kind: "task", id: "f/Date.Now", operation: "Date.Now", input: { lit: {} }, assign: "now" },
      {
        kind: "if",
        id: "f/if",
        cond: { op: ">", args: [{ var: "now" }, { lit: 1000 }] },
        then: [{ kind: "task", id: "f/if/then/Late", operation: "Test.Late", input: { var: "now" } }],
        else: [{ kind: "task", id: "f/if/else/Early", operation: "Test.Early", input: { var: "now" } }]
      }
    ]);
    assert.deepStrictEqual(keys(run(def, {}, {})), ["f/Date.Now@"]);
    const journal: Journal = { "f/Date.Now@": { result: 5000 } };
    for (let i = 0; i < 3; i++) {
      const res = run(def, {}, journal);
      assert.deepStrictEqual(res, {
        status: "pending",
        schedule: [{ key: "f/if/then/Late@", operation: "Test.Late", input: 5000, options: {} }]
      });
    }
  }

  @test
  invalidExpression() {
    const res = run(flow([{ kind: "return", id: "f/ret", value: { nope: 1 } as any }]), {}, {});
    assert.strictEqual(res.status === "error" && res.error.code, "ExpressionError");
    const unknown = run(flow([{ kind: "goto", id: "f/goto" } as any]), {}, {});
    assert.strictEqual(unknown.status === "error" && unknown.error.code, "InvalidStatement");
  }
}
