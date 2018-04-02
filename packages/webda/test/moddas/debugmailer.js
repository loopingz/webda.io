"use strict";
const Webda = require("../../" + (process.env["WEBDA_TEST_TARGET"] ? process.env["WEBDA_TEST_TARGET"] : "src") + "/index.js");

class DebugMailer extends Webda.Service {
  init() {
    this.sent = [];
  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer
