import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Throttler } from "./throttler";

@suite
class ThrottlerTest {
  @test
  async failFast() {
    const t = new Throttler(2, true);
    const p = t.queue(() => new Promise<void>((_, reject) => reject(new Error("Fail"))));
    await assert.rejects(() => t.wait(), /Fail/);
    await assert.rejects(() => p, /Fail/);
    await assert.rejects(() => t.execute(async () => {}), /Throttler has failed/);
    await assert.rejects(() => t.wait(), /Fail/);
  }

  @test
  async test() {
    // Fake promises
    const resolvers: (() => void)[] = [];
    const t = new Throttler(2, false);
    const statePromises: Promise<any>[] = [];

    // Queueing 7 promises
    statePromises.push(t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P1"));
    statePromises.push(t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P2"));
    statePromises.push(t.execute(() => new Promise<void>(resolve => resolvers.push(resolve)), "P3"));
    statePromises.push(t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P4"));
    statePromises.push(t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P5"));
    const errorPromise = t.queue(
      [
        () => new Promise<void>((_, reject) => resolvers.push(() => reject("P6"))),
        () => new Promise<void>(resolve => resolvers.push(resolve))
      ],
      "P6"
    );
    statePromises.push(t.queue(() => new Promise<void>(resolve => resolvers.push(resolve)), "P7"));
    assert.strictEqual(t.getSize(), 8);
    // Resolving 1 promise
    resolvers.shift()!();
    // We should still see 2 in progress
    assert.strictEqual(t.getInProgress().length, 2);
    // Set concurrency to 1 and resolve the next promise
    t.setConcurrency(1);
    resolvers.shift()!();
    await new Promise(resolve => setImmediate(resolve));
    // We should now only have 1 in progress
    const curs = t.getInProgress();
    assert.strictEqual(curs.length, 1, `Currents ${curs}`);
    // Increase concurrency to 3 should launch 2 more
    t.setConcurrency(3);
    assert.strictEqual(t.getInProgress().length, 3);
    // We are rejecting P6 on purpose
    const p = t.wait();
    // Trigger all resolvers
    resolvers.forEach(r => r());
    await new Promise(resolve => setImmediate(resolve));
    resolvers.forEach(r => r());
    //await assert.rejects(() => p, /P6/);
    await Promise.all(statePromises);
    await assert.rejects(() => errorPromise, /P6/);
    // We should have 0 in progress so return quickly
    await t.wait();
  }

  @test
  async staticMethod() {
    await Throttler.run(<any>[async () => {}], 2);
  }

  @test
  async testToString() {
    const t = new Throttler(1);
    let resolver1: () => void;
    let resolver2: () => void;

    // Queue two promises with explicit resolvers
    const p1 = t.queue(() => new Promise<void>(resolve => { resolver1 = resolve; }), "Task1");
    const p2 = t.queue(() => new Promise<void>(resolve => { resolver2 = resolve; }), "Task2");

    // Wait for first task to start executing
    await new Promise(resolve => setImmediate(resolve));

    // Get all items (both in-progress and queued)
    const allItems = t.getInProgress();
    assert.ok(allItems.length >= 1, "Should have at least one item");

    // First item should be IN-PROGRESS
    const inProgressString = allItems[0].toString();
    assert.ok(inProgressString.includes("Task1"), "Should contain task name");
    assert.ok(inProgressString.includes("IN-PROGRESS"), "Should show IN-PROGRESS status");

    // Get the full queue to check queued items
    const queueSize = t.getSize();
    assert.ok(queueSize >= 2, "Should have 2 items in queue");

    // Resolve all promises
    resolver1!();
    await new Promise(resolve => setImmediate(resolve));
    resolver2!();

    await Promise.all([p1, p2]);
  }
}
