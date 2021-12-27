"use strict";
import { Context, CoreModel, ModelAction, User } from "../index";

export type Acl = { [key: string]: string };

/**
 * Object that contains ACL to define its own permissions
 */
export default class AclModel extends CoreModel {
  /**
   * Object creator
   */
  _creator: string;
  /**
   * Permissions on the object
   */
  __acls: Acl = {};

  /**
   * Add acls actions
   * @returns
   */
  static getActions(): { [key: string]: ModelAction } {
    return {
      ...super.getActions(),
      acls: {
        methods: ["PUT", "GET"]
      }
    };
  }

  /**
   * Ensure creator has all permissions by default
   */
  async _onSave() {
    await super._onSave();
    this._creator = this.getContext().getCurrentUserId();
    if (Object.keys(this.__acls).length === 0) {
      this.__acls[this._creator] = "all";
    }
  }

  /**
   * Return object ACLs
   * @returns
   */
  getAcls() {
    return this.__acls;
  }

  /**
   * Set object ACLs
   * @param acls
   */
  setAcls(acls: Acl) {
    this.__acls = acls;
  }

  /**
   * Manage the ACL REST api actions
   * @param ctx
   * @returns
   */
  _acls(ctx: Context) {
    if (ctx.getHttpContext().getMethod() === "PUT") {
      return this._httpPutAcls(ctx);
    } else if (ctx.getHttpContext().getMethod() === "GET") {
      return this._httpGetAcls(ctx);
    }
  }

  /**
   * GET
   * @param ctx
   */
  async _httpGetAcls(ctx: Context) {
    ctx.write(this.__acls);
  }

  /**
   *
   */
  async _httpPutAcls(ctx: Context) {
    this.__acls = ctx.getRequestBody();
    await this.save();
  }

  // Should cache the user role in the session
  getGroups(ctx: Context, user: User) {
    let groups = user.getGroups();
    if (!groups) {
      groups = [];
    }
    groups = groups.slice(0);
    groups.push(user.uuid);
    return groups;
  }

  async hasPermission(ctx: Context, user: User, action: string) {
    let groups = this.getGroups(ctx, user);
    for (let i in this.__acls) {
      if (groups.indexOf(i) >= 0) {
        if (this.__acls[i] === "all" || this.__acls[i].split(",").indexOf(action) >= 0) {
          return true;
        }
      }
    }
    return false;
  }

  async canAct(ctx: Context, action: string) {
    if (!this.getAcls() || !ctx.getCurrentUserId()) {
      throw 403;
    }
    let user = await ctx.getCurrentUser();
    if (await this.hasPermission(ctx, user, action)) {
      return this;
    }
    throw 403;
  }
}

export { AclModel };
