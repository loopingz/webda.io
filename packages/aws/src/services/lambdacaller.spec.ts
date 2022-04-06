import { WebdaTest } from "@webda/core/lib/test";
import { test, suite } from "@testdeck/mocha";
import * as assert from "assert";
import { LambdaCaller } from "./lambdacaller";
import * as sinon from "sinon";
import { JobInfo } from "@webda/async";
import { mockClient } from "aws-sdk-client-mock";
import { InvokeCommand, Lambda } from "@aws-sdk/client-lambda";

const jobInfo: JobInfo = {
  JOB_ORCHESTRATOR: "async",
  JOB_ID: "webdaAsync",
  JOB_SECRET_KEY: "",
  JOB_HOOK: "http"
};
@suite
class LambdaCallerTest extends WebdaTest {
  @test
  async call() {
    // CodeCoverage test
    const lambdaCaller = new LambdaCaller(this.webda, "plop", { arn: "testor" });
    const mock = mockClient(Lambda)
      .on(InvokeCommand)
      .resolves({
        Payload: Buffer.from(JSON.stringify({ plop: true }))
      });
    try {
      lambdaCaller.resolve();
      assert.deepStrictEqual(await lambdaCaller.execute(), { plop: true });
      assert.deepStrictEqual(await lambdaCaller.execute({}, true, "myarn"), { plop: true });
    } finally {
      mock.restore();
    }
  }

  @test
  async launcher() {
    const caller = new LambdaCaller(this.webda, "plop", {});
    let stub = sinon.stub(caller, "execute").resolves();
    caller.launchAction(undefined, jobInfo);
    assert.ok(stub.callCount === 1);
    assert.deepStrictEqual(stub.getCall(0).args, [
      {
        command: "launch",
        service: jobInfo.JOB_ORCHESTRATOR,
        method: "runWebdaAsyncAction",
        args: [jobInfo],
        // We also put the value in JOB_INFO for other type of runner
        JOB_INFO: jobInfo
      },
      true
    ]);
  }
}
