import { APIGateway } from "@aws-sdk/client-api-gateway";
import { CloudFormation } from "@aws-sdk/client-cloudformation";
import { STS } from "@aws-sdk/client-sts";
import { JSONUtils, WebdaError } from "@webda/core";
import { ContainerResources } from "@webda/shell";
import * as fs from "fs";
import * as path from "path";
import * as YAML from "yaml";
import { CloudFormationContributor } from "../services";
import { AWSDeployer, AWSDeployerResources } from "./index";
import { LambdaPackagerResources } from "./lambdapackager";

/**
 * Build Docker image for AWS
 *
 * @todo Add X-Ray agent
 */
interface AWSDockerResources extends ContainerResources {
  /**
   * Create the ECR automatically
   */
  includeRepository: boolean;
}

/**
 * CloudFormation deployer resources
 *
 * Define how to generate CloudFormation resources
 */
interface CloudFormationDeployerResources extends AWSDeployerResources {
  /**
   * @todo
   */
  repositoryNamespace: string;
  // Where to put information
  /**
   * AssetsBucket to copy Lambda package, CloudFormation template and OpenAPI definitions
   */
  AssetsBucket?: string;
  /**
   * Prefix to use when copying to the AssetsBucket
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
   */
  Format?: "JSON" | "YAML";
  /**
   * How to name CloudFormation.json on AssetsBucket
   */
  StackName?: string;
  /**
   *
   */
  FileName?: string;
  // Default DomainName
  DomainName?: string;

  // What
  APIGateway?: {
    Name?: string;
  };
  APIGatewayDeployment?: {};
  APIGatewayStage?: {
    StageName?: string;
  };
  APIGatewayDomain?: {
    DomainName: string;
    CertificateArn?: string;
    EndpointConfiguration?: {
      Types: string[];
    };
    SecurityPolicy?: string;
  };
  APIGatewayBasePathMapping?: {
    BasePath?: string;
    DomainName?: string;
    RestApiId?: string;
    Stage?: string;
  };

  APIGatewayV2?: {};
  APIGatewayV2Deployment?: {};
  APIGatewayV2Stage?: {};
  APIGatewayV2Domain?: {
    DomainName: string;
    DomainNameConfigurations?: {
      CertificateArn?: string;
      CertificateName?: string;
      EndpointType?: string;
      SecurityPolicy?: string;
    }[];
    MutualTlsAuthentication: {
      TruststoreUri?: string;
      TruststoreVersion?: string;
    };
    Tags?: any;
  };
  APIGatewayV2ApiMapping?: {
    BasePath?: string;
    DomainName?: string;
    ApiId?: string;
    Stage?: string;
  };

  Role?: {
    AssumeRolePolicyDocument?: {
      Statement: any[];
      Version?: string;
    };
    Path?;
    Policies?;
    RoleName?;
  };
  StackOptions?: any;

  Resources?: {};

  /**
   * Policy to create
   *
   * This deployer can automatically create the policy tailored to your application needs
   * All the AWS services from this package advertise the type of permissions they need
   *
   */
  Policy?: {
    /**
     * PolicyName to use
     */
    PolicyName?;
    PolicyDocument?;
    Roles?: any[];
    USers?: any[];
    Groups?: any[];
  };

  /**
   * Name of your OpenAPI inside the AssetsBucket
   */
  OpenAPIFileName?: string;
  /**
   * Title for your OpenAPI definition
   * https://github.com/loopingz/webda.io/issues/17
   */
  OpenAPITitle?: string;
  /**
   * Description of the OpenAPI
   * https://github.com/loopingz/webda.io/issues/17
   */
  Description?: string;

  /**
   * How to build the Lambda package
   */
  LambdaPackager?: LambdaPackagerResources;
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
    Role?;
    /**
     * Type of Runtime to use
     *
     * @default "nodejs14.x"
     */
    Runtime?;
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
  };

  Fargate?: {};
  // Workers Image

  Docker?: AWSDockerResources;
  /**
   * Deploy static website
   */
  Statics?: [
    {
      /**
       * Domain name to deploy on
       */
      DomainName: string;
      /**
       * CloudFront parameter to add
       */
      CloudFront: any;
      /**
       * Source on local folder
       */
      Source: string;
      /**
       * Path to store on the AssetsBucket
       */
      AssetsPath?: string;
    }
  ];

  /**
   * Import Open API to APIGateway
   *
   * This is the restApiId to import to
   */
  APIGatewayImportOpenApi?: string;
  // Deploy images and ECR
  Workers?: [];

  /**
   * Keep locally the Lambda package after S3 uploads
   */
  KeepPackage?: boolean;

  /**
   * Any additional CloudFormation resources
   */
  CustomResources: any;
}

