import { Packager } from "@webda/shell";
import * as path from "path";

/**
 * Package a Lambda function
 */
export default class LambdaPackager extends Packager {
  async loadDefaults() {
    this.resources.entrypoint = this.resources.entrypoint || path.join(__dirname, "lambda-entrypoint.js");
  }
}

export { LambdaPackager };
