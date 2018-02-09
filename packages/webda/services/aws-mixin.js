"use strict";
const AWS = require('aws-sdk');
const AWSServiceMixIn = Sup => class extends Sup {

  _getAWS(params) {
    params = params || this._params || {};
    params.accessKeyId = params.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
    params.secretAccessKey = params.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
    params.region = params.region || process.env["AWS_DEFAULT_REGION"] || 'us-east-1';
    AWS.config.update({
      accessKeyId: params.accessKeyId,
      secretAccessKey: params.secretAccessKey,
      region: params.region
    });
    return AWS;
  }

}

module.exports = AWSServiceMixIn;
