import { suite, test } from "@webda/test";
import { DynamoDB } from "@aws-sdk/client-dynamodb";
import { SQS } from "@aws-sdk/client-sqs";
import { WebdaApplicationTest } from "@webda/core/lib/test/application.js";
import type { Queue, Store } from "@webda/core";
import { benchQueue, benchStore, useServiceType } from "@webda/bench";

/**
 * LocalStack of the CI (see .github/workflows/ci.yml), overridable with WEBDA_LOCALSTACK
 */
const endpoint = process.env.WEBDA_LOCALSTACK || "http://localhost:4566";
/**
 * LocalStack accepts any credentials
 */
const aws = { endpoint, region: "us-east-1", credentials: { accessKeyId: "bench", secretAccessKey: "bench" } };
const TABLE = "webda-bench-documents";
const QUEUE = "webda-bench-queue";

/**
 * AWS benchmarks on LocalStack: numbers are flagged as emulated, for regression tracking only
 */
@suite
class AWSBench extends WebdaApplicationTest {
  /**
   * Empty application: the harnesses add the services under test
   *
   * @returns the configuration
   */
  getTestConfiguration() {
    return { parameters: { ignoreBeans: true }, services: {} };
  }

  /**
   * DynamoStore: queries without index are scans
   */
  @test
  async store() {
    const dynamodb = new DynamoDB(aws);
    await dynamodb.deleteTable({ TableName: TABLE }).catch(() => {});
    await dynamodb.createTable({
      TableName: TABLE,
      BillingMode: "PAY_PER_REQUEST",
      KeySchema: [{ AttributeName: "uuid", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "uuid", AttributeType: "S" }]
    });
    try {
      await benchStore({
        backend: "DynamoStore",
        emulated: true,
        createStore: (name, models) =>
          this.addService(useServiceType<Store>("Webda/DynamoStore"), { ...aws, table: TABLE, models } as any, name)
      });
    } finally {
      await dynamodb.deleteTable({ TableName: TABLE }).catch(() => {});
    }
  }

  /**
   * SQSQueue: messages not deleted are visible again after the queue VisibilityTimeout (1s)
   *
   * `WaitTimeSeconds` is lowered from 20 to 1 so cancelling a consumer between scenarios does not wait for a long
   * poll: a long poll returns as soon as a message arrives, so latencies are not affected.
   */
  @test
  async queue() {
    const sqs = new SQS(aws);
    const { QueueUrl } = await sqs.createQueue({ QueueName: QUEUE, Attributes: { VisibilityTimeout: "1" } });
    try {
      await benchQueue({
        backend: "SQSQueue",
        emulated: true,
        inconsistentSize: true,
        redeliveryDelayMs: 1000,
        createQueue: name =>
          this.addService(
            useServiceType<Queue>("Webda/SQSQueue"),
            { ...aws, queue: QueueUrl, WaitTimeSeconds: 1 } as any,
            name
          ),
        // PurgeQueue is limited to one call per minute: drain the queue instead
        purge: async () => {
          const deadline = Date.now() + 30000;
          while (Date.now() < deadline) {
            const { Messages = [] } = await sqs.receiveMessage({
              QueueUrl,
              MaxNumberOfMessages: 10,
              WaitTimeSeconds: 0
            });
            if (Messages.length) {
              await sqs.deleteMessageBatch({
                QueueUrl,
                Entries: Messages.map((m, i) => ({ Id: `${i}`, ReceiptHandle: m.ReceiptHandle }))
              });
              continue;
            }
            const { Attributes = {} } = await sqs.getQueueAttributes({
              QueueUrl,
              AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"]
            });
            if (
              Attributes.ApproximateNumberOfMessages === "0" &&
              Attributes.ApproximateNumberOfMessagesNotVisible === "0"
            ) {
              return;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      });
    } finally {
      await sqs.deleteQueue({ QueueUrl }).catch(() => {});
    }
  }
}
