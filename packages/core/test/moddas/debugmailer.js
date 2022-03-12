const Webda = require("../../src/index");

class DebugMailer extends Webda.Service {
  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  send(options, callback) {
    this.sent.push(options);
  }
}

module.exports = DebugMailer;
