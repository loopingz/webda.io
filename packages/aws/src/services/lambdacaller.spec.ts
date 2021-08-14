import { WebdaTest } from "@webda/core/lib/test";
import { test, suite } from "@testdeck/mocha";
import * as assert from "assert";
import { LambdaCaller } from "./lambdacaller";
import * as AWSMock from "aws-sdk-mock";
import * as AWS from "aws-sdk";

@suite
class LambdaCallerTest extends WebdaTest {
  @test
  async call() {
    // CodeCoverage test
    const lambdaCaller = new LambdaCaller(this.webda, "plop", {arn: "testor"});
    // cov
    LambdaCaller.getModda();
    try {
      AWSMock.setSDKInstance(AWS);
      AWSMock.mock("Lambda", "invoke", (params: any, callback: any) => {
        return callback(null, {$response: { data: {plop: true}}});
      });
      lambdaCaller.resolve();
      assert.deepStrictEqual(await lambdaCaller.execute({}, false), {plop: true});
    } finally {
      AWSMock.restore();
    }
  }
}
