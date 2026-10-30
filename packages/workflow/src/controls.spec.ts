// organize-imports-ignore
import { suite, test } from "@webda/test";
import { useInstanceStorage } from "@webda/core";
import * as assert from "assert";
import { vi } from "vitest";
import type { FlowDefinition, Stmt } from "./graph.js";
import { WorkflowInstance } from "./models/workflowinstance.model.js";
import { WorkflowTask } from "./models/workflowtask.model.js";
import { WorkflowService, WorkflowServiceParameters } from "./workflow.service.js";
import { task, WorkflowTestBase } from "../test/fixture.js";

@suite
class ControlsTest extends WorkflowTestBase {
  /**
   * Set who may call FlowTest.Guarded
   * @param userId - the user allowed
   */
  guardedFor(userId: string) {
    const guarded: any = useInstanceStorage().operations["FlowTest.Guarded"];
    guarded.permission = `userId = '${userId}'`;
    delete guarded.permissionQuery;
  }

  @test
  async cancelCascades() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const child = this.flow([task("c/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const parent = this.flow([
      task("p/child", child.id, { lit: {} }),
      task("p/add", "FlowTest.Add", { lit: { a: 1, b: 1 } })
    ]);
    const uuid = await this.launch(parent, {}, "alice");
    const [wait] = await this.tasks(uuid);
    assert.strictEqual((await this.instance(wait.child)).status, "WAITING");
    await this.act("alice", uuid, "cancel");
    assert.strictEqual((await this.instance(uuid)).status, "CANCELLED");
    assert.strictEqual((await this.instance(wait.child)).status, "CANCELLED");
    for (const id of [uuid, wait.child]) {
      assert.ok((await this.tasks(id)).every(t => t.status === "CANCELLED"));
    }
    vi.setSystemTime(1_000_000 + 3600_000);
    assert.strictEqual(await this.drain(), 0);
    assert.strictEqual(this.ops.calls.add, undefined);
    // Cancelling a finished instance is refused
    await assert.rejects(() => this.act("alice", uuid, "cancel"), /BadRequest|not running/i);
  }

  @test
  async cancelChildMidTask() {
    const child = this.flow([
      task("c/slow", "FlowTest.Slow", { lit: {} }, "s"),
      { kind: "return", id: "c/ret", value: { var: "s" } }
    ]);
    const parent = this.flow([
      task("p/child", child.id, { lit: {} }, "r"),
      { kind: "return", id: "p/ret", value: { var: "r" } }
    ]);
    // A remote worker runs the child task
    const remote = new WorkflowService("Workflow2", new WorkflowServiceParameters().load({ worker: false }));
    const uuid = await this.launch(parent, {}, "alice");
    const [wait] = await this.tasks(uuid);
    const running = remote["tick"]();
    await this.until(() => this.ops.calls.slow === 1);
    await this.act("alice", uuid, "cancel");
    this.ops.releases[0]("late");
    await running;
    const [childTask] = await this.tasks(wait.child);
    assert.strictEqual(childTask.status, "CANCELLED");
    assert.strictEqual((await this.instance(wait.child)).status, "CANCELLED");
    assert.deepStrictEqual((await this.instance(wait.child)).journal, {});
    assert.strictEqual((await this.instance(uuid)).status, "CANCELLED");
    // A local attempt is aborted
    const local = await this.launch(parent, {}, "alice");
    const [localWait] = await this.tasks(local);
    const ticking = this.service["tick"]();
    await this.until(() => this.ops.calls.slow === 2);
    await this.act("alice", local, "cancel");
    assert.strictEqual(this.ops.signals[1].aborted, true);
    await ticking;
    assert.strictEqual((await this.tasks(localWait.child))[0].status, "CANCELLED");
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
  async retryFromFailedTask() {
    this.guardedFor("bob");
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      task("f/G", "FlowTest.Guarded", { lit: {} }, "g"),
      task("f/C", "FlowTest.Add", { lit: { a: 2, b: 2 } }, "c"),
      { kind: "return", id: "f/ret", value: { arr: [{ var: "a" }, { var: "g" }, { var: "c" }] } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "ERROR");
    await assert.rejects(() => this.act("bob", uuid, "retry"), /not found|Forbidden/i);
    this.guardedFor("alice");
    await this.act("alice", uuid, "retry");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, [2, "ok", 4]);
    assert.strictEqual(this.ops.calls.add, 2);
    assert.strictEqual(instance.error ?? undefined, undefined);
    // Only from ERROR
    await assert.rejects(() => this.act("alice", uuid, "retry"), /retry/);
  }

