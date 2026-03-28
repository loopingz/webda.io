var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import bcrypt from "bcryptjs";
import { Counter } from "../metrics/metrics.js";
import * as WebdaError from "../errors/errors.js";
import { Inject, Service } from "../services/service.js";
import { Route } from "../rest/irest.js";
import { runAsSystem } from "../contexts/execution.js";
import { ServiceParameters } from "./serviceparameters.js";
import { useModelRepository, useDynamicService } from "../core/hooks.js";
export class AuthenticationParameters extends ServiceParameters {
    load(params = {}) {
        var _a, _b;
        super.load(params);
        this.identModel ?? (this.identModel = "Webda/Ident");
        this.userModel ?? (this.userModel = "Webda/User");
        this.url ?? (this.url = "/auth");
        this.password ?? (this.password = {
            regexp: ".{8,}"
        });
        if (this.email) {
            (_a = this.email).delay ?? (_a.delay = 3600000 * 4);
            (_b = this.email).failedLoginBeforeDelay ?? (_b.failedLoginBeforeDelay = 3);
        }
        return this;
    }
}
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
let Authentication = (() => {
    var _a;
    let _classSuper = Service;
    let _instanceExtraInitializers = [];
    let _cryptoService_decorators;
    let _cryptoService_initializers = [];
    let _cryptoService_extraInitializers = [];
    let __sendEmailValidation_decorators;
    let __getMe_decorators;
    let __listAuthentications_decorators;
    let __handleEmailCallback_decorators;
    return _a = class Authentication extends _classSuper {
            constructor() {
                super(...arguments);
                /**
                 * Ident model to use
                 */
                this.identModel = __runInitializers(this, _instanceExtraInitializers);
                /**
                 * Used for hmac
                 */
                this.cryptoService = __runInitializers(this, _cryptoService_initializers, void 0);
                /**
                 * Password verification system
                 */
                this._passwordVerifier = __runInitializers(this, _cryptoService_extraInitializers);
                /**
                 *
                 */
                this.providers = new Set();
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
            computeParameters() {
                super.computeParameters();
                this.identModel = useModelRepository(this.parameters.identModel);
                this.userModel = useModelRepository(this.parameters.userModel);
                if (this.parameters.password.verifier) {
                    this._passwordVerifier = useDynamicService(this.parameters.password.verifier);
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
            initMetrics() {
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
            addProvider(name) {
                this.providers.add(name);
            }
            /**
             * Ensure email is enabled for all emails routes
             * @override
             */
            getUrl(url, methods) {
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
            async _sendEmailValidation(ctx) {
                const identKey = ctx.parameters.email + "_email";
                const ident = await this.identModel.ref(identKey).get();
                ident._lastUsed?.getDate();
                if (!ident) {
                    await this.identModel.ref(`${ctx.parameters.email}_email`).create({
                        _lastValidationEmail: Date.now(),
                        _type: "email"
                    });
                }
                else {
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
            async _getMe(ctx) {
                const user = await ctx.getCurrentUser();
                if (user === undefined) {
                    throw new WebdaError.NotFound("No user found");
                }
                await this.emit("Authentication.GetMe", {
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
            async _listAuthentications(ctx) {
                if (ctx.getHttpContext().getMethod() === "DELETE") {
                    await this.logout(ctx);
                    this.metrics.logout.inc();
                    ctx.write("GoodBye");
                    return;
                }
                ctx.write(Array.from(this.providers));
            }
            async onIdentLogin(ctx, provider, identId, profile, tokens = undefined) {
                // Auto postifx with provider name
                const postfix = `_${provider}`;
                if (!identId.endsWith(postfix)) {
                    identId += postfix;
                }
                let ident = await this.identModel.ref(identId).get();
                // Ident is known
                if (ident) {
                    await this.login(ctx, ident.getUser().toString(), ident, provider);
                    await runAsSystem(() => ident.patch({
                        _lastUsed: new Date().toString(),
                        __tokens: tokens
                    }));
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
                    }
                    else {
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
                        });
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
                    });
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
            async registerUser(ctx, data, identId, user) {
                user ?? (user = await this.userModel.create({
                    email: data.email,
                    locale: ctx.getLocale()
                }, false));
                user.email = data.email;
                user.locale = ctx.getLocale();
                this.metrics.registration.inc();
                await this.emit("Authentication.Register", {
                    user: user,
                    data: data,
                    context: ctx,
                    identId
                });
                return user;
            }
            async getPasswordRecoveryInfos(uuid, interval = this.parameters.email.delay) {
                const expire = Date.now() + interval;
                let user;
                if (typeof uuid === "string") {
                    user = await this.userModel.fromUID(uuid).get();
                }
                else {
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
            async _passwordRecoveryEmail(ctx) {
                const email = ctx.parameter("email");
                const ident = await this.identModel.ref(email + "_email").get();
                if (!ident) {
                    throw new WebdaError.NotFound("Email not found");
                }
                const user = await this.userModel.ref(ident.getUser().toString()).get();
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
            async _verifyPassword(password, user) {
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
            async _passwordRecovery(ctx) {
                const body = await ctx.getRequestBody();
                const user = await this.userModel.ref(body.login.toLowerCase()).get();
                if (!user) {
                    throw new WebdaError.Forbidden("User not found");
                }
                if (!(await this.cryptoService.hmacVerify(body.login.toLowerCase() + body.expire + user.getPassword(), body.token))) {
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
                await this.emit("Authentication.PasswordUpdate", {
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
            async _handleEmailCallback(ctx) {
                if (!(await this.cryptoService.hmacVerify(`${ctx.parameter("email")}_${ctx.parameter("user")}`, ctx.parameter("token")))) {
                    ctx.writeHead(302, {
                        Location: this.parameters.failureRedirect + "?reason=badToken"
                    });
                    return;
                }
                if (ctx.parameter("user") !== ctx.getCurrentUserId() &&
                    ctx.getCurrentUserId() !== "" &&
                    ctx.getCurrentUserId() !== undefined) {
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
                        ident = await this.identModel.create({
                            uuid
                        }, false);
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
            async sendRecoveryEmail(ctx, user, email) {
                const infos = await this.getPasswordRecoveryInfos(user);
                const mailer = this.getMailMan();
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
            async sendValidationEmail(ctx, email) {
                const mailer = this.getMailMan();
                const replacements = {
                    ...this.parameters.email,
                    context: ctx,
                    url: ctx
                        .getHttpContext()
                        .getAbsoluteUrl(`${this.parameters.url}/email/callback?email=${email}&token=${await this.generateEmailValidationToken(ctx.getCurrentUserId(), email)}`)
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
            checkPassword(hash = "", pass = "") {
                return bcrypt.compareSync(pass, hash);
            }
            /**
             * Hash the password according to good practices
             *
             * @param pass to hash
             */
            hashPassword(pass) {
                return bcrypt.hashSync(pass, this.parameters.salt || 10);
            }
            /**
             * Logout user
             */
            async logout(ctx) {
                await this.emit("Authentication.Logout", {
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
            async login(ctx, user, ident, provider) {
                const event = {
                    context: ctx,
                    userId: "",
                    identId: ident.uuid,
                    ident
                };
                if (typeof user == "object") {
                    event.userId = user.getPrimaryKey().toString();
                    event.user = user;
                }
                else {
                    event.userId = user;
                }
                event.context = ctx;
                ctx.getSession().login(event.userId, event.identId);
                this.metrics.login.inc({ provider });
                return this.emit("Authentication.Login", event);
            }
            /**
             * Get the mailer service
             * @returns
             */
            getMailMan() {
                return useDynamicService(this.parameters.email.mailer ? this.parameters.email.mailer : "Mailer");
            }
            /**
             * Handle a user login request
             *
             * @param ctx
             * @param ident
             */
            async handleLogin(ctx, ident) {
                const updates = {};
                const user = await this.userModel.ref(ident.getUser().toString()).get();
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
                }
                else {
                    this.metrics.loginFailed.inc();
                    await this.emit("Authentication.LoginFailed", {
                        user,
                        context: ctx
                    });
                    ident._failedLogin ?? (ident._failedLogin = 0);
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
            async _handleEmail(ctx) {
                // If called while logged in reject
                if (ctx.getCurrentUserId() !== undefined) {
                    throw new WebdaError.Gone("Already logged in");
                }
                const body = await ctx.getRequestBody();
                const mailConfig = this.parameters.email;
                const uuid = body.login.toLowerCase() + "_email";
                let ident = await this.identModel.ref(uuid).get();
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
                        }
                        else {
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
                    const user = await runAsSystem(async () => this.registerUser(ctx, {}, uuid, await this.userModel.create({
                        ...body,
                        __password
                    }, false)));
                    await this.emit("Authentication.PasswordCreate", {
                        user,
                        password: __password,
                        context: ctx
                    });
                    await user.save();
                    const newIdent = await runAsSystem(async () => await this.identModel.create({
                        uuid: uuid,
                        _type: "email",
                        email: email
                    }));
                    newIdent.setUser(user.getPrimaryKey().toString());
                    if (validation) {
                        newIdent._validation = validation;
                    }
                    else if (!mailConfig.skipEmailValidation) {
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
            async generateEmailValidationToken(user, email) {
                return this.cryptoService.hmac(email + "_" + user);
            }
            /**
             * Create a new User with the link ident
             * @param ident
             */
            async createUserWithIdent(provider, identId, profile = {}) {
                if (await this.identModel.ref(`${identId}_${provider}`).exists()) {
                    throw new Error("Ident is already known");
                }
                // Pretend we logged in with the ident
                await this.onIdentLogin(undefined, provider, identId, profile);
            }
        },
        (() => {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _cryptoService_decorators = [Inject("CryptoService")];
            __sendEmailValidation_decorators = [Route("./email/{email}/validate", ["GET"], {
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
                })];
            __getMe_decorators = [Route("./me", ["GET"], {
                    get: {
                        description: "Retrieve the current user from the session",
                        summary: "Get current user",
                        operationId: "getCurrentUser"
                    }
                })];
            __listAuthentications_decorators = [Route(".", ["GET", "DELETE"], {
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
                })];
            __handleEmailCallback_decorators = [Route("./email/callback{?email,token,user?}", ["GET"], {
                    hidden: true
                })];
            __esDecorate(_a, null, __sendEmailValidation_decorators, { kind: "method", name: "_sendEmailValidation", static: false, private: false, access: { has: obj => "_sendEmailValidation" in obj, get: obj => obj._sendEmailValidation }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, __getMe_decorators, { kind: "method", name: "_getMe", static: false, private: false, access: { has: obj => "_getMe" in obj, get: obj => obj._getMe }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, __listAuthentications_decorators, { kind: "method", name: "_listAuthentications", static: false, private: false, access: { has: obj => "_listAuthentications" in obj, get: obj => obj._listAuthentications }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(_a, null, __handleEmailCallback_decorators, { kind: "method", name: "_handleEmailCallback", static: false, private: false, access: { has: obj => "_handleEmailCallback" in obj, get: obj => obj._handleEmailCallback }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(null, null, _cryptoService_decorators, { kind: "field", name: "cryptoService", static: false, private: false, access: { has: obj => "cryptoService" in obj, get: obj => obj.cryptoService, set: (obj, value) => { obj.cryptoService = value; } }, metadata: _metadata }, _cryptoService_initializers, _cryptoService_extraInitializers);
            if (_metadata) Object.defineProperty(_a, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        })(),
        _a;
})();
export { Authentication };
//# sourceMappingURL=authentication.js.map