import {
  Logger,
  AWSMixIn,
  Core as Webda,
  Service
} from '../index';
import * as uuid from 'uuid';

export class FakeLogger extends Logger {
  _log(level, ...args): void {

  }
}

class CloudWatchLogger extends AWSMixIn(FakeLogger) {

  _logGroupName: string;
  _logStreamName: string;
  _seqToken: string;
  _logStream: any;
  _cloudwatch: any;
  _bufferedLogs: any[] = [];

  async init(): Promise < void > {
    await super.init();
    this._logGroupName = this._params.logGroupName;
    if (!this._logGroupName) {
      throw Error('Require a log group `logGroupName` parameter');
    }
    this._logStreamName = this._params.logStreamNamePrefix + uuid.v4();
    this._cloudwatch = new(this._getAWS(this._params)).CloudWatchLogs();
    let res = await this._cloudwatch.describeLogGroups({
      logGroupNamePrefix: this._logGroupName
    }).promise();
    if (!res.logGroups.length) {
      await this._cloudwatch.createLogGroup({
        logGroupName: this._logGroupName,
        kmsKeyId: this._params.kmsKeyId,
        tags: this._params.tags
      }).promise();
    }
    this._logStream = await this._cloudwatch.createLogStream({
      logGroupName: this._logGroupName,
      logStreamName: this._logStreamName
    }).promise();
    this._webda.on('Webda.Result', this.sendLogs.bind(this));
  }

  async sendLogs(copy: boolean = false): Promise < void > {
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
    let msg = `[${level}] ` + args.join(' ');
    this._bufferedLogs.push({
      message: msg,
      timestamp: new Date().getTime()
    });
    if (this._params.singlePush) {
      this.sendLogs(true);
    }
  }

  getARNPolicy(accountId) {
    let region = this._params.region || 'us-east-1';
    return {
      "Sid": this.constructor.name + this._name,
      "Effect": "Allow",
      "Action": [
        "logs:*"
      ],
      "Resource": [
        'arn:aws:logs:' + region + ':' + accountId + ':log-group:' + this._params.logGroupName,
        'arn:aws:logs:' + region + ':' + accountId + ':log-group:' + this._params.logGroupName + ':*:*'
      ]
    }
  }

  static getModda() {
    return {
      "uuid": "Webda/CloudWatchLogger",
      "label": "CloudWatchLogger",
      "description": "Output to a logstream in CloudWatch",
      "webcomponents": [],
      "logo": "images/icons/none.png",
      "configuration": {
        "schema": {
          type: "object",
          properties: {
            "logLevel": {
              type: "string",
              value: "INFO"
            },
            "logLevels": {
              type: "string",
              value: "ERROR,WARN,CONSOLE,INFO,DEBUG"
            },
            "logGroupName": {
              type: "string",
            },
            "logStreamNamePrefix": {
              type: "string",
            },
            "kmsKeyId": {
              type: "string",
            },
            "tags": {
              type: "array",
            },
            "singlePush": {
              type: "boolean"
            }
          }
        }
      }
    }
  }
}

export {
  CloudWatchLogger
};
