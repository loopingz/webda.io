import { DeploymentManager } from "@webda/shell";
import { DeployerTest } from "@webda/shell/lib/deployers/deployertest";
import { suite, test } from "@testdeck/mocha";
import * as sinon from "sinon";
import { CloudFormationDeployer, LAMBDA_LATEST_VERSION } from "./cloudformation";
import { MockAWSDeployerMethods } from "./index.spec";
import * as assert from "assert";
import * as AWS from "aws-sdk";
import * as AWSMock from "aws-sdk-mock";
import { JSONUtils } from "@webda/core";
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
    resources = JSONUtils.duplicate(resources);
    await this.deployer.defaultResources();
    assert.deepStrictEqual(this.deployer.resources.APIGatewayBasePathMapping, {
      ...resources.APIGatewayDomain,
      BasePath: ""
    });
    assert.deepStrictEqual(this.deployer.resources.APIGatewayDomain, {
      ...resources.APIGatewayDomain,
      SecurityPolicy: "TLS_1_2"
    });
    assert.deepStrictEqual(this.deployer.resources.Lambda, {
      ...resources.Lambda,
      FunctionName: "WebdaSampleApplication",
      Handler: "node_modules/@webda/aws/lib/deployers/lambda-entrypoint.handler",
      MemorySize: 2048,
      Role: { "Fn::GetAtt": ["Role", "Arn"] },
      Runtime: LAMBDA_LATEST_VERSION,
      Timeout: 30
    });
    assert.deepStrictEqual(this.deployer.resources.Policy, {
      ...resources.Policy,
      PolicyDocument: { Statement: [] },
      PolicyName: "WebdaSampleApplicationPolicy",
      Roles: [{ Ref: "Role" }]
    });
    this.deployer.resources.ResourcesToImport = [];
    this.deployer.resources.ChangeSetType = "CREATE";
    await assert.rejects(
      () => this.deployer.defaultResources(),
      /ChangeSetType cannot be anything else than IMPORT if you have ResourcesToImport set/
    );
    this.deployer.resources.ResourcesToImport = [];
    this.deployer.resources.ChangeSetType = undefined;
    this.deployer.resources.APIGatewayStage = {};
    // @ts-ignore
    this.deployer.resources.APIGatewayV2Domain = {};
    // @ts-ignore
    this.deployer.resources.Docker = { tag: "plop" };
    this.deployer.getAWSIdentity = async () => ({
      Account: "mine"
    });
    this.deployer.resources.APIGatewayBasePathMapping.DomainName = "webda.io.";
    this.deployer.resources.APIGatewayV2ApiMapping = { DomainName: "webda.io." };
    // @ts-ignore
    this.deployer.resources.Statics = [{ Source: "/plop" }];
    await this.deployer.defaultResources();
    this.deployer.resources.AssetsBucket = undefined;
    await assert.rejects(() => this.deployer.defaultResources(), /AssetsBucket must be defined/);
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
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.json"
    });
    this.deployer.resources.AssetsPrefix = "/plop/";
    this.deployer.resources.FileName = "123.json";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.json"
    });
    this.deployer.resources.FileName = "123";
    this.deployer.resources.Format = "YAML";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.yml"
    });
    this.deployer.resources.FileName = "123.yml";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.yml"
    });
    this.deployer.resources.FileName = "123.taml";
    this.deployer.result = {};
    await this.deployer.sendCloudFormationTemplate();
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
      Bucket: "webda",
      Key: "plop/123.taml.yml"
    });
    this.deployer.resources.FileName = "123.yaml";
    this.deployer.result = {};
    this.deployer.resources.AssetsPrefix = "";
    await this.deployer.sendCloudFormationTemplate();
    assert.deepStrictEqual(this.deployer.result.CloudFormation, {
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
    resources.CustomResources = {
      MyResource: { Type: "Test" }
    };
    let uploadStatics = sinon.stub(this.deployer, "uploadStatics");
    let createCloudFormation = sinon.stub(this.deployer, "createCloudFormation");
    let sendCloudFormation = sinon.stub(this.deployer, "sendCloudFormationTemplate");
    let generateLambdaPackage = sinon.stub(this.deployer, "generateLambdaPackage");
    sendCloudFormation.callsFake(async () => {
      this.deployer.result.CloudFormation = {
        Bucket: "plop",
        Key: "mycf.json"
      };
    });
    generateLambdaPackage.callsFake(async () => {
      return {
        Bucket: "fake",
        Key: "lambda.zip"
      };
    });
    await this.deployer.defaultResources();
    try {
      AWSMock.mock("APIGateway", "putRestApi", (p, c) => c(null, {}));

      console.log("Launch deploy", this.deployer.uploadStatics);
      this.deployer.resources.Docker = {
        tag: "plop",
        includeRepository: false
      };
      this.deployer.resources.APIGatewayImportOpenApi = "yop";
      sinon.stub(this.deployer.manager, "run").callsFake(async () => {});
      await this.deployer.deploy();
      console.log("Launch deploy done");
      assert.strictEqual(sendCloudFormation.calledOnce, true);
      assert.strictEqual(generateLambdaPackage.calledOnce, true);
      await this.deployer.sleep(0.001);
    } finally {
      AWSMock.restore();
    }
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
      assert.strictEqual(this.mocks["deleteStack"].calledOnce, true);
      assert.strictEqual(this.mocks["waitFor"].calledOnce, true);
      assert.strictEqual(this.mocks["describeStacks"].calledTwice, true);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async testInit() {
    let logs = [];
    let console = {
      app: {
        getAppPath: () => {
          return "./noexisting";
        }
      },
      log: (...args) => {
        logs.push(args);
      }
    };
    try {
      let caller = sinon.stub().callsFake(c => {
        if (caller.callCount === 1) {
          c(new Error("Bad"), null);
        }
        c(null, { Account: "myAccount" });
      });
      let saver = sinon.stub(JSONUtils, "saveFile").callsFake(() => {});
      AWSMock.mock("STS", "getCallerIdentity", caller);
      let stub = sinon.stub().callsFake((_, c) => {
        c(null, {});
      });
      AWSMock.mock("CloudFormation", "createStack", stub);
      assert.ok((await CloudFormationDeployer.init(console)) === -1);
      assert.deepStrictEqual(logs[0], ["ERROR", "package.json not found"]);
      console.app.getAppPath = () => "./test/package.json";
      assert.ok((await CloudFormationDeployer.init(console)) === -1);
      assert.deepStrictEqual(logs[1], [
        "ERROR",
        "Cannot retrieve your AWS credentials, make sure to have a correct AWS setup"
      ]);
      logs = [];
      assert.ok((await CloudFormationDeployer.init(console)) === 0);
      assert.strictEqual(saver.getCall(0).args[0].webda.aws.AssetsBucket, "webda-webda-testor-assets");
      assert.strictEqual(saver.getCall(0).args[0].webda.aws.Repository, "webda-webda-testor");
      console.app.getAppPath = () => "./test/package-initiated.json";
      logs = [];
      assert.ok((await CloudFormationDeployer.init(console)) === -1);
      assert.deepStrictEqual(logs[0], ["WARN", "Default information are already in your package.json"]);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async createCloudFormation() {
    try {
      let describeChangeSetResult: any = { Status: "ROLLBACK_COMPLETE" };
      let describeStackEventsResult: any = {
        StackEvents: [
          { EventId: "123", LogicalResourceId: this.deployer.resources.StackName, ResourceStatus: "IN_PROGRESS" }
        ]
      };
      let logs = sinon.stub(this.deployer.logger, "log");
      sinon.stub(this.deployer, "waitFor").callsFake(callback => {
        return new Promise((resolve, reject) => {
          callback(resolve, reject);
        });
      });
      sinon.stub(this.deployer, "createCloudFormationChangeSet").callsFake(async () => "mychange");
      AWSMock.mock("CloudFormation", "describeChangeSet", (_, c) => {
        c(null, describeChangeSetResult);
      });
      AWSMock.mock("CloudFormation", "executeChangeSet", (_, c) => {
        c(null, { Status: "" });
      });
      AWSMock.mock("CloudFormation", "describeStackEvents", (_, c) => {
        c(null, describeStackEventsResult);
        describeStackEventsResult.StackEvents.unshift({
          EventId: "123",
          ResourceType: "any",
          LogicalResourceId: this.deployer.resources.StackName,
          ResourceStatus: "UPDATE_ROLLBACK_COMPLETE"
        });
      });
      AWSMock.mock("CloudFormation", "listStackResources", (_, c) => {
        c(null, {
          StackResourceSummaries: [
            { ResourceType: "AWS::ApiGateway::Stage", PhysicalResourceId: "stage" },
            { ResourceType: "AWS::ApiGateway::RestApi", PhysicalResourceId: "restApi" }
          ]
        });
      });
      let createDeployment = sinon.stub().callsFake((_, c) => c(null, {}));
      AWSMock.mock("APIGateway", "createDeployment", createDeployment);
      // First scenario we have a 'ROLLBACK_COMPLETE', an error occured
      await assert.rejects(() => this.deployer.createCloudFormation());
      // 'FAILED' scenario with unknown error
      logs.resetHistory();
      describeChangeSetResult.Status = "FAILED";
      describeChangeSetResult.StatusReason = "plop";
      await this.deployer.createCloudFormation();
      assert.deepStrictEqual(logs.getCall(1).args, ["ERROR", "Cannot execute ChangeSet:", "plop"]);
      // 'FAILED' scenario because no changes to be made
      describeChangeSetResult.StatusReason =
        "The submitted information didn't contain changes. Submit different information to create a change set.";
      logs.resetHistory();
      await this.deployer.createCloudFormation();
      assert.deepStrictEqual(logs.getCall(1).args, ["INFO", "No changes to be made"]);
      // 'CREATE_COMPLETE' scenario
      logs.resetHistory();
      describeChangeSetResult.Status = "CREATE_COMPLETE";
      describeChangeSetResult.Changes = [
        { Type: "Resource", ResourceChange: { Action: "Create", ResourceType: "Fake", LogicalResourceId: "FakeId" } },
        { Type: "Plop" }
      ];
      await this.deployer.createCloudFormation();
      assert.deepStrictEqual(createDeployment.getCall(0).args[0], { restApiId: "restApi", stageName: "stage" });
      // 'TIMEOUT'
      this.deployer.sleep = async () => {};
      describeStackEventsResult.StackEvents = [];
      AWSMock.remock("CloudFormation", "describeStackEvents", (_, c) => {
        c(null, describeStackEventsResult);
      });
      await this.deployer.createCloudFormation();
      assert.ok(createDeployment.callCount === 1);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async uploadStatics() {
    sinon.stub(this.deployer, "putFolderOnBucket").callsFake(async () => {});
    this.deployer.resources.Statics = [
      // @ts-ignore
      { Source: "//", AssetsPath: "//" }
    ];
    await this.deployer.uploadStatics();
  }

  @test
  async generateLambdaPackage() {
    let run = sinon.stub(this.deployer.manager, "run").callsFake(async () => {});
    let unlink = sinon.stub(require("fs"), "unlinkSync").callsFake(async () => {});
    try {
      this.deployer.resources.KeepPackage = false;
      await this.deployer.generateLambdaPackage();
      this.deployer.resources.KeepPackage = true;
      await this.deployer.generateLambdaPackage();
    } finally {
      unlink.restore();
      run.restore();
    }
  }

  @test
  async createCloudFormationChangeSet() {
    try {
      let describeStacksResult = { Stacks: [{ StackStatus: "ZZ" }] };
      this.deployer.result.CloudFormation = {
        Bucket: "Bucket",
        Key: "mykey"
      };
      AWSMock.mock("CloudFormation", "createChangeSet", (p, c) => c(null, {}));
      AWSMock.mock("CloudFormation", "describeStacks", (p, c) => c(null, describeStacksResult));
      sinon.stub(this.deployer, "deleteCloudFormation").callsFake(async () => {});
      AWSMock.mock("CloudFormation", "deleteChangeSet", (p, c) => c(null, {}));
      let cloudformation = new AWS.CloudFormation();
      // Nominal case
      await this.deployer.createCloudFormationChangeSet(cloudformation);
      // With error
      let testError;
      let errorFirst = sinon.stub().callsFake((p, c) => {
        if (errorFirst.callCount === 1) {
          c(testError, null);
        } else {
          c(null, {});
        }
      });
      AWSMock.remock("CloudFormation", "createChangeSet", errorFirst);
      testError = new Error("plop is in ROLLBACK_COMPLETE state and can not be updated.");
      // Should still go through with a bugous stack
      await this.deployer.createCloudFormationChangeSet(cloudformation);
      // Non-existing stack
      testError = new Error(`Stack [${this.deployer.resources.StackName}] does not exist`);
      errorFirst.resetHistory();
      await this.deployer.createCloudFormationChangeSet(cloudformation);
      // Change set exist
      testError = new Error();
      testError.code = "AlreadyExistsException";
      errorFirst.resetHistory();
      await this.deployer.createCloudFormationChangeSet(cloudformation);
      // True error
      testError = new Error("Unknown");
      errorFirst.resetHistory();
      await assert.rejects(() => this.deployer.createCloudFormationChangeSet(cloudformation), /Unknown/);
      // Test with stack status
      testError = new Error("bouzouf state and can not be updated.");
      sinon.stub(this.deployer, "waitFor").callsFake(callback => {
        return new Promise(async (resolve, reject) => {
          if (!(await callback(resolve, reject))) {
            reject("BAD");
          }
        });
      });
      errorFirst.resetHistory();
      await assert.rejects(() => this.deployer.createCloudFormationChangeSet(cloudformation), /BAD/);
      describeStacksResult = { Stacks: [{ StackStatus: "ANY_COMPLETE" }] };
      errorFirst.resetHistory();
      await this.deployer.createCloudFormationChangeSet(cloudformation);
      describeStacksResult = { Stacks: [] };
      errorFirst.resetHistory();
      await this.deployer.createCloudFormationChangeSet(cloudformation);
    } finally {
      AWSMock.restore();
    }
  }

  @test
  async createStatic() {
    this.deployer.template = { Resources: {} };
    await this.deployer.createStatic({ Bucket: { Tags: {} }, DomainName: "webda.io" });
    assert.deepStrictEqual(this.deployer.template.Resources[`StaticwebdaioBucket`], {
      Type: "AWS::S3::Bucket",
      Properties: {
        BucketName: "webda.io",
        Tags: [
          {
            Key: "test",
            Value: "webda3"
          }
        ]
      }
    });
  }

  @test
  async APIGatewayDomain() {
    this.deployer.template = { Resources: {} };
    this.deployer.resources.APIGatewayDomain.EndpointConfiguration = {
      Types: ["EDGE"]
    };
    sinon.stub(this.deployer, "createCloudFormationDNSEntry");
    await this.deployer.APIGatewayDomain();
  }

  @test
  async createCloudFormationDNSEntry() {
    this.mocks.getZoneForDomainName.callsFake(async () => {
      return undefined;
    });
    await this.deployer.createCloudFormationDNSEntry(undefined, "plop.com", undefined);
  }
}
