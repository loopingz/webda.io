import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { Service, ServiceParameters } from "@webda/core";
import { LogFilter, WorkerLogLevel, WorkerMessage } from "@webda/workout";
import { CloudFormationContributor } from ".";
import { AWSServiceParameters } from "./aws-mixin";
import { randomUUID } from "crypto";

/**
 * Send webda log to CloudWatch
 */
export class CloudWatchLoggerParameters extends AWSServiceParameters(ServiceParameters) {
  /**
   * logGroupName to send logStream to
   */
  logGroupName: string;
  logStreamNamePrefix?: string;
  kmsKeyId: string;
  tags: any;
  logLevel: WorkerLogLevel;
  singlePush: boolean;
  CloudFormation: any;
  CloudFormationSkip: boolean;
}

/**
 * Output log to a CloudWatch Stream
 *
 * @WebdaModda
 */
export default class CloudWatchLogger<T extends CloudWatchLoggerParameters = CloudWatchLoggerParameters>
  extends Service<T>
  implements CloudFormationContributor
{
  _logGroupName: string;
  _logStreamName: string;
  _seqToken: string;
  _logStream: any;
  _cloudwatch: any;
  _bufferedLogs: any[] = [];

  /**
   * Load the parameters
   *
   * @param params
   */
  loadParameters(params: any) {
    return new CloudWatchLoggerParameters(params);
  }

  /**
   * @inheritdoc
   */
  async init(): Promise<this> {
    await super.init();
    this._logGroupName = this.parameters.logGroupName;
    if (!this._logGroupName) {
      throw Error("Require a log group `logGroupName` parameter");
    }
    this._logStreamName = (this.parameters.logStreamNamePrefix || "") + randomUUID();
    this._cloudwatch = new CloudWatchLogs(this.parameters);
    const res = await this._cloudwatch.describeLogGroups({
      logGroupNamePrefix: this._logGroupName
    });
    if (!res.logGroups.length) {
      await this._cloudwatch.createLogGroup({
        logGroupName: this._logGroupName,
        kmsKeyId: this.parameters.kmsKeyId,
        tags: this.parameters.tags
      });
    }
    this._logStream = await this._cloudwatch.createLogStream({
      logGroupName: this._logGroupName,
      logStreamName: this._logStreamName
    });
    this._webda.getWorkerOutput().on("message", (msg: WorkerMessage) => {
      if (msg.type !== "log") {
        return;
      }
      if (LogFilter(msg.log.level, this.parameters.logLevel)) {
        this._log(msg.log.level, ...msg.log.args);
      }
    });
    this._webda.on("Webda.Result", this.sendLogs.bind(this));
    return this;
  }

  /**
   * Send logs to CloudWatch
   *
   * @param copy
   * @returns
   */
  async sendLogs(copy: boolean = false): Promise<void> {
    if (!this._bufferedLogs.length) {
      return;
    }
    let toSend;
    if (copy) {
      toSend = Array.from(this._bufferedLogs);
      this._bufferedLogs = [];
    } else {
      toSend = this._bufferedLogs;
    }
    const params = {
      logEvents: toSend,
      logGroupName: this._logGroupName,
      logStreamName: this._logStreamName,
      sequenceToken: this._seqToken
    };
    const res = await this._cloudwatch.putLogEvents(params);
    this._seqToken = res.nextSequenceToken;
    if (!copy) {
      this._bufferedLogs = [];
    }
  }

  /**
   * @inheritdoc
   */
  _log(level, ...args): void {
    this._bufferedLogs.push({
      message: `[${level}] ` + args.map(p => (p ? p.toString() : "undefined")).join(" "),
      timestamp: new Date().getTime()
    });
    if (this.parameters.singlePush) {
      this.sendLogs(true);
    }
  }

  /**
   * @inheritdoc
   */
  getARNPolicy(accountId: string) {
    const region = this.parameters.region || "us-east-1";
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: ["logs:*"],
      Resource: [
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this.parameters.logGroupName,
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this.parameters.logGroupName + ":*:*"
      ]
    };
  }

  /**
   * @inheritdoc
   */
  getCloudFormation() {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    const resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    resources[this._name + "LogGroup"] = {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        ...this.parameters.CloudFormation.LogGroup,
        LogGroupName: this.parameters.logGroupName
      }
    };
    // Add any Other resources with prefix of the service
    return resources;
  }
}

export { CloudWatchLogger };
