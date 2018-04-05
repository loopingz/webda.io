"use strict";
const Webda = require("../../dist/index.js");
const CoreModel = Webda.CoreModel;

/**
 * @class
 */
class Task extends CoreModel {

  static getActions() {

    return {
      'actionable': {
        method: 'GET'
      },
      'impossible': {
        method: 'PUT'
      }
    };
  }

  _actionable() {

  }

  _impossible() {

  }

  async canAct(ctx, action) {
    if ('actionable' === action) {
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
}

module.exports = Task
