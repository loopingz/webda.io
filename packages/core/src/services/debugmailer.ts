import { AbstractMailer } from "./mailer";

/**
 * Fake Service to help debug mail expedition
 * @WebdaModda
 */
export default class DebugMailer extends AbstractMailer {
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
  async hasNotification(name: string): Promise<boolean> {
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
}

export { DebugMailer };
