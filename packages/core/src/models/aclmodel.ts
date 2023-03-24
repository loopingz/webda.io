import { ModelAction, OperationContext, Store, User, WebContext, WebdaError } from "../index";
import { CoreModel } from "./coremodel";

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
  private _permissions?: string[];

  /**
   * Add acls actions
   * @returns
   */
  static getActions(): { [key: string]: ModelAction } {
    return {
      ...super.getActions(),
      acl: {
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
    if (Object.keys(this.__acl).length === 0) {
      this.__acl[this._creator] = "all";
    }
  }

  /**
   * Add the permissions for current user
   */
  async _onGet() {
    if (this.getContext()) {
      this._permissions = await this.getPermissions(this.getContext());
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
  _acl(ctx: WebContext) {
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
    ctx.write({
      raw: this.__acl,
      resolved: await Promise.all(
        Object.keys(this.__acl).map(async ace => {
          let user = await this.getService<Store<User>>("Users").get(ace);
          return {
            permission: this.__acl[ace],
            actor: user?.toPublicEntry()
          };
        })
      )
    });
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

  async canAct(ctx: OperationContext, action: string) {
    if (action === "create" && ctx.getCurrentUserId()) {
      return this;
    }
    if (!this.getAcl() || !ctx.getCurrentUserId()) {
      throw new WebdaError.Forbidden("No ACL or user");
    }
    let user = await ctx.getCurrentUser();
    if (await this.hasPermission(ctx, user, action)) {
      return this;
    }
    throw new WebdaError.Forbidden("No permission");
  }
}

export { AclModel };
