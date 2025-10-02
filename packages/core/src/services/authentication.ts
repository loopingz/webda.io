import bcrypt from "bcryptjs";
import { Counter } from "../metrics/metrics";
import * as WebdaError from "../errors/errors";
import { Ident } from "../models/ident";
import type { User } from "../models/user";
import { Inject, Service } from "../services/service";
import { Route } from "../rest/irest";
import type { OperationContext } from "../contexts/operationcontext";
import { HttpContext, type HttpMethodType } from "../contexts/httpcontext";
import type { CryptoService } from "./cryptoservice";
import type { Mailer } from "./mailer";
import { runAsSystem } from "../contexts/execution";
import { EventWithContext } from "../events/events";
import { ServiceParameters } from "../interfaces";
import { useCore, useService, useModelRepository } from "../core/hooks";
import { WebContext } from "../contexts/webcontext";
import { Repository } from "@webda/models";

/**
 * Emitted when the /me route is called
 */
export interface EventAuthenticationGetMe<T extends User = User> extends EventWithContext {
  user: T;
}

/**
 * Emitted when new user registered
 */
export interface EventAuthenticationRegister<T extends User = User> extends EventAuthenticationGetMe<T> {
  data: any;
  identId: string;
}

/**
 * Emitted when user logout
 */
export interface EventAuthenticationLogout extends EventWithContext {}

/**
 * Sent when a user update his password
 */
export interface EventAuthenticationPasswordUpdate<T extends User = User> extends EventAuthenticationGetMe<T> {
  password: string;
}

/**
 * Emitted when user login
 */
export interface EventAuthenticationLogin<T extends User = User> extends EventWithContext {
  userId: string;
  user?: T;
  identId: string;
  ident: Ident;
}

/**
 * Export when a user failed to authenticate with his password
 */
export interface EventAuthenticationLoginFailed<T extends User = User> extends EventAuthenticationGetMe<T> {}

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
export interface PasswordRecoveryInfos {
  /**
   * Links are short lived
   */
  expire: number;
  /**
   * Generated token
   */
  token: string;
  /**
   * Login to reset password fors
   */
  login: string;
}

interface PasswordRecoveryBody extends PasswordRecoveryInfos {
  /**
   * Password to set
   */
  password: string;
}

/**
 * Login info
 *
 * If register = true, you can add many other information
 *
 * @SchemaAdditionalProperties
 */
interface LoginBody {
  login: string;
  register?: boolean;
  token?: string;
  email?: string;
  password?: string;
}

export class AuthenticationParameters extends ServiceParameters {
  /**
   * Idents store for authentication identifiers
   *
   * @default "Webda/Ident"
   */
  identModel?: string;
  /**
   * User store for authentication users
   *
   * @default "Webda/User"
   */
  userModel?: string;
  /**
   * @default "/auth"
   */
  declare url?: string;
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

