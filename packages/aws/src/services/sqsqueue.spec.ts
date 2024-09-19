import { GetQueueUrlCommandOutput, PurgeQueueCommand, SQS } from "@aws-sdk/client-sqs";
import { suite, test, timeout } from "@testdeck/mocha";
import { getCommonJS } from "@webda/core";
import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import { TestApplication } from "@webda/core/lib/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import * as path from "path";
import { checkLocalStack, defaultCreds } from "../index.spec";
import { SQSQueue } from "./sqsqueue";
const { __dirname } = getCommonJS(import.meta.url);

@suite
class SQSQueueTest extends QueueTest {
  info: GetQueueUrlCommandOutput;
  async before() {
    process.env.AWS_ACCESS_KEY_ID = "plop";
    process.env.AWS_SECRET_ACCESS_KEY = "plop";
    process.env.AWS_DEFAULT_REGION = "us-east-1";
    await checkLocalStack();
    await super.before();
    await this.install();
  }

  async tweakApp(app: TestApplication) {
    super.tweakApp(app);
    app.addService(
      "test/awsevents",
      (await import(path.join(__dirname, ..."../../test/moddas/awsevents.js".split("/")))).default
    );
  }

  async install() {
    const sqs = new SQS({
      endpoint: "http://localhost:4566",
      credentials: defaultCreds,
      region: "us-east-1"
    });
    try {
      this.info = await sqs.getQueueUrl({
        QueueName: "webda-test",
        QueueOwnerAWSAccountId: "000000000000"
      });
    } catch (err) {
      await sqs.createQueue({
        QueueName: "webda-test"
      });
      this.info = await sqs.getQueueUrl({
        QueueName: "webda-test",
        QueueOwnerAWSAccountId: "000000000000"
      });
    }
    try {
      this.info = await sqs.getQueueUrl({
        QueueName: "webda-test2.fifo",
        QueueOwnerAWSAccountId: "000000000000"
      });
    } catch (err) {
      await sqs.createQueue({
        QueueName: "webda-test2.fifo",
        Attributes: <any>{
          FifoQueue: "true"
        }
      });
      this.info = await sqs.getQueueUrl({
        QueueName: "webda-test2.fifo",
        QueueOwnerAWSAccountId: "000000000000"
      });
    }
  }

  @test
  @timeout(80000)
  async basic() {
    const queue: SQSQueue = <SQSQueue>this.webda.getService("SQSQueue");
    queue.getParameters().queue = "http://localhost:4566/000000000000/webda-test";
    await queue.__clean();
    // Update timeout to 80000ms as Purge can only be sent once every 60s
    await this.simple(queue, true);
    queue.getParameters().CloudFormationSkip = true;
    assert.deepStrictEqual(queue.getCloudFormation(null), {});
  }

  @test
  async fifo() {
    const queue: SQSQueue = <SQSQueue>this.webda.getService("SQSQueue");
    queue.getParameters().queue = "http://localhost:4566/000000000000/webda-test2.fifo";
    queue.getParameters().MessageGroupId = "myGroup";
    await queue.sendMessage({});
  }

  @test
  ARN() {
    const queue: SQSQueue = <SQSQueue>this.webda.getService("SQSQueue");
    const arn = queue.getARNPolicy();
    assert.strictEqual(arn.Action.indexOf("sqs:SendMessage") >= 0, true);
    assert.strictEqual(arn.Resource[0], "arn:aws:sqs:us-east-1:000000000000:webda-test");
  }

  @test
  getQueueInfos() {
    const queue: SQSQueue = <SQSQueue>this.webda.getService("SQSQueue");
    queue.getParameters().queue = "none";
    let error = false;
    try {
      const info = queue._getQueueInfosFromUrl();
    } catch (ex) {
      error = true;
    }
    assert.strictEqual(error, true);
  }

  @test
  async purgeQueueError() {
    const queue: SQSQueue = <SQSQueue>this.webda.getService("SQSQueue");
    let mock = mockClient(SQS)
      .on(PurgeQueueCommand)
      .callsFake(async () => {
        const error: any = new Error("AWS.SimpleQueueService.PurgeQueueInProgress");
        error.name = "AWS.SimpleQueueService.PurgeQueueInProgress";
        error.retryDelay = 1;
        throw error;
      });
    await assert.rejects(() => queue.__clean(), /AWS.SimpleQueueService.PurgeQueueInProgress/);
    mock.restore();
    mock = mockClient(SQS)
      .on(PurgeQueueCommand)
      .callsFake(async () => {
        throw new Error("Other");
      });
    await assert.rejects(() => queue.__clean(), /Other/);
    mock.restore();
  }

  @test
  getMaxConsumers() {
    const queue = new SQSQueue(this.webda, "plop", { maxConsumers: 30 });
    assert.strictEqual(queue.getMaxConsumers(), 3);
    queue.getParameters().maxConsumers = 3;
    assert.strictEqual(queue.getMaxConsumers(), 1);
  }
}
