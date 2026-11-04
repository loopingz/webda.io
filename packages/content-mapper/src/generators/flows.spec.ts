import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { FLOWS_FIXTURE, fixtureFile, mapFixture } from "../../test/flows.ts";
import { WarmSession } from "../session.ts";
import { flowsGenerator } from "./flows.ts";

const scratch = fixtureFile("scratch.flow.ts");

/**
 * A flow file whose single method body is `body`
 * @param body - statements of the method
 * @param extra - module-level statements
 * @param header - what precedes the class: `export ` or nothing
 * @param parameters - the method parameters
 * @returns the file text
 */
function flowText(body: string, extra = "", header = "export ", parameters = "uuid: string"): string {
  return [
    `import { Workflow } from "./workflow.js";`,
    `import { OrderFlows } from "./order.flow.js";`,
    extra,
    `${header}class ScratchFlows extends Workflow {`,
    `  async run(${parameters}) {`,
    body,
    `  }`,
    `}`,
    ``
  ].join("\n");
}

/**
 * The declarations the generator appends to the scratch flow
 * @param text - the scratch flow text
 * @returns the appended text, undefined when the file gets no edit
 */
function appended(text: string): string | undefined {
  const { produced } = mapFixture([flowsGenerator()], { [scratch]: text });
  return produced.find(f => f.fileName === scratch)?.edits[0]?.text;
}

/**
 * Semantic errors of the mapped scratch flow
 * @param body - statements of the method
 * @returns the diagnostic messages
 */
function scratchErrors(body: string): string[] {
  const { diagnostics } = mapFixture([flowsGenerator()], { [scratch]: flowText(body) });
  return diagnostics(scratch).map(d => `${d.code}: ${d.text}`);
}

describe("flows generator: typed declarations", () => {
  it("injectsTypedCall: an operation call is typed by the method parameters and return type", () => {
    expect(scratchErrors(`const r = await PaymentService.Capture({ uuid, amount: 1 }); return r.ok;`)).toEqual([]);
    // A wrong input key
    const wrongKey = scratchErrors(`const r = await PaymentService.Capture({ id: "a", amount: 1 }); return r.ok;`);
    expect(wrongKey.length).toBeGreaterThan(0);
    expect(wrongKey.join("\n")).toMatch(/id/);
    // The result is the unwrapped return type
    expect(scratchErrors(`const r = await PaymentService.Capture({ uuid, amount: 1 }); return r.missing;`)).not.toEqual(
      []
    );
    // A context parameter is not part of the input, an optional parameter is optional
    expect(scratchErrors(`const r = await PaymentService.Refund({ uuid }); return r.ok;`)).toEqual([]);
    expect(scratchErrors(`await PaymentService.Refund({ uuid, context: {} });`)).not.toEqual([]);
    // Task options are typed
    expect(scratchErrors(`await NotifyService.Send({ to: uuid }, { retries: 2, backoff: "fixed" });`)).toEqual([]);
    expect(scratchErrors(`await NotifyService.Send({ to: uuid }, { retries: "2" });`)).not.toEqual([]);
    // A method without @Operation is not callable
    expect(scratchErrors(`await PaymentService.Helper({});`)).not.toEqual([]);
  });

  it("injectsTypedCall: flow methods are callable as child flows, and the built-ins are typed", () => {
    expect(
      scratchErrors(
        [
          `const since = await Date.Now();`,
          `const n: number = await OrderFlows.Archive({ since });`,
          `await ScratchFlows.Run({ uuid });`,
          `await Workflow.Start(OrderFlows.Archive, { since: n });`,
          `const all = await Workflow.Parallel([uuid], u => PaymentService.Capture({ uuid: u, amount: 2 }), { concurrency: 2 });`,
          `return all[0].ok;`
        ].join("\n")
      )
    ).toEqual([]);
    expect(scratchErrors(`await ScratchFlows.Run({ id: uuid });`)).not.toEqual([]);
  });

  it("type-checks the fixture flows, the nested one importing the services through ../", () => {
    const { diagnostics, mapped } = mapFixture([flowsGenerator()]);
    expect(diagnostics(fixtureFile("order.flow.ts"))).toEqual([]);
    const nested = fixtureFile("nested/audit.flow.ts");
    expect(diagnostics(nested)).toEqual([]);
    expect(mapped[nested]).toContain(`import("../payment.service.js").NotifyService`);
  });

  it("skips the names the file declares, keeps a flow class unexported, and declares nothing without flows", () => {
    const extra = [
      `import def from "./runtime.js";`,
      `import * as ns from "./runtime.js";`,
      `import "./runtime.js";`,
      `const PaymentService = 1;`,
      `const [first] = [1];`,
      `function helper() {}`,
      `void 0;`
    ].join("\n");
    const text = appended(flowText(`return uuid;`, extra, "", "{ uuid }: { uuid: string }, since?: number"))!;
    expect(text).not.toContain("declare const PaymentService");
    expect(text).toContain("declare const NotifyService");
    expect(text).toContain("\ndeclare namespace ScratchFlows {");
    // A destructured parameter has no input key, an optional one is optional
    expect(text).toContain(`function Run(input?: { since?: Parameters<ScratchFlows["run"]>[1] }`);
    // Nothing to declare: no edit
    expect(appended(`const PaymentService = 1;\nconst NotifyService = 2;\nexport {};\n`)).toBeUndefined();
  });

  it("injectionAtEnd: every edit is a pure insertion at the end of the authored file", () => {
    const { produced } = mapFixture([flowsGenerator()]);
    const files = produced.filter(f => f.edits.length);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const length = readFileSync(file.fileName, "utf8").length;
      for (const edit of file.edits) {
        expect(edit.start).toBeGreaterThanOrEqual(length);
        expect(edit.end).toBe(edit.start);
      }
    }
  });

  it("nonFlowFilesUntouched: only .flow.ts files get flow edits", () => {
    const { produced } = mapFixture([flowsGenerator()]);
    expect(produced.filter(f => f.edits.length).every(f => f.fileName.endsWith(".flow.ts"))).toBe(true);
    expect(produced.some(f => f.fileName.endsWith("payment.service.ts") && f.edits.length)).toBe(false);
  });

  it("keeps the authored text verbatim in an incremental editor session", () => {
    const session = new WarmSession({
      configFile: join(FLOWS_FIXTURE, "tsconfig.json"),
      cwd: FLOWS_FIXTURE,
      generators: [flowsGenerator()]
    });
    try {
      const fileName = fixtureFile("order.flow.ts");
      const authored = readFileSync(fileName, "utf8");
      const edited = authored.replace('await Sleep("1h");', 'await Sleep("2h");');
      for (const content of [authored, edited]) {
        const result = session.transform(fileName, content);
        expect(result.text.startsWith(content)).toBe(true);
        expect(result.text.length).toBeGreaterThan(content.length);
        expect(result.mappings).toEqual([[0, content.length, 0, content.length, 0]]);
      }
    } finally {
      session.dispose();
    }
  });
});
