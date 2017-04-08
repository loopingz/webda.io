"use strict";

const OwnerPolicy = Sup => class extends Sup {
  /**
   * Return false if can't create
   */
  canCreate(ctx) {
    this.user = ctx.session.getUserId();
    if (!this.user) {
      throw 403;
    }
    return Promise.resolve(this);
  }

  getOwner() {
    return this.user;
  }

  canAct(ctx, action) {
    if (action === 'create') {
      return this.canCreate(ctx);
    } else if (action === 'update') {
      return this.canUpdate(ctx);
    } else if (action === 'get') {
      return this.canGet(ctx);
    } else if (action === 'delete') {
      return this.canDelete(ctx);
    }
  }
  /**
   * Return false if can't update
   */
  canUpdate(ctx) {
    // Allow to modify itself by default
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return Promise.resolve(this);
  }

  /**
   * Return false if can't get
   */
  canGet(ctx) {
    if (this.public) {
      return Promise.resolve(this);
    }
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    if (!this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return Promise.resolve(this);
  }

  /**
   * Return false if can't delete
   */
  canDelete(ctx) {
    if (ctx.session.getUserId() !== this.getOwner() && ctx.session.getUserId() !== this.uuid) {
      throw 403;
    }
    return Promise.resolve(this);
  }
}

module.exports = OwnerPolicy;