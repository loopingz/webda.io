import { IOperationContext } from "../contexts/icontext.js";
import { LoadParameters, ModelEvents, SelfJSONed, UuidModel, WEBDA_EVENTS } from "@webda/models";
import { ServiceName } from "../services/authentication.js";

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
  constructor(data?: LoadParameters<User>) {
    super(data);
    this.load((data || {}) as LoadParameters<this>);
  }

  load(data: Partial<LoadParameters<this>>): this {
    super.load(data);
    this.displayName = data.displayName;
    this._lastPasswordRecovery = data._lastPasswordRecovery || 0;
    this._avatar = data._avatar;
    this.locale = data.locale;
    this.email = data.email;
    return this;
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
   * TODO REMOVE
   */
  service?: ServiceName;

  /**
   * Return user email if known or guessable
   * @returns
   * @Frontend
   */
  getEmail(): string | undefined {
    this.email ??= this.getIdents().find(i => {
      return i.email;
    })?.email;
    return this.email;
  }

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
   * Return the user idents
   * @returns
   */
  getIdents(): Readonly<{ _type: string; uid: string; email?: string; uuid: string }[]> {
    return [];
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
