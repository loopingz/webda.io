import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { emitCoreEvent, useLog } from "@webda/core";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { localstackParams, WebdaAwsTest } from "../../test/fixture.js";
import { CloudWatchLogger, CloudWatchLoggerParameters } from "./cloudwatchlogger.service.js";

@suite
class CloudWatchLoggerTest extends WebdaAwsTest {
  service: CloudWatchLogger;

  async beforeEach() {
    await super.beforeEach();
    const cloudwatch = new CloudWatchLogs(localstackParams);
    try {
      await cloudwatch.deleteLogGroup({
        logGroupName: "webda-test"
      });
    } catch (err) {
      // Skip bad delete
    }
    this.service = this.registerService(
      new CloudWatchLogger(
        "CloudWatchLogger",
        new CloudWatchLoggerParameters().load({
          logGroupName: "webda-test",
          logStreamNamePrefix: "test-",
          logLevel: "DEBUG",
          endpoint: localstackParams.endpoint
        })
      )
    ).resolve();
    await this.service.init();
  }

  async afterEach() {
    await this.service?.stop();
    await super.afterEach();
  }

  /**
   * Wait for the pending log sending
   * @param check - condition to wait for
   */
  async waitFor(check: () => Promise<boolean>) {
    for (let i = 0; i < 50; i++) {
      if (await check()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error("Timeout");
  }

  @test
  async basic() {
    useLog("INFO", "Plop 0", "Test");
    useLog("DEBUG", "Plop 1", "Test");
    useLog("TRACE", "Plop filtered", "Test");
    assert.strictEqual(this.service._bufferedLogs.length, 2);
    emitCoreEvent("Webda.Result", { context: undefined });
    await this.waitFor(async () => {
      const res = await this.service._cloudwatch.describeLogStreams({
        logGroupName: "webda-test"
      });
      return res.logStreams.length === 1 && res.logStreams[0].lastEventTimestamp !== undefined;
    });
    assert.strictEqual(this.service._bufferedLogs.length, 0);
    this.service.getParameters().logGroupName = undefined;
    await assert.rejects(() => this.service.init(), /Require a log group `logGroupName` parameter/);
    this.service.getParameters().logGroupName = "webda-test";
  }

  @test
  aws() {
    assert.deepStrictEqual(this.service.getARNPolicy("plop"), {
      Action: ["logs:*"],
      Effect: "Allow",
      Resource: [
        "arn:aws:logs:us-east-1:plop:log-group:webda-test",
        "arn:aws:logs:us-east-1:plop:log-group:webda-test:*:*"
      ],
      Sid: "CloudWatchLoggerCloudWatchLogger"
    });
    assert.deepStrictEqual(this.service.getCloudFormation(), {
      CloudWatchLoggerLogGroup: {
        Properties: {
          LogGroupName: "webda-test"
        },
        Type: "AWS::Logs::LogGroup"
      }
    });
    this.service.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(this.service.getCloudFormation(), {});
  }

  @test
  async singlePush() {
    // Update config to send each line
    this.service.getParameters().singlePush = true;
    useLog("INFO", "Plop 0", "Test");
    useLog("DEBUG", "Plop 1", "Test");
    await this.waitFor(async () => {
      const res = await this.service._cloudwatch.describeLogStreams({
        logGroupName: "webda-test"
      });
      return res.logStreams.length === 1 && res.logStreams[0].lastEventTimestamp !== undefined;
    });
    assert.strictEqual(this.service._bufferedLogs.length, 0);
  }
}
