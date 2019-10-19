import { AWSDeployer } from "./aws";
import { APIGateway, Lambda } from "aws-sdk";
const fs = require("fs");
const crypto = require("crypto");
const filesize = require("filesize");
const colors = require("colors");
const LAMBDA_ROLE_POLICY =
  '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}';

// Official 69905067b but Lambda fail before this limit
const AWS_UPLOAD_MAX = 20971520;

export class LambdaDeployer extends AWSDeployer {
  _awsGateway: APIGateway;
  _awsLambda: Lambda;
  _restApiName: string;
  _lambdaTimeout: number;
  _lambdaStorage: string;
  _lambdaRole: string;
  _lambdaFunction: any;
  _packageHash: string;
  _lambdaFunctionName: string;
  _lambdaDefaultHandler: boolean;
  _lambdaHandler: string;
  _lambdaMemorySize: number;
  _packageOversize: boolean;
  _addOPTIONS: boolean;
  _addMockCORS: boolean;
  region: string;
  _zipPath: string;
  _origin: string;
  restApiId: string;
  tree: any;
  _progression: number;
  _package: any;

  transformRestApiToFunctionName(name) {
    return name.replace(/[^a-zA-Z0-9_]/g, "-");
  }

  getSteps(steps) {
    let count = 0;
    for (let i in steps) {
      if (steps[i]) count++;
    }
    return count;
  }

  async deploy(args) {
    this._AWS = this._getAWS(this.resources);
    let steps: any = {};
    if (args[0]) {
      steps[args[0].toLowerCase()] = true;
    } else if (args[0] === "aws-only") {
      steps = {
        lambda: true,
        package: false,
        role: true,
        api: true
      };
    } else {
      steps = {
        lambda: true,
        package: true,
        role: true,
        api: true
      };
    }

    this._restApiName = this.resources.restApi;
    this._lambdaFunctionName =
      this.resources.functionName ||
      this.transformRestApiToFunctionName(this.resources.restApi);

    if (this._lambdaFunctionName === undefined) {
      throw Error(
        "Need to define a Rest API Name at least" + this._lambdaFunctionName
      );
    }

    if (this._restApiName === undefined) {
      steps.api = false;
    }
    this._maxStep = this.getSteps(steps);
    this._lambdaRole = this.resources.lambdaRole;
    this._lambdaStorage = this.resources.lambdaStorage;
    if (!this.resources.lambdaHandler) {
      this._lambdaDefaultHandler = true;
    }
    this._lambdaHandler = this.resources.lambdaHandler || "entrypoint.handler";
    this._lambdaTimeout = 3;

    if (this.resources.lambdaMemory) {
      this._lambdaMemorySize = Number.parseInt(this.resources.lambdaMemory, 10);
    } else {
      // Dont handle less well for now
      this._lambdaMemorySize = 512;
    }
    this.region = this._AWS.config.region;
    this._zipPath = "dist/" + this._lambdaFunctionName + ".zip";
    this._origin = this.parameters.website;

    if (this._origin) {
      if (
        this._origin === "*" ||
        Array.isArray(this._origin) ||
        this._origin.indexOf(",") >= 0
      ) {
        this._addOPTIONS = true;
      } else {
        this._addMockCORS = true;
      }
    }

    if (!this.resources.lambdaVersionsLimit) {
      this.resources.lambdaVersionsLimit = 3;
    }

    // role step
    if (steps.role) {
      await this.generateRoleARN(
        this._restApiName + "Lambda",
        LAMBDA_ROLE_POLICY,
        this._lambdaRole
      ).then(roleArn => {
        this._lambdaRole = roleArn;
        if (!this._lambdaRole.startsWith("arn:aws")) {
          // Try to get the Role ARN ?
          throw Error("LambdaRole needs to be the ARN of the Role");
        }
      });
    }

    this._awsGateway = new this._AWS.APIGateway();
    this._awsLambda = new this._AWS.Lambda();

    console.log("Deploying to " + colors.yellow("AWS"));

    if (steps.package) {
      await this.generatePackage(this._zipPath);
    }

    let size = fs.statSync(this._zipPath);
    this._packageOversize = size.size >= AWS_UPLOAD_MAX;
    this._package = fs.readFileSync(this._zipPath);
    var hash = crypto.createHash("sha256");
    this._packageHash = hash.update(this._package).digest("base64");
    console.log(
      "Package dist/" +
        this._lambdaFunctionName +
        ".zip (SHA256: " +
        this._packageHash +
        " | Size:" +
        filesize(size.size) +
        ")"
    );

    if (steps.lambda) {
      await this.generateLambda();
    }
    if (steps.api) {
      await this.generateAPIGateway();
    }
  }

