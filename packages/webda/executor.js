var uuid = require('node-uuid');
var Executor = function (callable) {
	var self = this;
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

Executor.prototype.getStore = function(name) {
	var storeName = name;
	if (this.callable != undefined && this.callable.stores != undefined && this.callable.stores[name] != undefined) {
		storeName = this.callable.stores[name];
	}
	if (this._http != undefined && this._http.host != undefined) {
		storeName = this._http.host + "_" + storeName;
	}
	res = require("./store").get(storeName);
	return res;
}

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

CustomExecutor = function(params) {
	Executor.call(this, params);
	this._type = "CustomExecutor";
};

CustomExecutor.prototype = Object.create(Executor.prototype);

CustomExecutor.prototype.execute = function(req, res) {
	this.params["_http"] = this._http;
};

CustomExecutor.prototype.handleResult = function(data, res) {
	try {
		// Should parse JSON
      	var result = JSON.parse(data);		
      	if (result.code == undefined) {
      		result.code = 200;
      	}
      	if (result.headers == undefined) {
      		result.headers = {}
      	}
      	if (result.headers['Content-Type'] == undefined) {
      		result.headers['Content-Type'] = 'application/json';
      	}
      	if (result.code == 200 && (result.content == undefined || result.content == "")) {
      		result.code = 204;
      	}
    } catch(err) {
      	console.log("Error '" + err + "' parsing result: " + data);
      	res.writeHead(500);
      	res.end();
		return;
	}
	res.writeHead(result.code, result.headers);
	if (result.content != undefined) {
    	res.write(result.content);
    }
    res.end();
}

var AWS = require('aws-sdk');

LambdaExecutor = function(params) {
	CustomExecutor.call(this, params);
	this._type = "LambdaExecutor";
};

LambdaExecutor.prototype = Object.create(CustomExecutor.prototype);

LambdaExecutor.prototype.execute = function(req, res) {
	var self = this;
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
    		self.handleResult(data.Payload, res);
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
	var self = this;
	fs.readFile(this.callable.file, 'utf8', function (err,data) {
	  if (err) {
	    return console.log(err);
	  }
	  var mime_file = mime.lookup(self.callable.file);
	  console.log("Send file('" + mime_file + "'): " + self.callable.file);
	  if (mime_file) {
	  	res.writeHead(200, {'Content-Type': mime_file});
	  }
	  res.write(data);
	  res.end();
	});
};

FileExecutor = function(params) {
	CustomExecutor.call(this, params);
	this._type = "FileExecutor";
};

FileExecutor.prototype = Object.create(CustomExecutor.prototype);

FileExecutor.prototype.execute = function(req, res) {
	req.context = this.params;
	req.context.getStore = this.getStore;
	if (this.callable.type == "lambda") {
		// MAKE IT local compatible
		var data = require(this.callable.file)(params, {});
		this.handleResult(data, res);
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
	req.context = this.params;
	if (typeof(callback) == "function") {
		callback(req, res);
		console.log("end executing inline");
	} else {
		console.log("Cant execute the inline as it is not a function");
		res.writeHead(500);
		res.end();
	}
}

StoreExecutor = function(params) {
	Executor.call(this, params);
	this._type = "StoreExecutor";
};

StoreExecutor.prototype = Object.create(Executor.prototype);

StoreExecutor.prototype.checkAuthentication(req, res, object) {
	if (this.callable.expose.authentication) {
		if (req.session.currentuser == undefined || req.session.currentuser.uuid != object.user) {
			res.writeHead(403);
			res.end();
			return false;
		}
	}
	return true;
}
StoreExecutor.prototype.execute = function(req, res) {
	var store = require("./store").get(this.callable.store);
	if (store == undefined) {
		console.log("Unkown store: " + this.callable.store);
		res.writeHead(500);
		res.end();
		return;
	}
	if (this._http.method == "GET") {
		if (this.callable.expose.restrict != undefined
				&& this.callable.expose.restrict.get) {
			res.writeHead(404);
			res.end();
			return;
		}
		if (this.params.uuid) {
			var object = store.get(this.params.uuid);
			if (!this.checkAuthentication(req, res, object)) {
				return;
			}
			res.writeHead(200, {'Content-type': 'application/json'});
			result = {}
			for (prop in object) {
				// Server private property
				if (prop[0] == "_") {
					continue
				}
				result[prop] = object[prop]
			}
			res.write(JSON.stringify(object));
			res.end();
			return;
		} else {
			// List probably
		}
	} else if (this._http.method == "DELETE") {
		if (this.callable.expose.restrict != undefined
				&& this.callable.expose.restrict.delete) {
			res.writeHead(404);
			res.end();
			return;
		}
		if (!this.checkAuthentication(req, res, object)) {
			return;
		}
		if (this.params.uuid) {
			store.delete(this.params.uuid);
			res.writeHead(204);
			res.end();
			return;
		}
	} else if (this._http.method == "POST") {
		var object = req.body;
		if (this.callable.expose.restrict != undefined
				&& this.callable.expose.restrict.create) {
			res.writeHead(404);
			res.end();
			return;
		}
		if (this.callable.expose.authentication) {
			if (req.session.currentuser == undefined) {
				res.writeHead(401);
				res.end();
				return;
			}
			object.user = req.session.currentuser.uuid;
		}
		if (!object.uuid) {
			object.uuid = uuid.v4();
		}
		if (store.exists(object.uuid)) {
			res.write(409);
			res.end();
			return;
		}
		for (prop in object) {
			if (prop[0] == "_") {
				delete object[prop]
			}
		}
		var new_object = store.save(object, object.uuid);
		res.writeHead(200, {'Content-type': 'application/json'});
		res.write(JSON.stringify(new_object));
		res.end();
		return;
	} else if (this._http.method == "PUT") {
		if (this.callable.expose.restrict != undefined
				&& this.callable.expose.restrict.update) {
			res.writeHead(404);
			res.end();
			return;
		}
		if (!store.exists(this.params.uuid)) {
			res.write(404);
			res.end();
			return;
		}
		if (this.callable.expose.authentication) {
			var currentObject = store.get(this.params.uuid);
			if (!this.checkAuthentication(req, res, currentObject)) {
				return;
			}
		}
		for (prop in req.body) {
			if (prop[0] == "_") {
				delete req.body[prop]
			}
		}
		var object = store.update(req.body, this.params.uuid);
		if (object == undefined) {
			res.writeHead(500);
			res.end();
			return;
		}
		res.writeHead(200, {'Content-type': 'application/json'});
		res.write(JSON.stringify(object));
		res.end();
		return;
	}
	res.writeHead(404);
	res.end();
}

var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var GitHubStrategy = require('passport-github2').Strategy;

var Ident = function (type, uid, accessToken, refreshToken) {
	this.type = type;
	this.uid = uid;
	this.uuid = uid + "_" + type;
	this.tokens = {};
	this.tokens.refresh = refreshToken;
	this.tokens.access = accessToken;
}

Ident.prototype = Ident;

Ident.prototype.getUser = function() {
	return this.user;
}

Ident.prototype.setUser = function(user) {
	this.user = user;
}

Ident.prototype.setMetadatas = function(meta) {
	this.metadatas = meta;
}

Ident.prototype.getMetadatas = function() {
	return this.metadatas;
}

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
	var result = {};
	result[map+'/callback']={};
	result[map+'/return']={};
	return result;
};

PassportExecutor.prototype.executeCallback = function(req, res) {
	var self = this;
	next = function (err) {
		console.log("Error happened: " + err);
		console.trace();
	}
	switch (self.params.provider) {
		case "facebook":
			self.setupFacebook(req, res);
			passport.authenticate('facebook', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res, next);
			return;
		case "github":
			self.setupGithub(req, res);
			passport.authenticate('github', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res, next);
			return;
		case "email":
			self.handleEmailCallback(req, res);
			return;
		case "phone":
			self.handlePhoneCallback(req, res);
			return;
	}
};

PassportExecutor.prototype.getCallback = function () {
	var self = this;
	if (self.callable._extended) {
		callback = "http://" + self._http.headers.host + self._http.url;
	} else {
		callback = "http://" + self._http.headers.host + self._http.url + "/callback";
	}
	return callback;
};

PassportExecutor.prototype.setupGithub = function(req, res) {
	var self = this;
	var callback = self.getCallback();
	passport.use(new GitHubStrategy({
		    clientID: self.callable.providers.github.clientID,
		    clientSecret: self.callable.providers.github.clientSecret,
		    callbackURL: callback
		},
		function(accessToken, refreshToken, profile, done) {
		    console.log("return from github: " + JSON.stringify(profile));
		    req.session.authenticated = new Ident("github", profile.id, accessToken, refreshToken);
		    req.session.authenticated.setMetadatas(profile._json);
		    self.store(req.session);
		    done(null, profile);
		}
	));
}

PassportExecutor.prototype.store = function(session) {
	var self = this;
	var identStore = this.getStore("idents");
	if (identStore == undefined) {
		return;
	}
	var identObj = identStore.get(session.authenticated.uuid);
	if (identObj == undefined) {
		identObj = session.authenticated;
	} else {
		identObj.metadatas = session.authenticated.metadatas;
	}
	identObj.lastUsed = new Date();
	// TODO Add an update method for updating only attribute
	identStore.save(identObj);
	if (identObj.user != undefined) {
		userStore = self.getStore("users");
		if (userStore == undefined) {
			return;
		}
		session.currentuser = userStore.get(identObj.user);
	}
}

PassportExecutor.prototype.setupFacebook = function(req, res) {
	var self = this;
	var callback = self.getCallback();
	passport.use(new FacebookStrategy({
		    clientID: self.callable.providers.facebook.clientID,
		    clientSecret: self.callable.providers.facebook.clientSecret,
		    callbackURL: callback
		},
		function(accessToken, refreshToken, profile, done) {
		    console.log("return from fb: " + JSON.stringify(profile));
            req.session.authenticated = new Ident("facebook", profile.id, accessToken, refreshToken);
            // Dont store useless parts
            delete profile._raw;
            delete profile._json;
		    req.session.authenticated.setMetadatas(profile);
		    self.store(req.session);
		    done(null, req.session.authenticated);
		}
	));
}

PassportExecutor.prototype.handleEmailCallback = function(req, res) {

}

PassportExecutor.prototype.handlePhoneCallback = function(req, res) {

}

PassportExecutor.prototype.handleEmail = function(req, res) {
	var identStore = this.getStore("idents");
	if (identStore == undefined) {
		res.writeHead(500);
		console.log("Email auth needs an ident store");
		res.end();
		return;
	}
	var uuid = "" + "_email";
	var ident = identStore.get(uuid);
	if (ident != undefined && ident.user != undefined) {
		var userStore = this.getStore("users");
		var user = userStore.get(ident.user);
		// Check password
		res.end();
	}
	// Read the form
	res.writeHead(204);
	// Should send an email
	res.end();
}

PassportExecutor.prototype.handlePhone = function(req, res) {
	res.writeHead(204);
	res.end();
}

PassportExecutor.prototype.execute = function(req, res) {
	var self = this;
	req._passport = {};
	req._passport.instance = passport;
	req._passport.session = req.session;
	if (self.callable._extended ) {
		self.executeCallback(req, res);
		return;
	}
	switch (self.params.provider) {
		case "facebook":
			self.setupFacebook();
			passport.authenticate('facebook', {'scope': self.callable.providers.facebook.scope})(req, res);
			return;
		case "github":
			self.setupGithub();
			passport.authenticate('github', {'scope': self.callable.providers.github.scope})(req, res);
			return;
		case "phone":
			this.handlePhone(req, res);
			return;
		case "email":
			this.handleEmail(req, res);
			return;
	}
	res.end();
};
module.exports = {"_default": LambdaExecutor, "custom": CustomExecutor, "inline": InlineExecutor, "lambda": LambdaExecutor, "debug": Executor, "store": StoreExecutor, "string": StringExecutor, "resource": ResourceExecutor, "file": FileExecutor , "passport": PassportExecutor}; 
