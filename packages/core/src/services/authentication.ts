"use strict";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { EventWithContext } from "../core";
import { Ident } from "../models/ident";
import { User } from "../models/user";
import { Inject, Service, ServiceParameters } from "../services/service";
import { Store } from "../stores/store";
import { Context, HttpContext } from "../utils/context";
import { Mailer } from "./mailer";

/**
 * Emitted when the /me route is called
 */
export interface EventAuthenticationGetMe extends EventWithContext {
  user: User;
}

/**
 * Emitted when new user registered
 */
export interface EventAuthenticationRegister extends EventAuthenticationGetMe {
  datas: any;
  identId: string;
}

/**
 * Emitted when user logout
 */
export interface EventAuthenticationLogout extends EventWithContext {}

/**
 * Sent when a user update his password
 */
export interface EventAuthenticationPasswordUpdate extends EventAuthenticationGetMe {
  password: string;
}

/**
 * Emitted when user login
 */
export interface EventAuthenticationLogin extends EventWithContext {
  userId: string;
  user?: User;
  identId: string;
  ident: Ident;
}

/**
 * Export when a user failed to authenticate with his password
 */
export interface EventAuthenticationLoginFailed extends EventAuthenticationGetMe {}

/**
 * Implement a PasswordVerifier so you can implement
 * your own rules
 */
export interface PasswordVerifier extends Service {
  /**
   * If the password is not valid, send a 400 exception or
   * return false
   *
   * @param password to verify
   * @param user to verify from
   */
  validate(password: string, user?: User): Promise<boolean>;
}

/**
 * Information required to reset a password
 */
export class PasswordRecoveryInfos {
  /**
   * Links are short lived
   */
  public expire: number;
  /**
   * Generated token
   */
  public token: string;
  /**
   * Login to reset password fors
   */
  public login: string;
}

export class AuthenticationParameters extends ServiceParameters {
  /**
   * Idents store for authentication identifiers
   *
   * @default "idents"
   */
  identStore?: string;
  /**
   * User store for authentication users
   *
   * @default "users"
   */
  userStore?: string;
  /**
   * @default "/auth"
   */
  url?: string;
  /**
   * Enable the email authentication
   */
  email?: {
    /**
     * Mailer service name
     */
    mailer?: string;
    /**
     * Allow user to create their account without validating their email first
     */
    postValidation: boolean;
    /**
     * Do not even validate the email at all
     */
    skipEmailValidation: boolean;
    /**
     * Minimal delay between two password recovery or validation email
     *
     * @default 3600000 * 4
     */
    delay: number;
    /**
     * When a delay is added between two attempt to authenticate
     *
     * @default 3
     */
    failedLoginBeforeDelay: number;
  };
  password: {
    /**
     * Password verifier Service name
     */
    verifier?: string;
    /**
     * Regexp that password must check
     * @default "{8,}"
     */
    regexp?: string;
  };
  /**
   * Number of salt iteration for bcrypt.hashSync
   */
  salt: string;
  /**
   * Redirect to this page when email validation failed
   */
  failureRedirect: string;
  /**
   * Redirect to this page when email validation succeed
   */
  successRedirect: string;
  /**
   * Redirect to this page once email is validate to finish the registration process
   */
  registerRedirect: string;

  constructor(params: any) {
    super(params);
    this.identStore ??= "idents";
    this.userStore ??= "users";
    this.url ??= "/auth";
    this.password ??= {
      regexp: ".{8,}"
    };
    if (this.email) {
      this.email.delay ??= 3600000 * 4;
      this.email.failedLoginBeforeDelay ??= 3;
    }
  }
}

export type AuthenticationEvents = {
  "Authentication.GetMe": EventAuthenticationGetMe;
  "Authentication.Register": EventAuthenticationRegister;
  "Authentication.PasswordUpdate": EventAuthenticationPasswordUpdate;
  "Authentication.Logout": EventAuthenticationLogout;
  "Authentication.Login": EventAuthenticationLogin;
  "Authentication.LoginFailed": EventAuthenticationLoginFailed;
  "Authentication.PasswordCreate": EventAuthenticationPasswordUpdate;
};

