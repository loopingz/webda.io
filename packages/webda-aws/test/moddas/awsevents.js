"use strict";
const Webda = require("webda");
const AWSEventHandlerMixIn = require("../../lib/lambdahandler")
  .AWSEventHandlerMixIn;

class AWSEventsHandler extends AWSEventHandlerMixIn(Webda.Service) {
  getEvents() {
    return AWSEventsHandler.lastEvents;
  }

  isAWSEventHandled(event) {
    return true;
  }

  async handleAWSEvent(event) {
    await new Promise(resolve => setTimeout(100, resolve));
    AWSEventsHandler.lastEvents.push(event);
    return;
  }
}
AWSEventsHandler.lastEvents = [];

module.exports = AWSEventsHandler;
