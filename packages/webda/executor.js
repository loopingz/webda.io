var Executor = function (callable) {
	self = this;
	self.callable = callable;
	self.params = callable.params;
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

LambdaExecutor = function(params) {
	Executor.call(this, params);
	this._type = "LambdaExecutor";
};

LambdaExecutor.prototype = Object.create(Executor.prototype);

LambdaExecutor.prototype.execute = function(res) {
	self = this;
	this.params["_http"] = this._http;
	res.writeHead(200, {'Content-Type': 'text/plain'});
  	res.write("Lambda Callable is " + this.params.lambda);
  	res.write("\nParams: " + JSON.stringify(this.params));
  	res.write("\nhttp: " + JSON.stringify(this._http));
  	res.end();
}

module.exports = {"_default": LambdaExecutor, "lambda": LambdaExecutor, "debug": Executor }; 