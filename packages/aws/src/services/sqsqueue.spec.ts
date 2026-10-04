import { PurgeQueueCommand, SQS } from "@aws-sdk/client-sqs";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import { suite, test, timeout } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { checkLocalStack, defaultCreds, LOCALSTACK, localstackParams } from "../../test/fixture.js";
import { SQSQueue, SQSQueueParameters } from "./sqsqueue.service.js";

const QUEUE = `${LOCALSTACK}/000000000000/webda-test`;
const FIFO_QUEUE = `${LOCALSTACK}/000000000000/webda-test2.fifo`;

@suite
class SQSQueueTest extends QueueTest {
  queue: SQSQueue;

  async beforeAll() {
    process.env.AWS_ACCESS_KEY_ID = defaultCreds.accessKeyId;
    process.env.AWS_SECRET_ACCESS_KEY = defaultCreds.secretAccessKey;
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    await checkLocalStack();
    await this.install();
    await super.beforeAll();
  }

  async beforeEach() {
    await super.beforeEach();
    this.queue = this.registerService(
      new SQSQueue(
        "SQSQueue",
        new SQSQueueParameters().load({
          endpoint: LOCALSTACK,
          queue: QUEUE,
          maxConsumers: 1
        })
      )
    ).resolve();
    await this.queue.init();
  }

  async install() {
    const sqs = new SQS(localstackParams);
    await sqs.createQueue({ QueueName: "webda-test" });
    await sqs.createQueue({
      QueueName: "webda-test2.fifo",
      Attributes: <any>{
        FifoQueue: "true"
      }
    });
  }

  @test
  @timeout(80000)
  async basic() {
    // Update timeout to 80000ms as Purge can only be sent once every 60s
    await this.queue.__clean();
    await this.simple(this.queue, true);
    this.queue.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(this.queue.getCloudFormation(null), {});
  }

  @test
  async fifo() {
    this.queue.getParameters().queue = FIFO_QUEUE;
    this.queue.getParameters().MessageGroupId = "myGroup";
    this.queue.getParameters().WaitTimeSeconds = 1;
    // Deduplication is based on the content: use a unique message
    const fifo = Date.now();
    await this.queue.sendMessage({ fifo });
    let found = false;
    for (let i = 0; i < 10 && !found; i++) {
      for (const message of await this.queue.receiveMessage<any>()) {
        found ||= message.Message.fifo === fifo;
        await this.queue.deleteMessage(message.ReceiptHandle);
      }
    }
    assert.ok(found);
  }

  @test
  cloudFormation() {
    assert.deepStrictEqual(this.queue.getCloudFormation({ getDefaultTags: tags => tags ?? [] }), {
      SQSQueueQueue: {
        Type: "AWS::SQS::Queue",
        Properties: {
          QueueName: "webda-test",
          Tags: []
        }
      }
    });
  }

  @test
  ARN() {
    const arn = this.queue.getARNPolicy();
    assert.strictEqual(arn.Action.indexOf("sqs:SendMessage") >= 0, true);
    assert.strictEqual(arn.Resource[0], "arn:aws:sqs:us-east-1:000000000000:webda-test");
    this.queue.getParameters().queue = "https://sqs.eu-west-1.amazonaws.com/123456789012/myqueue";
    assert.deepStrictEqual(this.queue._getQueueInfosFromUrl(), {
      accountId: "123456789012",
      region: "eu-west-1",
      name: "myqueue"
    });
  }

  @test
  getQueueInfos() {
    this.queue.getParameters().queue = "none";
    assert.throws(() => this.queue._getQueueInfosFromUrl(), /SQS Queue URL malformed/);
  }

  @test
  async purgeQueueError() {
    let mock = mockClient(SQS);
    mock.on(PurgeQueueCommand).callsFake(async () => {
      const error: any = new Error("AWS.SimpleQueueService.PurgeQueueInProgress");
      error.name = "AWS.SimpleQueueService.PurgeQueueInProgress";
      error.retryDelay = 1;
      throw error;
    });
    try {
      await assert.rejects(() => this.queue.__clean(), /AWS.SimpleQueueService.PurgeQueueInProgress/);
    } finally {
      mock.restore();
    }
    mock = mockClient(SQS);
    mock.on(PurgeQueueCommand).rejects(new Error("Other"));
    try {
      await assert.rejects(() => this.queue.__clean(), /Other/);
    } finally {
      mock.restore();
    }
  }

  @test
  getMaxConsumers() {
    const queue = new SQSQueue("plop", new SQSQueueParameters().load({ maxConsumers: 30 }));
    assert.strictEqual(queue.getMaxConsumers(), 3);
    queue.getParameters().maxConsumers = 3;
    assert.strictEqual(queue.getMaxConsumers(), 1);
  }
}
