import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FLOWS_FIXTURE, fixtureFile, openFixture } from "../../test/flows.ts";
import { flowsGenerator } from "../generators/flows.ts";
import { generateWebdaModule } from "../module.ts";
import { compileFlows, formatFlowError, type FlowCompileError, type FlowCompileResult } from "./compile.ts";
import { operationServices } from "./discovery.ts";
import { FLOW_ERROR, flowVersion, type CompiledFlow } from "./types.ts";

const scratch = fixtureFile("scratch.flow.ts");

/**
 * Text of the scratch flow file
 * @param methods - the members of `ScratchFlows`
 * @param extra - module-level statements
 * @returns the file text
 */
function scratchText(methods: string, extra = ""): string {
  return [
    `import { Cron, Random, Sleep, Wait, Workflow } from "./workflow.js";`,
    `import { OrderFlows } from "./order.flow.js";`,
    extra,
    `export class ScratchFlows extends Workflow {`,
    methods,
    `}`,
    ``
  ].join("\n");
}

/**
 * Compile the scratch flow file
 * @param methods - the members of `ScratchFlows`
 * @param extra - module-level statements
 * @returns its flows and errors, and its text
 */
function compile(
  methods: string,
  extra = ""
): { flows: Record<string, CompiledFlow>; errors: FlowCompileError[]; text: string } {
  const text = scratchText(methods, extra);
  const session = openFixture({ [scratch]: text });
  try {
    const result = compileFlows(session.ctx);
    const flows = Object.fromEntries(Object.entries(result.flows).filter(([id]) => id.startsWith("ScratchFlows.")));
    return { flows, errors: result.errors.filter(e => e.file === scratch), text };
  } finally {
    session.dispose();
  }
}

/**
 * Compile the fixture with files replaced, and the context possibly patched
 * @param overrides - text per absolute file name
 * @param patch - applied to the context before compiling
 * @returns the result
 */
function compileFixture(overrides: Record<string, string>, patch?: (ctx: any) => void): FlowCompileResult {
  const session = openFixture(overrides);
  try {
    patch?.(session.ctx);
    return compileFlows(session.ctx);
  } finally {
    session.dispose();
  }
}

/**
 * Body of the single flow `ScratchFlows.Run`, failing on any error
 * @param method - the method source
 * @returns the statements
 */
function body(method: string): any[] {
  const { flows, errors } = compile(method);
  expect(errors).toEqual([]);
  return flows["ScratchFlows.Run"].body;
}

/**
 * Errors of a method body
 * @param statements - the body of `run(uuid: string, items: string[])`
 * @param extra - module-level statements
 * @returns the errors and the file text
 */
function errorsOf(statements: string, extra = ""): { errors: FlowCompileError[]; text: string } {
  const { errors, text } = compile(`  async run(uuid: string, items: string[]) {\n${statements}\n  }`, extra);
  return { errors, text };
}

const capture = (id: string, input: any, extra: object = {}) => ({
  kind: "task",
  id,
  operation: "PaymentService.Capture",
  target: { class: "PaymentService", method: "capture" },
  input,
  ...extra
});

