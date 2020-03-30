import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import { suite, test } from "mocha-typescript";
import { CloudFormationDeployer } from "./cloudformation";

@suite
class CloudFormationDeployerTest extends DeployerTest<CloudFormationDeployer> {
  getDeployer(manager: DeploymentManager) {
    return <any>manager.getDeployer("Application");
  }

  @test
  async deploy() {
    let resources = this.manager.deployers.Application;
    resources.Lambda = {};
    this.deployer = <any>await this.manager.getDeployer("Application");
    let result = await this.deployer.deploy();
    console.log(JSON.stringify(result, undefined, 2));
  }
}
