import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { suite, test, timeout } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { SQSQueue } from "./sqsqueue";
import { GetAWS } from "./aws-mixin";

@suite
class SQSQueueTest extends QueueTest {
  async before() {
    await checkLocalStack();
    await super.before();
    await this.install();
  }

  async install() {
    var sqs = new (GetAWS({}).SQS)({
      endpoint: "http://localhost:4576"
    });
    return sqs
      .getQueueUrl({
        QueueName: "webda-test",
        QueueOwnerAWSAccountId: "123456789"
      })
      .promise()
      .catch(err => {
        if (err.code === "AWS.SimpleQueueService.NonExistentQueue") {
          return sqs
            .createQueue({
              QueueName: "webda-test"
            })
            .promise();
        }
      });
  }

  @test
  @timeout(80000)
  async basic() {
    await this.webda.getService("sqsqueue").__clean();
    // Update timeout to 80000ms as Purge can only be sent once every 60s
    return this.simple(this.webda.getService("sqsqueue"), true);
  }

  @test
  ARN() {
    let queue: SQSQueue = <SQSQueue>this.webda.getService("sqsqueue");
    let arn = queue.getARNPolicy();
    assert.strictEqual(arn.Action.indexOf("sqs:SendMessage") >= 0, true);
    assert.strictEqual(arn.Resource[0], "arn:aws:sqs:us-east-1:queue:webda-test");
  }

  @test
  getQueueInfos() {
    let queue: SQSQueue = <SQSQueue>this.webda.getService("sqsqueue");
    queue._params.queue = "none";
    let error = false;
    try {
      let info = queue._getQueueInfosFromUrl();
    } catch (ex) {
      error = true;
    }
    assert.strictEqual(error, true);
  }
}
