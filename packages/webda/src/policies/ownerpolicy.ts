"use strict";
import { Context } from "../index";
class OwnerPolicy {
  _user: any;
  public: boolean;
  uuid: string;
  /**
   * Return false if can't create
   */
  async canCreate(ctx: Context) {
    this._user = ctx.session.getUserId();
    if (!this._user) {
      throw 403;
    }
    return this;
  }

  getOwner() {
    return this._user;
  }

  async canAct(ctx: Context, action: string) {
    if (action === "create") {
      return this.canCreate(ctx);
    } else if (
      action === "update" ||
      action === "attach_binary" ||
      action === "detach_binary"
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
  async canUpdate(ctx: Context) {
    // Allow to modify itself by default
    if (
      ctx.session.getUserId() !== this.getOwner() &&
      ctx.session.getUserId() !== this.uuid
    ) {
      throw 403;
    }
    return this;
  }

  /**
   * Return false if can't get
   */
  async canGet(ctx: Context) {
    if (this.public) {
      return this;
    }
    if (
      ctx.session.getUserId() !== this.getOwner() &&
      ctx.session.getUserId() !== this.uuid
    ) {
      throw 403;
    }
    if (!this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return this;
  }

  /**
   * Return false if can't delete
   */
  async canDelete(ctx: Context) {
    return this.canUpdate(ctx);
  }
}

export { OwnerPolicy };
