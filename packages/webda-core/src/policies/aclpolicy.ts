"use strict";
import { Context, User } from "../index";

const AclPolicyMixIn = Sup =>
  class extends Sup {
    __acls: Map<string, string> = new Map<string, string>();

    getAcls() {
      return this.__acls;
    }

    setAcls(acls: Map<string, string>) {
      this.__acls = acls;
    }

    async _httpGetAcls(ctx) {
      return this.__acls;
    }

    async _httpPutAcls(ctx) {
      this.__acls = ctx.body;
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
          if (
            this.__acls[i] === "all" ||
            this.__acls[i].split(",").indexOf(action) >= 0
          ) {
            return true;
          }
        }
      }
      return false;
    }

    async canAct(ctx: Context, action: string) {
      if (!this.__acls || !ctx.getCurrentUserId()) {
        throw 403;
      }
      let user = await ctx.getCurrentUser();
      if (await this.hasPermission(ctx, user, action)) {
        return this;
      }
      throw 403;
    }
  };

export { AclPolicyMixIn };
