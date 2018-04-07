"use strict";

class LambdaCaller {

  _arn: string;
  AWS: any;

  constructor(arn, config : any = {}) {
    if (arn instanceof Object) {
      config = arn;
      arn = config.arn;
    }
    if (!arn) {
      throw new Error("ARN is required");
    }
    this.AWS = require('aws-sdk');
    if (config.region) {
      this.AWS.config.update({
        region: config.region
      });
    }
    if (config['accessKeyId'] !== undefined) {
      this.AWS.config.update({
        accessKeyId: config['accessKeyId'],
        secretAccessKey: config['secretAccessKey']
      });
    }
    this._arn = arn;
  }

  async execute(params, async) {
    if (!params) {
      params = {};
    }
    let invocationType;
    if (async === undefined || !async) {
      invocationType = 'RequestResponse';
    } else {
      invocationType = 'Event';
    }
    let lambda = new this.AWS.Lambda();
    params = {
      FunctionName: this._arn,
      ClientContext: null,
      InvocationType: invocationType,
      LogType: 'None',
      Payload: JSON.stringify(params)
    };
    return lambda.invoke(params).promise();
  }
}

export { LambdaCaller };
