import { Deployer } from "@webda/core";
import { Packager, PackagerResources } from "@webda/shell";
import * as path from "path";

/**
 * Lambda Packager options
 */
export interface LambdaPackagerResources extends PackagerResources {
  /**
   * Lambda include already the AWS-SDK
   * By default we exclude the aws-sdk
   *
   * @defaut false
   */
  customAwsSdk?: boolean;
}

/**
 * Package a Lambda function
 *
 * It uses the normmal Packager and just add the default entrypoint
 * And the exclusion of aws-sdk by default
 */
@Deployer
export default class LambdaPackager extends Packager<LambdaPackagerResources> {
  /**
   * Define the default resources
   */
  async loadDefaults() {
    await super.loadDefaults();
    this.resources.entrypoint = this.resources.entrypoint || path.join(__dirname, "lambda-entrypoint.js");
    // Exclude aws-sdk by default
    if (!this.resources.customAwsSdk) {
      this.resources.package.modules.excludes.push("aws-sdk");
    }
  }
}

export { LambdaPackager };
