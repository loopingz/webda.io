"use strict";
const Webda = require("../../lib/index");

class DebugMailer extends Webda.Service {
  init() {
    this.sent = [];
  }

  getModda() {

  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer
