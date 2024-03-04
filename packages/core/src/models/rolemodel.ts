import { Context, CoreModel, OperationContext, WebdaError } from "../index";
abstract class RoleModel extends CoreModel {
  abstract getRolesMap(): { [key: string]: string };

  isPermissive(): boolean {
    return false;
  }

  /**
   * Get the roles of the current user
   * @param ctx
   * @returns
   */
  async getRoles(ctx: Context) {
    if (!(ctx instanceof OperationContext)) {
      throw new WebdaError.Forbidden("No user");
    }
    // If roles are cached in session
    if (ctx.getSession().roles) {
      return ctx.getSession().roles;
    }
    let user = await ctx.getCurrentUser();
    // Cache roles in session
    ctx.getSession().roles = user?.getRoles();
    return ctx.getSession().roles;
  }

  /**
   * @override
   */
  async canAct(ctx: OperationContext, action: string): Promise<string | boolean> {
    // If this action doesn't require role
    if (!this.getRolesMap()[action]) {
      if (this.isPermissive()) {
        return true;
      }
      return "No permission for this action defined";
    }
    let roles = await this.getRoles(ctx);
    if (roles.indexOf(this.getRolesMap()[action]) >= 0) {
      return true;
    }
    return "No permission";
  }
}

export { RoleModel };
