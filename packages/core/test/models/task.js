"use strict";
const Webda = require("../../lib/index.js");
const OwnerModel = Webda.OwnerModel;
const Context = Webda.Context;

/**
 * @class
 */
class Task extends OwnerModel {
  static getActions() {
    return {
      actionable: {
        method: "GET"
      },
      impossible: {
        method: "PUT"
      }
    };
  }

  _actionable() {}

  _impossible() {}

  async canAct(ctx, action) {
    if ("actionable" === action) {
      return this;
    }
    return super.canAct(ctx, action);
  }

  getSchema() {
    return require("../schemas/task.json");
  }

  _onSave() {
    this._autoListener = 1;
  }

  _onSaved() {
    this._autoListener = 2;
  }

  toJSON() {
    // Context should be available to the toJSON
    if (this.getContext() !== undefined) {
      this._gotContext = true;
    }
    return super.toJSON();
  }
}

module.exports = Task;
