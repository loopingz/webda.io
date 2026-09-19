import type { Ident } from "./ident.js";
import type { Helpers, ModelRelated, Settable } from "@webda/models";
import { User } from "./user.js";

/**
 * Simple user offers groups and roles management
 *
 * Groups and roles are defined just as string, no
 * models
 */
export class SimpleUser extends User {
  /** Create a new SimpleUser
   * @param data - initial data
   */
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
   * @returns the result
   */
  getIdents() {
    return this._idents as any;
  }

  /**
   * Add a group for the user
   * @param group - the group name
   * @returns the result
   */
  addGroup(group: string) {
    if (this.inGroup(group)) {
      return;
    }
    this._groups.push(group);
  }

  /**
   *
   * @param group - the group name
   * @returns true if the condition is met
   */
  inGroup(group: string): boolean {
    if (group === "all" || group === this.uuid) {
      return true;
    }
    return this._groups.includes(group);
  }

  /**
   * Remove a group from this user
   * @param group - the group name
   */
  removeGroup(group: string) {
    const ind = this._groups.indexOf(group);
    if (ind < 0) {
      return;
    }
    this._groups.splice(ind, 1);
  }

  /**
   * Get all groups this user belongs to
   * @returns the list of results
   */
  getGroups(): string[] {
    return this._groups;
  }

  /**
   * Get all roles assigned to this user
   * @returns the list of results
   */
  getRoles(): string[] {
    return this._roles;
  }

  /**
   * Add a role to this user if not already present
   * @param role - the role
   */
  addRole(role: string) {
    if (this.hasRole(role)) {
      return;
    }
    this._roles.push(role);
  }

  /**
   * Check if this user has the given role
   * @param role - the role
   * @returns the result
   */
  hasRole(role: string) {
    return this._roles.indexOf(role) >= 0;
  }

  /**
   * Remove a role from this user
   * @param role - the role
   */
  removeRole(role: string) {
    const ind = this._roles.indexOf(role);
    if (ind < 0) {
      return;
    }
    this._roles.splice(ind, 1);
  }
}
