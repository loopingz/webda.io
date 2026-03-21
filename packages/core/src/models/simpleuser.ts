import type { Ident } from "./ident.js";
import { Helpers, ModelRelated, SelfJSONed, Settable } from "@webda/models";
import { User } from "./user.js";

/**
 * Simple user offers groups and roles management
 *
 * Groups and roles are defined just as string, no
 * models
 */
export class SimpleUser extends User {
  constructor(data?: Settable<SimpleUser>) {
    super(data);
  }
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
  _idents: ModelRelated<Ident, User, "_user">;
  /**
   * Return idents
   * @returns
   */
  getIdents() {
    return this._idents as any;
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
    if (group === "all" || group === this.uuid) {
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
