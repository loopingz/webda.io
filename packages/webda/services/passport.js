"use strict";

const Executor = require('../executors/executor.js');
var passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const crypto = require("crypto");
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
			url = '/auth';
		} else {
			url = this._params.expose;
		}
		// Handle the lost password here
		url += '/{provider}';
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
		return identStore.get(session.authenticated.uuid).get( (identObj) => {
			// TODO FINISH THIS
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
		});
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
		var uuid = req.body.email + "_email";
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

	sendValidationEmail(email, register) {
		console.log("Should send " + email + " " + register);
	}

	hashPassword(pass) {
		var hash = crypto.createHash('sha256');
		return hash.update(pass).digest('hex');
	}

	login(user, ident) {
		var event = {};
		event.userId = user;
		if (typeof(user) == "object") {
			event.userId = user.uuid;
			event.user = user;
		}
		event.identId = ident;
		if (typeof(ident) == "object") {
			event.identId = ident.uuid;
			event.ident = ident;
		}
		this.session.login(event.userId, event.identId);
		this.emit("login", event);
	}

	getMailMan() {
		return this.getService(this._params.providers.email.mailer?this._params.providers.email.mailer:"Mailer");
	}

	handleEmail() {
		var identStore = this.getStore(this._params.userStore?this._params.userStore:"Idents");
		if (identStore === undefined) {
			console.log("Email auth needs an ident store");
			throw 500;
		}
		if (this.body.password === undefined || this.body.email === undefined) {
			throw 400;
		}
		var mailConfig = this._params.providers.email;
		var mailerService = this.getMailMan();
		if (mailerService === undefined) {
			// Bad configuration ( might want to use other than 500 )
			//throw 500;
		}
		var userStore = this.getStore(this._params.userStore?this._params.userStore:"Users");
		var updates = {};
		var uuid = req.body.email + "_email";
		return identStore.get(uuid).then( (ident) => {
			if (ident != undefined && ident.user != undefined) {
				return userStore.get(ident.user).then ( (user) => {
					// Check password
					if (user._password === this.hashPassword(req.body.password)) {
						if (ident.failedLogin > 0) {
							ident.failedLogin = 0;
						}
						updates.lastUsed = new Date();
						updates.failedLogin = 0;

						return identStore.update(updates, ident.uuid).then ( () => {
							this.login(ident.user, ident);
							throw 204;
						});
						
					} else {
						if (ident.failedLogin === undefined) {
							ident.failedLogin = 0;
						}
						updates.failedLogin = ident.failedLogin++;
						updates.lastFailedLogin = new Date();
						return identStore.update(updates, ident.uuid).then( () => {
							throw 403;
						});
					}
				});
			} else {
				var user = this.body.user;
				var email = this.body.email;
				var validation;
				// Read the form
				if (this.params.validationToken) {
					validation = this.body.validationToken;
					if (validation !== this.generateEmailValidationToken()) {
						throw 403;
					}
					if (this.session.isLogged()) {
						return identStore.save({'uuid': uuid, 'email': email, 'user': this.session.getUserId()});
					}
				}
				if (this.body.register) {
					// Need to check email before creation
					if (mailConfig.postValidation || mailConfig.postValidation === undefined) {
						// ValidationToken is undefined send a email
						return this.sendValidationEmail(email);
					}
					if (user === undefined) {
						user = {};
					}
					// Store with a _
					user._password = this.hashPassword(this.body.password);
					delete this.body.password;
					return userStore.save(user).then ( (user) => {
						return identStore.save({'uuid': uuid, 'email': email, 'user': user.uuid});
					}).then ( (ident) => {
						this.login(user, ident);
						return Promise.resolve();
					});
				}
				throw 404;
			}
			this.end();
		});
	}

	generateEmailValidationToken() {

	}

	handlePhone() {
		this.writeHead(204);
	}

	execute() {
		// TODO Handle URL instead of _extended
		// 0 is safe unless a callback provider exists
		if (this._http.url.indexOf('callback') > 0) {
			this.executeCallback(this, this);
			return;
		}
		var next = function(err) {
			console.log("Error happened: " + err);
			console.trace();
		}
		switch (this.params.provider) {
			case "google":
				this.setupGoogle();
				return passport.authenticate('google', {'scope': this._params.providers.google.scope})(this, this, next);
			case "facebook":
				this.setupFacebook();
				let res = passport.authenticate('facebook', {'scope': this._params.providers.facebook.scope})(this, this, next);
				console.log(res);
				return res
			case "github":
				this.setupGithub();
				return passport.authenticate('github', {'scope': this._params.providers.github.scope})(this, this, next);
			case "phone":
				return this.handlePhone();
			case "email":
				return this.handleEmail();
			case "logout":
				this.session.destroy();
				// Destroy cookie
				break;
		}
	}
}

module.exports = PassportExecutor