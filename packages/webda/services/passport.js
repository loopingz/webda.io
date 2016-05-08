"use strict";

const Executor = require('../executors/executor.js');
var passport = require('passport');
const crypto = require("crypto");
const _extend = require("util")._extend;
const Ident = require('../models/ident');

passport.serializeUser(function(user, done) {
	console.log("serializeUser");
	done(null, JSON.stringify(user));
});

passport.deserializeUser(function(id, done) {
	// To be sure to clean safely those functions
	console.log("deSerializeUser");
	done(null, JSON.parse(id));
});

var Strategies = {
	"facebook": require('passport-facebook').Strategy,
	"google": require('passport-google-oauth').OAuth2Strategy,
	"amazon": require('passport-amazon').Strategy,
	"github": require('passport-github2').Strategy,
	"twitter": require('passport-twitter').Strategy
}

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
		config[url] = {"method": ["GET", "DELETE"], "executor": this._name, "_method": this.listAuthentications};
		// Add static for email for now, if set before it should have priority
		config[url + "/email"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email"}, "_method": this.handleEmail};
		config[url + "/email/callback{?email,token}"] = {"method": ["GET"], "executor": this._name, "params": {"provider": "email"}, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.handleEmailCallback};
		// Handle the lost password here
		url += '/{provider}';
		config[url] = {"method": ["GET"], "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.authenticate};
		config[url + "/callback{?code,*otherQuery}"] = {"method": "GET", "executor": this._name, "aws": {"defaultCode": 302, "headersMap": ['Location', 'Set-Cookie']}, "_method": this.callback};
	}

	callback() {
		var providerConfig = this._params.providers[this._params.provider];
		if (!providerConfig) {
			throw 404;
		}
		return new Promise( (resolve, reject) => {
			this.setupOAuth(providerConfig);
			passport.authenticate(this._params.provider, { successRedirect: this._params.successRedirect, failureRedirect: this._params.failureRedirect})(this, this, resolve);
		});
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
		if (this._route._http.method === "DELETE") {
			this.logout();
			this.write("GoodBye");
			return;
		}
		this.write(Object.keys(this._params.providers));
	}

	getCallbackUrl(provider) {
		if (this._params.providers[this._params.provider].callbackURL) {
			return this._params.providers[this._params.provider].callbackURL;
		}
		// Issue with specified port for now
		var url = this._route._http.protocol + "://" + this._route._http.host + this._route._http.url;
		if (url.endsWith("/callback")) {
			return url;
		}
		return url + "/callback";
	};

	handleOAuthReturn(profile, ident, done) {
		var identStore = this.getService("idents");
		var userStore = this.getService("users");
		var userPromise;
		return identStore.get(ident.uuid).then( (result) => {
			// Login with OAUTH
			if (result) {
				this.write("login");
				this.login(result.user, result);
				// Need to improve DynamoDB testing about invalid value 
				return identStore.update({'lastUsed': new Date(), 'profile': profile}, result.uuid).then( () => {
					this.write("redirect");
					this.writeHead(302, {'Location': this._params.successRedirect});
					this.end();
					done(result);
					return Promise.resolve();
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
				this.write("register new ident");
				ident.user = user.uuid;
				ident.lastUsed = new Date();
				ident.profile = profile;
				return identStore.save(ident).then( () => {
					this.write("redirect");
					this.login(user, ident);
					this.writeHead(302, {'Location': this._params.successRedirect});
					this.end();
					done(ident)
					return Promise.resolve();
				});
			});
		}).catch( (err) => {
			console.log(err);
			done(err);
			throw err;
		});
	}

	setupOAuth(config) {
		var callback = this.getCallbackUrl();
		passport.use(new Strategies[this._params.provider](config,(accessToken, refreshToken, profile, done) => {
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

	logout() {
		this.emit("Logout");
		this.session.destroy();
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
					if (!mailConfig.postValidation || mailConfig.postValidation === undefined) {
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
		var providerConfig = this._params.providers[this._params.provider];
		if (providerConfig) {
			return new Promise( (resolve, reject) => {
				var done = function(obj) { console.log(obj); resolve(obj); };
				var err = function(obj) { console.log(obj); reject(obj); };
				this.setupOAuth(providerConfig);
				passport.authenticate(this._params.provider, {'scope': providerConfig.scope})(this, this, err);
			});
		}
		throw 404;
	}
}

module.exports = PassportExecutor