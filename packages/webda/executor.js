"use strict";

var uuid = require('node-uuid');
const crypto = require('crypto');

class Executor {
	constructor(callable) {
		var self = this;
		self.callable = callable;
		self.params = callable.params;
		if (self.params == undefined) {
			self.params = {}; 
		}
	}

	init(req, res) {
		this.session = req.session;
		this.body = req.body;
		this._rawResponse = res;
		this._rawRequest = req;
	}

	write(output) {
		this._rawResponse.write(output);
	}

	writeHead(httpCode, header) {
		this._rawResponse.writeHead(httpCode, header);
	}

	cookie(param, value) {
		if (this._cookie === undefined) {
			this._cookie = {};
		}
		this._cookie[param]=value;
	}
	end() {
		if (this._rawResponse === undefined) {
			return;
		}
		if (this._rawResponse.ended === undefined) {
			this._rawResponse.end();
		}
		this._rawResponse.ended = true;
		// Throw an exception ?
	}

	execute() {
		this.writeHead(200, {'Content-Type': 'text/plain'});
	  	this.write("Callable is " + JSON.stringify(callable));
	  	this.end();
	}
	
	getStore(name) {
		var storeName = name;
		if (this.callable != undefined && this.callable.stores != undefined && this.callable.stores[name] != undefined) {
			storeName = this.callable.stores[name];
		}
		if (this._http != undefined && this._http.host != undefined) {
			storeName = this._http.host + "_" + storeName;
		}
		return require("./store").get(storeName);
	}

	enrichRoutes(map) {
		return {};
	}

	enrichParameters(params) {
		for (var property in params) {
	    	if (this.params[property] == undefined) {
	      		this.params[property] = params[property];
	    	}
	  	}
	}
}

class CustomExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "CustomExecutor";
	}
	execute(req, res) {
		this.params["_http"] = this._http;
	}
	handleResult(data) {
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
	      	throw 500;
		}
		this.writeHead(result.code, result.headers);
		if (result.content != undefined) {
	    	this.write(result.content);
	    }
	    this.end();
	}
}

class LambdaExecutor extends CustomExecutor {
	constructor(params) {
		super(params);
		this._type = "LambdaExecutor";
	};

	execute() {
		var AWS = require('aws-sdk');
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
	      		this.writeHead(500, {'Content-Type': 'text/plain'});
	      		this.end();
	      		return;
	    	}
	    	if (data.Payload != '{}') {
	    		self.handleResult(data.Payload, res);
	    	}
	  	});
	}
}

var fs = require('fs');
var mime = require('mime-types');

class ResourceExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "ResourceExecutor";
	}

	execute() {
		var self = this;
		fs.readFile(this.callable.file, 'utf8', function (err,data) {
		  if (err) {
		    return console.log(err);
		  }
		  var mime_file = mime.lookup(self.callable.file);
		  console.log("Send file('" + mime_file + "'): " + self.callable.file);
		  if (mime_file) {
		  	this.writeHead(200, {'Content-Type': mime_file});
		  }
		  this.write(data);
		  this.end();
		});
	}
}

class FileExecutor extends CustomExecutor {
	constructor(params) {
		super(params);
		this._type = "FileExecutor";
	}

	execute() {
		if (this.callable.type == "lambda") {
			// MAKE IT local compatible
			this.params["_http"] = this._http;
			var data = require(this.callable.file)(this.params, {});
			this.handleResult(data, this._rawResponse);
		} else {
			require(this.callable.file)(this);
		}
	}
}

class StringExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "StringExecutor";
	}

	execute() {
		if (this.callable.mime) {
		   this.writeHead(200, {'Content-Type': this.callable.mime});
		}
		if (typeof this.callable.result != "string") {
			this.write(JSON.stringify(this.callable.result));
		} else {
			this.write(this.callable.result);
		}
		this.end();
	}
}

class InlineExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "InlineExecutor";
	}

	execute() {
		var callback;
		// Eval the Inline method
		eval("callback = " + this.callable.callback);
		if (typeof(callback) == "function") {
			callback(this);
		} else {
			console.log("Cant execute the inline as it is not a function");
			throw 500;
		}
	}
}

class StoreExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "StoreExecutor";
	};

	checkAuthentication(object) {
		if (this.callable.expose.restrict.authentication) {
			var field = "user";
			if (typeof(this.callable.expose.restrict.authentication) == "string") {
				field = this.callable.expose.restrict.authentication;
			}
			if (this.session.currentuser == undefined || this.session.currentuser.uuid != object[field]) {
				throw 403;
			}
		}
		return true;
	}
	execute() {
		var store = require("./store").get(this.callable.store);
		if (store == undefined) {
			console.log("Unkown store: " + this.callable.store);
			this.writeHead(500);
			this.end();
			return;
		}
		if (this._http.method == "GET") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.get) {
				throw 404;
			}
			if (this.params.uuid) {
				var object = store.get(this.params.uuid);
	                        if (object === undefined) {
	                            throw 404;
	                        }
				if (!this.checkAuthentication(object)) {
					return;
				}
				this.writeHead(200, {'Content-type': 'application/json'});
				var result = {};
				for (var prop in object) {
					// Server private property
					if (prop[0] == "_") {
						continue
					}
					result[prop] = object[prop]
				}
	            this.write(JSON.stringify(result));
				this.end();
				return;
			} else {
				// List probably
			}
		} else if (this._http.method == "DELETE") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.delete) {
				throw 404;
			}
			var object = store.get(this.params.uuid);
			if (object === undefined) {
				throw 404;
			}
			if (!this.checkAuthentication(object)) {
				return;
			}
			if (this.params.uuid) {
				store.delete(this.params.uuid);
				throw 204;
			}
		} else if (this._http.method == "POST") {
			var object = this.body;
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.create) {
				throw 404;
			}
			if (this.callable.expose.restrict.authentication) {
				if (this.session.currentuser == undefined) {
					throw 401;
				}
				object.user = this.session.currentuser.uuid;
			}
			if (!object.uuid) {
				object.uuid = uuid.v4();
			}
			if (store.exists(object.uuid)) {
				throw 409;
			}
			for (var prop in object) {
				if (prop[0] == "_") {
					delete object[prop]
				}
			}
			var new_object = store.save(object, object.uuid);
			this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(new_object));
			this.end();
			return;
		} else if (this._http.method == "PUT") {
			if (this.callable.expose.restrict != undefined
					&& this.callable.expose.restrict.update) {
				throw 404;
			}
			if (!store.exists(this.params.uuid)) {
				throw 404;
			}
			if (this.callable.expose.restrict.authentication) {
				var currentObject = store.get(this.params.uuid);
				if (!this.checkAuthentication(currentObject)) {
					return;
				}
			}
			for (var prop in req.body) {
				if (prop[0] == "_") {
					delete req.body[prop]
				}
			}
			var object = store.update(req.body, this.params.uuid);
			if (object == undefined) {
				throw 500;
			}
			this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(object));
			this.end();
			return;
		}
		throw 404;
	}
}

var passport = require('passport');
var TwitterStrategy = require('passport-twitter').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
var GitHubStrategy = require('passport-github2').Strategy;
var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

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

class PassportExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "PassportExecutor";
	}

	enrichRoutes(map) {
		var result = {};
		result[map+'/callback']={};
		result[map+'/return']={};
		return result;
	};

	executeCallback(req, res) {
		var self = this;
		var next = function (err) {
			console.log("Error happened: " + err);
			console.log(err.stack);
		}
		switch (self.params.provider) {
			case "facebook":
				self.setupFacebook(req, res);
				passport.authenticate('facebook', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res, next);
	                        break;
			case "google":
				self.setupGoogle(req, res);
				passport.authenticate('google', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res, next);
	                        break;
			case "github":
				self.setupGithub(req, res);
				passport.authenticate('github', { successRedirect: self.callable.successRedirect, failureRedirect: self.callable.failureRedirect})(req, res, next);
	                        break;
			case "email":
				self.handleEmailCallback(req, res);
				break;
			case "phone":
				self.handlePhoneCallback(req, res);
				break;
		}
	};

	getCallback() {
		var callback;
		var self = this;
		if (self.callable._extended) {
			callback = self._http.protocol + "://" + self._http.host + self._http.url;
		} else {
			callback = self._http.protocol + "://" + self._http.host + self._http.url + "/callback";
		}
		return callback;
	};

	setupGithub(req, res) {
		var self = this;
		var callback = self.getCallback();
		passport.use(new GitHubStrategy({
			    clientID: self.callable.providers.github.clientID,
			    clientSecret: self.callable.providers.github.clientSecret,
			    callbackURL: callback
			},
			function(accessToken, refreshToken, profile, done) {
			    console.log("return from github: " + JSON.stringify(profile));
			    this.session.authenticated = new Ident("github", profile.id, accessToken, refreshToken);
			    this.session.authenticated.setMetadatas(profile._json);
			    self.store(this.session);
			    done(null, this.session.authenticated);
			}
		));
	}

	setupGoogle(req, res) {
		var self = this;
		var realm = self.callable.providers.google.realm;
		var callback = self.getCallback();
		if (realm == null) {
			realm = callback;
		}
		passport.use(new GoogleStrategy({
	    		clientID: this.callable.providers.google.clientID,
	            clientSecret: this.callable.providers.google.clientSecret,
	  			callbackURL: callback
			},
			function(accessToken, refreshToken, profile, done) {
			    console.log("return from google: " + JSON.stringify(profile));
	            this.session.authenticated = new Ident("google", profile.id, accessToken, refreshToken);
	            // Dont store useless parts
	            delete profile._raw;
	            delete profile._json;
			    this.session.authenticated.setMetadatas(profile);
			    self.store(this.session);
			    done(null, this.session.authenticated);
			}
		));
	}

	store(session) {
		var self = this;
		var identStore = this.getStore("idents");
		if (identStore == undefined) {
			return;
		}
		var identObj = identStore.get(session.authenticated.uuid);
		if (identObj == undefined) {
			identObj = session.authenticated;
			if (identObj.user == undefined && session.currentuser != undefined) {
				identObj.user = session.currentuser.uuid;
			}
			identStore.save(identObj);
		} else {
			updates = {};
			if (identObj.user == undefined && session.currentuser != undefined) {
				updates.user = session.currentuser.uuid;
			}
			updates.lastUsed = new Date();
			updates.metadatas = session.authenticated.metadatas;
			identObj = identStore.update(updates, identObj.uuid);
		}
		// TODO Add an update method for updating only attribute
		if (identObj.user != undefined) {
			userStore = self.getStore("users");
			if (userStore == undefined) {
				return;
			}
			session.currentuser = userStore.get(identObj.user);
		}
	}

	setupFacebook(req, res) {
		var self = this;
		var callback = self.getCallback();
		passport.use(new FacebookStrategy({
			    clientID: self.callable.providers.facebook.clientID,
			    clientSecret: self.callable.providers.facebook.clientSecret,
			    callbackURL: callback
			},
			function(accessToken, refreshToken, profile, done) {
			    console.log("return from fb: " + JSON.stringify(profile));
	            this.session.authenticated = new Ident("facebook", profile.id, accessToken, refreshToken);
	            // Dont store useless parts
	            delete profile._raw;
	            delete profile._json;
			    this.session.authenticated.setMetadatas(profile);
			    self.store(this.session);
			    done(null, this.session.authenticated);
			}
		));
	}

	handleEmailCallback(req, res) {
		var identStore = this.getStore("idents");
		if (identStore === undefined) {
			console.log("Email auth needs an ident store");
			throw 500;
			return;
		}
		var updates = {};
		var uuid = req.body.login + "_email";
		var ident = identStore.get(uuid);
		if (ident != undefined && ident.user != undefined) {
			var userStore = this.getStore("users");
			var user = userStore.get(ident.user);
			var hash = crypto.createHash('sha256');
			// Check password
			if (user._password === hash.update(req.body.password).digest('hex')) {
				if (ident.failedLogin > 0) {
					ident.failedLogin = 0;
				}
				updates.lastUsed = new Date();
				updates.failedLogin = 0;
				ident = identStore.update(updates, ident.uuid);
				req.session.authenticated = ident;
				throw 204;
			} else {
				if (ident.failedLogin === undefined) {
					ident.failedLogin = 0;
				}
				updates.failedLogin = ident.failedLogin++;
				updates.lastFailedLogin = new Date();
				ident = identStore.update(updates, ident.uuid);
				throw 403;
			}
		} else {
			// Read the form
			throw 404;
		}
		// Should send an email
		end();
	}

	handlePhoneCallback(req, res) {

	}

	handleEmail(req, res) {
		var identStore = this.getStore("idents");
		if (identStore === undefined) {
			console.log("Email auth needs an ident store");
			throw 500;
			return;
		}
		var uuid = "" + "_email";
		console.log(identStore);
		var ident = identStore.get(uuid);
		if (ident != undefined && ident.user != undefined) {
			var userStore = this.getStore("users");
			var user = userStore.get(ident.user);
			// Check password
			res.end();
		}
		// Read the form
		throw 204;
		// Should send an email
	}

	handlePhone(req, res) {
		this.writeHead(204);
	}

	execute() {
		var self = this;
		var req = this._rawRequest;
		var res = this._rawResponse;
		req._passport = {};
		req._passport.instance = passport;
		req._passport.session = this.session;
		if (self.callable._extended ) {
			self.executeCallback(req, res);
			return;
		}
		var next = function(err) {
			console.log("Error happened: " + err);
			console.trace();
		}
		switch (self.params.provider) {
			case "google":
				self.setupGoogle();
				passport.authenticate('google', {'scope': self.callable.providers.google.scope})(req, res, next);
				break;
			case "facebook":
				self.setupFacebook();
				passport.authenticate('facebook', {'scope': self.callable.providers.facebook.scope})(req, res, next);
				break;
			case "github":
				self.setupGithub();
				passport.authenticate('github', {'scope': self.callable.providers.github.scope})(req, res, next);
				break;
			case "phone":
				this.handlePhone(req, res);
				break;
			case "email":
				this.handleEmail(req, res);
				break;
		}
		res.end();
	}
}

