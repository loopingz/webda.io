import { InvokeCommand, Lambda } from "@aws-sdk/client-lambda";
import { JobInfo } from "@webda/async";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { LambdaCaller, LambdaCallerParameters } from "./lambdacaller.service.js";

const jobInfo: JobInfo = {
  JOB_ORCHESTRATOR: "async",
  JOB_ID: "webdaAsync",
  JOB_SECRET_KEY: "",
  JOB_HOOK: "http"
};

@suite
class LambdaCallerTest {
  @test
  async call() {
    const lambdaCaller = new LambdaCaller("plop", new LambdaCallerParameters().load({ arn: "testor" }));
    const mock = mockClient(Lambda);
    try {
      mock.on(InvokeCommand).resolves({
        Payload: <any>Buffer.from(JSON.stringify({ plop: true }))
      });
      lambdaCaller.resolve();
      assert.deepStrictEqual(await lambdaCaller.execute(), { plop: true });
      assert.deepStrictEqual(await lambdaCaller.execute({}, true, "myarn"), {
        plop: true
      });
      assert.strictEqual(mock.commandCalls(InvokeCommand)[0].args[0].input.FunctionName, "testor");
      assert.strictEqual(mock.commandCalls(InvokeCommand)[1].args[0].input.FunctionName, "myarn");
      assert.strictEqual(mock.commandCalls(InvokeCommand)[1].args[0].input.InvocationType, "Event");
      // Asynchronous invocation returns no payload
      mock.on(InvokeCommand).resolves({});
      assert.strictEqual(await lambdaCaller.execute({}, true), undefined);
    } finally {
      mock.restore();
    }
  }

  @test
  async launcher() {
    const caller = new LambdaCaller("plop", new LambdaCallerParameters().load({}));
    const calls = [];
    caller.execute = async (...args) => {
      calls.push(args);
    };
    await caller.launchAction(undefined, jobInfo);
    assert.deepStrictEqual(calls, [
      [
        {
          command: "launch",
          service: jobInfo.JOB_ORCHESTRATOR,
          method: "runAsyncOperationAction",
          args: [jobInfo],
          action: undefined,
          // We also put the value in JOB_INFO for other type of runner
          JOB_INFO: jobInfo
        },
        true
      ]
    ]);
  }
}
