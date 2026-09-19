import { IOperationContext } from "../contexts/icontext.js";
import { type ModelEvents, type Settable, UuidModel, WEBDA_EVENTS } from "@webda/models";

export type UserEvents<T> = ModelEvents<T> & {
  Login: { user: T };
  Logout: { user: T };
};
/**
 * First basic model for User
 * @class
 * @WebdaModel
 */
export class User extends UuidModel {
  [WEBDA_EVENTS]: UserEvents<this>;
  /** Create a new User
   * @param data - initial data
   */
  constructor(data?: Settable<User>) {
    super();
    Object.assign(this, data);
  }

  /**
   * Password of the user if defined
   */
  __password?: string;
  /**
   * Display name for this user
   * @optional
   * @Frontend
   */
  displayName: string;
  /**
   * Last time the password was recovered
   */
  _lastPasswordRecovery?: number = 0;

  /**
   * Define the user avatar if exists
   */
  _avatar?: string;
  /**
   * Contains the locale of the user if known
   */
  locale?: string;
  /**
   * Contain main user email if exists
   */
  email?: string;

  /**
   * Return displayable public entry
   * @returns the result
   * @Frontend
   */
  toPublicEntry(): any {
    return {
      displayName: this.displayName,
      uuid: this.getUUID(),
      avatar: this._avatar,
      email: this.getEmail()
    };
  }

  /**
   * Get email
   * @returns the result
   */
  getEmail(): string | undefined {
    return this.email;
  }

  /**
   * Get user groups
   * @returns the list of results
   */
  getGroups(): string[] {
    return [];
  }

  /**
   * Get roles
   * @returns the list of results
   */
  getRoles(): string[] {
    return [];
  }

  /**
   * Get display name
   * @returns the result string
   */
  getDisplayName(): string {
    return this.displayName;
  }

  /**
   *
   * @param timestamp - the timestamp
   * @returns true if the condition is met
   */
  lastPasswordRecoveryBefore(timestamp: number): boolean {
    return this._lastPasswordRecovery < timestamp;
  }

  /**
   * Get the password
   * @returns the result
   */
  getPassword() {
    return this.__password;
  }

  /**
   * Set the user password hash
   * @param password - the password
   */
  setPassword(password: string) {
    this.__password = password;
  }

  /**
   * Only the user themselves can act on their own object
   * @param ctx - the operation context
   * @param action - the action to check
   * @returns the result
   */
  async canAct(ctx: IOperationContext, action: string): Promise<string | boolean> {
    if (!ctx.getCurrentUserId() || ctx.getCurrentUserId() !== this.getUUID()) {
      return "You can't act on this user";
    }
    return true;
  }

  /**
   * String representation of the user
   * @returns the result
   */
  toString() {
    return `User[${this.getUUID()}]`;
  }
}
