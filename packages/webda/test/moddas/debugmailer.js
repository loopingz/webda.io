"use strict";

const Mailer = require("../../services/service");

class DebugMailer extends Mailer {
  init() {
    this.sent = [];
  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer