import { CloudWatchLogs } from "@aws-sdk/client-cloudwatch-logs";
import { Service, ServiceParameters, useCoreEvents } from "@webda/core";
import { LogFilter, useWorkerOutput, WorkerLogLevel, WorkerMessage } from "@webda/workout";
import { randomUUID } from "node:crypto";
import { AWSServiceParameters, loadAWSParameters } from "./aws-parameters.js";
import type { CloudFormationContributor } from "./contributors.js";

/**
 * Send webda log to CloudWatch
 */
export class CloudWatchLoggerParameters extends ServiceParameters implements AWSServiceParameters {
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
   * logGroupName to send logStream to
   */
  logGroupName: string;
  /**
   * Prefix of the log stream name, a random uuid is appended
   */
  logStreamNamePrefix?: string;
  /**
   * KMS key to use when creating the log group
   */
  kmsKeyId?: string;
  /**
   * Tags to add when creating the log group
   */
  tags?: any;
  /**
   * Minimum level of logs to send
   * @default "INFO"
   */
  logLevel?: WorkerLogLevel;
  /**
   * Send each log line as soon as it is produced
   */
  singlePush?: boolean;
  /**
   * CloudFormation customization
   */
  CloudFormation?: any;
  /**
   * Skip CloudFormation on deploy
   */
  CloudFormationSkip?: boolean;

  /**
   * @override
   * @param params - raw parameters
   * @returns this
   */
  load(params: any = {}): this {
    super.load(params);
    loadAWSParameters(this);
    this.logLevel ??= "INFO";
    return this;
  }
}

/**
 * Output log to a CloudWatch Stream
 *
 * @WebdaModda
 */
export class CloudWatchLogger<T extends CloudWatchLoggerParameters = CloudWatchLoggerParameters>
  extends Service<T>
  implements CloudFormationContributor
{
  _logGroupName: string;
  _logStreamName: string;
  _seqToken: string;
  _logStream: any;
  _cloudwatch: CloudWatchLogs;
  _bufferedLogs: any[] = [];
  /**
   * Listener on the worker output
   */
  protected messageListener: (msg: WorkerMessage) => void;
  /**
   * Unsubscribe from the Webda.Result core event
   */
  protected resultListenerOff: () => void;

  /**
   * Create the log group and stream, then forward the logs
   * @returns this
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
    this.removeListeners();
    this.messageListener = (msg: WorkerMessage) => {
      if (msg.type !== "log") {
        return;
      }
      if (LogFilter(msg.log.level, this.parameters.logLevel)) {
        this._log(msg.log.level, ...msg.log.args);
      }
    };
    useWorkerOutput().on("message", this.messageListener);
    this.resultListenerOff = useCoreEvents("Webda.Result", () => this.sendLogs());
    return this;
  }

  /**
   * Remove the log and result listeners
   */
  protected removeListeners() {
    if (this.messageListener) {
      useWorkerOutput().off("message", this.messageListener);
      this.messageListener = undefined;
    }
    this.resultListenerOff?.();
    this.resultListenerOff = undefined;
  }

  /**
   * Flush the logs and stop forwarding
   * @override
   */
  async stop(): Promise<void> {
    this.removeListeners();
    await this.sendLogs();
    await super.stop();
  }

  /**
   * Send logs to CloudWatch
   *
   * @param copy - send a copy of the buffer and reset it before sending
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
   * Buffer a log line
   * @param level - log level
   * @param args - log arguments
   */
  _log(level: WorkerLogLevel, ...args: any[]): void {
    this._bufferedLogs.push({
      message: `[${level}] ` + args.map(p => (p ? p.toString() : "undefined")).join(" "),
      timestamp: new Date().getTime()
    });
    if (this.parameters.singlePush) {
      this.sendLogs(true).catch(() => {
        // Ignore send errors to avoid logging loops
      });
    }
  }

  /**
   * IAM policy required by the service
   * @param accountId - AWS account id
   * @returns the policy statement
   */
  getARNPolicy(accountId: string) {
    const region = this.parameters.region || "us-east-1";
    return {
      Sid: this.constructor.name + this.getName(),
      Effect: "Allow",
      Action: ["logs:*"],
      Resource: [
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this.parameters.logGroupName,
        "arn:aws:logs:" + region + ":" + accountId + ":log-group:" + this.parameters.logGroupName + ":*:*"
      ]
    };
  }

  /**
   * CloudFormation resources for the log group
   * @returns the resources
   */
  getCloudFormation() {
    if (this.parameters.CloudFormationSkip) {
      return {};
    }
    const resources = {};
    this.parameters.CloudFormation = this.parameters.CloudFormation || {};
    resources[this.getName() + "LogGroup"] = {
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

export default CloudWatchLogger;
