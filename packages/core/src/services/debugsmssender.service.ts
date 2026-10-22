import { Service } from "./service.js";
import type { SmsSender } from "./ismssender.js";

/**
 * Fake SMS sender for tests and local development: messages are kept in memory and logged, nothing is sent
 * @WebdaModda
 */
export class DebugSmsSender extends Service implements SmsSender {
  /** Messages sent so far */
  sent: { to: string; message: string }[] = [];

  /**
   * Keep the message in memory and log it
   * @param to - recipient phone number
   * @param message - message body
   */
  async send(to: string, message: string): Promise<void> {
    this.log("INFO", `SMS to ${to}: ${message}`);
    this.sent.push({ to, message });
  }
}
