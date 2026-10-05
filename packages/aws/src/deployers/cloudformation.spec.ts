import { APIGateway, CreateDeploymentCommand, PutRestApiCommand } from "@aws-sdk/client-api-gateway";
import {
  CloudFormation,
  CreateChangeSetCommand,
  DeleteChangeSetCommand,
  DeleteStackCommand,
  DescribeChangeSetCommand,
  DescribeStackEventsCommand,
  DescribeStacksCommand,
  ExecuteChangeSetCommand,
  ListStackResourcesCommand
} from "@aws-sdk/client-cloudformation";
import { Service } from "@webda/core";
import { WebdaApplicationTest } from "@webda/core/lib/test/index.js";
import { suite, test } from "@webda/test";
import * as assert from "assert";
import { mockClient } from "aws-sdk-client-mock";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import * as YAML from "yaml";
import { fastWait } from "../../test/fixture.js";
import {
  CLOUDFORMATION_SECTIONS,
  CloudFormationDeployer,
  CloudFormationDeployerParameters,
  LAMBDA_LATEST_VERSION
} from "./cloudformation.service.js";
import { LAMBDA_DEFAULT_HANDLER } from "./lambdapackager.service.js";

/**
 * Service contributing to the CloudFormation template
 */
class TemplateContributor extends Service {
  /**
   * @param deployer - the deployer
   * @returns a bucket resource
   */
  getCloudFormation(deployer: any) {
    return {
      Bucket: { Type: "AWS::S3::Bucket", Properties: { Tags: deployer.getDefaultTags([]) } }
    };
  }
}

/**
 * Unit of the sample application Production deployment
 */
const SAMPLE_UNIT = {
  type: "Webda/CloudFormationDeployer",
  AssetsBucket: "webda-sample-app-artifacts",
  FargateCluster: "webda-demo",
  Tags: { test: "webda3" },
  Certificates: { "sampleapp.webda.io": { alt: ["*.sampleapp.webda.io"] } },
  Lambda: { FunctionName: "webda-sample-app", Tags: { updater: "test" } },
  Resources: {},
  APIGateway: {},
  APIGatewayDomain: { DomainName: "api.sampleapp.webda.io." },
  Statics: [{ DomainName: "sampleapp.webda.io", CloudFront: {}, Source: "wui" }],
  Docker: "",
  Workers: [{ FargateCluster: "webda-demo", FargateService: { Name: "webda-demo-workers" }, FargateTaskDefinition: {} }]
};

@suite
class CloudFormationDeployerTest extends WebdaApplicationTest {
  deployer: CloudFormationDeployer;
  mocks: { restore: () => void }[] = [];

  getTestConfiguration(): any {
    return {
      version: 3,
      parameters: {},
      services: {
        Contributor: { type: "Test/TemplateContributor" }
      }
    };
  }

  async tweakApp(app: any) {
    await super.tweakApp(app);
    app.addModda("Test/TemplateContributor", TemplateContributor);
  }

  /**
   * Create a deployer
   * @param params - the unit parameters
   * @returns the deployer with its resources prepared
   */
  async getDeployer(params: any = SAMPLE_UNIT): Promise<CloudFormationDeployer> {
    const deployer = new CloudFormationDeployer(
      "WebdaSampleApplication",
      new CloudFormationDeployerParameters().load(JSON.parse(JSON.stringify(params)))
    );
    fastWait(deployer);
    vi.spyOn(deployer, "sleep").mockResolvedValue();
    await deployer.prepare();
    return deployer;
  }

  async beforeEach() {
    await super.beforeEach();
    this.deployer = await this.getDeployer();
  }

  async afterEach() {
    this.mocks.forEach(mock => mock.restore());
    this.mocks = [];
    vi.restoreAllMocks();
  }

  /**
   * Mock an AWS client and restore it after the test
   * @param client - the client class
   * @returns the mock
   */
  mock(client: any): any {
    const mock = mockClient(client);
    this.mocks.push(mock);
    return mock;
  }

