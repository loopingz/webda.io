import { CloudFormationDeployer } from "../deployers/cloudformation";

export interface IAMPolicyContributor {
  getARNPolicy: (accountId: string, region: string) => {};
}

export interface CloudFormationContributor {
  getCloudFormation: (deployer: CloudFormationDeployer) => {};
}

export interface CdkContributor {
  getCdkStack: (accountId: string, region: string) => {};
}

export * from "./aws-mixin";
export * from "./cloudwatchlogger";
export * from "./dynamodb";
export * from "./lambdaserver";
export * from "./s3binary";
export * from "./secretsmanager";
export * from "./sqsqueue";
export * from "./lambdacaller";
