import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import { suite, test } from "mocha-typescript";
import * as sinon from "sinon";
import { CloudFormationDeployer } from "./cloudformation";
import { MockAWSDeployerMethods } from "./index.spec";

@suite
class CloudFormationDeployerTest extends DeployerTest<CloudFormationDeployer> {
  mocks: { [key: string]: sinon.stub } = {};

  async getDeployer(manager: DeploymentManager): Promise<CloudFormationDeployer> {
    let deployer = await (<any>manager.getDeployer("Application"));
    MockAWSDeployerMethods(deployer, this);
    return <CloudFormationDeployer>deployer;
  }

  @test
  async defaultResources() {
    let resources = this.deployer.resources;
    resources.Lambda = {};
    resources.APIGateway = {};
    resources.APIGatewayDomain = { DomainName: "webda.io" };
    resources.Policy = {};
    resources.APIGatewayBasePathMapping = {};
    await this.deployer.defaultResources();
  }

  @test
  async deploy() {
    let resources = this.manager.deployers.Application;
    resources.Lambda = {};
    resources.Resources = {};
    resources.APIGateway = { DomainName: "webda.io" };
    resources.APIGatewayDomain = {};
    resources.Policy = {};
    resources.Role = {};
    resources.Fargate = {};
    resources.Tags = [{ Key: "test", Value: "test" }];
    let result = await this.deployer.deploy();
    console.log(JSON.stringify(result, undefined, 2));
  }
}
