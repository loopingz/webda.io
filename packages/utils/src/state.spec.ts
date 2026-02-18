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

  @test
  async testSyncErrorHandling() {
    // Test synchronous error (covers lines 35-37)
    class ErrorService {
      @MyState({ start: "running", error: "errored" })
      syncMethod() {
        throw new Error("Sync error");
      }

      getState() {
        return MyState.getCurrentState(this);
      }
    }

    const service = new ErrorService();
    assert.throws(() => service.syncMethod(), /Sync error/);
    assert.strictEqual(service.getState(), "errored");
  }

  @test
  async testNoStartState() {
    // Test decorator without start state (covers lines 62-63)
    class NoStartService {
      @MyState({ end: "completed" })
      process() {
        assert.strictEqual(this.getState(), "initial");
      }

      getState() {
        return MyState.getCurrentState(this);
      }
    }

    const service = new NoStartService();
    assert.strictEqual(service.getState(), "initial");
    service.process();
    assert.strictEqual(service.getState(), "completed");
  }

  @test
  async testDoubleWrapPrevention() {
    // Test that already-wrapped methods don't get wrapped again (covers lines 49-50)
    // This happens when both parent and child classes apply the decorator to the same method
    class ParentService {
      @MyState({ start: "processing", end: "done" })
      method() {
        return "parent";
      }

      getState() {
        return MyState.getCurrentState(this);
      }
    }

    class ChildService extends ParentService {
      @MyState({ start: "childProcessing", end: "childDone" })
      method() {
        return "child";
      }
    }

    // When ChildService is instantiated, both decorators' initializers run
    // The second one should detect WRAPPED_FLAG and skip wrapping
    const service = new ChildService();
    const result = service.method();
    assert.strictEqual(result, "child");
    assert.ok(["childDone", "done"].includes(service.getState()), `State should be childDone or done, got ${service.getState()}`);
  }
}
