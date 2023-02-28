import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { suite, test } from "@testdeck/mocha";
import * as assert from "assert";
import { checkLocalStack, defaultCreds, WebdaAwsTest } from "../index.spec";
import { CloudWatchLogger } from "./cloudwatchlogger";

@suite
class CloudWatchLoggerTest extends WebdaAwsTest {
  service: CloudWatchLogger;

  getTestConfiguration() {
    return process.cwd() + "/test/config-cloudwatch.json";
  }

  async before() {
    await checkLocalStack();
    let cloudwatch = new CloudWatchLogs({
      credentials: defaultCreds,
      endpoint: "http://localhost:4566",
      region: "us-east-1",
    });
    try {
      await cloudwatch.deleteLogGroup({
        logGroupName: "webda-test",
      });
    } catch (err) {
      // Skip bad delete
    }
    await super.before();
    this.service = <CloudWatchLogger>this.getService("CloudWatchLogger");
    assert.notStrictEqual(this.service, undefined);
  }

  @test
  async basic() {
    this.webda.log("INFO", "Plop 0", "Test");
    this.webda.log("DEBUG", "Plop 1", "Test");
    this.webda.log("DEBUG", "Plop 2", "Test");
    this.webda.log("DEBUG", "Plop 3", "Test");
    this.webda.getLogger("whatever").logProgressStart("test", 100, "other");
    this.webda.log("DEBUG", "Plop 4", "Test");
    await this.webda.emitSync("Webda.Result");
    let res = await this.service._cloudwatch.describeLogStreams({
      logGroupName: "webda-test",
    });
    assert.strictEqual(res.logStreams.length, 1);
    assert.notStrictEqual(res.logStreams[0].lastEventTimestamp, undefined);
    this.service.getParameters().logGroupName = undefined;
    await assert.rejects(
      () => this.service.init(),
      /Require a log group `logGroupName` parameter/
    );
  }

  @test
  aws() {
    assert.deepStrictEqual(this.service.getARNPolicy("plop"), {
      Action: ["logs:*"],
      Effect: "Allow",
      Resource: [
        "arn:aws:logs:us-east-1:plop:log-group:webda-test",
        "arn:aws:logs:us-east-1:plop:log-group:webda-test:*:*",
      ],
      Sid: "CloudWatchLoggerCloudWatchLogger",
    });
    assert.deepStrictEqual(this.service.getCloudFormation(), {
      CloudWatchLoggerLogGroup: {
        Properties: {
          LogGroupName: "webda-test",
        },
        Type: "AWS::Logs::LogGroup",
      },
    });
    this.service.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(this.service.getCloudFormation(), {});
  }

  @test
  async secondRun() {
    // Update config to use the stepper
    this.service.getParameters().singlePush = true;
    this.webda.log("INFO", "Plop 0", "Test");
    this.webda.log("DEBUG", "Plop 1", "Test");
    await this.sleep(1000);
    let res = await this.service._cloudwatch.describeLogStreams({
      logGroupName: "webda-test",
    });
    assert.strictEqual(res.logStreams.length, 1);
    assert.notStrictEqual(res.logStreams[0].lastEventTimestamp, undefined);
    this.webda.log("DEBUG", "Plop 2", "Test");
    this.webda.log("DEBUG", "Plop 3", "Test");
    this.webda.log("DEBUG", "Plop 4", "Test");
    await this.webda.emitSync("Webda.Result");
    res = await this.service._cloudwatch.describeLogStreams({
      logGroupName: "webda-test",
    });
    assert.strictEqual(res.logStreams.length, 1);
  }
}