/**
 * This class is known as the Authentication module
 * It handles OAuth for several providers for now (Facebook, Google, Amazon, GitHub and Twitter)
 * It also handles email authentication with prevalidation or postvalidation of the email
 *
 * It requires two Store to work one `idents` and one `users`
 *
 * The parameters are
 * ```
 *   providerName: {
 *     clientID: '...',
 *     clientSecret: '...',
 *     scope: ''
 *   },
 *   email: {
 *	    postValidation: true|false   // If postValidation=true, account created without email verification
 *   }
 *   url: 'url' // By default /auth
 * ```
 *
 * @category CoreServices
 */
class Authentication<
  T extends AuthenticationParameters = AuthenticationParameters,
  E extends AuthenticationEvents = AuthenticationEvents
> extends Service<T, E> {
  @Inject("identStore", "idents")
  _identsStore: Store<Ident>;
  @Inject("userStore", "users")
  _usersStore: Store<User>;
  _passwordVerifier: PasswordVerifier;
  providers: Set<string> = new Set<string>();

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): AuthenticationParameters {
    return new AuthenticationParameters(params);
  }

  /**
   * Get the user store
   * @returns
   */
  getUserStore<K extends User = User>(): Store<K> {
    return <Store<K>>this._usersStore;
  }

  /**
   * Get the user store
   * @returns
   */
  getIdentStore<K extends Ident = Ident>(): Store<K> {
    return <Store<K>>this._identsStore;
  }

  /**
   * @override
   */
  initRoutes() {
    // ROUTES
    let url = this.parameters.url;
    // List authentication configured
    this.addRoute(url, ["GET", "DELETE"], this._listAuthentications, {
      get: {
        description: "Retrieve the list of available authentication",
        summary: "Get available auths",
        operationId: `getAuthenticationMethods`,
        responses: {
          "200": {
            description: "List of authentication"
          }
        }
      },
      delete: {
        description: "Logout current user",
        summary: "Logout",
        operationId: `logout`,
        responses: {
          "200": {}
        }
      }
    });
    // Get the current user
    this.addRoute(url + "/me", ["GET"], this._getMe, {
      get: {
        description: "Retrieve the current user from the session",
        summary: "Get current user",
        operationId: "getCurrentUser"
      }
    });
    if (this.parameters.email) {
      this.addProvider("email");
      // Add static for email for now, if set before it should have priority
      this.addRoute(url + "/email", ["POST"], this._handleEmail, {
        post: {
          description: "Authenticate with an email and password",
          summary: "Authenticate with email",
          operationId: `authWithEmail`
        }
      });
      this.addRoute(url + "/email/callback{?email,token,user}", ["GET"], this._handleEmailCallback, {
        hidden: true
      });
      this.addRoute(url + "/email/passwordRecovery", ["POST"], this._passwordRecovery, {
        post: {
          schemas: {
            input: {
              type: "object",
              properties: {
                token: {
                  type: "string"
                },
                expire: {
                  type: "number"
                },
                password: {
                  type: "string"
                },
                login: {
                  type: "string"
                }
              }
            }
          },
          description: "Reinit the password if we have the right token, expire",
          summary: "Reinit password",
          operationId: "reinitPassword",
          responses: {
            "204": {
              description: ""
            },
            "403": {
              description: "Wrong Token"
            }
          }
        }
      });
      this.addRoute(url + "/email/{email}/recover", ["GET"], this._passwordRecoveryEmail, {
        get: {
          description: "The password reset process will be start",
          summary: "Start password recovery",
          operationId: "startEmailRecovery",
          responses: {
            "204": {
              description: ""
            },
            "404": {
              description: "Email does not exist"
            },
            "429": {
              description: "Recovery has been initiated in the last 4 hours"
            }
          }
        }
      });
      this.addRoute(url + "/email/{email}/validate", ["GET"], this._sendEmailValidation, {
        get: {
          description: "The email validation process will be start",
          summary: "Restart email validation",
          operationId: "startEmailRecovery",
          responses: {
            "204": {
              description: ""
            },
            "409": {
              description: "Email already verified for another user"
            },
            "412": {
              description: "Email already verified for current user"
            },
            "429": {
              description: "Validation has been initiated in the last 4 hours"
            }
          }
        }
      });
    }
  }

  getUrl() {
    return this.parameters.url;
  }

  setIdents(identStore) {
    this._identsStore = identStore;
  }

  setUsers(userStore) {
    this._usersStore = userStore;
  }

  /**
   * @ignore
   * Setup the default routes
   */
  computeParameters(): void {
    super.computeParameters();

    if (this.parameters.password.verifier) {
      this._passwordVerifier = this.getService<PasswordVerifier>(this.parameters.password.verifier);
    }

    if (this.parameters.email && this.getMailMan() === undefined) {
      throw Error("email authentication requires a Mailer service");
    }
  }

  /**
   * Add a provider to the oauth scheme
   * @param name
   */
  addProvider(name: string) {
    this.providers.add(name);
  }

  /**
   * Send or resend an email to validate the email address
   *
   * @param ctx
   * @throws 409 if ident is linked to someone else
   * @throws 412 if the email is already validated
   * @throws 429 if a validation email has been sent recently
   */
  async _sendEmailValidation(ctx) {
    let identKey = ctx.parameters.email + "_email";
    let ident = await this._identsStore.get(identKey);
    if (!ident) {
      await this._identsStore.save({
        uuid: `${ctx.parameters.email}_email`,
        _lastValidationEmail: Date.now(),
        _type: "email"
      });
    } else {
      // If the ident is linked to someone else - might want to remove it
      if (ident.getUser() !== ctx.getCurrentUserId()) {
        throw 409;
      }
      // If the email is already validated
      if (ident._validation) {
        throw 412;
      }
      //
      if (ident._lastValidationEmail >= Date.now() - this.parameters.email.delay) {
        throw 429;
      }
      await this._identsStore.patch({
        _lastValidationEmail: Date.now(),
        uuid: identKey
      });
    }
    await this.sendValidationEmail(ctx, ctx.parameters.email);
  }

  /**
   * Return current user
   * @param ctx
   */
  async _getMe(ctx: Context) {
    let user = await ctx.getCurrentUser();
    if (user === undefined) {
      throw 404;
    }
    await this.emitSync("Authentication.GetMe", <EventAuthenticationGetMe>{
      context: ctx,
      user
    });
    ctx.write(user);
  }

  /**
   * Handle both list of available authentication
   * and logout with method 'DELETE'
   *
   * @param ctx
   * @returns
   */
  async _listAuthentications(ctx: Context) {
    if (ctx.getHttpContext().getMethod() === "DELETE") {
      await this.logout(ctx);
      ctx.write("GoodBye");
      return;
    }
    ctx.write(Array.from(this.providers));
  }

  async onIdentLogin(ctx: Context, provider: string, identId: string, profile: any, tokens: any = undefined) {
    // Auto postifx with provider name
    const postfix = `_${provider}`;
    if (!identId.endsWith(postfix)) {
      identId += postfix;
    }

    let ident: Ident = await this._identsStore.get(identId);
    // Ident is known
    if (ident) {
      await this.login(ctx, ident.getUser(), ident);
      await this._identsStore.patch({
        _lastUsed: new Date(),
        __tokens: tokens,
        uuid: ident.uuid
      });
      // Redirect to?
      return;
    }
    let user;
    if (profile.email) {
      ident = await this._identsStore.get(`${profile.email}_email`);
    }
    // If already login
    if (ctx.getCurrentUserId()) {
      user = await ctx.getCurrentUser();
    } else {
      // If an email in profile try to find the ident
      if (ident) {
        user = await this._usersStore.get(ident.getUser());
      }

      if (!user) {
        // If no user, register a new user automatically
        user = await this.registerUser(ctx, profile, identId);
        await this._usersStore.save(user);
      }
    }
    if (profile.email && !ident) {
      // Save additional email
      ident = this._identsStore.initModel({
        uuid: `${profile.email}_email`,
        provider: "email"
      });
      ident.setUser(user.getUuid());
      await ident.save();
    }
    // Work directly on ident argument
    ident = this._identsStore.initModel({
      uuid: identId,
      profile,
      __tokens: tokens,
      provider
    });
    ident.setUser(user.uuid);
    ident._lastUsed = new Date();
    ident.setType(provider);
    await ident.save();
    ident.__new = true;
    await this.login(ctx, user, ident);
  }

  /**
   * Create a new User with the link ident
   * @param ident
   */
  async createUserWithIdent(provider: string, identId: string, profile: any = {}) {
    if (await this._identsStore.exists(`${identId}_${provider}`)) {
      throw new Error("Ident is already known");
    }
    let ctx = await this._webda.newContext(new HttpContext("fake", "GET", "/"));
    // Pretend we logged in with the ident
    await this.onIdentLogin(ctx, provider, identId, profile);
  }

  async registerUser(
    ctx: Context,
    datas: any,
    identId: string,
    user: any = this._usersStore.initModel()
  ): Promise<any> {
    user.email = datas.email;
    user.locale = ctx.getLocale();
    await this.emitSync("Authentication.Register", <EventAuthenticationRegister>{
      user: user,
      datas: datas,
      context: ctx,
      identId
    });
    return user;
  }

  async getPasswordRecoveryInfos(
    uuid: string | User,
    interval = this.parameters.email.delay
  ): Promise<PasswordRecoveryInfos> {
    var expire = Date.now() + interval;
    let user;
    if (typeof uuid === "string") {
      user = await this._usersStore.get(uuid);
    } else {
      user = uuid;
    }
    if (!user) {
      return undefined;
    }
    return {
      expire: expire,
      // Might want to add more alea not coming from the db to avoid exploitation of stolen db
      token: this.hashInfo(user.uuid + expire + user.getPassword()),
      login: user.uuid
    };
  }

  async _passwordRecoveryEmail(ctx: Context) {
    let email = ctx.parameter("email");
    let ident: Ident = await this._identsStore.get(email + "_email");
    if (!ident) {
      throw 404;
    }
    let user: User = await this._usersStore.get(ident.getUser());
    // Dont allow to do too many request
    if (!user.lastPasswordRecoveryBefore(Date.now() - this.parameters.email.delay)) {
      throw 429;
    }
    await this._usersStore.patch({
      _lastPasswordRecovery: Date.now(),
      uuid: user.uuid
    });
    await this.sendRecoveryEmail(ctx, user, email);
  }

  async _verifyPassword(password: string, user?: User) {
    if (this._passwordVerifier) {
      if (!(await this._passwordVerifier.validate(password, user))) {
        throw 400;
      }
      return;
    }
    let regexp = new RegExp(this.parameters.password.regexp);
    if (regexp.exec(password) === null) {
      throw 400;
    }
  }

  async _passwordRecovery(ctx: Context) {
    let body = ctx.getRequestBody();
    if (
      body.password === undefined ||
      body.login === undefined ||
      body.token === undefined ||
      body.expire === undefined
    ) {
      throw 400;
    }
    let user: User = await this._usersStore.get(body.login.toLowerCase());
    if (!user) {
      throw 403;
    }
    if (body.token !== this.hashInfo(body.login.toLowerCase() + body.expire + user.getPassword())) {
      throw 403;
    }
    if (body.expire < Date.now()) {
      throw 410;
    }
    await this._verifyPassword(body.password, user);
    let password = this.hashPassword(body.password);
    await this._usersStore.patch({
      __password: password,
      uuid: body.login.toLowerCase()
    });
    await this.emitSync("Authentication.PasswordUpdate", <EventAuthenticationPasswordUpdate>{
      user,
      password,
      context: ctx
    });
  }

  async _handleEmailCallback(ctx: Context) {
    if (!ctx.parameter("token")) {
      throw 400;
    }
    let validation = ctx.parameter("token");
    if (validation !== this.generateEmailValidationToken(ctx.parameter("user"), ctx.parameter("email"))) {
      ctx.writeHead(302, {
        Location: this.parameters.failureRedirect + "?reason=badToken"
      });
      return;
    }

    if (
      ctx.parameter("user") !== ctx.getCurrentUserId() &&
      ctx.getCurrentUserId() !== "" &&
      ctx.getCurrentUserId() !== undefined
    ) {
      ctx.writeHead(302, {
        Location: this.parameters.failureRedirect + "?reason=badUser"
      });
      return;
    }

    if (!ctx.parameter("user")) {
      ctx.writeHead(302, {
        Location: `${this.parameters.registerRedirect}?token=${ctx.parameter("token")}&email=${ctx.parameter("email")}`
      });
      return;
    }

    var uuid = ctx.parameter("email") + "_email";
    let ident = await this._identsStore.get(uuid);
    // Would mean the ident got delete in the mean time... hyper low likely hood
    if (ident === undefined) {
      ident = this._identsStore.initModel({
        uuid
      });
    }
    ident._type = "email";
    ident._validation = new Date();
    ident.setUser(ctx.parameter("user"));
    await ident.save();
    ctx.writeHead(302, {
      Location: this.parameters.successRedirect + "?validation=email",
      "X-Webda-Authentication": "success"
    });
  }

  /**
   * Send an email to recover the user password
   *
   * @param ctx
   * @param user
   * @param email
   * @returns
   */
  async sendRecoveryEmail(ctx: Context, user, email: string) {
    let infos = await this.getPasswordRecoveryInfos(user);
    var mailer: Mailer = this.getMailMan();
    let locale = user.locale || ctx.getLocale();
    let mailOptions = {
      to: email,
      locale: locale,
      template: "EMAIL_RECOVERY",
      replacements: { ...this.parameters.email, infos, to: email, context: ctx }
    };
    return mailer.send(mailOptions);
  }

  /**
   * Send an email to validate the user email by sending a unique link to
   * his email
   *
   * @param ctx
   * @param email
   * @returns
   */
  async sendValidationEmail(ctx: Context, email: string) {
    var mailer: Mailer = this.getMailMan();
    let replacements = {
      ...this.parameters.email,
      context: ctx,
      url: ctx
        .getHttpContext()
        .getAbsoluteUrl(
          `${this.parameters.url}/email/callback?email=${email}&token=${this.generateEmailValidationToken(
            ctx.getCurrentUserId(),
            email
          )}`
        )
    };
    let userId = ctx.getCurrentUserId();
    if (userId && userId.length > 0) {
      replacements.url += "&user=" + userId;
    }
    let mailOptions = {
      to: email,
      locale: ctx.getLocale(),
      template: "EMAIL_REGISTER",
      replacements: replacements
    };
    return mailer.send(mailOptions);
  }

  /**
   * Create a SHA256 of the info
   *
   * @param info to hash
   */
  hashInfo(info: string): string {
    var hash = crypto.createHash("sha256");
    return hash.update(info).digest("hex");
  }

  /**
   * Check the password match the stored hash
   * @param hash generate prior by hashPassword
   * @param password as entered by the user
   */
  checkPassword(hash, pass): boolean {
    return bcrypt.compareSync(pass, hash);
  }

  /**
   * Hash the password according to good practices
   *
   * @param pass to hash
   */
  hashPassword(pass: string): string {
    return bcrypt.hashSync(pass, this.parameters.salt || 10);
  }

  /**
   * Logout user
   */
  async logout(ctx: Context) {
    await this.emitSync("Authentication.Logout", <EventAuthenticationLogout>{
      context: ctx
    });
    ctx.getSession().destroy();
  }

  /**
   * Login a user
   *
   * @param ctx
   * @param user
   * @param ident
   * @returns
   */
  async login(ctx: Context, user: User | string, ident: Ident) {
    var event: EventAuthenticationLogin = {
      context: ctx,
      userId: "",
      identId: ident.uuid,
      ident
    };

    if (typeof user == "object") {
      event.userId = user.uuid;
      event.user = user;
    } else {
      event.userId = user;
    }
    event.context = ctx;

    ctx.getSession().login(event.userId, event.identId);
    return this.emitSync("Authentication.Login", event);
  }

  getMailMan(): Mailer {
    return this.getService<Mailer>(this.parameters.email.mailer ? this.parameters.email.mailer : "Mailer");
  }

  /**
   * Handle a user login request
   *
   * @param ctx
   * @param ident
   */
  protected async handleLogin(ctx: Context, ident: Ident) {
    let updates: any = {};
    let user: User = await this._usersStore.get(ident.getUser());
    // Check password
    if (this.checkPassword(user.getPassword(), ctx.getRequestBody().password)) {
      if (ident._failedLogin > 0) {
        ident._failedLogin = 0;
      }
      updates._lastUsed = new Date();
      updates._failedLogin = 0;
      updates.uuid = ident.uuid;

      await this._identsStore.patch(updates);
      await this.login(ctx, ident.getUser(), ident);
      ctx.write(user);
    } else {
      await this.emitSync("Authentication.LoginFailed", <EventAuthenticationLoginFailed>{
        user,
        context: ctx
      });
      ident._failedLogin ??= 0;
      updates._failedLogin = ident._failedLogin + 1;
      updates._lastFailedLogin = new Date();
      updates.uuid = ident.uuid;
      // Swalow exeception issue to double check !
      await this._identsStore.patch(updates);
      // Allows to auto redirect user to a oauth if needed
      if (!ctx.isEnded()) {
        throw 403;
      }
    }
  }

  /**
   * Handle the POST /auth/email
   *
   * @param ctx
   * @returns
   */
  async _handleEmail(ctx: Context) {
    // If called while logged in reject
    if (ctx.getCurrentUserId() !== undefined) {
      throw 410;
    }

    let body = ctx.getRequestBody();

    if (body.login === undefined) {
      throw 400;
    }
    var mailConfig = this.parameters.email;
    var uuid = body.login.toLowerCase() + "_email";
    let ident: Ident = await this._identsStore.get(uuid);
    if (ident !== undefined && ident.getUser() !== undefined) {
      // Register on an known user
      if (!body.register) {
        await this.handleLogin(ctx, ident);
        return;
      }
      // If register on a validate email
      if (ident._validation !== undefined) {
        throw 409;
      }
    }

    // TODO Handle add of email on authenticated user
    var email = body.login.toLowerCase();
    // Read the form
    if (body.register) {
      var validation = undefined;
      // Need to check email before creation
      if (!mailConfig.postValidation) {
        if (body.token == this.generateEmailValidationToken(ctx.getCurrentUserId(), email)) {
          validation = new Date();
        } else {
          ctx.write({});
          // token is undefined send an email
          return this.sendValidationEmail(ctx, email);
        }
      }
      if (!body.password) {
        throw 400;
      }
      // Store with a _
      body.__password = this.hashPassword(body.password);
      await this._verifyPassword(body.password);
      // Remove useless attributes
      delete body.password;
      delete body.register;
      delete body.token;
      let user = await this.registerUser(ctx, {}, uuid, body);
      await this.emitSync("Authentication.PasswordCreate", <EventAuthenticationPasswordUpdate>{
        user,
        password: body.__password,
        context: ctx
      });
      user = await this._usersStore.save(user);
      var newIdent: any = this._identsStore.initModel({
        uuid: uuid,
        _type: "email",
        email: email
      });
      newIdent.setUser(user.uuid);
      if (validation) {
        newIdent._validation = validation;
      } else if (!mailConfig.skipEmailValidation) {
        newIdent._lastValidationEmail = Date.now();
      }
      ident = await newIdent.save();
      await this.login(ctx, user, ident);
      ctx.write(user);
      if (!validation && !mailConfig.skipEmailValidation) {
        await this.sendValidationEmail(ctx, email);
      }
      return;
    }
    throw 404;
  }

  generateEmailValidationToken(user: string, email: string) {
    return this.hashInfo(email + "_" + this._webda.getSecret() + user);
  }
}

export { Authentication };
