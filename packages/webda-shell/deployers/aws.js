"use strict";
const Deployer = require("./deployer");
const AWS = require('aws-sdk');
const fs = require('fs');
const crypto = require('crypto');
const colors = require('colors');
const LAMBDA_ROLE_POLICY = '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}';

class AWSDeployer extends Deployer {

  _getObjectTypeName(type) {
    return this._lambdaFunctionName + type;
  }

  generateARN(args) {
    let accessKeyId = this.resources.accessKeyId || env('AWS_ACCESS_KEY_ID');
    let secretAccessKey = this.resources.secretAccessKey || env('AWS_SECRET_ACCESS_KEY');
    let region = this.resources.region || env('AWS_DEFAULT_REGION');
    this._lambdaFunctionName = this.resources.lamdaFunctionName || this.resources.restApi;
    let services = this.getServices();
    let roleName = this._getObjectName('Role');
    let policyName = this._getObjectName('Policy');
    let sts = new AWS.STS();
    let iam = new AWS.IAM();
    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey, region: region});
    this.resources.AWS = AWS;
    return sts.getCallerIdentity().promise().then( (id) => {
      // arn:aws:logs:us-east-1:123456789012:*
      let statements = [];
      this.resources.AWSAccountId = id.Account;

      if (this.resources.lambdaRole) {
        return Promise.resolve();
      }

      // Build policy
      for (let i in services) {
        if (services[i].getARNPolicy) {
          statements.push(services[i].getARNPolicy(id.Account));
        }
      }
      statements.push({
          "Sid": "WebdaLambdaLog",
          "Effect": "Allow",
          "Action": [
              "logs:CreateLogGroup",
              "logs:CreateLogStream"
          ],
          "Resource": [
              "arn:aws:logs:" + region + ":" + id.Account + ":*"
          ]
      });
      let policyDocument = {
        "Version": "2012-10-17",
        "Statement": statements
      }
      let policy;
      return iam.listPolicies({PathPrefix: '/webda/'}).promise().then( (data) => {
        for (let i in data.Policies) {
          if (data.Policies[i].PolicyName === policyName) {
            policy = data.Policies[i];
          }
        }
        if (!policy) {
          console.log('Creating AWS Policy', policyName);
          // Create the policy has it doesnt not exist
          return iam.createPolicy({PolicyDocument: JSON.stringify(policyDocument), PolicyName: policyName, Description: 'webda-generated', Path: '/webda/'}).promise().then( (data) => {
            policy = data.Policy;
          });
        } else {
          // Compare policy with the new one
          return iam.getPolicyVersion({PolicyArn: policy.Arn, VersionId: policy.DefaultVersionId}).promise().then( (data) => {
            // If nothing changed just continue
            if (decodeURIComponent(data.PolicyVersion.Document) === JSON.stringify(policyDocument)) {
              return Promise.resolve();
            }
            console.log('Update AWS Policy', policyName);
            // Create new version for the policy
            return iam.createPolicyVersion({PolicyArn: policy.Arn, PolicyDocument: JSON.stringify(policyDocument), SetAsDefault: true}).promise().then( () => {
              // Remove old version
              return iam.deletePolicyVersion({PolicyArn: policy.Arn, VersionId: policy.DefaultVersionId}).promise();
            });
          })
        }
      }).then( () => {
        // 
        return iam.listRoles({PathPrefix: '/webda/'}).promise().then( (data) => {
          let role;
          for (let i in data.Roles) {
            if (data.Roles[i].RoleName === roleName) {
              role = data.Roles[i];
            }
          }
          if (!role) {
            console.log('Creating AWS Role', roleName);
            return iam.createRole({Description: 'webda-generated', Path: '/webda/', RoleName: roleName, AssumeRolePolicyDocument: LAMBDA_ROLE_POLICY}).promise();
          }
          return Promise.resolve(role);
        }).then( () => {
          return iam.listAttachedRolePolicies({RoleName: roleName}).promise();
        }).then( (data) => {
          for (let i in data.AttachedPolicies) {
            if (data.AttachedPolicies[i].PolicyName === policyName) {
              return Promise.resolve();
            }
          }
          console.log('Attaching AWS Policy', policyName, 'to', roleName);
          return iam.attachRolePolicy({PolicyArn: policy.Arn, RoleName: roleName}).promise();
        });
      });
    });
  }

  installServices(args) {
    return this.generateARN(args).then( () => {
      return super.installServices(args);
    });
  }

  deploy(args) {
    this._maxStep = 4;
    if (args[0] === "package") {
      this._maxStep = 1;
    } else if (args[0] === "lambda") {
      this._maxStep = 2;
    } else if (args[0] === "aws-only") {
      this._maxStep = 3;
    }
    this._restApiName = this.resources.restApi;
    this._lambdaFunctionName = this.resources.lamdaFunctionName || this.resources.restApi;
    this._lambdaRole = this.resources.lambdaRole;
    this._lambdaHandler = this.resources.lambdaHandler;
    this._lambdaDefaultHandler = this._lambdaHandler === undefined;
    this._lambdaHandler = this._lambdaDefaultHandler ? 'entrypoint.handler' : this._lambdaHandler;
    this._lambdaTimeout = 3;

    var promise = Promise.resolve();

    if (!this._lambdaRole) {
      let iam = new AWS.IAM();
      let roleName = this._getObjectTypeName('Role');
      // No role has been supplied search for the auto generate one
      promise = iam.listRoles({PathPrefix: '/webda/'}).promise().then( (data) => {
        let role;
        for (let i in data.Roles) {
          if (data.Roles[i].RoleName === roleName) {
            role = data.Roles[i];
            this._lambdaRole = role.Arn;
            return;
          }
        }
      });
    }

    if (this._lambdaFunctionName === undefined) {
      throw Error("Need to define LambdaRole and a Rest API Name");
    }
    if (this._restApiName === undefined) {
      this._maxStep = 2;
    }
    promise = promise.then( () => {
      if (!this._lambdaRole.startsWith("arn:aws")) {
        // Try to get the Role ARN ?
        throw Error("LambdaRole needs to be the ARN of the Role");
      }
    });

    if (this.resources.lambdaMemory) {
      this._lambdaMemorySize = this.resources.lambdaMemory;
    } else {
      // Dont handle less well for now
      this._lambdaMemorySize = 512;
    }
    this._awsGateway;
    this._awsLambda;
    if (this.resources.region !== undefined) {
      AWS.config.update({region: this.resources.region});
      console.log('Setting region to: ' + this.resources.region);
    }
    this.region = AWS.config.region;
    let zipPath = "dist/" + this._lambdaFunctionName + '.zip';
    let accessKeyId = this.resources.accessKeyId || env('AWS_ACCESS_KEY_ID');
    let secretAccessKey = this.resources.secretAccessKey || env('AWS_SECRET_ACCESS_KEY');
    AWS.config.update({accessKeyId: accessKeyId, secretAccessKey: secretAccessKey});
    this._awsGateway = new AWS.APIGateway();
    this._awsLambda = new AWS.Lambda();
    this._origin = this.params.website;

    if (!this.resources.lambdaVersionsLimit) {
      this.resources.lambdaVersionsLimit = 3;
    }

    if (args != undefined) {
      if (args[0] === "export") {
        return this.export(args.slice(1));
      }
    }
    console.log("Deploying to " + "AWS".yellow);
    
    if (args[0] !== "aws-only") {
      promise = promise.then(() => {
        return this.generatePackage(zipPath);
      });
    }

    promise.then(() => {
      this._package = fs.readFileSync(zipPath);
      var hash = crypto.createHash('sha256');
      this._packageHash = hash.update(this._package).digest('base64');
      console.log("Package dist/" + this._lambdaFunctionName + ".zip (" + this._packageHash + ")");
    });

    if (args[0] === "package") {
      return promise;
    }

    promise = promise.then(() => {
      return this.generateLambda();
    })
    if (args[0] === "lambda" || this._restApiName === undefined) {
      return promise;
    }
    return promise.then(() => {
      return this.generateAPIGateway();
    }).then(() => {
      return this.installServices();
    }).catch((err) => {
      console.log(err);
    });
  }

  export(args) {
    if (args.length == 0) {
      console.log("Please specify the output file");
      return;
    }
    var exportFile = args[args.length - 1];
    args.pop();
    var params = {accepts: 'application/json', stageName: this.deployment.uuid};
    if (args === undefined || args[0] === undefined) {
      params.exportType = 'swagger';
    } else {
      params.exportType = args[0];
      args = args.slice(1);
      params.parameters = {};
      for (var i in args) {
        params.parameters[args[i]] = args[i];
      }
    }
    console.log("Exporting " + params.exportType + " to " + exportFile);
    return this.getRestApi().then((api) => {
      params.restApiId = this.restApiId;
      return this._awsGateway.getExport(params).promise().then((exportJson) => {
        fs.writeFileSync(exportFile, exportJson.body);
      });
    });
  }

  generatePackage(zipPath) {
    this.stepper("Creating package");
    var archiver = require('archiver');
    if (!fs.existsSync("dist")) {
      fs.mkdirSync("dist");
    }
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath)
    }
    var ignores = ['dist', 'bin', 'test', 'Dockerfile', 'README.md', 'package.json', 'deployments', 'app', 'webda.config.json'];
    if (this.resources.package && this.resources.package.ignores) {
      ignores = ignores.concat(this.resources.package.ignores);
    }
    // Should load the ignore from a file
    var toPacks = [];
    var files = fs.readdirSync('.');
    for (let i in files) {
      var name = files[i];
      if (name.startsWith(".")) continue;
      if (ignores.indexOf(name) >= 0) continue;
      toPacks.push(name);
    }
    var output = fs.createWriteStream(zipPath);
    var archive = archiver('zip');

    var p = new Promise((resolve, reject) => {
      output.on('finish', () => {
        resolve();
      });

      archive.on('error', function (err) {
        console.log(err);
        reject(err);
      });

      archive.pipe(output);
      for (let i in toPacks) {
        var stat = fs.statSync(toPacks[i]);
        if (stat.isDirectory()) {
          archive.directory(toPacks[i], toPacks[i]);
        } else if (stat.isFile()) {
          archive.file(toPacks[i]);
        }
      }
      if (this._lambdaDefaultHandler) {
        var entrypoint = require.resolve(global.__webda_shell + "/deployers/aws_entrypoint.js");
        if (fs.existsSync(entrypoint)) {
          archive.file(entrypoint, {name: "entrypoint.js"});
        } else if (fs.existsSync("deployers/aws_entrypoint.js")) {
          archive.file("deployers/aws_entrypoint.js", {name: "entrypoint.js"})
        } else {
          throw Error("Cannot find the entrypoint for Lambda");
        }
      }
      archive.append(this.srcConfig, {name: "webda.config.json"})
      archive.finalize();
    });
    return p;
  }

  createLambdaFunction() {
    this.stepper("Creating Lambda function");
    var params = {
      MemorySize: this._lambdaMemorySize,
      Code: {
        ZipFile: this._package
      },
      FunctionName: this._lambdaFunctionName,
      Handler: this._lambdaHandler,
      Role: this._lambdaRole,
      Runtime: 'nodejs6.10',
      Timeout: this._lamdaTimeout,
      'Description': 'Deployed with Webda for API: ' + this._restApiName,
      Publish: true
    };
    return this._awsLambda.createFunction(params).promise().then((fct) => {
      this._lambdaFunction = fct;
      return Promise.resolve(fct);
    });
  }

  removeLambdaPermission(sid) {
    return this._awsLambda.removePermission({'FunctionName': this._lambdaFunctionName, 'StatementId': sid}).promise();
  }

  addLambdaPermission() {
    console.log("Setting Lambda rights");
    var key = 'Webda' + this.restApiId;
    return this.getLambdaPolicy().then((p) => {
      var stats = JSON.parse(p.Policy).Statement;
      for (let i in stats) {
        if (stats[i].Sid === key) {
          // Do not update as the policy is already set
          return Promise.resolve();
        }
      }
      return Promise.reject({code: 'ResourceNotFoundException'});
    }).catch((err) => {
      if (err.code !== 'ResourceNotFoundException') throw err;
      var awsId = this._lambdaFunction.FunctionArn.split(":")[4];
      var params = {
        Action: 'lambda:InvokeFunction',
        FunctionName: this._lambdaFunctionName,
        Principal: 'apigateway.amazonaws.com',
        StatementId: key,
        SourceArn: 'arn:aws:execute-api:' + this.region + ':' + awsId + ':' + this.restApiId + '/*'
      };
      return this._awsLambda.addPermission(params).promise();
    });

    // http://docs.aws.amazon.com/apigateway/latest/developerguide/permissions.html
    // "arn:aws:execute-api:us-east-1:my-aws-account-id:my-api-id/my-stage/GET/my-resource-path"
  }

  getLambdaPolicy() {
    return this._awsLambda.getPolicy({FunctionName: this._lambdaFunctionName}).promise();
  }

  updateLambdaFunction() {
    this.stepper("Updating Lambda function");
    var params = {FunctionName: this._lambdaFunctionName, ZipFile: this._package, Publish: true};
    return this._awsLambda.updateFunctionCode(params).promise().then((fct) => {
      return this.cleanVersions(fct);
    }).then((fct) => {
      var params = {
        MemorySize: this._lambdaMemorySize,
        FunctionName: this._lambdaFunctionName,
        Handler: this._lambdaHandler,
        Role: this._lambdaRole,
        Runtime: 'nodejs6.10',
        Timeout: this._lamdaTimeout,
        Description: 'Deployed with Webda for API: ' + this._restApiName
      };
      return this._awsLambda.updateFunctionConfiguration(params).promise();
    });
  }

  cleanVersions(fct) {
    return this._awsLambda.listVersionsByFunction({FunctionName: fct.FunctionName}).promise().then((res) => {
      res.Versions.sort((a, b) => {
        if (a.Version === '$LATEST') {
          return -1;
        }
        if (b.Version === '$LATEST') {
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
          return this._awsLambda.deleteFunction({
            FunctionName: fct.FunctionName,
            Qualifier: versions[i].Version
          }).promise();
        });
      }
      return promise.then(() => {
        return Promise.resolve(fct);
      });
    });
  }

  generateLambda() {
    return this._awsLambda.listFunctions().promise().then((fcts) => {
      for (let i in fcts.Functions) {
        if (fcts.Functions[i].FunctionName == this._lambdaFunctionName) {
          this._lambdaFunction = fcts.Functions[i];
          if (fcts.Functions[i].CodeSha256 == this._packageHash) {
            this.stepper("Not updating Lambda Function as it has not changed");
            // No need to update the lambda function
            return Promise.resolve();
          }
          return this.updateLambdaFunction();
        }
      }
      // Could handle paging
      return this.createLambdaFunction();
    });
  }

  generateAPIGateway() {
    this.stepper("Generating API Gateway");
    return this.generateAPIGatewayMapping().then(() => {
      this.stepper("Setting permissions and publish");
      return this.generateAPIGatewayStage();
    }).then((deployment) => {
      return this.addLambdaPermission();
    }).then(() => {
      console.log("You can now access to your API to : https://" + this.restApiId + ".execute-api." + this.region + ".amazonaws.com/" + this.deployment.uuid);
      return Promise.resolve();
    });
  }

  generateAPIGatewayStage() {
    console.log("Generating API Gateway Deployment");
    return this._awsGateway.createDeployment({restApiId: this.restApiId, stageName: this.deployment.uuid}).promise();
  }

  getRestApi() {
    return this._awsGateway.getRestApis().promise().then((result) => {
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

  generateAPIGatewayMapping() {
    console.log("Creating API Gateway Mapping");
    return this.getRestApi().then((result) => {
      if (!result) {
        return this._awsGateway.createRestApi({
          'name': this._restApiName,
          'description': 'Webda Auto Deployed'
        }).promise();
      }
      return Promise.resolve(result);
    }).then((result) => {
      this.restApiId = result.id;
      return this._awsGateway.getResources({'restApiId': this.restApiId, 'limit': 500}).promise();
    }).then((result) => {
      var found = {};
      var promise = Promise.resolve();
      this.tree = {};
      var toCreate = [];
      this._progression = 0;
      for (let i in result.items) {
        this.tree[result.items[i].path] = result.items[i];
      }
      found["/"] = true;
      // Compare with local
      for (let url in this.config) {
        if (url[0] !== '/') continue;
        let current = this.config[url];
        // Need to cut the query section
        if (url.indexOf("?") >= 0) {
          current._fullUrl = url;
          current._queryParameters = url.substr(url.indexOf("?") + 1, url.length - url.indexOf("?") - 2).split(",");
          current._url = url.substr(0, url.indexOf("?") - 1);
          url = current._url;
        }
        let i = url.indexOf("/", 1);
        let currentPath = url.substr(0, i);
        while (i >= 0) {
          found[url.substr(0, i)] = true;
          i = url.indexOf("/", i + 1);
        }
        if (this.tree[url]) {
          found[url] = true;
          promise = promise.then(() => {
            return this.updateAwsResource(this.tree[url], current)
          });
        } else {
          toCreate.push(current);
        }
      }

      // Order to create per path
      toCreate.sort(function (a, b) {
        return a._url.localeCompare(b._url);
      });

      for (let i in toCreate) {
        promise = promise.then(() => {
          return this.createAwsResource(toCreate[i])
        });
      }

      // Remove old resources
      for (let i in this.tree) {
        if (found[i]) continue;
        continue;
        promise = promise.then(() => {
          return this.deleteAwsResource(this.tree[i]);
        });
      }
      return promise;
    });
  }

  updateAwsResource(resource, local) {
    var promise = Promise.resolve();
    var allowedMethods;
    for (let i in resource.resourceMethods) {
      promise = promise.then(() => {
        return this._awsGateway.deleteMethod({
          'resourceId': resource.id,
          'restApiId': this.restApiId,
          'httpMethod': i
        }).promise();
      });
    }
    return promise.then(() => {
      if (typeof(local.method) == "string") {
        allowedMethods = local.method;
        return this.createAWSMethodResource(resource, local, local.method);
      } else {
        allowedMethods = local.method.join(",");
        return this.createAWSMethodsResource(resource, local, local.method);
      }
    }).then(() => {
      if (this._origin) {
        return this.createCORSMethod(resource, allowedMethods);
      }
      return Promise.resolve();
    });
    ;
  }

  deleteAwsResource(remote) {
    return this._awsGateway.deleteResource({'resourceId': remote.id, 'restApiId': this.restApiId}).promise();
  }

  createAWSMethodResource(resource, local, method) {
    console.log("Creating " + method + " on " + local._url);
    var params = {
      "authorizationType": "NONE",
      'resourceId': resource.id,
      'httpMethod': method,
      'restApiId': this.restApiId
    };
    params.requestParameters = {};
    for (let i in local._queryParameters) {
      if (local._queryParameters[i].startsWith("*")) {
        console.log("Wildcard are not supported by AWS :(");
        continue;
      }
      params.requestParameters["method.request.querystring." + local._queryParameters[i]] = false;
    }
    return this._awsGateway.putMethod(params).promise().then((awsMethod) => {
      // Integration type : AWS_PROXY
      var params = {
        'resourceId': resource.id,
        'integrationHttpMethod': 'POST',
        'httpMethod': method,
        'restApiId': this.restApiId,
        'type': 'AWS_PROXY'
      };
      params.uri = "arn:aws:apigateway:" + this.region + ":lambda:path/2015-03-31/functions/" + this._lambdaFunction.FunctionArn + "/invocations";
      return this._awsGateway.putIntegration(params).promise();
    });
  }

  createCORSMethod(resource, methods) {
    console.log("Adding OPTIONS method for CORS");
    var responseParameters = {};
    responseParameters['method.response.header.Access-Control-Allow-Headers'] = "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'";
    // Should improve this with methods
    if (methods) {
      methods = methods + ",OPTIONS";
    } else {
      methods = "POST,PUT,GET,DELETE,OPTIONS";
    }
    responseParameters['method.response.header.Access-Control-Allow-Methods'] = "'" + methods + "'";
    responseParameters['method.response.header.Access-Control-Allow-Origin'] = "'" + this._origin + "'";
    responseParameters['method.response.header.Access-Control-Allow-Credentials'] = "'true'";
    var params = {
      "authorizationType": "NONE",
      'resourceId': resource.id,
      'httpMethod': 'OPTIONS',
      'restApiId': this.restApiId
    };
    return this._awsGateway.putMethod(params).promise().then(() => {
      var params = {'resourceId': resource.id, 'httpMethod': 'OPTIONS', 'restApiId': this.restApiId, 'type': 'MOCK'};
      params.requestTemplates = {};
      params.requestParameters = {};
      params.requestTemplates["application/json"] = '{"statusCode": 200}';
      return this._awsGateway.putIntegration(params).promise();
    }).then(() => {
      // AWS ReturnCode
      var params = {
        'resourceId': resource.id,
        'httpMethod': 'OPTIONS',
        'restApiId': this.restApiId,
        'statusCode': '200'
      };
      params.responseModels = {};
      params.responseModels["application/json"] = 'Empty';
      var map = {};
      for (let i in responseParameters) {
        map[i] = false;
      }
      params.responseParameters = map;
      return this._awsGateway.putMethodResponse(params).promise();
    }).then(() => {
      var params = {
        'resourceId': resource.id,
        'httpMethod': 'OPTIONS',
        'restApiId': this.restApiId,
        'statusCode': '200'
      };
      params.responseTemplates = {};
      params.responseParameters = responseParameters;
      params.responseTemplates["application/json"] = "";
      return this._awsGateway.putIntegrationResponse(params).promise();
    });
  }

  createAWSMethodsResource(resource, local, methods) {
    if (!methods.length) {
      return Promise.resolve();
    }
    // AWS dont like to have too much request at the same time :)
    return this.createAWSMethodResource(resource, local, methods[0]).then(() => {
      return this.createAWSMethodsResource(resource, local, methods.slice(1));
    });
  }

  createAwsResource(local) {
    var i = local._url.indexOf("/", 1);
    var allowedMethods;
    var resource;
    var promise = new Promise((resolve, reject) => {
      resolve(this.tree['/']);
    });
    while (i >= 0) {
      let currentPath = local._url.substr(0, i);
      promise = promise.then((item) => {
        if (this.tree[currentPath] === undefined) {
          let pathPart = currentPath.substr(currentPath.lastIndexOf('/') + 1);
          this.tree[currentPath] = this._awsGateway.createResource({
            'parentId': item.id,
            'pathPart': pathPart,
            'restApiId': this.restApiId
          }).promise()
          return this.tree[currentPath];
        }
        return Promise.resolve(this.tree[currentPath]);
      });
      i = local._url.indexOf("/", i + 1);
    }
    return promise.then((parent) => {
      let pathPart = local._url.substr(local._url.lastIndexOf('/') + 1);
      let params = {'parentId': parent.id, 'pathPart': pathPart, 'restApiId': this.restApiId};
      return this.tree[local._url] = this._awsGateway.createResource(params).promise();
    }).then((res) => {
      resource = res;
      if (typeof(local.method) == "string") {
        allowedMethods = local.method;
        return this.createAWSMethodResource(resource, local, local.method);
      } else {
        allowedMethods = local.method.join(",");
        return this.createAWSMethodsResource(resource, local, local.method);
      }
    }).then(() => {
      if (this._origin) {
        return this.createCORSMethod(resource, allowedMethods);
      }
      return Promise.resolve();
    });
  }

  static getModda() {
    return {
      "uuid": "aws",
      "label": "AWS",
      "description": "Deploy on Lambda, map it with API Gateway",
      "webcomponents": [],
      "logo": "images/placeholders/aws.png",
      "configuration": {
        "default": {
          "params": {},
          "resources": {
            "accessKeyId": "YOUR ACCESS KEY",
            "secretAccessKey": "YOUR SECRET KEY",
            "restApi": "API NAME",
            "lambdaRole": "EXECUTION ROLE FOR LAMBDA"
          },
          "services": {}
        },
        "schema": {
          type: "object"
        }
      }
    }
  }
}

module.exports = AWSDeployer;
