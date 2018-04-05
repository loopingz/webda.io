"use strict";
const Webda = require("../../dist/index.js");

class DebugMailer extends Webda.Service {
  init() {
    this.sent = [];
  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer
