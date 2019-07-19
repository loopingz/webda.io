import { WebdaTest } from "webda/lib/test";
import { GetAWS } from "./index";
import * as assert from "assert";
import { CloudWatchLogger } from "./cloudwatchlogger";
import { test, suite } from "mocha-typescript";

@suite
class CloudWatchLoggerTest extends WebdaTest {
  service: CloudWatchLogger;

  getTestConfiguration() {
    return process.cwd() + "/test/config-cloudwatch.json";
  }

  async before() {
    let cloudwatch = new (GetAWS({})).CloudWatchLogs();
    try {
      await cloudwatch
        .deleteLogGroup({
          logGroupName: "webda-test"
        })
        .promise();
      // We have to wait for the secret to go away
      await this.sleep(15000);
    } catch (err) {
      // Skip bad delete
    }
    await super.before();
    this.service = <CloudWatchLogger>this.getService("CloudWatchLogger");
    assert.notEqual(this.service, undefined);
  }

  @test
  async basic() {
    this.webda.log("TEST", "Plop 0", "Test");
    this.webda.log("TEST2", "Plop 1", "Test");
    this.webda.log("TEST2", "Plop 2", "Test");
    this.webda.log("TEST2", "Plop 3", "Test");
    this.webda.log("TEST2", "Plop 4", "Test");
    await this.webda.emitSync("Webda.Result");
    let res = await this.service._cloudwatch
      .describeLogStreams({
        logGroupName: "webda-test"
      })
      .promise();
    assert.equal(res.logStreams.length, 1);
    assert.notEqual(res.logStreams[0].lastEventTimestamp, undefined);
  }

  @test
  async secondRun() {
    // Update config to use the stepper
    this.service._params.singlePush = true;
    this.webda.log("TEST", "Plop 0", "Test");
    this.webda.log("TEST2", "Plop 1", "Test");
    await this.sleep(1000);
    let res = await this.service._cloudwatch
      .describeLogStreams({
        logGroupName: "webda-test"
      })
      .promise();
    assert.equal(res.logStreams.length, 1);
    assert.notEqual(res.logStreams[0].lastEventTimestamp, undefined);
    this.webda.log("TEST2", "Plop 2", "Test");
    this.webda.log("TEST2", "Plop 3", "Test");
    this.webda.log("TEST2", "Plop 4", "Test");
    await this.webda.emitSync("Webda.Result");
    res = await this.service._cloudwatch
      .describeLogStreams({
        logGroupName: "webda-test"
      })
      .promise();
    assert.equal(res.logStreams.length, 1);
  }
}
