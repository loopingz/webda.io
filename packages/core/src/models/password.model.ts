import bcrypt from "bcryptjs";
import * as WebdaError from "../errors/errors.js";
import { Action } from "./decorator.js";
import { useDynamicService } from "../core/hooks.js";
import type { User } from "./user.model.js";

/** Rule a candidate password must satisfy */
export interface PasswordPolicy {
  /**
   * @param password - candidate password
   * @param user - user setting it, when known
   * @returns true when acceptable
   */
  validate(password: string, user?: User): Promise<boolean>;
}

const DEFAULT_POLICY: PasswordPolicy = { validate: async p => /.{8,}/.test(p) };
let currentPolicy: PasswordPolicy = DEFAULT_POLICY;

/**
 * Replace the active password policy (undefined restores the default `.{8,}`)
 * @param policy - the policy
 */
export function registerPasswordPolicy(policy: PasswordPolicy | undefined): void {
  currentPolicy = policy ?? DEFAULT_POLICY;
}

/**
 * Get the active password policy
 * @returns the policy
 */
export function usePasswordPolicy(): PasswordPolicy {
  return currentPolicy;
}

/** Raised when a password does not satisfy the active policy (400 PASSWORD_POLICY) */
export class PasswordPolicyError extends WebdaError.HttpError {
  /** @param message - error message */
  constructor(message: string = "Password does not match the policy") {
    super(message, 400);
    this.code = "PASSWORD_POLICY";
  }
}

/**
 * Non-enumerable flag set on a User whose data carried a v3 top-level `__password` mapped onto `password` at
 * hydration: its stored record still has the v3 layout until it is saved again (`webda auth migrate`)
 */
export const V3_PASSWORD_MAPPED = Symbol("v3PasswordMapped");

/**
 * Password credential of a user: bcrypt hash and change timestamp
 * @WebdaBehavior Webda/Password
 */
export class Password {
  /** bcrypt hash, never output */
  __hash?: string;
  /** Last change, ms since epoch */
  changedAt?: number;

  /**
   * Owning user (set by behavior hydration)
   * @returns the user or undefined when detached
   */
  protected getUser(): User | undefined {
    return (this as any).parent?.instance;
  }

  /**
   * @returns true when a password is set
   */
  hasPassword(): boolean {
    return typeof this.__hash === "string" && this.__hash.length > 0;
  }

  /**
   * Compare a candidate with the stored hash
   * @param plain - candidate password
   * @returns true when it matches
   */
  async verify(plain: string): Promise<boolean> {
    if (!this.hasPassword() || typeof plain !== "string") {
      return false;
    }
    try {
      return await bcrypt.compare(plain, this.__hash);
    } catch {
      // Malformed stored hash
      return false;
    }
  }

  /**
   * Validate against the policy and store a new hash (does not save the user)
   * @param plain - new password
   */
  async set(plain: string): Promise<void> {
    if (typeof plain !== "string" || !(await usePasswordPolicy().validate(plain, this.getUser()))) {
      throw new PasswordPolicyError();
    }
    this.__hash = await bcrypt.hash(plain, 10);
    this.changedAt = Date.now();
  }

  /**
   * Store an existing hash (migration)
   * @param hash - bcrypt hash
   * @param changedAt - change timestamp
   */
  setHash(hash: string, changedAt: number = Date.now()): void {
    this.__hash = hash;
    this.changedAt = changedAt;
  }

  /**
   * Change the password of the owning user
   * @param current - current password
   * @param next - new password
   */
  @Action({ rest: { method: "PUT" } })
  async change(current: string, next: string): Promise<void> {
    if (!(await this.verify(current))) {
      throw new WebdaError.Forbidden("Invalid password");
    }
    await this.set(next);
    const user = this.getUser();
    await user?.save();
    await (useDynamicService("TokenService") as any)?.revokeUser?.(user?.getUUID());
  }
}
