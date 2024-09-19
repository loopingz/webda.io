import { CoreModel, OperationContext, WebdaError } from "../index";
abstract class RoleModel extends CoreModel {
  abstract getRolesMap(): { [key: string]: string };

  isPermissive(): boolean {
    return false;
  }

  async getRoles(ctx: OperationContext) {
    if (!ctx.getCurrentUserId()) {
      throw new WebdaError.Forbidden("No user");
    }
    // If roles are cached in session
    if (ctx.getSession().roles) {
      return ctx.getSession().roles;
    }
    const user = await ctx.getCurrentUser();
    // Cache roles in session
    ctx.getSession().roles = user.getRoles();
    return ctx.getSession().roles;
  }

  async canAct(ctx: OperationContext, action: string): Promise<string | boolean> {
    // If this action doesn't require role
    if (!this.getRolesMap()[action]) {
      if (this.isPermissive()) {
        return true;
      }
      return "No permission for this action defined";
    }
    const roles = await this.getRoles(ctx);
    if (roles.indexOf(this.getRolesMap()[action]) >= 0) {
      return true;
    }
    return "No permission";
  }
}

export { RoleModel };
