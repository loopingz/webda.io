/**
 * Minimal view of the CloudFormation deployer used by contributors
 *
 * Services only rely on this shape so they do not import the deployer
 */
export interface CloudFormationDeployerInfo {
  /**
   * Merge the deployment default tags with the resource tags
   * @param tags - resource specific tags
   */
  getDefaultTags(tags?: any): any;
  [key: string]: any;
}

/**
 * Interface that allow a Service to define specific AWS permissions
 */
export interface IAMPolicyContributor {
  /**
   *
   * @param accountId The account where the application is being deployed
   * @param region The region where the application is being deployed
   */
  getARNPolicy: (accountId: string, region: string) => object;
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
  getCloudFormation: (deployer: CloudFormationDeployerInfo) => object;
}
