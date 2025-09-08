import * as assert from "assert";
import { State } from "./state";
import { suite, test } from "@webda/test";

const MyState: typeof State<"running" | "initializing" | "resolved" | "resolving" | "errored"> = State;

class StateService {
    @MyState({ start: "resolving", end: "resolved" })
    resolve() {
        assert.strictEqual(this.getState(), "resolving");
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

@suite
class StatesTest {
    @test
    async testStateTransition() {
        // Test the state transition
        const service = new StateService();
        assert.strictEqual(service.getState(), "initial");
        service.resolve();
        assert.strictEqual(service.getState(), "resolved");
        await service.init();
        assert.strictEqual(service.getState(), "running");
        await assert.rejects(async () => service.init2());
        assert.strictEqual(service.getState(), "errored");
    }
}
