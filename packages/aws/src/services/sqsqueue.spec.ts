import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { suite, test, timeout } from "@testdeck/mocha";
import { checkLocalStack } from "../index.spec";
import { SQSQueue } from "./sqsqueue";
import { GetAWS } from "./aws-mixin";
import * as sinon from "sinon";
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
    let queue: SQSQueue = <SQSQueue>this.webda.getService("sqsqueue");
    await queue.__clean();
    // Update timeout to 80000ms as Purge can only be sent once every 60s
    await this.simple(queue, true);
    queue.getParameters().MessageGroupId = "myGroup";
    await queue.sendMessage({});
    queue.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(queue.getCloudFormation(null), {});
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
    queue.getParameters().queue = "none";
    let error = false;
    try {
      let info = queue._getQueueInfosFromUrl();
    } catch (ex) {
      error = true;
    }
    assert.strictEqual(error, true);
  }

  @test
  async purgeQueueError() {
    let queue: SQSQueue = <SQSQueue>this.webda.getService("sqsqueue");
    let stub = sinon.stub(queue.sqs, "purgeQueue").callsFake((params: any) => {
      return {
        promise: async () => {
          let error: any = new Error("AWS.SimpleQueueService.PurgeQueueInProgress");
          error.code = "AWS.SimpleQueueService.PurgeQueueInProgress";
          error.retryDelay = 1;
          throw error;
        }
      };
    });
    await assert.rejects(() => queue.__clean(), /AWS.SimpleQueueService.PurgeQueueInProgress/);
    stub.callsFake((_, c) => {
      return {
        promise: async () => {
          throw new Error("Other");
        }
      };
    });
    await assert.rejects(() => queue.__clean(), /Other/);
  }

  @test
  getMaxConsumers() {
    let queue = new SQSQueue(this.webda, "plop", { maxConsumers: 30 });
    assert.strictEqual(queue.getMaxConsumers(), 3);
    queue.getParameters().maxConsumers = 3;
    assert.strictEqual(queue.getMaxConsumers(), 1);
  }
}
