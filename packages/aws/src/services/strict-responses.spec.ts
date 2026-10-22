import { GetQueueAttributesCommand, ReceiveMessageCommand, SQS } from "@aws-sdk/client-sqs";
import { WebdaApplicationTest } from "@webda/core/lib/test";
import { suite, test } from "@webda/test";
import * as assert from "node:assert/strict";
import { mockClient } from "aws-sdk-client-mock";
import { SQSQueue } from "./sqsqueue.service.js";

/** SDK responses can omit fields even when the happy path usually returns them. */
@suite
class SQSResponseTest extends WebdaApplicationTest {
  @test
  async missingAttributesAndInvalidMessages() {
    const mock = mockClient(SQS);
    try {
      const queue = await this.addService(SQSQueue, { queue: "https://sqs.us-east-1.amazonaws.com/123/test" });
      mock.on(GetQueueAttributesCommand).resolves({});
      assert.equal(await queue.size(), 0);
      mock.on(ReceiveMessageCommand).resolves({});
      assert.deepEqual(await queue.receiveMessage(), []);
      mock.on(ReceiveMessageCommand).resolves({ Messages: [{ Body: "{}" }] });
      await assert.rejects(queue.receiveMessage(), /missing its receipt or body/);
      mock.on(ReceiveMessageCommand).resolves({ Messages: [{ ReceiptHandle: "receipt", Body: '{"value":1}' }] });
      assert.deepEqual(await queue.receiveMessage(), [{ ReceiptHandle: "receipt", Message: { value: 1 } }]);
    } finally {
      mock.restore();
    }
  }
}