describe("compileFlows: statements", () => {
  it("compiles a sequence and return", () => {
    const { flows, errors } = compile(`
  async run(uuid: string) {
    const r = await PaymentService.Capture({ uuid, amount: 1 });
    let total = 0;
    total = total + 1;
    return { ok: r.ok, total };
  }`);
    expect(errors).toEqual([]);
    const flow = flows["ScratchFlows.Run"];
    expect(flow.body).toEqual([
      capture(
        "run/task[0]/PaymentService.Capture",
        { obj: { uuid: { var: "uuid" }, amount: { lit: 1 } } },
        { assign: "r" }
      ),
      { kind: "assign", id: "run/assign[1]", name: "total", value: { lit: 0 } },
      { kind: "assign", id: "run/assign[2]", name: "total", value: { op: "+", args: [{ var: "total" }, { lit: 1 }] } },
      {
        kind: "return",
        id: "run/return[3]",
        value: { obj: { ok: { get: [{ var: "r" }, { lit: "ok" }] }, total: { var: "total" } } }
      }
    ]);
    expect(flow).toMatchObject({ id: "ScratchFlows.Run", params: ["uuid"], source: "code" });
    expect(flow.version).toBe(flowVersion(flow));
  });

  it("compiles if/else", () => {
    expect(
      body(`
  async run(uuid: string) {
    if (uuid === "a") {
      await Sleep("1s");
    } else if (!uuid) return 1;
    else {
      return -2;
    }
  }`)
    ).toEqual([
      {
        kind: "if",
        id: "run/if[0]",
        cond: { op: "===", args: [{ var: "uuid" }, { lit: "a" }] },
        then: [
          {
            kind: "task",
            id: "run/if[0]/then/task[0]/Workflow.Sleep",
            operation: "Workflow.Sleep",
            input: { obj: { duration: { lit: "1s" } } }
          }
        ],
        else: [
          {
            kind: "if",
            id: "run/if[0]/else/if[0]",
            cond: { not: { var: "uuid" } },
            then: [{ kind: "return", id: "run/if[0]/else/if[0]/then/return[0]", value: { lit: 1 } }],
            else: [{ kind: "return", id: "run/if[0]/else/if[0]/else/return[0]", value: { neg: { lit: 2 } } }]
          }
        ]
      }
    ]);
  });

  it("compiles for...of and while", () => {
    expect(
      body(`
  async run(items: string[]) {
    let i = 0;
    for (const item of items) {
      await NotifyService.Send({ to: item });
    }
    while (i < 3) {
      i = i + 1;
    }
  }`)
    ).toEqual([
      { kind: "assign", id: "run/assign[0]", name: "i", value: { lit: 0 } },
      {
        kind: "forOf",
        id: "run/for[1]",
        item: "item",
        items: { var: "items" },
        body: [
          {
            kind: "task",
            id: "run/for[1]/task[0]/NotifyService.Send",
            operation: "NotifyService.Send",
            target: { class: "NotifyService", method: "send" },
            input: { obj: { to: { var: "item" } } }
          }
        ]
      },
      {
        kind: "while",
        id: "run/while[2]",
        cond: { op: "<", args: [{ var: "i" }, { lit: 3 }] },
        body: [
          {
            kind: "assign",
            id: "run/while[2]/assign[0]",
            name: "i",
            value: { op: "+", args: [{ var: "i" }, { lit: 1 }] }
          }
        ]
      }
    ]);
  });

  it("compiles try/catch/finally with the catch variable", () => {
    expect(
      body(`
  async run(uuid: string) {
    try {
      await PaymentService.Capture({ uuid, amount: 1 }, { retries: 3, backoff: "fixed", timeout: "30s" });
    } catch (e) {
      await Wait.ForEvent("manual-review", { key: uuid, timeout: "7d" });
      throw e;
    } finally {
      await NotifyService.Send({ to: \`\${uuid} done\` });
    }
  }`)
    ).toEqual([
      {
        kind: "try",
        id: "run/try[0]",
        body: [
          capture(
            "run/try[0]/body/task[0]/PaymentService.Capture",
            { obj: { uuid: { var: "uuid" }, amount: { lit: 1 } } },
            { options: { retries: 3, backoff: "fixed", timeout: "30s" } }
          )
        ],
        catchVar: "e",
        catch: [
          {
            kind: "task",
            id: "run/try[0]/catch/task[0]/Wait.ForEvent",
            operation: "Wait.ForEvent",
            input: { obj: { name: { lit: "manual-review" }, key: { var: "uuid" }, timeout: { lit: "7d" } } }
          },
          { kind: "throw", id: "run/try[0]/catch/throw[1]", value: { var: "e" } }
        ],
        finally: [
          {
            kind: "task",
            id: "run/try[0]/finally/task[0]/NotifyService.Send",
            operation: "NotifyService.Send",
            target: { class: "NotifyService", method: "send" },
            input: { obj: { to: { tpl: [{ var: "uuid" }, " done"] } } }
          }
        ]
      }
    ]);
  });

  it("compiles Promise.all into parallel", () => {
    expect(
      body(`
  async run(uuid: string) {
    const rs = await Promise.all([PaymentService.Capture({ uuid, amount: 1 }), Date.Now()]);
    return rs;
  }`)
    ).toEqual([
      {
        kind: "parallel",
        id: "run/parallel[0]",
        assign: "rs",
        branches: [
          [
            capture(
              "run/parallel[0]/branch[0]/task[0]/PaymentService.Capture",
              { obj: { uuid: { var: "uuid" }, amount: { lit: 1 } } },
              { assign: "$result" }
            ),
            { kind: "return", id: "run/parallel[0]/branch[0]/return[1]", value: { var: "$result" } }
          ],
          [
            {
              kind: "task",
              id: "run/parallel[0]/branch[1]/task[0]/Date.Now",
              operation: "Date.Now",
              input: { obj: {} },
              assign: "$result"
            },
            { kind: "return", id: "run/parallel[0]/branch[1]/return[1]", value: { var: "$result" } }
          ]
        ]
      },
      { kind: "return", id: "run/return[1]", value: { var: "rs" } }
    ]);
  });

  it("compiles Workflow.Parallel with concurrency into map", () => {
    expect(
      body(`
  async run(items: string[]) {
    await Workflow.Parallel(items, item => NotifyService.Send({ to: item }), { concurrency: 5 });
    const oks = await Workflow.Parallel(items, async item => {
      const r = await PaymentService.Capture({ uuid: item, amount: 1 });
      return r.ok;
    });
    return oks;
  }`)
    ).toEqual([
      {
        kind: "map",
        id: "run/map[0]",
        items: { var: "items" },
        item: "item",
        concurrency: 5,
        body: [
          {
            kind: "task",
            id: "run/map[0]/task[0]/NotifyService.Send",
            operation: "NotifyService.Send",
            target: { class: "NotifyService", method: "send" },
            input: { obj: { to: { var: "item" } } },
            assign: "$result"
          },
          { kind: "return", id: "run/map[0]/return[1]", value: { var: "$result" } }
        ]
      },
      {
        kind: "map",
        id: "run/map[1]",
        items: { var: "items" },
        item: "item",
        assign: "oks",
        body: [
          capture(
            "run/map[1]/task[0]/PaymentService.Capture",
            { obj: { uuid: { var: "item" }, amount: { lit: 1 } } },
            { assign: "r" }
          ),
          { kind: "return", id: "run/map[1]/return[1]", value: { get: [{ var: "r" }, { lit: "ok" }] } }
        ]
      },
      { kind: "return", id: "run/return[2]", value: { var: "oks" } }
    ]);
  });

  it("compiles child flow calls and Workflow.Start", () => {
    expect(
      body(`
  async run(since: number) {
    const n = await OrderFlows.Archive({ since });
    await Workflow.Start(OrderFlows.Archive, { since: n });
    await ScratchFlows.Other();
  }
  async other() {
    return 1;
  }`)
    ).toEqual([
      {
        kind: "task",
        id: "run/task[0]/OrderFlows.Archive",
        operation: "OrderFlows.Archive",
        input: { obj: { since: { var: "since" } } },
        assign: "n"
      },
      {
        kind: "task",
        id: "run/task[1]/Workflow.Start",
        operation: "Workflow.Start",
        input: { obj: { flow: { lit: "OrderFlows.Archive" }, input: { obj: { since: { var: "n" } } } } }
      },
      { kind: "task", id: "run/task[2]/ScratchFlows.Other", operation: "ScratchFlows.Other", input: { obj: {} } }
    ]);
  });

  it("compiles Workflow.Call", () => {
    expect(
      body(`
  async run() {
    const orders = await Workflow.Call("Order.Query", { q: "status = 'PENDING'" }, { useSystem: true });
    return orders;
  }`)[0]
    ).toEqual({
      kind: "task",
      id: "run/task[0]/Order.Query",
      operation: "Order.Query",
      input: { obj: { q: { lit: "status = 'PENDING'" } } },
      options: { useSystem: true },
      assign: "orders"
    });
  });

  it("compiles the built-ins", () => {
    expect(
      body(`
  async run() {
    const now = await Date.Now();
    const x = await Random.Number();
    const id = await Random.Uuid();
    await Sleep({ until: now + 1000 });
    const payload = await Wait.ForEvent("approval", { key: id, allow: ["u1"] });
    return [x, payload];
  }`).map(({ kind, id, operation, input, assign }) => ({ kind, id, operation, input, assign }))
    ).toEqual([
      { kind: "task", id: "run/task[0]/Date.Now", operation: "Date.Now", input: { obj: {} }, assign: "now" },
      { kind: "task", id: "run/task[1]/Random.Number", operation: "Random.Number", input: { obj: {} }, assign: "x" },
      { kind: "task", id: "run/task[2]/Random.Uuid", operation: "Random.Uuid", input: { obj: {} }, assign: "id" },
      {
        kind: "task",
        id: "run/task[3]/Workflow.Sleep",
        operation: "Workflow.Sleep",
        input: { obj: { until: { op: "+", args: [{ var: "now" }, { lit: 1000 }] } } },
        assign: undefined
      },
      {
        kind: "task",
        id: "run/task[4]/Wait.ForEvent",
        operation: "Wait.ForEvent",
        input: { obj: { name: { lit: "approval" }, key: { var: "id" }, allow: { arr: [{ lit: "u1" }] } } },
        assign: "payload"
      },
      { kind: "return", id: "run/return[5]", operation: undefined, input: undefined, assign: undefined }
    ]);
  });
});

