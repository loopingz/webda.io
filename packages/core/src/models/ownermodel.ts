import { CoreModel, Context } from "../";

export default class OwnerModel extends CoreModel {
  /**
   * Default owner of the object
   */
  _user: string;
  /**
   * Define if the object is publicly readable
   * @default false
   */
  public?: boolean;
  /**
   * UUID of the object
   */
  uuid: string;

  /**
   * Return false if can't create
   */
  async canCreate(ctx: Context): Promise<this> {
    const userId = ctx.getSession().getUserId();
    if (!userId) {
      throw 403;
    }
    this.setOwner(userId);

    return this;
  }

  /**
   * Set object owner
   * @param uuid
   */
  setOwner(uuid: string): void {
    this._user = uuid;
  }

  /**
   * Return the owner of the object
   *
   * Only the owner can do update to the object
   * @returns
   */
  getOwner(): string {
    return this._user;
  }

  async canAct(
    ctx: Context,
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
  ): Promise<this> {
    if (action === "create") {
      return this.canCreate(ctx);
    } else if (
      action === "update" ||
      action === "attach_binary" ||
      action === "detach_binary" ||
      action === "update_binary_metadata"
    ) {
      return this.canUpdate(ctx);
    } else if (action === "get" || action === "get_binary") {
      return this.canGet(ctx);
    } else if (action === "delete") {
      return this.canDelete(ctx);
    }
    throw 403;
  }

  /**
   * Return false if can't update
   */
  async canUpdate(ctx: Context): Promise<this> {
    // Allow to modify itself by default
    if ((!this.getOwner() || ctx.getCurrentUserId() !== this.getOwner()) && ctx.getCurrentUserId() !== this.uuid) {
      throw 403;
    }
    return this;
  }

  /**
   * Return false if can't get
   */
  async canGet(ctx: Context): Promise<this> {
    if (this.public) {
      return this;
    }
    return this.canUpdate(ctx);
  }

  /**
   * Return false if can't delete
   */
  async canDelete(ctx: Context): Promise<this> {
    return this.canUpdate(ctx);
  }
}

export { OwnerModel };
