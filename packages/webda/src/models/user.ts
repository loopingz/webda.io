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
    if (group === "all") {
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
}

export { User };
