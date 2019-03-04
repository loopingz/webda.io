"use strict";
import { Context } from "../index";

const mixin = (Sup, rolesMap, permissive: boolean = false) =>
  class extends Sup {
    async getRoles(ctx: Context) {
      if (!ctx.getCurrentUserId()) {
        throw 403;
      }
      // If roles are cached in session
      if (ctx.session.roles) {
        return ctx.session.roles;
      }
      let user = await ctx.getCurrentUser();
      // Cache roles in session
      ctx.session.roles = user.getRoles();
      return ctx.session.roles;
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
