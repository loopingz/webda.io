import { Context, DeployerResources } from "@webda/core";
import { Deployer } from "@webda/shell";

/**
 * @WebdaDeployer
 */

export class CustomDeployer extends Deployer<DeployerResources> {
  test(ctx: Context) {
    ctx.write("Tested");
  }

  async deploy() {}
}
