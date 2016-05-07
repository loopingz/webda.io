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
		this._identsStore = this.getService("idents");
		this._usersStore = this.getService("idents");
		if (this._identsStore === undefined || this._usersStore === undefined) {
			throw Error("Unresolved dependency on idents and users services");
		}
		// List authentication configured
		config[url] = {"method": ["GET"], "executor": this._name, "_method": this.listAuthentications};
		// Add static for email for now, if set before it should have priority
		config[url + "/email"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email"}, "_method": this.handleEmail};
		config[url + "/email/callback{?email,token}"] = {"method": ["GET"], "executor": this._name, "params": {"provider": "email"}, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.handleEmailCallback};
		// Handle the lost password here
		url += '/{provider}';
		config[url] = {"method": ["GET"], "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.authenticate};
		config[url + "/callback{?code,*otherQuery}"] = {"method": "GET", "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.callback};
	}

	callback() {
		
		console.log("callback");
		var self = this;
		switch (this._params.provider) {
			case "facebook":
				this.setupFacebook(this, this);
				return new Promise((resolve, reject) => {
					var next = (err) => {
						console.log("Error happened: " + err);
						console.log(err.stack);
						this._headers = {};
						this.end();
						return reject();
					}
					passport.authenticate('facebook', { successRedirect: this._params.successRedirect, failureRedirect: this._params.failureRedirect})(this, this, next);
				});
			case "google":
				this.setupGoogle(this, this);
				var next = (err) => {
						console.log("Error happened: " + err);
						console.log(err.stack);
						this._headers = {};
						this.end();
						return reject();
				}
				return new Promise((resolve, reject) => {
					passport.authenticate('google', { successRedirect: this._params.successRedirect, failureRedirect: this._params.failureRedirect})(this, this, resolve);
				});
			case "github":
				this.setupGithub(this, this);
				console.log("github");
				return new Promise((resolve, reject) => {
					var next = (err) => {
						console.log("Error happened: " + err);
						console.log(err.stack);
						this._headers = {};
						this.end();
						return reject();
					}
					passport.authenticate('github', { successRedirect: this._params.successRedirect, failureRedirect: this._params.failureRedirect})(this, this, next);
				});
		}
	};

	end() {
		try {
			super.end();
		} catch (err) {
			// Ignore already ended exception as Passport close on his side sometimes
			if (err.message != "Already ended") {
				throw err;
			}
		}
	}

	listAuthentications() {
		this.write(Object.keys(this._params.providers));
	}

	getCallbackUrl() {
		// Issue with specified port for now
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
			(accessToken, refreshToken, profile, done) => {
			    console.log("return from github: " + JSON.stringify(profile));
			    self.handleOAuthReturn(profile._json, new Ident("github", profile.id, accessToken, refreshToken), done);
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
			(accessToken, refreshToken, profile, done) => {
			    console.log("return from google: " + JSON.stringify(profile));
			    self.handleOAuthReturn(profile, new Ident("google", profile.id, accessToken, refreshToken), done);
			}
		));
	}

	handleOAuthReturn(profile, ident, done) {
		var identStore = this.getService("idents");
		var userStore = this.getService("users");
		var userPromise;
		return identStore.get(ident.uuid).then( (result) => {
			// Login with OAUTH
			if (result) {
				this.login(result.user, result);
				return identStore.update({'lastUsed': new Date(), 'profile': profile}, result.uuid).then( () => {
					this.writeHead(302, {'Location': this._params.successRedirect});
					this.end();
					return Promise.resolve(done(null, result));
				});
			}
			// Registration with OAuth
			let promise;
			if (this.session.getUserId()) {
				promise = Promise.resolve({'uuid':this.session.getUserId()});
			} else {
				promise = userStore.save(this.registerUser(profile._json));
			}
			return promise.then( (user) => {
				ident.user = user.uuid;
				ident.lastUsed = new Date();
				ident.profile = {};
				for (let i in profile) {
					 if (profile[i] === '') {
					 	continue;
					 }
					 ident.profile[i] = profile[i];
				}
				return identStore.save(ident).then( () => {
					this.login(user, ident);
					this.writeHead(302, {'Location': this._params.successRedirect});
					this.end();
					return Promise.resolve(done(null, ident));
				});
			});
		}).catch( (err) => {
			console.log(err);
			done(err, null);
			throw err;
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
			(accessToken, refreshToken, profile, done) => {
				self.handleOAuthReturn(profile._json, new Ident("facebook", profile.id, accessToken, refreshToken), done);
			}
		));
	}

	registerUser(datas) {
		var user = {};
		this.emit("Register", {"user": user, "datas": datas});
		return user;
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
				return userStore.save(this.registerUser()).then ( (user) => {
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
		this.emit("Login", event);
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
					console.log("check password", user._password, this.body.password);
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
						this.writeHead(403);
						if (ident.failedLogin === undefined) {
							ident.failedLogin = 0;
						}
						updates.failedLogin = ident.failedLogin++;
						updates.lastFailedLogin = new Date();
						// Swalow exeception issue to double check !
						return identStore.update(updates, ident.uuid);
					}
				});
			} else {
				var user = this.body.user;
				var email = this.body.login;
				var registeredUser;
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
					this.body._password = this.hashPassword(this.body.password);
					delete this.body.password;
					return userStore.save(this.registerUser(this.body)).then ( (user) => {
						return identStore.save({'uuid': uuid, 'email': email, 'user': user.uuid}).then ( (ident) => {
							this.login(user, ident);
							return this.sendValidationEmail(email);
						});
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
		// Don't need to create a promise as it seems to work sync
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