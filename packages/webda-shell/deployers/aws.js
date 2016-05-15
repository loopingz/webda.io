"use strict";
const Deployer = require("./deployer");
const AWS = require('aws-sdk');
const fs = require('fs');
const crypto = require('crypto');

class AWSDeployer extends Deployer {

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
		this._lambdaFunctionName = this.resources.lamdaFunctionName;
		this._lambdaRole = this.resources.lambdaRole;
		this._lambdaTimeout = 3;
		if (this._lambdaRole === undefined || this._restApiName === undefined) {
			throw Error("Need to define LambdaRole and RestApiName at least");
		}
		if (!this._lambdaRole.startsWith("arn:aws")) {
			// Try to get the Role ARN ?
			throw Error("LambdaRole needs to be the ARN of the Role");
		}
		if (this._lambdaFunctionName === undefined) {
			this._lambdaFunctionName = this.resources.restApi;
		}
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
		let zipPath = "dist/" + this._restApiName + '.zip';
		AWS.config.update({accessKeyId: this.resources.accessKeyId, secretAccessKey: this.resources.secretAccessKey});
		this._awsGateway = new AWS.APIGateway();
		this._awsLambda = new AWS.Lambda();
		this._origin = this.params.website;

		if (args != undefined) {
			if (args[0] === "export") {
				return this.export(args.slice(1));
			}
		}
		console.log("Deploying to AWS");
		var promise = Promise.resolve();
		if (args[0] !== "aws-only") {
			promise = promise.then( () => {
				return this.generatePackage(zipPath);
			});
		}

		promise.then ( () => {
			this._package = fs.readFileSync(zipPath);
			var hash = crypto.createHash('sha256');
			this._packageHash =  hash.update(this._package).digest('base64');
			console.log("Package dist/" + this._restApiName + ".zip (" + this._packageHash + ")");
		});

		if (args[0] === "package") {
			return promise;
		}

