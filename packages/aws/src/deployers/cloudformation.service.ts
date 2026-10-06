import { APIGateway } from "@aws-sdk/client-api-gateway";
import { CloudFormation } from "@aws-sdk/client-cloudformation";
import { Command, Deployer, useApplication, useRouter, WebdaError } from "@webda/core";
import * as fs from "node:fs";
import * as path from "node:path";
import * as YAML from "yaml";
import type { CloudFormationContributor } from "../services/contributors.js";
import { AWSDeployer, AWSDeployerParameters } from "./awsdeployer.js";
import {
  createLambdaPackage,
  LAMBDA_DEFAULT_HANDLER,
  LambdaPackageOptions,
  LambdaPackageResult
} from "./lambdapackager.service.js";

/**
 * Default runtime of the Lambda function
 */
export const LAMBDA_LATEST_VERSION = "nodejs22.x";

/**
 * Sections of the template, in the order they are generated
 *
 * Lambda and Fargate add statements to the Role assume policy so they come before the Role
 */
export const CLOUDFORMATION_SECTIONS = [
  "Resources",
  "Lambda",
  "Fargate",
  "Role",
  "Policy",
  "APIGateway",
  "APIGatewayDomain"
] as const;

/**
 * CloudFormation deployer parameters
 *
 * Define how to generate CloudFormation resources
 */
export class CloudFormationDeployerParameters extends AWSDeployerParameters {
  /**
   * AssetsBucket to copy Lambda package, CloudFormation template and OpenAPI definitions
   *
   * Default to the `webda.aws.AssetsBucket` of the package.json
   */
  AssetsBucket?: string;
  /**
   * Prefix to use when copying to the AssetsBucket
   *
   * @default "${deployment}/${deployer.name}/"
   */
  AssetsPrefix?: string;
  /**
   * CREATE is the default
   *
   * IMPORT is not well supported as AWS support seems weak aswell
   */
  ChangeSetType?: "CREATE" | "IMPORT";
  /**
   * Resources to import in the template
   */
  ResourcesToImport?: any[];
  /**
   * Format for CloudFormation template
   *
   * YAML format can generate issue
   *
   * @default "JSON"
   */
  Format?: "JSON" | "YAML";
  /**
   * Name of the CloudFormation stack
   *
   * @default the unit name
   */
  StackName?: string;
  /**
   * Name of the template on the AssetsBucket
   *
   * @default "cloudformation-${resources.name}"
   */
  FileName?: string;
  /**
   * Default DomainName
   */
  DomainName?: string;
  /**
   * Create an API Gateway for the Lambda function
   */
  APIGateway?: {
    Name?: string;
    [key: string]: any;
  };
  /**
   * Properties of the API Gateway deployment
   */
  APIGatewayDeployment?: object;
  /**
   * Properties of the API Gateway stage
   */
  APIGatewayStage?: {
    /**
     * @default the deployment name
     */
    StageName?: string;
    [key: string]: any;
  };
  /**
   * Custom domain of the API Gateway
   */
  APIGatewayDomain?: {
    DomainName: string;
    CertificateArn?: string;
    EndpointConfiguration?: {
      Types: string[];
    };
    SecurityPolicy?: string;
    [key: string]: any;
  };
  /**
   * Base path mapping of the custom domain
   */
  APIGatewayBasePathMapping?: {
    BasePath?: string;
    DomainName?: string;
    RestApiId?: string;
    Stage?: string;
  };
  /**
   * Role to create
   */
  Role?: {
    AssumeRolePolicyDocument?: {
      Statement: any[];
      Version?: string;
    };
    Path?: string;
    Policies?: any[];
    RoleName?: string;
    [key: string]: any;
  };
  /**
   * Options of the stack: Tags, NotificationARNs, ...
   */
  StackOptions?: any;
  /**
   * Add the CloudFormation contributions of the application services
   * ({@link CloudFormationContributor})
   */
  Resources?: unknown;
  /**
   * Policy to create
   *
   * This deployer can automatically create the policy tailored to your application needs
   * All the AWS services from this package advertise the type of permissions they need
   */
  Policy?: {
    /**
     * PolicyName to use
     */
    PolicyName?: string;
    PolicyDocument?: any;
    Roles?: any[];
    Users?: any[];
    Groups?: any[];
  };
  /**
   * Name of your OpenAPI inside the AssetsBucket
   *
   * @default "${resources.name}-openapi-${package.version}"
   */
  OpenAPIFileName?: string;
  /**
   * Title for your OpenAPI definition
   * https://github.com/loopingz/webda.io/issues/17
   */
  OpenAPITitle?: string;
  /**
   * Description of the stack and the OpenAPI
   * https://github.com/loopingz/webda.io/issues/17
   */
  Description?: string;
  /**
   * How to build the Lambda package
   */
  LambdaPackager?: LambdaPackageOptions;
  /**
   * Deploy a Lambda package with your application
   */
  Lambda?: {
    /**
     * FunctionName to create
     */
    FunctionName?: string;
    /**
     * Role to set on the function
     */
    Role?: any;
    /**
     * Type of Runtime to use
     *
     * @default "nodejs22.x"
     */
    Runtime?: string;
    /**
     * Should not require to be overriden
     * @default "node_modules/@webda/aws/lib/deployers/lambda-entrypoint.handler"
     */
    Handler?: string;
    /**
     * Memory to set on the Lambda
     *
     * Less memory is less expensive/ms but slower
     * @default 2048
     */
    MemorySize?: number;
    /**
     * Timeout in seconds for your Lambda
     *
     * @default 30
     */
    Timeout?: number;
    [key: string]: any;
  };
  /**
   * Add the ECS tasks principal to the generated Role
   */
  Fargate?: object;
  /**
   * Container image of the application, built separately (`webda container build`)
   *
   * Available to the templates as `${resources.Image}`
   */
  Image?: string;
  /**
   * Deploy static website
   */
  Statics?: {
    /**
     * Domain name to deploy on
     */
    DomainName: string;
    /**
     * CloudFront parameter to add
     */
    CloudFront?: any;
    /**
     * Bucket parameter to add, a bucket named after the domain is created
     */
    Bucket?: any;
    /**
     * Source on local folder
     */
    Source: string;
    /**
     * Path to store on the AssetsBucket
     */
    AssetsPath?: string;
  }[];
  /**
   * Import Open API to APIGateway
   *
   * This is the restApiId to import to
   */
  APIGatewayImportOpenApi?: string;
  /**
   * Keep locally the Lambda package after S3 uploads
   */
  KeepPackage?: boolean;
  /**
   * Any additional CloudFormation resources
   */
  CustomResources?: any;
}

