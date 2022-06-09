import { Service } from "@webda/core";

export class DebugMailer extends Service {
  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  send(options, callback) {
    this.sent.push(options);
  }
}