		promise = promise.then( () => {
			return this.generateLambda();	
		})
		if (args[0] === "lambda") {
			return promise;
		}
		promise.then( () => {
			return this.generateAPIGateway();	
		}).then( () => {
			return this.installServices();
		}).catch( (err) => {
			console.log(err);
		});
	}

	export(args) {
		if (args.length == 0) {
			console.log("Please specify the output file");
			return;
		}
		var exportFile = args[args.length-1];
		args.pop();
		var params = {accepts: 'application/json', stageName: this.deployment.uuid};
		if (args === undefined || args[0] === undefined) {
			params.exportType = 'swagger';
		} else {
			params.exportType = args[0];
			args = args.slice(1);
			params.parameters = {};
			for (var i in args) {
				params.parameters[args[i]]=args[i];
			}
		}
		console.log("Exporting " + params.exportType + " to " + exportFile);
		return this.getRestApi().then ( (api) => {
			params.restApiId = this.restApiId;
			return this._awsGateway.getExport(params).promise().then ((exportJson) => {
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

		var p = new Promise( (resolve, reject) => {
			output.on('finish', () => {
				resolve();
			});

			archive.on('error', function(err){
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
			var entrypoint = require.resolve(global.__webda_shell + "/deployers/aws_entrypoint.js");
			if (fs.existsSync(entrypoint)) {
				archive.file(entrypoint, {name:"entrypoint.js"});
			} else if (fs.existsSync("deployers/aws_entrypoint.js")) {
				archive.file("deployers/aws_entrypoint.js", {name:"entrypoint.js"})	
			} else {
				throw Error("Cannot find the entrypoint for Lambda");
			}
			archive.append(this.srcConfig, {name:"webda.config.json"})	
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
			Handler: 'entrypoint.handler',
			Role: this._lambdaRole,
			Runtime: 'nodejs4.3',
			Timeout: this._lamdaTimeout,
			'Description': 'Deployed with Webda for API: ' + this._restApiName,
			Publish: true
		};
		return this._awsLambda.createFunction(params).promise().then( (fct) => {
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
		return this.getLambdaPolicy().then( (p) => {
			var stats = JSON.parse(p.Policy).Statement;
			for (let i in stats) {
				if (stats[i].Sid === key) {
					// Do not update as the policy is already set
					return Promise.resolve();
				}
			}
			return Promise.reject({code: 'ResourceNotFoundException'});
		}).catch( (err) => {
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
		return this._awsLambda.updateFunctionCode(params).promise().then( (fct) => {
			var params = {
				MemorySize: this._lambdaMemorySize,
				FunctionName: this._lambdaFunctionName,
				Handler: 'entrypoint.handler',
				Role: this._lambdaRole,
				Runtime: 'nodejs4.3',
				Timeout: this._lamdaTimeout,
				Description: 'Deployed with Webda for API: ' + this._restApiName
			};
			return this._awsLambda.updateFunctionConfiguration(params).promise();
		});
	}
	generateLambda() {
		return this._awsLambda.listFunctions().promise().then( (fcts) => {
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
		return this.generateAPIGatewayMapping().then (() => {
			this.stepper("Setting permissions and publish");
			return this.generateAPIGatewayStage();
		}).then( (deployment) => {
			return this.addLambdaPermission();
		}).then ( () => {
			console.log("You can now access to your API to : https://" + this.restApiId + ".execute-api." + this.region + ".amazonaws.com/" + this.deployment.uuid);
			return Promise.resolve();
		});
	}

	generateAPIGatewayStage() {
		console.log("Generating API Gateway Deployment");
		return this._awsGateway.createDeployment({restApiId: this.restApiId, stageName: this.deployment.uuid}).promise();
	}

	getRestApi() {
		return this._awsGateway.getRestApis().promise().then( (result) => {
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
		return this.getRestApi().then( (result) => {
			if (!result) {
				return this._awsGateway.createRestApi({'name': this._restApiName, 'description': 'Webda Auto Deployed'}).promise();
			}
			return Promise.resolve(result);
		}).then ( (result) => {
			this.restApiId = result.id;
			return this._awsGateway.getResources({'restApiId': this.restApiId, 'limit': 500}).promise();
		}).then( (result) => {
			var found = {};
			var promise = Promise.resolve();
			this.tree = {};
			var toCreate = [];
			this._progression = 0;
			for (let i in result.items) {
				this.tree[result.items[i].path]=result.items[i];
			}
			found["/"]=true;
			// Compare with local
			for (let url in this.config) {
				if (url[0] !== '/') continue;
				let current = this.config[url];
				// Need to cut the query section
				if (url.indexOf("?") >= 0) {
					current._fullUrl = url;
					current._queryParameters = url.substr(url.indexOf("?")+1, url.length-url.indexOf("?")-2).split(",");
					current._url = url.substr(0,url.indexOf("?")-1);
					url = current._url;
				}
				let i = url.indexOf("/",1);
				let currentPath = url.substr(0,i);
				while (i >= 0) {
					found[url.substr(0,i)]=true;
					i = url.indexOf("/", i+1);
		  		}
				if (this.tree[url]) {
					found[url] = true;
					promise = promise.then (() => {
						return this.updateAwsResource(this.tree[url], current)
					});
				} else {
					toCreate.push(current);
				}
			}

			// Order to create per path
			toCreate.sort(function(a,b) {
				return a._url.localeCompare(b._url);
			});
			
			for (let i in toCreate) {
				promise = promise.then (() => {
					return this.createAwsResource(toCreate[i])
				});
			}

			// Remove old resources
			for (let i in this.tree) {
				if (found[i]) continue;
				continue;
				promise = promise.then (() => {
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
			promise = promise.then (() => {
				return this._awsGateway.deleteMethod({'resourceId':resource.id,'restApiId':this.restApiId,'httpMethod':i}).promise();
			});
		}
		return promise.then (() => {
			if (typeof(local.method) == "string") {
				allowedMethods = local.method;
				return this.createAWSMethodResource(resource, local, local.method);
			} else {
				allowedMethods = local.method.join(",");
				return this.createAWSMethodsResource(resource, local, local.method);
			}
		}).then( () => {
			if (this._origin) {
				return this.createCORSMethod(resource, allowedMethods);
			}
			return Promise.resolve();
		});;
	}

	deleteAwsResource(remote) {
		console.log("deleteAwsResource: ", remote);
		return this._awsGateway.deleteResource({'resourceId':remote.id, 'restApiId': this.restApiId}).promise();
	}

	createAWSMethodResource(resource, local, method) {
		console.log("Creating " + method + " on " + local._url);
		var params = {"authorizationType":"NONE",'resourceId':resource.id,'httpMethod':method, 'restApiId': this.restApiId};
		params.requestParameters = {};
		for (let i in local._queryParameters) {
			if (local._queryParameters[i].startsWith("*")) {
				console.log("Wildcard are not supported by AWS :(");
				continue;
			}
			params.requestParameters["method.request.querystring."+local._queryParameters[i]]=false;
		}
		return this._awsGateway.putMethod(params).promise().then ((awsMethod) => {
			var params = {'resourceId':resource.id,'integrationHttpMethod': 'POST','httpMethod':method, 'restApiId': this.restApiId, 'type': 'AWS'};
			params.uri = "arn:aws:apigateway:" + this.region + ":lambda:path/2015-03-31/functions/" + this._lambdaFunction.FunctionArn + "/invocations";
			params.requestTemplates={};
			// Need to filter wildcard query params
			params.requestParameters = {};
			params.requestTemplates["application/json"]=this.getRequestTemplates();
			return this._awsGateway.putIntegration(params).promise();
		}).then ( () => {
			return this.createAWSMethodErrorReturnCode(resource, method, local.aws);
		});
	}

	createCORSMethod(resource, methods) {
		console.log("Adding OPTIONS method for CORS");
		var responseParameters={};
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
		var params = {"authorizationType":"NONE",'resourceId':resource.id,'httpMethod':'OPTIONS', 'restApiId': this.restApiId};
		return this._awsGateway.putMethod(params).promise().then( () => {
			var params = {'resourceId':resource.id,'httpMethod':'OPTIONS', 'restApiId': this.restApiId, 'type': 'MOCK'};
			params.requestTemplates={};
			params.requestParameters = {};
			params.requestTemplates["application/json"]='{"statusCode": 200}';
			return this._awsGateway.putIntegration(params).promise();
		}).then ( () => {
			// AWS ReturnCode
			var params = {'resourceId':resource.id,'httpMethod':'OPTIONS', 'restApiId': this.restApiId, 'statusCode': '200'};
			params.responseModels = {};
			params.responseModels["application/json"]='Empty';
			var map = {};
			for (let i in responseParameters) {
				map[i]=false;
			}
			params.responseParameters=map;
			return this._awsGateway.putMethodResponse(params).promise();
		}).then( () => {
			var params = {'resourceId':resource.id,'httpMethod':'OPTIONS', 'restApiId': this.restApiId, 'statusCode': '200'};
			params.responseTemplates={};
			params.responseParameters=responseParameters;
			params.responseTemplates["application/json"]="";
			return this._awsGateway.putIntegrationResponse(params).promise();
		});
	}

	getHeadersMap(integration, code, headers, defaultCode) {
		if (headers === undefined) {
			headers = [];
		}
		if (headers.length === 0) {
			headers[0] = 'Set-Cookie';
		}
		var res = {};
		// Add CORS
		if (integration) {
			res['method.response.header.Access-Control-Allow-Credentials'] = "'" + true + "'";
			res['method.response.header.Access-Control-Allow-Origin'] = "'" + this._origin + "'";
		} else {
			res['method.response.header.Access-Control-Allow-Credentials'] = false;
			res['method.response.header.Access-Control-Allow-Origin'] = false;
		}
		// Cannot handle more than one headers for non-main , due to the fact that we cannot template the statusCode....
		// https://forums.aws.amazon.com/thread.jspa?threadID=216264

		if (code !== defaultCode) {
			headers = ['Set-Cookie'];
			// Cant set any header
			return res;
		}
		for (let i in headers) {
			var value = false;
			if (integration) {
				if (code == defaultCode) {
					value = "integration.response.body.headers." + headers[i];
				} else {
					value = "integration.response.body.errorMessage";
				}
			}
			res['method.response.header.' + headers[i]] = value;
		}
		
		return res;
	}

	createAWSMethodErrorReturnCode(resource, method, aws) {
		if (aws === undefined) {
			aws = {defaultCode: "200", headersMap: ['Set-Cookie']};
		}
		if (typeof(aws.defaultCode) == "number") {
			aws.defaultCode = aws.defaultCode.toString();
		}
		var codes = ["200", "204", "302", "303", "400" ,"401","403","404","405","409","412","500"];
		// As we cannot specify error code directly we need to map each... yes i know running regexp a script engine to only find an error code doesnt look like a good idea....
		// Code headers
		var promise = Promise.resolve();
		for (let code in codes) {
			promise = promise.then( () => {
				var params = {'resourceId':resource.id,'httpMethod':method, 'restApiId': this.restApiId, 'statusCode': codes[code]};
				params.responseModels = {};
				params.responseParameters = this.getHeadersMap(false, codes[code], aws.headersMap, aws.defaultCode);
				params.responseModels["application/json"]='Empty';
				return this._awsGateway.putMethodResponse(params).promise();
			}).then ( () => {
				var params = {'resourceId':resource.id,'httpMethod':method, 'restApiId': this.restApiId, 'statusCode': codes[code]};
				params.responseTemplates={};
				params.responseParameters = this.getHeadersMap(true, codes[code], aws.headersMap, aws.defaultCode);
				if (codes[code] === aws.defaultCode) {
					params.responseTemplates["application/json"]="#set($inputRoot = $input.path('$'))\n$inputRoot.body";
				} else {
					params.responseTemplates["application/json"]="\"\"";
					params.selectionPattern=".*CODE_" + codes[code] + ".*";
				}
				return this._awsGateway.putIntegrationResponse(params).promise();
			});
		}
		return promise;
	}

	createAWSMethodsResource(resource, local, methods) {
		if (!methods.length) {
			return Promise.resolve();
		}
		var allowedMethods = methods.join(",");
		// AWS dont like to have too much request at the same time :)
		return this.createAWSMethodResource(resource, local, methods[0]).then( () => {
			return this.createAWSMethodsResource(resource, local, methods.slice(1));
		});
	}

	createAwsResource(local) {
		var i = local._url.indexOf("/",1);
		var allowedMethods;
		var resource;
		var promise = new Promise( (resolve, reject) => {
			resolve(this.tree['/']);
		});
		while (i >= 0) {
		  let currentPath = local._url.substr(0,i);
		  promise = promise.then( (item) => {
		    if (this.tree[currentPath] === undefined) {
		    	let pathPart = currentPath.substr(currentPath.lastIndexOf('/')+1);
		    	this.tree[currentPath] = this._awsGateway.createResource({'parentId':item.id,'pathPart':pathPart, 'restApiId': this.restApiId}).promise()
		    	return this.tree[currentPath];
		    }
		    return Promise.resolve(this.tree[currentPath]);
		  });
		  i = local._url.indexOf("/", i+1);
		}
		return promise.then( (parent) => {
			let pathPart = local._url.substr(local._url.lastIndexOf('/')+1);
			let params = {'parentId':parent.id,'pathPart':pathPart, 'restApiId': this.restApiId};
			return this.tree[local._url] = this._awsGateway.createResource(params).promise();
		}).then ((res) => {
			resource = res;
			if (typeof(local.method) == "string") {
				allowedMethods = local.method;
				return this.createAWSMethodResource(resource, local, local.method);
			} else {
				allowedMethods = local.method.join(",");
				return this.createAWSMethodsResource(resource, local, local.method);
			}
		}).then( () => {
			if (this._origin) {
				return this.createCORSMethod(resource, allowedMethods);
			}
			return Promise.resolve();
		});
	}

	getRequestTemplates() {
		return  `#set($allParams = $input.params())
		{
		"body-json" : $input.json('$'),
		"params" : {
		#foreach($type in $allParams.keySet())
		    #set($params = $allParams.get($type))
		"$type" : {
		    #foreach($paramName in $params.keySet())
		    "$paramName" : "$util.escapeJavaScript($params.get($paramName))"
		        #if($foreach.hasNext),#end
		    #end
		}
		    #if($foreach.hasNext),#end
		#end
		},
		"stage-variables" : {
		#foreach($key in $stageVariables.keySet())
		"$key" : "$util.escapeJavaScript($stageVariables.get($key))"
		    #if($foreach.hasNext),#end
		#end
		},
		"context" : {
			"vhost":"`+ this.vhost + `",
		    "account-id" : "$context.identity.accountId",
		    "api-id" : "$context.apiId",
		    "api-key" : "$context.identity.apiKey",
		    "authorizer-principal-id" : "$context.authorizer.principalId",
		    "caller" : "$context.identity.caller",
		    "cognito-authentication-provider" : "$context.identity.cognitoAuthenticationProvider",
		    "cognito-authentication-type" : "$context.identity.cognitoAuthenticationType",
		    "cognito-identity-id" : "$context.identity.cognitoIdentityId",
		    "cognito-identity-pool-id" : "$context.identity.cognitoIdentityPoolId",
		    "http-method" : "$context.httpMethod",
		    "stage" : "$context.stage",
		    "source-ip" : "$context.identity.sourceIp",
		    "user" : "$context.identity.user",
		    "user-agent" : "$context.identity.userAgent",
		    "user-arn" : "$context.identity.userArn",
		    "request-id" : "$context.requestId",
		    "resource-id" : "$context.resourceId",
		    "resource-path" : "$context.resourcePath"
		    }
		}`;
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