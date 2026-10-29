import { suite, test } from "@webda/test";
import * as assert from "assert";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFlows, flowsGenerator, openSession, runTwoPass, type CompiledFlow } from "@webda/content-mapper";
import { validateExpr } from "./expression.js";
import { BUILTINS, flowVersion, type FlowDefinition, type Journal, type Stmt } from "./graph.js";
import { run } from "./interpreter.js";

/**
 * The contract between `@webda/content-mapper`, which compiles `.flow.ts` methods, and this package, which runs
 * them: the content mapper duplicates the graph types instead of depending on this package (a cycle)
 */
const fixture = join(dirname(fileURLToPath(import.meta.url)), "..", "test", "flow-contract");
const flowFile = join(fixture, "src", "order.flow.ts").replace(/\\/g, "/");

/** Kinds of statement the interpreter runs. */
const KINDS = ["task", "assign", "if", "forOf", "while", "try", "parallel", "map", "return", "throw"];

/**
 * Every expression of a statement list, with its path
 * @param body - the statements
 * @returns path and expression pairs
 */
function expressions(body: Stmt[]): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const stmt of body) {
    const s: any = stmt;
    for (const key of ["input", "value", "cond", "items"]) {
      if (s[key] !== undefined) out.push([`${s.id}.${key}`, s[key]]);
    }
    for (const key of ["then", "else", "body", "catch", "finally"]) {
      if (s[key]) out.push(...expressions(s[key]));
    }
    for (const branch of s.branches ?? []) out.push(...expressions(branch));
  }
  return out;
}

/**
 * Every statement of a statement list
 * @param body - the statements
 * @returns the statements, depth first
 */
function statements(body: Stmt[]): Stmt[] {
  return body.flatMap((stmt: any) => [
    stmt,
    ...["then", "else", "body", "catch", "finally"].flatMap(key => (stmt[key] ? statements(stmt[key]) : [])),
    ...(stmt.branches ?? []).flatMap((branch: Stmt[]) => statements(branch))
  ]);
}

@suite
class CompiledContractTest {
  /**
   * The compiled fixture flows
   * @returns the flows by id
   */
  compile(): Record<string, CompiledFlow> {
    const session = openSession(join(fixture, "tsconfig.json"), join(fixture, "src"));
    try {
      const { flows, errors } = compileFlows(session.ctx);
      assert.deepStrictEqual(errors, []);
      return flows;
    } finally {
      session.dispose();
    }
  }

  @test
  typeChecksAgainstTheAuthoringApi() {
    const result = runTwoPass({
      configFile: join(fixture, "tsconfig.json"),
      rootDir: join(fixture, "src"),
      generators: [flowsGenerator()]
    });
    assert.ok(result.injected.get(flowFile), "the flow file gets its typed calls");
    const own = result.diagnostics.filter((d: any) => d.fileName?.startsWith(fixture.replace(/\\/g, "/")));
    assert.deepStrictEqual(
      own.map((d: any) => `${d.fileName}: ${d.text}`),
      []
    );
  }

  @test
  compiledGraphIsValid() {
    const flows = this.compile();
    assert.deepStrictEqual(Object.keys(flows).sort(), [
      "OrderFlows.Archive",
      "OrderFlows.Defaults",
      "OrderFlows.Reconcile"
    ]);
    for (const flow of Object.values(flows)) {
      const body = flow.body as Stmt[];
      for (const [path, expr] of expressions(body)) {
        assert.deepStrictEqual(validateExpr(expr), [], path);
      }
      const all = statements(body);
      for (const stmt of all) {
        assert.ok(KINDS.includes(stmt.kind), stmt.kind);
      }
      // Statement ids are unique
      assert.strictEqual(new Set(all.map(s => s.id)).size, all.length);
      // The version is the engine's
      assert.strictEqual(flow.version, flowVersion({ params: flow.params, body, options: undefined }));
      // JSON only
      assert.deepStrictEqual(JSON.parse(JSON.stringify(flow)), flow);
    }
    const operations = statements(flows["OrderFlows.Reconcile"].body as Stmt[])
      .filter(s => s.kind === "task")
      .map((s: any) => s.operation);
    for (const builtin of [BUILTINS.DateNow, BUILTINS.RandomNumber, BUILTINS.RandomUuid, BUILTINS.Sleep]) {
      assert.ok(operations.includes(builtin), builtin);
    }
    assert.ok(operations.includes(BUILTINS.WaitForEvent));
    assert.ok(operations.includes(BUILTINS.Start));
    assert.deepStrictEqual(flows["OrderFlows.Reconcile"].crons, [
      { cron: "0 3 * * *", description: "Nightly reconciliation", input: { full: false } }
    ]);
  }

