"use strict";
const Webda = require("../../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");
const CoreModel = Webda.CoreModel;

/**
 * @class
 */
class Task extends CoreModel {

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
