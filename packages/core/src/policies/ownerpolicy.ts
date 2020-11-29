"use strict";
import { Context } from "../index";
class OwnerPolicy {
  _user: string;
  public: boolean;
  uuid: string;
  /**
   * Return false if can't create
   */
  async canCreate(ctx: Context): Promise<this> {
    this._user = ctx.getSession().getUserId();
    if (!this._user) {
      throw 403;
    }
    return this;
  }

  getOwner(): string {
    return this._user;
  }

  async canAct(ctx: Context, action: string): Promise<this> {
    if (action === "create") {
      return this.canCreate(ctx);
    } else if (action === "update" || action === "attach_binary" || action === "detach_binary") {
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
    if (
      (!this.getOwner() || ctx.getSession().getUserId() !== this.getOwner()) &&
      ctx.getSession().getUserId() !== this.uuid
    ) {
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

export { OwnerPolicy };
