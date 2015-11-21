var Executor = function (callable) {
	self = this;
	self.callable = callable;
	self.params = callable.params;
	if (self.params == undefined) {
		self.params = {}; 
	}
};

Executor.prototype = Executor;

Executor.prototype.execute = function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});
  	res.write("Callable is " + JSON.stringify(callable));
  	res.end();
};

Executor.prototype.enrichRoutes = function(map) {
	return {};
};

Executor.prototype.enrichParameters = function(params) {
	for (var property in params) {
    	if (this.params[property] == undefined) {
      		this.params[property] = params[property];
    	}
  	}
};
var AWS = require('aws-sdk'); 


LambdaExecutor = function(params) {
	Executor.call(this, params);
	this._type = "LambdaExecutor";
};

LambdaExecutor.prototype = Object.create(Executor.prototype);

LambdaExecutor.prototype.execute = function(req, res) {
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
};

var fs = require('fs');
var mime = require('mime-types');

ResourceExecutor = function(params) {
	Executor.call(this, params);
	this._type = "ResourceExecutor";
};

ResourceExecutor.prototype = Object.create(Executor.prototype);

ResourceExecutor.prototype.execute = function(req, res) {
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
};

FileExecutor = function(params) {
	Executor.call(this, params);
	this._type = "FileExecutor";
};

FileExecutor.prototype = Object.create(Executor.prototype);

FileExecutor.prototype.execute = function(req, res) {
	self = this;
	if (this.callable.type == "lambda") {
		// MAKE IT local compatible
	} else {
		require(this.callable.file)(req, res);
	}
};

StringExecutor = function(params) {
	Executor.call(this, params);
	this._type = "StringExecutor";
};

StringExecutor.prototype = Object.create(Executor.prototype);

StringExecutor.prototype.execute = function(req, res) {
	if (this.callable.mime) {
	   res.writeHead(200, {'Content-Type': this.callable.mime});
	}
	if (typeof this.callable.result != "string") {
		res.write(JSON.stringify(this.callable.result));
	} else {
		res.write(this.callable.result);
	}
	res.end();
};

InlineExecutor = function(params) {
	Executor.call(this, params);
	this._type = "InlineExecutor";
};

InlineExecutor.prototype = Object.create(Executor.prototype);

InlineExecutor.prototype.execute = function(req, res) {
	console.log("Will evaluate : " + this.callable.callback);
	eval("callback = " + this.callable.callback);
	console.log("Inline Callback type: " + typeof(callback));
	if (typeof(callback) == "function") {
		callback(req, res);
		console.log("end executing inline");
	} else {
		console.log("Cant execute the inline as it is not a function");
		res.writeHead(500);
		res.end();
	}
}
var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var GitHubStrategy = require('passport-github2').Strategy;

passport.serializeUser(function(user, done) {
  done(null, JSON.stringify(user));
});

passport.deserializeUser(function(id, done) {
  done(null, JSON.parse(id));
});

PassportExecutor = function(params) {
	Executor.call(this, params);
	this._type = "PassportExecutor";
}

PassportExecutor.prototype = Object.create(Executor.prototype);


PassportExecutor.prototype.enrichRoutes = function(map) {
	result = {};
	result[map+'/callback']={};
	result[map+'/return']={};
	return result;
};

PassportExecutor.prototype.executeCallback = function(req, res) {
	self = this;
	switch (self.params.provider) {
		case "facebook":
			self.setup_facebook(req, res);
			passport.authenticate('facebook', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res);
			return;
		case "github":
			self.setup_github(req, res);
			passport.authenticate('github', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res);
			return;
	}
};

PassportExecutor.prototype.get_callback = function () {
	if (self.callable._extended) {
		callback = "http://" + self._http.headers.host + self._http.url;
	} else {
		callback = "http://" + self._http.headers.host + self._http.url + "/callback";
	}
	return callback;
};

PassportExecutor.prototype.setup_github = function(req, res) {
	callback = self.get_callback();
	passport.use(new GitHubStrategy({
		    clientID: self.callable.providers.github.clientID,
		    clientSecret: self.callable.providers.github.clientSecret,
		    callbackURL: callback
		},
		function(accessToken, refreshToken, profile, done) {
		    console.log("return from github: " + JSON.stringify(profile));
		    if (req.session.auth == undefined) {
			req.session.auth = {};
		    }
		    req.session.authenticated = "github";
		    req.session.auth.github = profile;
		    done(null, profile);
		}
	));
}

PassportExecutor.prototype.setup_facebook = function(req, res) {
	callback = self.get_callback();
	passport.use(new FacebookStrategy({
		    clientID: self.callable.providers.facebook.clientID,
		    clientSecret: self.callable.providers.facebook.clientSecret,
		    callbackURL: callback
		},
		function(accessToken, refreshToken, profile, done) {
		    console.log("return from fb: " + JSON.stringify(profile));
		    if (req.session.auth == undefined) {
		           req.session.auth = {};
                    }
                    req.session.authenticated = "facebook";
		    req.session.facebook_profile = profile;
		    done(null, profile);
		}
	));
}

PassportExecutor.prototype.execute = function(req, res) {
	self = this;
	req._passport = {};
	req._passport.instance = passport;
	req._passport.session = req.session;
	if (self.callable._extended ) {
		self.executeCallback(req, res);
		return;
	}
	switch (self.params.provider) {
		case "facebook":
			self.setup_facebook();
			passport.authenticate('facebook', {'scope': self.callable.providers.facebook.scope})(req, res);
			return;
		case "github":
			self.setup_github();
			passport.authenticate('github', {'scope': self.callable.providers.github.scope})(req, res);
			return;

	}
	res.end();
};

module.exports = {"_default": LambdaExecutor, "inline": InlineExecutor, "lambda": LambdaExecutor, "debug": Executor, "string": StringExecutor, "resource": ResourceExecutor, "file": FileExecutor , "passport": PassportExecutor}; 
