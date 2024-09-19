import { Ident } from "../index";
import { ModelsMapped } from "./relations";
import { User } from "./user";

/**
 * Simple user offers groups and roles management
 *
 * Groups and roles are defined just as string, no
 * models
 */
export class SimpleUser extends User {
  /**
   * Groups for a user
   */
  _groups: string[] = [];
  /**
   * Roles of the user
   */
  _roles: string[] = [];
  /**
   * Normal ident
   */
  _idents: ModelsMapped<Ident, "_user", "_type" | "uuid" | "email"> = [];
  //_idents: any[];
  /**
   * Return idents
   * @returns
   */
  getIdents() {
    return this._idents;
  }

  /**
   * Add a group for the user
   * @param group
   * @returns
   */
  addGroup(group: string) {
    if (this.inGroup(group)) {
      return;
    }
    this._groups.push(group);
  }

  /**
   *
   * @param group
   * @returns
   */
  inGroup(group: string): boolean {
    if (group === "all" || group === this.getUuid()) {
      return true;
    }
    return this._groups.includes(group);
  }

  removeGroup(group: string) {
    const ind = this._groups.indexOf(group);
    if (ind < 0) {
      return;
    }
    this._groups.splice(ind, 1);
  }

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
    const ind = this._roles.indexOf(role);
    if (ind < 0) {
      return;
    }
    this._roles.splice(ind, 1);
  }
}
