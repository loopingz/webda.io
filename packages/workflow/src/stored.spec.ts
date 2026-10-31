// organize-imports-ignore
import { suite, test } from "@webda/test";
import {
  CronService,
  listOperations,
  registerOperation,
  runAsSystem,
  runWithContext,
  useCore,
  useInstanceStorage,
  useSystem
} from "@webda/core";
import { useRepository } from "@webda/models";
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
    assert.strictEqual(await wf.canAct(useSystem(), "delete"), true);
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
      // One timer only
      const timer = other["syncTimer"];
      other["startSync"]();
      assert.strictEqual(other["syncTimer"], timer);
      // Deleted elsewhere: dropped at the next sync
      await useCore().getServices()["WorkflowService"]["unregisterStored"](wf.uuid);
      // The other replica still serves its operation: it knows who it runs as
      assert.strictEqual(useInstanceStorage().operations[wf.name].service, "Workflow2");
      assert.strictEqual(this.service.storedRunAs(wf.name), "admin");
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
      // Other messages are ignored
      await pubsub.sendMessage({});
      await pubsub.sendMessage(null);
      assert.strictEqual(other.getFlow(wf.name)?.version, wf.version);
    } finally {
      delete this.service.getParameters().syncPubSub;
      await other.stop();
      delete useCore().getServices()["Workflow2"];
      delete useCore().getServices()["WorkflowSync"];
    }
  }

  @test
  async storedChildRunsAsLastSaver() {
    const stored = await this.save({
      params: [],
      input: { type: "object" },
      body: [task("s/who", "FlowTest.WhoAmI", { lit: {} }, "me"), { kind: "return", id: "s/ret", value: { var: "me" } }]
    });
    // A code flow run by the system starts the stored flow: awaited, and by a computed name
    const parent = this.flow([
      task("p/child", stored.name, { lit: {} }, "awaited"),
      { kind: "assign", id: "p/name", name: "name", value: { tpl: [stored.name] } },
      task("p/start", "Workflow.Start", { obj: { flow: { var: "name" }, input: { lit: {} } } }, "started"),
      { kind: "return", id: "p/ret", value: { obj: { awaited: { var: "awaited" }, started: { var: "started" } } } }
    ]);
    const uuid = await this.launch(parent, {});
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.output.awaited, "admin");
    const started = await this.instance(instance.output.started.uuid);
    assert.deepStrictEqual({ ...started.launcher }, { userId: "admin" });
    assert.strictEqual(started.output, "admin");
  }

  @test
  async storedRevalidatedAtRegistration() {
    const wf = await this.save();
    // Written behind the validation (another replica, a direct store write)
    await (useRepository(Workflow as any) as any).repository.patch(wf.uuid, {
      body: [{ kind: "goto", id: "s/goto" }],
      version: "tampered"
    });
    await this.service["reloadStored"]();
    assert.strictEqual(this.service.getFlow(wf.name), undefined);
    assert.strictEqual(listOperations()[wf.name], undefined);
  }

  @test
  async storedNeverReplacesAnOperation() {
    const wf = await this.save({ crons: [{ cron: "0 3 * * *", input: { x: 1 } }] });
    // A module registers a real operation with the same name later, with its own cron
    registerOperation(wf.name, { service: "FlowTest", method: "add", input: "FlowTest.Add.input" });
    const moduleCron = CronService.register(wf.name, { cron: "0 5 * * *", input: { a: 1, b: 1 } });
    try {
      await this.edit(wf.uuid, { body: [{ kind: "return", id: "s/ret", value: { lit: 1 } }] }).catch(() => {});
      await this.service["reloadStored"]();
      assert.strictEqual(useInstanceStorage().operations[wf.name].service, "FlowTest");
      assert.strictEqual(this.service.getFlow(wf.name), undefined);
      const crons = useInstanceStorage()
        .crons.filter(c => c.operationId === wf.name)
        .map(c => c.cron);
      assert.deepStrictEqual(crons, ["0 5 * * *"]);
    } finally {
      CronService.unregister(CronService.getExportId(moduleCron));
      delete useInstanceStorage().operations[wf.name];
    }
  }

  @test
  async storedPartialUpdatesRefused() {
    const wf = await this.save();
    const repo: any = useRepository(Workflow as any);
    await assert.rejects(() => repo.removeAttribute(wf.uuid, "params"), /partial/i);
    await assert.rejects(
      () => repo.upsertItemToCollection(wf.uuid, "body", { kind: "goto", id: "s/goto" }),
      /partial/i
    );
    const current = (await Workflow.ref(wf.uuid).get()) as Workflow;
    assert.deepStrictEqual(current.params, ["x"]);
    assert.strictEqual(current.body.length, 2);
    assert.strictEqual(this.service.getFlow(wf.name).version, wf.version);
  }

  @test
  async storedShapeValidated() {
    const first = await this.save();
    await assert.rejects(() => this.save({ name: first.name }), /already a stored workflow/);
    await assert.rejects(() => this.save({ params: "x" }), /params must be an array/);
    await assert.rejects(() => this.save({ params: [1] }), /params must be an array/);
    await assert.rejects(() => this.save({ input: null }), /input must be a JSON schema/);
    await assert.rejects(() => this.save({ body: {} }), /body must be an array/);
    await assert.rejects(() => this.save({ crons: [null] }), /a cron needs/);
    await assert.rejects(() => this.save({ crons: [{ cron: "* * * * *", input: 3 }] }), /a cron needs/);
    await assert.rejects(
      () => this.save({ body: [{ kind: "if", id: "s/if", cond: { lit: true }, then: "nope" }] }),
      /s\/if\.then must be an array/
    );
    await assert.rejects(() => this.save({ body: [{ kind: "return" }] }), /body\[0\] has no id/);
    await assert.rejects(() => this.save({ body: [null] }), /body\[0\] has no id/);
    await assert.rejects(
      () => this.save({ body: [{ kind: "task", id: "s/t", input: { lit: {} }, target: null }] }),
      /no configured service of class undefined/
    );
    // A return without value is fine
    await this.save({ body: [{ kind: "return", id: "s/ret" }] });
    // An operation of another service, flagged as a flow, is not a flow of a WorkflowService
    registerOperation("Other.Flow", { service: "FlowTest", method: "add", context: { flowId: "Other.Flow" } } as any);
    try {
      await assert.rejects(() => this.save({ name: "Other.Flow" }), /already an operation/);
    } finally {
      delete useInstanceStorage().operations["Other.Flow"];
    }
  }

  @test
  async storedCronWithInvalidInputIsSkipped() {
    const wf = await this.save({
      input: { type: "object", properties: { x: { type: "number" } }, required: ["x"] },
      crons: [{ cron: "0 3 * * *", input: {} }]
    });
    assert.ok(listOperations()[wf.name]);
    assert.deepStrictEqual(
      (useInstanceStorage().crons ?? []).filter(c => c.operationId === wf.name),
      []
    );
  }

  @test
  async storedReloadAndRename() {
    const wf = await this.save();
    const before = this.service.getFlow(wf.name);
    await this.service["reloadStored"]();
    assert.strictEqual(this.service.getFlow(wf.name), before);
    // Renamed: the old operation goes away
    await this.edit(wf.uuid, { name: "Stored.Renamed" });
    assert.strictEqual(listOperations()[wf.name], undefined);
    assert.strictEqual(this.service.getFlow(wf.name), undefined);
    assert.ok(listOperations()["Stored.Renamed"]);
    // A row without version (written behind the validation) gets a computed one
    await (useRepository(Workflow as any) as any).repository.patch(wf.uuid, { version: "" });
    await this.service["reloadStored"]();
    assert.match(this.service.getFlow("Stored.Renamed")!.version, /^[0-9a-f]{64}$/);
  }

  @test
  async storedDeleteKeepsCodeFlowOfSameName() {
    const wf = await this.save();
    // A code flow registered later under the same id (a module enabled at runtime)
    this.flow([{ kind: "return", id: "c/ret", value: { lit: "code" } }], [], { id: wf.name });
    await Workflow.ref(wf.uuid).delete();
    assert.strictEqual(this.service.getFlow(wf.name)!.source, "code");
    assert.ok(listOperations()[wf.name]);
  }

  @test
  async storedWithoutSaverNeverRunsAsSystem() {
    const wf = (await runAsSystem(() =>
      Workflow.create({
        name: "Stored.NoSaver",
        params: [],
        input: { type: "object" },
        body: [task("s/who", "FlowTest.WhoAmI", { lit: {} })]
      } as any)
    )) as Workflow;
    assert.strictEqual(wf.updatedBy, undefined);
    const def = this.service.getFlow(wf.name)!;
    await assert.rejects(() => this.launch(def, {}), /no user to run as/);
    const alice = await this.launch(def, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(alice)).status, "SUCCESS");
    // As the child of a system flow, awaited or not: the task fails with Forbidden
    const awaited = this.flow([
      {
        kind: "try",
        id: "p/try",
        body: [task("p/try/child", wf.name, { lit: {} })],
        catchVar: "e",
        catch: [{ kind: "return", id: "p/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(awaited, {});
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output.code, "Forbidden");
    const started = this.flow([task("p/start", "Workflow.Start", { lit: { flow: wf.name, input: {} } })]);
    const startedUuid = await this.launch(started, {});
    await this.drain();
    assert.strictEqual((await this.instance(startedUuid)).error.code, "Forbidden");
    assert.strictEqual(this.ops.calls.whoAmI, 1);
  }
}
