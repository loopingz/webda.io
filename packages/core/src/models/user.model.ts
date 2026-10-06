import { IOperationContext } from "../contexts/icontext.js";
import { Password } from "./password.model.js";
import { type ModelClass, type ModelEvents, type Settable, UuidModel, WEBDA_EVENTS } from "@webda/models";

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
    const mapped = User.mapV3(data);
    Object.assign(this, mapped);
    // Raw password data (v3 mapping or plain JSON) must become a Password behavior
    if (mapped?.password && !(mapped.password instanceof Password)) {
      (this as any).__hydrateBehaviors?.({ password: mapped.password });
    }
  }

  /**
   * Password credential
   */
  password: Password;

  /**
   * Map v3 records (`__password` string) onto the Password behavior shape
   * @param data - raw data
   * @returns the mapped data
   */
  private static mapV3(data: any): any {
    if (data && typeof data.__password === "string") {
      data = { ...data, password: data.password ?? { __hash: data.__password } };
      delete data.__password;
      delete data._lastPasswordRecovery;
    }
    return data;
  }

  /**
   * Map v3 records onto the Password behavior before hydration
   * @param data - raw data
   * @param instance - instance to populate
   * @returns the populated instance
   */
  static deserialize<T extends ModelClass, K extends object = InstanceType<T>>(this: T, data: any, instance?: K): K {
    return super.deserialize.call(this, User.mapV3(data), instance) as K;
  }
  /**
   * Display name for this user
   * @optional
   * @Frontend
   */
  displayName: string;
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
