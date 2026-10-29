// organize-imports-ignore
import { suite, test } from "@webda/test";
import { CronService, listOperations, runWithContext, useCore, useInstanceStorage } from "@webda/core";
import * as assert from "assert";
import { vi } from "vitest";
import { Workflow } from "./models/workflow.model.js";
import { WorkflowInstance } from "./models/workflowinstance.model.js";
import { WorkflowService, WorkflowServiceParameters } from "./workflow.service.js";
import { task, WorkflowTestBase } from "../test/fixture.js";

@suite
class StoredTest extends WorkflowTestBase {
  count = 0;

  /**
   * Reset the opt-in
   */
  async beforeEach() {
    await super.beforeEach();
    this.service.getParameters().allowStoredSystem = false;
  }

  /**
   * Save a stored workflow as a user
   * @param data - the workflow fields
   * @param userId - the user saving it
   * @returns the workflow
   */
  async save(data: any = {}, userId: string = "admin"): Promise<Workflow> {
    const ctx = await this.userContext(userId);
    ctx.getSession().roles = ["workflow-admin"];
    return runWithContext(ctx, () =>
      Workflow.create({
        name: `Stored.Flow${++this.count}`,
        params: ["x"],
        input: { type: "object", properties: { x: { type: "number" } } },
        body: [
          task("s/add", "FlowTest.Add", { obj: { a: { var: "x" }, b: { lit: 1 } } }, "r"),
          { kind: "return", id: "s/ret", value: { var: "r" } }
        ],
        ...data
      } as any)
    ) as Promise<Workflow>;
  }

  /**
   * Update a stored workflow as a user
   * @param uuid - the workflow uuid
   * @param data - the fields to change
   * @param userId - the user saving it
   */
  async edit(uuid: string, data: any, userId: string = "admin") {
    const ctx = await this.userContext(userId);
    await runWithContext(ctx, () => Workflow.ref(uuid).patch(data));
  }

