import { ModdaDefinition } from "../core";
import { Service } from "./service";

/**
 * Fake Service to help debug mail expedition
 */
export default class DebugMailer extends Service {
  sent: any[] = [];

  constructor(webda, name, params) {
    super(webda, name, params);
    this.sent = [];
  }

  /**
   * Fakely send a message saving it to memory to test later on
   *
   * @param options
   * @param callback
   */
  send(options, callback = undefined) {
    this.log("DEBUG", "Send a fake email", options);
    this.sent.push(options);
  }

  /**
   * Just send a new Error exception
   */
  error() {
    throw new Error("FakeError");
  }

  /**
   * Just send a new Error exception as async
   */
  async errorAsync() {
    throw new Error("FakeError");
  }

  /**
   * Empty async method
   */
  async async(): Promise<void> {}

  /** @inheritdoc */
  static getModda(): ModdaDefinition {
    return {
      uuid: "Webda/DebugMailer",
      label: "DebugMailer",
      description: "Implements a mail that store in memory and output in log but nothing else",
      logo: "images/icons/email.png"
    };
  }
}

export { DebugMailer };
