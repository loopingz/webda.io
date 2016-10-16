"use strict";

class LambdaCaller {

	constructor(arn, config) {
		if (arn instanceof Object) {
			config = arn;
			arn = config.arn;
		}
		if (!arn) {
			throw new Error("ARN is required");
		}
		this.AWS = require('aws-sdk');
		if (config.region) {
			this.AWS.config.update({region: config.region});
		}
		if (config['accessKeyId'] !== undefined) {
			this.AWS.config.update({accessKeyId: config['accessKeyId'], secretAccessKey: config['secretAccessKey']});
		}
		this._arn = arn;
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