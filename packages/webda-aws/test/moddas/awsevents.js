"use strict";
const Webda = require("../../lib/index");
const Utils = require("../utils");

class AWSEventsHandler extends Webda.AWSEventHandlerMixIn(Webda.Service) {

  getEvents() {
    return AWSEventsHandler.lastEvents;
  }

  isAWSEventHandled(event) {
    return true;
  }

  async handleAWSEvent(event) {
    await Utils.sleep(100);
    AWSEventsHandler.lastEvents.push(event);
    return;
  }
}
AWSEventsHandler.lastEvents = [];

module.exports = AWSEventsHandler;
