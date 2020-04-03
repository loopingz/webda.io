import { Packager } from "@webda/shell";
import * as path from "path";

/**
 * Package a Lambda function
 */
export class LambdaPackager extends Packager {
  async loadDefaults() {
    this.resources.entrypoint = this.resources.entrypoint || path.join(__dirname, "aws-entrypoint.js");
  }
}
