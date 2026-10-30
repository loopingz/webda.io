// organize-imports-ignore
import { suite, test } from "@webda/test";
import { useInstanceStorage } from "@webda/core";
import * as assert from "assert";
import { vi } from "vitest";
import { WorkflowTask } from "./models/workflowtask.model.js";
import { task, WorkflowTestBase } from "../test/fixture.js";

@suite
class ChildrenTest extends WorkflowTestBase {
  /**
   * A child flow adding 1 to x
   * @returns the child definition
   */
  child() {
    return this.flow(
      [
        task("c/add", "FlowTest.Add", { obj: { a: { var: "x" }, b: { lit: 1 } } }, "r"),
        { kind: "return", id: "c/ret", value: { var: "r" } }
      ],
      ["x"]
    );
  }

  @test
  async awaitChildReturnsOutput() {
    const child = this.child();
    const parent = this.flow([
      task("p/child", child.id, { obj: { x: { lit: 2 } } }, "r"),
      { kind: "return", id: "p/ret", value: { op: "*", args: [{ var: "r" }, { lit: 10 }] } }
    ]);
    const uuid = await this.launch(parent, {}, "alice");
    const parentInstance = await this.instance(uuid);
    assert.strictEqual(parentInstance.status, "WAITING");
    const [wait] = await this.tasks(uuid);
    assert.strictEqual(wait.status, "WAITING_CHILD");
    const childInstance = await this.instance(wait.child);
    assert.deepStrictEqual({ ...childInstance.parent }, { instance: uuid, key: "p/child@" });
    assert.deepStrictEqual({ ...childInstance.launcher }, { userId: "alice", identId: "alice-ident" });
    assert.deepStrictEqual(childInstance.input, { x: 2 });
    assert.strictEqual(childInstance.version, child.version || childInstance.definition.version);
    await this.drain();
    assert.strictEqual((await this.instance(wait.child)).status, "SUCCESS");
    const done = await this.instance(uuid);
    assert.strictEqual(done.status, "SUCCESS");
    assert.strictEqual(done.output, 30);
    assert.strictEqual(this.ops.calls.add, 1);
  }

