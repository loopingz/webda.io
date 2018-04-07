import { Service } from '../index';
const AWS = require('aws-sdk');

type Constructor<T extends Service> = new(...args: any[]) => T;

function AWSMixIn<T extends Constructor<Service>>(Base: T) {
    return class extends Base {
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
}
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

export { AWSServiceMixIn, AWSMixIn };