const LAMBDA_LATEST_VERSION = "nodejs14.x";
/**
 * Deploy the application and its resources using AWS CloudFormation
 *
 * @WebdaDeployer WebdaAWSDeployer/CloudFormation
 */
export default class CloudFormationDeployer extends AWSDeployer<CloudFormationDeployerResources> {
  template: any = {};
  result: any = {};
  openapiS3Object: { key: any; src: any };

  constructor(manager, resources) {
    super(manager, resources);
  }

  async defaultResources() {
    await super.defaultResources();
    let packageDesc = this.getApplication().getPackageDescription();
    packageDesc.webda = packageDesc.webda || {};
    packageDesc.webda.aws = packageDesc.webda.aws || {};

    if (this.resources.ResourcesToImport) {
      if (!this.resources.ChangeSetType) {
        this.resources.ChangeSetType = "IMPORT";
      }
      if (this.resources.ChangeSetType !== "IMPORT") {
        throw new Error("ChangeSetType cannot be anything else than IMPORT if you have ResourcesToImport set");
      }
    }
    this.resources.ChangeSetType = this.resources.ChangeSetType || "CREATE";
    this.resources.AssetsBucket = this.resources.AssetsBucket || packageDesc.webda.aws.AssetsBucket;
    if (!this.resources.AssetsBucket) {
      throw new WebdaError("ASSETS_BUCKET_REQUIRED", "AssetsBucket must be defined");
    }
    this.resources.AssetsPrefix = this.resources.AssetsPrefix || "${deployment}/${deployer.name}/";
    this.resources.Description = this.resources.Description || "Deployed by @webda/aws/cloudformation";
    this.resources.FileName = this.resources.FileName || `cloudformation-${this.resources.name}`;
    this.resources.StackName = this.resources.StackName || this.resources.name;
    this.resources.Format = this.resources.Format || "JSON";
    this.resources.OpenAPIFileName = this.resources.OpenAPIFileName || "${resources.name}-openapi-${package.version}";
    this.resources.OpenAPITitle = this.resources.OpenAPITitle || this.resources.name;
    // Default Lambda value
    if (this.resources.Lambda) {
      let zipPath = "lambda-${package.version}.zip";
      if (this.resources.LambdaPackager) {
        zipPath = this.resources.LambdaPackager.zipPath;
      }
      this.resources.LambdaPackager ??= { zipPath };
      this.resources.LambdaPackager.zipPath = zipPath;
      this.resources.Lambda.Runtime = this.resources.Lambda.Runtime || LAMBDA_LATEST_VERSION;
      this.resources.Lambda.MemorySize = this.resources.Lambda.MemorySize || 2048;
      this.resources.Lambda.Timeout = this.resources.Lambda.Timeout || 30;
      this.resources.Lambda.Handler =
        this.resources.Lambda.Handler || "node_modules/@webda/aws/lib/deployers/lambda-entrypoint.handler";
      this.resources.Lambda.FunctionName = this.resources.Lambda.FunctionName || this.resources.name;
      if (!this.resources.Lambda.Role) {
        this.resources.Lambda.Role = { "Fn::GetAtt": ["Role", "Arn"] };
        // If no role is specified auto enable Role and Policy creation
        this.resources.Role = this.resources.Role || {};
        this.resources.Policy = this.resources.Policy || {};
      }
    }

    // Default Role
    if (this.resources.Role) {
      this.resources.Role.RoleName = this.resources.Role.RoleName || `${this.resources.name}Role`;
      if (!this.resources.Role.Policies || this.resources.Role.Policies.length === 0) {
        this.resources.Policy = this.resources.Policy || {};
      }
      this.resources.Role.AssumeRolePolicyDocument = this.resources.Role.AssumeRolePolicyDocument || {
        Statement: []
      };
      this.resources.Role.AssumeRolePolicyDocument.Statement =
        this.resources.Role.AssumeRolePolicyDocument.Statement || [];
      this.resources.Role.AssumeRolePolicyDocument.Version =
        this.resources.Role.AssumeRolePolicyDocument.Version || "2012-10-17";
    }

    // Default Policy
    if (this.resources.Policy) {
      this.resources.Policy.PolicyName = this.resources.Policy.PolicyName || `${this.resources.name}Policy`;
      this.resources.Policy.Roles = this.resources.Policy.Roles || [];
      if (this.resources.Role) {
        this.resources.Policy.Roles.push({ Ref: "Role" });
      }
      this.resources.Policy.PolicyDocument = this.resources.Policy.PolicyDocument || { Statement: [] };
    }

    this.resources.Tags = this.transformMapTagsToArray(this.resources.Tags || []);

    if (this.resources.APIGatewayStage) {
      this.resources.APIGatewayStage.StageName =
        // @ts-ignore
        this.resources.APIGatewayStage.StageName || this.getApplication().currentDeployment;
    }

    // Activate Domain
    if (this.resources.APIGatewayDomain) {
      this.resources.APIGatewayDomain.SecurityPolicy ??= "TLS_1_2";
    }

    // Default BasePathMapping
    if (this.resources.APIGatewayBasePathMapping) {
      this.resources.APIGatewayBasePathMapping.BasePath = this.resources.APIGatewayBasePathMapping.BasePath || "";
      this.resources.APIGatewayBasePathMapping.DomainName ??= this.resources.APIGatewayDomain.DomainName;
      if (this.resources.APIGatewayBasePathMapping.DomainName.endsWith(".")) {
        this.resources.APIGatewayBasePathMapping.DomainName =
          this.resources.APIGatewayBasePathMapping.DomainName.substring(
            0,
            this.resources.APIGatewayBasePathMapping.DomainName.length - 1
          );
      }
    }

    // Activate Domain
    if (this.resources.APIGatewayV2Domain) {
      // Enable BasePathMapping if does not exist
      this.resources.APIGatewayV2ApiMapping = this.resources.APIGatewayV2ApiMapping || {};
      this.resources.APIGatewayV2Domain.DomainNameConfigurations =
        this.resources.APIGatewayV2Domain.DomainNameConfigurations || [];
    }

    // Default BasePathMapping
    if (this.resources.APIGatewayV2ApiMapping) {
      this.resources.APIGatewayV2ApiMapping.BasePath = this.resources.APIGatewayV2ApiMapping.BasePath || "";
      this.resources.APIGatewayV2ApiMapping.DomainName =
        this.resources.APIGatewayV2ApiMapping.DomainName || this.resources.APIGatewayDomain.DomainName;
      if (this.resources.APIGatewayV2ApiMapping.DomainName.endsWith(".")) {
        this.resources.APIGatewayV2ApiMapping.DomainName = this.resources.APIGatewayV2ApiMapping.DomainName.substring(
          0,
          this.resources.APIGatewayV2ApiMapping.DomainName.length - 1
        );
      }
    }
    this.resources.Statics = <any>(this.resources.Statics || []);
    this.resources.Statics.forEach(conf => {
      // Should move to init
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
        let DistributionConfig = conf.CloudFront.DistributionConfig || {};
        DistributionConfig.Aliases = DistributionConfig.Aliases || [];
        if (DistributionConfig.Aliases.indexOf(conf.DomainName) < 0) {
          DistributionConfig.Aliases.push(conf.DomainName);
        }
        DistributionConfig.PriceClass = DistributionConfig.PriceClass || "PriceClass_100";
        DistributionConfig.Comment = DistributionConfig.Comment || "Deployed with @webda/aws/cloudformation";
        if (DistributionConfig.Enabled === undefined) {
          DistributionConfig.Enabled = true;
        }
        if (!DistributionConfig.DefaultCacheBehavior) {
          DistributionConfig.DefaultCacheBehavior = {
            AllowedMethods: ["GET", "HEAD"],
            ViewerProtocolPolicy: "redirect-to-https",
            TargetOriginId: conf.DomainName,
            ForwardedValues: {
              QueryString: false
            }
          };
        }
        if (!DistributionConfig.Origins) {
          DistributionConfig.Origins = [
            {
              DomainName: `${this.resources.AssetsBucket}.s3.amazonaws.com`,
              Id: conf.DomainName,
              OriginPath: `/${conf.AssetsPath.substring(0, conf.AssetsPath.length - 1)}`,
              S3OriginConfig: {}
            }
          ];
        }
        conf.CloudFront.DistributionConfig = DistributionConfig;
      }
    });

