export interface IAMPolicyContributor {
  getARNPolicy: (accountId: string, region: string) => {};
}

export interface CloudFormationContributor {
  getCloudFormation: (accountId: string, region: string) => {};
}

export interface CdkContributor {
  getCdkStack: (accountId: string, region: string) => {};
}

export * from "./aws-mixin";
export * from "./cloudwatchlogger";
export * from "./dynamodb";
export * from "./lambdacaller";
export * from "./lambdaserver";
export * from "./s3binary";
export * from "./secretsmanager";
export * from "./sqsqueue";
