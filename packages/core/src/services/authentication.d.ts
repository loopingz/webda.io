import { Counter } from "../metrics/metrics.js";
import { Ident } from "../models/ident.js";
import type { User } from "../models/user.js";
import { Service } from "../services/service.js";
import type { OperationContext } from "../contexts/operationcontext.js";
import { type HttpMethodType } from "../contexts/httpcontext.js";
import type { CryptoService } from "./cryptoservice.js";
import type { Mailer } from "./mailer.js";
import { EventWithContext } from "../events/events.js";
import { ServiceParameters } from "./serviceparameters.js";
import { ServiceName } from "../core/hooks.js";
import { WebContext } from "../contexts/webcontext.js";
import { ModelClass, Repository } from "@webda/models";
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
export interface EventAuthenticationLogout extends EventWithContext {
}
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
export interface EventAuthenticationLoginFailed<T extends User = User> extends EventAuthenticationGetMe<T> {
}
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
export declare class AuthenticationParameters extends ServiceParameters {
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
    url?: string;
    /**
     * Enable the email authentication
     */
    email?: {
        /**
         * Mailer service name
         */
        mailer?: ServiceName;
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
        verifier?: ServiceName;
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
    load(params?: any): this;
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
declare class Authentication<T extends AuthenticationParameters = AuthenticationParameters, E extends AuthenticationEvents = AuthenticationEvents> extends Service<T, E> {
    /**
     * Ident model to use
     */
    protected identModel: Repository<ModelClass<Ident>>;
    /**
     * User model to use
     */
    protected userModel: Repository<ModelClass<User>>;
    /**
     * Used for hmac
     */
    cryptoService: CryptoService;
    /**
     * Password verification system
     */
    _passwordVerifier: PasswordVerifier;
    /**
     *
     */
    providers: Set<string>;
    metrics: {
        login: Counter;
        logout: Counter;
        loginFailed?: Counter;
        recovery?: Counter;
        recovered?: Counter;
        registration?: Counter;
    };
    /**
     * Get user model
     * @returns
     */
    getUserModel(): Repository<ModelClass<User>>;
    /**
     * Get ident model
     * @returns
     */
    getIdentModel(): Repository<ModelClass<Ident>>;
    /**
     * @ignore
     * Setup the default routes
     */
    computeParameters(): void;
    /**
     * @override
     */
    initMetrics(): void;
    /**
     * Add a provider to the oauth scheme
     * @param name
     */
    addProvider(name: string): void;
    /**
     * Ensure email is enabled for all emails routes
     * @override
     */
    getUrl(url: string, methods: HttpMethodType[]): string;
    /**
     * Send or resend an email to validate the email address
     *
     * @param ctx
     * @throws 409 if ident is linked to someone else
     * @throws 412 if the email is already validated
     * @throws 429 if a validation email has been sent recently
     */
    _sendEmailValidation(ctx: any): Promise<void>;
    /**
     * Return current user
     * @param ctx
     */
    _getMe(ctx: OperationContext): Promise<void>;
    /**
     * Handle both list of available authentication
     * and logout with method 'DELETE'
     *
     * @param ctx
     * @returns
     */
    _listAuthentications(ctx: WebContext): Promise<void>;
    onIdentLogin(ctx: WebContext, provider: string, identId: string, profile: any, tokens?: any): Promise<void>;
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
    registerUser(ctx: WebContext, data: any, identId: string, user?: User): Promise<User>;
    getPasswordRecoveryInfos(uuid: string | User, interval?: number): Promise<PasswordRecoveryInfos>;
    /**
     * Manage password recovery
     * @param ctx
     */
    _passwordRecoveryEmail(ctx: WebContext): Promise<void>;
    _verifyPassword(password: string, user?: User): Promise<void>;
    _passwordRecovery(ctx: WebContext<PasswordRecoveryBody>): Promise<void>;
    /**
     * Callback to validate an email address
     * @param ctx
     * @returns
     */
    _handleEmailCallback(ctx: WebContext): Promise<void>;
    /**
     * Send an email to recover the user password
     *
     * @param ctx
     * @param user
     * @param email
     * @returns
     */
    sendRecoveryEmail(ctx: WebContext, user: any, email: string): Promise<any>;
    /**
     * Send an email to validate the user email by sending a unique link to
     * his email
     *
     * @param ctx
     * @param email
     * @returns
     */
    sendValidationEmail(ctx: WebContext, email: string): Promise<any>;
    /**
     * Check the password match the stored hash
     * @param hash generate prior by hashPassword
     * @param password as entered by the user
     */
    checkPassword(hash?: string, pass?: string): boolean;
    /**
     * Hash the password according to good practices
     *
     * @param pass to hash
     */
    hashPassword(pass: string): string;
    /**
     * Logout user
     */
    logout(ctx: WebContext): Promise<void>;
    /**
     * Login a user
     *
     * @param ctx
     * @param user
     * @param ident
     * @returns
     */
    login(ctx: WebContext, user: User | string, ident: Ident, provider: string): Promise<void>;
    /**
     * Get the mailer service
     * @returns
     */
    getMailMan(): Mailer;
    /**
     * Handle a user login request
     *
     * @param ctx
     * @param ident
     */
    protected handleLogin(ctx: WebContext<LoginBody>, ident: Ident): Promise<void>;
    /**
     * Handle the POST /auth/email
     *
     * @param ctx
     * @returns
     */
    _handleEmail(ctx: WebContext<LoginBody>): Promise<any>;
    generateEmailValidationToken(user: string, email: string): Promise<string>;
    /**
     * Create a new User with the link ident
     * @param ident
     */
    createUserWithIdent(provider: string, identId: string, profile?: any): Promise<void>;
}
export { Authentication };
//# sourceMappingURL=authentication.d.ts.map