describe("compileFlows: flows", () => {
  it("reads @Cron and the input schema of the fixture flows", () => {
    const session = openFixture();
    try {
      const { flows, errors } = compileFlows(session.ctx);
      expect(errors).toEqual([]);
      const reconcile = flows["OrderFlows.Reconcile"];
      expect(reconcile.crons).toEqual([
        { cron: "0 3 * * *", description: "Nightly reconciliation", input: { full: false } },
        { cron: "0 4 * * 0", description: "Weekly full reconciliation", input: { full: true } }
      ]);
      expect(reconcile.params).toEqual(["full"]);
      expect(reconcile.input).toEqual({
        type: "object",
        properties: { full: { type: "boolean" } },
        required: ["full"]
      });
      expect(reconcile.body.map(s => s.id)).toEqual([
        "reconcile/task[0]/Order.Query",
        "reconcile/task[1]/Date.Now",
        "reconcile/for[2]",
        "reconcile/map[3]",
        "reconcile/task[4]/OrderFlows.Archive",
        "reconcile/task[5]/Workflow.Sleep",
        "reconcile/task[6]/Random.Uuid",
        "reconcile/return[7]"
      ]);
      expect((reconcile.body[2] as any).body[0].body.map((s: any) => s.id)).toEqual([
        "reconcile/for[2]/try[0]/body/task[0]/PaymentService.Capture",
        "reconcile/for[2]/try[0]/body/if[1]"
      ]);
      expect(flows["OrderFlows.Archive"].crons).toBeUndefined();
    } finally {
      session.dispose();
    }
  });

  it("keeps structural ids stable, and @label pins them", () => {
    const ids = (statements: string) =>
      body(`  async run(items: string[]) {\n${statements}\n  }`).map(s => [
        s.id,
        ...(s.body ?? []).map((c: any) => c.id)
      ]);
    const before = ids(`
    await Sleep("1s");
    for (const item of items) {
      await NotifyService.Send({ to: item });
    }`);
    expect(before).toEqual([["run/task[0]/Workflow.Sleep"], ["run/for[1]", "run/for[1]/task[0]/NotifyService.Send"]]);
    // A statement added after: nothing moves
    expect(
      ids(`
    await Sleep("1s");
    for (const item of items) {
      await NotifyService.Send({ to: item });
      await Sleep("1s");
    }
    await Sleep("2s");`).slice(0, 2)
    ).toEqual([
      ["run/task[0]/Workflow.Sleep"],
      ["run/for[1]", "run/for[1]/task[0]/NotifyService.Send", "run/for[1]/task[1]/Workflow.Sleep"]
    ]);
    // A statement inserted before: only the later siblings move
    expect(
      ids(`
    const now = await Date.Now();
    await Sleep("1s");
    for (const item of items) {
      await NotifyService.Send({ to: item });
    }`)
    ).toEqual([
      ["run/task[0]/Date.Now"],
      ["run/task[1]/Workflow.Sleep"],
      ["run/for[2]", "run/for[2]/task[0]/NotifyService.Send"]
    ]);
    // @label pins the id, and its children follow it
    expect(
      ids(`
    const now = await Date.Now();
    // @label nap
    await Sleep("1s");
    // @label notify
    for (const item of items) {
      await NotifyService.Send({ to: item });
    }`)
    ).toEqual([["run/task[0]/Date.Now"], ["run/nap"], ["run/notify", "run/notify/task[0]/NotifyService.Send"]]);
  });

  it("refuses a duplicate @label", () => {
    const { errors } = errorsOf(`
    // @label nap
    await Sleep("1s");
    // @label nap
    await Sleep("2s");`);
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("@label nap")]);
  });
});