  /**
   * Mock every AWS interaction of the template generation
   * @param deployer - the deployer
   * @returns the mocks
   */
  mockAWS(deployer: CloudFormationDeployer = this.deployer) {
    return {
      createBucket: vi.spyOn(deployer, "createBucket").mockResolvedValue(),
      putFilesOnBucket: vi.spyOn(deployer, "putFilesOnBucket").mockResolvedValue(),
      putFolderOnBucket: vi.spyOn(deployer, "putFolderOnBucket").mockResolvedValue(),
      getAWSIdentity: vi
        .spyOn(deployer, "getAWSIdentity")
        .mockResolvedValue({ Account: "666111333", UserId: "AR123", Arn: "arn:aws:sts::666111333:assumed-role" }),
      getCertificate: vi.spyOn(deployer, "getCertificate").mockResolvedValue({ CertificateArn: "arn:myfakecertif" }),
      getZoneForDomainName: vi
        .spyOn(deployer, "getZoneForDomainName")
        .mockResolvedValue({ Id: "MyZoneId", Name: "webda.io.", CallerReference: "" }),
      getPolicyDocument: vi
        .spyOn(deployer, "getPolicyDocument")
        .mockResolvedValue({ Version: "2012-10-17", Statement: [] }),
      buildLambdaPackage: vi.spyOn(deployer, "buildLambdaPackage").mockImplementation(async options => {
        writeFileSync(options.zipPath, "zip");
        return { zipPath: options.zipPath, files: 1, size: 3 };
      })
    };
  }

  @test
  async defaultResources() {
    const resources = this.deployer.resources;
    assert.strictEqual(resources.ChangeSetType, "CREATE");
    // No deployment selected in the tests
    assert.strictEqual(resources.AssetsPrefix, "/WebdaSampleApplication/");
    assert.strictEqual(resources.StackName, "WebdaSampleApplication");
    assert.strictEqual(resources.FileName, "cloudformation-WebdaSampleApplication");
    assert.match(resources.OpenAPIFileName, /^WebdaSampleApplication-openapi-.+$/);
    assert.ok(!resources.OpenAPIFileName.includes("${"));
    assert.strictEqual(resources.Format, "JSON");
    assert.deepStrictEqual(resources.Tags, [{ Key: "test", Value: "webda3" }]);
    // Lambda defaults and the generated Role and Policy
    assert.strictEqual(resources.Lambda.Runtime, LAMBDA_LATEST_VERSION);
    assert.strictEqual(resources.Lambda.Handler, LAMBDA_DEFAULT_HANDLER);
    assert.strictEqual(resources.Lambda.MemorySize, 2048);
    assert.strictEqual(resources.Lambda.Timeout, 30);
    assert.deepStrictEqual(resources.Lambda.Role, { "Fn::GetAtt": ["Role", "Arn"] });
    assert.match(resources.LambdaPackager.zipPath, /^dist\/lambda-[^$]+\.zip$/);
    assert.strictEqual(resources.Role.RoleName, "WebdaSampleApplicationRole");
    assert.strictEqual(resources.Role.AssumeRolePolicyDocument.Version, "2012-10-17");
    assert.strictEqual(resources.Policy.PolicyName, "WebdaSampleApplicationPolicy");
    assert.deepStrictEqual(resources.Policy.Roles, [{ Ref: "Role" }]);
    // Domain and its base path mapping without the trailing dot
    assert.strictEqual(resources.APIGatewayDomain.SecurityPolicy, "TLS_1_2");
    assert.strictEqual(resources.APIGatewayBasePathMapping.DomainName, "api.sampleapp.webda.io");
    assert.strictEqual(resources.APIGatewayBasePathMapping.BasePath, "");
    // Statics
    assert.strictEqual(resources.Statics[0].AssetsPath, "wui/");
    const distribution = resources.Statics[0].CloudFront.DistributionConfig;
    assert.deepStrictEqual(distribution.Aliases, ["sampleapp.webda.io"]);
    assert.strictEqual(distribution.Origins[0].DomainName, "webda-sample-app-artifacts.s3.amazonaws.com");
    assert.strictEqual(distribution.Origins[0].OriginPath, "/wui");
  }

