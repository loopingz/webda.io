"use strict";
const Webda = require("../../lib/index.js");
const CoreModel = Webda.CoreModel;
const Context = Webda.Context;

/**
 * @class
 */
class Task extends CoreModel {
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

  _getSchema() {
    return "../test/schemas/task.json";
  }

  _onSave() {
    this._autoListener = 1;
  }

  _onSaved() {
    this._autoListener = 2;
  }

  toJSON() {
    // Context should be available to the toJSON
    if (global.WebdaContext) {
      this._gotContext = true;
    }
    return super.toJSON();
  }
}

module.exports = Task;