describe("compileFlows: forbidden constructs (9101)", () => {
  it("reports Date.now() at its position, with the replacement", () => {
    const { errors, text } = errorsOf(`    const t = Date.now();`);
    expect(errors).toEqual([
      {
        file: scratch,
        start: text.indexOf("Date.now()"),
        length: "Date.now()".length,
        code: FLOW_ERROR,
        message: expect.stringContaining("use Date.Now()")
      }
    ]);
  });

  it("reports a construct nested in for, try and if at its exact position", () => {
    const { errors, text } = errorsOf(`
    for (const item of items) {
      try {
        if (item) {
          const r = Math.random();
        }
      } catch (e) {
        throw e;
      }
    }`);
    expect(errors).toEqual([
      {
        file: scratch,
        start: text.indexOf("Math.random()"),
        length: "Math.random()".length,
        code: FLOW_ERROR,
        message: expect.stringContaining("use Random.Number()")
      }
    ]);
  });

  it.each([
    ["new", `    const d = new Date();`, "new Date()"],
    ["an arrow function", `    const f = () => 1;`, "arrow function"],
    ["a helper call", `    await helper(uuid);`, "helper"],
    ["an unknown operation", `    await PaymentService.Missing({});`, "PaymentService.Missing"],
    ["an unawaited call", `    Sleep("1s");`, "await"],
    ["for (;;)", `    for (let i = 0; i < 3; i = i + 1) {}`, "for (;;)"],
    ["switch", `    switch (uuid) {\n      case "a":\n        break;\n    }`, "switch"],
    ["++", `    let i = 0;\n    i++;`, "++"],
    ["a labelled statement", `    outer: while (true) {}`, "labelled"],
    ["await inside an expression", `    const y = (await Date.Now()) + 1;`, "await inside an expression"],
    ["return await", `    return await Date.Now();`, "await inside an expression"],
    ["var", `    var v = 1;`, "var"],
    ["a spread", `    const o = { ...items };`, "spread"],
    ["two names in one declaration", `    let a = 1, b = 2;`, "one name"],
    ["a member assignment", `    const o = { a: 1 };\n    o.a = 2;`, "assignment"],
    ["a compound assignment", `    let n = 1;\n    n += 1;`, "+="],
    ["an undeclared name", `    unknownName = 1;`, "unknownName"],
    ["break", `    while (true) {\n      break;\n    }`, "break"],
    ["undefined", `    return undefined;`, "undefined"],
    ["this", `    return this;`, "this"],
    ["a non-literal option", `    await NotifyService.Send({ to: uuid }, { retries: items.length });`, "literal"],
    ["a destructuring declaration", `    const { length } = items;`, "Destructuring"],
    ["a $ variable", `    const $x = 1;`, "cannot start with $"],
    [
      "an assignment to the catch variable",
      `    try {\n      await Sleep("1s");\n    } catch (e) {\n      e = uuid;\n    }`,
      "caught error"
    ],
    ["a bare expression statement", `    uuid === "a";`, "Expression statement"],
    ["an unawaited forbidden call statement", `    Date.now();`, "use Date.Now()"],
    ["a call on a nested member", `    items.length.toFixed();`, "not allowed"],
    ["for await", `    for await (const item of items) {}`, "for await"],
    ["for...of without a declaration", `    let item;\n    for (item of items) {}`, "one const name"],
    ["for...of with destructuring", `    for (const [a] of items) {}`, "one const name"],
    ["a destructuring catch", `    try {\n      await Sleep("1s");\n    } catch ({ message }) {}`, "catch (e)"],
    ["a type alias statement", `    type T = string;`, "TypeAliasDeclaration"],
    ["an await of a non-call", `    await uuid;`, "only a call"],
    ["a built-in with an argument", `    await Date.Now(1);`, "takes no argument"],
    ["Sleep without argument", `    await Sleep();`, "Sleep takes one argument"],
    ["Wait.ForEvent without options", `    await Wait.ForEvent("x");`, "Wait.ForEvent takes"],
    ["Workflow.Call with a dynamic id", `    await Workflow.Call(uuid);`, "string literal"],
    ["Workflow.Call with too many arguments", `    await Workflow.Call("A.B", {}, {}, 1);`, "Workflow.Call takes"],
    ["Workflow.Start without a flow", `    await Workflow.Start();`, "Workflow.Start takes"],
    ["Workflow.Start of a non-flow", `    await Workflow.Start(uuid, {});`, "Workflow.Start takes"],
    [
      "Workflow.Start with too many arguments",
      `    await Workflow.Start(OrderFlows.Archive, {}, 1);`,
      "Workflow.Start takes"
    ],
    ["a child flow with too many arguments", `    await OrderFlows.Archive({}, {}, 1);`, "takes an input and options"],
    ["an operation with too many arguments", `    await NotifyService.Send({}, {}, 1);`, "takes an input and options"],
    ["a missing flow method", `    await OrderFlows.Missing({});`, "OrderFlows.Missing"],
    ["an unknown service", `    await Unknown.Thing({});`, "Unknown.Thing"],
    ["Workflow.Foo", `    const a = Workflow.Foo();`, "not allowed"],
    ["Promise.race", `    const a = Promise.race([]);`, "not allowed"],
    ["Date.parse", `    const a = Date.parse(uuid);`, "not allowed"],
    ["Random.Other", `    const a = Random.Other();`, "not allowed"],
    ["Wait.Other", `    const a = Wait.Other();`, "not allowed"],
    ["options that are not a literal", `    await NotifyService.Send({ to: uuid }, uuid);`, "object literal"],
    ["an unknown task option", `    await NotifyService.Send({ to: uuid }, { foo: 1 });`, "Unknown task option"],
    ["a spread task option", `    await NotifyService.Send({ to: uuid }, { ...items });`, "Unknown task option"],
    ["Promise.all without an array", `    await Promise.all(items);`, "array literal"],
    ["Workflow.Parallel without a function", `    await Workflow.Parallel(items);`, "arrow function"],
    ["Workflow.Parallel with a helper", `    await Workflow.Parallel(items, helper);`, "arrow function"],
    [
      "Workflow.Parallel with four arguments",
      `    await Workflow.Parallel(items, i => Date.Now(), {}, 1);`,
      "arrow function"
    ],
    [
      "a Workflow.Parallel function without parameter",
      `    await Workflow.Parallel(items, () => Date.Now());`,
      "one parameter"
    ],
    [
      "a Workflow.Parallel function with a default",
      `    await Workflow.Parallel(items, (i = "a") => Date.Now());`,
      "one parameter"
    ],
    [
      "a Workflow.Parallel function destructuring the item",
      `    await Workflow.Parallel(items, ({ length }) => Date.Now());`,
      "one parameter"
    ],
    [
      "Workflow.Parallel options that are not concurrency",
      `    await Workflow.Parallel(items, i => Date.Now(), { foo: 1 });`,
      "concurrency"
    ],
    [
      "a non-numeric concurrency",
      `    await Workflow.Parallel(items, i => Date.Now(), { concurrency: "a" });`,
      "concurrency"
    ],
    ["instanceof", `    return uuid instanceof Object;`, "instanceof"],
    ["a unary plus", `    return +uuid;`, "Operator +"],
    ["a bitwise not", `    return ~uuid;`, "Operator ~"],
    ["a prefix increment", `    let i = 0;\n    return ++i;`, "++"],
    ["a prefix decrement", `    let i = 0;\n    return --i;`, "--"],
    ["a postfix decrement", `    let i = 0;\n    i--;`, "--"],
    ["an object method", `    return { f() {} };`, "name: value"],
    ["a computed key", `    return { [uuid]: 1 };`, "name: value"],
    ["an array spread", `    return [...items];`, "Array spread"],
    ["an array hole", `    return [1, , 2];`, "holes"],
    ["an unawaited built-in in a value", `    const t = Date.Now();`, "must be awaited"],
    ["new of another class", `    const m = new Map();`, "new Map()"],
    ["a function expression", `    const f = function () {};`, "A function"],
    ["typeof", `    return typeof uuid;`, "TypeOfExpression"],
    ["an unawaited child flow", `    OrderFlows.Archive({ since: 1 });`, "must be awaited"],
    ["a bigint key", `    return { 1n: 2 };`, "name: value"]
  ])("reports %s", (_name, statements, fragment) => {
    const { errors } = errorsOf(statements);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every(e => e.code === FLOW_ERROR)).toBe(true);
    expect(errors.map(e => e.message).join("\n")).toContain(fragment);
  });

  it("reports a closure over a module-level variable", () => {
    const { errors } = errorsOf(`    return LIMIT;`, `const LIMIT = 3;`);
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("module-level variable LIMIT")]);
  });

  it("reports a non-async flow method and leaves the failing flows out", () => {
    const { errors, flows } = compile(`
  run() {
    return 1;
  }
  async ok() {
    return 1;
  }
  async ko() {
    return Date.now();
  }`);
    expect(errors.map(e => e.message)).toEqual([
      expect.stringContaining("async"),
      expect.stringContaining("use Date.Now()")
    ]);
    expect(Object.keys(flows)).toEqual(["ScratchFlows.Ok"]);
  });

  it("reports @Cron arguments that are not literals", () => {
    const { errors } = compile(
      `
  @Cron(EXPRESSION)
  async run() {
    return 1;
  }`,
      `const EXPRESSION = "0 * * * *";`
    );
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("@Cron")]);
  });
});

