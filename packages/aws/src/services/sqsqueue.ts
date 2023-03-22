import { ReceiveMessageRequest, SendMessageCommandInput, SQS } from "@aws-sdk/client-sqs";
import { MessageReceipt, Queue, QueueParameters, WebdaError } from "@webda/core";
import { createHash } from "crypto";
import CloudFormationDeployer from "../deployers/cloudformation";
import { AWSServiceParameters, CloudFormationContributor } from "./index";

export class SQSQueueParameters extends AWSServiceParameters(QueueParameters) {
  /**
   * Time to wait pending for an item
   * @default 20
   */
  WaitTimeSeconds?: number;
  /**
   * Endpoint to pass to the AWS client
   * Useful for localstack
   */
  endpoint?: string;
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

  constructor(params: any) {
    super(params);
    this.WaitTimeSeconds = this.WaitTimeSeconds ?? 20;
    this.queue = this.queue ?? "";
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
   * @inheritdoc
   */
  loadParameters(params: any) {
    return new SQSQueueParameters(params);
  }

  /**
   * @inheritdoc
   */
  async init(): Promise<this> {
    await super.init();
    this.sqs = new SQS(this.parameters);
    return this;
  }

  /**
   * @inheritdoc
   */
  async size(): Promise<number> {
    let res = await this.sqs.getQueueAttributes({
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
      QueueUrl: this.parameters.queue
    });
    return (
      parseInt(res["Attributes"]["ApproximateNumberOfMessages"]) +
      parseInt(res["Attributes"]["ApproximateNumberOfMessagesNotVisible"])
    );
  }

  /**
   * @inheritdoc
   */
  async sendMessage(params: T): Promise<void> {
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
   * @inheritdoc
   */
  async receiveMessage<L>(proto?: { new (): L }): Promise<MessageReceipt<L>[]> {
    let queueArg: ReceiveMessageRequest = {
      QueueUrl: this.parameters.queue,
      WaitTimeSeconds: this.parameters.WaitTimeSeconds,
      AttributeNames: ["MessageGroupId"],
      MaxNumberOfMessages: this.parameters.maxConsumers > 10 ? 10 : this.parameters.maxConsumers
    };
    let data = await this.sqs.receiveMessage(queueArg);
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
   * @returns
   */
  getMaxConsumers(): number {
    return Math.ceil(this.parameters.maxConsumers / 10);
  }

  /**
   * @inheritdoc
   */
  async deleteMessage(receipt: string): Promise<void> {
    await this.sqs.deleteMessage({
      QueueUrl: this.parameters.queue,
      ReceiptHandle: receipt
    });
  }

  /**
   * @inheritdoc
   */
  async __clean(): Promise<void> {
    return this.__cleanWithRetry(false);
  }

  private async __cleanWithRetry(fail): Promise<void> {
    try {
      await this.sqs.purgeQueue({
        QueueUrl: this.parameters.queue
      });
    } catch (err) {
      if (fail || err.name !== "AWS.SimpleQueueService.PurgeQueueInProgress") {
        throw err;
      }
      let delay = Math.floor(err.retryDelay * 1100);
      // 10% of margin
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(this.__cleanWithRetry(true));
        }, delay);
      });
    }
  }

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

  getARNPolicy() {
    // Parse this._params.queue;
    let queue = this._getQueueInfosFromUrl();
    return {
      Sid: this.constructor.name + this._name,
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

  getCloudFormation(deployer: CloudFormationDeployer) {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    let { name: QueueName } = this._getQueueInfosFromUrl();
    let resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    this.parameters.CloudFormation.Queue = this.parameters.CloudFormation.Queue || {};
    resources[this._name + "Queue"] = {
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
