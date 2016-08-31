"use strict";

class LambdaCaller {

	constructor(config) {
		if (!config.arn) {
			throw new Error("ARN is required");
		}
		this.AWS = require('aws-sdk');
		if (config.region) {
			this.AWS.config.update({region: config.region});
		} else {
			this.AWS.config.update({region: 'us-west-2'});
		}
		if (config['accessKeyId'] !== undefined) {
			this.AWS.config.update({accessKeyId: config['accessKeyId'], secretAccessKey: config['secretAccessKey']});
		}
		this._arn = config['arn'];
	}

	execute(params, async) {
		if (!params) {
			params = {};
		}
		var invocationType;
		if (async === undefined || !async) {
			invocationType = 'RequestResponse';
		} else {
			invocationType = 'Event';
		}
		var lambda = new this.AWS.Lambda();
		var params = {
			FunctionName: this._arn,
			ClientContext: null,
			InvocationType: invocationType,
			LogType: 'None',
			Payload: JSON.stringify(params)
	    };
	  	return lambda.invoke(params).promise();
	}
}

module.exports = LambdaCaller;