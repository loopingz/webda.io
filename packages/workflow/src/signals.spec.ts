// organize-imports-ignore
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { vi } from "vitest";
import type { Stmt } from "./graph.js";
import { callOperation, Session, SimpleOperationContext } from "@webda/core";
import { WorkflowInstance } from "./models/workflowinstance.model.js";
import { NO_TIMEOUT } from "./workflow.service.js";
import { WorkflowSignal } from "./models/workflowsignal.model.js";
import { WorkflowTask } from "./models/workflowtask.model.js";
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
    // Answered like "nothing waits", and not buffered: a caller cannot probe the pending waits
    assert.deepStrictEqual(await this.signal("bob", "approval", "o1", { n: 1 }), { delivered: 0 });
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
    assert.deepStrictEqual(await this.signal("bob", "approval", "o1", { n: 1 }), { delivered: 0 });
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

  @test
  async anonymousSignalRefused() {
    const ctx = new SimpleOperationContext();
    ctx.setSession(new Session());
    ctx.setInput(Buffer.from(JSON.stringify({ event: "approval", key: "o1", payload: {} })));
    await ctx.init();
    await assert.rejects(() => callOperation(ctx, "Workflow.Signal"), /Unauthorized|authenticated/i);
    assert.strictEqual((await this.buffered()).length, 0);
  }

  @test
  async signalLimits() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    this.service.getParameters().maxSignalPayload = 100;
    await assert.rejects(() => this.signal("alice", "approval", "o1", { text: "x".repeat(200) }), /payload/i);
    this.service.getParameters().maxBufferedSignals = 2;
    this.service.getParameters().signalTtl = "1h";
    await this.signal("alice", "approval", "o1", { n: 1 });
    await this.signal("bob", "approval", "o1", { n: 2 });
    // The new signal is refused, the buffered ones are kept
    await assert.rejects(() => this.signal("alice", "approval", "o1", { n: 3 }), /Too many|TooManyRequests/i);
    assert.strictEqual((await this.buffered()).length, 2);
    // Another key has its own budget
    await this.signal("alice", "approval", "o2", { n: 1 });
    // Expired signals do not count, and the sweep purges them
    vi.setSystemTime(1_000_000 + 2 * 3600_000);
    await this.signal("alice", "approval", "o1", { n: 4 });
    await this.service["sweep"]();
    assert.deepStrictEqual(
      (await this.buffered()).map(s => s.payload.n),
      [4]
    );
  }

  /**
   * A wait on ("approval", "o1") with a 1h timeout, its task row as first read, and a buffered signal for it
   * @returns the instance uuid, the stale wait row and the signal
   */
  async staleWait(): Promise<{ uuid: string; wait: WorkflowTask }> {
    const def = this.flow(approvalFlow({ timeout: { lit: "1h" } }), ["order"]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    const [wait] = await this.tasks(uuid);
    return { uuid, wait };
  }

  /**
   * Buffer a signal from alice directly
   * @returns the signal
   */
  async bufferedFromAlice(): Promise<WorkflowSignal> {
    return (await WorkflowSignal.create({
      event: "approval",
      key: "o1",
      payload: { n: 7 },
      senderId: "alice",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400_000
    } as any)) as WorkflowSignal;
  }

  @test
  async bufferedSignalKeptWhenTimeoutWins() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const { uuid, wait } = await this.staleWait();
    // The timeout claims the wait first
    vi.setSystemTime(1_000_000 + 3600_000);
    await this.drain();
    assert.strictEqual((await this.instance(uuid)).status, "ERROR");
    const signal = await this.bufferedFromAlice();
    const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
    assert.strictEqual(await this.service["consumeSignal"](signal, instance, wait, true), false);
    assert.strictEqual((await this.buffered()).length, 1);
  }

  @test
  async bufferedSignalKeptWhenAnotherSignalWins() {
    const { uuid, wait } = await this.staleWait();
    const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 1 }), { delivered: 1 });
    const signal = await this.bufferedFromAlice();
    assert.strictEqual(await this.service["consumeSignal"](signal, instance, wait, true), false);
    assert.deepStrictEqual(
      (await this.buffered()).map(s => s.payload),
      [{ n: 7 }]
    );
  }

  @test
  async bufferedSignalsConsumedOldestFirst() {
    const def = this.flow(approvalFlow(), ["order"]);
    // From the system, then from alice, before any wait
    assert.deepStrictEqual(await this.signal(undefined, "approval", "o1", { n: 10 }), { delivered: 0 });
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 1 }), { delivered: 0 });
    const [system] = await this.buffered();
    assert.strictEqual(system.system, true);
    assert.strictEqual(system.senderId, undefined);
    // Without payload
    assert.deepStrictEqual(await this.signal("alice", "approval", "o9"), { delivered: 0 });
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    await this.drain();
    const instance = await this.instance(uuid);
    assert.strictEqual(instance.status, "SUCCESS");
    assert.strictEqual(instance.output, 11);
    assert.deepStrictEqual(
      (await this.buffered()).map(s => [s.key, s.payload]),
      [
        ["o1", { n: 1 }],
        ["o9", undefined]
      ]
    );
  }

  @test
  async waitOfInactiveInstanceIgnored() {
    const { uuid } = await this.staleWait();
    await WorkflowInstance.ref(uuid).patch({ status: "CANCELLED" } as any);
    assert.deepStrictEqual(await this.signal("alice", "approval", "o1", { n: 1 }), { delivered: 0 });
    assert.strictEqual((await this.buffered()).length, 1);
  }

  @test
  async staleSignalsNotConsumed() {
    const { uuid, wait } = await this.staleWait();
    const instance = (await WorkflowInstance.ref(uuid).get()) as WorkflowInstance;
    // Expired between the query and the consumption
    const expired = (await WorkflowSignal.create({
      event: "approval",
      key: "o1",
      payload: {},
      senderId: "alice",
      createdAt: Date.now() - 2,
      expiresAt: Date.now() - 1
    } as any)) as WorkflowSignal;
    assert.strictEqual(await this.service["consumeSignal"](expired, instance, wait, true), false);
    // Consumed by another worker meanwhile
    const gone = await this.bufferedFromAlice();
    await WorkflowSignal.ref(gone.uuid).delete();
    assert.strictEqual(await this.service["consumeSignal"](gone, instance, wait, true), false);
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
  }

  @test
  async earlySignalOfRefusedSenderNotDelivered() {
    vi.useFakeTimers({ toFake: ["Date"], now: 1_000_000 });
    const def = this.flow(approvalFlow({}, [task("f/sleep", "Workflow.Sleep", { lit: { duration: "1h" } })]), [
      "order"
    ]);
    const uuid = await this.launch(def, { order: "o1" }, "alice");
    vi.setSystemTime(1_000_000 + 3600_000);
    // The wait appears while bob's signal is buffered: he may not signal it
    const original = this.service["bufferSignal"].bind(this.service);
    this.service["bufferSignal"] = async (...args: any[]) => {
      await this.drain();
      return original(...args);
    };
    try {
      assert.deepStrictEqual(await this.signal("bob", "approval", "o1", { n: 1 }), { delivered: 0 });
    } finally {
      delete this.service["bufferSignal"];
    }
    assert.strictEqual((await this.instance(uuid)).status, "WAITING");
    assert.strictEqual((await this.buffered()).length, 1);
  }

  @test
  async waitWithoutInput() {
    const def = this.flow([task("f/wait", "Wait.ForEvent", { lit: null })]);
    const uuid = await this.launch(def, {}, "alice");
    const [wait] = await this.tasks(uuid);
    assert.strictEqual(wait.status, "WAITING_EVENT");
    assert.strictEqual(wait.event, "undefined");
    assert.strictEqual(wait.runAt, NO_TIMEOUT);
  }
}