  @test
  compiledFlowRuns() {
    const flow = this.compile()["OrderFlows.Reconcile"];
    const def: FlowDefinition = { ...flow, body: flow.body as Stmt[] };
    const journal: Journal = {};
    const calls: { operation: string; input: any; options: any }[] = [];
    for (let i = 0; i < 100; i++) {
      const res = run(def, { full: true }, journal);
      if (res.status !== "pending") {
        assert.strictEqual(res.status, "done");
        assert.deepStrictEqual((res as any).output, {
          count: 2,
          refused: 1,
          full: true,
          ids: ["uuid-0", "uuid-1"],
          archived: 1000,
          label: "full"
        });
        break;
      }
      for (const task of res.schedule) {
        calls.push({ operation: task.operation, input: task.input, options: task.options });
        switch (task.operation) {
          case "Order.Query":
            journal[task.key] = {
              result: [
                { uuid: "a", amount: 1 },
                { uuid: "b", amount: 2 }
              ]
            };
            break;
          case "PaymentService.Capture":
            journal[task.key] =
              task.input.uuid === "b"
                ? { error: { code: "Refused", message: "refused", operation: task.operation } }
                : { result: { ok: true } };
            break;
          case BUILTINS.DateNow:
            journal[task.key] = { result: 1000 };
            break;
          case BUILTINS.RandomUuid:
            journal[task.key] = { result: `uuid-${task.key.split("@")[1]}` };
            break;
          case BUILTINS.RandomNumber:
            journal[task.key] = { result: 0.5 };
            break;
          case "OrderFlows.Archive":
            journal[task.key] = { result: task.input.since };
            break;
          case BUILTINS.Start:
            journal[task.key] = { result: { uuid: "child" } };
            break;
          default:
            journal[task.key] = { result: null };
        }
      }
    }
    assert.deepStrictEqual(
      calls.filter(c => c.operation === "PaymentService.Capture").map(c => [c.input, c.options]),
      [
        [{ uuid: "a", amount: 1 }, { retries: 3 }],
        [{ uuid: "b", amount: 2 }, { retries: 3 }]
      ]
    );
    // The failing order goes through the catch
    assert.deepStrictEqual(
      calls.filter(c => c.operation === BUILTINS.WaitForEvent).map(c => c.input),
      [{ name: "manual-review", key: "b", timeout: "7d" }]
    );
    assert.strictEqual(calls.filter(c => c.operation === BUILTINS.Sleep).length, 2);
    assert.deepStrictEqual(calls.find(c => c.operation === BUILTINS.Start)?.input, {
      flow: "OrderFlows.Archive",
      input: { since: 1000 }
    });
  }

  @test
  compiledSemanticsMatchTypeScript() {
    const flow = this.compile()["OrderFlows.Defaults"];
    const def: FlowDefinition = { ...flow, body: flow.body as Stmt[] };
    // The defaults apply to a missing input, and `let y;` is undefined again on each iteration
    assert.deepStrictEqual(run(def, {}, {}), { status: "done", output: 3 + 5 + 0 + 5 });
    assert.deepStrictEqual(run(def, { n: 1, items: [2] }, {}), { status: "done", output: 3 });
  }
}
