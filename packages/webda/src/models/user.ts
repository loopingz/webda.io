"use strict";
import { CoreModel } from "./coremodel";

/**
 * First basic model for Ident
 * @class
 */
class User extends CoreModel {
  private __password: string;
  private _lastPasswordRecovery: number = 0;
  private _roles: string[] = [];
  private _groups: string[] = [];

  getGroups(): string[] {
    return this._groups;
  }

  getRoles(): string[] {
    return this._roles;
  }

  lastPasswordRecoveryBefore(timestamp: number): boolean {
    return this._lastPasswordRecovery < timestamp;
  }

  getPassword() {
    return this.__password;
  }
}

export { User };
