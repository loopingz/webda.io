"use strict";
const Deployer = require("./deployer");
const AWS = require('aws-sdk');

class AWSDeployer extends Deployer {

	deploy() {
		console.log('deployAWS');
		this._awsGateway;
		this._awsLambda;
		if (this.resources.region !== undefined) {
			AWS.config.update({region: this.resources.region});
			console.log('setting region to: ' + this.resources.region);
		}
		AWS.config.update({accessKeyId: this.resources.accessKeyId, secretAccessKey: this.resources.secretAccessKey});
		this._awsGateway = new AWS.APIGateway();
		this._awsLambda = new AWS.Lambda();
		this.generatePackage();
		this.generateLambda();
		//this.generateAPIGatewayMapping();
	}
	generatePackage() {

	}

	generateLambda() {

	}

	generateAPIGatewayMapping() {
		return this._awsGateway.getRestApis().promise().then( (result) => {
			var resource = null;
			for (var i in result.items) {
				if (result.items[i].name === this.resources.restApi) {
					resource = result.items[i];
				}
			}
			if (resource === undefined) {
				return this._awsGateway.createRestApi({'name': this.resources.restApi, 'description': 'Webda Auto Deployed'}).promise();
			}
			return Promise.resolve(resource);
		}).then( (result) => {
			this.restApiId = result.id;
			return this._awsGateway.getResources({'restApiId': this.restApiId, 'limit': 500}).promise();
		}).then( (result) => {
			this._promises = [];
			var found = {};
			var promise = Promise.resolve();
			this.tree = {};
			var toCreate = [];
			this._progression = 0;
			console.log(this.tree);
			for (let i in result.items) {
				this.tree[result.items[i].path]=Promise.resolve(result.items[i]);
			}
			// Compare with local
			for (let i in this.config) {
				if (i[0] !== '/') continue;
				if (this.tree[i]) {
					found[i] = true;
					promise = promise.then (() => {
						return this.updateAwsResource(this.tree[i], this.config[i])
					});
				} else {
					toCreate.push(this.config[i]);
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
				//this._promises.push();
			}
			// Remove old resources
			for (let i in this.tree) {
				if (found[i]) continue;
				promise = promise.then (() => {
					return this.deleteAwsResource(this.tree[i])
				});
				this._promises.push();
			}
			return promise;
		});
	}

	updateAwsResource(remote, local) {
		// For now i am lazy and remove all methods to recreate
		// Need to update template anyway
		var updateResource;
		return remote.then ((resource) => {
			updateResource = resource;
			var promise = Promise.resolve();
			for (let i in resource.resourceMethods) {
				promise = promise.then (() => {
					return this._awsGateway.deleteMethod({'resourceId':resource.id,'restApiId':this.restApiId,'httpMethod':i}).promise();
				});
			}
			return promise;
		}).then (() => {
			if (typeof(local.method) == "string") {
				return this.createAWSMethodResource(updateResource, local, local.method);
			} else {
				return this.createAWSMethodsResource(updateResource, local, local.method);
			}
		});
	}

	deleteAwsResource(remote) {
		return this._awsGateway.deleteResource({'resourceId':remote.id, 'restApiId': this.restApiId}).promise();
	}

	createAWSMethodResource(resource, local, method) {
		return this._awsGateway.putMethod({"authorizationType":"NONE",'resourceId':resource.id,'httpMethod':method, 'restApiId': this.restApiId}).promise().then ((awsMethod) => {
			var params = {'resourceId':resource.id,'integrationHttpMethod': method,'httpMethod':method, 'restApiId': this.restApiId, 'type': 'AWS'};
			var webda_arn = "arn:aws:lambda:us-west-2:277712386420:function:webda-deploy";
			params.uri = "arn:aws:apigateway:us-west-2:lambda:path/2015-03-31/functions/" + webda_arn + "/invocations";
			params.requestTemplates={};
			params.requestParameters={};
			//params.requestParameters["test"]="deployed";
			params.requestTemplates["application/json"]=this.getRequestTemplates();
			console.log(params);
			return this._awsGateway.putIntegration(params).promise();
		});
	}

	createAWSMethodsResource(resource, local, methods) {
		if (!methods.length) {
			return Promise.resolve();
		}
		// AWS dont like to have too much request at the same time :)
		return this.createAWSMethodResource(resource, local, methods[0]).then( () => {
			return this.createAWSMethodsResource(resource, local, methods.slice(1));
		});
	}

	createAwsResource(local) {
		var i = local._url.indexOf("/",1);
		var promise = this.tree['/'];
		while (i >= 0) {
		  let currentPath = local._url.substr(0,i);
		  promise = promise.then( (item) => {
		    if (this.tree[currentPath] === undefined) {
		    	let pathPart = currentPath.substr(currentPath.lastIndexOf('/')+1);
		    	return this._awsGateway.createResource({'parentId':item.id,'pathPart':pathPart, 'restApiId': this.restApiId}).promise()
		    }
		    return Promise.resolve(this.tree[currentPath]);
		  });
		  i = local._url.indexOf("/", i+1);
		}
		return promise.then( (parent) => {
			let pathPart = local._url.substr(local._url.lastIndexOf('/')+1);
			let params = {'parentId':parent.id,'pathPart':pathPart, 'restApiId': this.restApiId};
			return this.tree[local._url] = this._awsGateway.createResource(params).promise();
		}).then ((resource) => {
			return this.createAWSMethodsResource(resource, local, local.method);
		});
	}

	getRequestTemplates() {
		return  `#set($allParams = $input.params())
		{
		"body-json" : "$input.json('$')",
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

}

module.exports = AWSDeployer;