  addLinkPackage(archive, fromPath, toPath) {
    let packageFile = fromPath + "/package.json";
    let files;
    if (fs.existsSync(packageFile)) {
      archive.file(`${packageFile}`, { name: `${toPath}/package.json` });
      files = require(packageFile).files;
    }
    files = files || fs.readdirSync(fromPath);
    files.forEach(file => {
      if (file.startsWith(".") || file === "package.json") return;
      var stat = fs.lstatSync(`${fromPath}/${file}`);
      if (stat.isDirectory()) {
        archive.directory(`${fromPath}/${file}`, `${toPath}/${file}`);
      } else if (stat.isFile()) {
        archive.file(`${fromPath}/${file}`, { name: `${toPath}/${file}` });
      }
    });
  }

  async generatePackage(zipPath) {
    this.stepper("Creating package");
    var archiver = require("archiver");
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist");
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }
    var ignores = [
      "dist",
      "bin",
      "test",
      "Dockerfile",
      "README.md",
      "package.json",
      "deployments",
      "app",
      "webda.config.json"
    ];
    if (this.resources.package && this.resources.package.ignores) {
      ignores = ignores.concat(this.resources.package.ignores);
    }
    // Should load the ignore from a file
    var toPacks = [];

    var files;
    let packageFile = process.cwd() + "/package.json";
    if (fs.existsSync(packageFile)) {
      files = require(packageFile).files;
    }
    files = files || fs.readdirSync(".");
    for (let i in files) {
      var name = files[i];
      if (name.startsWith(".")) continue;
      if (ignores.indexOf(name) >= 0) continue;
      toPacks.push(name);
    }
    // Ensure dependencies
    if (toPacks.indexOf("node_modules") < 0) {
      let files = fs.readdirSync("node_modules");
      files.forEach(file => {
        toPacks.push(`node_modules/${file}`);
      });
    }
    var output = fs.createWriteStream(zipPath);
    var archive = archiver("zip");

