import { ReceiveMessageRequest, SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import { MessageReceipt, Queue, QueueParameters, WebdaError } from "@webda/core";
import { createHash } from "crypto";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";
import type { CloudFormationContributor, CloudFormationDeployerInfo } from "./contributors.js";

/**
 * SQS Queue parameters
 */
export class SQSQueueParameters extends QueueParameters implements AWSServiceParameters {
  /**
   * Custom endpoint (localstack, minio, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   */
  credentials?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;

  /**
   * Time to wait pending for an item
   * @default 20
   */
  WaitTimeSeconds?: number;
  /**
   * Queue URL
   * @default ""
   */
  queue: string;
  /**
   * MessageGroupId to pass to send and receive
   */
  MessageGroupId?: string;
  /**
   * Skip CloudFormation on deploy
   * @default false
   */
  CloudFormationSkip?: boolean;
  /**
   * Any additional CloudFormation parameters
   */
  CloudFormation?: any;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    this.WaitTimeSeconds ??= 20;
    this.queue ??= "";
    return this;
  }
}

/**
 * Implement SQS as queue for Webda
 *
 * @WebdaModda
 */
export default class SQSQueue<T = any, K extends SQSQueueParameters = SQSQueueParameters>
  extends Queue<T, K>
  implements CloudFormationContributor
{
  /**
   * AWS SQS Client
   */
  sqs: SQS;

  /**
   * Create the SQS client
   * @returns this
   */
  async init(): Promise<this> {
    await super.init();
    this.sqs = new SQS(this.parameters);
    return this;
  }

  /**
   * @override
   * @returns approximate number of messages in the queue
   */
  async size(): Promise<number> {
    const res = await this.sqs.getQueueAttributes({
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
      QueueUrl: this.parameters.queue
    });
    return (
      parseInt(res["Attributes"]["ApproximateNumberOfMessages"]) +
      parseInt(res["Attributes"]["ApproximateNumberOfMessagesNotVisible"])
    );
  }

  /**
   * @override
   * @param params - the message to send
   */
  async sendMessage(params: T): Promise<void> {
    this.metrics.messages_sent.inc();
    const sqsParams: SendMessageCommandInput = {
      QueueUrl: this.parameters.queue,
      MessageBody: JSON.stringify(params)
    };
    if (this.parameters.MessageGroupId) {
      sqsParams.MessageGroupId = this.parameters.MessageGroupId;
    }
    if (this.parameters.queue.endsWith(".fifo")) {
      sqsParams.MessageDeduplicationId = createHash("sha256").update(sqsParams.MessageBody).digest("hex");
    }
    await this.sqs.sendMessage(sqsParams);
  }

  /**
   * @override
   * @param proto - optional prototype to rehydrate the payload into
   * @returns the received messages
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    const queueArg: ReceiveMessageRequest = {
      QueueUrl: this.parameters.queue,
      WaitTimeSeconds: this.parameters.WaitTimeSeconds,
      MaxNumberOfMessages: this.parameters.maxConsumers > 10 ? 10 : this.parameters.maxConsumers
    };
    const data = await this.sqs.receiveMessage(queueArg);
    data.Messages ??= [];
    return data.Messages.map(m => ({
      ReceiptHandle: m.ReceiptHandle,
      Message: this.unserialize(m.Body, proto)
    }));
  }

  /**
   * We will retrieve more than one message on receiveMessage if maxConsumers is higher
   * therefore we need to divide by 10 (the max number of group messaged) to get the number
   * of consumers
   *
   * @returns the number of consumers
   */
  getMaxConsumers(): number {
    return Math.ceil(this.parameters.maxConsumers / 10);
  }

  /**
   * @override
   * @param receipt - the message receipt handle
   */
  async deleteMessage(receipt: string): Promise<void> {
    await this.sqs.deleteMessage({
      QueueUrl: this.parameters.queue,
      ReceiptHandle: receipt
    });
  }

  /**
   * Purge the queue (used in tests)
   */
  async __clean(): Promise<void> {
    await this.__cleanWithRetry(false);
  }

  /**
   * Purge the queue, retrying once if a purge is already in progress
   * @param fail - throw on any error
   */
  private async __cleanWithRetry(fail: boolean): Promise<void> {
    try {
      await this.sqs.purgeQueue({
        QueueUrl: this.parameters.queue
      });
    } catch (err) {
      if (fail || err.name !== "AWS.SimpleQueueService.PurgeQueueInProgress") {
        throw err;
      }
      const delay = Math.floor(err.retryDelay * 1100);
      // 10% of margin
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.__cleanWithRetry(true);
    }
  }

  /**
   * Parse the queue url
   * @returns the account id, region and queue name
   */
  _getQueueInfosFromUrl() {
    let found = this.parameters.queue.match(/.*sqs\.(.*)\.amazonaws.com\/(\d+)\/(.*)/i);
    if (!found) {
      // Check for LocalStack
      found = this.parameters.queue.match(/http:\/\/(localhost):\d+\/(.*)\/(.*)/i);
      if (!found) {
        throw new WebdaError.CodeError("SQS_PARAMETER_MALFORMED", "SQS Queue URL malformed");
      }
      found[1] = "us-east-1";
    }
    return {
      accountId: found[2],
      region: found[1],
      name: found[3]
    };
  }

  /**
   * IAM policy required by the service
   * @returns the policy statement
   */
  getARNPolicy() {
    // Parse this._params.queue;
    const queue = this._getQueueInfosFromUrl();
    return {
      Sid: this.constructor.name + this.getName(),
      Effect: "Allow",
      Action: [
        "sqs:DeleteMessage",
        "sqs:DeleteMessageBatch",
        "sqs:ReceiveMessage",
        "sqs:SendMessage",
        "sqs:SendMessageBatch"
      ],
      Resource: ["arn:aws:sqs:" + queue.region + ":" + queue.accountId + ":" + queue.name]
    };
  }

  /**
   * CloudFormation resources for the queue
   * @param deployer - the deployer requesting the resources
   * @returns the resources
   */
  getCloudFormation(deployer: CloudFormationDeployerInfo) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    const { name: QueueName } = this._getQueueInfosFromUrl();
    const resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Queue = this.parameters.CloudFormation.Queue || {};
    resources[this.getName() + "Queue"] = {
      Type: "AWS::SQS::Queue",
      Properties: {
        ...this.parameters.CloudFormation.Queue,
        QueueName,
        Tags: deployer.getDefaultTags(this.parameters.CloudFormation.Queue.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }
}

export { SQSQueue };
