"use strict";
const CustomExecutor = require("./custom.js");

class LambdaExecutor extends CustomExecutor {
	constructor(webda, name, params) {
		super(webda, name, params);
		if (params.accessKeyId === undefined || params.accessKeyId === '') {
			this._params.accessKeyId = params.accessKeyId = process.env["WEBDA_AWS_KEY"];
		}
		if (params.secretAccessKey === undefined || params.secretAccessKey === '') {
			this._params.secretAccessKey = params.secretAccessKey = process.env["WEBDA_AWS_SECRET"];
		}
	};

	execute() {
		return new Promise( (resolve, reject) => {
			if (!this._params['arn']) {
				return reject("arn of the Lambda method to inkoke is required");
			}
			var AWS = require('aws-sdk');
			AWS.config.update({region: 'us-west-2'});
			AWS.config.update({accessKeyId: this._params['accessKeyId'], secretAccessKey: this._params['secretAccessKey']});
			var lambda = new AWS.Lambda();
			var params = {};
			params["_http"] = this._route._http;
			var params = {
				FunctionName: this._params['arn'], /* required */
				ClientContext: null,
				InvocationType: 'RequestResponse',
				LogType: 'None',
				Payload: JSON.stringify(params)// not sure here / new Buffer('...') || 'STRING_VALUE'
		    };
		  	lambda.invoke(params, (err, data) => {
		    	if (err) {
		      		console.log(err, err.stack);
		      		this.writeHead(500, {'Content-Type': 'text/plain'});
		      		this.end();
		      		return reject(err);
		    	}
		    	if (data.Payload != '{}') {
		    		this.handleResult(data.Payload);
		    	}
		    	return resolve();
		  	});
		});
	}
}

module.exports = LambdaExecutor