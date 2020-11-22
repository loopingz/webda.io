import { CloudFormationDeployer } from "../deployers/cloudformation";

/**
 * Interface that allow a Service to define specific AWS permissions
 */
export interface IAMPolicyContributor {
  /**
   * 
   * @param accountId The account where the application is being deployed
   * @param region The region where the application is being deployed
   */
  getARNPolicy: (accountId: string, region: string) => {};
}

/**
 * Allow a service to contribute to the CloudFormation template
 */
export interface CloudFormationContributor {
  /**
   * 
   * {@link S3Binary.getCloudFormation}
   * @param deployer The current deployer asking for contribution
   */
  getCloudFormation: (deployer: CloudFormationDeployer) => {};
}

export * from "./aws-mixin";
export * from "./cloudwatchlogger";
export * from "./dynamodb";
export * from "./lambdaserver";
export * from "./s3binary";
export * from "./secretsmanager";
export * from "./sqsqueue";
export * from "./lambdacaller";