  default() {
    super.default();
    this.identModel ??= "Webda/Ident";
    this.userModel ??= "Webda/User";
    this.url ??= "/auth";
    this.password ??= {
      regexp: ".{8,}"
    };
    if (this.email) {
      this.email.delay ??= 3600000 * 4;
      this.email.failedLoginBeforeDelay ??= 3;
    }
    return this;
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
 * @WebdaModda
 */

class Authentication<
  T extends AuthenticationParameters = AuthenticationParameters,
  E extends AuthenticationEvents = AuthenticationEvents
> extends Service<T, E> {
  /**
   * Ident model to use
   */
  protected identModel: Repository<typeof Ident>;
  /**
   * User model to use
   */
  protected userModel: Repository<typeof User>;
  /**
   * Used for hmac
   */
  @Inject("CryptoService")
  cryptoService: CryptoService;
  /**
   * Password verification system
   */
  _passwordVerifier: PasswordVerifier;
  /**
   *
   */
  providers: Set<string> = new Set<string>();

  metrics: {
    login: Counter;
    logout: Counter;
    loginFailed?: Counter;
    recovery?: Counter;
    recovered?: Counter;
    registration?: Counter;
  };

  /**
   * Load the parameters for a service
   */
  loadParameters(params: any): T {
    return <T>new AuthenticationParameters().load(params);
  }

  /**
   * Get user model
   * @returns
   */
  getUserModel() {
    return this.userModel;
  }

  /**
   * Get ident model
   * @returns
   */
  getIdentModel() {
    return this.identModel;
  }

  /**
   * @ignore
   * Setup the default routes
   */
  computeParameters(): void {
    super.computeParameters();

    this.identModel = <any>useModelRepository<Ident>(this.parameters.identModel);
    this.userModel = useModelRepository<User>(this.parameters.userModel);

    if (this.parameters.password.verifier) {
      this._passwordVerifier = useService<PasswordVerifier>(this.parameters.password.verifier);
    }

    if (this.parameters.email && this.getMailMan() === undefined) {
      throw Error("email authentication requires a Mailer service");
    }
    // Add email provider
    if (this.parameters.email) {
      this.addProvider("email");
      this.addRoute("./email/{email}/recover", ["GET"], this._passwordRecoveryEmail, {
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
      this.addRoute("./email/passwordRecovery", ["POST"], this._passwordRecovery, {
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
      this.addRoute("./email", ["POST"], this._handleEmail, {
        post: {
          description: "Authenticate with an email and password",
          summary: "Authenticate with email",
          operationId: `authWithEmail`
        }
      });
    }
  }

  /**
   * @override
   */
  initMetrics(): void {
    super.initMetrics();
    this.metrics.login = this.getMetric(Counter, {
      name: "auth_login",
      help: "Counter number of login per provider",
      labelNames: ["provider"]
    });
    this.metrics.logout = this.getMetric(Counter, {
      name: "auth_logout",
      help: "Counter number of logout"
    });
    this.metrics.registration = this.getMetric(Counter, {
      name: "auth_registration",
      help: "Counter number of registration per provider",
      labelNames: ["provider"]
    });
    if (this.parameters.email) {
      this.metrics.loginFailed = this.getMetric(Counter, {
        name: "auth_login_failed",
        help: "Counter number of login failed with password"
      });
      this.metrics.recovery = this.getMetric(Counter, {
        name: "auth_login_recovery",
        help: "Counter number of password lost process initiated"
      });
      this.metrics.recovered = this.getMetric(Counter, {
        name: "auth_login_recovered",
        help: "Counter number of password lost process successful"
      });
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
   * Ensure email is enabled for all emails routes
   * @override
   */
  getUrl(url: string, methods: HttpMethodType[]) {
    if (url.startsWith("./emails") && !this.parameters.email) {
      return undefined;
    }
    return super.getUrl(url, methods);
  }

  /**
   * Send or resend an email to validate the email address
   *
   * @param ctx
   * @throws 409 if ident is linked to someone else
   * @throws 412 if the email is already validated
   * @throws 429 if a validation email has been sent recently
   */
  @Route("./email/{email}/validate", ["GET"], {
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
  })
  async _sendEmailValidation(ctx) {
    const identKey = ctx.parameters.email + "_email";
    const ident = await this.identModel.ref(identKey).get();
    ident._lastUsed?.getDate();
    if (!ident) {
      await this.identModel.ref(`${ctx.parameters.email}_email`).create({
        _lastValidationEmail: Date.now(),
        _type: "email"
      } as any);
    } else {
      // If the ident is linked to someone else - might want to remove it
      if (ident.getUser().getPrimaryKey().toString() !== ctx.getCurrentUserId()) {
        throw new WebdaError.Conflict("Ident is linked to someone else");
      }
      // If the email is already validated
      if (ident._validation) {
        throw new WebdaError.PreconditionFailed("Email already validated");
      }
      //
      if (ident._lastValidationEmail >= Date.now() - this.parameters.email.delay) {
        throw new WebdaError.TooManyRequests("Email sent recently");
      }

      await this.identModel.ref(ident.getUUID()).setAttribute("_lastValidationEmail", Date.now());
      //ident.ref(ident.getUUID()).setAttribute("_lastValidationEmail", Date.now());
      //await this.identModel.ref(ident.getUUID()).setAttribute("lastValidationEmail", Date.now());
    }
    await this.sendValidationEmail(ctx, ctx.parameters.email);
  }

  /**
   * Return current user
   * @param ctx
   */
  @Route("./me", ["GET"], {
    get: {
      description: "Retrieve the current user from the session",
      summary: "Get current user",
      operationId: "getCurrentUser"
    }
  })
  async _getMe(ctx: OperationContext) {
    const user = await ctx.getCurrentUser<User>();
    if (user === undefined) {
      throw new WebdaError.NotFound("No user found");
    }
    await this.emit("Authentication.GetMe", <EventAuthenticationGetMe>{
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
  @Route(".", ["GET", "DELETE"], {
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
  })
  async _listAuthentications(ctx: WebContext) {
    if (ctx.getHttpContext().getMethod() === "DELETE") {
      await this.logout(ctx);
      this.metrics.logout.inc();
      ctx.write("GoodBye");
      return;
    }
    ctx.write(Array.from(this.providers));
  }

  async onIdentLogin(ctx: WebContext, provider: string, identId: string, profile: any, tokens: any = undefined) {
    // Auto postifx with provider name
    const postfix = `_${provider}`;
    if (!identId.endsWith(postfix)) {
      identId += postfix;
    }

    let ident: Ident = await this.identModel.ref(identId).get();
    // Ident is known
    if (ident) {
      await this.login(ctx, ident.getUser().toString(), ident, provider);
      await runAsSystem(() =>
        ident.patch({
          _lastUsed: new Date().toString(),
          __tokens: tokens
        })
      );
      // Redirect to?
      return;
    }
    let user;
    if (profile.email) {
      ident = await this.identModel.ref(`${profile.email}_email`).get();
    }
    await runAsSystem(async () => {
      // If already login
      if (ctx.getCurrentUserId()) {
        user = await ctx.getCurrentUser();
      } else {
        // If an email in profile try to find the ident
        if (ident) {
          user = await this.userModel.ref(ident.getUser().toString()).get();
        }

        if (!user) {
          // If no user, register a new user automatically
          user = await this.registerUser(ctx, profile, identId);
          await user.save();
        }
      }
      if (profile.email && !ident) {
        // Save additional email
        await this.identModel.create({
          uuid: `${profile.email}_email`,
          provider: "email",
          _user: user.getUuid()
        } as any);
      }
      // Work directly on ident argument
      ident = await this.identModel.create({
        uuid: identId,
        __profile: profile,
        __tokens: tokens,
        provider,
        _lastUsed: new Date(),
        _user: user.uuid,
        _type: provider
      } as any);
      await this.login(ctx, user, ident, provider);
    });
  }

  /**
   * Create a new User with the link ident
   * @param ident
   *
  async createUserWithIdent(provider: string, identId: string, profile: any = {}) {
    if (await this.identModel.ref(`${identId}_${provider}`).exists()) {
      throw new Error("Ident is already known");
    }
    const ctx = await this._webda.newWebContext(new HttpContext("fake", "GET", "/"));
    // Pretend we logged in with the ident
    await this.onIdentLogin(ctx, provider, identId, profile);
  }
    */

  async registerUser(ctx: WebContext, data: any, identId: string, user?: User): Promise<User> {
    user ??= await this.userModel.create(
      {
        email: data.email,
        locale: ctx.getLocale()
      } as any,
      false
    );
    user.email = data.email;
    user.locale = ctx.getLocale();
    this.metrics.registration.inc();
    await this.emit("Authentication.Register", <EventAuthenticationRegister>{
      user: user,
      data: data,
      context: ctx,
      identId
    });
    return user;
  }

  async getPasswordRecoveryInfos(
    uuid: string | User,
    interval = this.parameters.email.delay
  ): Promise<PasswordRecoveryInfos> {
    const expire = Date.now() + interval;
    let user;
    if (typeof uuid === "string") {
      user = await this.userModel.fromUID(uuid).get();
    } else {
      user = uuid;
    }
    if (!user) {
      return undefined;
    }
    return {
      expire: expire,
      // Might want to add more alea not coming from the db to avoid exploitation of stolen db
      token: await this.cryptoService.hmac(user.uuid + expire + user.getPassword()),
      login: user.uuid
    };
  }

  /**
   * Manage password recovery
   * @param ctx
   */
  async _passwordRecoveryEmail(ctx: WebContext) {
    const email = ctx.parameter("email");
    const ident: Ident = await this.identModel.ref(email + "_email").get();
    if (!ident) {
      throw new WebdaError.NotFound("Email not found");
    }
    const user: User = await this.userModel.ref(ident.getUser().toString()).get();
    // Dont allow to do too many request
    if (!user.lastPasswordRecoveryBefore(Date.now() - this.parameters.email.delay)) {
      throw new WebdaError.TooManyRequests("Password recovery already requested recently");
    }
    await user.patch({
      _lastPasswordRecovery: Date.now()
    });
    this.metrics.recovery.inc();
    await this.sendRecoveryEmail(ctx, user, email);
  }

  async _verifyPassword(password: string, user?: User) {
    if (this._passwordVerifier) {
      if (!(await this._passwordVerifier.validate(password, user))) {
        throw new WebdaError.BadRequest("Password does not match the policy");
      }
      return;
    }
    const regexp = new RegExp(this.parameters.password.regexp);
    if (regexp.exec(password) === null) {
      throw new WebdaError.BadRequest("Password does not match the policy");
    }
  }

  async _passwordRecovery(ctx: WebContext<PasswordRecoveryBody>) {
    const body = await ctx.getRequestBody();
    const user: User = await this.userModel.ref(body.login.toLowerCase()).get();
    if (!user) {
      throw new WebdaError.Forbidden("User not found");
    }
    if (
      !(await this.cryptoService.hmacVerify(body.login.toLowerCase() + body.expire + user.getPassword(), body.token))
    ) {
      throw new WebdaError.Forbidden("Invalid token");
    }
    if (body.expire < Date.now()) {
      throw new WebdaError.Gone("Expired token");
    }
    await this._verifyPassword(body.password, user);
    const password = this.hashPassword(body.password);
    await user.patch({
      __password: password
    });
    this.metrics.recovered.inc();
    await this.emit("Authentication.PasswordUpdate", <EventAuthenticationPasswordUpdate>{
      user,
      password,
      context: ctx
    });
  }

  /**
   * Callback to validate an email address
   * @param ctx
   * @returns
   */
  @Route("./email/callback{?email,token,user?}", ["GET"], {
    hidden: true
  })
  async _handleEmailCallback(ctx: WebContext) {
    if (
      !(await this.cryptoService.hmacVerify(
        `${ctx.parameter("email")}_${ctx.parameter("user")}`,
        ctx.parameter("token")
      ))
    ) {
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
    await runAsSystem(async () => {
      const uuid = ctx.parameter("email") + "_email";
      let ident = await this.identModel.ref(uuid).get();
      // Would mean the ident got delete in the mean time... hyper low likely hood
      if (ident === undefined) {
        ident = await this.identModel.create(
          {
            uuid
          } as any,
          false
        );
      }
      ident._type = "email";
      ident._validation = new Date();
      ident.setUser(ctx.parameter("user"));
      await ident.save();
      ctx.writeHead(302, {
        Location: this.parameters.successRedirect + "?validation=email",
        "X-Webda-Authentication": "success"
      });
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
  async sendRecoveryEmail(ctx: WebContext, user, email: string) {
    const infos = await this.getPasswordRecoveryInfos(user);
    const mailer: Mailer = this.getMailMan();
    const locale = user.locale || ctx.getLocale();
    const mailOptions = {
      to: email,
      locale: locale,
      template: "EMAIL_RECOVERY",
      replacements: {
        ...this.parameters.email,
        infos,
        to: email,
        context: ctx
      }
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
  async sendValidationEmail(ctx: WebContext, email: string) {
    const mailer: Mailer = this.getMailMan();
    const replacements = {
      ...this.parameters.email,
      context: ctx,
      url: ctx
        .getHttpContext()
        .getAbsoluteUrl(
          `${this.parameters.url}/email/callback?email=${email}&token=${await this.generateEmailValidationToken(
            ctx.getCurrentUserId(),
            email
          )}`
        )
    };
    const userId = ctx.getCurrentUserId();
    if (userId && userId.length > 0) {
      replacements.url += "&user=" + userId;
    }
    const mailOptions = {
      to: email,
      locale: ctx.getLocale(),
      template: "EMAIL_REGISTER",
      replacements: replacements
    };
    return mailer.send(mailOptions);
  }

  /**
   * Check the password match the stored hash
   * @param hash generate prior by hashPassword
   * @param password as entered by the user
   */
  checkPassword(hash: string = "", pass: string = ""): boolean {
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
  async logout(ctx: WebContext) {
    await this.emit("Authentication.Logout", <EventAuthenticationLogout>{
      context: ctx
    });
    await ctx.newSession();
  }

  /**
   * Login a user
   *
   * @param ctx
   * @param user
   * @param ident
   * @returns
   */
  async login(ctx: WebContext, user: User | string, ident: Ident, provider: string) {
    const event: EventAuthenticationLogin = {
      context: ctx,
      userId: "",
      identId: ident.uuid,
      ident
    };

    if (typeof user == "object") {
      event.userId = user.getPrimaryKey();
      event.user = user;
    } else {
      event.userId = user;
    }
    event.context = ctx;
    ctx.getSession().login(event.userId, event.identId);
    this.metrics.login.inc({ provider });
    return this.emit("Authentication.Login", event);
  }

  getMailMan(): Mailer {
    return useService<Mailer>(this.parameters.email.mailer ? this.parameters.email.mailer : "Mailer");
  }

  /**
   * Handle a user login request
   *
   * @param ctx
   * @param ident
   */
  protected async handleLogin(ctx: WebContext<LoginBody>, ident: Ident) {
    const updates: any = {};
    const user: User = await this.userModel.ref(ident.getUser().toString()).get();
    // Check password
    if (this.checkPassword(user.getPassword(), (await ctx.getRequestBody()).password)) {
      if (ident._failedLogin > 0) {
        ident._failedLogin = 0;
      }
      updates._lastUsed = new Date();
      updates._failedLogin = 0;

      await this.identModel.ref(ident.uuid).patch(updates);
      await this.login(ctx, ident.getUser().toString(), ident, "email");
      ctx.write(user);
    } else {
      this.metrics.loginFailed.inc();
      await this.emit("Authentication.LoginFailed", <EventAuthenticationLoginFailed>{
        user,
        context: ctx
      });
      ident._failedLogin ??= 0;
      updates._failedLogin = ident._failedLogin + 1;
      updates._lastFailedLogin = new Date();
      // Swalow exeception issue to double check !
      await this.identModel.ref(ident.uuid).patch(updates);
      // Allows to auto redirect user to a oauth if needed
      // It can intercept the error and redirect to the oauth if
      // email match
      if (!ctx.isEnded()) {
        throw new WebdaError.Forbidden("Invalid password");
      }
    }
  }

  /**
   * Handle the POST /auth/email
   *
   * @param ctx
   * @returns
   */
  async _handleEmail(ctx: WebContext<LoginBody>) {
    // If called while logged in reject
    if (ctx.getCurrentUserId() !== undefined) {
      throw new WebdaError.Gone("Already logged in");
    }

    const body = await ctx.getRequestBody();

    const mailConfig = this.parameters.email;
    const uuid = body.login.toLowerCase() + "_email";
    let ident: Ident = await this.identModel.ref(uuid).get();
    if (ident !== undefined && ident.getUser() !== undefined) {
      // Register on an known user
      if (!body.register) {
        await this.handleLogin(ctx, ident);
        return;
      }
      // If register on a validate email
      if (ident._validation !== undefined) {
        throw new WebdaError.Conflict("Email already registered");
      }
    }

    // TODO Handle add of email on authenticated user
    const email = body.login.toLowerCase();
    // Read the form
    if (body.register) {
      let validation = undefined;
      // Need to check email before creation
      if (!mailConfig.postValidation) {
        if (body.token && (await this.cryptoService.hmacVerify(`${email}_${ctx.getCurrentUserId()}`, body.token))) {
          validation = new Date();
        } else {
          ctx.write({});
          // token is undefined send an email
          return this.sendValidationEmail(ctx, email);
        }
      }
      if (!body.password) {
        throw new WebdaError.BadRequest("Password is required");
      }
      // Store with a _
      const __password = this.hashPassword(body.password);
      await this._verifyPassword(body.password);
      // Remove useless attributes
      delete body.password;
      delete body.register;
      delete body.token;
      const user = await runAsSystem(async () =>
        this.registerUser(
          ctx,
          {},
          uuid,
          await this.userModel.create(
            {
              ...body,
              __password
            } as any,
            false
          )
        )
      );
      await this.emit("Authentication.PasswordCreate", <EventAuthenticationPasswordUpdate>{
        user,
        password: __password,
        context: ctx
      });
      await user.save();
      const newIdent = await runAsSystem(
        async () =>
          await this.identModel.create({
            uuid: uuid,
            _type: "email",
            email: email
          } as any)
      );
      newIdent.setUser(user.getPrimaryKey());
      if (validation) {
        newIdent._validation = validation;
      } else if (!mailConfig.skipEmailValidation) {
        newIdent._lastValidationEmail = Date.now();
      }
      ident = await newIdent.save();
      await this.login(ctx, user, ident, "email");
      ctx.write(user);
      if (!validation && !mailConfig.skipEmailValidation) {
        await this.sendValidationEmail(ctx, email);
      }
      return;
    }
    throw new WebdaError.NotFound("");
  }

  async generateEmailValidationToken(user: string, email: string): Promise<string> {
    return this.cryptoService.hmac(email + "_" + user);
  }

  /**
   * Create a new User with the link ident
   * @param ident
   */
  async createUserWithIdent(provider: string, identId: string, profile: any = {}) {
    if (await this.identModel.ref(`${identId}_${provider}`).exists()) {
      throw new Error("Ident is already known");
    }
    // Pretend we logged in with the ident
    await this.onIdentLogin(undefined, provider, identId, profile);
  }
}

export { Authentication };
