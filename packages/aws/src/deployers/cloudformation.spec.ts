import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import { suite, test } from "mocha-typescript";
import * as sinon from "sinon";
import { CloudFormationDeployer } from "./cloudformation";
import { MockAWSDeployerMethods } from "./index.spec";
import * as assert from "assert";
import { LambdaPackager } from "./lambdapackager";

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
  async testSendCloudFormationTemplate() {
    this.deployer.resources.AssetsBucket = "webda";
    this.deployer.resources.AssetsPrefix = "plop/";
    this.deployer.resources.FileName = "123";
    this.deployer.template = {
      fake: true
    };
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.json"
    });
    this.deployer.resources.FileName = "123.json";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.json"
    });
    this.deployer.resources.FileName = "123";
    this.deployer.resources.Format = "YAML";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.yml"
    });
    this.deployer.resources.FileName = "123.yml";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.yml"
    });
    this.deployer.resources.FileName = "123.taml";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.taml.yml"
    });
    this.deployer.resources.FileName = "123.yaml";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.yaml"
    });
  }

  @test
  async testDeploy() {
    let resources = this.deployer.resources;
    resources.Lambda = {};
    resources.Resources = {};
    resources.APIGateway = {};
    resources.APIGatewayDomain = {
      DomainName: "webda.io"
    };
    resources.Policy = {};
    resources.Role = {};
    resources.Fargate = {};
    resources.Tags = [{ Key: "test", Value: "test" }];
    let sendCloudFormation = sinon.stub(this.deployer, "sendCloudFormationTemplate");
    await this.deployer.deploy();
    console.log(JSON.stringify(this.deployer.template, undefined, 2));
    assert.equal(sendCloudFormation.calledOnce, true);
  }
}
