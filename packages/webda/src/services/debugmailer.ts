import { Service } from "../index";

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

  /** @ignore */
  static getModda() {
    return {
      uuid: "Webda/DebugMailer",
      label: "DebugMailer",
      description:
        "Implements a mail that store in memory and output in log but nothing else",
      webcomponents: [],
      logo: "images/icons/email.png",
      configuration: {
        default: {
          config: {}
        },
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
