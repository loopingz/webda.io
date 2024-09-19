import { OperationContext } from "../utils/context";
import { CoreModel } from "./coremodel";
import { Ident } from "./ident";

/**
 * First basic model for User
 * @class
 * @WebdaModel
 */
export class User extends CoreModel {
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

  getGroups(): string[] {
    return [];
  }

  getRoles(): string[] {
    return [];
  }

  getDisplayName(): string {
    return this.displayName;
  }

  lastPasswordRecoveryBefore(timestamp: number): boolean {
    return this._lastPasswordRecovery < timestamp;
  }

  getIdents(): Readonly<Pick<Ident, "_type" | "uuid" | "email">[]> {
    return [];
  }

  getPassword() {
    return this.__password;
  }

  setPassword(password: string) {
    this.__password = password;
  }

  async canAct(ctx: OperationContext<any, any>, _action: string): Promise<string | boolean> {
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
  static authorizeClientEvent(_event: string, context: OperationContext<any, any>, model?: CoreModel): boolean {
    if (model && model.getUuid() === context.getCurrentUserId()) {
      return true;
    }
    return false;
  }
}