describe("compileFlows: module and editor", () => {
  it("moduleHasFlows: generateWebdaModule fills module.flows", () => {
    const session = openFixture();
    try {
      const { module, errors } = generateWebdaModule(session.ctx, { appPath: FLOWS_FIXTURE });
      expect(errors).toEqual([]);
      expect(module.flows?.["OrderFlows.Reconcile"]).toMatchObject({ id: "OrderFlows.Reconcile", params: ["full"] });
      expect(Object.keys(module.flows ?? {}).sort()).toEqual([
        "AuditFlows.Notify",
        "OrderFlows.Archive",
        "OrderFlows.Reconcile",
        "ScratchFlows.Noop"
      ]);
    } finally {
      session.dispose();
    }
  });

  it("buildFailsOnError: a forbidden construct is a module error", () => {
    const text = scratchText(`  async run() {\n    return Date.now();\n  }`);
    const session = openFixture({ [scratch]: text });
    try {
      const { module, errors } = generateWebdaModule(session.ctx, { appPath: FLOWS_FIXTURE });
      expect(errors).toEqual([expect.stringMatching(/scratch\.flow\.ts:\d+:\d+ .*9101.*use Date\.Now\(\)/)]);
      expect(module.flows?.["ScratchFlows.Run"]).toBeUndefined();
    } finally {
      session.dispose();
    }
  });

  it("reports the errors as editor diagnostics", () => {
    const text = scratchText(`  async run() {\n    return Date.now();\n  }`);
    const session = openFixture({ [scratch]: text });
    try {
      const produced = flowsGenerator().analyze(session.ctx);
      const file = produced.find(f => f.fileName === scratch)!;
      expect(file.diagnostics).toEqual([
        {
          start: text.indexOf("Date.now()"),
          length: "Date.now()".length,
          code: FLOW_ERROR,
          messageText: expect.stringContaining("use Date.Now()")
        }
      ]);
    } finally {
      session.dispose();
    }
  });
});

