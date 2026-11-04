import {
  CoreModel,
  Operation,
  OperationContext,
  registerOperation,
  SimpleOperationContext,
  useContext,
  useSystem
} from "@webda/core";
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

  /** Callers of {@link guarded} */
  guardedCalls: { user: string; full: boolean }[] = [];

  /**
   * Operation restricted by a permission query
   * @param full - the input
   */
  guarded(full: boolean) {
    this.guardedCalls.push({ user: useContext().getCurrentUserId(), full });
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
    registerOperation("CalledRunner.Guarded", {
      service: "calledRunner",
      method: "guarded",
      permission: "userId = 'admin'"
    });
    this.runner = new ServiceRunner("runner", new ServiceRunnerParameters().load({ actions: ["plop"] }));
  }

  @test
  async rejectsIncompleteActions() {
    const cases = [
      [new AsyncWebdaAction(), "Action service and method are required"],
      [new AsyncWebdaAction("calledRunner"), "Action service and method are required"],
      [new AsyncWebdaAction("missing", "test"), "Service missing was not found"],
      [new AsyncOperationAction(), "Operation id is required"]
    ] as const;
    for (const [action, message] of cases) {
      await action.save();
      const launched = await this.runner.launchAction(action, {
        JOB_HOOK: "",
        JOB_ID: action.uuid,
        JOB_ORCHESTRATOR: "test",
        JOB_SECRET_KEY: ""
      });
      await launched.promise;
      await action.refresh();
      assert.strictEqual(action.status, "ERROR");
      assert.strictEqual(action.errorMessage, message);
    }
  }

  @test
  async queuedSystemAction() {
    // A cron launches its operation as the system: the action goes through the store (and a queue) before running
    const created = new AsyncOperationAction("CalledRunner.Guarded", useSystem({ full: true }));
    assert.strictEqual(created.system, true);
    await created.save();
    const action = await AsyncOperationAction.ref(created.uuid).get();
    assert.ok(!(action.context instanceof OperationContext));
    const launched = await this.runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.uuid,
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    await launched.promise;
    await action.refresh();
    assert.strictEqual(action.status, "SUCCESS", action.errorMessage);
    const called = <FakeRunner>this.webda.getServices()["calledRunner"];
    // No input schema registered: the operation receives the raw input
    assert.deepStrictEqual(
      called.guardedCalls.map(c => c.user),
      ["system"]
    );
    // An anonymous action of the same operation is refused
    const anonymous = new AsyncOperationAction("CalledRunner.Guarded", new SimpleOperationContext());
    assert.strictEqual(anonymous.system, false);
    await anonymous.save();
    const reloaded = await AsyncOperationAction.ref(anonymous.uuid).get();
    await (
      await this.runner.launchAction(reloaded, {
        JOB_HOOK: "",
        JOB_ID: reloaded.uuid,
        JOB_ORCHESTRATOR: "test",
        JOB_SECRET_KEY: ""
      })
    ).promise;
    await reloaded.refresh();
    assert.strictEqual(reloaded.status, "ERROR");
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
    action.arguments = undefined;
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
