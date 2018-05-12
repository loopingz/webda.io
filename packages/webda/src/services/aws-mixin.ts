import {
  Service,
  Core as Webda
} from '../index';
const AWS = require('aws-sdk');

type Constructor < T extends Service > = new(...args: any[]) => T;

function AWSMixIn < T extends Constructor < Service >> (Base: T) {
  return class extends Base {
    _getAWS(params) {
      params = params || this._params || {};
      params.accessKeyId = params.accessKeyId || process.env["AWS_ACCESS_KEY_ID"];
      params.secretAccessKey = params.secretAccessKey || process.env["AWS_SECRET_ACCESS_KEY"];
      params.sessionToken = params.sessionToken || process.env["AWS_SESSION_TOKEN"];
      params.region = params.region || process.env["AWS_DEFAULT_REGION"] || 'us-east-1';
      let update: any = {
        region: params.region
      };
      if (params.accessKeyId) {
        update.accessKeyId = params.accessKeyId;
        update.sessionToken = params.sessionToken;
        update.secretAccessKey = params.secretAccessKey;
      }
      AWS.config.update(update);
      return AWS;
    }
  }
}

export {
  AWSMixIn,
  Constructor
};
