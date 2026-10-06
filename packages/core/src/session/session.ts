import { NotEnumerable } from "@webda/tsc-esm";

/**
 * MFA progress of a session
 */
export type MfaState = "none" | "pending" | "verified";

/**
 * Options for {@link Session.login}
 */
export interface LoginOptions {
  provider?: string;
  amr?: string[];
  mfa?: MfaState;
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

  /**
   * MFA state of the session
   */
  mfa?: MfaState;

  /**
   * Refresh token family identifier
   */
  refreshFamily?: string;

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
    this.userId = userId;
    this.identUsed = identUsed;
    this.provider = options.provider;
    this.amr = options.amr ?? [];
    this.mfa = options.mfa ?? "none";
  }
  /**
   * Logout
   */
  logout() {
    delete this.userId;
    delete this.identUsed;
    delete this.roles;
    delete this.provider;
    delete this.amr;
    delete this.mfa;
    delete this.refreshFamily;
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
