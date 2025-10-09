import { ServiceParameters } from "./serviceparameters.js";
import { AbstractMailer } from "./mailer.js";

/**
 * Fake Service to help debug mail expedition
 * @WebdaModda
 */
export class DebugMailer extends AbstractMailer {
  sent: any[] = [];

  static createConfiguration(params: any): any {
    return new ServiceParameters().load(params);
  }
  static filterParameters(params: any): any {
    return params;
  }
  /**
   * Fakely send a message saving it to memory to test later on
   *
   * @param options
   * @param callback
   */
  async send(options, _callback = undefined): Promise<void> {
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
  async hasNotification(_name: string): Promise<boolean> {
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
