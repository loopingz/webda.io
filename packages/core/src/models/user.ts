import { IOperationContext } from "../contexts/icontext.js";
import { ModelEvents, Settable, UuidModel, WEBDA_EVENTS } from "@webda/models";

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
   * @returns
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
   * @returns
   */
  getEmail(): string | undefined {
    return this.email;
  }

  /**
   * Get user groups
   * @returns
   */
  getGroups(): string[] {
    return [];
  }

  /**
   * Get roles
   * @returns
   */
  getRoles(): string[] {
    return [];
  }

  /**
   * Get display name
   * @returns
   */
  getDisplayName(): string {
    return this.displayName;
  }

  /**
   *
   * @param timestamp
   * @returns
   */
  lastPasswordRecoveryBefore(timestamp: number): boolean {
    return this._lastPasswordRecovery < timestamp;
  }

  /**
   * Get the password
   * @returns
   */
  getPassword() {
    return this.__password;
  }

  setPassword(password: string) {
    this.__password = password;
  }

  async canAct(ctx: IOperationContext, action: string): Promise<string | boolean> {
    if (!ctx.getCurrentUserId() || ctx.getCurrentUserId() !== this.getUUID()) {
      return "You can't act on this user";
    }
    return true;
  }

  toString() {
    return `User[${this.getUUID()}]`;
  }
}
