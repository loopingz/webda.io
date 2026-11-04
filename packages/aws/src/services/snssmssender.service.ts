import { type MessageAttributeValue, PublishCommand, SNSClient } from "@aws-sdk/client-sns";
import { type SecretString, Service, ServiceParameters, type SmsSender } from "@webda/core";
import { AWSServiceParameters, getAWSClientConfig, loadAWSParameters } from "./aws-parameters.js";

/**
 * SnsSmsSender parameters
 */
export class SnsSmsSenderParameters extends ServiceParameters implements AWSServiceParameters {
  /**
   * Custom endpoint (localstack, ...)
   */
  endpoint?: string;
  /**
   * Static credentials, default to the AWS environment variables
   *
   * Can be encrypted with `webda config encrypt`
   */
  credentials?: {
    accessKeyId: string | SecretString;
    secretAccessKey: string | SecretString;
    sessionToken?: string | SecretString;
  };
  /**
   * AWS region
   * @default "us-east-1"
   */
  region?: string;
  /**
   * Alphanumeric sender ID shown to recipients, in the countries supporting it
   */
  senderId?: string;
  /**
   * Origination number (E.164) registered in AWS End User Messaging
   */
  originationNumber?: string;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    return this;
  }
}

/**
 * Send SMS with Amazon SNS, as transactional messages
 *
 * @WebdaModda
 */
export class SnsSmsSender<T extends SnsSmsSenderParameters = SnsSmsSenderParameters>
  extends Service<T>
  implements SmsSender
{
  /** SNS client */
  client: SNSClient;

  /**
   * Create the AWS client
   * @override
   */
  computeParameters() {
    super.computeParameters();
    this.client = new SNSClient(getAWSClientConfig(this.parameters));
  }

  /**
   * IAM statement for the deployers: publishing to a phone number has no resource ARN
   * @returns the policy statement
   */
  getARNPolicy() {
    return {
      Sid: this.constructor.name + this.getName(),
      Effect: "Allow",
      Action: ["sns:Publish"],
      Resource: ["*"]
    };
  }

  /**
   * Publish a transactional SMS
   * @param to - recipient phone number in E.164 format
   * @param message - message body
   */
  async send(to: string, message: string): Promise<void> {
    const MessageAttributes: Record<string, MessageAttributeValue> = {
      "AWS.SNS.SMS.SMSType": { DataType: "String", StringValue: "Transactional" }
    };
    if (this.parameters.senderId) {
      MessageAttributes["AWS.SNS.SMS.SenderID"] = { DataType: "String", StringValue: this.parameters.senderId };
    }
    if (this.parameters.originationNumber) {
      MessageAttributes["AWS.MM.SMS.OriginationNumber"] = {
        DataType: "String",
        StringValue: this.parameters.originationNumber
      };
    }
    await this.client.send(new PublishCommand({ PhoneNumber: to, Message: message, MessageAttributes }));
  }
}
