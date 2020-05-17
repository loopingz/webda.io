import { Packager, PackagerResources } from "@webda/shell";
import * as path from "path";

/**
 * Lambda Packager options
 */
export interface LambdaPackagerResources extends PackagerResources {
  customAwsSdk?: boolean;
}

/**
 * Package a Lambda function
 */
export default class LambdaPackager extends Packager<LambdaPackagerResources> {
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
