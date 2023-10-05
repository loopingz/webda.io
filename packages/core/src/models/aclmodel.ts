import { ModelAction, OperationContext, Store, User, WebContext, WebdaError } from "../index";
import { Action, CoreModel } from "./coremodel";

export type Acl = { [key: string]: string };

/**
 * Object that contains ACL to define its own permissions
 *
 * @WebdaModel
 */
export default class AclModel extends CoreModel {
  /**
   * Object creator
   */
  _creator: string;
  /**
   * Permissions on the object
   */
  __acl: Acl = {};
  /**
   * Contains permissions
   */
  protected _permissions?: string[];

  /**
   * Ensure creator has all permissions by default
   */
  async _onSave() {
    await super._onSave();
    this._creator = this.getContext().getCurrentUserId();
    if (Object.keys(this.__acl).length === 0 && this._creator) {
      this.__acl[this._creator] = "all";
    }
  }

  /**
   * Add the permissions for current user
   */
  async _onGet() {
    const ctx = this.getContext();
    if (!ctx.isGlobal()) {
      this._permissions = await this.getPermissions(ctx);
    } else {
      this._permissions = [];
    }
  }

  /**
   * Return object ACLs
   * @returns
   */
  getAcl() {
    return this.__acl;
  }

  /**
   * Set object ACLs
   * @param acl
   */
  setAcl(acl: Acl) {
    this.__acl = acl;
  }

  /**
   * Manage the ACL REST api actions
   * @param ctx
   * @returns
   */
  @Action({ methods: ["GET", "PUT"] })
  async acl(ctx: WebContext) {
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
  async _httpGetAcls(ctx: OperationContext) {
    return {
      raw: this.__acl,
      resolved: await Promise.all(
        Object.keys(this.__acl).map(async ace => {
          return {
            permission: this.__acl[ace],
            actor: await this.getUserPublicEntry(ace)
          };
        })
      )
    };
  }

  /**
   * Get the user public entry
   *
   * Override if using a custom User without backward compatibility
   * @param ace
   * @returns
   */
  async getUserPublicEntry(ace: string) {
    return (await User.ref(ace).get())?.toPublicEntry();
  }

  /**
   *
   */
  async _httpPutAcls(ctx: OperationContext) {
    let acl = await ctx.getInput();
    // This looks like a bad request
    if (acl.raw) {
      throw new WebdaError.BadRequest("ACL should have raw field");
    }
    this.__acl = acl;
    await this.save();
  }

  // Should cache the user role in the session
  getGroups(_ctx: OperationContext, user: User) {
    if (!user) {
      return [];
    }
    let groups = user.getGroups();
    if (!groups) {
      groups = [];
    }
    groups = groups.slice(0);
    groups.push(user.getUuid());
    return groups;
  }

  /**
   * Get Permissions for one object
   * @param ctx
   * @param user
   * @returns
   */
  async getPermissions(ctx: OperationContext, user?: User): Promise<string[]> {
    if (!user) {
      user = await ctx.getCurrentUser();
    }
    let permissions = new Set<string>();
    let groups = this.getGroups(ctx, user);
    for (let i in this.__acl) {
      if (groups.indexOf(i) >= 0) {
        this.__acl[i].split(",").forEach(p => permissions.add(p));
      }
    }
    return [...permissions.values()];
  }

  async hasPermission(ctx: OperationContext, user: User, action: string): Promise<boolean> {
    let groups = this.getGroups(ctx, user);
    for (let i in this.__acl) {
      if (groups.indexOf(i) >= 0) {
        if (this.__acl[i] === "all" || this.__acl[i].split(",").indexOf(action) >= 0) {
          return true;
        }
      }
    }
    return false;
  }

  async canAct(ctx: OperationContext, action: string): Promise<string | boolean> {
    if (action === "create" && ctx.getCurrentUserId()) {
      return true;
    }
    if (!this.getAcl() || !ctx.getCurrentUserId()) {
      return "No ACL or user";
    }
    let user = await ctx.getCurrentUser();
    if (await this.hasPermission(ctx, user, action)) {
      return true;
    }
    return "No permission";
  }
}

export { AclModel };
