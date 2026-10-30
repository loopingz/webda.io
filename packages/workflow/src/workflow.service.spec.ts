// organize-imports-ignore
import { suite, test } from "@webda/test";
import {
  callOperation,
  listOperations,
  queryModelWithPermissions,
  registerOperation,
  runWithContext,
  Session,
  SimpleOperationContext,
  useApplication,
  useCore,
  useInstanceStorage,
  useSystem,
  WebdaError
} from "@webda/core";
import { useRepository } from "@webda/models";
import * as assert from "assert";
import { vi } from "vitest";
import type { FlowDefinition } from "./graph.js";
import { setWorkflowControls, useWorkflowControls } from "./hooks.js";
import { WorkflowInstance } from "./models/workflowinstance.model.js";
import { WorkflowSignal } from "./models/workflowsignal.model.js";
import { WorkflowTask } from "./models/workflowtask.model.js";
import { useAbortSignal, WorkflowService, WorkflowServiceParameters } from "./workflow.service.js";
import { task, WorkflowTestBase } from "../test/fixture.js";

@suite
class WorkflowServiceTest extends WorkflowTestBase {
  @test
  async launchRegistersOperation() {
    const def = this.flow([{ kind: "return", id: "f/ret", value: { var: "a" } }], ["a"]);
    const op: any = listOperations()[def.id];
    assert.ok(op);
    assert.strictEqual(op.input, `${def.id}.input`);
    assert.strictEqual(op.output, "Webda/WorkflowLaunch.output");
    assert.deepStrictEqual(op.context, { flowId: def.id });
    const uuid = await this.launch(def, { a: 12 }, "alice");
    assert.match(uuid, /^[0-9a-f-]{36}$/);
    const instance = await this.instance(uuid);
    // A flow without task finishes during the launch
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 12);
    assert.deepStrictEqual(instance.input, { a: 12 });
    assert.deepStrictEqual({ ...instance.launcher }, { userId: "alice", identId: "alice-ident" });
    assert.strictEqual(instance.flowId, def.id);
    assert.match(instance.version, /^[0-9a-f]{64}$/);
    // System launch
    const sys = await this.instance(await this.launch(def, { a: 1 }));
    assert.deepStrictEqual({ ...sys.launcher }, { system: true });
    // Input is validated
    await assert.rejects(() =>
      this.launch(
        this.flow([], ["n"], { input: { type: "object", properties: { n: { type: "number" } } } }),
        { n: "x" },
        "alice"
      )
    );
  }

  @test
  async runsSequence() {
    const def = this.flow(
      [
        task("f/A", "FlowTest.Add", { obj: { a: { var: "x" }, b: { lit: 1 } } }, "r1"),
        task("f/B", "FlowTest.Add", { obj: { a: { var: "r1" }, b: { lit: 10 } } }, "r2"),
        { kind: "return", id: "f/ret", value: { arr: [{ var: "r1" }, { var: "r2" }] } }
      ],
      ["x"]
    );
    const uuid = await this.launch(def, { x: 1 }, "alice");
    assert.strictEqual((await this.instance(uuid)).status, "RUNNING");
    assert.strictEqual(await this.drain(), 2);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, [2, 12]);
    assert.strictEqual(this.ops.calls.add, 2);
    const tasks = await this.tasks(uuid);
    assert.deepStrictEqual(
      tasks.map(t => t.status),
      ["SUCCESS", "SUCCESS"]
    );
    assert.ok(tasks.every(t => t.launcherId === "alice" && t.attempt === 1));
  }

  @test
  async runsAsLauncher() {
    const def = this.flow([
      task("f/who", "FlowTest.WhoAmI", { lit: {} }, "me"),
      task("f/sys", "FlowTest.WhoAmI", { lit: {} }, "sys", { useSystem: true }),
      // Without input
      task("f/sysNull", "FlowTest.WhoAmI", { lit: null }, "sysNull", { useSystem: true }),
      { kind: "return", id: "f/ret", value: { arr: [{ var: "me" }, { var: "sys" }, { var: "sysNull" }] } }
    ]);
    const uuid = await this.launch(def, {}, "bob");
    await this.drain();
    assert.deepStrictEqual((await this.instance(uuid)).output, ["bob", "system", "system"]);
    // A system launch runs every task as the system
    const sys = await this.launch(def, {});
    await this.drain();
    assert.deepStrictEqual((await this.instance(sys)).output, ["system", "system", "system"]);
  }

  @test
  async permissionRecheckedEachStep() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/g1", "FlowTest.Guarded", { lit: {} }, "first"),
      task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } }),
      {
        kind: "try",
        id: "f/try",
        body: [task("f/try/g2", "FlowTest.Guarded", { lit: {} }, "second", { retries: 3 })],
        catchVar: "e",
        catch: [{ kind: "return", id: "f/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    assert.strictEqual(this.ops.calls.guarded, 1);
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    // Alice loses the permission during the sleep
    const guarded: any = useInstanceStorage().operations["FlowTest.Guarded"];
    guarded.permission = "userId = 'bob'";
    delete guarded.permissionQuery;
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output.code, "Forbidden");
    assert.strictEqual(instance.output.operation, "FlowTest.Guarded");
    assert.strictEqual(this.ops.calls.guarded, 1);
    // One attempt only: a 403 is not retried
    assert.strictEqual((await this.tasks(uuid)).filter(t => t.key === "f/try/g2@").length, 1);
  }

  @test
  async retriesWithBackoff() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      {
        kind: "try",
        id: "f/try",
        body: [task("f/try/fail", "FlowTest.Fail", { lit: {} }, undefined, { retries: 3, delay: "10s" })],
        catchVar: "e",
        catch: [{ kind: "return", id: "f/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(await this.service["tick"](), 1);
      // Not due yet
      assert.strictEqual(await this.service["tick"](), 0);
      vi.setSystemTime(Date.now() + 80_000);
    }
    assert.strictEqual(this.ops.calls.fail, 4);
    const tasks = (await this.tasks(uuid)).sort((a, b) => a.attempt - b.attempt);
    assert.deepStrictEqual(
      tasks.map(t => t.attempt),
      [1, 2, 3, 4]
    );
    assert.ok(tasks.every(t => t.status === "ERROR"));
    // 10s, 20s, 40s after each failure
    assert.deepStrictEqual(
      tasks.slice(1).map((t, i) => t.runAt - tasks[i].endedAt),
      [10_000, 20_000, 40_000]
    );
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, { code: "Error", message: "boom", operation: "FlowTest.Fail" });
    // Fixed backoff
    const fixed = this.flow([
      task("f/fail", "FlowTest.Fail", { lit: {} }, undefined, { retries: 2, backoff: "fixed" })
    ]);
    const fixedUuid = await this.launch(fixed, {}, "alice");
    for (let i = 0; i < 3; i++) {
      await this.service["tick"]();
      vi.setSystemTime(Date.now() + 1_000);
    }
    const fixedTasks = (await this.tasks(fixedUuid)).sort((a, b) => a.attempt - b.attempt);
    assert.deepStrictEqual(
      fixedTasks.slice(1).map((t, i) => t.runAt - fixedTasks[i].endedAt),
      [1_000, 1_000]
    );
    assert.strictEqual((await this.instance(fixedUuid)).status, "ERROR");
  }

  @test
  async timeout() {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"], now: 1_000_000 });
    const def = this.flow([task("f/slow", "FlowTest.Slow", { lit: {} }, undefined, { timeout: "1s" })]);
    const uuid = await this.launch(def, {}, "alice");
    const ticking = this.service["tick"]();
    await vi.advanceTimersByTimeAsync(1_000);
    assert.strictEqual(await ticking, 1);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "ERROR");
    assert.strictEqual(instance.error.code, "Timeout");
    assert.strictEqual(this.ops.calls.slow, 1);
    // The operation sees the abort through useAbortSignal()
    assert.strictEqual(this.ops.signals.length, 1);
    assert.strictEqual(this.ops.signals[0].aborted, true);
    assert.strictEqual(useAbortSignal(), undefined);
  }

  @test
  async sleepSurvivesRestart() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      task("f/sleep", "Workflow.Sleep", { lit: { duration: "6d" } }),
      task("f/B", "FlowTest.Add", { obj: { a: { var: "a" }, b: { lit: 1 } } }, "b"),
      { kind: "return", id: "f/ret", value: { var: "b" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    // A new service on the same stores, the old one is gone
    const restarted = new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false }));
    vi.setSystemTime(1_000_000 + 6 * 86400_000 - 1000);
    assert.strictEqual(await this.drain(restarted), 0);
    vi.setSystemTime(1_000_000 + 6 * 86400_000);
    assert.strictEqual(await this.drain(restarted), 2);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 3);
    assert.strictEqual(this.ops.calls.add, 2);
    assert.strictEqual(await this.drain(restarted), 0);
  }

  @test
  async twoWorkersOneRun() {
    const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
    const uuid = await this.launch(def, {}, "alice");
    const other = new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false }));
    const counts = await Promise.all([this.service["tick"](), other["tick"]()]);
    assert.strictEqual(counts[0] + counts[1], 1);
    assert.strictEqual(this.ops.calls.add, 1);
    assert.strictEqual((await this.instance(uuid)).status, "SUCCESS");
  }

  @test
  async crashedLeaseReclaimed() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      { kind: "return", id: "f/ret", value: { var: "a" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const [pending] = await this.tasks(uuid);
    // A worker claimed it and crashed
    await WorkflowTask.ref(pending.uuid).patch({ status: "RUNNING", owner: "crashed", leaseUntil: 1_000_000 + 60_000 });
    assert.strictEqual(await this.service["tick"](), 0);
    vi.setSystemTime(1_000_000 + 60_001);
    assert.strictEqual(await this.service["tick"](), 1);
    const [reclaimed] = await this.tasks(uuid);
    assert.strictEqual(reclaimed.status, "SUCCESS");
    assert.strictEqual(reclaimed.attempt, 2);
    assert.notStrictEqual(reclaimed.owner, "crashed");
    assert.strictEqual((await this.instance(uuid)).output, 2);
  }

  @test
  async parallelJournalNoLoss() {
    const def = this.flow([
      {
        kind: "parallel",
        id: "f/par",
        branches: [
          [
            task("f/par/0/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "r"),
            { kind: "return", id: "f/par/0/ret", value: { var: "r" } }
          ],
          [
            task("f/par/1/B", "FlowTest.Add", { lit: { a: 2, b: 2 } }, "r"),
            { kind: "return", id: "f/par/1/ret", value: { var: "r" } }
          ]
        ],
        assign: "res"
      },
      { kind: "return", id: "f/ret", value: { var: "res" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const tasks = await this.tasks(uuid);
    assert.strictEqual(tasks.length, 2);
    await Promise.all(tasks.map(t => this.service["execute"](t)));
    const instance = await this.instance(uuid);
    assert.deepStrictEqual(Object.keys(instance.journal).sort(), ["f/par/0/A@0", "f/par/1/B@1"]);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, [2, 4]);
    assert.strictEqual(instance.revision >= 3, true);
  }

  @test
  async dateNowStable() {
    vi.useFakeTimers({ toFake: ["Date"], now: 5_000_000 });
    const def = this.flow([
      task("f/now", "Date.Now", { lit: {} }, "now"),
      task("f/rnd", "Random.Number", { lit: {} }, "rnd"),
      task("f/uuid", "Random.Uuid", { lit: {} }, "id"),
      task("f/sleep", "Workflow.Sleep", { obj: { until: { op: "+", args: [{ var: "now" }, { lit: 1000 }] } } }),
      { kind: "return", id: "f/ret", value: { arr: [{ var: "now" }, { var: "rnd" }, { var: "id" }] } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    const waiting = await this.instance(uuid);
    assert.strictEqual(waiting.status, "WAITING");
    assert.deepStrictEqual(waiting.journal["f/now@"], { result: 5_000_000, at: 5_000_000, seq: 1 });
    const sleepTask = (await this.tasks(uuid)).find(t => t.operation === "Workflow.Sleep");
    assert.strictEqual(sleepTask.runAt, 5_001_000);
    // Forcing replays later does not change the recorded values
    vi.setSystemTime(5_002_000);
    await this.service["advance"](uuid);
    await this.service["advance"](uuid);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output[0], 5_000_000);
    assert.strictEqual(instance.output[1], waiting.journal["f/rnd@"]["result"]);
    assert.strictEqual(instance.output[2], waiting.journal["f/uuid@"]["result"]);
    assert.strictEqual((await this.tasks(uuid)).filter(t => t.operation === "Date.Now").length, 1);
  }

  @test
  async contextTooLarge() {
    this.service.getParameters().maxContextSize = 100;
    const def = this.flow([
      task("f/big", "FlowTest.Big", { lit: {} }, "b"),
      { kind: "return", id: "f/ret", value: { lit: 1 } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "ERROR");
    assert.strictEqual(instance.error.code, "ContextTooLarge");
    assert.deepStrictEqual(instance.journal, {});
  }

  @test
  async storedSystemNotAllowed() {
    // A stored flow cannot use useSystem without the opt-in
    const stored = this.flow([task("f/sys", "FlowTest.WhoAmI", { lit: {} }, undefined, { useSystem: true })], [], {
      source: "stored"
    });
    const storedUuid = await this.launch(stored, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(storedUuid)).error.code, "SystemNotAllowed");
    assert.strictEqual(this.ops.calls.whoAmI, undefined);
  }

  @test
  async canActLauncherOnly() {
    const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
    const uuid = await this.launch(def, {}, "alice");
    const alice = await this.userContext("alice");
    const bob = await this.userContext("bob");
    const ids = async (model: any, ctx: any) =>
      (await queryModelWithPermissions(model, "", ctx)).results.map((r: any) => r.uuid);
    assert.deepStrictEqual(await ids(WorkflowInstance, alice), [uuid]);
    assert.deepStrictEqual(await ids(WorkflowInstance, bob), []);
    assert.strictEqual((await ids(WorkflowTask, alice)).length, 1);
    assert.deepStrictEqual(await ids(WorkflowTask, bob), []);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.canAct(alice, "get"), true);
    assert.notStrictEqual(instance.canAct(alice, "update"), true);
    assert.notStrictEqual(instance.canAct(bob, "get"), true);
    assert.strictEqual(instance.canAct(useSystem(), "delete"), true);
    const [row] = await this.tasks(uuid);
    assert.strictEqual(row.canAct(alice, "get"), true);
    assert.match(String(row.canAct(alice, "update")), /WorkflowService only/);
    assert.strictEqual(row.canAct(useSystem(), "update"), true);
    const signal = new WorkflowSignal();
    assert.strictEqual(signal.canAct(useSystem()), true);
    assert.match(String(signal.canAct(alice)), /WorkflowService only/);
  }

  @test
  controlsRequireAService() {
    setWorkflowControls(undefined);
    try {
      assert.throws(() => useWorkflowControls(), /No WorkflowService is configured/);
    } finally {
      setWorkflowControls(this.service);
    }
    assert.strictEqual(useWorkflowControls(), this.service);
  }

  @test
  async workerLoop() {
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      { kind: "return", id: "f/ret", value: { var: "a" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const worker = new WorkflowService("Workflow3", new WorkflowServiceParameters().load({ pollInterval: 5 }));
    worker["startWorker"]();
    try {
      for (let i = 0; i < 100 && (await this.instance(uuid)).status !== "SUCCESS"; i++) {
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    } finally {
      await worker.stop();
    }
    assert.strictEqual((await this.instance(uuid)).status, "SUCCESS");
  }

  @test
  async parallelRaceRunsEachStepOnce() {
    const def = this.flow([
      {
        kind: "parallel",
        id: "f/par",
        branches: [
          [task("f/par/0/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })],
          [task("f/par/1/B", "FlowTest.Add", { lit: { a: 2, b: 2 } })]
        ]
      },
      task("f/C", "FlowTest.Add", { lit: { a: 3, b: 3 } }, "c"),
      { kind: "return", id: "f/ret", value: { var: "c" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const [a, b] = (await this.tasks(uuid)).sort((x, y) => x.key.localeCompare(y.key));
    // A's advance read the instance before B journaled, B finishes completely before A schedules
    const original = this.service["scheduleTask"].bind(this.service);
    let injected = false;
    this.service["scheduleTask"] = async (instance, scheduled) => {
      if (scheduled.key === b.key && !injected) {
        injected = true;
        await this.service["execute"](b);
      }
      return original(instance, scheduled);
    };
    try {
      await this.service["execute"](a);
    } finally {
      delete this.service["scheduleTask"];
    }
    assert.ok(injected);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 6);
    // a, b and c once each
    assert.strictEqual(this.ops.calls.add, 3);
    assert.strictEqual((await this.tasks(uuid)).filter(t => t.key === b.key).length, 1);
  }

  @test
  async journaledKeyNotRunAgain() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      { kind: "return", id: "f/ret", value: { var: "a" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const [row] = await this.tasks(uuid);
    // A worker journaled the outcome then crashed before finishing the row
    const instance = await this.instance(uuid);
    await WorkflowInstance.ref(uuid).patch({
      journal: { [row.key]: { result: 2, at: 1_000_000 } },
      revision: instance.revision + 1
    } as any);
    await WorkflowTask.ref(row.uuid).patch({ status: "RUNNING", owner: "crashed", leaseUntil: 1_000_100 } as any);
    vi.setSystemTime(1_000_200);
    assert.strictEqual(await this.service["tick"](), 1);
    assert.strictEqual(this.ops.calls.add, undefined);
    assert.strictEqual((await WorkflowTask.ref(row.uuid).get()).status, "CANCELLED");
    // The sweep then resumes the instance
    vi.setSystemTime(1_000_200 + 120_000);
    await this.service["sweep"]();
    assert.strictEqual((await this.instance(uuid)).output, 2);
  }

  /**
   * Let the pending promises run until a condition holds
   * @param condition - the condition
   */
  async until(condition: () => boolean) {
    for (let i = 0; i < 100 && !condition(); i++) await new Promise(resolve => setImmediate(resolve));
    assert.ok(condition());
  }

  @test
  async lostLeaseDropsLateOutcome() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/slow", "FlowTest.Slow", { lit: {} }, "s"),
      { kind: "return", id: "f/ret", value: { var: "s" } }
    ]);
    const original = new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false }));
    // 1. The original worker is slow, its lease expires and another worker reclaims and finishes the task
    let uuid = await this.launch(def, {}, "alice");
    let [row] = await this.tasks(uuid);
    let running = original["tick"]();
    await this.until(() => this.ops.calls.slow === 1);
    vi.setSystemTime(1_000_000 + 60_001);
    let reclaimer = this.service["tick"]();
    await this.until(() => this.ops.calls.slow === 2);
    this.ops.releases[1]("second");
    await reclaimer;
    // The late outcome of the original neither overwrites the row nor reaches the journal
    this.ops.releases[0]("first");
    await running;
    let final = await WorkflowTask.ref(row.uuid).get();
    assert.strictEqual(final.status, "SUCCESS");
    assert.strictEqual(final.output, "second");
    assert.strictEqual(final.owner, this.service["workerId"]);
    assert.strictEqual((await this.instance(uuid)).output, "second");
    // 2. The original learns it lost the lease when it renews it: its attempt is aborted
    uuid = await this.launch(def, {}, "alice");
    [row] = await this.tasks(uuid);
    running = original["tick"]();
    await this.until(() => this.ops.calls.slow === 3);
    vi.setSystemTime(Date.now() + 60_001);
    reclaimer = this.service["tick"]();
    await this.until(() => this.ops.calls.slow === 4);
    await original["renewLease"](original["running"].get(row.uuid).task);
    assert.strictEqual(this.ops.signals[2].aborted, true);
    await running;
    this.ops.releases[3]("fourth");
    await reclaimer;
    final = await WorkflowTask.ref(row.uuid).get();
    assert.strictEqual(final.output, "fourth");
    assert.strictEqual((await this.instance(uuid)).output, "fourth");
  }

  @test
  async crashLoopFails() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      {
        kind: "try",
        id: "f/try",
        body: [task("f/try/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, undefined, { retries: 1 })],
        catchVar: "e",
        catch: [{ kind: "return", id: "f/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const [row] = await this.tasks(uuid);
    // Attempt 3 crashed: retries + 1 attempts are used, one more crash recovery was granted already
    await WorkflowTask.ref(row.uuid).patch({
      status: "RUNNING",
      owner: "crashed",
      attempt: 3,
      leaseUntil: 1_000_100
    } as any);
    vi.setSystemTime(1_000_200);
    assert.strictEqual(await this.service["tick"](), 1);
    assert.strictEqual(this.ops.calls.add, undefined);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output.code, "Crashed");
    assert.strictEqual((await WorkflowTask.ref(row.uuid).get()).status, "ERROR");
  }

  @test
  async sweepResumesStrandedInstance() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      task("f/B", "FlowTest.Add", { obj: { a: { var: "a" }, b: { lit: 1 } } }, "b"),
      { kind: "return", id: "f/ret", value: { var: "b" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    // advance() fails after the task row is finished: nothing schedules B
    this.service["advance"] = async () => {
      throw new Error("crash");
    };
    try {
      await assert.rejects(() => this.service["tick"](), /crash/);
    } finally {
      delete this.service["advance"];
    }
    assert.strictEqual(await this.service["tick"](), 0);
    assert.strictEqual((await this.instance(uuid)).status, "RUNNING");
    // Too recent for the sweep
    assert.strictEqual(await this.service["sweep"](), 0);
    vi.setSystemTime(1_000_000 + 60_001);
    assert.strictEqual(await this.service["sweep"](), 1);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 3);
    // An instance with a live task is left alone
    const waiting = await this.launch(
      this.flow([task("f/s", "Workflow.Sleep", { lit: { duration: "1d" } })]),
      {},
      "alice"
    );
    vi.setSystemTime(Date.now() + 120_000);
    assert.strictEqual(await this.service["sweep"](), 0);
    assert.strictEqual((await this.instance(waiting)).status, "WAITING");
  }

  @test
  async stopWaitsForInFlightPoll() {
    const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
    const uuid = await this.launch(def, {}, "alice");
    const worker = new WorkflowService("Workflow3", new WorkflowServiceParameters().load({ pollInterval: 100000 }));
    const settle = async () => {
      for (let i = 0; i < 50; i++) await new Promise(resolve => setImmediate(resolve));
    };
    worker["poll"]();
    await worker.stop();
    const atStop = (await this.tasks(uuid))[0].status;
    // The in-flight poll finished within stop: nothing runs or changes after it
    assert.notStrictEqual(atStop, "RUNNING");
    await settle();
    assert.strictEqual((await this.tasks(uuid))[0].status, atStop);
    // No claim after stop
    const second = await this.launch(def, {}, "alice");
    worker["poll"]();
    await settle();
    assert.strictEqual((await this.tasks(second))[0].status, "PENDING");
  }

  @test
  async stopAbortsLongTasks() {
    const def = this.flow([task("f/slow", "FlowTest.Slow", { lit: {} })]);
    const uuid = await this.launch(def, {}, "alice");
    const worker = new WorkflowService(
      "Workflow3",
      new WorkflowServiceParameters().load({ pollInterval: 100000, stopTimeout: 10 })
    );
    await worker["poll"]();
    assert.strictEqual(this.ops.calls.slow, 1);
    await worker.stop();
    assert.strictEqual(this.ops.signals[0].aborted, true);
    await new Promise(resolve => setImmediate(resolve));
    // The outcome is dropped: the lease expiry lets another worker retry
    const [row] = await this.tasks(uuid);
    assert.strictEqual(row.status, "RUNNING");
    assert.deepStrictEqual((await this.instance(uuid)).journal, {});
  }

  @test
  flowsParameterRegisteredAtResolve() {
    const base = this.flow([{ kind: "return", id: "p/ret", value: { lit: 1 } }]);
    const other = this.registerService(
      new WorkflowService(
        "Workflow4",
        new WorkflowServiceParameters().load({
          worker: false,
          flows: [
            { ...base, id: "Param.Full", version: "v1" },
            { id: "Param.Bare", params: [], input: { type: "object" }, body: base.body }
          ]
        })
      )
    );
    const signalOperation = useInstanceStorage().operations["Workflow.Signal"];
    try {
      other.resolve();
      assert.strictEqual(other.getFlow("Param.Full")!.version, "v1");
      const bare = other.getFlow("Param.Bare")!;
      assert.strictEqual(bare.source, "code");
      assert.match(bare.version, /^[0-9a-f]{64}$/);
      assert.strictEqual(useInstanceStorage().operations["Param.Bare"].service, "Workflow4");
    } finally {
      setWorkflowControls(this.service);
      useInstanceStorage().operations["Workflow.Signal"] = signalOperation;
      for (const id of ["Param.Full", "Param.Bare"]) delete useInstanceStorage().operations[id];
      delete useCore().getServices()["Workflow4"];
    }
  }

  @test
  moduleFlowsWithoutSection() {
    const modules = useApplication().getModules();
    const { flows } = modules;
    modules.flows = undefined;
    const other = new WorkflowService("Workflow4", new WorkflowServiceParameters().load({ worker: false }));
    try {
      other["registerModuleFlows"]();
      assert.strictEqual(other["moduleFlows"].size, 0);
    } finally {
      modules.flows = flows;
    }
    // Removing a flow that is not a module flow is harmless
    this.service["unregisterModuleFlow"]("Nope.Flow");
  }

  @test
  async initStartsTheWorker() {
    const worker = new WorkflowService("Workflow4", new WorkflowServiceParameters().load({ pollInterval: 100000 }));
    vi.spyOn(worker as any, "listenStored").mockImplementation(() => {});
    vi.spyOn(worker as any, "reloadStored").mockResolvedValue(undefined);
    vi.spyOn(worker as any, "startSync").mockImplementation(() => {});
    try {
      await worker.init();
      assert.ok(worker["timer"]);
    } finally {
      await worker.stop();
    }
    assert.strictEqual(worker["timer"], undefined);
  }

  @test
  async flowsOfAnotherService() {
    const other = this.registerService(
      new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false }))
    );
    const def: FlowDefinition = {
      id: "Remote.Flow",
      version: "",
      params: [],
      input: { type: "object" },
      body: [{ kind: "return", id: "r/ret", value: { lit: 1 } }],
      source: "code"
    };
    try {
      other.registerFlow(def);
      const remote = other.getFlow("Remote.Flow")!;
      assert.strictEqual(this.service.resolveFlow("Remote.Flow"), remote);
      assert.strictEqual(this.service.getFlowVersion("Remote.Flow", remote.version), remote);
      assert.strictEqual(this.service.getFlowVersion("Remote.Flow", "nope"), undefined);
      assert.strictEqual(this.service.storedRunAs("Remote.Flow"), undefined);
      // An operation served by a service that is not a WorkflowService
      registerOperation("Other.Op", { service: "FlowTest", method: "add", context: { flowId: "Other.Op" } } as any);
      assert.strictEqual(this.service.resolveFlow("Other.Op"), undefined);
      assert.strictEqual(this.service.getFlowVersion("Other.Op", "v"), undefined);
      assert.strictEqual(this.service.storedRunAs("Other.Op"), undefined);
      // An operation whose service is gone
      useInstanceStorage().operations["Ghost.Op"] = {
        service: "Ghost",
        method: "add",
        context: { flowId: "Ghost.Op" }
      } as any;
      assert.strictEqual(this.service.resolveFlow("Ghost.Op"), undefined);
      assert.strictEqual(this.service.getFlowVersion("Ghost.Op", "v"), undefined);
      assert.strictEqual(this.service.storedRunAs("Ghost.Op"), undefined);
      // The lookup left an empty entry in the services map: the target resolution skips it
      assert.ok("Ghost" in useCore().getServices());
      assert.strictEqual(
        this.service.resolveTarget({ class: "FlowTestService", method: "whoAmI" }).operation,
        "FlowTest.WhoAmI"
      );
      // Unknown and local ids
      assert.strictEqual(this.service.resolveFlow(undefined), undefined);
      assert.strictEqual(this.service.resolveFlow("Nope.Flow"), undefined);
      assert.strictEqual(this.service.getFlowVersion("Nope.Flow", "v"), undefined);
      assert.strictEqual(this.service.storedRunAs("Nope.Flow"), undefined);
      const local = this.flow([]);
      assert.strictEqual(this.service.getFlowVersion(local.id, "nope"), undefined);
      assert.strictEqual(this.service.storedRunAs(local.id), undefined);
    } finally {
      delete useCore().getServices()["Workflow2"];
      delete useCore().getServices()["Ghost"];
      for (const id of ["Remote.Flow", "Other.Op", "Ghost.Op"]) delete useInstanceStorage().operations[id];
    }
  }

  @test
  async launchNeedsAFlowOperation() {
    const ctx = await this.userContext("alice");
    await assert.rejects(() => runWithContext(ctx, () => this.service.launch()), /Unknown flow undefined/);
    ctx.setExtension("operationContext", { flowId: "Nope.Flow" });
    await assert.rejects(() => runWithContext(ctx, () => this.service.launch()), /Unknown flow Nope.Flow/);
  }

  @test
  async anonymousLaunchRunsWithoutUser() {
    const def = this.flow([
      task("f/who", "FlowTest.WhoAmI", { lit: {} }, "me"),
      { kind: "return", id: "f/ret", value: { var: "me" } }
    ]);
    const ctx = new SimpleOperationContext();
    ctx.setSession(new Session());
    ctx.setInput(Buffer.from("{}"));
    await ctx.init();
    await callOperation(ctx, def.id);
    const uuid = JSON.parse(ctx.getOutput()).uuid;
    assert.deepStrictEqual({ ...(await this.instance(uuid)).launcher }, {});
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output ?? undefined, undefined);
    assert.strictEqual(this.ops.calls.whoAmI, 1);
  }

  @test
  async existingInstanceNotCreatedTwice() {
    const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
    const uuid = await this.launch(def, {}, "alice");
    const same = await this.service["createInstance"](def, {}, { system: true }, { uuid });
    assert.strictEqual(same.uuid, uuid);
    assert.deepStrictEqual({ ...same.launcher }, { userId: "alice", identId: "alice-ident" });
  }

  @test
  async workerLoopGuards() {
    const worker = new WorkflowService("Workflow3", new WorkflowServiceParameters().load({ pollInterval: 100000 }));
    const log = vi.spyOn(worker, "log").mockImplementation(() => {});
    try {
      worker["startWorker"]();
      const timer = worker["timer"];
      worker["startWorker"]();
      assert.strictEqual(worker["timer"], timer);
      // One poll at a time
      const polling = worker["poll"]();
      assert.strictEqual(worker["poll"](), polling);
      await polling;
      // A failing execution is logged, not thrown
      const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
      await this.launch(def, {}, "alice");
      const execute = vi.spyOn(worker as any, "execute").mockRejectedValueOnce(new Error("boom"));
      await worker["poll"]();
      await Promise.allSettled([...worker["executions"]]);
      assert.strictEqual(execute.mock.calls.length, 1);
      assert.ok(log.mock.calls.some(call => call[1] === "Workflow task failed"));
      // A failing claim too
      const claimDue = vi.spyOn(worker as any, "claimDue").mockRejectedValueOnce(new Error("down"));
      await worker["poll"]();
      assert.ok(log.mock.calls.some(call => call[1] === "Workflow poll failed"));
      claimDue.mockRestore();
      execute.mockRestore();
      // No free slot: nothing is claimed
      await this.launch(def, {}, "alice");
      worker.getParameters().concurrency = 0;
      assert.strictEqual(await worker["tick"](), 0);
    } finally {
      await worker.stop();
      log.mockRestore();
    }
  }

  @test
  async storeFailuresAreRaised() {
    const def = this.flow([task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } })]);
    const uuid = await this.launch(def, {}, "alice");
    const [row] = await this.tasks(uuid);
    const patch = vi.spyOn(useRepository(WorkflowTask as any), "patch");
    const patchInstance = vi.spyOn(useRepository(WorkflowInstance as any), "patch");
    const create = vi.spyOn(useRepository(WorkflowTask as any), "create");
    const log = vi.spyOn(this.service, "log").mockImplementation(() => {});
    try {
      // A claim failing for another reason than the lease is raised
      patch.mockRejectedValueOnce(new Error("Store down"));
      await assert.rejects(() => this.service["claim"](row), /Store down/);
      patch.mockRejectedValueOnce(new Error("Store down"));
      await assert.rejects(() => this.service["patchLeased"](row, { status: "ERROR" }), /Store down/);
      // The lease renewal logs it and aborts the attempt
      assert.strictEqual(await this.service["claim"](row), true);
      const lost = new AbortController();
      this.service["running"].set(row.uuid, { task: row, controller: lost });
      patch.mockRejectedValueOnce(new Error("Store down"));
      await this.service["renewLease"](row);
      assert.strictEqual(lost.signal.aborted, true);
      assert.ok(log.mock.calls.some(call => call[0] === "WARN"));
      // Held: the attempt goes on
      const held = new AbortController();
      this.service["running"].set(row.uuid, { task: row, controller: held });
      await this.service["renewLease"](row);
      assert.strictEqual(held.signal.aborted, false);
      this.service["running"].delete(row.uuid);
      // Instances and task creation alike
      const instance = await this.instance(uuid);
      patchInstance.mockRejectedValueOnce(new Error("Store down"));
      await assert.rejects(() => this.service["patchInstance"](instance, { status: "WAITING" }), /Store down/);
      create.mockRejectedValueOnce(new Error("Store down"));
      await assert.rejects(
        () =>
          this.service["createTask"](
            uuid,
            { key: "f/B@", operation: "FlowTest.Add", input: {}, options: {} },
            "alice",
            Date.now(),
            1
          ),
        /Store down/
      );
    } finally {
      patch.mockRestore();
      patchInstance.mockRestore();
      create.mockRestore();
      log.mockRestore();
    }
  }

  @test
  async retryableHttpError() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([task("f/t", "FlowTest.Throttled", { lit: {} }, undefined, { retries: 1, delay: "1s" })]);
    const uuid = await this.launch(def, {}, "alice");
    assert.strictEqual(await this.service["tick"](), 1);
    vi.setSystemTime(1_001_000);
    assert.strictEqual(await this.service["tick"](), 1);
    assert.strictEqual(this.ops.calls.throttled, 2);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "ERROR");
    assert.deepStrictEqual(instance.error, {
      code: "TooManyRequests",
      message: "slow down",
      operation: "FlowTest.Throttled"
    });
  }

  @test
  flowErrorCodes() {
    const to = (err: any) => this.service["toFlowError"](err, "Op");
    assert.deepStrictEqual(to(new WebdaError.Forbidden("no")), { code: "Forbidden", message: "no", operation: "Op" });
    assert.deepStrictEqual(to(new WebdaError.Conflict("dup")), { code: "Conflict", message: "dup", operation: "Op" });
    assert.deepStrictEqual(to(Object.assign(new Error("io"), { code: "ECONNRESET" })), {
      code: "ECONNRESET",
      message: "io",
      operation: "Op"
    });
    assert.deepStrictEqual(to(Object.assign(new RangeError("r"), { code: "" })), {
      code: "RangeError",
      message: "r",
      operation: "Op"
    });
    assert.deepStrictEqual(to("oops"), { code: "Error", message: "oops", operation: "Op" });
    assert.deepStrictEqual(to(undefined), { code: "Error", message: "undefined", operation: "Op" });
  }

  @test
  async journalWriteEdgeCases() {
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    // Already journaled: the first outcome stays
    assert.strictEqual(await this.service["writeJournal"](uuid, "f/A@", { result: 5 }), true);
    assert.strictEqual((await this.instance(uuid)).journal["f/A@"]["result"], 2);
    // Too large, after a concurrent write on the first attempt
    this.service.getParameters().maxContextSize = 10;
    const patch = vi.spyOn(this.service as any, "patchInstance");
    patch.mockImplementationOnce(async () => false);
    try {
      assert.strictEqual(await this.service["writeJournal"](uuid, "f/B@", { result: "x".repeat(20) }), false);
      assert.strictEqual(patch.mock.calls.length, 2);
    } finally {
      patch.mockRestore();
    }
    assert.strictEqual((await this.instance(uuid)).status, "ERROR");
    // Not active any more
    assert.strictEqual(await this.service["writeJournal"](uuid, "f/C@", { result: 1 }), false);
  }

  @test
  async sleepDurations() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/none", "Workflow.Sleep", { lit: {} }),
      task("f/bad", "Workflow.Sleep", { lit: { duration: "soon" } }),
      { kind: "return", id: "f/ret", value: { lit: "up" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    // Without duration, or with an invalid one: the timer fires at once
    assert.strictEqual(await this.drain(), 2);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, "up");
    assert.ok((await this.tasks(uuid)).every(t => t.runAt === 1_000_000));
  }
}
