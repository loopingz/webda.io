import { Action, Model } from "./model";
import type { Context, IWebContext, IOperationContext } from "../contexts/icontext";
import { User } from "./user";
import * as WebdaError from "../errors/errors";
import { runAsSystem, useContext, useCurrentUser, useCurrentUserId } from "../contexts/execution";
import { OperationContext } from "../contexts/operationcontext";
import { WebContext } from "../contexts/webcontext";
import { OmitByTypeRecursive } from "@webda/tsc-esm";

export type Acl = { [key: string]: string };

/**
 * Object that contains ACL to define its own permissions
 *
 * @WebdaModel
 */
export class AclModel extends Model {
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

  protected test: Date;

  /**
   * Ensure creator has all permissions by default
   */
  async _onSave() {
    await super._onSave();
    this._creator = useCurrentUserId();
    if (Object.keys(this.__acl).length === 0 && this._creator) {
      this.__acl[this._creator] = "all";
    }
  }

  /**
   * Add the permissions for current user
   */
  async _onGet() {
    this._permissions = await this.getPermissions();
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
  @Action({
    methods: ["GET", "PUT"],
    openapi: {
      get: {
        summary: "Get ACLs",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    raw: {
                      type: "object"
                    },
                    resolved: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          permission: {
                            type: "string"
                          },
                          actor: {
                            type: "object"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      put: {
        summary: "Update ACLs",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  raw: {
                    type: "object"
                  }
                }
              }
            }
          }
        }
      }
    }
  })
  async acl(ctx: OperationContext<null | Acl>) {
    const method = (ctx as WebContext).getHttpContext().getMethod();
    if (method === "PUT") {
      return this._httpPutAcls(ctx);
    } else if (method === "GET") {
      return this._httpGetAcls();
    }
  }

  /**
   * GET
   * @param ctx
   */
  async _httpGetAcls() {
    return await runAsSystem(async () => {
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
    }, [this]);
  }

  /**
   * Get the user public entry
   *
   * Override if using a custom User without backward compatibility
   * @param ace
   * @returns
   */
  async getUserPublicEntry(ace: string) {
    const user = await User.ref(ace).get();
    return user?.toPublicEntry() || { uuid: ace, displayName: "Deleted user" };
  }

  /**
   *
   */
  async _httpPutAcls(ctx: IOperationContext) {
    const acl = await ctx.getInput();
    // This looks like a bad request
    if (acl.raw) {
      throw new WebdaError.BadRequest("ACL should not have raw field");
    }
    runAsSystem(() => {
      this.__acl = acl;
    }, [this]);
    await this.save();
  }

  // Should cache the user role in the session
  getGroups(user: User) {
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
  async getPermissions(user?: User): Promise<string[]> {
    if (!user) {
      user = await useCurrentUser();
    }
    if (!user) {
      return [];
    }
    const permissions = new Set<string>();
    const groups = this.getGroups(user);
    for (const i in this.__acl) {
      if (groups.indexOf(i) >= 0) {
        this.__acl[i].split(",").forEach(p => permissions.add(p));
      }
    }
    return [...permissions.values()];
  }

  async hasPermission(user: User, action: string): Promise<boolean> {
    const groups = this.getGroups(user);
    for (const i in this.__acl) {
      if (groups.indexOf(i) >= 0) {
        if (this.__acl[i] === "all" || this.__acl[i].split(",").indexOf(action) >= 0) {
          return true;
        }
      }
    }
    return false;
  }

  async canAct(ctx: Context, action: string): Promise<string | boolean> {
    if (action === "create" && ctx.getCurrentUserId()) {
      return true;
    }
    if (!this.getAcl() || !ctx.getCurrentUserId()) {
      return "No ACL or user";
    }
    const user = await ctx.getCurrentUser();
    if (await this.hasPermission(user, action)) {
      return true;
    }
    return "No permission";
  }
}
