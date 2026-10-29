// organize-imports-ignore
import { suite, test } from "@webda/test";
import * as assert from "assert";
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
}
