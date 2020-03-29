import * as assert from "assert";
import { suite, test } from "mocha-typescript";
import { WebdaAwsTest } from "../index.spec";
import { LambdaCaller } from "./lambdacaller";

@suite
class LambdaCallerTest extends WebdaAwsTest {
  @test
  async call() {
    // CodeCoverage test
    const lamdaCaller = new LambdaCaller("plop", {});
    assert.throws(() => new LambdaCaller());
    new LambdaCaller("arn", {
      accessKeyId: "PLOP"
    });
    // @ts-ignore
    await this.assertThrowsAsync(lamdaCaller.execute.bind(LambdaCaller, undefined, true));
  }
}
