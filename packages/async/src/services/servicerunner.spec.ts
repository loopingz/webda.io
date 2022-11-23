import { suite, test } from "@testdeck/mocha";
import { Store } from "@webda/core";
import { WebdaTest } from "@webda/core/lib/test";
import models, { AsyncAction, WebdaAsyncAction } from "../models";
import { Runner } from "./runner";
import ServiceRunner from "./servicerunner";

class FakeRunner extends Runner {
  launchAction(action: models): Promise<any> {
    throw new Error("Method not implemented.");
  }

  test(arg) {
    if (arg === 666) {
      throw new Error("Error");
    }
  }
}

@suite
class ServiceRunnerTest extends WebdaTest {
  @test
  async cov() {
    this.registerService(new FakeRunner(this.webda, "calledRunner"));
    let runner = new ServiceRunner(this.webda, "runner", { actions: ["plop"] });
    const action = new WebdaAsyncAction();
    action.serviceName = "calledRunner";
    action.method = "test";
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(action);
    await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action.getUuid(),
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
    const action2 = new WebdaAsyncAction();
    action2.serviceName = "calledRunner";
    action2.method = "test";
    action2.arguments = [666];
    await this.getService<Store<AsyncAction>>("AsyncJobs").save(action2);
    await runner.launchAction(action, {
      JOB_HOOK: "",
      JOB_ID: action2.getUuid(),
      JOB_ORCHESTRATOR: "test",
      JOB_SECRET_KEY: ""
    });
  }
}
