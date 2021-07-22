import { ModdaDefinition, Service, ServiceParameters } from "@webda/core";
import { LogFilter, WorkerLogLevel, WorkerMessage } from "@webda/workout";
import * as uuid from "uuid";
import { CloudFormationContributor } from ".";
import { GetAWS } from "./aws-mixin";

/**
 * Send webda log to CloudWatch
 */
export class CloudWatchLoggerParameters extends ServiceParameters {
  /**
   * logGroupName to send logStream to
   */
  logGroupName: string;
  logStreamNamePrefix?: string;
  endpoint: string;
  kmsKeyId: string;
  tags: any;
  logLevel: WorkerLogLevel;
  singlePush: boolean;
  CloudFormation: any;
  CloudFormationSkip: boolean;
  region: string;
}

export default class CloudWatchLogger<T extends CloudWatchLoggerParameters = CloudWatchLoggerParameters>
  extends Service<T>
  implements CloudFormationContributor {
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

  async init(): Promise<void> {
    await super.init();
    this._logGroupName = this.parameters.logGroupName;
    if (!this._logGroupName) {
      throw Error("Require a log group `logGroupName` parameter");
    }
    this._logStreamName = (this.parameters.logStreamNamePrefix || "") + uuid.v4();
    this._cloudwatch = new (GetAWS(this.parameters).CloudWatchLogs)({
      endpoint: this.parameters.endpoint
    });
    let res = await this._cloudwatch
      .describeLogGroups({
        logGroupNamePrefix: this._logGroupName
      })
      .promise();
    if (!res.logGroups.length) {
      await this._cloudwatch
        .createLogGroup({
          logGroupName: this._logGroupName,
          kmsKeyId: this.parameters.kmsKeyId,
          tags: this.parameters.tags
        })
        .promise();
    }
    this._logStream = await this._cloudwatch
      .createLogStream({
        logGroupName: this._logGroupName,
        logStreamName: this._logStreamName
      })
      .promise();
    this._webda.getWorkerOutput().on("message", (msg: WorkerMessage) => {
      if (msg.type !== "log") {
        return;
      }
      if (LogFilter(msg.log.level, this.parameters.logLevel)) {
        this._log(msg.log.level, ...msg.log.args);
      }
    });
    this._webda.on("Webda.Result", this.sendLogs.bind(this));
  }

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
    let params = {
      logEvents: toSend,
      logGroupName: this._logGroupName,
      logStreamName: this._logStreamName,
      sequenceToken: this._seqToken
    };
    let res = await this._cloudwatch.putLogEvents(params).promise();
    this._seqToken = res.nextSequenceToken;
    if (!copy) {
      this._bufferedLogs = [];
    }
  }

  _log(level, ...args): void {
    this._bufferedLogs.push({
      message: `[${level}] ` + args.map(p => (p ? p.toString() : "undefined")).join(" "),
      timestamp: new Date().getTime()
    });
    if (this.parameters.singlePush) {
      this.sendLogs(true);
    }
  }

  getARNPolicy(accountId) {
    let region = this.parameters.region || "us-east-1";
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

  getCloudFormation() {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    let resources = {};
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

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/CloudWatchLogger",
      label: "CloudWatchLogger",
      description: "Output to a logstream in CloudWatch",
      logo: "images/icons/none.png"
    };
  }
}

export { CloudWatchLogger };
