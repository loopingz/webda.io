import { CoreModel, Operation, OperationContext, SimpleOperationContext, Store } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/test";
import { suite, test } from "@webda/test";
import assert from "assert";
import models, { AsyncAction, AsyncOperationAction, AsyncWebdaAction } from "../models";
import { Runner } from "./runner";
import ServiceRunner from "./servicerunner";

class FakeRunner extends Runner {
  launchAction(action: models): Promise<any> {
    throw new Error("Method not implemented.");
  }

  test(arg) {
    this.log("INFO", "FakeRunner test", arg);
    if (arg === 666) {
      throw new Error("Error");
    }
  }

  @Operation()
  operation(ctx) {
    this.log("INFO", "Logging test");
  }
}

@suite
class ServiceRunnerTest extends WebdaApplicationTest {
  @test
  async operationAction() {
    this.registerService(new FakeRunner(this.webda, "calledRunner"));
    this.webda.initStatics();
    const runner = new ServiceRunner(this.webda, "runner", { actions: ["plop"] });
    const ctx = new OperationContext(this.webda);
    const action = new AsyncOperationAction("calledRunner.testOp", ctx);
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(action);
    await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.getUuid(),
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
  }

  @test
  async cov() {
    this.registerService(new FakeRunner(this.webda, "calledRunner"));
    const runner = new ServiceRunner(this.webda, "runner", { actions: ["plop"] });
    const action = new AsyncWebdaAction();
    action.serviceName = "calledRunner";
    action.method = "test";
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(action);
    let serviceAction = await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.getUuid(),
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
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(action2);
    serviceAction = await runner.launchAction(action2, {
      JOB_HOOK: "",
      JOB_ID: action2.getUuid(),
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
          JOB_ID: action2.getUuid(),
          JOB_ORCHESTRATOR: "test",
          JOB_SECRET_KEY: ""
        }),
      /Can only handle AsyncWebdaAction or AsyncOperationAction got CoreModel/
    );

    const opAction = new AsyncOperationAction(
      "CalledRunner.Operation",
      new SimpleOperationContext(this.webda).setInput(Buffer.from("{}"))
    );
    this.webda.initStatics();
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(opAction);
    serviceAction = await runner.launchAction(opAction, {
      JOB_HOOK: "",
      JOB_ID: opAction.getUuid(),
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
