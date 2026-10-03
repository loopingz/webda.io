import { CoreModel, Operation, OperationContext, registerOperation, SimpleOperationContext } from "@webda/core";
import { suite, test } from "@webda/test";
import assert from "assert";
import { AsyncTest } from "../../test/fixture.js";
import { AsyncOperationAction, AsyncWebdaAction } from "../asyncaction.model.js";
import { Runner, RunnerParameters } from "./runner.service.js";
import { ServiceRunner, ServiceRunnerParameters } from "./servicerunner.service.js";

/**
 * Runner used as the target of the actions
 */
class FakeRunner extends Runner {
  /**
   * @returns never
   */
  launchAction(): Promise<any> {
    throw new Error("Method not implemented.");
  }

  /**
   * Log and fail on 666
   * @param arg - the argument
   */
  test(arg) {
    this.log("INFO", "FakeRunner test", arg);
    if (arg === 666) {
      throw new Error("Error");
    }
  }

  /**
   * Operation logging
   */
  @Operation()
  operation() {
    this.log("INFO", "Logging test");
  }
}

@suite
class ServiceRunnerTest extends AsyncTest {
  runner: ServiceRunner;

  /**
   * Register the called runner and its operation
   */
  async beforeEach() {
    await super.beforeEach();
    this.registerService(new FakeRunner("calledRunner", new RunnerParameters().load({})));
    registerOperation("CalledRunner.Operation", { service: "calledRunner", method: "operation" });
    this.runner = new ServiceRunner("runner", new ServiceRunnerParameters().load({ actions: ["plop"] }));
  }

  @test
  async operationAction() {
    const runner = this.runner;
    const ctx = new OperationContext();
    const action = new AsyncOperationAction("calledRunner.testOp", ctx);
    await action.save();
    const res = await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    await res.promise;
    await action.refresh();
    // Unknown operation
    assert.strictEqual(action.status, "ERROR");
  }

  @test
  async cov() {
    const runner = this.runner;
    const action = new AsyncWebdaAction();
    action.serviceName = "calledRunner";
    action.method = "test";
    await action.save();
    let serviceAction = await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    await serviceAction.promise;
    await action.refresh();
    assert.strictEqual(action.logs?.length, 1);
    assert.ok(action.logs[0].endsWith(" [ INFO] [calledRunner] FakeRunner test undefined"));
    const action2 = new AsyncWebdaAction();
    action2.serviceName = "calledRunner";
    action2.method = "test";
    action2.arguments = [666];
    await action2.save();
    serviceAction = await runner.launchAction(action2, {
      JOB_HOOK: "",
      JOB_ID: action2.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    await serviceAction.promise;
    await action2.refresh();
    assert.strictEqual(action2.status, "ERROR");
    assert.strictEqual(action2.logs?.length, 1);
    assert.ok(action2.logs[0].endsWith(" [ INFO] [calledRunner] FakeRunner test 666"));
    action.type = "plop";
    await assert.rejects(
      () =>
        runner.launchAction(<any>new CoreModel(), {
          JOB_HOOK: "",
          JOB_ID: action2.uuid,
          JOB_ORCHESTRATOR: "test",
          JOB_SECRET_KEY: ""
        }),
      /Can only handle AsyncWebdaAction or AsyncOperationAction got CoreModel/
    );

    const opAction = new AsyncOperationAction(
      "CalledRunner.Operation",
      new SimpleOperationContext().setInput(Buffer.from("{}"))
    );
    await opAction.save();
    serviceAction = await runner.launchAction(opAction, {
      JOB_HOOK: "",
      JOB_ID: opAction.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    await serviceAction.promise;
    await opAction.refresh();
    assert.strictEqual(opAction.status, "SUCCESS");
    assert.strictEqual(opAction.logs?.length, 1);
    assert.ok(opAction.logs[0].endsWith(" [ INFO] [calledRunner] Logging test"));
  }
}
