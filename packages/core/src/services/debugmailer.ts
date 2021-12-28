import { ModdaDefinition } from "../core";
import { MailerService } from "./mailer";
import { Service } from "./service";

/**
 * Fake Service to help debug mail expedition
 */
export default class DebugMailer extends Service implements MailerService {
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
  async send(options, callback = undefined): Promise<void> {
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
   * Check if the email template exists
   *
   * @param name
   * @returns
   */
  hasTemplate(name: string): boolean {
    // Load template
    return true;
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
  async async(): Promise<void> {
    // Empty on purpose
  }

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
