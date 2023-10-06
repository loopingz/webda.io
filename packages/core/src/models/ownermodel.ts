import { OperationContext } from "../utils/context";
import { UuidModel } from "./coremodel";
import { ModelLink } from "./relations";
import { User } from "./user";

/**
 * @WebdaModel
 */
export class OwnerModel extends UuidModel {
  /**
   * Default owner of the object
   */
  _user: ModelLink<User>;
  /**
   * Define if the object is publicly readable
   * @default false
   */
  public?: boolean;
  /**
   * UUID of the object
   * @readonly
   */
  uuid: string;

  /**
   * Set object owner
   * @param uuid
   */
  setOwner(uuid: string): void {
    this._user ??= new ModelLink<User>(uuid, <any>User, this);
    this._user.set(uuid);
  }

  /**
   * @override
   */
  validate(ctx: OperationContext<any, any>, updates: any, ignoreRequired?: boolean): Promise<boolean> {
    updates._user ??= this._user?.toString();
    updates.uuid ??= this.generateUid();
    return super.validate(ctx, updates, ignoreRequired);
  }

  /**
   * Return the owner of the object
   *
   * Only the owner can do update to the object
   * @returns
   */
  getOwner(): ModelLink<User> {
    return this._user;
  }

  async canAct(
    ctx: OperationContext,
    action:
      | "create"
      | "update"
      | "get"
      | "delete"
      | "get_binary"
      | "detach_binary"
      | "attach_binary"
      | "update_binary_metadata"
      | string
  ): Promise<string | boolean> {
    // Object is public
    if (this.public && (action === "get" || action === "get_binary")) {
      return true;
    } else if (!ctx.getCurrentUserId()) {
      return "You need to be logged in to access this object";
    } else if (!this.getOwner() && action !== "create") {
      return "Object does not have an owner";
    }
    if (action === "create") {
      this.setOwner(ctx.getCurrentUserId());
    }
    return ctx.getCurrentUserId() === this.getOwner()?.toString();
  }

  /**
   * Return a query to filter OwnerModel
   *
   * @param context
   * @returns
   */
  static getPermissionQuery(context?: OperationContext): null | { partial: boolean; query: string } {
    if (!context) {
      return null;
    }
    return {
      query: `_user = '${context.getCurrentUserId()}' OR public = TRUE`,
      partial: false
    };
  }
}
