import * as path from "path";
import * as YAML from "yaml";
import { AWSDeployer, AWSDeployerResources } from ".";
import { CloudFormationContributor } from "../services";
import { Domain } from "domain";
import { ConsoleLogger } from "@webda/workout";
import { WebdaError } from "@webda/core";

interface CloudFormationDeployerResources extends AWSDeployerResources {
  repositoryNamespace: string;
  // Where to put information
  AssetsBucket: string;
  AssetsPrefix?: string;

  Format?: "YAML" | "JSON";
  // How to name CloudFormation.json on AssetsBucket
  StackName?: string;
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
  };
  APIGatewayBasePathMapping?: {
    BasePath?: string;
    DomainName?: String;
    RestApiId?: String;
    Stage?: String;
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

  Policy?: {
    PolicyName?;
    PolicyDocument?;
    Roles?: any[];
    USers?: any[];
    Groups?: any[];
  };

  OpenAPIFileName?: string;
  Description?: string;

  // Lambda specific
  ZipPath?: string;
  Lambda?: {
    FunctionName?: string;
    Role?;
    Runtime?;
    Handler?: string;
    MemorySize?: number;
    Timeout?: number;
  };

  Fargate?: {};
  // Workers Image

  // Deploy Static website
  Statics?: [
    {
      DomainName: string;
      CloudFront: any;
      Source: string;
      AssetsPath?: string;
    }
  ];

  // Deploy images and ECR
  Workers?: [];
}

export default class CloudFormationDeployer extends AWSDeployer<CloudFormationDeployerResources> {
  template: any = {};
  result: any = {};

  constructor(manager, resources) {
    super(manager, resources);
  }

  async defaultResources() {
    await super.defaultResources();
    this.resources.AssetsPrefix = this.resources.AssetsPrefix || "";
    this.resources.Description = this.resources.Description || "Deployed by @webda/aws/cloudformation";
    this.resources.ZipPath = this.resources.ZipPath || "./dist/lambda-${package.version}.zip";
    this.resources.FileName = this.resources.FileName || this.resources.name;
    this.resources.StackName = this.resources.StackName || this.resources.name;
    this.resources.Format = this.resources.Format || "JSON";
    this.resources.OpenAPIFileName = this.resources.OpenAPIFileName || "${resources.name}-openapi-${package.version}";
    let autoRole;
    // Default Lambda value
    if (this.resources.Lambda) {
      this.resources.Lambda.Runtime = this.resources.Lambda.Runtime || "nodejs12.x";
      this.resources.Lambda.MemorySize = this.resources.Lambda.MemorySize || 2048;
      this.resources.Lambda.Timeout = this.resources.Lambda.Timeout || 30;
      this.resources.Lambda.Handler = this.resources.Lambda.Handler || "entrypoint.js";
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
      this.resources.Role.RoleName = `${this.resources.name}Role`;
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
      this.resources.Policy.PolicyName = `${this.resources.name}Policy`;
      this.resources.Policy.Roles = this.resources.Policy.Roles || [];
      if (this.resources.Role) {
        this.resources.Policy.Roles.push({ Ref: "Role" });
      }
      this.resources.Policy.PolicyDocument = this.resources.Policy.PolicyDocument || { Statement: [] };
    }

    if (this.resources.APIGateway) {
      this.resources.APIGateway.Name = this.resources.APIGateway.Name || this.resources.name;
    }

    this.resources.Tags = this.transformTags(this.resources.Tags || []);

    if (this.resources.APIGatewayStage) {
      this.resources.APIGatewayStage.StageName =
        // @ts-ignore
        this.resources.APIGatewayStage.StageName || this.getApplication().currentDeployment;
    }
    // Activate Domain
    if (this.resources.APIGatewayDomain) {
      // Enable BasePathMapping if does not exist
      this.resources.APIGatewayBasePathMapping = this.resources.APIGatewayBasePathMapping || {};
    }

    // Default BasePathMapping
    if (this.resources.APIGatewayBasePathMapping) {
      this.resources.APIGatewayBasePathMapping.BasePath = this.resources.APIGatewayBasePathMapping.BasePath || "";
      this.resources.APIGatewayBasePathMapping.DomainName =
        this.resources.APIGatewayBasePathMapping.DomainName || this.resources.APIGatewayDomain.DomainName;
      if (this.resources.APIGatewayBasePathMapping.DomainName.endsWith(".")) {
        this.resources.APIGatewayBasePathMapping.DomainName = this.resources.APIGatewayBasePathMapping.DomainName.substr(
          0,
          this.resources.APIGatewayBasePathMapping.DomainName.length - 1
        );
      }
    }
    this.resources.Statics = <any>(this.resources.Statics || []);
    this.resources.Statics.forEach(conf => {
      // Should move to init
      if (!conf.AssetsPath) {
        conf.AssetsPath = conf.Source;
        if (conf.AssetsPath.startsWith("/")) {
          conf.AssetsPath = conf.AssetsPath.substr(1);
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
              OriginPath: `/${conf.AssetsPath.substr(0, conf.AssetsPath.length - 1)}`,
              S3OriginConfig: {}
            }
          ];
        }
        conf.CloudFront.DistributionConfig = DistributionConfig;
      }
    });
  }

  async deploy(): Promise<any> {
    const { Description } = this.resources;

    this.template = {
      Description,
      Resources: {}
    };
    this.result = {};

    // Ensure S3 bucket exist
    this.logger.log("DEBUG", "Check assets bucket", this.resources.AssetsBucket);
    await this.createBucket(this.resources.AssetsBucket);

    this.logger.log("INFO", "Uploading statics");
    // Upload any Statics
    let statics = [];
    await this.uploadStatics();

    // Dynamicly call each methods
    for (let i in this.resources) {
      if (this[i]) {
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
    // Finish upload
    await statics;
    return this.result;
  }

  async uploadStatics(assets: boolean = true) {
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
    const { DomainName, CloudFront, Bucket, AssetsPath } = info;
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

  async sendCloudFormationTemplate() {
    let res = this.getStringified(this.template, this.resources.FileName);
    this.result.CloudFormation = {
      Bucket: this.resources.AssetsBucket,
      Key: res.key
    };
    this.result.CloudFormationContent = res.src.toString();
    await this.putFilesOnBucket(this.resources.AssetsBucket, [res]);
  }

  async deleteCloudFormation() {
    let cloudformation = new this.AWS.CloudFormation();
    await cloudformation.deleteStack({ StackName: this.resources.StackName }).promise();
    return this.waitFor(
      async resolve => {
        try {
          await cloudformation.describeStacks({ StackName: this.resources.StackName }).promise();
        } catch (err) {
          resolve();
          return true;
        }
      },
      5000,
      50,
      "Waiting on stack to be deleted"
    );
  }

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

  async createCloudFormation() {
    let cloudformation = new this.AWS.CloudFormation();
    let changeSetParams = {
      ...this.resources.StackOptions,
      StackName: this.resources.StackName,
      ChangeSetName: "WebdaCloudFormationDeployer",
      Capabilities: ["CAPABILITY_IAM", "CAPABILITY_NAMED_IAM"],
      Tags: this.getDefaultTags("StackOptions"),
      TemplateURL: `https://${this.result.CloudFormation.Bucket}.s3.amazonaws.com/${this.result.CloudFormation.Key}`
    };
    let changeSet;
    try {
      changeSet = await cloudformation.createChangeSet({ ...changeSetParams, ChangeSetType: "UPDATE" }).promise();
    } catch (err) {
      if (err.message.endsWith(" is in ROLLBACK_COMPLETE state and can not be updated.")) {
        this.logger.log("WARN", "Deleting buguous stack");
        await this.deleteCloudFormation();
        changeSet = await cloudformation.createChangeSet({ ...changeSetParams, ChangeSetType: "CREATE" }).promise();
      } else if (err.message === `Stack [${this.resources.StackName}] does not exist`) {
        changeSet = await cloudformation.createChangeSet({ ...changeSetParams, ChangeSetType: "CREATE" }).promise();
      } else if (err.message.endsWith(" state and can not be updated.")) {
        await this.waitFor(
          async resolve => {
            let res = await cloudformation
              .describeStacks({
                StackName: this.resources.StackName
              })
              .promise();
            if (res.Stacks.length === 0) {
              // If it disapeared, recreate
              changeSet = await cloudformation
                .createChangeSet({ ...changeSetParams, ChangeSetType: "CREATE" })
                .promise();
              resolve();
              return;
            }
            if (res.Stacks[0].StackStatus.endsWith("COMPLETE")) {
              changeSet = await cloudformation
                .createChangeSet({ ...changeSetParams, ChangeSetType: "UPDATE" })
                .promise();
              resolve();
            }
          },
          5000,
          50,
          "Waiting for COMPLETE state"
        );
      } else if (err.code === "AlreadyExistsException") {
        this.logger.log("WARN", "ChangeSet exists and need to be clean");
        await cloudformation
          .deleteChangeSet({ StackName: this.resources.StackName, ChangeSetName: "WebdaCloudFormationDeployer" })
          .promise();
        changeSet = await cloudformation.createChangeSet({ ...changeSetParams, ChangeSetType: "UPDATE" }).promise();
      } else {
        this.logger.log("ERROR", err);
        return;
      }
    }
    let changes = await this.waitFor(
      async resolve => {
        let changes = await cloudformation
          .describeChangeSet({ ChangeSetName: "WebdaCloudFormationDeployer", StackName: this.resources.StackName })
          .promise();
        if (changes.Status === "FAILED" || changes.Status === "CREATE_COMPLETE") {
          resolve(changes);
          return true;
        }
      },
      5000,
      50,
      "Waiting for ChangeSet to be ready..."
    );
    if (changes.Status === "UPDATE_IN_PROGRESS") {
      this.logger.log("ERROR", "Timeout waiting for Stack to update");
      return;
    }
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
    changes.Changes.filter(i => i.Type === "Resource").forEach(({ ResourceChange: info }) =>
      this.logger.log(
        "INFO",
        `${info.Action.toUpperCase().padEnd(38)} ${info.ResourceType.padEnd(30)} ${info.LogicalResourceId}`
      )
    );
    this.logger.log("INFO", "Executing Change Set");
    let lastEvent = (
      await cloudformation.describeStackEvents({ StackName: this.resources.StackName }).promise()
    ).StackEvents.shift();
    await cloudformation
      .executeChangeSet({ ChangeSetName: "WebdaCloudFormationDeployer", StackName: this.resources.StackName })
      .promise();
    // Wait for the completion of change and display events in the meantime
    this.logger.log("INFO", "Waiting for update completion");
    let i = 0;
    let Timeout = true;
    do {
      let events = (await cloudformation.describeStackEvents({ StackName: this.resources.StackName }).promise())
        .StackEvents;
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
            (lastEvent.ResourceStatus === "UPDATE_COMPLETE" || lastEvent.ResourceStatus === "CREATE_COMPLETE")
          ) {
            Timeout = false;
            break;
          }
        } else if (event.EventId === lastEvent.EventId) {
          display = true;
        }
      }
      await new Promise(resolve => setTimeout(resolve, 10000));
      i++;
    } while (i < 60 && Timeout);
    if (Timeout) {
      this.logger.log("WARN", "Timeout while waiting for stack to update");
    }
  }

  async Resources() {
    let me = await this.getAWSIdentity();
    let services = this.manager.getWebda().getServices();
    // Build policy
    for (let i in services) {
      if ("getCloudFormation" in services[i]) {
        // Update to match recuring policy - might need to split if policy too big
        let res = (<CloudFormationContributor>(<any>services[i])).getCloudFormation(this);
        for (let i in res) {
          this.template.Resources[`Service${i}`] = res[i];
        }
      }
    }
  }

  async completeOpenAPI(openapi) {
    openapi.info.title = this.resources.APIGateway.Name;
    let info = await this.getAWSIdentity();
    let arn = `arn:aws:lambda:${this.AWS.config.region}:${info.Account}:function:${this.resources.Lambda.FunctionName}`;
    for (let p in openapi.paths) {
      // TODO We should reenable mockCors once found the issue of
      // Invalid mapping expression parameter specified: method.response.header.Access-Control-Allow-Credentials
      if (!openapi.paths[p]["options"]) {
        openapi.paths[p]["options"] = {};
      }
      for (let m in openapi.paths[p]) {
        openapi.paths[p][m]["x-amazon-apigateway-integration"] = {
          httpMethod: "POST",
          uri: `arn:aws:apigateway:${this.AWS.config.region}:lambda:path/2015-03-31/functions/${arn}/invocations`,
          type: "aws_proxy"
        };
      }
    }
    return openapi;
  }

  getStringified(object, filename, addPrefix: boolean = true) {
    let key = addPrefix ? path.join(this.resources.AssetsPrefix, filename) : filename;
    if (key.startsWith("/")) {
      key = key.substr(1);
    }
    let src;
    if (this.resources.Format === "YAML") {
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
    // Get openapi
    let openapi = await this.completeOpenAPI(this.manager.getWebda().exportOpenAPI(false));
    let openapiS3Object = this.getStringified(openapi, this.resources.OpenAPIFileName);
    this.putFilesOnBucket(this.resources.AssetsBucket, [openapiS3Object]);
    this.template.Resources.APIGateway = {
      Type: "AWS::ApiGateway::RestApi",
      Properties: {
        ...this.resources.APIGateway,
        Tags: this.getDefaultTags("APIGateway"),
        BodyS3Location: {
          Bucket: this.resources.AssetsBucket,
          Key: openapiS3Object.key
        }
      }
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
      }
    };
    this.template.Resources.APIGatewayDeployment = {
      Type: "AWS::ApiGateway::Deployment",
      Properties: {
        ...this.resources.APIGatewayDeployment,
        RestApiId: { Ref: "APIGateway" }
      }
    };
    // SourceArn: "arn:aws:execute-api:" + this.AWS.config.region + ":" + awsId + ":" + this.restApiId + "/*"
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
    this.template.Resources.Lambda = {
      Type: "AWS::Lambda::Function",
      Properties: {
        ...this.resources.Lambda,
        Code,
        Tags: this.getDefaultTags("Lambda")
      }
    };
  }

  async Fargate() {
    this.addAssumeRolePolicyStatement({
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole"
    });
    /*
    this.addPolicyStatement({
      Sid: "WebdaECRAuth",
      Effect: "Allow",
      Action: ["ecr:GetAuthorizationToken"],
      Resource: ["*"],
    });
    let statement = {
      Sid: "WebdaPullImage",
      Effect: "Allow",
      Action: ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"],
      Resource: [],
    };
    let me = await this.getAWSIdentity();
    let resourceType =
      "arn:aws:ecr:" + this.getRegion() + ":" + me.Account + ":repository/" + this.resources.repositoryNamespace + "/";
    let workers = [];
    for (let i in workers) {
      statement.Resource.push(resourceType + i);
    }
    this.addPolicyStatement(statement);
    */
  }

  async generateLambdaPackage(): Promise<{ S3Bucket: string; S3Key: string }> {
    const { AssetsBucket: S3Bucket, ZipPath, AssetsPrefix = "" } = this.resources;
    let result: { S3Bucket: string; S3Key: string } = {
      S3Bucket,
      S3Key: AssetsPrefix + path.basename(ZipPath)
    };
    if (!S3Bucket) {
      throw new WebdaError("ASSETS_BUCKET_REQUIRED", "AssetsBucket must be defined");
    }
    // Create the package
    await this.manager.run("WebdaAWSDeployer/LambdaPackager", {
      zipPath: ZipPath
    });
    // Copy package to S3
    await this.putFilesOnBucket(result.S3Bucket, [
      {
        key: result.S3Key,
        src: ZipPath
      }
    ]);
    return result;
  }

  static shellCommand(console, args) {
    console.log("INFO", "Got called", args);
  }
}

const ShellCommand = CloudFormationDeployer.shellCommand;

export { CloudFormationDeployer, ShellCommand };