class FileBinaryExecutor extends Executor {
	constructor(params) {
		super(params);
		this._type = "FileBinaryExecutor";
		console.log(params);
		if (!fs.existsSync(params.binary.folder)) {
			fs.mkdirSync(params.binary.folder);
		}
	}

	execute(req, res) {
		var self = this;
		var targetStore = this.getStore(this.params.store);
		if (targetStore === undefined) {
			throw 404;
		}
		var object = targetStore.get(this.params.uid);
		if (object === undefined) {
			throw 404;
		}
		if (object[this.params.property] !== undefined && typeof(object[this.params.property]) !== 'object') {
			throw 403;
		}
		var file;
		if (this._http.method == "POST") {
			var hash = crypto.createHash('sha256');
			var bytes;
			if (req.files !== undefined) {
				file = req.files[0];
			} else {
				file = {};
				file.buffer = req.body;
				file.mimetype = req.headers.contentType;
				file.size = len(req.body);
				file.originalname = '';
			}
			var hashValue = hash.update(file.buffer).digest('hex');
			// TODO Dont overwrite if already there
			fs.writeFile(this.callable.binary.folder + hashValue, file.buffer, function (err) {
				var update = {};
				update[self.params.property] = object[self.params.property];
				if (update[self.params.property] === undefined) {
					update[self.params.property] = [];
				}
				var fileObj = {};
				for (var i in req.body) {
					fileObj[i] = req.body[i];
				}
				fileObj['name']=file.originalname;
				fileObj['mimetype']=file.mimetype;
				fileObj['size']=file.size;
				fileObj['hash']=hashValue;
				update[self.params.property].push(fileObj);
				targetStore.update(update, self.params.uid);
		    	self.writeHead(200, {'Content-type': 'application/json'});
				self.write(JSON.stringify(targetStore.get(self.params.uid)));
		    	self.end();
		  	});
		} else if (this._http.method == "GET") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			file = object[this.params.property][this.params.index];
			this.writeHead(200, {
	        	'Content-Type': file.mimetype===undefined?'application/octet-steam':file.mimetype,
	        	'Content-Length': file.size
		    });

		    var readStream = fs.createReadStream(this.callable.binary.folder + file.hash);
		    // We replaced all the event handlers with a simple call to readStream.pipe()
		    readStream.pipe(this._rawResponse);
		} else if (this._http.method == "DELETE") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var update = {};
			if (object[self.params.property][this.params.index].hash !== this.params.hash) {
				throw 412;
			}
			update[self.params.property] = object[self.params.property];
			update[self.params.property].slice(this.params.index, 1);
			targetStore.update(update, self.params.uid);
			// TODO Delete binary or update its count
		    this.writeHead(200, {'Content-type': 'application/json'});
			this.write(JSON.stringify(targetStore.get(self.params.uid)));
			this.end();
		} else if (this._http.method == "PUT") {
			if (object[this.params.property] === undefined || object[this.params.property][this.params.index] === undefined) {
				throw 404;
			}
			var update = {};
			if (object[self.params.property][this.params.index].hash !== this.params.hash) {
				throw 412;
			}
			// Should avoid duplication
			var hash = crypto.createHash('sha256');
			var bytes;
			if (req.files !== undefined) {
				file = req.files[0];
			} else {
				file = {};
				file.buffer = req.body;
				file.mimetype = req.headers.contentType;
				file.size = len(req.body);
				file.originalname = '';
			}
			var hashValue = hash.update(file.buffer).digest('hex');
			// TODO Dont overwrite if already there
			fs.writeFile(this.callable.binary.folder + hashValue, file.buffer, function (err) {
				var update = {};
				update[self.params.property] = object[self.params.property];
				if (update[self.params.property] === undefined) {
					update[self.params.property] = [];
				}
				var fileObj = {};
				for (var i in req.body) {
					fileObj[i] = req.body[i];
				}
				fileObj['name']=file.originalname;
				fileObj['mimetype']=file.mimetype;
				fileObj['size']=file.size;
				fileObj['hash']=hashValue;
				update[self.params.property] = object[self.params.property];
				update[self.params.property][self.params.index]=fileObj;
				targetStore.update(update, self.params.uid);
		    	self.writeHead(200, {'Content-type': 'application/json'});
				self.write(JSON.stringify(targetStore.get(self.params.uid)));
		    	self.end();
		  	});
		}
	}
}

module.exports = {"_default": LambdaExecutor, "custom": CustomExecutor, "inline": InlineExecutor, "lambda": LambdaExecutor, "debug": Executor, "store": StoreExecutor, "string": StringExecutor, "resource": ResourceExecutor, "file": FileExecutor , "passport": PassportExecutor, "filebinary": FileBinaryExecutor}; 
