"use strict";
import { Ident } from "./ident";
import { OwnerModel } from "./ownermodel";

/**
 * First basic model for User
 * @class
 */
class User extends OwnerModel {
  /**
   * Password of the user if defined
   */
  private __password?: string;
  /**
   * Last time the password was recovered
   */
  private _lastPasswordRecovery?: number = 0;
  /**
   * Roles of the user
   */
  private _roles: string[] = [];
  /**
   * Groups for a user
   */
  private _groups: string[] = [];
  /**
   * Idents used by the user
   */
  private _idents: Ident[] = [];

  getGroups(): string[] {
    return this._groups;
  }

  getRoles(): string[] {
    return this._roles;
  }

  getIdents(): Ident[] {
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
    if (group === "all" || group === this.uuid) {
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
}

export { User };
