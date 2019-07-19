"use strict";
const Webda = require("../../lib/index");

class DebugMailer extends Webda.Service {
  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  getModda() {

  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer
