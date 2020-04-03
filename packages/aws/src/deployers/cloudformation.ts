import * as path from "path";
import { AWSDeployer, AWSDeployerResources } from ".";
import { CloudFormationContributor } from "../services";

interface CloudFormationDeployerResources extends AWSDeployerResources {
  repositoryNamespace: string;
  // Where to put information
  AssetsBucket: string;
  AssetsPrefix?: string;
  // Name of the CloudFormation
  Name?: string;
  // Default DomainName
  DomainName?: string;

  // What
  APIGateway?: {};
  APIGatewayStage?: {
    StageName?: string;
  };
  APIGatewayDomain?: {
    DomainName: string;
  };
  APIGatewayBasePathMapping?: {
    BasePath?: string;
    DomainName?: String;
    RestApiId?: String;
    Stage?: String;
  };

  Role?: {
    AssumeRolePolicyDocument;
    Path;
    Policies;
    RoleName;
  };

  Policy?: {
    PolicyName?;
    PolicyDocument?;
  };

  Description?: string;

  // Lambda specific
  ZipPath?: string;
  Lambda?: {
    Role?;
    Runtime?;
    Handler?: string;
    MemorySize?: number;
    Timeout?: number;
  };

  // Deploy Static website
  Statics?: [
    {
      DomainName: string;
      CloudFront: boolean;
      Source: string;
    }
  ];

  // Default Tags
  Tags?: [{ Key: string; Value: String }];
}

export default class CloudFormationDeployer extends AWSDeployer<CloudFormationDeployerResources> {
  template: any = {};

  constructor(manager, resources) {
    super(manager, resources);
  }

  async defaultResources() {
    await super.defaultResources();
    this.resources.Description = this.resources.Description || "Deployed by @webda/aws/cloudformation";
    this.resources.ZipPath = this.resources.ZipPath || "./dist/lambda-${this.package.version}.zip";
    // Default Policy
    if (this.resources.Policy) {
      this.resources.Policy.PolicyName = "";
    }
    // Default Lambda value
    if (this.resources.Lambda) {
      this.resources.Lambda.Runtime = this.resources.Lambda.Runtime || "node12.x";
      this.resources.Lambda.MemorySize = this.resources.Lambda.MemorySize || 2048;
      this.resources.Lambda.Timeout = this.resources.Lambda.Timeout || 30;
    }
    // Default BasePathMapping
    if (this.resources.APIGatewayBasePathMapping) {
      this.resources.APIGatewayBasePathMapping.BasePath = this.resources.APIGatewayBasePathMapping.BasePath || "/";
      this.resources.APIGatewayBasePathMapping.DomainName =
        this.resources.APIGatewayBasePathMapping.DomainName || this.resources.APIGatewayDomain.DomainName;
    }
  }

  async deploy(): Promise<any> {
    const { Description } = this.resources;

    this.template = {
      Description,
      Resources: {}
    };

    // Dynamicly call each methods
    for (let i in this.resources) {
      if (this[i]) {
        await this[i]();
      }
    }
    console.log("Deploy with CloudFormation");
    return this.template;
  }

  async Resources() {
    let me = await this.getAWSIdentity();
    let services = this.manager.getWebda().getServices();
    // Build policy
    for (let i in services) {
      if ("getCloudFormation" in services[i]) {
        // Update to match recuring policy - might need to split if policy too big
        let res = (<CloudFormationContributor>(<any>services[i])).getCloudFormation(me.Account, this.AWS.config.region);
        for (let i in res) {
          this.template.Resources[`Service${i}`] = res[i];
        }
      }
    }
  }

  /**
   * Take this.resources[key].Tags and add all remaining Tags from this.resources.Tags
   *
   * @param key of the resources to add
   */
  getDefaultTags(key: string) {
    let Tags = this.resources[key] ? this.resources[key].Tags || [] : [];
    if (this.resources.Tags) {
      let TagKeys = Tags.map(t => t.Key);
      Tags.push(...this.resources.Tags.filter(t => TagKeys.indexOf(t.Key) < 0));
    }
    return Tags;
  }

  async APIGateway() {
    this.template.Resources.APIGateway = {
      Type: "AWS::ApiGateway::RestApi",
      Properties: {
        ...this.resources.APIGateway,
        Tags: this.getDefaultTags("APIGateway")
      }
    };
    this.template.Resources.LambdaApiGatewayPermission = {
      Action: "lambda:InvokeFunction",
      FunctionName: "!Ref Lambda",
      Principal: "apigateway.amazonaws.com",
      SourceArn: "!Ref APIGateway"
    };
    // SourceArn: "arn:aws:execute-api:" + this.AWS.config.region + ":" + awsId + ":" + this.restApiId + "/*"
    this.template.Resources.APIGatewayStage = {
      Type: "AWS::ApiGateway::Stage",
      Properties: {
        ...this.resources.APIGatewayStage,
        Tags: this.getDefaultTags("APIGatewayStage")
      }
    };
  }

  async APIGatewayDomain() {
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
        ...this.resources.APIGatewayBasePathMapping
      }
    };
  }

  addPolicyStatement(...statements) {
    //this.resources.Role.AssumeRolePolicyDocument
  }

  async Policy() {
    this.template.Resources.Policy = {
      Type: "AWS::IAM::Policy",
      Properties: {
        ...this.resources.Policy,
        Tags: this.getDefaultTags("Policy")
      }
    };
  }

  addAssumeRolePolicyStatement(...statements) {
    //this.resources.Role.AssumeRolePolicyDocument
  }

  async Role() {
    // add auto generation
    let AssumeRolePolicyDocument = this.resources.Role.AssumeRolePolicyDocument;
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
        Code
      }
    };
  }

  async Fargate() {
    this.addAssumeRolePolicyStatement({
      Effect: "Allow",
      Principal: { Service: "ecs-tasks.amazonaws.com" },
      Action: "sts:AssumeRole"
    });
    this.addPolicyStatement({
      Sid: "WebdaECRAuth",
      Effect: "Allow",
      Action: ["ecr:GetAuthorizationToken"],
      Resource: ["*"]
    });
    let statement = {
      Sid: "WebdaPullImage",
      Effect: "Allow",
      Action: ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"],
      Resource: []
    };
    let me = await this.getAWSIdentity();
    let resourceType =
      "arn:aws:ecr:" + this.getRegion() + ":" + me.Account + ":repository/" + this.resources.repositoryNamespace + "/";
    let workers = [];
    for (let i in workers) {
      statement.Resource.push(resourceType + i);
    }
    this.addPolicyStatement(statement);
  }

  async generateLambdaPackage(): Promise<{ S3Bucket: string; S3Key: string }> {
    const { AssetsBucket: S3Bucket, ZipPath, AssetsPrefix = "" } = this.resources;
    let result: { S3Bucket: string; S3Key: string } = {
      S3Bucket,
      S3Key: AssetsPrefix + path.basename(ZipPath)
    };
    if (!S3Bucket) {
      throw new Error("AssetsBucket must be defined");
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
}

export { CloudFormationDeployer };
