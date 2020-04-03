import { QueueTest } from "@webda/core/lib/queues/queue.spec";
import * as assert from "assert";
import { suite, test, timeout } from "mocha-typescript";
import { checkLocalStack } from "../index.spec";
import { DummyQueue, SQSQueue } from "./sqsqueue";

@suite
class SQSQueueTest extends QueueTest {
  async before() {
    await checkLocalStack();
    await super.before();
  }

  @test
  async dummyQueue() {
    // Only for COV
    let queue = new DummyQueue(undefined, "dummy", {});
    await queue.deleteMessage(12);
    await queue.receiveMessage();
    await queue.sendMessage(12);
    await queue.size();
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
    assert.equal(arn.Action.indexOf("sqs:SendMessage") >= 0, true);
    assert.equal(arn.Resource[0], "arn:aws:sqs:us-east-1:queue:webda-test");
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
    assert.equal(error, true);
  }
}
