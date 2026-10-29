import { describe, expect, it } from "vitest";
import { FLOWS_FIXTURE, fixtureFile, openFixture } from "../../test/flows.ts";
import { flowsGenerator } from "../generators/flows.ts";
import { generateWebdaModule } from "../module.ts";
import { compileFlows, type FlowCompileError } from "./compile.ts";
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
    ["a non-literal option", `    await NotifyService.Send({ to: uuid }, { retries: items.length });`, "literal"]
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