/**
 * Deploy the application and its resources using AWS CloudFormation
 *
 * Declared as a unit of a deployment:
 * ```json
 * {
 *   "units": [{
 *     "name": "MyStack",
 *     "type": "Webda/CloudFormationDeployer",
 *     "AssetsBucket": "my-assets",
 *     "Lambda": {},
 *     "APIGateway": {}
 *   }]
 * }
 * ```
 * then `webda -d <deployment> deploy`
 *
 * @WebdaModda
 */
export class CloudFormationDeployer<T extends CloudFormationDeployerParameters = CloudFormationDeployerParameters>
  extends AWSDeployer<T>
  implements Deployer
{
  /**
   * The template being generated
   */
  template: any = {};
  /**
   * Result of the deployment
   */
  result: any = {};
  /**
   * OpenAPI definition uploaded to the AssetsBucket
   */
  openapiS3Object: { key: string; src: any };

  /**
   * @override
   */
  async defaultResources(): Promise<void> {
    await super.defaultResources();
    const resources = this.resources;
    const app = useApplication();
    const packageDesc: any = app.getPackageDescription() ?? {};
    const awsDefaults = packageDesc.webda?.aws ?? {};

    if (resources.ResourcesToImport) {
      resources.ChangeSetType ??= "IMPORT";
      if (resources.ChangeSetType !== "IMPORT") {
        throw new WebdaError.CodeError(
          "CHANGESET_TYPE",
          "ChangeSetType cannot be anything else than IMPORT if you have ResourcesToImport set"
        );
      }
    }
    resources.ChangeSetType ??= "CREATE";
    resources.AssetsBucket ??= awsDefaults.AssetsBucket;
    if (!resources.AssetsBucket) {
      throw new WebdaError.CodeError("ASSETS_BUCKET_REQUIRED", "AssetsBucket must be defined");
    }
    resources.AssetsPrefix ??= "${deployment}/${deployer.name}/";
    resources.Description ??= "Deployed by @webda/aws/cloudformation";
    resources.FileName ??= `cloudformation-${resources.name}`;
    resources.StackName ??= resources.name;
    resources.Format ??= "JSON";
    resources.OpenAPIFileName ??= "${resources.name}-openapi-${package.version}";
    resources.OpenAPITitle ??= resources.name;
    resources.CustomResources ??= {};
    // Default Lambda value
    if (resources.Lambda) {
      resources.LambdaPackager ??= {};
      resources.LambdaPackager.zipPath ??= "dist/lambda-${package.version}.zip";
      resources.Lambda.Runtime ??= LAMBDA_LATEST_VERSION;
      resources.Lambda.MemorySize ??= 2048;
      resources.Lambda.Timeout ??= 30;
      resources.Lambda.Handler ??= LAMBDA_DEFAULT_HANDLER;
      resources.Lambda.FunctionName ??= resources.name;
      if (!resources.Lambda.Role) {
        resources.Lambda.Role = { "Fn::GetAtt": ["Role", "Arn"] };
        // If no role is specified auto enable Role and Policy creation
        resources.Role ??= {};
        resources.Policy ??= {};
      }
    }

    // Default Role
    if (resources.Role) {
      resources.Role.RoleName ??= `${resources.name}Role`;
      if (!resources.Role.Policies || resources.Role.Policies.length === 0) {
        resources.Policy ??= {};
      }
      resources.Role.AssumeRolePolicyDocument ??= { Statement: [] };
      resources.Role.AssumeRolePolicyDocument.Statement ??= [];
      resources.Role.AssumeRolePolicyDocument.Version ??= "2012-10-17";
    }

    // Default Policy
    if (resources.Policy) {
      resources.Policy.PolicyName ??= `${resources.name}Policy`;
      resources.Policy.Roles ??= [];
      if (resources.Role) {
        resources.Policy.Roles.push({ Ref: "Role" });
      }
      resources.Policy.PolicyDocument ??= { Statement: [] };
    }

    if (resources.APIGatewayStage) {
      resources.APIGatewayStage.StageName ??= app.getCurrentDeployment() || "default";
    }

    // Activate Domain
    if (resources.APIGatewayDomain) {
      resources.APIGatewayDomain.SecurityPolicy ??= "TLS_1_2";
      // Enable BasePathMapping if does not exist
      resources.APIGatewayBasePathMapping ??= {};
    }

    // Default BasePathMapping
    if (resources.APIGatewayBasePathMapping) {
      resources.APIGatewayBasePathMapping.BasePath ??= "";
      resources.APIGatewayBasePathMapping.DomainName ??= resources.APIGatewayDomain?.DomainName;
      if (resources.APIGatewayBasePathMapping.DomainName?.endsWith(".")) {
        resources.APIGatewayBasePathMapping.DomainName = resources.APIGatewayBasePathMapping.DomainName.substring(
          0,
          resources.APIGatewayBasePathMapping.DomainName.length - 1
        );
      }
    }

    resources.Statics ??= [];
    resources.Statics.forEach(conf => {
      if (!conf.AssetsPath) {
        conf.AssetsPath = conf.Source;
        if (conf.AssetsPath.startsWith("/")) {
          conf.AssetsPath = conf.AssetsPath.substring(1);
        }
        if (!conf.AssetsPath.endsWith("/")) {
          conf.AssetsPath += "/";
        }
      }
      if (conf.CloudFront) {
        const DistributionConfig = conf.CloudFront.DistributionConfig || {};
        DistributionConfig.Aliases ??= [];
        if (DistributionConfig.Aliases.indexOf(conf.DomainName) < 0) {
          DistributionConfig.Aliases.push(conf.DomainName);
        }
        DistributionConfig.PriceClass ??= "PriceClass_100";
        DistributionConfig.Comment ??= "Deployed with @webda/aws/cloudformation";
        DistributionConfig.Enabled ??= true;
        DistributionConfig.DefaultCacheBehavior ??= {
          AllowedMethods: ["GET", "HEAD"],
          ViewerProtocolPolicy: "redirect-to-https",
          TargetOriginId: conf.DomainName,
          ForwardedValues: {
            QueryString: false
          }
        };
        DistributionConfig.Origins ??= [
          {
            DomainName: `${resources.AssetsBucket}.s3.amazonaws.com`,
            Id: conf.DomainName,
            OriginPath: `/${conf.AssetsPath.substring(0, conf.AssetsPath.length - 1)}`,
            S3OriginConfig: {}
          }
        ];
        conf.CloudFront.DistributionConfig = DistributionConfig;
      }
    });
  }

  /**
   * Deploy the application with CloudFormation
   *
   * It packages the Lambda, uploads the assets, the OpenAPI definition and the template
   * to the AssetsBucket, then creates or updates the stack.
   *
   * @returns the deployment result: the template location and content
   */
  @Command("deploy", {
    description: "Deploy the application with AWS CloudFormation",
    requires: ["router", "rest-domain"]
  })
  async deploy(): Promise<any> {
    await this.prepare();
    await this.generateTemplate();
    this.log("INFO", "Deploy with CloudFormation");
    // Upload new version it
    await this.sendCloudFormationTemplate();
    // Load the stack
    await this.createCloudFormation();
    return this.result;
  }

  /**
   * Upload the assets and generate the CloudFormation template
   *
   * @returns the template
   */
  async generateTemplate(): Promise<any> {
    const { Description, AssetsBucket } = this.resources;
    this.template = {
      Description,
      Resources: { ...this.resources.CustomResources }
    };
    this.result = {};

    // Ensure S3 bucket exist
    this.log("DEBUG", "Check assets bucket", AssetsBucket);
    await this.createBucket(AssetsBucket);

    // Export the OpenAPI definition
    const openapi = await this.completeOpenAPI(useRouter().exportOpenAPI(false));
    this.openapiS3Object = this.getStringified(openapi, this.resources.OpenAPIFileName);
    await this.putFilesOnBucket(AssetsBucket, [this.openapiS3Object]);
    // If APIGatewayImportOpenApi update REST API
    if (this.resources.APIGatewayImportOpenApi) {
      this.log("INFO", "Importing open api");
      await this.importOpenApi(openapi);
    }

    this.log("INFO", "Uploading statics");
    await this.uploadStatics();

    for (const section of CLOUDFORMATION_SECTIONS) {
      if (this.resources[section] !== undefined) {
        this.log("TRACE", "Add CloudFormation Resource", section);
        await this[section]();
      }
    }

    // Add any static
    for (const info of this.resources.Statics) {
      this.log("TRACE", "Add Static Resource", info.DomainName);
      await this.createStatic(info);
    }
    return this.template;
  }

  /**
   * Upload any asset to bucket
   */
  async uploadStatics(): Promise<void> {
    for (const { Source, AssetsPath } of this.resources.Statics) {
      await this.putFolderOnBucket(this.resources.AssetsBucket, useApplication().getPath(Source), AssetsPath);
    }
  }

  /**
   * Add the resources of a static website
   *
   * @param info - the static website
   */
  async createStatic(info: CloudFormationDeployerParameters["Statics"][0]): Promise<void> {
    const { DomainName, CloudFront, Bucket } = info;
    const resPrefix = `Static${DomainName.replace(/\./g, "")}`;
    if (Bucket) {
      this.template.Resources[`${resPrefix}Bucket`] = {
        Type: "AWS::S3::Bucket",
        Properties: {
          ...Bucket,
          BucketName: DomainName,
          Tags: this.getDefaultTags(Bucket.Tags)
        }
      };
    }
    if (CloudFront) {
      if (!CloudFront.DistributionConfig.ViewerCertificate) {
        CloudFront.DistributionConfig.ViewerCertificate = {
          AcmCertificateArn: (await this.getCertificate(DomainName, "us-east-1")).CertificateArn,
          SslSupportMethod: "sni-only"
        };
      }
      this.template.Resources[`${resPrefix}CloudFront`] = {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: CloudFront.DistributionConfig,
          Tags: this.getDefaultTags(CloudFront.Tags)
        }
      };
      await this.createCloudFormationDNSEntry(
        { "Fn::GetAtt": [`${resPrefix}CloudFront`, "DomainName"] },
        DomainName,
        "Z2FDTNDATAQYW2" // Constant as seen here: https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-properties-route53-aliastarget-1.html#cfn-route53-aliastarget-hostedzoneid
      );
    }
  }

  /**
   * Copy the CloudFormation template to the Assets bucket
   */
  async sendCloudFormationTemplate(): Promise<void> {
    const res = this.getStringified(this.template, this.resources.FileName);
    this.result.CloudFormation = {
      Bucket: this.resources.AssetsBucket,
      Key: res.key
    };
    this.result.CloudFormationContent = res.src.toString();
    await this.putFilesOnBucket(this.resources.AssetsBucket, [res]);
  }

  /**
   * CloudFormation client
   * @returns the client
   */
  protected getCloudFormation(): CloudFormation {
    return new CloudFormation(this.getClientConfig("CloudFormation"));
  }

  /**
   * API Gateway client
   * @returns the client
   */
  protected getAPIGateway(): APIGateway {
    return new APIGateway(this.getClientConfig("APIGateway"));
  }

  /**
   * Delete the CloudFormation stack
   * @returns when the stack is deleted
   */
  async deleteCloudFormation(): Promise<void> {
    const cloudformation = this.getCloudFormation();
    await cloudformation.deleteStack({ StackName: this.resources.StackName });
    return this.waitFor(
      async resolve => {
        try {
          await cloudformation.describeStacks({
            StackName: this.resources.StackName
          });
        } catch {
          resolve();
          return true;
        }
        return false;
      },
      50,
      "Waiting on stack to be deleted",
      5000
    );
  }

  /**
   * Add a Route53 alias record to the template
   *
   * @param ref - the alias target
   * @param domain - the domain
   * @param HostedZoneId - the zone of the alias target
   */
  async createCloudFormationDNSEntry(ref: any, domain: string, HostedZoneId: any): Promise<void> {
    const zone = await this.getZoneForDomainName(domain);
    if (!zone) {
      this.log("WARN", "Cannot find Route53 zone for", domain, ", you will have to create manually the CNAME");
      return;
    }
    // Possible conflict if my.name.domain.io and myn.ame.domain.io exists
    this.template.Resources[`DNSEntry${domain.replace(/\./g, "")}`] = {
      Type: "AWS::Route53::RecordSet",
      Properties: {
        AliasTarget: { DNSName: ref, HostedZoneId },
        Comment: "Created by @webda/aws/cloudformation",
        Type: "A",
        Name: domain,
        HostedZoneId: zone.Id
      }
    };
  }

  /**
   * Import the OpenAPI definition into an existing REST API
   *
   * @param openapi - the definition
   */
  async importOpenApi(openapi: any): Promise<void> {
    await this.getAPIGateway().putRestApi({
      body: Buffer.from(JSON.stringify(openapi)),
      failOnWarnings: false,
      restApiId: this.resources.APIGatewayImportOpenApi,
      mode: "overwrite"
    });
  }

  /**
   * Create the stack changeset
   * @param cloudformation - the client
   * @returns the changeset
   */
  async createCloudFormationChangeSet(cloudformation: CloudFormation): Promise<any> {
    const changeSetParams = {
      ...this.resources.StackOptions,
      StackName: this.resources.StackName,
      ChangeSetName: "WebdaCloudFormationDeployer",
      Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
      Tags: this.getDefaultTags("StackOptions"),
      TemplateURL: `https://${this.result.CloudFormation.Bucket}.s3.amazonaws.com/${this.result.CloudFormation.Key}`,
      ResourcesToImport: this.resources.ResourcesToImport
    };
    const update = this.resources.ChangeSetType === "IMPORT" ? "IMPORT" : "UPDATE";
    let changeSet;
    try {
      changeSet = await cloudformation.createChangeSet({
        ...changeSetParams,
        ChangeSetType: update
      });
    } catch (err) {
      if (err.message.endsWith(" is in ROLLBACK_COMPLETE state and can not be updated.")) {
        this.log("WARN", "Deleting buguous stack");
        await this.deleteCloudFormation();
        changeSet = await cloudformation.createChangeSet({
          ...changeSetParams,
          ChangeSetType: this.resources.ChangeSetType
        });
      } else if (err.message === `Stack [${this.resources.StackName}] does not exist`) {
        changeSet = await cloudformation.createChangeSet({
          ...changeSetParams,
          ChangeSetType: this.resources.ChangeSetType
        });
      } else if (err.message.endsWith(" state and can not be updated.")) {
        await this.waitFor(
          async resolve => {
            const res = await cloudformation.describeStacks({
              StackName: this.resources.StackName
            });
            if (res.Stacks.length === 0) {
              // If it disapeared, recreate
              changeSet = await cloudformation.createChangeSet({
                ...changeSetParams,
                ChangeSetType: this.resources.ChangeSetType
              });
              resolve();
              return true;
            }
            if (res.Stacks[0].StackStatus.endsWith("COMPLETE")) {
              changeSet = await cloudformation.createChangeSet({
                ...changeSetParams,
                ChangeSetType: update
              });
              resolve();
              return true;
            }
            return false;
          },
          50,
          "Waiting for COMPLETE state",
          5000
        );
      } else if (err.name === "AlreadyExistsException" || err.code === "AlreadyExistsException") {
        this.log("WARN", "ChangeSet exists and need to be clean");
        await cloudformation.deleteChangeSet({
          StackName: this.resources.StackName,
          ChangeSetName: "WebdaCloudFormationDeployer"
        });
        changeSet = await cloudformation.createChangeSet({
          ...changeSetParams,
          ChangeSetType: update
        });
      } else {
        throw err;
      }
    }
    return changeSet;
  }

  /**
   * Upload and create the cloudformation stack or update it
   */
  async createCloudFormation(): Promise<void> {
    const cloudformation = this.getCloudFormation();
    const changeSet = await this.createCloudFormationChangeSet(cloudformation);

    // Wait for change set
    this.log("TRACE", "ChangeSet", changeSet);
    // It will trigger an exception if timeout
    const changes = await this.waitFor(
      async resolve => {
        const localChanges = await cloudformation.describeChangeSet({
          ChangeSetName: "WebdaCloudFormationDeployer",
          StackName: this.resources.StackName
        });
        if (localChanges.Status === "FAILED" || localChanges.Status === "CREATE_COMPLETE") {
          resolve(localChanges);
          return true;
        }
        return false;
      },
      50,
      "Waiting for ChangeSet to be ready...",
      5000
    );
    if (changes.Status === "FAILED") {
      if (
        changes.StatusReason ===
        "The submitted information didn't contain changes. Submit different information to create a change set."
      ) {
        this.log("INFO", "No changes to be made");
      } else {
        this.log("ERROR", "Cannot execute ChangeSet:", changes.StatusReason);
      }
      return;
    }
    changes.Changes.filter(j => j.Type === "Resource").forEach(({ ResourceChange: info }) =>
      this.log(
        "INFO",
        `${info.Action.toUpperCase().padEnd(38)} ${info.ResourceType.padEnd(30)} ${info.LogicalResourceId}`
      )
    );
    this.log("INFO", "Executing Change Set");
    let lastEvent = (
      await cloudformation.describeStackEvents({
        StackName: this.resources.StackName
      })
    ).StackEvents.shift();
    await cloudformation.executeChangeSet({
      ChangeSetName: "WebdaCloudFormationDeployer",
      StackName: this.resources.StackName
    });
    // Wait for the completion of change and display events in the meantime
    this.log("INFO", "Waiting for update completion");
    let i = 0;
    let Timeout = true;
    do {
      const events = (
        await cloudformation.describeStackEvents({
          StackName: this.resources.StackName
        })
      ).StackEvents;
      let display = !lastEvent;
      let event;
      while ((event = events.pop())) {
        if (display) {
          this.log(
            "INFO",
            `${event.ResourceStatus.padEnd(38)} ${event.ResourceType.padEnd(30)} ${event.LogicalResourceId}`
          );
          lastEvent = event;
          if (
            lastEvent.LogicalResourceId === this.resources.StackName &&
            (lastEvent.ResourceStatus === "UPDATE_COMPLETE" ||
              lastEvent.ResourceStatus === "CREATE_COMPLETE" ||
              lastEvent.ResourceStatus === "ROLLBACK_COMPLETE" ||
              lastEvent.ResourceStatus === "UPDATE_ROLLBACK_COMPLETE")
          ) {
            Timeout = false;
            break;
          }
        } else if (event.EventId === lastEvent.EventId) {
          display = true;
        }
      }
      // If we are done do not pause
      if (Timeout) {
        await this.sleep(10);
        i++;
      }
    } while (i < 60 && Timeout);
    if (Timeout) {
      this.log("WARN", "Timeout while waiting for stack to update");
      return;
    }
    /*
    CloudFormation does not update Stage when resources are modified

    https://stackoverflow.com/questions/41423439/cloudformation-doesnt-deploy-to-api-gateway-stages-on-update
    */
    if (this.resources.APIGateway) {
      let NextToken = undefined;
      let stageName;
      let restApiId;
      // Retrieve resources
      do {
        const res = await cloudformation.listStackResources({
          StackName: this.resources.StackName,
          NextToken
        });
        NextToken = res.NextToken;
        res.StackResourceSummaries.forEach(resource => {
          if (resource.ResourceType === "AWS::ApiGateway::Stage") {
            stageName = resource.PhysicalResourceId;
          } else if (resource.ResourceType === "AWS::ApiGateway::RestApi") {
            restApiId = resource.PhysicalResourceId;
          }
        });
      } while (NextToken);
      if (restApiId && stageName) {
        await this.getAPIGateway().createDeployment({
          restApiId,
          stageName
        });
      }
    }
  }

  /**
   * Pause for x seconds
   * @param sec - seconds to wait
   */
  async sleep(sec: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, sec * 1000));
  }

  /**
   * Add the CloudFormation contributions of the application services
   */
  async Resources(): Promise<void> {
    for (const service of this.getApplicationServices()) {
      if (typeof (<any>service).getCloudFormation === "function") {
        const res = (<CloudFormationContributor>(<any>service)).getCloudFormation(this);
        for (const j in res) {
          // Logical ids are alphanumeric
          this.template.Resources[`Service${service.getName()}${j}`.replace(/[^A-Za-z0-9]/g, "")] = res[j];
        }
      }
    }
  }

  /**
   * Add the API Gateway integration to the OpenAPI definition
   *
   * @param openapi - the definition
   * @returns the definition
   */
  async completeOpenAPI(openapi: any): Promise<any> {
    openapi.info.title = this.resources.OpenAPITitle;
    if (!this.resources.Lambda) {
      return openapi;
    }
    const info = await this.getAWSIdentity();
    const arn = `arn:aws:lambda:${this.getRegion()}:${info.Account}:function:${this.resources.Lambda.FunctionName}`;
    for (const p in openapi.paths) {
      // Not using mockCors as the {@link RequestFilter.checkRequest} can be dynamic
      openapi.paths[p]["options"] ??= {};
      for (const m in openapi.paths[p]) {
        openapi.paths[p][m]["x-amazon-apigateway-integration"] = {
          httpMethod: "POST",
          uri: `arn:aws:apigateway:${this.getRegion()}:lambda:path/2015-03-31/functions/${arn}/invocations`,
          type: "aws_proxy"
        };
      }
    }
    return openapi;
  }

  /**
   * Serialize an object for the AssetsBucket
   *
   * @param object - to serialize
   * @param filename - name of the file, its extension forces the format
   * @param addPrefix - add the AssetsPrefix
   * @returns the key and content
   */
  getStringified(object: any, filename: string, addPrefix: boolean = true): { key: string; src: Buffer } {
    let key = addPrefix ? `${this.resources.AssetsPrefix}${filename}` : filename;
    if (key.startsWith("/")) {
      key = key.substring(1);
    }
    let src;
    // Default to Format parameter
    let format = this.resources.Format;
    // Auto guess format
    if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
      format = "YAML";
    } else if (filename.endsWith(".json")) {
      format = "JSON";
    }
    if (format === "YAML") {
      src = Buffer.from(YAML.stringify(object));
      if (!key.endsWith(".yml") && !key.endsWith(".yaml")) {
        key += ".yml";
      }
    } else {
      src = Buffer.from(JSON.stringify(object, undefined, 2));
      if (!key.endsWith(".json")) {
        key += ".json";
      }
    }
    return {
      key,
      src
    };
  }

  /**
   * Add the API Gateway in front of the Lambda function
   */
  async APIGateway(): Promise<void> {
    if (!this.resources.Lambda) {
      throw new WebdaError.CodeError("LAMBDA_REQUIRED", "APIGateway requires a Lambda");
    }
    this.template.Resources.APIGateway = {
      Type: "AWS::ApiGateway::RestApi",
      Properties: {
        ...this.resources.APIGateway,
        Tags: this.getDefaultTags("APIGateway"),
        BodyS3Location: {
          Bucket: this.resources.AssetsBucket,
          Key: this.openapiS3Object.key
        }
      },
      DependsOn: "LambdaFunction"
    };
    this.template.Resources.LambdaApiGatewayPermission = {
      Type: "AWS::Lambda::Permission",
      Properties: {
        Action: "lambda:InvokeFunction",
        FunctionName: this.resources.Lambda.FunctionName,
        Principal: "apigateway.amazonaws.com",
        SourceArn: {
          "Fn::Join": [
            ":",
            [
              "arn:aws:execute-api",
              { Ref: "AWS::Region" },
              { Ref: "AWS::AccountId" },
              { "Fn::Join": ["", [{ Ref: "APIGateway" }, "/*"]] }
            ]
          ]
        }
      },
      DependsOn: "LambdaFunction"
    };
    this.template.Resources.APIGatewayDeployment = {
      Type: "AWS::ApiGateway::Deployment",
      Properties: {
        ...this.resources.APIGatewayDeployment,
        RestApiId: { Ref: "APIGateway" }
      }
    };
    this.template.Resources.APIGatewayStage = {
      Type: "AWS::ApiGateway::Stage",
      Properties: {
        ...this.resources.APIGatewayStage,
        Tags: this.getDefaultTags("APIGatewayStage"),
        DeploymentId: { Ref: "APIGatewayDeployment" },
        RestApiId: { Ref: "APIGateway" }
      }
    };
  }

  /**
   * Add the API Gateway custom domain
   */
  async APIGatewayDomain(): Promise<void> {
    let region;
    if (this.resources.APIGatewayDomain.EndpointConfiguration) {
      if (this.resources.APIGatewayDomain.EndpointConfiguration.Types.indexOf("EDGE") >= 0) {
        region = "us-east-1";
      }
    } else {
      region = "us-east-1";
    }
    if (!this.resources.APIGatewayDomain.CertificateArn) {
      this.resources.APIGatewayDomain.CertificateArn = (
        await this.getCertificate(this.resources.APIGatewayDomain.DomainName, region)
      ).CertificateArn;
    }

    this.template.Resources.APIGatewayDomain = {
      Type: "AWS::ApiGateway::DomainName",
      Properties: {
        ...this.resources.APIGatewayDomain,
        Tags: this.getDefaultTags("APIGatewayDomain")
      }
    };
    this.template.Resources.APIGatewayBasePathMapping = {
      Type: "AWS::ApiGateway::BasePathMapping",
      Properties: {
        ...this.resources.APIGatewayBasePathMapping,
        DomainName: { Ref: "APIGatewayDomain" },
        RestApiId: { Ref: "APIGateway" },
        Stage: { Ref: "APIGatewayStage" }
      }
    };
    // Should do conditional with RegionalDomainName/RegionalHostedZoneId
    await this.createCloudFormationDNSEntry(
      { "Fn::GetAtt": ["APIGatewayDomain", "DistributionDomainName"] },
      this.resources.APIGatewayDomain.DomainName,
      { "Fn::GetAtt": ["APIGatewayDomain", "DistributionHostedZoneId"] }
    );
  }

  /**
   * Add the IAM policy of the application
   */
  async Policy(): Promise<void> {
    const PolicyDocument = await this.getPolicyDocument(this.resources.Policy.PolicyDocument.Statement);
    this.template.Resources.Policy = {
      Type: "AWS::IAM::Policy",
      Properties: {
        ...this.resources.Policy,
        PolicyDocument
      }
    };
  }

  /**
   * Add statements to the generated Role assume policy
   *
   * @param statements - to add
   */
  addAssumeRolePolicyStatement(...statements: any[]): void {
    // If we have a Role generation only
    if (this.resources.Role) {
      this.resources.Role.AssumeRolePolicyDocument.Statement.push(...statements);
    }
  }

  /**
   * Add the IAM role of the application
   */
  async Role(): Promise<void> {
    this.template.Resources.Role = {
      Type: "AWS::IAM::Role",
      Properties: {
        ...this.resources.Role,
        Tags: this.getDefaultTags("Role")
      }
    };
  }

  /**
   * Package the application and add the Lambda function
   */
  async Lambda(): Promise<void> {
    const Code = await this.generateLambdaPackage();
    this.addAssumeRolePolicyStatement({
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole"
    });
    this.template.Resources.LambdaFunction = {
      Type: "AWS::Lambda::Function",
      Properties: {
        ...this.resources.Lambda,
        Code,
        Tags: this.getDefaultTags("Lambda")
      }
    };
  }

  /**
   * Allow the ECS tasks to use the generated Role
   */
  async Fargate(): Promise<void> {
    this.addAssumeRolePolicyStatement({
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole"
    });
  }

  /**
   * Create the Lambda zip of the application
   *
   * @param options - the package options
   * @returns the zip information
   */
  async buildLambdaPackage(options: LambdaPackageOptions): Promise<LambdaPackageResult> {
    return createLambdaPackage(useApplication(), options);
  }

  /**
   * Create the Lambda package and upload it to the AssetsBucket
   *
   * @returns the S3 location of the package
   */
  async generateLambdaPackage(): Promise<{ S3Bucket: string; S3Key: string }> {
    const { AssetsBucket: S3Bucket, LambdaPackager, AssetsPrefix = "", KeepPackage = false } = this.resources;
    const { zipPath } = await this.buildLambdaPackage(LambdaPackager);
    const result = {
      S3Bucket,
      S3Key: AssetsPrefix + path.basename(zipPath)
    };
    // Copy package to S3
    await this.putFilesOnBucket(result.S3Bucket, [
      {
        key: result.S3Key,
        src: zipPath
      }
    ]);
    if (!KeepPackage) {
      fs.unlinkSync(zipPath);
    }
    return result;
  }
}
