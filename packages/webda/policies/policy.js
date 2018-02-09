"use strict";

/**
 *
 */
const Policy = Sup => class extends Sup {
  /**
   * Return false if can't create
   */
  canAct(ctx, action) {
    return Promise.resolve(this);
  }

}

module.exports = Policy;
