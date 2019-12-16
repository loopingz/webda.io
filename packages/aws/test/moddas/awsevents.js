"use strict";
const Webda = require("@webda/core");

class AWSEventsHandler extends Webda.Service {
  async init() {
    await super.init();
    if (this._webda.registerAWSEventsHandler) {
      this._webda.registerAWSEventsHandler(this);
    }
  }

  getEvents() {
    return AWSEventsHandler.lastEvents;
  }

  isAWSEventHandled(event) {
    return true;
  }

  async handleAWSEvent(event) {
    await new Promise(resolve => setTimeout(resolve, 100));
    AWSEventsHandler.lastEvents.push(event);
    return;
  }
}
AWSEventsHandler.lastEvents = [];

module.exports = AWSEventsHandler;