  @test
  async childErrorThrowsInParent() {
    const child = this.flow([{ kind: "throw", id: "c/throw", value: { lit: "bad" } }]);
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
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.deepStrictEqual(instance.output, { code: "FlowError", message: "bad", operation: child.id });
    // Uncaught: the parent fails
    const failing = this.flow([task("p/child", child.id, { lit: {} })]);
    const failed = await this.launch(failing, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(failed)).status, "ERROR");
    assert.strictEqual((await this.instance(failed)).error.message, "bad");
  }

  @test
  async childRunsAsLauncher() {
    const child = this.flow([
      task("c/who", "FlowTest.WhoAmI", { lit: {} }, "me"),
      { kind: "return", id: "c/ret", value: { var: "me" } }
    ]);
    const parent = this.flow([
      task("p/child", child.id, { lit: {} }, "me"),
      { kind: "return", id: "p/ret", value: { var: "me" } }
    ]);
    const uuid = await this.launch(parent, {}, "bob");
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, "bob");
  }

  @test
  async fireAndForgetReturnsUuid() {
    const child = this.child();
    const parent = this.flow([
      task("p/start", "Workflow.Start", { lit: { flow: child.id, input: { x: 5 } } }, "started"),
      { kind: "return", id: "p/ret", value: { var: "started" } }
    ]);
    const uuid = await this.launch(parent, {}, "alice");
    // The start task runs, the parent ends without waiting for the child
    assert.strictEqual(await this.service["tick"](), 1);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    const childInstance = await this.instance(instance.output.uuid);
    assert.strictEqual(childInstance.parent, undefined);
    assert.strictEqual(childInstance.launcher.userId, "alice");
    assert.strictEqual(childInstance.status, "RUNNING");
    await this.drain();
    assert.strictEqual((await this.instance(instance.output.uuid)).output, 6);
    // An unknown flow fails the task
    const unknown = this.flow([task("p/start", "Workflow.Start", { lit: { flow: "Nope.Flow", input: {} } })]);
    const failed = await this.launch(unknown, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(failed)).error.code, "NotFound");
  }

  @test
  async childStartChecksFlowPermission() {
    const child = this.child();
    const op: any = useInstanceStorage().operations[child.id];
    op.permission = "userId = 'bob'";
    delete op.permissionQuery;
    try {
      const catching = (id: string, operation: string, input: any) => ({
        kind: "try" as const,
        id: `p/${id}`,
        body: [
          task(`p/${id}/t`, operation, input, "r"),
          { kind: "return" as const, id: `p/${id}/r`, value: { var: "r" } }
        ],
        catchVar: "e",
        catch: [{ kind: "return" as const, id: `p/${id}/ret`, value: { var: "e" } }]
      });
      // Awaited child
      const awaited = this.flow([catching("await", child.id, { lit: { x: 1 } })]);
      const uuid = await this.launch(awaited, {}, "alice");
      await this.drain();
      const instance = await this.instance(uuid);
      assert.strictEqual(instance.status, "SUCCESS");
      assert.strictEqual(instance.output.code, "Forbidden");
      // Fire and forget
      const started = this.flow([catching("start", "Workflow.Start", { lit: { flow: child.id, input: { x: 1 } } })]);
      const startedUuid = await this.launch(started, {}, "alice");
      await this.drain();
      assert.strictEqual((await this.instance(startedUuid)).output.code, "Forbidden");
      assert.strictEqual(this.ops.calls.add, undefined);
      // Bob may
      const bobs = await this.launch(awaited, {}, "bob");
      await this.drain();
      assert.strictEqual((await this.instance(bobs)).output, 2);
    } finally {
      delete op.permission;
      delete op.permissionQuery;
    }
  }

  @test
  async startWithoutInput() {
    const child = this.child();
    const noInput = this.flow([
      task("p/start", "Workflow.Start", { lit: { flow: child.id } }, "started"),
      { kind: "return", id: "p/ret", value: { var: "started" } }
    ]);
    const uuid = await this.launch(noInput, {}, "alice");
    await this.drain();
    const started = await this.instance((await this.instance(uuid)).output.uuid);
    assert.deepStrictEqual(started.input, {});
    // A null input names no flow
    const nothing = this.flow([task("p/start", "Workflow.Start", { lit: null })]);
    const failed = await this.launch(nothing, {}, "alice");
    await this.drain();
    assert.strictEqual((await this.instance(failed)).error.code, "NotFound");
  }

  @test
  async systemParentChildWithNullInput() {
    const child = this.flow([{ kind: "return", id: "c/ret", value: { var: "x" } }], ["x"]);
    const parent = this.flow([
      task("p/child", child.id, { lit: null }, "r"),
      { kind: "return", id: "p/ret", value: { lit: "done" } }
    ]);
    const uuid = await this.launch(parent, {});
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, "done");
    const [wait] = await this.tasks(uuid);
    const childInstance = await this.instance(wait.child);
    assert.deepStrictEqual(childInstance.input, {});
    assert.deepStrictEqual({ ...childInstance.launcher }, { system: true });
  }

  @test
  async refusedChildClaimedElsewhere() {
    const child = this.child();
    const op: any = useInstanceStorage().operations[child.id];
    op.permission = "userId = 'bob'";
    delete op.permissionQuery;
    const claim = vi.spyOn(this.service as any, "claim").mockResolvedValueOnce(false);
    try {
      const parent = this.flow([task("p/child", child.id, { lit: { x: 1 } })]);
      const uuid = await this.launch(parent, {}, "alice");
      assert.strictEqual(claim.mock.calls.length, 1);
      // Another worker holds the row: it writes the refusal
      const [row] = await this.tasks(uuid);
      assert.strictEqual(row.status, "WAITING_CHILD");
      assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    } finally {
      claim.mockRestore();
      delete op.permission;
      delete op.permissionQuery;
    }
  }

  @test
  async childFlowAsPlainTaskRefused() {
    const child = this.child();
    const parent = this.flow([task("p/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]);
    const uuid = await this.launch(parent, {}, "alice");
    // A row calling the flow like an operation
    const row = await this.service["createTask"](
      uuid,
      { key: "p/x@", operation: child.id, input: {}, options: {} },
      "alice",
      Date.now(),
      1
    );
    assert.strictEqual(await this.service["tick"](), 1);
    const done = (await WorkflowTask.ref(row!.uuid).get()) as WorkflowTask;
    assert.strictEqual(done.status, "ERROR");
    assert.strictEqual(done.error!.code, "InvalidTask");
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
  }
}
