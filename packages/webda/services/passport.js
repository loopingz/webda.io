"use strict";

const Executor = require('../executors/executor.js');
var passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

const Ident = require('../models/ident');

passport.serializeUser(function(user, done) {
  done(null, JSON.stringify(user));
});

passport.deserializeUser(function(id, done) {
  done(null, JSON.parse(id));
});

class PassportExecutor extends Executor {
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "PassportExecutor";
	}

	init(config) {
		var url = this._params.expose;
		if (url === undefined) {
			url = '/auth/{provider}';
		}
		this.enrichRoutes(config, url);
	}

	enrichRoutes(config, url) {
		config[url] = {"method": ["POST", "GET"], "executor": this._name};
		config[url + "/callback"] = {"method": "GET", "executor": this._name};
	    config[url + "/return"] = {"method": "GET", "executor": this._name};
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
			    self.session.authenticated = new Ident("github", profile.id, accessToken, refreshToken);
			    self.session.authenticated.setMetadatas(profile._json);
			    self.store(self.session);
			    done(null, self.session.authenticated);
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
	            self.session.authenticated = new Ident("google", profile.id, accessToken, refreshToken);
	            // Dont store useless parts
	            delete profile._raw;
	            delete profile._json;
			    self.session.authenticated.setMetadatas(profile);
			    self.store(self.session);
			    done(null, self.session.authenticated);
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
			var updates = {};
			if (identObj.user == undefined && session.currentuser != undefined) {
				updates.user = session.currentuser.uuid;
			}
			updates.lastUsed = new Date();
			updates.metadatas = session.authenticated.metadatas;
			identObj = identStore.update(updates, identObj.uuid);
		}
		// TODO Add an update method for updating only attribute
		if (identObj.user != undefined) {
			var userStore = self.getStore("users");
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
	            self.session.authenticated = new Ident("facebook", profile.id, accessToken, refreshToken);
	            // Dont store useless parts
	            delete profile._raw;
	            delete profile._json;
			    self.session.authenticated.setMetadatas(profile);
			    self.store(self.session);
			    done(null, self.session.authenticated);
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
		this.end();
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
		this.end();
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
		// TODO Handle URL instead of _extended
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
			case "logout":
				req.session.destroy();
				break;
		}
		res.end();
	}
}

module.exports = PassportExecutor