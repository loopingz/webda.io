import { Context, DeployerResources, ModdaDefinition, Deployer as DeployerDefinition } from "@webda/core";
import { Deployer } from "@webda/shell";
import { JSONSchema6 } from "json-schema";

@DeployerDefinition
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

  static getModda(): ModdaDefinition {
    return {
      uuid: "WebdaDemo/CustomDeployer",
      category: "deployers",
      label: "Fake deployer for demo purpose",
      description: ""
    };
  }
}

// Old style exports for testing purpose
module.exports = CustomDeployer;
