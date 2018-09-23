"use strict";
const Webda = require("../../lib/index");

class AWSEventsHandler extends Webda.AWSEventHandlerMixIn(Webda.Service) {

  getEvents() {
    return AWSEventsHandler.lastEvents;
  }

  isAWSEventHandled(event) {
    return true;
  }

  async handleAWSEvent(event) {
    AWSEventsHandler.lastEvents.push(event);
    return;
  }
}
AWSEventsHandler.lastEvents = [];

module.exports = AWSEventsHandler;
