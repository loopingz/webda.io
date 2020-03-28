import { Context, ModdaDefinition } from "@webda/core";
import { Deployer } from "@webda/shell";

class CustomDeployer extends Deployer {
  test(ctx: Context) {
    ctx.write("Tested");
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "WebdaDemo/CustomDeployer",
      category: "deployers",
      label: "Fake deployer for demo purpose",
      description: "",
      logo: "",
      configuration: {}
    };
  }
}

// Old style exports for testing purpose
module.exports = CustomDeployer;
