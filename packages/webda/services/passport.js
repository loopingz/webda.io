"use strict";

const Executor = require('./executor.js');
var passport = require('passport');
const crypto = require("crypto");
const _extend = require("util")._extend;
const Ident = require('../models/ident');

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
 *   providerName: {
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
    this._url = url;
    let identStoreName = this._params.identStore;
    let userStoreName = this._params.userStore;
    if (identStoreName === undefined) {
      identStoreName = "idents";
    }
    if (userStoreName === undefined) {
      userStoreName = "users";
    }
    this._identsStore = this.getService(identStoreName);
    this._usersStore = this.getService(userStoreName);
    if (this._identsStore === undefined || this._usersStore === undefined) {
      this._initException = "Unresolved dependency on idents and users services";
    }
    // List authentication configured
    config[url] = {"method": ["GET", "DELETE"], "executor": this._name, "_method": this._listAuthentications};
    // Get the current user
    config[url + "/me"] = {"method": ["GET"], "executor": this._name, "_method": this._getMe};
    if (this._params.providers.email) {
      // Add static for email for now, if set before it should have priority
      config[url + "/email"] = {"method": ["POST"], "executor": this._name, "params": {"provider": "email"}, "_method": this._handleEmail};
      config[url + "/email/callback{?email,token}"] = {
        "method": ["GET"],
        "executor": this._name,
        "params": {"provider": "email"},
        "_method": this._handleEmailCallback
      };
      config[url + "/email/passwordRecovery"] = {
        "method": ["POST"],
        "executor": this._name,
        "params": {"provider": "email"},
        "_method": this._passwordRecovery
      };
      config[url + "/email/{email}/recover"] = {
        "method": ["GET"],
        "executor": this._name,
        "params": {"provider": "email"},
        "_method": this._passwordRecoveryEmail
      };
    }
    // Handle the lost password here
    url += '/{provider}';
    config[url] = {
      "method": ["GET"],
      "executor": this._name,
      "_method": this._authenticate
    };
    config[url + "/callback{?code,oauth_token,oauth_verifier,*otherQuery}"] = {
      "method": "GET",
      "executor": this._name,
      "_method": this._callback
    };
  }


  _callback(ctx) {
    var providerConfig = this._params.providers[ctx._params.provider];
    if (!providerConfig) {
      throw 404;
    }
    return new Promise((resolve, reject) => {
      var done = function (result) {
        resolve();
      };
      this.setupOAuth(ctx, providerConfig);
      passport.authenticate(ctx._params.provider, {
        successRedirect: this._params.successRedirect,
        failureRedirect: this._params.failureRedirect
      }, done)(ctx, ctx, done);
    });
  };

  _getMe(ctx) {
    if (ctx.getCurrentUserId() === undefined) {
      throw 404;
    }
    return ctx.getCurrentUser().then((user) => {
      if (user === undefined) {
        throw 404;
      }
      ctx.write(user);
      return;
    });
  }

  _listAuthentications(ctx) {
    if (ctx._route._http.method === "DELETE") {
      return this.logout(ctx).then(() => {
        ctx.write("GoodBye");
      });
    }
    ctx.write(Object.keys(this._params.providers));
  }

  getCallbackUrl(ctx, provider) {
    if (this._params.providers[ctx._params.provider].callbackURL) {
      return this._params.providers[ctx._params.provider].callbackURL;
    }
    // Issue with specified port for now
    var url = ctx._route._http.protocol + "://" + ctx._route._http.host + ctx._route._http.url;
    if (url.endsWith("/callback")) {
      return url;
    }
    return url + "/callback";
  };

  handleOAuthReturn(ctx, profile, ident, done) {
    var identStore = this._identsStore;
    var userStore = this._usersStore;
    var userPromise;
    return identStore.get(ident.uuid).then((result) => {
      // Login with OAUTH
      if (result) {
        ctx.write("login");
        return this.login(ctx, result.user, result).then(() => {
          // Need to improve DynamoDB testing about invalid value 
          return identStore.update({'lastUsed': new Date(), 'profile': profile}, result.uuid).then(() => {
            ctx.write("redirect");
            ctx.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + ctx._params.provider});
            ctx.end();
            done(result);
          });
        });
      }
      // Registration with OAuth
      let promise;
      if (ctx.session.getUserId()) {
        promise = Promise.resolve({'uuid': ctx.session.getUserId()});
      } else {
        promise = this.registerUser(ctx, profile._json).then((user) => {
          return userStore.save(user);
        });
      }
      return promise.then((user) => {
        ctx.write("register new ident");
        ident.user = user.uuid;
        ident.lastUsed = new Date();
        ident.profile = profile;
        return identStore.save(ident).then(() => {
          ctx.write("redirect");
          return this.login(ctx, user, ident).then(() => {
            ctx.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + ctx._params.provider});
            ctx.end();
            done(ident);
          });
        });
      });
    }).catch((err) => {
      done(err);
    });
  }

  setupOAuth(ctx, config) {
    config.callbackURL = this.getCallbackUrl(ctx);
    passport.use(new Strategies[ctx._params.provider].strategy(config, (accessToken, refreshToken, profile, done) => {
        this.handleOAuthReturn(ctx, profile._json, new Ident(ctx._params.provider, profile.id, accessToken, refreshToken), done);
      }
    ));
  }

  registerUser(ctx, datas, user) {
    if (!user) {
      user = {};
    }
    user.locale = ctx.getLocale();
    return this.emit("Register", {"user": user, "datas": datas, "ctx": ctx}).then(() => {
      return Promise.resolve(user);
    });
  }

  getPasswordRecoveryInfos(uuid, interval) {
    var promise;
    if (!interval) {
      interval = this._params.passwordRecoveryInterval;
    }
    // Use one hour other case
    if (!interval) {
      interval = 3600000;
    }
    var expire = Date.now() + interval;
    if (typeof(uuid) === 'string') {
      var userStore = this.getService("users");
      // Use the one from config if not specified
      promise = userStore.get(uuid);
    } else {
      promise = Promise.resolve(uuid);
    }
    return promise.then((user) => {
      return {expire: expire, token: this.hashPassword(user.uuid + expire + user.__password), login: user.uuid};
    });
  }

  _passwordRecoveryEmail(ctx) {
    var userStore = this.getService("users");
    var identStore = this.getService("idents");
    if (identStore === undefined) {
      console.log("Email auth needs an ident store");
      throw 500;
    }
    return identStore.get(ctx._params.email + "_email").then((ident) => {
      if (!ident) {
        throw 404;
      }
      return userStore.get(ident.user);
    }).then((user) => {
      // Dont allow to do too many request
      if (user._lastPasswordRecovery > Date.now() - 3600000 * 4) {
        throw 429;
      }
      return userStore.update({_lastPasswordRecovery: Date.now()}, user.uuid).then(() => {
        return this.sendRecoveryEmail(ctx, user, ctx._params.email);
      });
    });
  }

  _passwordRecovery(ctx) {
    var userStore = this.getService("users");
    if (ctx.body.password === undefined || ctx.body.login === undefined || ctx.body.token === undefined || ctx.body.expire === undefined) {
      throw 400;
    }
    return userStore.get(ctx.body.login).then((user) => {
      if (ctx.body.token !== this.hashPassword(ctx.body.login + ctx.body.expire + user.__password)) {
        throw 403;
      }
      if (ctx.body.expire < Date.now()) {
        throw 410;
      }
      return userStore.update({__password: this.hashPassword(ctx.body.password)}, ctx.body.login);
    });
  }

  _handleEmailCallback(ctx) {
    // Validate an email for an ident based on an url
    var identStore = this.getService("idents");
    if (identStore === undefined) {
      console.log("Email auth needs an ident store");
      throw 500;
    }
    if (ctx._params.token) {
      let validation = ctx._params.token;
      if (validation !== this.generateEmailValidationToken(ctx._params.email)) {
        ctx.writeHead(302, {'Location': this._params.failureRedirect});
        return Promise.resolve();
      }
      var uuid = ctx._params.email + "_email";
      return identStore.get(uuid).then((ident) => {
        if (ident === undefined) {
          throw 404;
        }
        return identStore.update({validation: new Date()}, ident.uuid);
      }).then(() => {
        ctx.writeHead(302, {'Location': this._params.successRedirect + '?validation=' + ctx._params.provider});
        return Promise.resolve();
      });
    }
    throw 404;
  }

  handlePhoneCallback(req, res) {

  }

  sendRecoveryEmail(ctx, user, email) {
    return this.getPasswordRecoveryInfos(user).then((infos) => {
      var mailer = this.getMailMan();
      let locale = user.locale;
      if (!locale) {
        locale = ctx.getLocale();
      }
      let replacements = _extend({}, this._params.providers.email);
      replacements.infos = infos;
      replacements.to = email;
      replacements.context = ctx;
      let mailOptions = {
        to: email,
        locale: locale,
        template: 'PASSPORT_EMAIL_RECOVERY',
        replacements: replacements
      };
      if (!user.locale) {
        mailOptions.locale = ctx.locale;
      }
      return mailer.send(mailOptions);
    });
  }

  sendValidationEmail(ctx, email) {
    var mailer = this.getMailMan();
    let replacements = _extend({}, this._params.providers.email);
    replacements.context = ctx;
    replacements.url = ctx._route._http.root + "/auth/email/callback?email=" + email + "&token=" + this.generateEmailValidationToken(email);
    let mailOptions = {
      to: email,
      locale: ctx.getLocale(),
      template: 'PASSPORT_EMAIL_REGISTER',
      replacements: replacements
    };
    mailer.send(mailOptions);
  }

  hashPassword(pass) {
    var hash = crypto.createHash('sha256');
    return hash.update(pass + this._webda.getSalt()).digest('hex');
  }

  logout(ctx) {
    return this.emit("Logout", {ctx: ctx}).then(() => {
      ctx.session.destroy();
    });
  }

  login(ctx, user, ident) {
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
    event.ctx = ctx;
    ctx.session.login(event.userId, event.identId);
    return this.emit("Login", event);
  }

  getMailMan() {
    return this.getService(this._params.providers.email.mailer ? this._params.providers.email.mailer : "Mailer");
  }

  _handleEmail(ctx) {
    var identStore = this._identsStore;
    if (identStore === undefined) {
      console.log("Email auth needs an ident store");
      throw 500;
    }
    if (ctx.body.password === undefined || ctx.body.login === undefined) {
      throw 400;
    }
    var mailConfig = this._params.providers.email;
    var mailerService = this.getMailMan();
    if (mailerService === undefined) {
      // Bad configuration ( might want to use other than 500 )
      throw 500;
    }
    var userStore = this._usersStore;
    var updates = {};
    var uuid = ctx.body.login + "_email";
    return identStore.get(uuid).then((ident) => {
      if (ident != undefined && ident.user != undefined) {
        // Register on an known user
        if (ctx._params.register) {
          throw 409;
        }
        return userStore.get(ident.user).then((user) => {
          // Check password
          if (user.__password === this.hashPassword(ctx.body.password)) {
            if (ident._failedLogin > 0) {
              ident._failedLogin = 0;
            }
            updates._lastUsed = new Date();
            updates._failedLogin = 0;

            return identStore.update(updates, ident.uuid).then(() => {
              return this.login(ctx, ident.user, ident);
            }).then(() => {
              ctx.write(user);
            });
          } else {
            ctx.writeHead(403);
            if (ident._failedLogin === undefined) {
              ident._failedLogin = 0;
            }
            updates._failedLogin = ident._failedLogin++;
            updates._lastFailedLogin = new Date();
            // Swalow exeception issue to double check !
            return identStore.update(updates, ident.uuid);
          }
        });
      } else {
        var user = ctx.body.user;
        var email = ctx.body.login;
        var registeredUser;
        var validation;
        // Read the form
        if (ctx.body.register || ctx._params.register) {
          var validation = undefined;
          // Need to check email before creation
          if (!mailConfig.postValidation || mailConfig.postValidation === undefined) {
            if (ctx.body.token == this.generateEmailValidationToken(email)) {
              validation = new Date();
            } else {
              ctx.write({});
              // token is undefined send an email
              return this.sendValidationEmail(ctx, email);
            }
          }
          if (user === undefined) {
            user = {};
          }
          // Store with a _
          ctx.body.__password = this.hashPassword(ctx.body.password);
          delete ctx.body.password;
          delete ctx.body.register;
          return this.registerUser(ctx, ctx.body, ctx.body).then((user) => {
            return userStore.save(user);
          }).then((user) => {
            var newIdent = {'uuid': uuid, 'type': 'email', 'email': email, 'user': user.uuid};
            if (validation) {
              newIdent.validation = validation;
            }
            return identStore.save(newIdent).then((ident) => {
              return this.login(ctx, user, ident);
            }).then(() => {
              ctx.write(user);
              if (!validation && !mailConfig.skipEmailValidation) {
                return this.sendValidationEmail(ctx, email);
              }
              return Promise.resolve();
            });
          });
        }
        throw 404;
      }
      ctx.end();
    });
  }

  generateEmailValidationToken(email) {
    return this.hashPassword(email + "_" + this._webda.getSecret());
  }

  handlePhone() {
    ctx.writeHead(204);
  }

  _authenticate(ctx) {
    // Handle Logout 
    if (ctx._params.provider == "logout") {
      return this.logout(ctx).then(() => {
        if (this._params.website) {
          ctx.writeHead(302, {'Location': this._params.website});
        } else {
          throw 204;
        }
      });
    }
    var providerConfig = this._params.providers[ctx._params.provider];
    if (providerConfig) {
      if (!Strategies[ctx._params.provider].promise) {
        this.setupOAuth(ctx, providerConfig);
        return passport.authenticate(ctx._params.provider, {'scope': providerConfig.scope})(ctx, ctx);
      }
      var self = this;
      return new Promise((resolve, reject) => {
        ctx._end = ctx.end;
        ctx.end = function (obj) {
          ctx.end = ctx._end;
          resolve(obj);
        };
        this.setupOAuth(ctx, providerConfig);
        passport.authenticate(ctx._params.provider, {'scope': providerConfig.scope}, this._oauth1)(ctx, ctx, ctx._oauth1);
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
