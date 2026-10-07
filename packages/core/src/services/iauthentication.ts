import type { EventWithContext } from "../events/events.js";
import type { Ident } from "../models/ident.model.js";
import type { User } from "../models/user.model.js";
import type { Service } from "./service.js";
import type { IssuedTokens } from "./token.service.js";

/**
 * Describe an authentication provider exposed by an authentication service
 */
export interface ProviderInfo {
  /**
   * Provider name
   */
  name: string;
  /**
   * Provider type
   */
  type: "password" | "oauth" | "passwordless";
  /**
   * URL to start the authentication flow (oauth, passwordless)
   */
  startUrl?: string;
}

/**
 * Identity resolved by a provider, before being linked to a user
 */
export interface ResolvedIdentity {
  /**
   * Provider name
   */
  provider: string;
  /**
   * Unique identifier of the identity within the provider
   */
  providerUid: string;
  /**
   * Email if known
   */
  email?: string;
  /**
   * Whether the provider verified the email
   */
  emailVerified: boolean;
  /**
   * Provider profile
   */
  profile?: any;
  /**
   * Provider tokens
   */
  tokens?: any;
  /**
   * Authentication methods references
   */
  amr: string[];
  /**
   * User already resolved if any
   */
  user?: User;
}

/**
 * Result of an authentication completion
 */
export type AuthResult = ({ status: "ok"; user: any } & IssuedTokens) | { status: "mfa_required"; methods: string[] };

/**
 * Authentication service interface
 */
export interface IAuthenticationService extends Service {
  /**
   * Complete the authentication of a resolved identity within the current context
   * @param identity resolved by a provider
   */
  complete(identity: ResolvedIdentity): Promise<AuthResult>;
  /**
   * Logout the current session
   */
  logout(): Promise<void>;
  /**
   * List the providers available
   */
  getProviders(): ProviderInfo[];
}

/**
 * Emitted when the /me route is called
 */
export interface EventAuthenticationGetMe<T extends User = User> extends EventWithContext {
  /**
   * Current user
   */
  user: T;
}

/**
 * Emitted when new user registered
 */
export interface EventAuthenticationRegister<T extends User = User> extends EventAuthenticationGetMe<T> {
  /**
   * Registration data
   */
  data: any;
  /**
   * Ident identifier
   */
  identId: string;
  /**
   * Identity used to register
   */
  identity?: ResolvedIdentity;
}

/**
 * Emitted when user logout
 */
export interface EventAuthenticationLogout extends EventWithContext {}

/**
 * Sent when a user update his password
 */
export interface EventAuthenticationPasswordUpdate<T extends User = User> extends EventAuthenticationGetMe<T> {
  /**
   * New password
   */
  password: string;
}

/**
 * Emitted when user login
 */
export interface EventAuthenticationLogin<T extends User = User> extends EventWithContext {
  /**
   * User identifier
   */
  userId: string;
  /**
   * User if loaded
   */
  user?: T;
  /**
   * Ident identifier
   */
  identId: string;
  /**
   * Ident used
   */
  ident: any;
  /**
   * Provider used
   */
  provider: string;
  /**
   * Identity used to login
   */
  identity?: ResolvedIdentity;
}

/**
 * Emitted when a user failed to authenticate
 */
export interface EventAuthenticationLoginFailed<T extends User = User> extends EventAuthenticationGetMe<T> {}

/**
 * Emitted when an ident is linked to a user
 */
export interface EventAuthenticationLinked<T extends User = User> extends EventWithContext {
  /**
   * User
   */
  user: T;
  /**
   * Ident linked
   */
  ident: Ident;
}

/**
 * Emitted when an ident is unlinked from a user
 */
export interface EventAuthenticationUnlinked<T extends User = User> extends EventWithContext {
  /**
   * User
   */
  user: T;
  /**
   * Ident unlinked
   */
  ident: Ident;
}

/**
 * Authentication events map
 */
export type AuthenticationEvents = {
  "Authentication.GetMe": EventAuthenticationGetMe;
  "Authentication.Register": EventAuthenticationRegister;
  "Authentication.PasswordUpdate": EventAuthenticationPasswordUpdate;
  "Authentication.PasswordCreate": EventAuthenticationPasswordUpdate;
  "Authentication.Logout": EventAuthenticationLogout;
  "Authentication.Login": EventAuthenticationLogin;
  "Authentication.LoginFailed": EventAuthenticationLoginFailed;
  "Authentication.Linked": EventAuthenticationLinked;
  "Authentication.Unlinked": EventAuthenticationUnlinked;
};
