import { Service, Core as Webda } from "../index";
const AWS = require("aws-sdk");

type Constructor<T extends Service> = new (...args: any[]) => T;

function GetAWS(params: any) {
  if (!params.accessKeyId) {
    params.accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
    params.secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
    params.sessionToken = process.env["AWS_SESSION_TOKEN"];
  }
  params.region =
    params.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
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

function AWSMixIn<T extends Constructor<Service>>(Base: T) {
  return class extends Base {
    _getAWS(params = undefined) {
      return GetAWS(params || this._params || {});
    }
  };
}

export { AWSMixIn, Constructor, GetAWS };
