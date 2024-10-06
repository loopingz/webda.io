import { Context } from "../contexts/icontext";
import { CoreModel, type CoreModelEvents } from "./coremodel";

/**
 * First basic model for User
 * @class
 * @WebdaModel
 */
export class User<E extends CoreModelEvents = CoreModelEvents> extends CoreModel<E> {
  /**
   * Password of the user if defined
   */
  __password?: string;
  /**
   * Display name for this user
   * @optional
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
   * Return user email if known or guessable
   * @returns
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
   */
  toPublicEntry(): any {
    const res = {
      displayName: this.displayName,
      uuid: this.getUuid(),
      avatar: this._avatar,
      email: this.getEmail()
    };
    return res;
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
  getIdents(): Readonly<{ _type: string; uuid: string; email?: string }[]> {
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

  async canAct(ctx: Context, _action: string): Promise<string | boolean> {
    if (!ctx.getCurrentUserId() || ctx.getCurrentUserId() !== this.getUuid()) {
      return "You can't act on this user";
    }
    return true;
  }

  /**
   * Add a login/logout event
   * @returns
   */
  static getClientEvents(): string[] {
    return [...CoreModel.getClientEvents(), "login", "logout"];
  }

  /**
   * Only current user can see its own events
   * @param _event
   * @param context
   * @param model
   * @returns
   */
  static authorizeClientEvent(_event: string, context: Context, model?: CoreModel): boolean {
    if (model && model.getUuid() === context.getCurrentUserId()) {
      return true;
    }
    return false;
  }
}
