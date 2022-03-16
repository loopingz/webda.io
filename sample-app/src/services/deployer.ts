import { Context, DeployerResources } from "@webda/core";
import { Deployer } from "@webda/shell";
import { JSONSchema6 } from "json-schema";

/**
 * @WebdaDeployer
 */

class CustomDeployer extends Deployer<DeployerResources> {
  test(ctx: Context) {
    ctx.write("Tested");
  }

  async deploy() {}

  static getSchema(): JSONSchema6 {
    return {
      title: "CustomDeployer"
    };
  }
}

// Old style exports for testing purpose
module.exports = CustomDeployer;
