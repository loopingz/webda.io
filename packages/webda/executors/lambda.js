"use strict";
const CustomExecutor = require("./custom.js");

class LambdaExecutor extends CustomExecutor {
	constructor(webda, name, params) {
		super(webda, name, params);
	};

	execute() {
		return new Promise( function(resolve, reject) {
			var self = this;
			var AWS = require('aws-sdk');
			AWS.config.update({region: 'us-west-2'});
			AWS.config.update({accessKeyId: this.params['accessKeyId'], secretAccessKey: this.params['secretAccessKey']});
			var lambda = new AWS.Lambda();
			this.params["_http"] = this._http;
			var params = {
				FunctionName: this.callable['lambda'], /* required */
				ClientContext: null,
				InvocationType: 'RequestResponse',
				LogType: 'None',
				Payload: JSON.stringify(this['params'])// not sure here / new Buffer('...') || 'STRING_VALUE'
		    };
		  	lambda.invoke(params, function(err, data) {
		    	if (err) {
		      		console.log(err, err.stack);
		      		self.writeHead(500, {'Content-Type': 'text/plain'});
		      		self.end();
		      		return reject(err);
		    	}
		    	if (data.Payload != '{}') {
		    		self.handleResult(data.Payload);
		    	}
		    	return resolve();
		  	});
		}.bind(this));
	}
}

module.exports = LambdaExecutor