  @test
  async storedFlowRegistersOperation() {
    const wf = await this.save();
    assert.match(wf.version, /^[0-9a-f]{64}$/);
    assert.strictEqual(wf.updatedBy, "admin");
    const op: any = listOperations()[wf.name];
    assert.ok(op);
    assert.strictEqual(op.input, `${wf.name}.input.${wf.version}`);
    const uuid = await this.launch(this.service.getFlow(wf.name), { x: 2 }, "alice");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.output, 3);
    assert.strictEqual(instance.definition.source, "stored");
    assert.deepStrictEqual({ ...instance.launcher }, { userId: "alice", identId: "alice-ident" });
  }

  @test
  async storedInvalidExprRefused() {
    await assert.rejects(
      () => this.save({ body: [{ kind: "return", id: "s/ret", value: { call: "process.exit" } }] }),
      /BadRequest|s\/ret/
    );
    await assert.rejects(() => this.save({ body: [{ kind: "goto", id: "s/goto" }] }), /goto/);
    await assert.rejects(() => this.save({ name: "not a flow" }), /name/);
    await assert.rejects(
      () =>
        this.save({
          body: [
            {
              kind: "if",
              id: "s/if",
              cond: { lit: true },
              then: [{ kind: "assign", id: "s/a", name: "y", value: { f: 1 } }]
            }
          ]
        }),
      /s\/a/
    );
  }

  @test
  async storedUnknownOperationRefused() {
    await assert.rejects(() => this.save({ body: [task("s/x", "Nope.Operation", { lit: {} })] }), /Nope.Operation/);
    // Built-ins are allowed
    await this.save({ body: [task("s/now", "Date.Now", { lit: {} })] });
    // A code flow name cannot be taken
    const code = this.flow([]);
    await assert.rejects(() => this.save({ name: code.id }), /already/);
  }

  @test
  async storedSystemRefused() {
    const body = [task("s/who", "FlowTest.WhoAmI", { lit: {} }, "me", { useSystem: true })];
    await assert.rejects(() => this.save({ body }), /useSystem/);
    await assert.rejects(() => this.save({ body: [], options: { useSystem: true } }), /useSystem/);
    this.service.getParameters().allowStoredSystem = true;
    const wf = await this.save({ body: [...body, { kind: "return", id: "s/ret", value: { var: "me" } }] });
    const uuid = await this.launch(this.service.getFlow(wf.name), {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, "system");
  }

  @test
  async storedCanAct() {
    const wf = await this.save();
    const user = await this.userContext("bob");
    assert.strictEqual(await wf.canAct(user, "get"), true);
    assert.notStrictEqual(await wf.canAct(user, "update"), true);
    assert.notStrictEqual(await wf.canAct(user, "create"), true);
    user.getSession().roles = ["workflow-admin"];
    assert.strictEqual(await wf.canAct(user, "delete"), true);
    const anonymous = new (user.constructor as any)();
    assert.notStrictEqual(await wf.canAct(anonymous, "get"), true);
  }

  @test
  async storedEditKeepsRunningPinned() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const wf = await this.save({
      body: [
        task("s/sleep", "Workflow.Sleep", { lit: { duration: "1h" } }),
        { kind: "return", id: "s/ret", value: { lit: "v1" } }
      ]
    });
    const uuid = await this.launch(this.service.getFlow(wf.name), {}, "alice");
    await this.edit(wf.uuid, { body: [{ kind: "return", id: "s/ret", value: { lit: "v2" } }] });
    const edited = (await Workflow.ref(wf.uuid).get()) as Workflow;
    assert.notStrictEqual(edited.version, wf.version);
    assert.strictEqual(this.service.getFlow(wf.name).version, edited.version);
    assert.strictEqual(listOperations()[wf.name].input, `${wf.name}.input.${edited.version}`);
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, "v1");
    const second = await this.launch(this.service.getFlow(wf.name), {}, "alice");
    assert.strictEqual((await this.instance(second)).output, "v2");
    // An invalid edit is refused
    await assert.rejects(() => this.edit(wf.uuid, { body: [{ kind: "nope", id: "s/x" }] }), /nope/);
  }

  @test
  async storedDeleteUnregisters() {
    const wf = await this.save({ crons: [{ cron: "0 3 * * *", input: { x: 1 } }] });
    assert.ok(listOperations()[wf.name]);
    assert.strictEqual(useInstanceStorage().crons.filter(c => c.operationId === wf.name).length, 1);
    await Workflow.ref(wf.uuid).delete();
    assert.strictEqual(listOperations()[wf.name], undefined);
    assert.strictEqual(this.service.getFlow(wf.name), undefined);
    assert.strictEqual((useInstanceStorage().crons ?? []).filter(c => c.operationId === wf.name).length, 0);
  }

  @test
  async storedCronRunsAsLastSaver() {
    const wf = await this.save({
      crons: [{ cron: "0 3 * * *", description: "nightly", input: { x: 4 } }],
      body: [
        task("s/who", "FlowTest.WhoAmI", { lit: {} }, "me"),
        { kind: "return", id: "s/ret", value: { arr: [{ var: "me" }, { var: "x" }] } }
      ]
    });
    await this.edit(wf.uuid, { crons: [{ cron: "0 4 * * *", description: "nightly", input: { x: 5 } }] }, "carol");
    const crons = useInstanceStorage().crons.filter(c => c.operationId === wf.name);
    assert.deepStrictEqual(
      crons.map(c => c.cron),
      ["0 4 * * *"]
    );
    await CronService.execute(crons[0], true);
    const [instance] = (await WorkflowInstance.query(`flowId = '${wf.name}'`)).results as WorkflowInstance[];
    assert.deepStrictEqual({ ...instance.launcher }, { userId: "carol" });
    await this.drain();
    assert.deepStrictEqual((await this.instance(instance.uuid)).output, ["carol", 5]);
  }

  @test
  async codeFlowCronRunsAsSystem() {
    const def = this.flow([
      task("c/who", "FlowTest.WhoAmI", { lit: {} }, "me"),
      { kind: "return", id: "c/ret", value: { var: "me" } }
    ]);
    const uuid = await this.launch(def, {});
    assert.strictEqual((await this.instance(uuid)).launcher.system, true);
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, "system");
  }

  @test
  async syncInterval() {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"], now: 1_000_000 });
    const other = this.registerService(
      new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false, syncInterval: 60000 }))
    );
    try {
      other["startSync"]();
      const wf = await this.save();
      assert.strictEqual(other.getFlow(wf.name), undefined);
      await vi.advanceTimersByTimeAsync(60000);
      assert.strictEqual(other.getFlow(wf.name)?.version, wf.version);
      // Deleted elsewhere: dropped at the next sync
      await useCore().getServices()["WorkflowService"]["unregisterStored"](wf.uuid);
      await Workflow.ref(wf.uuid).delete();
      await vi.advanceTimersByTimeAsync(60000);
      assert.strictEqual(other.getFlow(wf.name), undefined);
    } finally {
      await other.stop();
      delete useCore().getServices()["Workflow2"];
    }
  }

  @test
  async syncPubSub() {
    const sent: any[] = [];
    let consumer: (event: any) => Promise<void>;
    const pubsub: any = {
      getName: () => "WorkflowSync",
      sendMessage: async (event: any) => {
        sent.push(event);
        await consumer?.(event);
      },
      consume: (callback: any) => {
        consumer = callback;
        return { cancel: async () => {} };
      }
    };
    useCore().getServices()["WorkflowSync"] = pubsub;
    const other = this.registerService(
      new WorkflowService(
        "Workflow2",
        new WorkflowServiceParameters().load({ worker: false, syncPubSub: "WorkflowSync" })
      )
    );
    this.service.getParameters().syncPubSub = "WorkflowSync";
    try {
      other["startSync"]();
      const wf = await this.save();
      assert.deepStrictEqual(sent, [{ workflow: wf.uuid }]);
      assert.strictEqual(other.getFlow(wf.name)?.version, wf.version);
    } finally {
      delete this.service.getParameters().syncPubSub;
      await other.stop();
      delete useCore().getServices()["Workflow2"];
      delete useCore().getServices()["WorkflowSync"];
    }
  }
}
