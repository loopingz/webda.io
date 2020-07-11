import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployer.spec";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { CloudFormationDeployer } from "./cloudformation";
import { MockAWSDeployerMethods } from "./index.spec";
import * as assert from "assert";
import { LambdaPackager } from "./lambdapackager";
import * as AWS from "aws-sdk";
import * as AWSMock from "aws-sdk-mock";
@suite
class CloudFormationDeployerTest extends DeployerTest<CloudFormationDeployer> {
  mocks: { [key: string]: sinon.stub } = {};

  async getDeployer(manager: DeploymentManager): Promise<CloudFormationDeployer> {
    let deployer = await (<any>manager.getDeployer("WebdaSampleApplication"));
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
    this.deployer.resources.AssetsPrefix = "/plop/";
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
    this.deployer.resources.AssetsPrefix = "";
    await this.deployer.sendCloudFormationTemplate();
    assert.deepEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "123.yaml"
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
    let uploadStatics = sinon.stub(this.deployer, "uploadStatics");
    let createCloudFormation = sinon.stub(this.deployer, "createCloudFormation");
    let sendCloudFormation = sinon.stub(this.deployer, "sendCloudFormationTemplate");
    sendCloudFormation.callsFake(async () => {
      this.deployer.result.CloudFormation = {
        Bucket: "plop",
        Key: "mycf.json"
      };
    });
    console.log("Launch default resources");
    await this.deployer.defaultResources();
    console.log("Launch deploy", this.deployer.uploadStatics);
    await this.deployer.deploy();
    assert.equal(sendCloudFormation.calledOnce, true);
  }

  @test
  async testDeleteCloudFormation() {
    this.mocks["deleteStack"] = sinon.stub().callsFake((params, c) => {
      c(null, {});
    });
    this.mocks["describeStacks"] = sinon.stub().callsFake((params, c) => {
      if (this.mocks["describeStacks"].callCount > 1) {
        throw new Error();
      }
      c(null, {});
    });
    this.mocks["waitFor"] = sinon.stub(this.deployer, "waitFor").callsFake(async c => {
      await c(() => {});
      await c(() => {});
    });
    try {
      AWSMock.mock("CloudFormation", "deleteStack", this.mocks["deleteStack"]);
      AWSMock.mock("CloudFormation", "describeStacks", this.mocks["describeStacks"]);
      await this.deployer.deleteCloudFormation();
      assert.equal(this.mocks["deleteStack"].calledOnce, true);
      assert.equal(this.mocks["waitFor"].calledOnce, true);
      assert.equal(this.mocks["describeStacks"].calledTwice, true);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  testCreateCloudFormation() {}
}
