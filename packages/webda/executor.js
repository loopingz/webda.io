var Executor = function (callable) {
	self = this;
	self.callable = callable;
	self.params = callable.params;
	if (self.params == undefined) {
		self.params = {}; 
	}
};

Executor.prototype = Executor;

Executor.prototype.execute = function(res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});
  	res.write("Callable is " + JSON.stringify(callable));
  	res.end();
};

Executor.prototype.enrichParameters = function(params) {
	for (var property in params) {
    	if (this.params[property] == undefined) {
      		this.params[property] = params[property];
    	}
  	}
}
var AWS = require('aws-sdk'); 


LambdaExecutor = function(params) {
	Executor.call(this, params);
	this._type = "LambdaExecutor";
};

LambdaExecutor.prototype = Object.create(Executor.prototype);

LambdaExecutor.prototype.execute = function(res) {
	self = this;
	console.log(AWS.Config);
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
      		res.writeHead(500, {'Content-Type': 'text/plain'});
      		res.end();
      		return;
    	}
    	if (data.Payload != '{}') {
      		// Should parse JSON
      		res.writeHead(200, {'Content-Type': 'text/plain'});
      		res.write(data.Payload);
      		res.end();
    	}
  	});
}

var fs = require('fs');
var mime = require('mime-types');

FileExecutor = function(params) {
	Executor.call(this, params);
	this._type = "FileExecutor";
};

FileExecutor.prototype = Object.create(Executor.prototype);

FileExecutor.prototype.execute = function(res) {
	self = this;
	fs.readFile(this.callable.file, 'utf8', function (err,data) {
	  if (err) {
	    return console.log(err);
	  }
	  mime_file = mime.lookup(self.callable.file);
	  console.log("Send file('" + mime_file + "'): " + self.callable.file);
	  if (mime_file) {
	  	res.writeHead(200, {'Content-Type': mime_file});
	  }
	  res.write(data);
	  res.end();
	});
}

module.exports = {"_default": LambdaExecutor, "lambda": LambdaExecutor, "debug": Executor, "file": FileExecutor }; 