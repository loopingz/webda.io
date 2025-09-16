import * as assert from "assert";
import { State } from "./state";
import { suite, test } from "@webda/test";

const MyState: typeof State<"running" | "initializing" | "resolved" | "resolving" | "errored"> = State;

class StateService {
  id: number = 0;
  @MyState({ start: "resolving", end: "resolved" })
  resolve() {
    assert.strictEqual(this.getState(), "resolving");
    this.id = 1;
  }

  @MyState({ start: "initializing", end: "running" })
  async init() {
    // Initialization logic
    assert.strictEqual(this.getState(), "initializing");
  }

  @MyState({ start: "initializing", error: "errored", end: "running" })
  async init2() {
    throw new Error("Not implemented");
  }

  getState() {
    return MyState.getCurrentState(this);
  }
}

class StateService2 extends StateService {
  resolve() {
    super.resolve();
    // status should still be resolving
    assert.strictEqual(this.getState(), "resolving");
    this.id = 2;
  }
}

@suite
class StatesTest {
  @test
  async testStateTransition() {
    console.log("Testing StateService");
    // Test the state transition
    const service = new StateService();
    assert.strictEqual(service.getState(), "initial");
    service.resolve();
    assert.strictEqual(service.getState(), "resolved");
    await service.init();
    assert.strictEqual(service.getState(), "running");
    await assert.rejects(async () => service.init2());
    assert.strictEqual(service.getState(), "errored");
    // Ensure the right method is called if overridden
    console.log("Testing StateService2");
    const service2 = new StateService2();
    assert.strictEqual(service2.getState(), "initial");
    service2.resolve();
    assert.strictEqual(service2.getState(), "resolved");
    assert.strictEqual(service2.id, 2);
  }
}
