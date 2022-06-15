import { Service } from "@webda/core";

export class AWSEventsHandler extends Service {
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
  }
}
AWSEventsHandler.lastEvents = [];
