import { suite, test } from "@webda/test";
import * as assert from "assert";
import { CronService, registerOperation, useApplication, useDynamicService } from "@webda/core";
import { join } from "node:path";
import { flowsGenerator, runTwoPass } from "@webda/content-mapper";
import { COMPILED_APP, CompiledAppTestBase } from "../test/compiled.js";
import type { PaymentService } from "../test/app/src/payment.service.js";
import { WorkflowInstance } from "./models/workflowinstance.model.js";

/**
 * Statements of a flow, depth first
 * @param body - the statements
 * @returns every statement
 */
function statements(body: any[]): any[] {
  return body.flatMap((stmt: any) => [
    stmt,
    ...["then", "else", "body", "catch", "finally"].flatMap(key => (stmt[key] ? statements(stmt[key]) : [])),
    ...(stmt.branches ?? []).flatMap((branch: any[]) => statements(branch))
  ]);
}

@suite
class CompiledFlowsTest extends CompiledAppTestBase {
  /**
   * Serve `Order.Query` (a model operation in the issue example) with the Billing service
   */
  async beforeAll() {
    await super.beforeAll();
    registerOperation("Order.Query", { service: "Billing", method: "orders" } as any);
  }

  /**
   * Fresh Billing counters
   */
  async beforeEach() {
    await super.beforeEach();
    const billing = useDynamicService<PaymentService>("Billing");
    billing.captured = [];
    billing.notified = [];
  }

  @test
  appTypeChecks() {
    // Every call of the example is typed: the build would refuse a wrong input
    const result = runTwoPass({
      configFile: join(COMPILED_APP, "tsconfig.json"),
      rootDir: join(COMPILED_APP, "src"),
      generators: [flowsGenerator()]
    });
    const own = result.diagnostics.filter((d: any) => d.fileName?.startsWith(COMPILED_APP.replace(/\\/g, "/")));
    assert.deepStrictEqual(
      own.map((d: any) => `${d.fileName}: ${d.text}`),
      []
    );
  }

  @test
  coreKeepsFlowsSection() {
    const flows = useApplication().getModules().flows!;
    assert.deepStrictEqual(Object.keys(flows).sort(), ["OrderFlows.Archive", "OrderFlows.Reconcile"]);
    assert.ok(this.service.getFlow("OrderFlows.Reconcile"));
    assert.ok(this.service.getFlow("OrderFlows.Archive"));
  }

  @test
  targetResolvesConfiguredName() {
    const flow = this.service.getFlow("OrderFlows.Reconcile")!;
    const operations = statements(flow.body)
      .filter(s => s.kind === "task" && s.target)
      .map(s => [s.operation, s.target]);
    assert.deepStrictEqual(operations, [
      ["Billing.Capture", { class: "PaymentService", method: "capture" }],
      ["Billing.Notify", { class: "PaymentService", method: "notify" }]
    ]);
    // The compiled version is kept: running instances pin it
    assert.strictEqual(flow.version, useApplication().getModules().flows!["OrderFlows.Reconcile"].version);
  }

  @test
  async compiledFlowRuns() {
    const uuid = await this.launch({ id: "OrderFlows.Reconcile" } as any, { full: true }, "alice");
    await this.drain();
    const billing = useDynamicService<PaymentService>("Billing");
    assert.deepStrictEqual(billing.captured, ["a"]);
    // Order b was refused: the catch waits for a manual review
    let instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "WAITING");
    const waiting = (await this.tasks(uuid)).filter(t => t.operation === "Wait.ForEvent");
    assert.deepStrictEqual(
      waiting.map(t => [t.status, (t as any).eventKey]),
      [["WAITING_EVENT", "b"]]
    );
    // The launcher reviews it
    assert.deepStrictEqual(await this.signal("alice", "manual-review", "b", { approved: true }), { delivered: 1 });
    await this.drain();
    instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS", JSON.stringify(instance.error));
    assert.deepStrictEqual(instance.output, { count: 2, archived: true });
    assert.deepStrictEqual(billing.notified.sort(), ["ann", "bob"]);
    // The child flow ran as its own instance
    const children = (await WorkflowInstance.query(`flowId = 'OrderFlows.Archive'`)).results;
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].status, "SUCCESS");
  }

  @test
  codeCronRegistered() {
    const crons = CronService.resolveCrons().filter(c => c.operationId === "OrderFlows.Reconcile");
    assert.deepStrictEqual(
      crons.map(c => [c.cron, c.description, c.input]),
      [
        ["0 3 * * *", "Nightly reconciliation", { full: false }],
        ["0 4 * * 0", "Weekly full reconciliation", { full: true }]
      ]
    );
  }
}
