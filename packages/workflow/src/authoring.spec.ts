import { suite, test } from "@webda/test";
import * as assert from "assert";
import { Cron, Random, Sleep, Wait, Workflow } from "./authoring.js";

/** Flows of the spec: the class definition itself must load. */
class SpecFlows extends Workflow {
  /**
   * A flow
   * @param full - unused
   * @returns nothing
   */
  @Cron("0 3 * * *", "Nightly", { full: false })
  async run(full: boolean) {
    return full;
  }
}

@suite
class AuthoringTest {
  @test
  flowClassNeverRuns() {
    assert.throws(() => new SpecFlows(), /Flows run through WorkflowService/);
  }

  @test
  stubsThrow() {
    const stubs: (() => unknown)[] = [
      () => Workflow.Parallel([1], async item => item),
      () => Workflow.Start(async (_input: { a: number }) => 1, { a: 1 }),
      () => Workflow.Call("Order.Query", {}),
      () => Sleep("1s"),
      () => Wait.ForEvent("approval", { key: "k" }),
      () => Random.Number(),
      () => Random.Uuid()
    ];
    for (const stub of stubs) {
      assert.throws(stub, /Flows run through WorkflowService/);
    }
  }
}
