"use strict";
import { Context } from "../index";

const mixin = (Sup, rolesMap, permissive: boolean = false) =>
  class extends Sup {
    async getRoles(ctx: Context) {
      if (!ctx.getCurrentUserId()) {
        throw 403;
      }
      // If roles are cached in session
      if (ctx.getSession().roles) {
        return ctx.getSession().roles;
      }
      let user = await ctx.getCurrentUser();
      // Cache roles in session
      ctx.getSession().roles = user.getRoles();
      return ctx.getSession().roles;
    }

    async canAct(ctx: Context, action: string) {
      // If this action doesn't require role
      if (!rolesMap[action]) {
        if (permissive) {
          return this;
        }
        throw 403;
      }
      let roles = await this.getRoles(ctx);
      if (roles.indexOf(rolesMap[action]) >= 0) {
        return this;
      }
      throw 403;
    }
  };

export { mixin as RolePolicyMixIn };
