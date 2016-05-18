"use strict";

const Executor = require('./executor.js');
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
	"facebook": {strategy: require('passport-facebook').Strategy, promise: false},
	"google": {strategy: require('passport-google-oauth').OAuth2Strategy, promise: false},
	"amazon": {strategy: require('passport-amazon').Strategy, promise: false},
	"github": {strategy: require('passport-github2').Strategy, promise: false},
	"twitter": {strategy: require('passport-twitter').Strategy, promise: true}
}

/**
 * This class is known as the Authentication module
 * It handles OAuth for several providers for now (Facebook, Google, Amazon, GitHub and Twitter)
 * It also handles email authentication with prevalidation or postvalidation of the email
 *
 * It requires two Store to work one 'idents' and one 'users'
 *
 * The parameters are 
 *
 *	 providerName: {
 *     clientID: '...',
 *     clientSecret: '...',
 *     scope: ''
 *   },
 *   email: {
 *	    postValidation: true|false   // If postValidation=true, account created without email verification
 *   }
 *   expose: 'url' // By default /auth
 *
 */
class PassportExecutor extends Executor {
	/** @ignore */
	constructor(webda, name, params) {
		super(webda, name, params);
		this._type = "PassportExecutor";
	}

	/**
	 * @ignore
	 * Setup the default routes
	 */
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
			this._initException = "Unresolved dependency on idents and users services";
		}
		// List authentication configured
		config[url] = {"method": ["GET", "DELETE"], "executor": this._name, "_method": this.listAuthentications};
		// Add static for email for now, if set before it should have priority
		config[url + "/email"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email"}, "_method": this.handleEmail};
		config[url + "/email/register"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email", "register": true}, "_method": this.handleEmail};
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
			var done = function(result) { console.log(result); resolve(); }; 
			this.setupOAuth(providerConfig);
			passport.authenticate(this._params.provider, { successRedirect: this._params.successRedirect, failureRedirect: this._params.failureRedirect}, done)(this, this, done);
		});
	};

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
					this.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + this._params.provider});
					this.end();
					done(result);
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
					this.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + this._params.provider});
					this.end();
					done(ident)
				});
			});
		}).catch( (err) => {
			done(err);
		});
	}

	setupOAuth(config) {
		config.callbackURL = this.getCallbackUrl();
		passport.use(new Strategies[this._params.provider].strategy(config,(accessToken, refreshToken, profile, done) => {
				this.handleOAuthReturn(profile._json, new Ident(this._params.provider, profile.id, accessToken, refreshToken), done);
			}
		));
	}

	registerUser(datas, user) {
		if (!user) {
			user = {};
		}
		this.emit("Register", {"user": user, "datas": datas});
		return user;
	}

	handleEmailCallback() {
		// Validate an email for an ident based on an url
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
			return identStore.get(uuid).then((ident) => {
				if (ident === undefined) {
					throw 404;
				}
				return identStore.update({validation: new Date()}, ident.uuid);	
			}).then ( () => {
				this.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + this._params.provider});
				return Promise.resolve();
			});
		}
		throw 404;
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
		replacements.url = this._route._http.root + "/auth/email/callback?email=" + email + "&token=" + this.generateEmailValidationToken(email);
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
				// Register on an known user
				if (this._params.register) {
					throw 409;
				}
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
				if (this.body.register || this._params.register) {
					var validation = undefined;
					// Need to check email before creation
					if (!mailConfig.postValidation || mailConfig.postValidation === undefined) {
						if (this.body.token == this.generateEmailValidationToken(email)) {
							validation = new Date();
						} else {
							// token is undefined send an email
							return this.sendValidationEmail(email);
						}
					}
					if (user === undefined) {
						user = {};
					}
					// Store with a _
					this.body._password = this.hashPassword(this.body.password);
					delete this.body.password;
					return userStore.save(this.registerUser(this.body, this.body)).then ( (user) => {
						var newIdent = {'uuid': uuid, 'type': 'email', 'email': email, 'user': user.uuid};
						if (validation) {
							newIdent.validation = validation;
						}
						return identStore.save(newIdent).then ( (ident) => {
							this.login(user, ident);
							if (!validation && !mailConfig.skipEmailValidation) {
								return this.sendValidationEmail(email);
							}
							return Promise.resolve();
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

	end() {
		if (this._oauth1) {
			this._oauth1();
		} else {
			super.end();
		}
	}

	authenticate() {
		// Handle Logout 
		if (this._params.provider == "logout") {
			this.logout();
			if (this._params.website) {
				this.writeHead(302, {'Location': this._params.website});
			} else {
				throw 204;
			}
			return;
		}
		var providerConfig = this._params.providers[this._params.provider];
		if (providerConfig) {
			if (!Strategies[this._params.provider].promise) {
				this.setupOAuth(providerConfig);
				return passport.authenticate(this._params.provider, {'scope': providerConfig.scope})(this, this);
			}
			var self = this;
			return new Promise( (resolve, reject) => {
				this._oauth1 = function(obj) { this._oauth1=undefined; resolve(obj); };
				this.setupOAuth(providerConfig);
				passport.authenticate(this._params.provider, {'scope': providerConfig.scope}, this._oauth1)(this, this, this._oauth1);
			});
		}
		throw 404;
	}

	static getModda() {
		return {
			"uuid": "Webda/Authentication",
			"label": "Authentication",
			"description": "Implements user registration and login using either email or OAuth, it handles for now Facebook, Google, Amazon, GitHub, Twitter\nIt needs a Idents and a Users Store to work",
			"webcomponents": [],
			"logo": "images/placeholders/passport.png",
			"documentation": "https://raw.githubusercontent.com/loopingz/webda/master/readmes/Authentication.md",
			"configuration": {
				"default": {
					"successRedirect": "YOUR WEBSITE LOGGED PAGE",
					"failureRedirect": "YOUR WEBSITE FAILURE PAGE",
					"providers": {
						"facebook": {
							"clientID": "",
							"clientSecret": "",
							"scope": ["email", "public_profile"]
						},
						"email": {
							"postValidation": false
						}
					}
				},
				"schema": {
					type: "object",
					properties: {
						"expose": {
							type: "boolean"
						},
						"successRedirect": {
							type: "string"
						},
						"failureRedirect": {
							type: "string"
						},
						"providers": {
							type: "object"
						}
					},
					required: ["successRedirect", "failureRedirect", "providers"]
				}
			}
		}
	}
}

module.exports = PassportExecutor