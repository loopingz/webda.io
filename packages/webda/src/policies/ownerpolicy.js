"use strict";

const OwnerPolicy = Sup => class extends Sup {
  /**
   * Return false if can't create
   */
  async canCreate(ctx) {
    this.user = ctx.session.getUserId();
    if (!this.user) {
      throw 403;
    }
    return this;
  }

  getOwner() {
    return this.user;
  }

  async canAct(ctx, action) {
    if (action === 'create') {
      return this.canCreate(ctx);
    } else if (action === 'update' || action === 'attach_binary' || action === 'detach_binary') {
      return this.canUpdate(ctx);
    } else if (action === 'get' || action === 'get_binary') {
      return this.canGet(ctx);
    } else if (action === 'delete') {
      return this.canDelete(ctx);
    }
    throw 403;
  }
  /**
   * Return false if can't update
   */
  async canUpdate(ctx) {
    // Allow to modify itself by default
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return this;
  }

  /**
   * Return false if can't get
   */
  async canGet(ctx) {
    if (this.public) {
      return this;
    }
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
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
  canDelete(ctx) {
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return this;
  }
}

module.exports = OwnerPolicy;
