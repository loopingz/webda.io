import { CoreModel, OperationContext } from "@webda/core";
abstract class RoleModel extends CoreModel {
  abstract getRolesMap(): { [key: string]: string };

  isPermissive(): boolean {
    return false;
  }

  async getRoles(ctx: OperationContext) {
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

  async canAct(ctx: OperationContext, action: string) {
    // If this action doesn't require role
    if (!this.getRolesMap()[action]) {
      if (this.isPermissive()) {
        return this;
      }
      throw 403;
    }
    let roles = await this.getRoles(ctx);
    if (roles.indexOf(this.getRolesMap()[action]) >= 0) {
      return this;
    }
    throw 403;
  }
}

export { RoleModel };