describe("compileFlows: semantics match TypeScript", () => {
  /** `undefined`: a member read on an empty object, as the graph has no undefined literal */
  const UNDEFINED = { get: [{ obj: {} }, { lit: "undefined" }] };

  it.each([
    [
      "a const shadowing a parameter",
      `    if (uuid) {\n      const uuid = await Random.Uuid();\n    }\n    return uuid;`,
      "uuid"
    ],
    ["a catch binding shadowing a parameter", `    try {\n      await Sleep("1s");\n    } catch (uuid) {}`, "uuid"],
    ["a for...of binding shadowing a variable", `    const o = 1;\n    for (const items of [o]) {}`, "items"],
    [
      "a Workflow.Parallel parameter shadowing a variable",
      `    await Workflow.Parallel(items, uuid => NotifyService.Send({ to: uuid }));`,
      "uuid"
    ],
    [
      "a nested declaration shadowing an outer one",
      `    const n = 1;\n    for (const item of items) {\n      if (item) {\n        let n = 2;\n      }\n    }`,
      "n"
    ]
  ])("C1: refuses %s", (_name, statements, name) => {
    const { errors } = errorsOf(statements);
    expect(errors.map(e => e.message)).toEqual([expect.stringMatching(new RegExp(`\\b${name}\\b.*rename`))]);
  });

  it("C1: accepts a name re-declared in a sibling block, as every declaration assigns it", () => {
    const { errors } = errorsOf(
      `    for (const item of items) {}\n    for (const item of items) {}\n    if (uuid) {\n      const x = 1;\n    } else {\n      const x = 2;\n    }`
    );
    expect(errors).toEqual([]);
  });

  it("C2: refuses an assignment to an outer variable inside a Workflow.Parallel body", () => {
    const { errors, text } = errorsOf(
      `    let total = 0;\n    await Workflow.Parallel(items, async item => {\n      total = total + 1;\n      const u = await Random.Uuid();\n      return u;\n    });\n    return total;`
    );
    expect(errors).toEqual([
      expect.objectContaining({ start: text.indexOf("total = total + 1"), message: expect.stringContaining("return") })
    ]);
    // A variable of the branch itself can be assigned
    expect(
      errorsOf(
        `    await Workflow.Parallel(items, async item => {\n      let u = await Random.Uuid();\n      u = item;\n      return u;\n    });`
      ).errors
    ).toEqual([]);
  });

  it("I1: let without an initializer assigns undefined, each time it runs", () => {
    expect(
      body(`
  async run(items: number[]) {
    for (const i of items) {
      let y;
      if (i > 1) {
        y = i;
      }
    }
  }`)[0].body[0]
    ).toEqual({ kind: "assign", id: "run/for[0]/assign[0]", name: "y", value: UNDEFINED });
  });

  it("I2: a default parameter value is applied when the input omits it", () => {
    const { flows, errors } = compile(`
  async run(uuid: string, retries: number = 5) {
    return retries;
  }`);
    expect(errors).toEqual([]);
    const flow = flows["ScratchFlows.Run"];
    expect(flow.body).toEqual([
      {
        kind: "if",
        id: "run/default[1]",
        cond: { op: "===", args: [{ var: "retries" }, UNDEFINED] },
        then: [{ kind: "assign", id: "run/default[1]/then/assign[0]", name: "retries", value: { lit: 5 } }]
      },
      { kind: "return", id: "run/return[0]", value: { var: "retries" } }
    ]);
    expect((flow.input as any).required).toEqual(["uuid"]);
    // A default can only use the flow expressions
    expect(compile(`  async run(at: number = Date.now()) {\n    return at;\n  }`).errors.map(e => e.message)).toEqual([
      expect.stringContaining("use Date.Now()")
    ]);
  });

  it("I3: throw takes { code, message } with string values, or rethrows the catch variable", () => {
    expect(
      body(`
  async run(uuid: string) {
    try {
      throw { code: "Refused", message: \`\${uuid} refused\` };
    } catch (e) {
      throw e;
    }
  }`)[0].body[0]
    ).toEqual({
      kind: "throw",
      id: "run/try[0]/body/throw[0]",
      value: { obj: { code: { lit: "Refused" }, message: { tpl: [{ var: "uuid" }, " refused"] } } }
    });
    for (const statement of [
      `throw 42;`,
      `throw "refused";`,
      `throw { code: "A", message: "b", detail: 1 };`,
      `throw { code: "A" };`,
      `throw { code: uuid, message: "b" };`,
      `throw uuid;`
    ]) {
      const { errors } = errorsOf(`    ${statement}`);
      expect(
        errors.map(e => e.message),
        statement
      ).toEqual([expect.stringContaining("throw")]);
    }
  });

  it("I4: refuses two methods with the same flow id, at both places", () => {
    const { errors, flows, text } = compile(`
  async run() {
    return 1;
  }
  async Run() {
    return 2;
  }`);
    expect(errors.map(e => [e.start, e.message])).toEqual([
      [text.indexOf("run()"), expect.stringContaining("ScratchFlows.Run")],
      [text.indexOf("Run()"), expect.stringContaining("ScratchFlows.Run")]
    ]);
    expect(flows["ScratchFlows.Run"].body).toEqual([{ kind: "return", id: "run/return[0]", value: { lit: 1 } }]);
  });

  it("I4: refuses two flow classes with the same name in different files", () => {
    const text = [
      `import { Workflow } from "./workflow.js";`,
      `export class OrderFlows extends Workflow {`,
      `  async noop() {`,
      `    return 1;`,
      `  }`,
      `}`,
      ``
    ].join("\n");
    const session = openFixture({ [scratch]: text });
    try {
      const { errors } = compileFlows(session.ctx);
      expect(errors.map(e => [e.file.split("/").pop(), e.message])).toEqual([
        ["order.flow.ts", expect.stringContaining("OrderFlows is declared in")],
        ["scratch.flow.ts", expect.stringContaining("OrderFlows is declared in")]
      ]);
    } finally {
      session.dispose();
    }
  });

  it("I4: refuses a call to a service operation whose name two methods share", () => {
    const { errors } = errorsOf(`    await PaymentService.Settle({});`);
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("settle, Settle")]);
  });

  it.each([
    ["a structural id", "if[1]"],
    ["a path", "a/b"],
    ["a task key separator", "a@b"],
    ["nothing", ""]
  ])("M1: refuses a @label that is %s", (_name, label) => {
    const { errors } = errorsOf(`    // @label ${label}\n    await Sleep("1s");\n    if (uuid) {}`);
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("@label")]);
  });

  it("M1: refuses a @label used twice in nested blocks", () => {
    const { errors } = errorsOf(
      `    if (uuid) {\n      // @label a\n      await Sleep("1s");\n    }\n    // @label a\n    await Sleep("2s");`
    );
    expect(errors.map(e => e.message)).toEqual([expect.stringContaining("@label a")]);
  });
});