  @test
  async defaultResourcesErrors() {
    await assert.rejects(
      () => this.getDeployer({ type: "Webda/CloudFormationDeployer" }),
      /AssetsBucket must be defined/
    );
    await assert.rejects(
      () => this.getDeployer({ AssetsBucket: "b", ResourcesToImport: [{}], ChangeSetType: "CREATE" }),
      /ChangeSetType cannot be anything else than IMPORT/
    );
    const deployer = await this.getDeployer({
      AssetsBucket: "b",
      ResourcesToImport: [{}],
      APIGatewayStage: {},
      Statics: [{ DomainName: "s.webda.io", Source: "/public" }]
    });
    assert.strictEqual(deployer.resources.ChangeSetType, "IMPORT");
    assert.strictEqual(deployer.resources.APIGatewayStage.StageName, "default");
    assert.strictEqual(deployer.resources.Statics[0].AssetsPath, "public/");
    // No Lambda: no Role nor Policy generated
    assert.strictEqual(deployer.resources.Role, undefined);
    assert.strictEqual(deployer.resources.Policy, undefined);
  }

  @test
  async generateTemplate() {
    const mocks = this.mockAWS();
    const dir = mkdtempSync(join(tmpdir(), "webda-cf-"));
    try {
      this.deployer.resources.LambdaPackager.zipPath = join(dir, "lambda.zip");
      const template = await this.deployer.generateTemplate();
      assert.strictEqual(template.Description, "Deployed by @webda/aws/cloudformation");
      const resources = template.Resources;
      // Services contributions
      assert.strictEqual(resources.ServiceContributorBucket.Type, "AWS::S3::Bucket");
      assert.deepStrictEqual(resources.ServiceContributorBucket.Properties.Tags, [{ Key: "test", Value: "webda3" }]);
      // Lambda with the uploaded package, the package is removed
      assert.deepStrictEqual(resources.LambdaFunction.Properties.Code, {
        S3Bucket: "webda-sample-app-artifacts",
        S3Key: "/WebdaSampleApplication/lambda.zip"
      });
      assert.deepStrictEqual(resources.LambdaFunction.Properties.Tags, [
        { Key: "updater", Value: "test" },
        { Key: "test", Value: "webda3" }
      ]);
      assert.ok(!existsSync(join(dir, "lambda.zip")));
      // The Role can be assumed by the Lambda
      assert.deepStrictEqual(resources.Role.Properties.AssumeRolePolicyDocument.Statement, [
        { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }
      ]);
      assert.deepStrictEqual(resources.Policy.Properties.PolicyDocument, { Version: "2012-10-17", Statement: [] });
      // API Gateway from the uploaded OpenAPI
      assert.deepStrictEqual(resources.APIGateway.Properties.BodyS3Location, {
        Bucket: "webda-sample-app-artifacts",
        Key: this.deployer.openapiS3Object.key
      });
      assert.ok(this.deployer.openapiS3Object.key.startsWith("WebdaSampleApplication/WebdaSampleApplication-openapi-"));
      assert.strictEqual(resources.LambdaApiGatewayPermission.Properties.FunctionName, "webda-sample-app");
      assert.ok(resources.APIGatewayDeployment);
      assert.ok(resources.APIGatewayStage);
      // Domain with its certificate and DNS entry
      assert.strictEqual(resources.APIGatewayDomain.Properties.CertificateArn, "arn:myfakecertif");
      assert.deepStrictEqual(mocks.getCertificate.mock.calls[0], ["api.sampleapp.webda.io.", "us-east-1"]);
      assert.strictEqual(resources.DNSEntryapisampleappwebdaio.Properties.HostedZoneId, "MyZoneId");
      // Statics: uploaded folder, CloudFront and its DNS entry
      assert.strictEqual(mocks.putFolderOnBucket.mock.calls[0][2], "wui/");
      assert.strictEqual(
        resources.StaticsampleappwebdaioCloudFront.Properties.DistributionConfig.ViewerCertificate.AcmCertificateArn,
        "arn:myfakecertif"
      );
      assert.ok(resources.DNSEntrysampleappwebdaio);
      assert.ok(!resources.StaticsampleappwebdaioBucket);
      // The OpenAPI targets the Lambda
      const openapi = JSON.parse(mocks.putFilesOnBucket.mock.calls[0][1][0].src.toString());
      assert.strictEqual(openapi.info.title, "WebdaSampleApplication");
      for (const path of Object.values<any>(openapi.paths)) {
        for (const method of Object.values<any>(path)) {
          assert.match(
            method["x-amazon-apigateway-integration"].uri,
            /functions\/arn:aws:lambda:us-east-1:666111333:function:webda-sample-app\/invocations$/
          );
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  async sectionsOrder() {
    // Lambda and Fargate add their principals before the Role is generated
    assert.ok(CLOUDFORMATION_SECTIONS.indexOf("Lambda") < CLOUDFORMATION_SECTIONS.indexOf("Role"));
    assert.ok(CLOUDFORMATION_SECTIONS.indexOf("Fargate") < CLOUDFORMATION_SECTIONS.indexOf("Role"));
    const deployer = await this.getDeployer({
      AssetsBucket: "b",
      Role: {},
      Fargate: {},
      Statics: [{ DomainName: "s.webda.io", Source: "public", Bucket: { Tags: { site: "s" } } }],
      CustomResources: { Extra: { Type: "AWS::SNS::Topic" } },
      APIGatewayImportOpenApi: "rest-id",
      Image: "registry/app:${package.version}"
    });
    this.mockAWS(deployer);
    const putRestApi = vi.fn().mockResolvedValue({});
    this.mock(APIGateway).on(PutRestApiCommand).callsFake(putRestApi);
    const template = await deployer.generateTemplate();
    assert.deepStrictEqual(template.Resources.Role.Properties.AssumeRolePolicyDocument.Statement, [
      { Effect: "Allow", Principal: { Service: "ecs-tasks.amazonaws.com" }, Action: "sts:AssumeRole" }
    ]);
    assert.deepStrictEqual(template.Resources.Extra, { Type: "AWS::SNS::Topic" });
    assert.strictEqual(template.Resources.StaticswebdaioBucket.Properties.BucketName, "s.webda.io");
    // No Lambda: the OpenAPI has no integration
    assert.strictEqual(putRestApi.mock.calls[0][0].restApiId, "rest-id");
    assert.ok(!putRestApi.mock.calls[0][0].body.toString().includes("x-amazon-apigateway-integration"));
    assert.ok(!deployer.resources.Image.includes("${"));
    // APIGateway requires a Lambda
    await assert.rejects(() => deployer.APIGateway(), /APIGateway requires a Lambda/);
  }

  @test
  async deploy() {
    this.mockAWS();
    let events = 0;
    const executed = vi.fn().mockResolvedValue({});
    const createDeployment = vi.fn().mockResolvedValue({});
    this.mock(CloudFormation)
      .on(CreateChangeSetCommand)
      .resolves({ Id: "changeset" })
      .on(DescribeChangeSetCommand)
      .resolves({
        Status: "CREATE_COMPLETE",
        Changes: [
          {
            Type: "Resource",
            ResourceChange: {
              Action: "Add",
              ResourceType: "AWS::Lambda::Function",
              LogicalResourceId: "LambdaFunction"
            }
          }
        ]
      })
      .on(ExecuteChangeSetCommand)
      .callsFake(executed)
      .on(DescribeStackEventsCommand)
      .callsFake(async () => {
        events++;
        if (events === 1) {
          return { StackEvents: [{ EventId: "old" }] };
        } else if (events === 2) {
          return {
            StackEvents: [
              {
                EventId: "e1",
                ResourceStatus: "CREATE_IN_PROGRESS",
                ResourceType: "AWS::Lambda::Function",
                LogicalResourceId: "LambdaFunction"
              },
              { EventId: "old" }
            ]
          };
        }
        return {
          StackEvents: [
            {
              EventId: "e2",
              ResourceStatus: "UPDATE_COMPLETE",
              ResourceType: "AWS::CloudFormation::Stack",
              LogicalResourceId: "WebdaSampleApplication"
            },
            {
              EventId: "e1",
              ResourceStatus: "CREATE_IN_PROGRESS",
              ResourceType: "AWS::Lambda::Function",
              LogicalResourceId: "LambdaFunction"
            },
            { EventId: "old" }
          ]
        };
      })
      .on(ListStackResourcesCommand)
      .resolves({
        StackResourceSummaries: [
          <any>{ ResourceType: "AWS::ApiGateway::Stage", PhysicalResourceId: "stage" },
          <any>{ ResourceType: "AWS::ApiGateway::RestApi", PhysicalResourceId: "rest" }
        ]
      });
    this.mock(APIGateway).on(CreateDeploymentCommand).callsFake(createDeployment);
    const dir = mkdtempSync(join(tmpdir(), "webda-cf-"));
    try {
      const prepare = this.deployer.prepare.bind(this.deployer);
      vi.spyOn(this.deployer, "prepare").mockImplementation(async () => {
        const resources = await prepare();
        resources.LambdaPackager.zipPath = join(dir, "lambda.zip");
        return resources;
      });
      const result = await this.deployer.deploy();
      assert.deepStrictEqual(result.CloudFormation, {
        Bucket: "webda-sample-app-artifacts",
        Key: "WebdaSampleApplication/cloudformation-WebdaSampleApplication.json"
      });
      assert.ok(JSON.parse(result.CloudFormationContent).Resources.LambdaFunction);
      assert.strictEqual(executed.mock.calls.length, 1);
      assert.deepStrictEqual(createDeployment.mock.calls[0][0], { restApiId: "rest", stageName: "stage" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  @test
  async createCloudFormationNoChanges() {
    this.deployer.result = { CloudFormation: { Bucket: "b", Key: "k" } };
    const execute = vi.fn();
    this.mock(CloudFormation)
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolvesOnce({ Status: "CREATE_PENDING" })
      .resolvesOnce({
        Status: "FAILED",
        StatusReason:
          "The submitted information didn't contain changes. Submit different information to create a change set."
      })
      .resolves({ Status: "FAILED", StatusReason: "Broken" })
      .on(ExecuteChangeSetCommand)
      .callsFake(execute);
    await this.deployer.createCloudFormation();
    await this.deployer.createCloudFormation();
    assert.strictEqual(execute.mock.calls.length, 0);
  }

  @test
  async createCloudFormationTimeout() {
    this.deployer.result = { CloudFormation: { Bucket: "b", Key: "k" } };
    const sleep = vi.spyOn(this.deployer, "sleep").mockResolvedValue();
    this.mock(CloudFormation)
      .on(CreateChangeSetCommand)
      .resolves({})
      .on(DescribeChangeSetCommand)
      .resolves({ Status: "CREATE_COMPLETE", Changes: [] })
      .on(ExecuteChangeSetCommand)
      .resolves({})
      .on(DescribeStackEventsCommand)
      .resolves({ StackEvents: [] });
    await this.deployer.createCloudFormation();
    assert.strictEqual(sleep.mock.calls.length, 60);
  }

  @test
  async createCloudFormationChangeSet() {
    this.deployer.result = { CloudFormation: { Bucket: "b", Key: "k" } };
    const cloudformation = new CloudFormation({ region: "us-east-1" });
    const calls = [];
    let failure: any;
    const deleteStack = vi.spyOn(this.deployer, "deleteCloudFormation").mockResolvedValue();
    const deleteChangeSet = vi.fn().mockResolvedValue({});
    this.mock(CloudFormation)
      .on(CreateChangeSetCommand)
      .callsFake(async args => {
        calls.push(args.ChangeSetType);
        if (failure) {
          const err = failure;
          failure = undefined;
          throw err;
        }
        return { Id: args.ChangeSetType };
      })
      .on(DescribeStacksCommand)
      .resolvesOnce({ Stacks: [<any>{ StackStatus: "UPDATE_IN_PROGRESS" }] })
      .resolvesOnce({ Stacks: [<any>{ StackStatus: "UPDATE_COMPLETE" }] })
      .resolves({ Stacks: [] })
      .on(DeleteChangeSetCommand)
      .callsFake(deleteChangeSet);
    // Update of an existing stack
    assert.deepStrictEqual(await this.deployer.createCloudFormationChangeSet(cloudformation), { Id: "UPDATE" });
    // The stack does not exist: create it
    failure = new Error("Stack [WebdaSampleApplication] does not exist");
    await this.deployer.createCloudFormationChangeSet(cloudformation);
    assert.deepStrictEqual(calls.slice(-2), ["UPDATE", "CREATE"]);
    // A stack in ROLLBACK_COMPLETE is deleted then created
    failure = new Error("Stack is in ROLLBACK_COMPLETE state and can not be updated.");
    await this.deployer.createCloudFormationChangeSet(cloudformation);
    assert.strictEqual(deleteStack.mock.calls.length, 1);
    assert.strictEqual(calls.at(-1), "CREATE");
    // A stack being updated: wait for its completion
    failure = new Error("Stack is in UPDATE_IN_PROGRESS state and can not be updated.");
    await this.deployer.createCloudFormationChangeSet(cloudformation);
    assert.strictEqual(calls.at(-1), "UPDATE");
    // The stack disappeared while waiting
    failure = new Error("Stack is in UPDATE_IN_PROGRESS state and can not be updated.");
    await this.deployer.createCloudFormationChangeSet(cloudformation);
    assert.strictEqual(calls.at(-1), "CREATE");
    // A previous changeset exists
    failure = Object.assign(new Error("exists"), { name: "AlreadyExistsException" });
    await this.deployer.createCloudFormationChangeSet(cloudformation);
    assert.strictEqual(deleteChangeSet.mock.calls.length, 1);
    // Any other error
    failure = new Error("Unknown");
    await assert.rejects(() => this.deployer.createCloudFormationChangeSet(cloudformation), /Unknown/);
  }

  @test
  async deleteCloudFormation() {
    let describe = 0;
    const deleteStack = vi.fn().mockResolvedValue({});
    this.mock(CloudFormation)
      .on(DeleteStackCommand)
      .callsFake(deleteStack)
      .on(DescribeStacksCommand)
      .callsFake(async () => {
        if (++describe > 1) {
          throw new Error("Stack does not exist");
        }
        return { Stacks: [] };
      });
    await this.deployer.deleteCloudFormation();
    assert.deepStrictEqual(deleteStack.mock.calls[0][0], { StackName: "WebdaSampleApplication" });
    assert.strictEqual(describe, 2);
  }

  @test
  async dnsEntryWithoutZone() {
    this.deployer.template = { Resources: {} };
    vi.spyOn(this.deployer, "getZoneForDomainName").mockResolvedValue(undefined);
    await this.deployer.createCloudFormationDNSEntry({}, "unknown.io", "zone");
    assert.deepStrictEqual(this.deployer.template.Resources, {});
  }

  @test
  async stringified() {
    let res = this.deployer.getStringified({ a: 1 }, "file");
    assert.strictEqual(res.key, "WebdaSampleApplication/file.json");
    assert.deepStrictEqual(JSON.parse(res.src.toString()), { a: 1 });
    res = this.deployer.getStringified({ a: 1 }, "file.yml", false);
    assert.strictEqual(res.key, "file.yml");
    assert.deepStrictEqual(YAML.parse(res.src.toString()), { a: 1 });
    this.deployer.resources.Format = "YAML";
    res = this.deployer.getStringified({ a: 1 }, "file");
    assert.strictEqual(res.key, "WebdaSampleApplication/file.yml");
    res = this.deployer.getStringified({ a: 1 }, "/file.json", false);
    assert.strictEqual(res.key, "file.json");
  }
}
