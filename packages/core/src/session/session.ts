import { NotEnumerable } from "@webda/tsc-esm";

/**
 * MFA progress of a session
 */
export type MfaState = "none" | "pending" | "verified";

/** Verification of one MFA operation on one owner, with its original timestamp. */
export interface MfaVerification {
  method: string;
  verifiedAt: number;
  owner: string;
}

/**
 * Options for {@link Session.login}
 */
export interface LoginOptions {
  provider?: string;
  amr?: string[];
  mfa?: MfaState;
  mfaVerifications?: Record<string, MfaVerification>;
}

/**
 * Workload identity of an application session, see {@link Session.loginApplication}
 */
export interface ApplicationIdentity {
  /**
   * Application principal name, IAM sees it as `app:<principal>`
   */
  principal: string;
  /**
   * Issuer (`iss`) of the token that authenticated the application
   */
  issuer: string;
  /**
   * Subject (`sub`) of the token
   */
  subject: string;
  /**
   * Extra groups of the application, IAM sees them as `app-group:<group>`
   */
  groups?: string[];
  /**
   * Verified claims of the token
   */
  claims?: Record<string, unknown>;
}

/**
 * Session
 */
export class Session {
  @NotEnumerable
  protected changed: boolean = false;
  /**
   * Session uuid
   */
  uuid: string;
  /**
   * User id
   */
  userId?: string;
  /**
   * Ident used
   */
  identUsed: string;

  /**
   * User current roles
   */
  roles: string[];

  /**
   * Authentication provider used
   */
  provider?: string;

  /**
   * Authentication methods used
   */
  amr?: string[];

  /** Authentication methods verified only for this request */
  @NotEnumerable
  transientAmr?: string[];

  /**
   * MFA state of the session
   */
  mfa?: MfaState;
  mfaVerifications?: Record<string, MfaVerification>;

  /**
   * Refresh token family identifier
   */
  refreshFamily?: string;

  /**
   * When the session was authenticated (ms timestamp, stamped by the Authentication service): a session older than
   * the last password change of its user is loaded as anonymous
   */
  authAt?: number;

  /**
   * Operation globs the bearer token is restricted to (OAuth scope); undefined means unrestricted. Never set on
   * cookie sessions.
   */
  scopes?: string[];

  /**
   * OAuth client the bearer token was issued to
   */
  clientId?: string;

  /**
   * Application (workload) identity when authenticated by OIDC: mutually exclusive with userId
   *
   * An application session has no current user, so ownership checks never mistake an application for a user
   */
  application?: ApplicationIdentity;

  /**
   * Session is stateless (not persisted in cookies)
   */
  @NotEnumerable
  stateless?: boolean;

  /**
   * Login
   * @param userId - the user identifier
   * @param identUsed - the identity used
   * @param options - login options including provider, amr, and mfa state
   */
  login(userId: string, identUsed: string, options: LoginOptions = {}) {
    delete this.application;
    this.userId = userId;
    this.identUsed = identUsed;
    this.provider = options.provider;
    this.amr = options.amr ?? [];
    delete this.transientAmr;
    this.mfa = options.mfa ?? "none";
    this.mfaVerifications = options.mfaVerifications ?? {};
  }
  /**
   * Login an application (workload identity): the session becomes stateless and has no user
   * @param application - the application identity
   * @param options - authentication methods, `["oidc"]` by default
   * @param options.amr - authentication methods used
   */
  loginApplication(application: ApplicationIdentity, options: { amr?: string[] } = {}) {
    this.logout();
    this.stateless = true;
    this.application = application;
    this.provider = application.issuer;
    this.amr = options.amr ?? ["oidc"];
  }

  /**
   * If session is authenticated as an application
   * @returns true if the condition is met
   */
  isApplication(): boolean {
    return this.application !== undefined && this.userId === undefined;
  }

  /**
   * Logout
   */
  logout() {
    delete this.application;
    delete this.userId;
    delete this.identUsed;
    delete this.roles;
    delete this.provider;
    delete this.amr;
    delete this.transientAmr;
    delete this.mfa;
    delete this.mfaVerifications;
    delete this.refreshFamily;
    delete this.authAt;
    delete this.scopes;
    delete this.clientId;
  }

  /**
   * If session is authenticated
   * @returns true if the condition is met
   */
  isLogged(): boolean {
    return this.userId !== undefined && this.mfa !== "pending";
  }

  /**
   * If session is pending MFA verification
   * @returns true if the condition is met
   */
  isPending(): boolean {
    return this.userId !== undefined && this.mfa === "pending";
  }

  /**
   * Session is dirty and requires save
   * @returns true if the condition is met
   */
  isDirty(): boolean {
    return this.changed;
  }

  /**
   * Add a method proved only for the current request.
   * @param method - authentication method
   */
  addTransientAmr(method: string): void {
    if (this.amr?.includes(method)) return;
    this.amr = [...(this.amr ?? []), method];
    this.transientAmr = [...(this.transientAmr ?? []), method];
  }

  /** @returns authentication methods safe to persist in a cookie or token */
  getPersistentAmr(): string[] {
    return (this.amr ?? []).filter(method => !this.transientAmr?.includes(method));
  }

  /**
   * Get the proxy to be able to track modification
   * @returns this for chaining
   */
  getProxy(): this {
    const proxyHandler = {
      set: (obj: this, property: string, value: any) => {
        this.changed = true;
        obj[property] = value;
        return true;
      },
      get: (obj: this, property: string) => {
        if (typeof obj[property] === "object") {
          return new Proxy(obj[property], proxyHandler);
        }
        return obj[property];
      }
    };
    return new Proxy(this, proxyHandler);
  }
}

/**
 * Unknown session that allows all keys
 */
export class UnknownSession extends Session {
  /**
   * Allow any type of fields
   */
  [key: string]: any;
}