describe("compileFlows: the rest of the accepted subset", () => {
  it("compiles empty statements, bare returns, single-statement bodies, try/finally and catch without binding", () => {
    expect(
      body(`
  async run(items: string[]) {
    ;
    for (const item of items) await Sleep("1s");
    try {
      await Sleep("1s");
    } finally {
      await Sleep("2s");
    }
    try {
      await Sleep("3s");
    } catch {
      return;
    }
    return false;
  }`)
    ).toEqual([
      {
        kind: "forOf",
        id: "run/for[1]",
        item: "item",
        items: { var: "items" },
        body: [
          {
            kind: "task",
            id: "run/for[1]/task[0]/Workflow.Sleep",
            operation: "Workflow.Sleep",
            input: { obj: { duration: { lit: "1s" } } }
          }
        ]
      },
      {
        kind: "try",
        id: "run/try[2]",
        body: [
          {
            kind: "task",
            id: "run/try[2]/body/task[0]/Workflow.Sleep",
            operation: "Workflow.Sleep",
            input: { obj: { duration: { lit: "1s" } } }
          }
        ],
        finally: [
          {
            kind: "task",
            id: "run/try[2]/finally/task[0]/Workflow.Sleep",
            operation: "Workflow.Sleep",
            input: { obj: { duration: { lit: "2s" } } }
          }
        ]
      },
      {
        kind: "try",
        id: "run/try[3]",
        body: [
          {
            kind: "task",
            id: "run/try[3]/body/task[0]/Workflow.Sleep",
            operation: "Workflow.Sleep",
            input: { obj: { duration: { lit: "3s" } } }
          }
        ],
        catch: [{ kind: "return", id: "run/try[3]/catch/return[0]" }]
      },
      { kind: "return", id: "run/return[4]", value: { lit: false } }
    ]);
  });

  it("compiles conditionals, literal keys of every kind, templates without text and null", () => {
    expect(
      body(`
  async run(uuid: string, n: number) {
    const x = uuid ? 1 : 2;
    const o = { "a-b": x, 2: n, ["c"]: \`\${uuid}\` };
    return [x, o, null];
  }`)
    ).toEqual([
      { kind: "assign", id: "run/assign[0]", name: "x", value: { cond: [{ var: "uuid" }, { lit: 1 }, { lit: 2 }] } },
      {
        kind: "assign",
        id: "run/assign[1]",
        name: "o",
        value: { obj: { "a-b": { var: "x" }, "2": { var: "n" }, c: { tpl: [{ var: "uuid" }] } } }
      },
      { kind: "return", id: "run/return[2]", value: { arr: [{ var: "x" }, { var: "o" }, { lit: null }] } }
    ]);
  });

  it("accepts calls without input or options, and nested parallels", () => {
    const sleepless = (id: string, extra: object = {}) => ({
      kind: "task",
      id,
      operation: "Date.Now",
      input: { obj: {} },
      ...extra
    });
    expect(
      body(`
  async run(items: string[]) {
    await Workflow.Call("Order.Query");
    await Workflow.Start(OrderFlows.Archive);
    await NotifyService.Send();
    await NotifyService.Send({ to: "a" }, {});
    await Workflow.Parallel(items, item => Date.Now(), {});
    const rs = await Promise.all([await Date.Now(), Promise.all([Date.Now()])]);
    return rs;
  }`)
    ).toEqual([
      { kind: "task", id: "run/task[0]/Order.Query", operation: "Order.Query", input: { obj: {} } },
      {
        kind: "task",
        id: "run/task[1]/Workflow.Start",
        operation: "Workflow.Start",
        input: { obj: { flow: { lit: "OrderFlows.Archive" }, input: { obj: {} } } }
      },
      {
        kind: "task",
        id: "run/task[2]/NotifyService.Send",
        operation: "NotifyService.Send",
        target: { class: "NotifyService", method: "send" },
        input: { obj: {} }
      },
      {
        kind: "task",
        id: "run/task[3]/NotifyService.Send",
        operation: "NotifyService.Send",
        target: { class: "NotifyService", method: "send" },
        input: { obj: { to: { lit: "a" } } }
      },
      {
        kind: "map",
        id: "run/map[4]",
        items: { var: "items" },
        item: "item",
        body: [
          sleepless("run/map[4]/task[0]/Date.Now", { assign: "$result" }),
          { kind: "return", id: "run/map[4]/return[1]", value: { var: "$result" } }
        ]
      },
      {
        kind: "parallel",
        id: "run/parallel[5]",
        assign: "rs",
        branches: [
          [
            sleepless("run/parallel[5]/branch[0]/task[0]/Date.Now", { assign: "$result" }),
            { kind: "return", id: "run/parallel[5]/branch[0]/return[1]", value: { var: "$result" } }
          ],
          [
            {
              kind: "parallel",
              id: "run/parallel[5]/branch[1]/parallel[0]",
              assign: "$result",
              branches: [
                [
                  sleepless("run/parallel[5]/branch[1]/parallel[0]/branch[0]/task[0]/Date.Now", { assign: "$result" }),
                  {
                    kind: "return",
                    id: "run/parallel[5]/branch[1]/parallel[0]/branch[0]/return[1]",
                    value: { var: "$result" }
                  }
                ]
              ]
            },
            { kind: "return", id: "run/parallel[5]/branch[1]/return[1]", value: { var: "$result" } }
          ]
        ]
      },
      { kind: "return", id: "run/return[6]", value: { var: "rs" } }
    ]);
  });

  it("reports destructured and rest parameters, and a method without body", () => {
    expect(
      compile(`  async run({ a }: { a: number }, ...rest: number[]) {\n    return 1;\n  }`).errors.map(e => e.message)
    ).toEqual([expect.stringContaining("plain names"), expect.stringContaining("plain names")]);
    expect(compile(`  async run(): Promise<number>;`).errors.map(e => e.message)).toEqual([
      expect.stringContaining("no body")
    ]);
  });

  it("I3: refuses a throw with a shorthand or spread property", () => {
    for (const statement of [`throw { code, message: "b" };`, `throw { code: "A", message: "b", ...items };`]) {
      expect(
        errorsOf(`    ${statement}`).errors.map(e => e.message),
        statement
      ).toEqual([expect.stringContaining("throw")]);
    }
  });

  it("reads @Cron without description and with literal inputs, ignores other decorators, refuses the rest", () => {
    const extra = `const Other = (): any => (value: any) => value;`;
    const ok = compile(
      `
  @Other()
  @Cron("0 * * * *")
  @Cron("1 * * * *", "d", { a: null, b: -1, c: [1, "x"], d: { e: true, "f-g": false, 1: 2, ["h"]: 3 } })
  async run() {
    return 1;
  }`,
      extra
    );
    expect(ok.errors).toEqual([]);
    expect(ok.flows["ScratchFlows.Run"].crons).toEqual([
      { cron: "0 * * * *" },
      {
        cron: "1 * * * *",
        description: "d",
        input: { a: null, b: -1, c: [1, "x"], d: { e: true, "f-g": false, "1": 2, h: 3 } }
      }
    ]);
    for (const decorator of [
      `@Cron`,
      `@Cron("*", 1)`,
      `@Cron("*", "d", 1)`,
      `@Cron("*", "d", [1])`,
      `@Cron("*", "d", null)`,
      `@Cron("*", "d", { a: +1 })`,
      `@Cron("*", "d", { a: -x })`,
      `@Cron("*", "d", { ...x })`,
      `@Cron("*", "d", { a })`,
      `@Cron("*", "d", { [x]: 1 })`
    ]) {
      const { errors, flows } = compile(`  ${decorator}\n  async run() {\n    return 1;\n  }`);
      expect(
        errors.map(e => e.message),
        decorator
      ).toEqual([expect.stringContaining("literal")]);
      expect(flows["ScratchFlows.Run"], decorator).toBeUndefined();
    }
  });

  it("does not swallow an internal error", () => {
    const boom = (ctx: any) => {
      ctx.textOf = () => {
        throw new Error("boom");
      };
    };
    for (const methods of [
      `  async run(at: number = Date.now()) {\n    return at;\n  }`,
      `  async run() {\n    return Date.now();\n  }`,
      `  @Cron("*", "d", { a: x })\n  async run() {\n    return 1;\n  }`
    ]) {
      expect(() => compileFixture({ [scratch]: scratchText(methods) }, boom), methods).toThrow("boom");
    }
  });

  it("I4: reports a class declared three times once per place", () => {
    const text = [
      `import { Workflow } from "./workflow.js";`,
      `export class OrderFlows extends Workflow {`,
      `  async a() {`,
      `    return 1;`,
      `  }`,
      `}`,
      `export class OrderFlows extends Workflow {`,
      `  async b() {`,
      `    return 1;`,
      `  }`,
      `}`,
      ``
    ].join("\n");
    const { errors } = compileFixture({ [scratch]: text });
    expect(errors.map(e => e.file.split("/").pop())).toEqual(["order.flow.ts", "scratch.flow.ts", "scratch.flow.ts"]);
  });

  it("refuses class members that are not public async instance methods", () => {
    const { errors, flows } = compile(
      `
  static helper() {}
  private async hidden() {}
  protected async guarded() {}
  limit = 3;
  get size() {
    return 1;
  }
  async run() {
    return 1;
  }`,
      `class Helper {}`
    );
    expect(errors.map(e => e.message)).toEqual(Array(5).fill(expect.stringContaining("public async instance methods")));
    expect(Object.keys(flows)).toEqual(["ScratchFlows.Run"]);
  });

  it("formatFlowError: an error in a file the program does not have is at 1:1", () => {
    const session = openFixture();
    try {
      expect(
        formatFlowError(session.ctx, { file: "/nowhere.flow.ts", start: 10, length: 1, code: FLOW_ERROR, message: "m" })
      ).toBe(`/nowhere.flow.ts:1:1 - error FLOW${FLOW_ERROR}: m`);
    } finally {
      session.dispose();
    }
  });

  it("discovers only exported Service subclasses, once per name, with their plain parameters", () => {
    const payment = fixtureFile("payment.service.ts");
    const runtime = fixtureFile("runtime.ts");
    const overrides = {
      [runtime]:
        readFileSync(runtime, "utf8") + `\nexport class Twice extends Service {\n  @Operation()\n  async a() {}\n}\n`,
      [payment]: [
        `import { Operation, Service } from "./runtime.js";`,
        `const Deco = { Rated: (): any => (value: any) => value };`,
        `export class PaymentService extends Service {`,
        `  @Operation`,
        `  async capture(uuid: string, amount: number) {`,
        `    return { ok: !!uuid && amount > 0 };`,
        `  }`,
        `  @Deco.Rated()`,
        `  async decorated() {}`,
        `  @Operation()`,
        `  async weird({ a }: { a: number }, ...rest: number[]) {`,
        `    return a + rest.length;`,
        `  }`,
        `}`,
        `export class NotifyService extends Service {`,
        `  @Operation()`,
        `  async send(to: string) {`,
        `    void to;`,
        `  }`,
        `}`,
        `class Hidden extends Service {`,
        `  @Operation()`,
        `  async h() {}`,
        `}`,
        `export default class Default extends Service {`,
        `  @Operation()`,
        `  async d() {}`,
        `}`,
        `export class NotAService {`,
        `  @Operation()`,
        `  async n() {}`,
        `}`,
        `export class Twice extends Service {`,
        `  @Operation()`,
        `  async b() {}`,
        `}`,
        ``
      ].join("\n"),
      [scratch]: scratchText(`  async run() {\n    await Twice.A({});\n  }`)
    };
    const session = openFixture(overrides);
    try {
      const services = operationServices(session.ctx);
      expect([...services.keys()].sort()).toEqual(["NotifyService", "PaymentService", "Twice"]);
      expect(services.get("Twice")).toBeUndefined();
      expect([...services.get("PaymentService")!.operations.entries()]).toEqual([
        [
          "Capture",
          {
            method: "capture",
            parameters: [
              { name: "uuid", index: 0, optional: false },
              { name: "amount", index: 1, optional: false }
            ]
          }
        ],
        ["Weird", { method: "weird", parameters: [] }]
      ]);
      // An ambiguous class name has no typed call
      const { errors } = compileFlows(session.ctx);
      expect(errors.map(e => e.message)).toEqual([expect.stringContaining("Twice.A() is not allowed")]);
    } finally {
      session.dispose();
    }
  });
});
