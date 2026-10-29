// organize-imports-ignore
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import type { Stmt } from "./graph.js";
import { WorkflowSignal } from "./models/workflowsignal.model.js";
import { task, WorkflowTestBase } from "../test/fixture.js";

/**
 * A wait on ("approval", key) whose payload goes through FlowTest.Add
 * @param wait - extra Wait.ForEvent input
 * @param before - statements before the wait
 * @returns the body
 */
function approvalFlow(wait: any = {}, before: Stmt[] = []): Stmt[] {
  return [
    ...before,
    task("f/wait", "Wait.ForEvent", { obj: { name: { lit: "approval" }, key: { var: "order" }, ...wait } }, "approval"),
    task("f/add", "FlowTest.Add", { obj: { a: { get: [{ var: "approval" }, { lit: "n" }] }, b: { lit: 1 } } }, "sum"),
    { kind: "return", id: "f/ret", value: { var: "sum" } }
  ];
}

@suite
class SignalsTest extends WorkflowTestBase {
  /**
   * @returns the buffered signals
   */
  async buffered(): Promise<WorkflowSignal[]> {
    return (await WorkflowSignal.query("")).results as WorkflowSignal[];
  }

  @test
  async waitThenSignal() {
    const def = this.flow(approvalFlow(), ["order"]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    const [wait] = await this.tasks(uuid);
    assert.strictEqual(wait.status, "WAITING_EVENT");
    assert.strictEqual(wait.event, "approval");
    assert.strictEqual(wait.eventKey, "o1");
    // Nothing to claim while waiting
    assert.strictEqual(await this.drain(), 0);
    // Another key does not match: it is buffered
    assert.deepStrictEqual(await this.signal("alice", "approval", "o2", { n: 5 }), { delivered: 0 });
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 2 }), { delivered: 1 });
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 3);
    assert.deepStrictEqual(instance.journal["f/wait@"]["result"], { n: 2 });
    // Delivered once: a second signal is buffered
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 9 }), { delivered: 0 });
  }

  @test
  async signalBeforeWait() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow(approvalFlow({}, [task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]), [
      "order"
    ]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 4 }), { delivered: 0 });
    assert.strictEqual((await this.buffered()).length, 1);
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 5);
    assert.strictEqual((await this.buffered()).length, 0);
  }

  @test
  async signalBetweenWaitCreationAndBuffer() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow(approvalFlow({}, [task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]), [
      "order"
    ]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    vi.setSystemTime(1_000_000 + 3600_000);
    // The signal found no wait; before it is buffered the flow creates the wait and finds no buffered signal
    const original = this.service["bufferSignal"].bind(this.service);
    this.service["bufferSignal"] = async (...args: any[]) => {
      await this.drain();
      assert.strictEqual((await this.instance(uuid)).status, "WAITING");
      return original(...args);
    };
    try {
      assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 1 }), { delivered: 1 });
    } finally {
      delete this.service["bufferSignal"];
    }
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 2);
    assert.strictEqual((await this.buffered()).length, 0);
    assert.strictEqual(this.ops.calls.add, 1);
  }

  @test
  async waitTimeout() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow([
      {
        kind: "try",
        id: "f/try",
        body: [task("f/try/wait", "Wait.ForEvent", { lit: { name: "approval", key: "o1", timeout: "1h" } })],
        catchVar: "e",
        catch: [{ kind: "return", id: "f/try/ret", value: { var: "e" } }]
      }
    ]);
    const uuid = await this.launch(def, {}, "alice");
    vi.setSystemTime(1_000_000 + 3600_000 - 1);
    assert.strictEqual(await this.drain(), 0);
    vi.setSystemTime(1_000_000 + 3600_000);
    assert.strictEqual(await this.drain(), 1);
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output.code, "Timeout");
    assert.strictEqual(instance.output.operation, "Wait.ForEvent");
    // Too late
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", {}), { delivered: 0 });
  }

  @test
  async signalForbidden() {
    const def = this.flow(approvalFlow(), ["order"]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    await assert.rejects(() => this.signal("bob", "approval", "o1", { n: 1 }), /Forbidden|PermissionDenied/i);
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    assert.strictEqual((await this.buffered()).length, 0);
    // The system may signal
    assert.deepStrictEqual(await this.signal(undefined, "approval", "o1", { n: 1 }), { delivered: 1 });
  }

  @test
  async signalAllowList() {
    const def = this.flow(approvalFlow({ allow: { lit: ["carol"] } }), ["order"]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    assert.deepStrictEqual((await this.tasks(uuid))[0].allow, ["carol"]);
    await assert.rejects(() => this.signal("bob", "approval", "o1", { n: 1 }), /Forbidden|PermissionDenied/i);
    assert.deepStrictEqual(await this.signal("carol", "approval", "o1", { n: 1 }), { delivered: 1 });
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).output, 2);
  }

  @test
  async earlySignalCheckedAgainstWait() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow(approvalFlow({}, [task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]), [
      "order"
    ]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    // Bob may not signal alice's instance: his buffered signal is not consumed
    assert.deepStrictEqual(await this.signal("bob", "approval", "o1", { n: 1 }), { delivered: 0 });
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    assert.strictEqual((await this.buffered()).length, 1);
  }

  @test
  async concurrentSignals() {
    const def = this.flow(approvalFlow(), ["order"]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    const results = await Promise.all([
      this.signal("alice", "approval", "o1", { n: 1 }),
      this.signal("alice", "approval", "o1", { n: 2 })
    ]);
    assert.strictEqual(results[0].delivered + results[1].delivered, 1);
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(this.ops.calls.add, 1);
  }

  @test
  async bufferedSignalExpires() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    this.service.getParameters().signalTtl = "1h";
    const def = this.flow(approvalFlow({}, [task("f/sleep", "Workflow.Sleep", { lit: { duration: "2h" } })]), [
      "order"
    ]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 1 }), { delivered: 0 });
    vi.setSystemTime(1_000_000 + 2 * 3600_000);
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
  }
}
