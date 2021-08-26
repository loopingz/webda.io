import { WebdaTest } from "@webda/core/lib/test";
import { test, suite } from "@testdeck/mocha";
import * as assert from "assert";
import { LambdaAsyncJobEvent, LambdaCaller } from "./lambdacaller";
import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";
import LambdaServer from "./lambdaserver";
import { Application } from "@webda/core";
import * as sinon from "sinon";
import { JobInfo } from "@webda/async";

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
    // cov
    LambdaCaller.getModda();
    try {
      AWSMock.setSDKInstance(AWS);
      AWSMock.mock("Lambda", "invoke", (params: any, callback: any) => {
        return callback(null, { $response: { data: { plop: true } } });
      });
      lambdaCaller.resolve();
      assert.deepStrictEqual(await lambdaCaller.execute(), { plop: true });
      assert.deepStrictEqual(await lambdaCaller.execute({}, true, "myarn"), { plop: true });
    } finally {
      AWSMock.restore();
    }
  }

  @test
  registerEvent() {
    let webda = new LambdaServer(new Application(this.getTestConfiguration()));
    const caller = new LambdaCaller(webda, "plop", {});
    let stub = sinon.stub(webda, "registerAWSEventsHandler");
    caller.resolve();
    assert.strictEqual(stub.callCount, 1);
    assert.ok(!caller.isAWSEventHandled("plop", []));
    assert.ok(caller.isAWSEventHandled(LambdaCaller.EventSource, []));
  }

  @test
  async runner() {
    let called = null;
    // Test the runner side
    this.registerService("async", {
      // @ts-ignore
      runWebdaAsyncAction: info => {
        called = info;
      }
    });
    const caller = new LambdaCaller(this.webda, "plop", {});
    await caller.handleAWSEvent(LambdaCaller.EventSource, {
      Records: [
        <LambdaAsyncJobEvent>{
          eventSource: LambdaCaller.EventSource,
          jobInfo
        }
      ]
    });
    assert.deepStrictEqual(called, jobInfo);
  }

  @test
  async launcher() {
    const caller = new LambdaCaller(this.webda, "plop", {});
    let stub = sinon.stub(caller, "execute").callsFake(() => {});
    caller.launchAction(undefined, jobInfo);
    assert.ok(stub.callCount === 1);
    assert.deepStrictEqual(stub.getCall(0).args, [
      { events: { Records: [{ eventSource: LambdaCaller.EventSource, jobInfo }] } },
      true
    ]);
  }
}
