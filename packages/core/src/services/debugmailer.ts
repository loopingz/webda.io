import { ModdaDefinition } from "../core";
import { Service } from "./service";

export default class DebugMailer extends Service {
  sent: any[] = [];

  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  send(options, callback = undefined) {
    this.log("DEBUG", "Send a fake email", options);
    this.sent.push(options);
  }

  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/DebugMailer",
      label: "DebugMailer",
      description: "Implements a mail that store in memory and output in log but nothing else",
      logo: "images/icons/email.png",
      configuration: {
        schema: {
          type: "object",
          properties: {},
          required: []
        }
      }
    };
  }
}

export { DebugMailer };
