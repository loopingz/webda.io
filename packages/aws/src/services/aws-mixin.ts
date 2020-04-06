import { Service } from "@webda/core";
const AWS = require("aws-sdk");

export function GetAWS(params: any) {
  if (!params.accessKeyId && !process.env["ECS_CLUSTER"]) {
    // If in ECS_CLUSTER then rely on metadata service
    params.accessKeyId = process.env["AWS_ACCESS_KEY_ID"];
    params.secretAccessKey = process.env["AWS_SECRET_ACCESS_KEY"];
    params.sessionToken = process.env["AWS_SESSION_TOKEN"];
  }
  params.region = params.region || process.env["AWS_DEFAULT_REGION"] || "us-east-1";
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
