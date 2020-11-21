"use strict";
import { ModdaDefinition, Queue, Service, ServiceParameters, WebdaError } from "@webda/core";
import { CloudFormationContributor } from ".";
import CloudFormationDeployer from "../deployers/cloudformation";
import { GetAWS } from "./aws-mixin";

export class SQSQueueParameters extends ServiceParameters {
  WaitTimeSeconds: number;
  endpoint: string;
  queue: string;
  MessageGroupId: string;
  CloudFormationSkip: boolean;
  CloudFormation: any;

  constructor(params: any) {
    super(params);
    this.WaitTimeSeconds = this.WaitTimeSeconds ?? 20;
    this.queue = this.queue ?? "";
  }
}
// TODO Readd AWS Mixin
export default class SQSQueue<T extends SQSQueueParameters = SQSQueueParameters> extends Queue<T>
  implements CloudFormationContributor {
  sqs: any;
  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: any) {
    return new SQSQueueParameters(params);
  }

  async init(): Promise<void> {
    await super.init();
    this.sqs = new (GetAWS(this._params).SQS)({
      endpoint: this._params.endpoint
    });
  }

  async size(): Promise<number> {
    let res = await this.sqs
      .getQueueAttributes({
        AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
        QueueUrl: this._params.queue
      })
      .promise();
    return (
      parseInt(res["Attributes"]["ApproximateNumberOfMessages"]) +
      parseInt(res["Attributes"]["ApproximateNumberOfMessagesNotVisible"])
    );
  }

  async sendMessage(params) {
    var sqsParams: any = {};
    sqsParams.QueueUrl = this._params.queue;
    if (this._params.MessageGroupId) {
      sqsParams.MessageGroupId = this._params.MessageGroupId;
    }
    sqsParams.MessageBody = JSON.stringify(params);

    return this.sqs.sendMessage(sqsParams).promise();
  }

  async receiveMessage() {
    let queueArg = {
      QueueUrl: this._params.queue,
      WaitTimeSeconds: this._params.WaitTimeSeconds,
      AttributeNames: ["MessageGroupId"]
    };
    let data = await this.sqs.receiveMessage(queueArg).promise();
    return data.Messages || [];
  }

  async deleteMessage(receipt) {
    return this.sqs
      .deleteMessage({
        QueueUrl: this._params.queue,
        ReceiptHandle: receipt
      })
      .promise();
  }

  async __clean() {
    return this.__cleanWithRetry(false);
  }

  private async __cleanWithRetry(fail) {
    try {
      await this.sqs
        .purgeQueue({
          QueueUrl: this._params.queue
        })
        .promise();
    } catch (err) {
      if (fail || err.code !== "AWS.SimpleQueueService.PurgeQueueInProgress") {
        throw err;
      }
      let delay = Math.floor(err.retryDelay * 1100);
      console.log("Retry PurgeQueue in ", delay);
      // 10% of margin
      return new Promise(resolve => {
        setTimeout(() => {
          resolve(this.__cleanWithRetry(true));
        }, delay);
      });
    }
  }

  _getQueueInfosFromUrl() {
    let found = this._params.queue.match(/.*sqs\.(.*)\.amazonaws.com\/([0-9]+)\/(.*)/i);
    if (!found) {
      // Check for LocalStack
      found = this._params.queue.match(/http:\/\/(localhost):\d+\/(.*)\/(.*)/i);
      if (!found) {
        throw new WebdaError("SQS_PARAMETER_MALFORMED", "SQS Queue URL malformed");
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
    if (this._params.CloudFormationSkip) {
      return {};
    }
    let { name: QueueName } = this._getQueueInfosFromUrl();
    let resources = {};
    this._params.CloudFormation = this._params.CloudFormation || {};
    this._params.CloudFormation.Queue = this._params.CloudFormation.Queue || {};
    resources[this._name + "Queue"] = {
      Type: "AWS::SQS::Queue",
      Properties: {
        ...this._params.CloudFormation.Queue,
        QueueName,
        Tags: deployer.getDefaultTags(this._params.CloudFormation.Queue.Tags)
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/SQSQueue",
      label: "SQS Queue",
      description: "Implements a Queue stored in SQS",
      documentation: "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Binary.md",
      logo: "images/icons/sqs.png",
      configuration: {}
    };
  }
}

export { SQSQueue };
