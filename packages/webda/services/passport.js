"use strict";

const Executor = require('../executors/executor.js');
var passport = require('passport');
const TwitterStrategy = require('passport-twitter').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
const crypto = require("crypto");
const _extend = require("util")._extend;
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
		// List authentication configured
		config[url] = {"method": ["GET"], "executor": this._name, "_method": this.listAuthentications};
		// Add static for email for now, if set before it should have priority
		config[url + "/email"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email"}, "_method": this.handleEmail};
		config[url + "/email/callback?email={email}&validationToken={token}"] = {"method": ["GET"], "executor": this._name, "params": {"provider": "email"}, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.handleEmailCallback};
		// Handle the lost password here
		url += '/{provider}';
		config[url] = {"method": ["GET"], "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.authenticate};
		config[url + "/callback"] = {"method": "GET", "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.callback};
	}

	callback(req, res) {
		var next = function (err) {
			console.log("Error happened: " + err);
			console.log(err.stack);
		}
		switch (this.params.provider) {
			case "facebook":
				this.setupFacebook(req, res);
				passport.authenticate('facebook', { successRedirect: this.callable.successRedirect, failureRedirect: this.callable.failureRedirect})(req, res, next);
				break;
			case "google":
				this.setupGoogle(req, res);
				passport.authenticate('google', { successRedirect: this.callable.successRedirect, failureRedirect: this.callable.failureRedirect})(req, res, next);
	            break;
			case "github":
				this.setupGithub(req, res);
				passport.authenticate('github', { successRedirect: this.callable.successRedirect, failureRedirect: this.callable.failureRedirect})(req, res, next);
				break;
			case "email":
				this.handleEmailCallback(req, res);
				break;
			case "phone":
				this.handlePhoneCallback(req, res);
				break;
		}
	};


	listAuthentications() {
		this.write(Object.keys(this._params.providers));
	}

	getCallbackUrl() {
		var url = this._route._http.protocol + "://" + this._route._http.host + this._route._http.url;
		if (url.endsWith("/callback")) {
			return url;
		}
		return url + "/callback";
	};

	setupGithub(req, res) {
		var self = this;
		var callback = self.getCallbackUrl();
		passport.use(new GitHubStrategy({
			    clientID: this._params.providers.github.clientID,
			    clientSecret: this._params.providers.github.clientSecret,
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
		var realm = this._params.providers.google.realm;
		var callback = this.getCallbackUrl();
		if (realm == null) {
			realm = callback;
		}
		passport.use(new GoogleStrategy({
	    		clientID: this._params.providers.google.clientID,
	            clientSecret: this._params.providers.google.clientSecret,
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
		var identStore = this.getService("Idents");
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
				var userStore = self.getService("Users");
				if (userStore == undefined) {
					return;
				}
				session.currentuser = userStore.get(identObj.user);
			}
		});
	}

	setupFacebook(req, res) {
		var self = this;
		var callback = self.getCallbackUrl();
		passport.use(new FacebookStrategy({
			    clientID: this._params.providers.facebook.clientID,
			    clientSecret: this._params.providers.facebook.clientSecret,
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

	handleEmailCallback() {
		var identStore = this.getService("idents");
		if (identStore === undefined) {
			console.log("Email auth needs an ident store");
			throw 500;
		}
		if (this._params.token) {
			let validation = this._params.token;
			if (validation !== this.generateEmailValidationToken(this._params.email)) {
				this.writeHead(302, {'Location': this._params.failureRedirect});
				return Promise.resolve();
			}
			var uuid = this._params.email + "_email";
			if (this.session.isLogged()) {
				return identStore.save({'uuid': uuid, 'email': this._params.email, 'user': this.session.getUserId()}).then( () => {
					this.writeHead(302, {'Location': this._params.successRedirect});
					return Promise.resolve();
				});
			} else {
				return userStore.save({}).then ( (user) => {
					return identStore.save({'uuid': uuid, 'email': this._params.email, 'user': user.uuid}).then( (ident) => {
						this.login(user, ident);
						// Redirect now
						this.writeHead(302, {'Location': this._params.successRedirect});
						return Promise.resolve();
					});
				});
			}
		}
	}

	handlePhoneCallback(req, res) {

	}

	sendValidationEmail(email) {
		var config = this._params.providers.email;
		if (!config.validationEmailSubject) {
			config.subject = "Webda Framework registration email";
		}
		let text = config.validationEmailText;
		if (!text) {
			text = "Please validate your email by clicking the link below\n{url}";
		}
		let replacements = _extend({}, config);
		replacements.url = this._route._http.root + "/auth/email?email=" + email + "&validationToken=" + this.generateEmailValidationToken(email);
		// TODO Add a template engine
		for (let i in replacements) {
			if (typeof(replacements[i]) !== "string") continue;
			text = text.replace("{"+i+"}", replacements[i]);
		}
		let mailOptions = {
		    to: email, // list of receivers
		    subject: config.subject, // Subject line
		    text: text
        };
		this.getMailMan().send(mailOptions);
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
		var identStore = this.getService(this._params.userStore?this._params.userStore:"Idents");
		if (identStore === undefined) {
			console.log("Email auth needs an ident store");
			throw 500;
		}
		if (this.body.password === undefined || this.body.login === undefined) {
			throw 400;
		}
		var mailConfig = this._params.providers.email;
		var mailerService = this.getMailMan();
		if (mailerService === undefined) {
			// Bad configuration ( might want to use other than 500 )
			//throw 500;
		}
		var userStore = this.getService(this._params.userStore?this._params.userStore:"Users");
		var updates = {};
		var uuid = this.body.login + "_email";
		return identStore.get(uuid).then( (ident) => {
			if (ident != undefined && ident.user != undefined) {
				return userStore.get(ident.user).then ( (user) => {
					// Check password
					if (user._password === this.hashPassword(this.body.password)) {
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
				var email = this.body.login;
				var validation;
				// Read the form
				if (this.body.validationToken) {
					validation = this.body.validationToken;
					if (validation !== this.generateEmailValidationToken(email)) {
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
						return this.sendValidationEmail(email);
					});
				}
				throw 404;
			}
			this.end();
		});
	}

	generateEmailValidationToken(email) {
		return this.hashPassword(email + "_" + this._webda.getSecret());
	}

	handlePhone() {
		this.writeHead(204);
	}

	authenticate() {
		// TODO Handle URL instead of _extended
		// 0 is safe unless a callback provider exists
		var next = function(err) {
			console.log("Error happened: " + err);
			console.trace();
		}
		switch (this._params.provider) {
			case "google":
				this.setupGoogle();
				return passport.authenticate('google', {'scope': this._params.providers.google.scope})(this, this, next);
			case "facebook":
				this.setupFacebook();
				return passport.authenticate('facebook', {'scope': this._params.providers.facebook.scope})(this, this, next);
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