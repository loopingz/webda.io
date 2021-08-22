"use strict";
import { Context, CoreModel, User } from "../index";

/**
 * Object that contains ACL to define its own permissions
 */
class AclModel extends CoreModel {
  __acls: Map<string, string> = new Map<string, string>();

  getAcls() {
    return this.__acls;
  }

  setAcls(acls: Map<string, string>) {
    this.__acls = acls;
  }

  async _httpGetAcls(ctx: Context) {
    ctx.write(this.__acls);
  }

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