  @test
  async retryReschedulesDroppedOutcomes() {
    this.guardedFor("bob");
    // B finishes after the flow failed: its outcome was dropped, its row is SUCCESS
    const def = this.flow([
      {
        kind: "parallel",
        id: "f/par",
        branches: [
          [
            task("f/par/0/G", "FlowTest.Guarded", { lit: {} }, "g"),
            { kind: "return", id: "f/par/0/ret", value: { var: "g" } }
          ],
          [
            task("f/par/1/B", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "b"),
            { kind: "return", id: "f/par/1/ret", value: { var: "b" } }
          ]
        ],
        assign: "res"
      },
      { kind: "return", id: "f/ret", value: { var: "res" } }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    const tasks = (await this.tasks(uuid)).sort((a, b) => a.key.localeCompare(b.key));
    await this.service["execute"](tasks[0]);
    await this.service["execute"](tasks[1]);
    const failed = await this.instance(uuid);
    assert.strictEqual(failed.status, "ERROR");
    assert.deepStrictEqual(Object.keys(failed.journal), ["f/par/0/G@0"]);
    this.guardedFor("alice");
    await this.act("alice", uuid, "retry");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, ["ok", 2]);
  }

  /**
   * Register a version of the flow Flows.Migrate
   * @param body - the statements
   * @returns the definition
   */
  version(body: Stmt[]): FlowDefinition {
    const def: FlowDefinition = {
      id: "Flows.Migrate",
      version: "",
      params: [],
      input: { type: "object" },
      body,
      source: "code"
    };
    this.service.registerFlow(def);
    return this.service.getFlow(def.id);
  }

  @test
  async migrateCompatible() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const A = task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } });
    const sleep = task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } });
    const B = task("f/B", "FlowTest.Add", { lit: { a: 2, b: 2 } });
    const C = task("f/C", "FlowTest.WhoAmI", { lit: {} }, "c");
    const v1 = this.version([A, sleep, B]);
    const uuid = await this.launch(v1, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    const v2 = this.version([A, sleep, B, C, { kind: "return", id: "f/ret", value: { var: "c" } }]);
    assert.notStrictEqual(v1.version, v2.version);
    await this.act("alice", uuid, "migrate");
    assert.strictEqual((await this.instance(uuid)).version, v2.version);
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, "alice");
    // Back to an explicit version, unknown version refused
    const other = await this.launch(v2, {}, "alice");
    await this.drain();
    await this.act("alice", other, "migrate", v1.version);
    assert.strictEqual((await this.instance(other)).version, v1.version);
    await assert.rejects(() => this.act("alice", other, "migrate", "nope"), /migrate/);
  }

  @test
  async migrateIncompatible() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const A = task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } });
    const v1 = this.version([A, task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const uuid = await this.launch(v1, {}, "alice");
    await this.drain();
    this.version([A, task("f/B", "FlowTest.Add", { lit: { a: 2, b: 2 } })]);
    await assert.rejects(() => this.act("alice", uuid, "migrate"), /migrate: .*f\/sleep@/);
    // A journal key missing from the target is refused too
    this.version([task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    await assert.rejects(() => this.act("alice", uuid, "migrate"), /migrate: .*f\/A@/);
    assert.strictEqual((await this.instance(uuid)).version, v1.version);
  }

  @test
  async controlsCanAct() {
    const def = this.flow([task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const uuid = await this.launch(def, {}, "alice");
    await assert.rejects(() => this.act("bob", uuid, "cancel"), /not found|Forbidden/i);
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    // The system may
    await this.act(undefined, uuid, "cancel");
    assert.strictEqual((await this.instance(uuid)).status, "CANCELLED");
  }

  @test
  async cancelledChildThrowsInParent() {
    const child = this.flow([task("c/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const parent = this.flow([
      {
        kind: "try",
        id: "p/try",
        body: [task("p/try/child", child.id, { lit: {} })],
        catchVar: "e",
        catch: [{ kind: "return", id: "p/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(parent, {}, "alice");
    const [wait] = await this.tasks(uuid);
    await this.act("alice", wait.child, "cancel");
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output.code, "Cancelled");
  }

  /**
   * Make the next instance patch matching a predicate fail as a concurrent write
   * @param predicate - which patch to fail
   * @returns the spy
   */
  concurrentWrite(predicate: (data: any) => boolean) {
    const original = this.service["patchInstance"].bind(this.service);
    let failed = false;
    return vi.spyOn(this.service as any, "patchInstance").mockImplementation(async (instance: any, data: any) => {
      if (!failed && predicate(data)) {
        failed = true;
        return false;
      }
      return original(instance, data);
    });
  }

  @test
  async controlsRetryOnConcurrentWrite() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } }),
      { kind: "return", id: "f/ret", value: { lit: 1 } }
    ]);
    // Finishing
    let spy = this.concurrentWrite(data => data.status === "SUCCESS");
    try {
      const uuid = await this.launch(def, {}, "alice");
      vi.setSystemTime(1_000_000 + 3600_000);
      await this.drain();
      assert.strictEqual((await this.instance(uuid)).status, "SUCCESS");
      assert.strictEqual(spy.mock.calls.filter(call => call[1].status === "SUCCESS").length, 2);
    } finally {
      spy.mockRestore();
    }
    // Migrating, then cancelling
    const uuid = await this.launch(def, {}, "alice");
    spy = this.concurrentWrite(data => data.definition !== undefined);
    try {
      await this.act("alice", uuid, "migrate");
      assert.strictEqual(spy.mock.calls.filter(call => call[1].definition).length, 2);
    } finally {
      spy.mockRestore();
    }
    spy = this.concurrentWrite(data => data.status === "CANCELLED");
    try {
      await this.act("alice", uuid, "cancel");
      assert.strictEqual((await this.instance(uuid)).status, "CANCELLED");
      assert.strictEqual(spy.mock.calls.filter(call => call[1].status === "CANCELLED").length, 2);
    } finally {
      spy.mockRestore();
    }
    // Retrying
    const failing = this.flow([task("f/fail", "FlowTest.Fail", { lit: {} })]);
    const failed = await this.launch(failing, {}, "alice");
    await this.drain();
    spy = this.concurrentWrite(data => data.journal !== undefined && data.status === "RUNNING");
    try {
      await this.act("alice", failed, "retry");
      assert.strictEqual(spy.mock.calls.filter(call => call[1].journal && call[1].status === "RUNNING").length, 2);
    } finally {
      spy.mockRestore();
    }
    assert.strictEqual((await this.instance(failed)).status, "RUNNING");
  }

  @test
  async retryEdgeCases() {
    // The error does not come from a task
    const thrown = this.flow([{ kind: "throw", id: "f/throw", value: { lit: "bad" } }]);
    const uuid = await this.launch(thrown, {}, "alice");
    assert.strictEqual((await this.instance(uuid)).status, "ERROR");
    await assert.rejects(() => this.act("alice", uuid, "retry"), /does not come from a task/);
    // Entries without sequence (an older journal): ordered by time, the latest failure is the one retried
    this.guardedFor("bob");
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }, "a"),
      task("f/G", "FlowTest.Guarded", { lit: {} }, "g"),
      { kind: "return", id: "f/ret", value: { arr: [{ var: "a" }, { var: "g" }] } }
    ]);
    const old = await this.launch(def, {}, "alice");
    await this.drain();
    const instance = await this.instance(old);
    assert.strictEqual(instance.status, "ERROR");
    const error = instance.journal["f/G@"]["error"];
    await WorkflowInstance.ref(old).patch({
      journal: {
        "f/A@": { result: 2 },
        "f/G@": { error: structuredClone(error), at: 5 },
        "f/old@": { error: structuredClone(error), seq: 1 }
      },
      revision: instance.revision + 1
    } as any);
    this.guardedFor("alice");
    await this.act("alice", old, "retry");
    assert.deepStrictEqual(Object.keys((await this.instance(old)).journal).sort(), ["f/A@", "f/old@"]);
    await this.drain();
    const retried = await this.instance(old);
    assert.strictEqual(retried.status, "SUCCESS");
    assert.deepStrictEqual(retried.output, [2, "ok"]);
  }

  @test
  async migrateRefusals() {
    const done = await this.launch(this.flow([{ kind: "return", id: "f/ret", value: { lit: 1 } }]), {}, "alice");
    await assert.rejects(() => this.act("alice", done, "migrate"), /not running/);
    const waiting = this.flow([task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const uuid = await this.launch(waiting, {}, "alice");
    // The flow is gone from every service
    this.service["flows"].delete(waiting.id);
    delete useInstanceStorage().operations[waiting.id];
    await assert.rejects(() => this.act("alice", uuid, "migrate"), /unknown version \(latest\)/);
  }

  @test
  async cancelSkipsFinishedRowsAndRetriesSupersede() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      task("f/A", "FlowTest.Add", { lit: { a: 1, b: 1 } }),
      task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })
    ]);
    const rows = async (uuid: string) =>
      (await this.tasks(uuid)).map(r => [r.operation, r.status]).sort((a, b) => a[0].localeCompare(b[0]));
    // The sleep row changes hands between the read and the patch
    let uuid = await this.launch(def, {}, "alice");
    await this.drain();
    let spy = vi.spyOn(this.service as any, "patchLeased").mockImplementationOnce(async (row: any) => {
      await WorkflowTask.ref(row.uuid).patch({ leaseUntil: 7 } as any);
      return false;
    });
    try {
      await this.act("alice", uuid, "cancel");
    } finally {
      spy.mockRestore();
    }
    assert.deepStrictEqual(await rows(uuid), [
      ["FlowTest.Add", "SUCCESS"],
      ["Workflow.Sleep", "CANCELLED"]
    ]);
    // Cancelled meanwhile
    uuid = await this.launch(def, {}, "alice");
    await this.drain();
    spy = vi.spyOn(this.service as any, "patchLeased").mockImplementationOnce(async (row: any) => {
      await WorkflowTask.ref(row.uuid).patch({ status: "CANCELLED" } as any);
      return false;
    });
    try {
      await this.act("alice", uuid, "cancel");
    } finally {
      spy.mockRestore();
    }
    assert.deepStrictEqual(await rows(uuid), [
      ["FlowTest.Add", "SUCCESS"],
      ["Workflow.Sleep", "CANCELLED"]
    ]);
    assert.strictEqual((await this.instance(uuid)).status, "CANCELLED");
  }
}