    // Manage Docker build
    if (this.resources.Docker) {
      this.resources.Docker.push = this.resources.Docker.push === undefined ? true : this.resources.Docker.push;
      this.resources.Docker.includeRepository =
        this.resources.Docker.includeRepository === undefined ? true : this.resources.Docker.includeRepository;
      if (this.resources.Docker.includeRepository && this.resources.Docker.tag) {
        let accountId = (await this.getAWSIdentity()).Account;
        this.resources.Docker.tag =
          accountId + ".dkr.ecr.eu-west-1.amazonaws.com/${package.webda.aws.Repository}:" + this.resources.Docker.tag;
      }
    }
  }

  async deploy(): Promise<any> {
    const { Description } = this.resources;

    this.template = {
      Description,
      Resources: { ...this.resources.CustomResources }
    };

    this.result = {};

    // Ensure S3 bucket exist
    this.logger.log("DEBUG", "Check assets bucket", this.resources.AssetsBucket);
    await this.createBucket(this.resources.AssetsBucket);

    // Check if we need OpenAPI export
    let openapi = await this.completeOpenAPI(this.manager.getWebda().exportOpenAPI(false));
    this.openapiS3Object = this.getStringified(openapi, this.resources.OpenAPIFileName);
    await this.putFilesOnBucket(this.resources.AssetsBucket, [this.openapiS3Object]);
    // If APIGatewayImportOpenApi update REST API
    if (this.resources.APIGatewayImportOpenApi) {
      this.logger.log("INFO", "Importing open api");
      await this.importOpenApi(openapi);
    }

    // Build Docker if needed
    if (this.resources.Docker && this.resources.Docker.tag) {
      this.logger.log("INFO", "Building Docker image", this.resources.Docker.tag);
      await this.buildDocker();
    }

    this.logger.log("INFO", "Uploading statics");
    // Upload any Statics
    await this.uploadStatics();

    // Dynamicly call each methods
    for (let i in this.resources) {
      if (this[i] && typeof this[i] === "function") {
        this.logger.log("TRACE", "Add CloudFormation Resource", i);
        await this[i]();
      }
    }

    // Add any static
    for (let i in this.resources.Statics) {
      this.logger.log("TRACE", "Add Static Resource", i);
      await this.createStatic(this.resources.Statics[i]);
    }

    this.logger.log("INFO", "Deploy with CloudFormation");
    // Upload new version it
    await this.sendCloudFormationTemplate();
    // Load the stack
    await this.createCloudFormation();
    return this.result;
  }

  /**
   * Upload any asset to bucket
   */
  async uploadStatics() {
    for (let i in this.resources.Statics) {
      const { Source, AssetsPath } = this.resources.Statics[i];

      await this.putFolderOnBucket(
        this.resources.AssetsBucket,
        this.manager.getApplication().getAppPath(Source),
        AssetsPath
      );
    }
  }

  async createStatic(info: any) {
    const { DomainName, CloudFront, Bucket } = info;
    info.Bucket = info.Bucket || {};
    // Create bucket
    let resPrefix = `Static${DomainName.replace(/\./g, "")}`;
    if (Bucket) {
      this.template.Resources[`${resPrefix}Bucket`] = {
        Type: "AWS::S3::Bucket",
        Properties: {
          ...info.Bucket,
          BucketName: DomainName,
          Tags: this.getDefaultTags(info.Bucket.Tags)
        }
      };
    }
    if (CloudFront) {
      if (!CloudFront.DistributionConfig.ViewerCertificate) {
        CloudFront.DistributionConfig.ViewerCertificate = {
          AcmCertificateArn: (await this.getCertificate(DomainName)).CertificateArn,
          SslSupportMethod: "sni-only"
        };
      }
      this.template.Resources[`${resPrefix}CloudFront`] = {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
          DistributionConfig: CloudFront.DistributionConfig,
          Tags: this.getDefaultTags(info.CloudFront.Tags)
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
  async sendCloudFormationTemplate() {
    let res = this.getStringified(this.template, this.resources.FileName);
    this.result.CloudFormation = {
      Bucket: this.resources.AssetsBucket,
      Key: res.key
    };
    this.result.CloudFormationContent = res.src.toString();
    await this.putFilesOnBucket(this.resources.AssetsBucket, [res]);
  }

  /**
   * Delete the CloudFormation stack
   * @returns
   */
  async deleteCloudFormation() {
    let cloudformation = new CloudFormation({});
    await cloudformation.deleteStack({ StackName: this.resources.StackName });
    return this.waitFor(
      async resolve => {
        try {
          await cloudformation.describeStacks({ StackName: this.resources.StackName });
        } catch (err) {
          resolve();
          return true;
        }
      },
      50,
      "Waiting on stack to be deleted",
      5000
    );
  }

  /**
   *
   * @param ref
   * @param domain
   * @param HostedZoneId
   * @returns
   */
  async createCloudFormationDNSEntry(ref: any, domain: string, HostedZoneId: any) {
    let zone = await this.getZoneForDomainName(domain);
    if (!zone) {
      this.logger.log("WARN", "Cannot find Route53 zone for", domain, ", you will have to create manually the CNAME");
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

  async importOpenApi(openapi) {
    let apigateway = new APIGateway({});
    console.log("Creating API Gateway");
    await apigateway.putRestApi({
      body: Buffer.from(JSON.stringify(openapi)),
      failOnWarnings: false,
      restApiId: this.resources.APIGatewayImportOpenApi,
      mode: "overwrite"
    });
  }

  /**
   * Create the stack changeset
   * @param cloudformation
   * @returns
   */
  async createCloudFormationChangeSet(cloudformation: CloudFormation) {
    let changeSetParams = {
      ...this.resources.StackOptions,
      StackName: this.resources.StackName,
      ChangeSetName: "WebdaCloudFormationDeployer",
      Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
      Tags: this.getDefaultTags("StackOptions"),
      TemplateURL: `https://${this.result.CloudFormation.Bucket}.s3.amazonaws.com/${this.result.CloudFormation.Key}`,
      ResourcesToImport: this.resources.ResourcesToImport
    };
    let changeSet;
    try {
      changeSet = await cloudformation.createChangeSet({
        ...changeSetParams,
        ChangeSetType: this.resources.ChangeSetType === "IMPORT" ? "IMPORT" : "UPDATE"
      });
    } catch (err) {
      if (err.message.endsWith(" is in ROLLBACK_COMPLETE state and can not be updated.")) {
        this.logger.log("WARN", "Deleting buguous stack");
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
            let res = await cloudformation.describeStacks({
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
                ChangeSetType: this.resources.ChangeSetType === "IMPORT" ? "IMPORT" : "UPDATE"
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
      } else if (err.code === "AlreadyExistsException") {
        this.logger.log("WARN", "ChangeSet exists and need to be clean");
        await cloudformation.deleteChangeSet({
          StackName: this.resources.StackName,
          ChangeSetName: "WebdaCloudFormationDeployer"
        });
        changeSet = await cloudformation.createChangeSet({
          ...changeSetParams,
          ChangeSetType: this.resources.ChangeSetType === "IMPORT" ? "IMPORT" : "UPDATE"
        });
      } else {
        throw err;
      }
    }
    return changeSet;
  }

  /**
   * Upload and create the cloudformation stack or update it
   * @returns
   */
  async createCloudFormation() {
    let cloudformation: CloudFormation = new CloudFormation({});

    let changeSet = await this.createCloudFormationChangeSet(cloudformation);

    // Wait for change set
    this.logger.log("TRACE", `ChangeSet: ${changeSet}`);
    // It will trigger an exception if timeout
    let changes = await this.waitFor(
      async (resolve, reject) => {
        let localChanges = await cloudformation.describeChangeSet({
          ChangeSetName: "WebdaCloudFormationDeployer",
          StackName: this.resources.StackName
        });
        if (localChanges.Status === "FAILED" || localChanges.Status === "CREATE_COMPLETE") {
          resolve(localChanges);
          return true;
        }
        if (localChanges.Status === "ROLLBACK_COMPLETE") {
          reject();
        }
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
        this.logger.log("INFO", "No changes to be made");
      } else {
        this.logger.log("ERROR", "Cannot execute ChangeSet:", changes.StatusReason);
      }
      return;
    }
    changes.Changes.filter(j => j.Type === "Resource").forEach(({ ResourceChange: info }) =>
      this.logger.log(
        "INFO",
        `${info.Action.toUpperCase().padEnd(38)} ${info.ResourceType.padEnd(30)} ${info.LogicalResourceId}`
      )
    );
    this.logger.log("INFO", "Executing Change Set");
    let lastEvent = (
      await cloudformation.describeStackEvents({ StackName: this.resources.StackName })
    ).StackEvents.shift();
    await cloudformation.executeChangeSet({
      ChangeSetName: "WebdaCloudFormationDeployer",
      StackName: this.resources.StackName
    });
    // Wait for the completion of change and display events in the meantime
    this.logger.log("INFO", "Waiting for update completion");
    let i = 0;
    let Timeout = true;
    do {
      let events = (await cloudformation.describeStackEvents({ StackName: this.resources.StackName })).StackEvents;
      let display = lastEvent ? false : true;
      let event;
      while ((event = events.pop())) {
        if (display) {
          this.logger.log(
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
      this.logger.log("WARN", "Timeout while waiting for stack to update");
      return;
    }
    /*
    CloudFormation does not update Stage when resources are modified

    https://stackoverflow.com/questions/41423439/cloudformation-doesnt-deploy-to-api-gateway-stages-on-update
    */
    if (this.APIGateway) {
      let NextToken = undefined;
      let stageName;
      let restApiId;
      // Retrieve resources
      do {
        let res = await cloudformation.listStackResources({ StackName: this.resources.StackName, NextToken });
        NextToken = res.NextToken;
        res.StackResourceSummaries.forEach(resource => {
          if (resource.ResourceType === "AWS::ApiGateway::Stage") {
            stageName = resource.PhysicalResourceId;
          } else if (resource.ResourceType === "AWS::ApiGateway::RestApi") {
            restApiId = resource.PhysicalResourceId;
          }
        });
      } while (NextToken);
      // Get RestAPIId
      if (restApiId && stageName) {
        const gw: APIGateway = new APIGateway({});

        await gw.createDeployment({
          restApiId,
          stageName
        });
      }
    }
  }

  /**
   * Pause for x seconds
   * @param seconds
   */
  async sleep(sec: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, sec * 1000));
  }

  async Resources() {
    let services = this.manager.getWebda().getServices();
    // Build policy
    for (let i in services) {
      if ("getCloudFormation" in services[i]) {
        // Update to match recuring policy - might need to split if policy too big
        let res = (<CloudFormationContributor>(<any>services[i])).getCloudFormation(this);
        for (let j in res) {
          this.template.Resources[`Service${i}_${j}`] = res[j];
        }
      }
    }
  }

  getRegion(): string {
    return "us-east-1";
  }

  async completeOpenAPI(openapi) {
    openapi.info.title = this.resources.OpenAPITitle;
    let info = await this.getAWSIdentity();
    let arn = `arn:aws:lambda:${this.getRegion()}:${info.Account}:function:${this.resources.Lambda.FunctionName}`;
    for (let p in openapi.paths) {
      // Not using mockCors as the {@link RequestFilter.checkRequest} can be dynamic
      // Invalid mapping expression parameter specified: method.response.header.Access-Control-Allow-Credentials
      if (!openapi.paths[p]["options"]) {
        openapi.paths[p]["options"] = {};
      }
      for (let m in openapi.paths[p]) {
        openapi.paths[p][m]["x-amazon-apigateway-integration"] = {
          httpMethod: "POST",
          uri: `arn:aws:apigateway:${this.getRegion()}:lambda:path/2015-03-31/functions/${arn}/invocations`,
          type: "aws_proxy"
        };
      }
    }
    return openapi;
  }

  getStringified(object, filename, addPrefix: boolean = true) {
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

  async APIGateway() {
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
    // SourceArn: "arn:aws:execute-api:" + AWS.config.region + ":" + awsId + ":" + this.restApiId + "/*"
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

  async APIGatewayDomain() {
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

  async Policy() {
    let PolicyDocument = JSON.stringify(
      await this.getPolicyDocument(this.resources.Policy.PolicyDocument.Statement),
      undefined,
      2
    );
    this.template.Resources.Policy = {
      Type: "AWS::IAM::Policy",
      Properties: {
        ...this.resources.Policy,
        PolicyDocument
      }
    };
  }

  addAssumeRolePolicyStatement(...statements) {
    // If we have a Role generation only
    if (this.resources.Role) {
      this.resources.Role.AssumeRolePolicyDocument.Statement.push(...statements);
    }
  }

  async Role() {
    // add auto generation
    let AssumeRolePolicyDocument = JSON.stringify(this.resources.Role.AssumeRolePolicyDocument, undefined, 2);
    this.template.Resources.Role = {
      Type: "AWS::IAM::Role",
      Properties: {
        ...this.resources.Role,
        AssumeRolePolicyDocument,
        Tags: this.getDefaultTags("Role")
      }
    };
  }

  async Lambda() {
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

  async buildDocker() {
    // Launch the Docker deployment
    await this.manager.run("WebdaDeployer/Docker", {
      ...this.resources.Docker
    });
  }

  async Fargate() {
    this.addAssumeRolePolicyStatement({
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole"
    });
  }

  async generateLambdaPackage(): Promise<{ S3Bucket: string; S3Key: string }> {
    const { AssetsBucket: S3Bucket, LambdaPackager, AssetsPrefix = "", KeepPackage = false } = this.resources;
    const { zipPath: ZipPath } = LambdaPackager;
    let result: { S3Bucket: string; S3Key: string } = {
      S3Bucket,
      S3Key: AssetsPrefix + path.basename(ZipPath)
    };
    // Create the package
    await this.manager.run("WebdaAWSDeployer/LambdaPackager", LambdaPackager);
    // Copy package to S3
    await this.putFilesOnBucket(result.S3Bucket, [
      {
        key: result.S3Key,
        src: ZipPath
      }
    ]);
    /* c8 ignore next 3 */
    if (!KeepPackage) {
      fs.unlinkSync(ZipPath);
    }
    return result;
  }

  /**
   * Init the project on AWS
   *
   * It creates a CloudFormation stack with one ECR and one Bucket
   * and save their name in package.json(webda.aws)
   *
   * If you want to use your own ECR and S3 for assets just add
   * them inside your package.json with `webda.aws.AssetsBucket` and
   * `webda.aws.Repository`
   *
   * @param console
   * @returns
   */
  static async init(console) {
    let packageDescr = console.app.getAppPath("package.json");
    if (!fs.existsSync(packageDescr)) {
      console.log("ERROR", "package.json not found");
      return -1;
    }
    let pkg = JSONUtils.loadFile(packageDescr);
    pkg.webda = pkg.webda || {};
    let sts = new STS({});
    let identity;
    try {
      identity = await sts.getCallerIdentity({});
    } catch (ex) {
      console.log("ERROR", "Cannot retrieve your AWS credentials, make sure to have a correct AWS setup");
      return -1;
    }
    let pkgName = (pkg.name || "").replace(/@/g, "").replace(/\//g, "-");
    let StackName = `webda-${pkgName}-global`;
    if (!pkg.webda.aws) {
      console.log(
        "INFO",
        `This will create a small CloudFormation on your AWS account (${identity.Account}) and region (${
          sts.config.region || process.env.AWS_DEFAULT_REGION || "us-east-1"
        })`
      );
      console.log("INFO", `The stack will be called ${StackName}`);
      pkg.webda.aws = {
        AssetsBucket: `webda-${pkgName}-assets`,
        Repository: `webda-${pkgName}`
      };
      let cloudformation = new CloudFormation({});
      await cloudformation.createStack({
        StackName,
        TemplateBody: JSON.stringify({
          Resources: {
            WebdaAssetsBucket: {
              Type: "AWS::S3::Bucket",
              Properties: {
                BucketName: pkg.webda.aws.AssetsBucket
              }
            },
            WebdaECR: {
              Type: "AWS::ECR::Repository",
              Properties: {
                RepositoryName: pkg.webda.aws.Repository
              }
            }
          }
        })
      });
      console.log("INFO", "Updating package description with default information");
      JSONUtils.saveFile(pkg, packageDescr);
      return 0;
    } else {
      // Check if stack already exists
      console.log("WARN", "Default information are already in your package.json");
      return -1;
    }
  }
}

export { LAMBDA_LATEST_VERSION, CloudFormationDeployer };
