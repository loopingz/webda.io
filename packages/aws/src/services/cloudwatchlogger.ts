import { ModdaDefinition, Service, ServiceParameters } from "@webda/core";
import { LogFilter, WorkerLogLevel, WorkerMessage } from "@webda/workout";
import * as uuid from "uuid";
import { CloudFormationContributor } from ".";
import { GetAWS } from "./aws-mixin";

export class CloudWatchLoggerParameters extends ServiceParameters {
  logGroupName: string;
  logStreamNamePrefix: string;
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
    this._logGroupName = this._params.logGroupName;
    if (!this._logGroupName) {
      throw Error("Require a log group `logGroupName` parameter");
    }
    this._logStreamName = this._params.logStreamNamePrefix + uuid.v4();
    this._cloudwatch = new (GetAWS(this._params).CloudWatchLogs)({
      endpoint: this._params.endpoint
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
          kmsKeyId: this._params.kmsKeyId,
          tags: this._params.tags
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
      if (LogFilter(msg.log.level, this._params.logLevel)) {
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
    let msg = `[${level}] ` + args.map(p => p.toString()).join(" ");
    this._bufferedLogs.push({
      message: msg,
      timestamp: new Date().getTime()
    });
    if (this._params.singlePush) {
      this.sendLogs(true);
    }
  }

  getARNPolicy(accountId) {
    let region = this._params.region || "us-east-1";
    return {
      Sid: this.constructor.name + this._name,
      Effect: "Allow",
      Action: ["logs:*"],
      Resource: [
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this._params.logGroupName,
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this._params.logGroupName + ":*:*"
      ]
    };
  }

  getCloudFormation() {
    if (this._params.CloudFormationSkip) {
      return {};
    }
    let resources = {};
    this._params.CloudFormation = this._params.CloudFormation || {};
    resources[this._name + "LogGroup"] = {
      Type: "AWS::Logs::LogGroup",
      Properties: {
        ...this._params.CloudFormation.LogGroup,
        LogGroupName: this._params.logGroupName
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
      logo: "images/icons/none.png",
      configuration: {
        schema: {
          type: "object",
          properties: {
            logLevel: {
              type: "string",
              default: "INFO"
            },
            logLevels: {
              type: "string",
              default: "ERROR,WARN,CONSOLE,INFO,DEBUG"
            },
            logGroupName: {
              type: "string"
            },
            logStreamNamePrefix: {
              type: "string"
            },
            kmsKeyId: {
              type: "string"
            },
            tags: {
              type: "array"
            },
            singlePush: {
              type: "boolean"
            }
          }
        }
      }
    };
  }
}

export { CloudWatchLogger };
