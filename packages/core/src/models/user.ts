import { OperationContext } from "../utils/context";
import { CoreModel } from "./coremodel";
import { Ident } from "./ident";
import { ModelsMapped } from "./relations";

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
   * Roles of the user
   */
  _roles: string[] = [];
  /**
   * Groups for a user
   */
  _groups: string[] = [];
  /**
   * Idents used by the user
   */
  _idents: ModelsMapped<Ident, "_type" | "uuid" | "email"> = [];
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
    if (this.email === undefined) {
      (this._idents || []).some(i => {
        if (i.email) {
          this.email = i.email;
        }
      });
    }
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
    return this._groups;
  }

  getRoles(): string[] {
    return this._roles;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getIdents(): ModelsMapped<Ident, "_type" | "uuid" | "email"> {
    return this._idents;
  }

  addRole(role: string) {
    if (this.hasRole(role)) {
      return;
    }
    this._roles.push(role);
  }

  hasRole(role: string) {
    return this._roles.indexOf(role) >= 0;
  }

  removeRole(role: string) {
    let ind = this._roles.indexOf(role);
    if (ind < 0) {
      return;
    }
    this._roles.splice(ind, 1);
  }

  addGroup(group: string) {
    if (this.inGroup(group)) {
      return;
    }
    this._groups.push(group);
  }

  inGroup(group: string) {
    if (group === "all" || group === this.getUuid()) {
      return true;
    }
    return this._groups.indexOf(group) >= 0;
  }

  removeGroup(group: string) {
    let ind = this._groups.indexOf(group);
    if (ind < 0) {
      return;
    }
    this._groups.splice(ind, 1);
  }

  lastPasswordRecoveryBefore(timestamp: number): boolean {
    return this._lastPasswordRecovery < timestamp;
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
}
