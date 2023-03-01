import { DeployerResources, OperationContext } from "@webda/core";
import { Deployer } from "@webda/shell";

/**
 * @WebdaDeployer
 */
export class CustomDeployer extends Deployer<DeployerResources> {
  test(ctx: OperationContext) {
    ctx.write("Tested");
  }

  async deploy() {}
}