    var p = new Promise((resolve, reject) => {
      output.on("finish", () => {
        resolve();
      });

      archive.on("error", function(err) {
        console.log(err);
        reject(err);
      });

      archive.pipe(output);
      for (let i in toPacks) {
        var stat = fs.lstatSync(toPacks[i]);
        if (stat.isSymbolicLink()) {
          this.addLinkPackage(archive, fs.realpathSync(toPacks[i]), toPacks[i]);
        } else if (stat.isDirectory()) {
          archive.directory(toPacks[i], toPacks[i]);
        } else if (stat.isFile()) {
          archive.file(toPacks[i]);
        }
      }
      if (this._lambdaDefaultHandler) {
        var entrypoint = require.resolve(__dirname + "/aws-entrypoint.js");
        if (fs.existsSync(entrypoint)) {
          archive.file(entrypoint, {
            name: "entrypoint.js"
          });
        } else if (fs.existsSync("deployers/aws-entrypoint.js")) {
          archive.file("deployers/aws-entrypoint.js", {
            name: "entrypoint.js"
          });
        } else {
          throw Error("Cannot find the entrypoint for Lambda");
        }
      }
      archive.append(this.srcConfig, {
        name: "webda.config.json"
      });
      archive.finalize();
    });
    return p;
  }

  private async createLambdaFunction() {
    this.stepper("Creating Lambda function");
    // Size limit of Lambda direct upload : 69905067 bytes
    var params: any = {
      MemorySize: this._lambdaMemorySize,
      Code: {},
      FunctionName: this._lambdaFunctionName,
      Handler: this._lambdaHandler,
      Role: this._lambdaRole,
      Runtime: "nodejs10.x",
      Timeout: this._lambdaTimeout,
      Description: "Deployed with Webda for API: " + this._restApiName,
      Publish: true
    };
    await this.addPackageToUpdateFunction(params.Code);
    this._lambdaFunction = await this._awsLambda
      .createFunction(params)
      .promise();
  }

  private async removeLambdaPermission(sid) {
    return this._awsLambda
      .removePermission({
        FunctionName: this._lambdaFunctionName,
        StatementId: sid
      })
      .promise();
  }

  private async addLambdaPermission() {
    console.log("Setting Lambda rights");
    var key = "Webda" + this.restApiId;
    return this.getLambdaPolicy()
      .then(p => {
        var stats = JSON.parse(p.Policy).Statement;
        for (let i in stats) {
          if (stats[i].Sid === key) {
            // Do not update as the policy is already set
            return Promise.resolve();
          }
        }
        return Promise.reject({
          code: "ResourceNotFoundException"
        });
      })
      .catch(err => {
        if (err.code !== "ResourceNotFoundException") throw err;
        var awsId = this._lambdaFunction.FunctionArn.split(":")[4];
        var params = {
          Action: "lambda:InvokeFunction",
          FunctionName: this._lambdaFunctionName,
          Principal: "apigateway.amazonaws.com",
          StatementId: key,
          SourceArn:
            "arn:aws:execute-api:" +
            this.region +
            ":" +
            awsId +
            ":" +
            this.restApiId +
            "/*"
        };
        return this._awsLambda.addPermission(params).promise();
      });

    // http://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html
    // "arn:aws:execute-api:us-east-1:my-aws-account-id:my-api-id/my-stage/GET/my-resource-path"
  }

  private async getLambdaPolicy() {
    return this._awsLambda
      .getPolicy({
        FunctionName: this._lambdaFunctionName
      })
      .promise();
  }

  async addPackageToUpdateFunction(params) {
    if (this._lambdaStorage) {
      let regexp = "s3://(.+)/(.+)";
      let res = new RegExp(regexp).exec(this._lambdaStorage);
      if (!res || res.length < 3) {
        console.log("Lambda Storage does not match", regexp);
        process.exit(0);
      }
      params.S3Bucket = res[1];
      params.S3Key = res[2];
      await this.putFilesOnBucket(params.S3Bucket, [
        {
          key: params.S3Key,
          src: this._zipPath
        }
      ]);
    } else if (this._packageOversize) {
      console.log(
        "Cannot upload Lambda function without a LambdaStorage if package bigger than",
        AWS_UPLOAD_MAX,
        "b"
      );
      process.exit(0);
    } else {
      params.ZipFile = this._package;
    }
  }

  private async updateLambdaFunction() {
    this.stepper("Updating Lambda function");
    var params = {
      FunctionName: this._lambdaFunctionName,
      Publish: true
    };
    await this.addPackageToUpdateFunction(params);
    let fct = await this._awsLambda.updateFunctionCode(params).promise();
    await this.cleanVersions(fct);
    var updateConfigurationParams = {
      MemorySize: this._lambdaMemorySize,
      FunctionName: this._lambdaFunctionName,
      Handler: this._lambdaHandler,
      Role: this._lambdaRole,
      Runtime: "nodejs10.x",
      Timeout: this._lambdaTimeout,
      Description: "Deployed with Webda for API: " + this._restApiName
    };
    await this._awsLambda
      .updateFunctionConfiguration(updateConfigurationParams)
      .promise();
  }

  cleanVersions(fct) {
    return this._awsLambda
      .listVersionsByFunction({
        FunctionName: fct.FunctionName
      })
      .promise()
      .then(res => {
        res.Versions.sort((a, b) => {
          if (a.Version === "$LATEST") {
            return -1;
          }
          if (b.Version === "$LATEST") {
            return 1;
          }
          if (parseInt(a.Version) > parseInt(b.Version)) {
            return -1;
          }
          return 1;
        });
        if (res.Versions.length <= this.resources.lambdaVersionsLimit) {
          return Promise.resolve(fct);
        }
        let versions = res.Versions.slice(this.resources.lambdaVersionsLimit);
        let promise = Promise.resolve();
        for (let i in versions) {
          promise.then(() => {
            return this._awsLambda
              .deleteFunction({
                FunctionName: fct.FunctionName,
                Qualifier: versions[i].Version
              })
              .promise();
          });
        }
        return promise.then(() => {
          return Promise.resolve(fct);
        });
      });
  }

  private async generateLambda(getOnly: boolean = false) {
    let fcts = await this._awsLambda.listFunctions().promise();
    for (let i in fcts.Functions) {
      if (fcts.Functions[i].FunctionName == this._lambdaFunctionName) {
        this._lambdaFunction = fcts.Functions[i];
        if (getOnly) {
          return;
        }
        if (fcts.Functions[i].CodeSha256 == this._packageHash) {
          this.stepper("Not updating Lambda Function as it has not changed");
          // No need to update the lambda function
          return;
        }
        return this.updateLambdaFunction();
      }
    }
    // Could handle paging
    return this.createLambdaFunction();
  }

  private async generateAPIGateway() {
    if (!this._lambdaFunction) {
      await this.generateLambda(true);
    }
    this.stepper("Generating Swagger");
    let swagger: any = await this._webda.exportSwagger(
      this.deployment.name,
      false
    );
    swagger.info.title = this._restApiName;
    for (let p in swagger.paths) {
      // TODO We should reenable mockCors once found the issue of
      // Invalid mapping expression parameter specified: method.response.header.Access-Control-Allow-Credentials
      if (
        //(this._addOPTIONS || this._addMockCORS) &&
        !swagger.paths[p]["options"]
      ) {
        swagger.paths[p]["options"] = {};
      }
      for (let m in swagger.paths[p]) {
        swagger.paths[p][m]["x-amazon-apigateway-integration"] = {
          httpMethod: "POST",
          uri: `arn:aws:apigateway:${this.region}:lambda:path/2015-03-31/functions/${this._lambdaFunction.FunctionArn}/invocations`,
          type: "aws_proxy"
        };
      }
      if (this._addMockCORS && !swagger.paths[p]["options"]) {
        let methods = [];
        for (let m in swagger.paths[p]) {
          methods.push(m);
        }
        swagger.paths[p]["options"] = {
          responses: {
            "200": {
              description: "Default CORS header"
            }
          },
          "x-amazon-apigateway-integration": this.getMockCORSMethod(
            methods.join(",").toUpperCase()
          )
        };
      }
    }
    fs.writeFileSync("./postedSwagger.json", JSON.stringify(swagger, null, 2));
    this.stepper("Importing Swagger to API Gateway");
    await this.generateAPIGatewayMapping(JSON.stringify(swagger, null, 2));
    this.stepper("Setting permissions and publish");
    await this.generateAPIGatewayStage();
    await this.addLambdaPermission();
    console.log(
      "You can now access to your API to : https://" +
        this.restApiId +
        ".execute-api." +
        this.region +
        ".amazonaws.com/" +
        this.deployment.uuid
    );
    if (this.resources.customDomain && this.resources.customCertificate) {
      return this.generateAPIGatewayCustomDomain();
    }
  }

  private async generateAPIGatewayCustomDomain() {
    let domain = this.resources.customDomainName || this.resources.restApi;
    let cert;
    // Check custom certificate
    if (!this.resources.customCertificate) {
      return;
    }
    let endpoint = this.resources.customDomainEndpoint || "EDGE";
    let region;
    if (endpoint === "EDGE") {
      // Enforce region to us-east-1 for certificate
      region = "us-east-1";
    }
    // For EDGE need to be in us-east-1 -> might want to upgrade to both EDGE and REGIONAL
    cert = await this._createCertificate(domain, region);
    let res = await this._awsGateway.getDomainNames().promise();
    let custom;
    // Search for the custom domain
    for (let i in res.items) {
      if (res.items[i].domainName === domain) {
        custom = res.items[i];
      }
    }
    if (!custom) {
      let params: any = {
        domainName: domain,
        endpointConfiguration: {
          types: [endpoint]
        }
      };
      if (endpoint === "EDGE") {
        params.certificateArn = cert.CertificateArn;
      } else {
        params.regionalCertificateArn = cert.CertificateArn;
      }
      // Create one
      console.log("Create API Gateway custom domain", domain);
      custom = await this._awsGateway.createDomainName(params).promise();
      await this._awsGateway
        .createBasePathMapping({
          domainName: domain,
          restApiId: this.restApiId,
          basePath: "",
          stage: this.deployment.uuid
        })
        .promise();
    }
    await this._createDNSEntry(
      domain,
      "CNAME",
      custom.distributionDomainName || custom.regionalDomainName
    );
  }

  private async generateAPIGatewayStage() {
    console.log("Generating API Gateway Deployment");
    return this._awsGateway
      .createDeployment({
        restApiId: this.restApiId,
        stageName: this.deployment.uuid
      })
      .promise();
  }

  private async getRestApi() {
    return this._awsGateway
      .getRestApis()
      .promise()
      .then(result => {
        var resource = null;
        for (var i in result.items) {
          if (result.items[i].name === this._restApiName) {
            resource = result.items[i];
            this.restApiId = resource.id;
            break;
          }
        }
        return Promise.resolve(resource);
      });
  }

  private async generateAPIGatewayMapping(swagger) {
    console.log("Creating API Gateway Mapping");
    let api = await this.getRestApi();
    if (!api) {
      api = await this._awsGateway
        .createRestApi({
          name: this._restApiName,
          description: "Webda Auto Deployed"
        })
        .promise();
    }
    this.restApiId = api.id;
    await this._awsGateway
      .putRestApi({
        body: swagger,
        failOnWarnings: false,
        restApiId: api.id,
        mode: "overwrite"
      })
      .promise();
  }

  private getMockCORSMethod(methods) {
    let result: any = {
      type: "mock"
    };
    var responseParameters = {};
    responseParameters["method.response.header.Access-Control-Allow-Headers"] =
      "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'";
    // Should improve this with methods
    if (methods) {
      methods = methods + ",OPTIONS";
    } else {
      methods = "POST,PUT,GET,DELETE,OPTIONS";
    }
    responseParameters["method.response.header.Access-Control-Allow-Methods"] =
      "'" + methods + "'";
    responseParameters["method.response.header.Access-Control-Allow-Origin"] =
      "'" + this._origin + "'";
    responseParameters[
      "method.response.header.Access-Control-Allow-Credentials"
    ] = "'true'";
    result.requestTemplates = {};
    result.requestTemplates["application/json"] = '{"statusCode": 200}';
    result.responses = {};
    result.responses["default"] = {
      statusCode: "200",
      responseTemplates: {
        "application/json": ""
      },
      responseParameters
    };
    return result;
  }

  static getModda() {
    return {
      uuid: "WebdaDeployer/Lambda",
      label: "Lambda",
      description: "Deploy on Lambda, map it with API Gateway",
      webcomponents: [],
      logo: "images/icons/lambda.png",
      configuration: {
        widget: {
          url: "elements/deployers/webda-lambda-deployer.html",
          tag: "webda-lambda-deployer"
        },
        default: {},
        schema: {
          type: "object"
        }
      }
    };
  }
}
